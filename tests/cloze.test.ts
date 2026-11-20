import { describe, expect, it } from 'vitest';
import { makeCloze } from '../src/core/cloze';

describe('makeCloze', () => {
  it('hides the saved surface form', () => {
    expect(makeCloze('She was running late.', 'running', 'run')).toEqual({ before: 'She was ', answer: 'running', after: ' late.', found: true });
  });
  it('matches whole words only', () => {
    expect(makeCloze('A cathedral and a cat.', 'cat').before).toBe('A cathedral and a ');
  });
  it('falls back to the lemma stem', () => {
    expect(makeCloze('He studied hard.', 'studies', 'study').answer).toBe('studied');
  });
  it('reports not found', () => {
    expect(makeCloze('Nothing here.', 'zebra').found).toBe(false);
  });
});
