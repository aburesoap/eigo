/**
 * Typed messages between content scripts, extension pages and the background.
 */
import { browser } from 'wxt/browser';
import type { Classified, WordStatus } from '../core/classify';
import type { Level, PageStats } from '../core/stats';
import type { Backup } from '../core/backup';
import type { ReviewRating } from '../core/srs';
import type { CardEntry, ListStatus } from '../db/schema';

export interface ClassifyItem {
  key: string;
  norm: string;
  capInitial: boolean;
}

export interface LookupResult {
  lemma: string;
  /** Headword the meaning was found under (may differ from lemma). */
  headword: string | null;
  meaning: string | null;
  status: WordStatus;
}

export interface NewCardInput {
  lemma: string;
  surface: string;
  sentence: string;
  url: string;
  title: string;
  meaning: string;
}

/** Requests handled by the background. `res` is the response type. */
export interface BgApi {
  classify: { req: { items: ClassifyItem[] }; res: Record<string, Classified> };
  lookup: { req: { surface: string; lemma: string }; res: LookupResult };
  setStatus: { req: { lemma: string; status: ListStatus | null }; res: void };
  saveCard: { req: { card: NewCardInput }; res: { id: string } };
  pageStats: { req: { coverage: number | null; level: Level }; res: void };
  reviewCard: { req: { cardId: string; rating: ReviewRating }; res: { card: CardEntry; promoted: boolean } };
  updateCard: { req: { id: string; patch: CardPatch }; res: CardEntry };
  deleteCards: { req: { ids: string[] }; res: void };
  dueCounts: { req: Record<string, never>; res: DueCounts };
  summary: { req: Record<string, never>; res: { known: number; ignored: number; cards: number; reviews: number } };
  seed: { req: { size: number }; res: { added: number } };
  importWordList: { req: { words: string[]; status: ListStatus }; res: { added: number; total: number } };
  exportBackup: { req: Record<string, never>; res: Backup };
  importBackup: { req: { backup: Backup; mode: 'merge' | 'replace' }; res: { words: number; cards: number; reviews: number } };
  resetAll: { req: Record<string, never>; res: void };
}

export type CardPatch = Partial<Pick<CardEntry, 'lemma' | 'surface' | 'sentence' | 'meaning' | 'promoted'>>;

export interface DueCounts {
  fresh: number;
  learning: number;
  review: number;
}

export type BgMessage = { [K in keyof BgApi]: { type: K } & BgApi[K]['req'] }[keyof BgApi];

export async function sendToBackground<K extends keyof BgApi>(
  type: K,
  req: BgApi[K]['req'],
): Promise<BgApi[K]['res']> {
  const res = (await browser.runtime.sendMessage({ type, ...req })) as { ok: true; value: BgApi[K]['res'] } | { ok: false; error: string };
  if (!res) throw new Error(`no response for ${type}`);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

/** Status changes broadcast from the background to every tab. */
export interface StatusUpdate {
  lemma: string;
  status: WordStatus;
}

export interface ContentStats extends PageStats {
  enabled: boolean;
  hostname: string;
}

/** Messages handled by content scripts. */
export type ContentMessage =
  | { type: 'statusUpdates'; updates: StatusUpdate[] }
  | { type: 'getStats' }
  | { type: 'rescan' };
