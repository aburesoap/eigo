import { describe, expect, it } from 'vitest';
import { parseSense, plainMeaning, splitSenses } from '../src/core/dict';

describe('dict helpers', () => {
  it('splits senses', () => {
    expect(splitSenses('a / b / c', 2)).toEqual(['a', 'b']);
  });
  it('parses key translations', () => {
    expect(parseSense('〈人が〉『走る』,駆ける')).toEqual([
      { text: '〈人が〉', key: false },
      { text: '走る', key: true },
      { text: ',駆ける', key: false },
    ]);
  });
  it('makes plain text', () => {
    expect(plainMeaning('『走る』 / 『急ぐ』 / x / y', 2)).toBe('走る / 急ぐ');
  });
});
