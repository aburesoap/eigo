/**
 * Known-word coverage statistics.
 */
import type { WordStatus } from './classify';

export type Level = 'easy' | 'medium' | 'hard' | 'none';

export interface PageStats {
  /** Tokens counted in coverage (known + unknown + learning). */
  total: number;
  known: number;
  unknown: number;
  ignored: number;
  /** Distinct lemmas counted in coverage. */
  distinct: number;
  /** Coverage in percent (0–100), or null when there are no tokens. */
  coverage: number | null;
  level: Level;
  /** Unknown (incl. learning) lemmas by frequency, most frequent first. */
  topUnknown: { lemma: string; count: number; status: WordStatus }[];
}

export const LEVEL_THRESHOLDS = { easy: 98, medium: 95 } as const;

export function levelOf(coverage: number | null): Level {
  if (coverage === null) return 'none';
  if (coverage >= LEVEL_THRESHOLDS.easy) return 'easy';
  if (coverage >= LEVEL_THRESHOLDS.medium) return 'medium';
  return 'hard';
}

/**
 * @param counts lemma → occurrence count on the page
 * @param statusOf current status of a lemma
 */
export function computeStats(
  counts: ReadonlyMap<string, number>,
  statusOf: (lemma: string) => WordStatus,
  topN = 30,
): PageStats {
  let known = 0;
  let unknown = 0;
  let ignored = 0;
  let distinct = 0;
  const unknownList: { lemma: string; count: number; status: WordStatus }[] = [];

  for (const [lemma, count] of counts) {
    const status = statusOf(lemma);
    if (status === 'skip') continue;
    if (status === 'ignored') {
      ignored += count;
      continue;
    }
    distinct++;
    if (status === 'known') known += count;
    else {
      unknown += count;
      unknownList.push({ lemma, count, status });
    }
  }
  const total = known + unknown;
  const coverage = total === 0 ? null : Math.floor((known / total) * 1000) / 10;
  unknownList.sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
  return {
    total,
    known,
    unknown,
    ignored,
    distinct,
    coverage,
    level: levelOf(coverage),
    topUnknown: unknownList.slice(0, topN),
  };
}

/** Text for the toolbar badge (e.g. "96"). Floors so 97.9 never shows as "98". */
export function badgeText(coverage: number | null): string {
  if (coverage === null) return '';
  return String(Math.floor(coverage));
}

export const LEVEL_COLORS: Record<Level, string> = {
  easy: '#2e7d32',
  medium: '#f9a825',
  hard: '#c62828',
  none: '#9e9e9e',
};
