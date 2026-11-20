/**
 * Content-side pipeline: segments → tokens → (background) classification →
 * highlights + statistics. Work is split into idle-time chunks.
 */
import { classifyKey, type Classified, type WordStatus } from '../core/classify';
import { computeStats, type PageStats } from '../core/stats';
import { isCandidate, tokenize } from '../core/tokenize';
import type { ClassifyItem, StatusUpdate } from '../messaging/protocol';
import { locate, type TextSegment } from '../sources/types';

export interface TokenRecord {
  lemma: string;
  surface: string;
  seg: TextSegment;
  /** offsets within seg.text */
  start: number;
  end: number;
  startNode: Text;
  startOffset: number;
  endNode: Text;
  endOffset: number;
  range: StaticRange | null;
}

export type ClassifyFn = (items: ClassifyItem[]) => Promise<Record<string, Classified>>;

const HIGHLIGHT_UNKNOWN = 'eigo-unknown';
const HIGHLIGHT_LEARNING = 'eigo-learning';
const CHUNK_BUDGET_MS = 8;

const idle = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 300 });
    else setTimeout(resolve, 16);
  });

export interface AnalyzerOptions {
  classify: ClassifyFn;
  onStats: (stats: PageStats) => void;
  showLearning: boolean;
}

export class Analyzer {
  private cache = new Map<string, Classified>();
  private lemmaStatus = new Map<string, WordStatus>();
  private counts = new Map<string, number>();
  private byLemma = new Map<string, Set<TokenRecord>>();
  private byNode = new Map<Text, TokenRecord[]>();
  private queue: TextSegment[] = [];
  private queueHead = 0;
  private running = false;
  private stopped = false;
  private statsTimer: ReturnType<typeof setTimeout> | null = null;
  private unknownHl: Highlight | null = null;
  private learningHl: Highlight | null = null;
  private showLearning: boolean;

  constructor(private readonly opts: AnalyzerOptions) {
    this.showLearning = opts.showLearning;
    if (typeof Highlight !== 'undefined' && CSS.highlights) {
      this.unknownHl = new Highlight();
      this.learningHl = new Highlight();
      CSS.highlights.set(HIGHLIGHT_UNKNOWN, this.unknownHl);
      CSS.highlights.set(HIGHLIGHT_LEARNING, this.learningHl);
    }
  }

  // ---- input ----------------------------------------------------------------

  enqueue(segments: TextSegment[]): void {
    if (this.stopped || segments.length === 0) return;
    this.queue.push(...segments);
    void this.run();
  }

  /** Forget tokens in text nodes that changed or were removed. */
  invalidate(nodes: Iterable<Text>): void {
    for (const n of nodes) {
      const recs = this.byNode.get(n);
      if (!recs) continue;
      for (const r of [...recs]) this.removeRecord(r);
    }
    this.scheduleStats();
  }

  /** Remove records whose text nodes left the document. */
  sweep(): void {
    const gone: Text[] = [];
    for (const n of this.byNode.keys()) if (!n.isConnected) gone.push(n);
    if (gone.length) this.invalidate(gone);
  }

