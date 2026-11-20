import { describe, expect, it } from 'vitest';
import { isCandidate, isSentenceInitial, isSpecialChunk, normalizeWord, tokenize } from '../src/core/tokenize';

const words = (text: string) => tokenize(text).filter(isCandidate).map((t) => t.norm);

describe('tokenize', () => {
  it('extracts words with offsets', () => {
    const text = 'The cat sat.';
    const toks = tokenize(text);
    expect(toks.map((t) => t.surface)).toEqual(['The', 'cat', 'sat']);
    for (const t of toks) expect(text.slice(t.start, t.end)).toBe(t.surface);
  });

  it('skips numbers and words mixed with digits', () => {
    expect(words('In 2024 we bought 3 mp3 players on the 2nd day')).toEqual(['in', 'we', 'bought', 'players', 'on', 'the', 'day']);
  });

  it('skips URLs, e-mails, handles, hashtags, domains and code', () => {
    expect(words('see https://example.com/path now')).toEqual(['see', 'now']);
    expect(words('visit www.example.org today')).toEqual(['visit', 'today']);
    expect(words('mail me at foo.bar@example.com please')).toEqual(['mail', 'me', 'at', 'please']);
    expect(words('ask @someone about #topic quickly')).toEqual(['ask', 'about', 'quickly']);
    expect(words('install node.js and call get_value or getValue')).toEqual(['install', 'and', 'call', 'or']);
  });

  it('does not split accented words into ASCII fragments', () => {
    expect(words('a café and naïve people')).toEqual(['and', 'people']);
  });

  it('splits hyphenated words', () => {
    expect(words('a well-known fact')).toEqual(['well', 'known', 'fact']);
  });

  it('keeps words in single quotes', () => {
    expect(words("the word 'hello' here")).toEqual(['the', 'word', 'hello', 'here']);
  });

  it('excludes single letters, acronyms and mid-sentence capitals', () => {
    const toks = tokenize('I met John at NASA and the BBC in London.');
    expect(toks.filter(isCandidate).map((t) => t.norm)).toEqual(['met', 'at', 'and', 'the', 'in']);
    expect(toks.find((t) => t.surface === 'John')!.cap).toBe('proper');
    expect(toks.find((t) => t.surface === 'NASA')!.cap).toBe('acronym');
  });

  it('marks sentence-initial capitals as "initial"', () => {
    const toks = tokenize('Hello world. Tokyo is big! "Really?" Yes.\nNext line');
    const caps = Object.fromEntries(toks.map((t) => [t.surface, t.cap]));
    expect(caps).toMatchObject({ Hello: 'initial', Tokyo: 'initial', Really: 'initial', Yes: 'initial', Next: 'initial', world: 'lower' });
  });

  it('treats internal capitals as proper nouns / code', () => {
    expect(tokenize('McDonald iPhone')).toEqual([]);
    expect(tokenize('he said: McDonald-style').map((t) => t.cap)).toEqual(['lower', 'lower']);
  });
});

describe('normalizeWord', () => {
  it('strips contractions and possessives', () => {
    expect(normalizeWord("Don't")).toBe('do');
    expect(normalizeWord('isn’t')).toBe('is');
    expect(normalizeWord("can't")).toBe('can');
    expect(normalizeWord("won't")).toBe('will');
    expect(normalizeWord("John's")).toBe('john');
    expect(normalizeWord("they're")).toBe('they');
    expect(normalizeWord("I'll")).toBe('i');
    expect(normalizeWord("o'clock")).toBe("o'clock");
  });
});

describe('isSentenceInitial', () => {
  it('detects boundaries', () => {
    expect(isSentenceInitial('Word', 0)).toBe(true);
    expect(isSentenceInitial('a. Word', 3)).toBe(true);
    expect(isSentenceInitial('a. (Word', 4)).toBe(true);
    expect(isSentenceInitial('a, Word', 3)).toBe(false);
  });
});

describe('isSpecialChunk', () => {
  it('does not flag ordinary punctuation', () => {
    expect(isSpecialChunk('end.')).toBe(false);
    expect(isSpecialChunk('U.S.')).toBe(false);
    expect(isSpecialChunk('e.g.,')).toBe(false);
    expect(isSpecialChunk('(hello)')).toBe(false);
    expect(isSpecialChunk('example.com')).toBe(true);
  });
});
