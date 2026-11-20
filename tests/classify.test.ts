import { describe, expect, it } from 'vitest';
import { classifyKey, classifyWord, type ClassifyContext } from '../src/core/classify';
import { isLowerHeadword, lemmatize } from './helpers';

const ctx = (known: string[], ignored: string[] = [], learning: string[] = []): ClassifyContext => ({
  lemmatize, isLowerHeadword, known: new Set(known), ignored: new Set(ignored), learning: new Set(learning),
});

describe('classifyWord', () => {
  it('judges by lemma', () => {
    expect(classifyWord('running', false, ctx(['run']))).toEqual({ lemma: 'run', status: 'known' });
    expect(classifyWord('ubiquitous', false, ctx(['run']))).toEqual({ lemma: 'ubiquitous', status: 'unknown' });
  });
  it('ignored wins over known, learning is reported', () => {
    expect(classifyWord('cats', false, ctx(['cat'], ['cat'])).status).toBe('ignored');
    expect(classifyWord('cats', false, ctx([], [], ['cat'])).status).toBe('learning');
  });
  it('accepts a known surface form even if lemma is unknown', () => {
    expect(classifyWord('running', false, ctx(['running'])).status).toBe('known');
  });
  it('skips sentence-initial proper nouns but not ordinary words', () => {
    expect(classifyWord('tokyo', true, ctx([])).status).toBe('skip');
    expect(classifyWord('however', true, ctx([])).status).toBe('unknown');
    expect(classifyWord('however', true, ctx(['however'])).status).toBe('known');
  });
  it('builds distinct cache keys', () => {
    expect(classifyKey('may', true)).not.toBe(classifyKey('may', false));
  });
});
