/**
 * Helpers for EJDict-hand meanings.
 * Senses are separated by " / "; 『…』 marks the main translations.
 */

export interface MeaningPart {
  text: string;
  /** Text was wrapped in 『』 (a key translation). */
  key: boolean;
}

export function splitSenses(meaning: string, max = Infinity): string[] {
  return meaning
    .split(' / ')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function parseSense(sense: string): MeaningPart[] {
  const parts: MeaningPart[] = [];
  const re = /『([^』]*)』/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sense))) {
    if (m.index > last) parts.push({ text: sense.slice(last, m.index), key: false });
    parts.push({ text: m[1]!, key: true });
    last = m.index + m[0].length;
  }
  if (last < sense.length) parts.push({ text: sense.slice(last), key: false });
  return parts;
}

/** Plain text without markers, for compact display. */
export function plainMeaning(meaning: string, maxSenses = 3): string {
  return splitSenses(meaning, maxSenses)
    .map((s) => s.replace(/[『』]/g, ''))
    .join(' / ');
}
