#!/usr/bin/env node
/**
 * Builds assets/db/quran.db — the read-only Quran database bundled with the app.
 *
 * Source: the Quran.com API v4, which serves the same Uthmani + tajweed dataset
 * published on QUL (qul.tarteel.ai).
 *
 * Run: npm run build:quran-db
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { normalizeArabic } from '../src/lib/quran/normalize.ts';

const API = 'https://api.quran.com/api/v4';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'assets', 'db', 'quran.db');

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

const { chapters } = await getJson('/chapters');
console.log(`Fetched ${chapters.length} chapters`);

const verses = [];
for (const chapter of chapters) {
  const [{ verses: uthmani }, { verses: tajweed }] = await Promise.all([
    getJson(`/quran/verses/uthmani?chapter_number=${chapter.id}`),
    getJson(`/quran/verses/uthmani_tajweed?chapter_number=${chapter.id}`),
  ]);
  const tajweedByKey = new Map(tajweed.map((v) => [v.verse_key, v.text_uthmani_tajweed]));
  for (const v of uthmani) {
    const [, verseNumber] = v.verse_key.split(':').map(Number);
    verses.push({
      id: v.id,
      chapter: chapter.id,
      verse: verseNumber,
      tajweed: tajweedByKey.get(v.verse_key),
      normalized: normalizeArabic(v.text_uthmani),
    });
  }
  process.stdout.write(`\r${chapter.id}/${chapters.length}`);
}
process.stdout.write('\n');

if (verses.length !== 6236 || verses.some((v) => !v.tajweed)) {
  throw new Error(`Unexpected dataset: ${verses.length} verses, some may lack tajweed text`);
}

mkdirSync(dirname(outFile), { recursive: true });
rmSync(outFile, { force: true });
const db = new DatabaseSync(outFile);
db.exec(`
  CREATE TABLE chapters (
    id INTEGER PRIMARY KEY,
    name_simple TEXT NOT NULL,
    name_arabic TEXT NOT NULL,
    verses_count INTEGER NOT NULL
  );
  CREATE TABLE verses (
    id INTEGER PRIMARY KEY,
    chapter INTEGER NOT NULL REFERENCES chapters(id),
    verse INTEGER NOT NULL,
    text_tajweed TEXT NOT NULL,
    text_normalized TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE verses_fts USING fts5(
    text_normalized, content='verses', content_rowid='id'
  );
`);

db.exec('BEGIN');
const insertChapter = db.prepare('INSERT INTO chapters VALUES (?, ?, ?, ?)');
for (const c of chapters) insertChapter.run(c.id, c.name_simple, c.name_arabic, c.verses_count);
const insertVerse = db.prepare('INSERT INTO verses VALUES (?, ?, ?, ?, ?)');
for (const v of verses) insertVerse.run(v.id, v.chapter, v.verse, v.tajweed, v.normalized);
db.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')");
db.exec('COMMIT');
db.exec("INSERT INTO verses_fts(verses_fts) VALUES('optimize')");
db.exec('PRAGMA journal_mode = DELETE');
db.exec('VACUUM');
db.close();

console.log(`Wrote ${verses.length} verses to ${outFile}`);
