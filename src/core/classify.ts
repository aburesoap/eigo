/**
 * Known / unknown judgement.
 */
import type { Lemmatize } from './lemmatize';

/**
 * - known:    in the known list (no underline, counts as known)
 * - ignored:  in the ignore list (no underline, excluded from coverage)
 * - learning: has a review card but is not known yet (underline in a different colour, counts as unknown)
 * - unknown:  everything else (underline)
 * - skip:     not a word to judge (e.g. a sentence-initial proper noun)
 */
export type WordStatus = 'known' | 'ignored' | 'learning' | 'unknown' | 'skip';

export interface ClassifyContext {
  lemmatize: Lemmatize;
  /** True if the lowercase word is a dictionary headword. */
  isLowerHeadword: (w: string) => boolean;
  known: ReadonlySet<string>;
  ignored: ReadonlySet<string>;
  learning: ReadonlySet<string>;
}

export interface Classified {
  lemma: string;
  status: WordStatus;
}

/** Cache key used by content script ↔ background for a token. */
export function classifyKey(norm: string, capInitial: boolean): string {
  return capInitial ? `^${norm}` : norm;
}

export function statusOfLemma(lemma: string, norm: string, ctx: ClassifyContext): WordStatus {
  if (ctx.ignored.has(lemma) || ctx.ignored.has(norm)) return 'ignored';
  if (ctx.known.has(lemma) || ctx.known.has(norm)) return 'known';
  if (ctx.learning.has(lemma)) return 'learning';
  return 'unknown';
}

/**
 * Classify one normalized word.
 * @param capInitial the word was capitalized at the start of a sentence
 */
export function classifyWord(norm: string, capInitial: boolean, ctx: ClassifyContext): Classified {
  const lemma = ctx.lemmatize(norm);
  if (capInitial && !ctx.isLowerHeadword(norm) && !ctx.isLowerHeadword(lemma)) {
    // "Tokyo is ..." — capitalized and not an ordinary lowercase word.
    return { lemma, status: 'skip' };
  }
  return { lemma, status: statusOfLemma(lemma, norm, ctx) };
}
