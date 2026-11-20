/**
 * Backup format (JSON export / import) and word-list parsing. Pure functions.
 */
import type { CardEntry, ReviewEntry, WordEntry } from '../db/schema';
import type { Settings } from '../settings';

export const BACKUP_FORMAT = 'eigo-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  words: WordEntry[];
  cards: CardEntry[];
  reviews: ReviewEntry[];
  settings?: Partial<Settings>;
}

export function createBackup(data: Omit<Backup, 'format' | 'version' | 'exportedAt'>, now = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    words: data.words,
    cards: data.cards,
    reviews: data.reviews.map(({ id: _id, ...r }) => r),
    settings: data.settings,
  };
}

export class BackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validWord(w: unknown): w is WordEntry {
  return isObj(w) && isStr(w.lemma) && w.lemma.length > 0 && (w.status === 'known' || w.status === 'ignored') && isNum(w.updatedAt);
}

function validCard(c: unknown): c is CardEntry {
  if (!isObj(c) || !isObj(c.srs)) return false;
  const s = c.srs;
  return (
    isStr(c.id) && isStr(c.lemma) && isStr(c.surface) && isStr(c.sentence) && isStr(c.url) && isStr(c.title) &&
    isStr(c.meaning) && isNum(c.createdAt) && isNum(c.updatedAt) && isNum(c.streak) && typeof c.promoted === 'boolean' &&
    isNum(s.due) && isNum(s.stability) && isNum(s.difficulty) && isNum(s.reps) && isNum(s.lapses) && isNum(s.state)
  );
}

function validReview(r: unknown): r is ReviewEntry {
  return isObj(r) && isStr(r.cardId) && isNum(r.rating) && r.rating >= 1 && r.rating <= 4 && isNum(r.reviewedAt) && isNum(r.state);
}

export interface ValidatedBackup {
  backup: Backup;
  /** Number of invalid records that were skipped. */
  skipped: number;
}

/** Validate parsed JSON. Throws BackupError if it is not an eigo backup at all. */
export function validateBackup(json: unknown): ValidatedBackup {
  if (!isObj(json) || json.format !== BACKUP_FORMAT) throw new BackupError('eigo のバックアップファイルではありません。');
  if (!isNum(json.version) || json.version > BACKUP_VERSION) {
    throw new BackupError(`対応していないバージョンです（${String(json.version)}）。拡張機能を更新してください。`);
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const wordsIn = arr(json.words);
  const cardsIn = arr(json.cards);
  const reviewsIn = arr(json.reviews);
  const words = wordsIn.filter(validWord).map((w) => ({ ...w, lemma: w.lemma.toLowerCase(), source: w.source ?? 'import' }));
  const cards = cardsIn.filter(validCard);
  const cardIds = new Set(cards.map((c) => c.id));
  const reviews = reviewsIn.filter(validReview).filter((r) => cardIds.has(r.cardId)).map(({ id: _id, ...r }) => r);
  const skipped = wordsIn.length - words.length + (cardsIn.length - cards.length) + (reviewsIn.length - reviews.length);
  return {
    backup: {
      format: BACKUP_FORMAT,
      version: json.version,
      exportedAt: isStr(json.exportedAt) ? json.exportedAt : '',
      words,
      cards,
      reviews,
      settings: isObj(json.settings) ? (json.settings as Partial<Settings>) : undefined,
    },
    skipped,
  };
}

/** Records from `incoming` that should be written: new ones, and ones newer than the existing copy. */
export function newerRecords<T>(existing: Map<string, T>, incoming: T[], key: (t: T) => string, updatedAt: (t: T) => number): T[] {
  return incoming.filter((r) => {
    const cur = existing.get(key(r));
    return !cur || updatedAt(r) > updatedAt(cur);
  });
}

export const reviewKey = (r: Pick<ReviewEntry, 'cardId' | 'reviewedAt'>) => `${r.cardId}@${r.reviewedAt}`;

/**
 * Parse a plain-text word list: one word per line. Blank lines and lines
 * starting with "#" are ignored; only the first column is used ("word<TAB>123").
 */
export function parseWordList(text: string): { words: string[]; invalid: string[] } {
  const words = new Set<string>();
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const first = line.split(/[\s,;]+/)[0]!.toLowerCase().replace(/’/g, "'");
    if (/^[a-z]+(?:['-][a-z]+)*$/.test(first)) words.add(first);
    else invalid.push(line);
  }
  return { words: [...words], invalid };
}
