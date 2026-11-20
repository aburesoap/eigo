/**
 * Typed messages between content scripts, extension pages and the background.
 */
import { browser } from 'wxt/browser';
import type { Classified, WordStatus } from '../core/classify';
import type { Level, PageStats } from '../core/stats';
import type { ListStatus } from '../db/schema';

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
