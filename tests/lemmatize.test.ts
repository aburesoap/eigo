import { describe, expect, it } from 'vitest';
import { lemmatize } from './helpers';

describe('lemmatize', () => {
  const cases: [string, string][] = [
    ['running', 'run'], ['ran', 'run'], ['went', 'go'], ['was', 'be'], ['is', 'be'], ['are', 'be'],
    ['children', 'child'], ['things', 'thing'], ['leaves', 'leave'], ['better', 'good'], ['taller', 'tall'],
    ['studies', 'study'], ['interesting', 'interest'], ['does', 'do'], ['had', 'have'],
    // must NOT be over-lemmatized
    ['as', 'as'], ['his', 'his'], ['this', 'this'], ['during', 'during'], ['news', 'news'],
    ['series', 'series'], ['data', 'data'], ['always', 'always'], ['people', 'people'],
  ];
  it.each(cases)('%s → %s', (w, expected) => {
    expect(lemmatize(w)).toBe(expected);
  });
});
