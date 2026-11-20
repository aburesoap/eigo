/**
 * Text sources feed text into the analysis pipeline
 * (tokenize → classify → highlight → stats).
 *
 * Phase 1 only has PageDomSource. A future YouTube caption source can emit
 * segments for caption elements through the same interface.
 */

/** A run of adjacent text nodes that read as continuous text (one block, no <br>). */
export interface TextSegment {
  /** Concatenated text; newlines/tabs are replaced by spaces (same length). */
  text: string;
  nodes: Text[];
  /** Start offset of each node within `text`. */
  starts: number[];
}

export interface TextSource {
  readonly id: string;
  /** Begin emitting segments (initial content and later changes). */
  start(emit: (segments: TextSegment[]) => void, onInvalidate: (nodes: Text[]) => void): void;
  stop(): void;
}

/** Map an offset in segment text to (node, offset). Binary search over `starts`. */
export function locate(seg: TextSegment, offset: number, preferEnd = false): { node: Text; offset: number } {
  let lo = 0;
  let hi = seg.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const s = seg.starts[mid]!;
    if (s < offset || (!preferEnd && s === offset)) lo = mid;
    else hi = mid - 1;
  }
  return { node: seg.nodes[lo]!, offset: offset - seg.starts[lo]! };
}
