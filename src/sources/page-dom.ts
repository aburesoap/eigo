/**
 * TextSource for ordinary web pages: walks the DOM, groups text nodes into
 * segments and watches for dynamically added content.
 */
import type { TextSegment, TextSource } from './types';

const EXCLUDED_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BUTTON',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'SVG', 'MATH', 'IFRAME', 'CANVAS', 'TEMPLATE',
  'HEAD', 'TITLE', 'AUDIO', 'VIDEO', 'OBJECT', 'EMBED',
]);

const INLINE_TAGS = new Set([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'DATA', 'DFN', 'EM', 'FONT', 'I', 'IMG',
  'INS', 'DEL', 'LABEL', 'MARK', 'Q', 'RUBY', 'RB', 'RT', 'RP', 'S', 'SMALL', 'SPAN', 'STRIKE',
  'STRONG', 'SUB', 'SUP', 'TIME', 'TT', 'U', 'WBR', 'BIG', 'NOBR',
]);

/** Attribute marking the extension's own UI hosts. */
export const OWN_UI_ATTR = 'data-eigo-ui';

const LETTER_RE = /[A-Za-z]/;
const WS_CONTROL_RE = /[\n\r\t\f]/g;

function isExcludedElement(el: Element): boolean {
  if (EXCLUDED_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.hasAttribute(OWN_UI_ATTR)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if ((el as HTMLElement).hidden) return true;
  if (el.getAttribute('translate') === 'no') return true;
  return false;
}

/** True if the node is inside an excluded element (used for nodes added later). */
export function isInExcludedSubtree(node: Node): boolean {
  for (let el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement; el; el = el.parentElement) {
    if (isExcludedElement(el)) return true;
  }
  return false;
}

function blockAncestor(node: Node, cache: Map<Element, Element>): Element | null {
  const start = node.parentElement;
  if (!start) return null;
  const hit = cache.get(start);
  if (hit) return hit;
  let el: Element | null = start;
  while (el && INLINE_TAGS.has(el.tagName.toUpperCase()) && el.parentElement) el = el.parentElement;
  const result = el ?? start;
  cache.set(start, result);
  return result;
}

/**
 * Collect text segments under `root`, skipping text nodes for which `skip` returns true.
 */
export function collectSegments(root: Node, skip: (t: Text) => boolean = () => false): TextSegment[] {
  const segments: TextSegment[] = [];
  const blockCache = new Map<Element, Element>();
  let cur: TextSegment | null = null;
  let curBlock: Element | null = null;

  const flush = () => {
    if (cur && LETTER_RE.test(cur.text)) segments.push(cur);
    cur = null;
    curBlock = null;
  };

  const addText = (t: Text) => {
    if (skip(t)) {
      flush();
      return;
    }
    const block = blockAncestor(t, blockCache);
    if (!cur || block !== curBlock) {
      flush();
      cur = { text: '', nodes: [], starts: [] };
      curBlock = block;
    }
    cur.starts.push(cur.text.length);
    cur.nodes.push(t);
    cur.text += (t.data ?? '').replace(WS_CONTROL_RE, ' ');
  };

  if (root.nodeType === Node.TEXT_NODE) {
    if (!isInExcludedSubtree(root)) addText(root as Text);
    flush();
    return segments;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return segments;
  if (root.nodeType === Node.ELEMENT_NODE && isInExcludedSubtree(root)) return segments;

  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && isExcludedElement(node as Element)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) addText(n as Text);
    else {
      const tag = (n as Element).tagName.toUpperCase();
      if (tag === 'BR' || !INLINE_TAGS.has(tag)) flush();
    }
  }
  flush();
  return segments;
}

export interface PageDomSourceOptions {
  /** Debounce for MutationObserver batches (ms). */
  debounceMs?: number;
}

export class PageDomSource implements TextSource {
  readonly id = 'page-dom';
  private observer: MutationObserver | null = null;
  private pending = new Set<Node>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processed = new WeakSet<Text>();

  constructor(
    private readonly doc: Document,
    private readonly opts: PageDomSourceOptions = {},
  ) {}

  start(emit: (segments: TextSegment[]) => void, onInvalidate: (nodes: Text[]) => void): void {
    const skip = (t: Text) => this.processed.has(t);
    const mark = (segs: TextSegment[]) => {
      for (const s of segs) for (const n of s.nodes) this.processed.add(n);
      return segs;
    };
    emit(mark(collectSegments(this.doc.body ?? this.doc.documentElement, skip)));

    const flush = () => {
      this.timer = null;
      const roots = [...this.pending].filter((n) => n.isConnected);
      this.pending.clear();
      // Drop roots contained in other pending roots.
      const top = roots.filter((n) => !roots.some((o) => o !== n && o.contains(n)));
      const segs: TextSegment[] = [];
      for (const r of top) segs.push(...collectSegments(r, skip));
      if (segs.length) emit(mark(segs));
    };

    this.observer = new MutationObserver((records) => {
      const changedText: Text[] = [];
      for (const r of records) {
        if (r.type === 'characterData') {
          const t = r.target as Text;
          if (this.processed.has(t)) {
            this.processed.delete(t);
            changedText.push(t);
          }
          this.pending.add(t);
        } else {
          for (const n of r.addedNodes) {
            if (n.nodeType === Node.ELEMENT_NODE && (n as Element).hasAttribute(OWN_UI_ATTR)) continue;
            this.pending.add(n);
          }
        }
      }
      if (changedText.length) onInvalidate(changedText);
      if (this.pending.size && !this.timer) this.timer = setTimeout(flush, this.opts.debounceMs ?? 500);
    });
    this.observer.observe(this.doc.body ?? this.doc.documentElement, { childList: true, subtree: true, characterData: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    this.processed = new WeakSet();
  }
}
