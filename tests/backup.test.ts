import { describe, expect, it } from 'vitest';
import { BackupError, createBackup, newerRecords, parseWordList, validateBackup } from '../src/core/backup';
import { newSrsState } from '../src/core/srs';
import type { CardEntry } from '../src/db/schema';

const card = (id: string, updatedAt = 1): CardEntry => ({
  id, lemma: 'x', surface: 'x', sentence: 's', url: 'u', title: 't', meaning: 'm',
  createdAt: 1, updatedAt, srs: newSrsState(0), streak: 0, promoted: false,
});

describe('backup', () => {
  it('round-trips through JSON', () => {
    const b = createBackup({
      words: [{ lemma: 'cat', status: 'known', source: 'manual', updatedAt: 5 }],
      cards: [card('a')],
      reviews: [{ id: 7, cardId: 'a', rating: 3, reviewedAt: 10, state: 0, elapsedDays: 0, scheduledDays: 0 }],
      settings: { dailyNewLimit: 5 },
    });
    const { backup, skipped } = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(skipped).toBe(0);
    expect(backup.words).toHaveLength(1);
    expect(backup.cards[0]!.srs).toEqual(card('a').srs);
    expect(backup.reviews[0]).not.toHaveProperty('id');
    expect(backup.settings).toEqual({ dailyNewLimit: 5 });
  });

  it('rejects foreign files and future versions', () => {
    expect(() => validateBackup({ hello: 1 })).toThrow(BackupError);
    expect(() => validateBackup([])).toThrow(BackupError);
    expect(() => validateBackup({ format: 'eigo-backup', version: 99 })).toThrow(/バージョン/);
  });

  it('skips invalid records and orphan reviews', () => {
    const { backup, skipped } = validateBackup({
      format: 'eigo-backup', version: 1,
      words: [{ lemma: 'ok', status: 'known', updatedAt: 1 }, { lemma: '', status: 'known', updatedAt: 1 }, { lemma: 'x', status: 'weird', updatedAt: 1 }],
      cards: [card('a'), { id: 'broken' }],
      reviews: [{ cardId: 'a', rating: 3, reviewedAt: 1, state: 0 }, { cardId: 'zzz', rating: 3, reviewedAt: 1, state: 0 }],
    });
    expect(backup.words.map((w) => w.lemma)).toEqual(['ok']);
    expect(backup.words[0]!.source).toBe('import');
    expect(backup.cards).toHaveLength(1);
    expect(backup.reviews).toHaveLength(1);
    expect(skipped).toBe(4);
  });

  it('merges by newest updatedAt', () => {
    const existing = new Map([['a', card('a', 5)], ['b', card('b', 5)]]);
    const got = newerRecords(existing, [card('a', 4), card('b', 6), card('c', 1)], (c) => c.id, (c) => c.updatedAt);
    expect(got.map((c) => c.id)).toEqual(['b', 'c']);
  });
});

describe('parseWordList', () => {
  it('reads one word per line', () => {
    const { words, invalid } = parseWordList('# my list\nApple\n\nbanana\t123\nwell-known\napple\nrock’n’roll\n123\nfoo bar\n');
    expect(words).toEqual(['apple', 'banana', 'well-known', "rock'n'roll", 'foo']);
    expect(invalid).toEqual(['123']);
  });
});
