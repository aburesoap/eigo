import { describe, expect, it } from 'vitest';
import { extractSentence, splitSentences } from '../src/core/sentence';

describe('sentences', () => {
  it('extracts the sentence containing an offset', () => {
    const text = 'First one here. The second sentence has a target word! Third?';
    expect(extractSentence(text, text.indexOf('target'))).toBe('The second sentence has a target word!');
  });
  it('does not break after abbreviations', () => {
    const text = 'Mr. Smith met Dr. Jones in the U.S. last year. Then he left.';
    expect(extractSentence(text, text.indexOf('Jones'))).toBe('Mr. Smith met Dr. Jones in the U.S. last year.');
  });
  it('splits on line breaks', () => {
    const text = 'Heading without period\nBody text goes here.';
    expect(splitSentences(text).map((s) => text.slice(s.start, s.end))).toEqual(['Heading without period', 'Body text goes here.']);
  });
  it('trims long sentences around the word', () => {
    const text = `${'word '.repeat(100)}TARGET ${'more '.repeat(100)}.`;
    const s = extractSentence(text, text.indexOf('TARGET'), undefined, { maxLength: 60 });
    expect(s).toContain('TARGET');
    expect(s.length).toBeLessThanOrEqual(66);
    expect(s.startsWith('… ')).toBe(true);
  });
});
