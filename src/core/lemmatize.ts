/**
 * Lemmatization on top of wink-lemmatizer (WordNet "morphy").
 *
 * wink returns a candidate base form per part of speech, but the right one is
 * ambiguous ("leaves" → leave / leaf, "during" → dure!). We pick a candidate
 * using two oracles supplied by the caller:
 *   - isHeadword(w): the word is a dictionary headword
 *   - rank(w): frequency rank of the surface form (1 = most frequent, Infinity = unknown)
 */
import wink from 'wink-lemmatizer';

export interface LemmatizerOptions {
  isHeadword: (w: string) => boolean;
  rank: (w: string) => number;
  /**
   * When the surface word is itself a headword, only switch to a lemma whose
   * rank is at most `maxRankRatio` × the surface rank (i.e. not much rarer).
   * Keeps "during" (not "dure") and "data" (not "datum").
   */
  maxRankRatio?: number;
}

/** Closed-class words wink would wrongly strip ("as" → "a", "his" → "hi"). */
const NO_LEMMATIZE = new Set([
  'as', 'his', 'its', 'this', 'thus', 'us', 'yes',
  'news', 'plus', 'less', 'unless', 'whereas', 'always', 'perhaps', 'besides',
  'towards', 'afterwards', 'sometimes', 'series', 'species', 'during', 'nothing',
  'something', 'anything', 'everything', 'morning', 'evening', 'ceiling', 'bus',
  'gas', 'lens', 'bias', 'chaos', 'across', 'ourselves', 'yourselves', 'themselves',
]);

/** Forms that wink keeps but that should still map to a common lemma. */
const OVERRIDES: Record<string, string> = {
  is: 'be', was: 'be', has: 'have', does: 'do', am: 'be', are: 'be', were: 'be',
  been: 'be', being: 'be', had: 'have', did: 'do', done: 'do',
};

export type Lemmatize = (norm: string) => string;

/** Raw candidates from wink, in priority order verb → noun → adjective (deduplicated). */
export function candidates(w: string): string[] {
  const out: string[] = [];
  for (const c of [wink.verb(w), wink.noun(w), wink.adjective(w)]) {
    if (c && c !== w && !out.includes(c)) out.push(c);
  }
  return out;
}

export function createLemmatizer(opts: LemmatizerOptions): Lemmatize {
  const ratio = opts.maxRankRatio ?? 3;
  const cache = new Map<string, string>();

  return (norm: string): string => {
    const hit = cache.get(norm);
    if (hit !== undefined) return hit;

    let result = norm;
    const override = OVERRIDES[norm];
    if (override) {
      result = override;
    } else if (!NO_LEMMATIZE.has(norm)) {
      const cands = candidates(norm).filter(opts.isHeadword);
      if (cands.length > 0) {
        if (!opts.isHeadword(norm)) {
          result = cands[0]!;
        } else {
          const r = opts.rank(norm);
          const found = cands.find((c) => opts.rank(c) <= r * ratio);
          if (found) result = found;
        }
      }
    }
    cache.set(norm, result);
    return result;
  };
}
