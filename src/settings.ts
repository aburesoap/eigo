/**
 * User settings, stored in storage.local (readable from content scripts and
 * observable via storage.onChanged).
 */
import { browser } from 'wxt/browser';

export interface Settings {
  /** Top-N frequent words registered as known on first run (0 = none). */
  seedSize: number;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  /** Consecutive Good/Easy reviews to promote a card's word to known (0 = never). */
  promoteAfter: number;
  /** FSRS desired retention (0.7–0.97). */
  desiredRetention: number;
  /** Local hour at which the study day rolls over. */
  dayStartHour: number;
  /** Show the first letter of the hidden word on the card front. */
  clozeHint: boolean;
  /** Underline words that have a review card (in a different colour). */
  showLearning: boolean;
  /** Hostnames where the extension is turned off. */
  disabledSites: string[];
  /** First-run setup finished. */
  onboarded: boolean;
}

/** Choices offered in the first-run setup. */
export const SEED_SIZES = [0, 1000, 3000, 5000, 8000, 10000] as const;

export const DEFAULT_SETTINGS: Settings = {
  seedSize: 5000,
  dailyNewLimit: 20,
  dailyReviewLimit: 200,
  promoteAfter: 5,
  desiredRetention: 0.9,
  dayStartHour: 4,
  clozeHint: true,
  showLearning: true,
  disabledSites: [],
  onboarded: false,
};

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const raw = (await browser.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !changes[KEY]) return;
    cb({ ...DEFAULT_SETTINGS, ...((changes[KEY].newValue as Partial<Settings>) ?? {}) });
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** Normalize a hostname for per-site settings ("www." is ignored). */
export function siteKey(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

export function isSiteEnabled(s: Settings, hostname: string): boolean {
  return !s.disabledSites.includes(siteKey(hostname));
}

export async function setSiteEnabled(hostname: string, enabled: boolean): Promise<void> {
  const s = await getSettings();
  const key = siteKey(hostname);
  const set = new Set(s.disabledSites);
  if (enabled) set.delete(key);
  else set.add(key);
  await updateSettings({ disabledSites: [...set].sort() });
}
