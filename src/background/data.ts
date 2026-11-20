/**
 * Data management: seeding, bulk word-list import, JSON backup import/export.
 */
import { createBackup, newerRecords, reviewKey, type Backup } from '../core/backup';
import { db } from '../db/schema';
import type { ListStatus } from '../db/schema';
import { DEFAULT_SETTINGS, getSettings, updateSettings, type Settings } from '../settings';
import type { Engine } from './engine';

export interface DataSummary {
  known: number;
  ignored: number;
  cards: number;
  reviews: number;
}

export async function summary(): Promise<DataSummary> {
  const [known, ignored, cards, reviews] = await Promise.all([
    db().words.where('status').equals('known').count(),
    db().words.where('status').equals('ignored').count(),
    db().cards.count(),
    db().reviews.count(),
  ]);
  return { known, ignored, cards, reviews };
}

/** Register the top-N frequent words as known (existing entries are kept). */
export async function seed(engine: Engine, size: number): Promise<{ added: number }> {
  const lemmas = await engine.frequentLemmas(size);
  const existing = new Set(await db().words.toCollection().primaryKeys());
  const fresh = lemmas.filter((l) => !existing.has(l));
  if (fresh.length) await engine.setStatuses(fresh, 'known', 'seed');
  await updateSettings({ seedSize: size, onboarded: true });
  return { added: fresh.length };
}

/** Import a plain word list. Inflected forms are lemmatized ("running" → "run"). */
export async function importWordList(engine: Engine, words: string[], status: ListStatus): Promise<{ added: number; total: number }> {
  await engine.ready();
  const lemmas = [...new Set(words.flatMap((w) => [engine.lemmaOf(w)]))];
  const set = status === 'known' ? engine.known : engine.ignored;
  const fresh = lemmas.filter((l) => !set.has(l));
  if (fresh.length) await engine.setStatuses(fresh, status, 'import');
  return { added: fresh.length, total: lemmas.length };
}

export async function exportBackup(): Promise<Backup> {
  const [words, cards, reviews, settings] = await Promise.all([
    db().words.toArray(),
    db().cards.toArray(),
    db().reviews.toArray(),
    getSettings(),
  ]);
  return createBackup({ words, cards, reviews, settings });
}

export interface ImportResult {
  words: number;
  cards: number;
  reviews: number;
}

/**
 * merge:   keep existing data, add new records, overwrite older ones (by updatedAt)
 * replace: delete everything first (settings are restored from the backup too)
 */
export async function importBackup(engine: Engine, backup: Backup, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const d = db();
  let result: ImportResult = { words: 0, cards: 0, reviews: 0 };
  await d.transaction('rw', d.words, d.cards, d.reviews, async () => {
    if (mode === 'replace') {
      await Promise.all([d.words.clear(), d.cards.clear(), d.reviews.clear()]);
      await d.words.bulkPut(backup.words);
      await d.cards.bulkPut(backup.cards);
      await d.reviews.bulkAdd(backup.reviews);
      result = { words: backup.words.length, cards: backup.cards.length, reviews: backup.reviews.length };
      return;
    }
    const [words, cards, reviews] = await Promise.all([d.words.toArray(), d.cards.toArray(), d.reviews.toArray()]);
    const w = newerRecords(new Map(words.map((x) => [x.lemma, x])), backup.words, (x) => x.lemma, (x) => x.updatedAt);
    const c = newerRecords(new Map(cards.map((x) => [x.id, x])), backup.cards, (x) => x.id, (x) => x.updatedAt);
    const seen = new Set(reviews.map(reviewKey));
    const r = backup.reviews.filter((x) => !seen.has(reviewKey(x)));
    await d.words.bulkPut(w);
    await d.cards.bulkPut(c);
    await d.reviews.bulkAdd(r);
    result = { words: w.length, cards: c.length, reviews: r.length };
  });
  if (mode === 'replace' && backup.settings) {
    const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
    const restored = Object.fromEntries(keys.filter((k) => k in backup.settings!).map((k) => [k, backup.settings![k]]));
    await updateSettings({ ...restored, onboarded: true });
  } else {
    await updateSettings({ onboarded: true });
  }
  await engine.reloadAll();
  return result;
}

/** Delete all data (words, cards, reviews) and settings. */
export async function resetAll(engine: Engine): Promise<void> {
  const d = db();
  await d.transaction('rw', d.words, d.cards, d.reviews, async () => {
    await Promise.all([d.words.clear(), d.cards.clear(), d.reviews.clear()]);
  });
  await updateSettings({ ...DEFAULT_SETTINGS });
  await engine.reloadAll();
}
