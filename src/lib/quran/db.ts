import type { SQLiteDatabase } from 'expo-sqlite';

import { buildFtsQuery, growRange, pickAnchor, prepareOcrText, type VerseText } from './match';

// Bump the version whenever assets/db/quran.db is rebuilt, so devices copy the new file.
export const QURAN_DB_NAME = 'quran-v1.db';
export const QURAN_DB_ASSET = require('@/assets/db/quran.db');

const MAX_CANDIDATES = 50;
/** How far the matched range may grow on each side of the anchor verse. */
const MAX_NEIGHBOURS = 30;

export type IdentifiedRange = { fromId: number; toId: number };

/** Identifies the consecutive verses shown in OCR'd mushaf text, or null if none match. */
export async function identifyVerses(db: SQLiteDatabase, ocrText: string): Promise<IdentifiedRange | null> {
  const ocr = prepareOcrText(ocrText);
  const query = buildFtsQuery(ocr);
  if (!query) return null;

  const candidates = await db.getAllAsync<VerseText>(
    `SELECT v.id, v.text_normalized FROM verses_fts f JOIN verses v ON v.id = f.rowid
     WHERE verses_fts MATCH ? ORDER BY bm25(verses_fts) LIMIT ?`,
    query,
    MAX_CANDIDATES
  );
  const anchor = pickAnchor(candidates, ocr);
  if (!anchor) return null;

  const rows = await db.getAllAsync<VerseText>(
    'SELECT id, text_normalized FROM verses WHERE id BETWEEN ? AND ?',
    anchor.verse.id - MAX_NEIGHBOURS,
    anchor.verse.id + MAX_NEIGHBOURS
  );
  return growRange(anchor, ocr, new Map(rows.map((r) => [r.id, r])));
}

export type Verse = {
  id: number;
  chapter: number;
  verse: number;
  text_tajweed: string;
  name_simple: string;
  name_arabic: string;
};

export function getVerses(db: SQLiteDatabase, fromId: number, toId: number): Promise<Verse[]> {
  return db.getAllAsync<Verse>(
    `SELECT v.id, v.chapter, v.verse, v.text_tajweed, c.name_simple, c.name_arabic
     FROM verses v JOIN chapters c ON c.id = v.chapter
     WHERE v.id BETWEEN ? AND ? ORDER BY v.id`,
    fromId,
    toId
  );
}

/** Verses by id, for labelling stored ranges (e.g. scan history). */
export async function getVersesById(db: SQLiteDatabase, ids: number[]): Promise<Map<number, Verse>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.getAllAsync<Verse>(
    `SELECT v.id, v.chapter, v.verse, v.text_tajweed, c.name_simple, c.name_arabic
     FROM verses v JOIN chapters c ON c.id = v.chapter
     WHERE v.id IN (${unique.map(() => '?').join(', ')})`,
    unique
  );
  return new Map(rows.map((r) => [r.id, r]));
}

type VerseRef = Pick<Verse, 'id' | 'chapter' | 'verse' | 'name_simple'>;

/** "Al-Baqarah 255", "Al-Baqarah 255–257" or "Al-Baqarah 286 – Ali 'Imran 2". */
export function rangeTitle(first: VerseRef, last: VerseRef): string {
  if (first.chapter !== last.chapter) {
    return `${first.name_simple} ${first.verse} – ${last.name_simple} ${last.verse}`;
  }
  return first.id === last.id ? `${first.name_simple} ${first.verse}` : `${first.name_simple} ${first.verse}–${last.verse}`;
}
