/**
 * IndexedDB schema (Dexie). Only opened from extension pages / background —
 * never from content scripts (that would create the DB in the website's origin).
 */
import Dexie, { type Table } from 'dexie';
import type { SrsState } from '../core/srs';

export type ListStatus = 'known' | 'ignored';
export type WordSource = 'seed' | 'manual' | 'promoted' | 'import';

/** Known / ignored list. Lemmas not present are "unknown". */
export interface WordEntry {
  lemma: string;
  status: ListStatus;
  source: WordSource;
  updatedAt: number;
}

export interface CardEntry {
  id: string;
  lemma: string;
  /** Word form as it appeared on the page. */
  surface: string;
  sentence: string;
  url: string;
  title: string;
  meaning: string;
  createdAt: number;
  updatedAt: number;
  srs: SrsState;
  /** Consecutive Good/Easy reviews. */
  streak: number;
  /** The word was promoted to the known list by this card. */
  promoted: boolean;
}

export interface ReviewEntry {
  id?: number;
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: number;
  /** FSRS state before this review (0 New, 1 Learning, 2 Review, 3 Relearning). */
  state: number;
  elapsedDays: number;
  scheduledDays: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class EigoDB extends Dexie {
  words!: Table<WordEntry, string>;
  cards!: Table<CardEntry, string>;
  reviews!: Table<ReviewEntry, number>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'eigo') {
    super(name);
    this.version(1).stores({
      words: 'lemma, status, source, updatedAt',
      cards: 'id, lemma, srs.due, srs.state, createdAt, updatedAt',
      reviews: '++id, cardId, reviewedAt',
      meta: 'key',
    });
  }
}

let instance: EigoDB | null = null;
export function db(): EigoDB {
  return (instance ??= new EigoDB());
}
