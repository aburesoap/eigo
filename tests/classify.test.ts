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
  it('treats -ly adverbs of known adjectives as known', () => {
    expect(classifyWord('slowly', false, ctx(['slow'])).status).toBe('known');
    expect(classifyWord('happily', false, ctx(['happy'])).status).toBe('known');
    expect(classifyWord('gently', false, ctx(['gentle'])).status).toBe('known');
    expect(classifyWord('dynamically', false, ctx(['dynamic'])).status).toBe('known');
    expect(classifyWord('fully', false, ctx(['full'])).status).toBe('known');
    expect(classifyWord('slowly', false, ctx([])).status).toBe('unknown');
    expect(classifyWord('slowly', false, ctx(['slow'], ['slowly'])).status).toBe('ignored');
  });
  it('builds distinct cache keys', () => {
    expect(classifyKey('may', true)).not.toBe(classifyKey('may', false));
  });
});
