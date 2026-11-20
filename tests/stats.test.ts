import { describe, expect, it } from 'vitest';
import { badgeText, computeStats, levelOf } from '../src/core/stats';
import type { WordStatus } from '../src/core/classify';

describe('computeStats', () => {
  const status: Record<string, WordStatus> = { the: 'known', cat: 'known', zebra: 'unknown', foo: 'ignored', tokyo: 'skip', yak: 'learning' };
  const counts = new Map([['the', 90], ['cat', 5], ['zebra', 3], ['foo', 10], ['tokyo', 4], ['yak', 2]]);
  const s = computeStats(counts, (l) => status[l]!);
  it('counts tokens excluding ignored and skipped', () => {
    expect(s).toMatchObject({ total: 100, known: 95, unknown: 5, ignored: 10, distinct: 4, coverage: 95, level: 'medium' });
  });
  it('lists unknown words by frequency', () => {
    expect(s.topUnknown.map((u) => u.lemma)).toEqual(['zebra', 'yak']);
  });
});

describe('levels and badge', () => {
  it('uses the thresholds', () => {
    expect(levelOf(98)).toBe('easy');
    expect(levelOf(97.9)).toBe('medium');
    expect(levelOf(95)).toBe('medium');
    expect(levelOf(94.9)).toBe('hard');
    expect(levelOf(null)).toBe('none');
  });
  it('floors badge text', () => {
    expect(badgeText(97.9)).toBe('97');
    expect(badgeText(100)).toBe('100');
    expect(badgeText(null)).toBe('');
  });
});
