/**
 * Tajweed rules as marked up in the QUL / Quran.com `text_uthmani_tajweed` dataset:
 * `<tajweed class=rule>…</tajweed>` spans and `<span class=end>N</span>` verse numbers.
 * Colors follow the Quran.com palette; dark variants are lightened for contrast.
 */
export const TAJWEED_RULES = {
  ham_wasl: { name: 'Hamzah Wasl', light: '#AAAAAA', dark: '#8A8A8A' },
  slnt: { name: 'Huruf tidak dibaca', light: '#AAAAAA', dark: '#8A8A8A' },
  laam_shamsiyah: { name: 'Lam Syamsiyah', light: '#AAAAAA', dark: '#8A8A8A' },
  madda_normal: { name: 'Mad Thabi’i', light: '#537FFF', dark: '#7D9DFF' },
  madda_permissible: { name: 'Mad Jaiz', light: '#4050FF', dark: '#7A86FF' },
  madda_necessary: { name: 'Mad Lazim', light: '#000EBC', dark: '#5C68FF' },
  madda_obligatory: { name: 'Mad Wajib', light: '#2144C1', dark: '#6B8BFF' },
  qalaqah: { name: 'Qalqalah', light: '#DD0008', dark: '#FF5A60' },
  ikhafa: { name: 'Ikhfa', light: '#9400A8', dark: '#D35BE6' },
  ikhafa_shafawi: { name: 'Ikhfa Syafawi', light: '#D500B7', dark: '#F05BDA' },
  idgham_shafawi: { name: 'Idgham Mimi', light: '#58B800', dark: '#7FD93A' },
  iqlab: { name: 'Iqlab', light: '#26BFFD', dark: '#5ED0FF' },
  idgham_ghunnah: { name: 'Idgham Bighunnah', light: '#169777', dark: '#3CC9A3' },
  idgham_wo_ghunnah: { name: 'Idgham Bilaghunnah', light: '#169200', dark: '#4CC734' },
  idgham_mutajanisayn: { name: 'Idgham Mutajanisain', light: '#A1A1A1', dark: '#8F8F8F' },
  idgham_mutaqaribayn: { name: 'Idgham Mutaqaribain', light: '#A1A1A1', dark: '#8F8F8F' },
  ghunnah: { name: 'Ghunnah', light: '#FF7E1E', dark: '#FF9C55' },
} as const;

export type TajweedRule = keyof typeof TAJWEED_RULES;

export type TajweedSegment =
  | { kind: 'text'; text: string }
  | { kind: 'rule'; text: string; rule: TajweedRule }
  | { kind: 'end'; text: string };

const TOKEN = /<tajweed class=([a-z_]+)>|<\/tajweed>|<span class=end>(.*?)<\/span>/g;

/** Splits tajweed markup into colored runs. Rule tags can nest; the innermost rule wins. */
export function parseTajweed(markup: string): TajweedSegment[] {
  const segments: TajweedSegment[] = [];
  const rules: string[] = [];
  let last = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const rule = rules[rules.length - 1];
    segments.push(
      rule && rule in TAJWEED_RULES ? { kind: 'rule', text, rule: rule as TajweedRule } : { kind: 'text', text }
    );
  };
  for (const match of markup.matchAll(TOKEN)) {
    pushText(markup.slice(last, match.index));
    const [token, openRule, endText] = match;
    if (openRule) rules.push(openRule);
    else if (endText !== undefined) segments.push({ kind: 'end', text: endText });
    else if (token === '</tajweed>') rules.pop();
    last = match.index + token.length;
  }
  pushText(markup.slice(last));
  return keepMarksWithBase(segments);
}

// Harakat, Quranic marks and the small waw/ya (ۥ ۦ) that the font attaches to the preceding letter.
const MARKS = '\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u08D3-\\u08FF';
const LEADING_MARKS = new RegExp(`^[${MARKS}]+`);
const TRAILING_CLUSTER = new RegExp(`[^${MARKS}][${MARKS}]*$`);

/**
 * The dataset often starts a rule span with a mark that belongs to the previous
 * letter (e.g. `هُ<tajweed>ۥ</tajweed>`). A mark in its own text run can't be
 * attached to its letter, so it renders detached. Move run boundaries so every
 * run starts on a base letter: a rule span takes the letter it marks with it;
 * plain text hands its leading marks back to the previous run.
 */
function keepMarksWithBase(segments: TajweedSegment[]): TajweedSegment[] {
  const out: TajweedSegment[] = [];
  for (const segment of segments) {
    const prev = out[out.length - 1];
    const leading = segment.text.match(LEADING_MARKS)?.[0];
    if (!leading || !prev || prev.kind === 'end' || segment.kind === 'end') {
      out.push({ ...segment });
      continue;
    }
    if (segment.kind === 'rule') {
      const cluster = prev.text.match(TRAILING_CLUSTER)?.[0] ?? '';
      prev.text = prev.text.slice(0, prev.text.length - cluster.length);
      if (prev.text.length === 0) out.pop();
      out.push({ ...segment, text: cluster + segment.text });
    } else {
      prev.text += leading;
      if (segment.text.length > leading.length) out.push({ ...segment, text: segment.text.slice(leading.length) });
    }
  }
  return out;
}

/** Rules that occur in the given verses, in palette order — for the legend. */
export function rulesUsed(markups: string[]): TajweedRule[] {
  const used = new Set<string>();
  for (const markup of markups) {
    for (const match of markup.matchAll(/<tajweed class=([a-z_]+)>/g)) used.add(match[1]);
  }
  return (Object.keys(TAJWEED_RULES) as TajweedRule[]).filter((rule) => used.has(rule));
}
