/**
 * Cloze (fill-in-the-blank) generation for review cards.
 */

export interface Cloze {
  before: string;
  answer: string;
  after: string;
  /** false when the word could not be located in the sentence. */
  found: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Hide the target word in the sentence. Tries the saved surface form first,
 * then any word starting with the lemma stem (e.g. lemma "run" → "running").
 */
export function makeCloze(sentence: string, surface: string, lemma?: string): Cloze {
  const tries: RegExp[] = [];
  if (surface) tries.push(new RegExp(`(?<![A-Za-z])${escapeRe(surface)}(?![A-Za-z])`, 'i'));
  if (lemma) {
    const stem = lemma.length > 4 ? lemma.slice(0, -1) : lemma;
    tries.push(new RegExp(`(?<![A-Za-z])${escapeRe(stem)}[A-Za-z'’]*`, 'i'));
  }
  for (const re of tries) {
    const m = re.exec(sentence);
    if (m) {
      return {
        before: sentence.slice(0, m.index),
        answer: m[0],
        after: sentence.slice(m.index + m[0].length),
        found: true,
      };
    }
  }
  return { before: sentence, answer: surface, after: '', found: false };
}

/** Blank shown on the card front: keeps the first letter as an optional hint. */
export function blankFor(answer: string, hint: boolean): string {
  const len = Math.max(3, answer.length);
  return hint ? answer[0] + '＿'.repeat(len - 1) : '＿'.repeat(len);
}
