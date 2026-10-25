import { distance } from 'fastest-levenshtein';

import { normalizeArabic, tokenize } from './normalize';

export type VerseText = { id: number; text_normalized: string };

/** Minimum similarity for the best candidate to count as an identification. */
const MIN_ANCHOR_SIMILARITY = 0.55;
/** Minimum similarity for a neighbouring verse to extend the matched range. */
const MIN_NEIGHBOUR_SIMILARITY = 0.6;
/** A verse cut off at the photo's edge must match more strictly, since less text is compared. */
const MIN_PARTIAL_SIMILARITY = 0.7;
const MIN_PARTIAL_CHARS = 8;
/** OCR may merge or split words, so neighbour windows may differ from the verse by this many tokens. */
const TOKEN_SLACK = 2;
/** Longest tokens are the most distinctive; cap the FTS query size. */
const MAX_QUERY_TOKENS = 40;

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : 1 - distance(a, b) / longest;
}

function join(tokens: string[], from: number, to: number): string {
  return tokens.slice(from, to).join(' ');
}

export type PreparedOcr = { normalized: string; tokens: string[] };

export function prepareOcrText(raw: string): PreparedOcr {
  const normalized = normalizeArabic(raw);
  return { normalized, tokens: tokenize(normalized) };
}

/** FTS5 MATCH expression that retrieves verses sharing any distinctive word with the OCR text. */
export function buildFtsQuery(ocr: PreparedOcr): string | null {
  const tokens = [...new Set(ocr.tokens)]
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_QUERY_TOKENS);
  return tokens.length === 0 ? null : tokens.map((t) => `"${t}"`).join(' OR ');
}

/** Where a verse sits in the OCR tokens: `[start, end)`, or the whole OCR text if it is inside the verse. */
export type Anchor = { verse: VerseText; similarity: number; start: number; end: number };

function locate(verse: VerseText, ocr: PreparedOcr): Anchor {
  const verseTokens = tokenize(verse.text_normalized);
  const ocrTokens = ocr.tokens;
  // Photo of part of a long verse: find the OCR text inside the verse instead.
  if (verseTokens.length > ocrTokens.length) {
    let best = 0;
    for (let i = 0; i + ocrTokens.length <= verseTokens.length; i++) {
      best = Math.max(best, similarity(ocr.normalized, join(verseTokens, i, i + ocrTokens.length)));
    }
    return { verse, similarity: best, start: 0, end: ocrTokens.length };
  }
  const target = verseTokens.join(' ');
  let best: Anchor = { verse, similarity: 0, start: 0, end: 0 };
  for (let start = 0; start + verseTokens.length <= ocrTokens.length; start++) {
    const end = start + verseTokens.length;
    const score = similarity(target, join(ocrTokens, start, end));
    if (score > best.similarity) best = { verse, similarity: score, start, end };
    if (score === 1) break;
  }
  return best;
}

/**
 * The candidate that explains the most OCR text with high similarity, or null.
 * Ranking by explained length stops a short verse contained in a longer one
 * (3:2 inside 2:255) from beating the verse actually photographed.
 */
export function pickAnchor(candidates: VerseText[], ocr: PreparedOcr): Anchor | null {
  let best: Anchor | null = null;
  let bestRank = 0;
  for (const verse of candidates) {
    const anchor = locate(verse, ocr);
    const explained = Math.min(verse.text_normalized.length, ocr.normalized.length);
    // Discount very short verses so "طه" can't be an identification on its own.
    const lengthFactor = Math.min(1, explained / Math.min(20, ocr.normalized.length));
    if (anchor.similarity * lengthFactor < MIN_ANCHOR_SIMILARITY) continue;
    const rank = anchor.similarity ** 4 * explained;
    if (rank > bestRank) {
      best = anchor;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * New OCR boundary if `verse` matches the tokens directly before `boundary`
 * (direction -1) or after it (direction 1), else null. A verse cut off at the
 * photo's edge may match on its tail/head alone; then the boundary hits the edge.
 */
function extend(verse: VerseText, ocrTokens: string[], boundary: number, direction: -1 | 1): number | null {
  const verseTokens = tokenize(verse.text_normalized);
  const target = verseTokens.join(' ');
  const room = direction === -1 ? boundary : ocrTokens.length - boundary;
  if (room === 0) return null;

  let bestScore = 0;
  let bestBoundary = boundary;
  for (let len = Math.max(1, verseTokens.length - TOKEN_SLACK); len <= verseTokens.length + TOKEN_SLACK; len++) {
    if (len > room) break;
    const [from, to] = direction === -1 ? [boundary - len, boundary] : [boundary, boundary + len];
    const score = similarity(target, join(ocrTokens, from, to));
    if (score > bestScore) {
      bestScore = score;
      bestBoundary = direction === -1 ? from : to;
    }
  }
  if (bestScore >= MIN_NEIGHBOUR_SIMILARITY) return bestBoundary;

  if (room < verseTokens.length) {
    const visible = direction === -1 ? join(ocrTokens, 0, boundary) : join(ocrTokens, boundary, ocrTokens.length);
    const cut =
      direction === -1
        ? join(verseTokens, verseTokens.length - room, verseTokens.length)
        : join(verseTokens, 0, room);
    if (visible.length >= MIN_PARTIAL_CHARS && similarity(cut, visible) >= MIN_PARTIAL_SIMILARITY) {
      return direction === -1 ? 0 : ocrTokens.length;
    }
  }
  return null;
}

/** Grows the anchor over consecutive neighbours that match the OCR text on either side of it. */
export function growRange(
  anchor: Anchor,
  ocr: PreparedOcr,
  neighbours: Map<number, VerseText>
): { fromId: number; toId: number } {
  let fromId = anchor.verse.id;
  let toId = anchor.verse.id;
  let start = anchor.start;
  let end = anchor.end;
  while (neighbours.has(fromId - 1)) {
    const next = extend(neighbours.get(fromId - 1)!, ocr.tokens, start, -1);
    if (next === null) break;
    start = next;
    fromId--;
  }
  while (neighbours.has(toId + 1)) {
    const next = extend(neighbours.get(toId + 1)!, ocr.tokens, end, 1);
    if (next === null) break;
    end = next;
    toId++;
  }
  return { fromId, toId };
}
