// Shared by the app and scripts/build-quran-db.mjs (run with Node's type stripping),
// so keep this file free of imports and non-erasable TypeScript syntax.

// Harakat, Quranic annotation marks, superscript alef, tatweel and extended tanween.
const MARKS = /[ؐ-ًؚ-ٰٟـۖ-ۭ࣓-ࣿ]/g;
const NON_ARABIC_LETTER = /[^ء-ي\s]/g;

/**
 * Reduces Uthmani mushaf text and OCR output to a comparable skeleton:
 * no diacritics or Quranic marks, unified letter variants, single spaces.
 */
export function normalizeArabic(input: string): string {
  return input
    .replace(MARKS, '')
    .replace(/[آأإٱٲٳ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ئ/g, 'ي') // ئ → ي
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ة/g, 'ه') // ة → ه
    .replace(NON_ARABIC_LETTER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}
