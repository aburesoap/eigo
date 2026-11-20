/**
 * Sentence boundary detection: cut out the sentence that contains an offset.
 */

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'no', 'fig',
  'e.g', 'i.e', 'u.s', 'u.k', 'a.m', 'p.m', 'inc', 'ltd', 'co', 'corp', 'jan',
  'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'approx', 'dept', 'est', 'gen', 'gov', 'mt', 'rev', 'vol',
]);

export interface SentenceSpan {
  start: number;
  end: number;
}

let segmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter | null {
  if (segmenter) return segmenter;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  }
  return segmenter;
}

function fallbackSplit(text: string): SentenceSpan[] {
  const out: SentenceSpan[] = [];
  const re = /[^.!?\n]*(?:[.!?]+["'”’)]*\s*|\n+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m[0].length > 0) {
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** True if the sentence piece ends with a known abbreviation ("Mr.", "e.g."). */
function endsWithAbbreviation(piece: string): boolean {
  const m = /([A-Za-z.]+)\.\s*$/.exec(piece);
  if (!m) return false;
  const word = m[1]!.toLowerCase();
  if (ABBREVIATIONS.has(word)) return true;
  // single initial: "J. K. Rowling"
  return /^[a-z]$/.test(word);
}

/** Split text into sentence spans (abbreviation-aware). Line breaks always split. */
export function splitSentences(text: string): SentenceSpan[] {
  const seg = getSegmenter();
  const raw: SentenceSpan[] = seg
    ? Array.from(seg.segment(text), (s) => ({ start: s.index, end: s.index + s.segment.length }))
    : fallbackSplit(text);

  // Merge pieces split after abbreviations.
  const merged: SentenceSpan[] = [];
  for (const span of raw) {
    const prev = merged[merged.length - 1];
    if (prev && endsWithAbbreviation(text.slice(prev.start, prev.end)) && !/\n/.test(text.slice(prev.start, prev.end))) {
      prev.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }

  // Split on line breaks (block boundaries) too.
  const out: SentenceSpan[] = [];
  for (const span of merged) {
    let s = span.start;
    for (let i = span.start; i < span.end; i++) {
      if (text[i] === '\n') {
        if (i > s) out.push({ start: s, end: i });
        s = i + 1;
      }
    }
    if (span.end > s) out.push({ start: s, end: span.end });
  }
  return out;
}

export interface ExtractOptions {
  /** Maximum length; longer sentences are trimmed around the word with "…". */
  maxLength?: number;
}

/** Return the trimmed sentence containing `[start, end)` in `text`. */
export function extractSentence(text: string, start: number, end = start + 1, opts: ExtractOptions = {}): string {
  const max = opts.maxLength ?? 300;
  const span = splitSentences(text).find((s) => start >= s.start && start < s.end) ?? { start: 0, end: text.length };
  let s = span.start;
  let e = span.end;
  // trim whitespace
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  let sentence = text.slice(s, e).replace(/\s+/g, ' ');
  if (sentence.length <= max) return sentence;

  // Too long: keep a window around the word, cut at word boundaries.
  const rel = Math.max(0, start - s);
  const half = Math.floor((max - (end - start)) / 2);
  let ws = Math.max(0, rel - half);
  let we = Math.min(e - s, ws + max);
  ws = Math.max(0, we - max);
  const raw = text.slice(s, e);
  while (ws > 0 && /\S/.test(raw[ws - 1]!)) ws++;
  while (we < raw.length && /\S/.test(raw[we]!)) we--;
  sentence = raw.slice(ws, we).trim().replace(/\s+/g, ' ');
  return (ws > 0 ? '… ' : '') + sentence + (we < raw.length ? ' …' : '');
}
