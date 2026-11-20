/**
 * Tokenizer: extracts English word candidates (with offsets) from plain text.
 * Pure functions only — no DOM, no browser APIs.
 */

/** How the token is capitalized, which drives proper-noun filtering. */
export type CapKind =
  /** all lowercase: "word" */
  | 'lower'
  /** capitalized at the start of a sentence: "The" — may still be a proper noun */
  | 'initial'
  /** capitalized mid-sentence, or with internal capitals: treated as proper noun */
  | 'proper'
  /** ALL CAPS, 2+ letters: treated as acronym */
  | 'acronym';

export interface Token {
  /** Surface form exactly as it appears in the text (e.g. "Don't"). */
  surface: string;
  /** Lowercased, apostrophe-normalized base used for lookup (e.g. "do"). */
  norm: string;
  /** Start offset (inclusive) of the surface in the source text. */
  start: number;
  /** End offset (exclusive). */
  end: number;
  cap: CapKind;
}

// A word: ASCII letters, optionally joined by apostrophes (don't, o'clock).
// It must not touch other letters/digits (so "café", "mp3", "2nd" never match).
const WORD_RE = /(?<![\p{L}\p{N}])[A-Za-z]+(?:['’][A-Za-z]+)*(?![\p{L}\p{N}])/gu;
const CHUNK_RE = /\S+/g;

const URL_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i;
const DOMAIN_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/:?#].*)?$/i;
const CODE_RE = /[_{}<>=|\\$`~^]/;
const CAMEL_RE = /[a-z][A-Z]/;
// Characters trimmed from the edges of a whitespace-delimited chunk before testing it.
const EDGE_PUNCT_RE = /^[("'“‘[{]+|[)"'”’\]},.;:!?…]+$/g;

/** True if the whitespace-delimited chunk is a URL, e-mail, handle, hashtag, path or code-like. */
export function isSpecialChunk(chunk: string): boolean {
  const c = chunk.replace(EDGE_PUNCT_RE, '');
  if (c.length === 0) return false;
  if (URL_RE.test(c)) return true;
  if (c.includes('@')) return true; // e-mail or @handle
  if (c.startsWith('#')) return true; // hashtag
  if (CODE_RE.test(c)) return true; // snake_case, html, code
  if (CAMEL_RE.test(c)) return true; // camelCase, iPhone
  if (DOMAIN_RE.test(c)) return true; // example.com, Node.js
  return false;
}

const IRREGULAR_CONTRACTIONS: Record<string, string> = {
  "can't": 'can',
  "won't": 'will',
  "shan't": 'shall',
  "ain't": 'be',
  "let's": 'let',
  "y'all": 'you',
};
const CONTRACTION_SUFFIX_RE = /(?:n't|'s|'re|'ve|'ll|'d|'m)$/;

/** Lowercase + normalize apostrophes + strip contractions / possessive. */
export function normalizeWord(surface: string): string {
  const w = surface.toLowerCase().replace(/’/g, "'");
  const irregular = IRREGULAR_CONTRACTIONS[w];
  if (irregular) return irregular;
  const stripped = w.replace(CONTRACTION_SUFFIX_RE, '');
  return stripped.length > 0 ? stripped : w;
}

// Characters skipped when looking backwards for a sentence boundary.
const SKIP_BACK_RE = /[\s"'“”‘’()[\]{}*•·\-–—]/;
const BOUNDARY_RE = /[.!?…:;]/;

/** True if the word starting at `start` begins a sentence (or a line / block). */
export function isSentenceInitial(text: string, start: number): boolean {
  let i = start - 1;
  while (i >= 0 && SKIP_BACK_RE.test(text[i]!)) {
    if (text[i] === '\n') return true;
    i--;
  }
  if (i < 0) return true;
  return BOUNDARY_RE.test(text[i]!);
}

export function capKind(surface: string, sentenceInitial: boolean): CapKind {
  const base = surface.replace(/['’].*$/, '');
  if (base === base.toLowerCase()) return 'lower';
  if (base.length >= 2 && base === base.toUpperCase()) return 'acronym';
  const rest = base.slice(1);
  if (rest !== rest.toLowerCase()) return 'proper'; // McDonald, iPhone
  return sentenceInitial ? 'initial' : 'proper';
}

/** Extract every word token from the text (including ones later filtered out). */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  CHUNK_RE.lastIndex = 0;
  let chunk: RegExpExecArray | null;
  while ((chunk = CHUNK_RE.exec(text))) {
    if (isSpecialChunk(chunk[0])) continue;
    const base = chunk.index;
    WORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD_RE.exec(chunk[0]))) {
      const start = base + m.index;
      const surface = m[0];
      out.push({
        surface,
        norm: normalizeWord(surface),
        start,
        end: start + surface.length,
        cap: capKind(surface, isSentenceInitial(text, start)),
      });
    }
  }
  return out;
}

/**
 * Whether the token should be judged at all. Proper nouns, acronyms and
 * single letters ("a", "I") are excluded. 'initial' tokens are candidates
 * but may still be rejected later as proper nouns (see classify).
 */
export function isCandidate(t: Token): boolean {
  if (t.cap === 'proper' || t.cap === 'acronym') return false;
  if (t.norm.length < 2) return false;
  return true;
}