  // ---- processing ------------------------------------------------------------

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.stopped && this.queueHead < this.queue.length) {
        await idle();
        if (this.stopped) break;
        const t0 = performance.now();
        const batch: { seg: TextSegment; tokens: ReturnType<typeof tokenize> }[] = [];
        while (this.queueHead < this.queue.length && performance.now() - t0 < CHUNK_BUDGET_MS) {
          const seg = this.queue[this.queueHead++]!;
          if (!seg.nodes.every((n) => n.isConnected)) continue;
          batch.push({ seg, tokens: tokenize(seg.text).filter(isCandidate) });
        }
        if (this.queueHead > 5000) {
          this.queue = this.queue.slice(this.queueHead);
          this.queueHead = 0;
        }

        const missing = new Map<string, ClassifyItem>();
        for (const { tokens } of batch) {
          for (const t of tokens) {
            const key = classifyKey(t.norm, t.cap === 'initial');
            if (!this.cache.has(key) && !missing.has(key)) missing.set(key, { key, norm: t.norm, capInitial: t.cap === 'initial' });
          }
        }
        if (missing.size) {
          const res = await this.opts.classify([...missing.values()]);
          if (this.stopped) break;
          for (const [key, c] of Object.entries(res)) {
            this.cache.set(key, c);
            if (c.status !== 'skip') this.lemmaStatus.set(c.lemma, c.status);
          }
        }

        for (const { seg, tokens } of batch) {
          for (const t of tokens) {
            const c = this.cache.get(classifyKey(t.norm, t.cap === 'initial'));
            if (!c || c.status === 'skip') continue;
            this.addRecord(seg, t.start, t.end, t.surface, c.lemma);
          }
        }
        this.scheduleStats();
      }
    } catch (e) {
      console.warn('[eigo] analysis failed', e);
    } finally {
      this.running = false;
    }
  }

  private addRecord(seg: TextSegment, start: number, end: number, surface: string, lemma: string): void {
    const s = locate(seg, start);
    const e = locate(seg, end, true);
    const rec: TokenRecord = {
      lemma, surface, seg, start, end,
      startNode: s.node, startOffset: s.offset, endNode: e.node, endOffset: e.offset,
      range: null,
    };
    let set = this.byLemma.get(lemma);
    if (!set) this.byLemma.set(lemma, (set = new Set()));
    set.add(rec);
    for (const n of rec.startNode === rec.endNode ? [rec.startNode] : this.nodesBetween(rec)) {
      const list = this.byNode.get(n);
      if (list) list.push(rec);
      else this.byNode.set(n, [rec]);
    }
    this.counts.set(lemma, (this.counts.get(lemma) ?? 0) + 1);
    this.applyHighlight(rec, this.lemmaStatus.get(lemma) ?? 'unknown');
  }

  private nodesBetween(rec: TokenRecord): Text[] {
    const i = rec.seg.nodes.indexOf(rec.startNode);
    const j = rec.seg.nodes.indexOf(rec.endNode);
    return rec.seg.nodes.slice(i, j + 1);
  }

  private removeRecord(rec: TokenRecord): void {
    this.setRange(rec, null);
    this.byLemma.get(rec.lemma)?.delete(rec);
    const n = (this.counts.get(rec.lemma) ?? 1) - 1;
    if (n > 0) this.counts.set(rec.lemma, n);
    else this.counts.delete(rec.lemma);
    for (const node of rec.startNode === rec.endNode ? [rec.startNode] : this.nodesBetween(rec)) {
      const list = this.byNode.get(node);
      if (!list) continue;
      const idx = list.indexOf(rec);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) this.byNode.delete(node);
    }
  }

  private setRange(rec: TokenRecord, target: Highlight | null): void {
    if (rec.range) {
      this.unknownHl?.delete(rec.range);
      this.learningHl?.delete(rec.range);
    }
    if (!target) return;
    rec.range ??= new StaticRange({
      startContainer: rec.startNode,
      startOffset: rec.startOffset,
      endContainer: rec.endNode,
      endOffset: rec.endOffset,
    });
    target.add(rec.range);
  }

  private applyHighlight(rec: TokenRecord, status: WordStatus): void {
    if (status === 'unknown') this.setRange(rec, this.unknownHl);
    else if (status === 'learning') this.setRange(rec, this.showLearning ? this.learningHl : this.unknownHl);
    else this.setRange(rec, null);
  }

  // ---- status updates ---------------------------------------------------------

  applyUpdates(updates: StatusUpdate[]): void {
    for (const { lemma, status } of updates) {
      this.lemmaStatus.set(lemma, status);
      for (const rec of this.byLemma.get(lemma) ?? []) this.applyHighlight(rec, status);
    }
    // Keep the classification cache consistent.
    const byLemma = new Map(updates.map((u) => [u.lemma, u.status]));
    for (const c of this.cache.values()) {
      const s = byLemma.get(c.lemma);
      if (s && c.status !== 'skip') c.status = s;
    }
    this.scheduleStats();
  }

  setShowLearning(show: boolean): void {
    if (show === this.showLearning) return;
    this.showLearning = show;
    for (const [lemma, recs] of this.byLemma) {
      if (this.lemmaStatus.get(lemma) !== 'learning') continue;
      for (const r of recs) this.applyHighlight(r, 'learning');
    }
  }

  // ---- queries ------------------------------------------------------------------

  /** The highlighted token at a DOM caret position, if any. */
  recordAt(node: Node, offset: number): TokenRecord | null {
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const recs = this.byNode.get(node as Text);
    if (!recs) return null;
    for (const r of recs) {
      if (!r.range) continue;
      const afterStart = node !== r.startNode || offset >= r.startOffset;
      const beforeEnd = node !== r.endNode || offset <= r.endOffset;
      if (afterStart && beforeEnd) return r;
    }
    return null;
  }

  statusOf(lemma: string): WordStatus {
    return this.lemmaStatus.get(lemma) ?? 'unknown';
  }

  stats(): PageStats {
    return computeStats(this.counts, (l) => this.statusOf(l));
  }

  private scheduleStats(): void {
    if (this.statsTimer) return;
    this.statsTimer = setTimeout(() => {
      this.statsTimer = null;
      if (!this.stopped) this.opts.onStats(this.stats());
    }, 300);
  }

  /** Remove all highlights and stop processing. */
  destroy(): void {
    this.stopped = true;
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.unknownHl?.clear();
    this.learningHl?.clear();
    CSS.highlights?.delete(HIGHLIGHT_UNKNOWN);
    CSS.highlights?.delete(HIGHLIGHT_LEARNING);
    this.byLemma.clear();
    this.byNode.clear();
    this.counts.clear();
  }
}

export const HIGHLIGHT_CSS = `
::highlight(${HIGHLIGHT_UNKNOWN}) {
  text-decoration: underline solid rgba(229, 57, 53, 0.85);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
::highlight(${HIGHLIGHT_LEARNING}) {
  text-decoration: underline dotted #1e88e5;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
`;
