import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Analyzer, HIGHLIGHT_CSS, type TokenRecord } from '../../content/analyzer';
import { PopoverHost } from '../../content/popover';
import { extractSentence } from '../../core/sentence';
import { sendToBackground, type ContentMessage, type ContentStats } from '../../messaging/protocol';
import { PageDomSource } from '../../sources/page-dom';
import { getSettings, isSiteEnabled, watchSettings, type Settings } from '../../settings';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    if (!(document.documentElement instanceof HTMLElement)) return; // XML, SVG, …
    const hostname = location.hostname;
    let analyzer: Analyzer | null = null;
    let source: PageDomSource | null = null;
    let settings: Settings | null = null;
    let enabled = false;

    const style = document.createElement('style');
    style.textContent = HIGHLIGHT_CSS;

    const popover = new PopoverHost({
      known: (lemma) => sendToBackground('setStatus', { lemma, status: 'known' }),
      ignore: (lemma) => sendToBackground('setStatus', { lemma, status: 'ignored' }),
      save: async (data, meaning) => {
        await sendToBackground('saveCard', {
          card: {
            lemma: data.lemma,
            surface: data.surface,
            sentence: data.sentence,
            url: location.href,
            title: document.title,
            meaning,
          },
        });
      },
    });

    const onClick = (e: MouseEvent) => {
      if (!analyzer || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (popover.element && e.composedPath().includes(popover.element)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return; // user is selecting text
      const hit = wordAt(analyzer, e.clientX, e.clientY);
      if (!hit) return;
      // Inside links / interactive elements the page's own behaviour wins unless Alt is held.
      const interactive = (e.target as Element | null)?.closest?.(INTERACTIVE_SELECTOR);
      if (interactive && !e.altKey) return;
      if (interactive) {
        e.preventDefault();
        e.stopPropagation();
      }
      const { rec, rect } = hit;
      popover.open(
        {
          lemma: rec.lemma,
          surface: rec.surface,
          sentence: extractSentence(rec.seg.text, rec.start, rec.end),
          status: analyzer.statusOf(rec.lemma),
          lookup: sendToBackground('lookup', { surface: rec.surface, lemma: rec.lemma }),
        },
        rect,
      );
    };

    const start = () => {
      if (analyzer || !settings) return;
      (document.head ?? document.documentElement).appendChild(style);
      analyzer = new Analyzer({
        classify: (items) => sendToBackground('classify', { items }),
        onStats: (s) => void sendToBackground('pageStats', { coverage: s.coverage, level: s.level }).catch(() => {}),
        showLearning: settings.showLearning,
      });
      document.addEventListener('click', onClick, true);
      source = new PageDomSource(document);
      const a = analyzer;
      source.start(
        (segs) => {
          a.sweep();
          a.enqueue(segs);
        },
        (nodes) => a.invalidate(nodes),
      );
    };

    const stop = () => {
      document.removeEventListener('click', onClick, true);
      popover.destroy();
      source?.stop();
      analyzer?.destroy();
      source = null;
      analyzer = null;
      style.remove();
      void sendToBackground('pageStats', { coverage: null, level: 'none' }).catch(() => {});
    };

    const applySettings = (s: Settings) => {
      settings = s;
      // Nothing is underlined until the first-run setup registered the known words.
      const next = s.onboarded && isSiteEnabled(s, hostname);
      if (next && !enabled) start();
      if (!next && enabled) stop();
      enabled = next;
      analyzer?.setShowLearning(s.showLearning);
    };

    void getSettings().then(applySettings);
    const unwatch = watchSettings(applySettings);

    const onMessage = (msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
      const m = msg as ContentMessage;
      switch (m?.type) {
        case 'statusUpdates':
          analyzer?.applyUpdates(m.updates);
          return false;
        case 'rescan':
          if (enabled) {
            stop();
            start();
          }
          return false;
        case 'getStats': {
          const base = analyzer?.stats() ?? {
            total: 0, known: 0, unknown: 0, ignored: 0, distinct: 0, coverage: null, level: 'none' as const, topUnknown: [],
          };
          const res: ContentStats = { ...base, enabled, hostname };
          sendResponse(res);
          return false;
        }
      }
      return false;
    };
    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      unwatch();
      browser.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener('click', onClick, true);
      popover.destroy();
      source?.stop();
      analyzer?.destroy();
      style.remove();
    });
  },
});

const INTERACTIVE_SELECTOR = 'a[href], button, [role="button"], [role="link"], label, summary, [onclick]';

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = document.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** The underlined word under the pointer, with its on-screen rectangle. */
function wordAt(analyzer: Analyzer, x: number, y: number): { rec: TokenRecord; rect: DOMRect } | null {
  const pos = caretAt(x, y);
  if (!pos) return null;
  const rec = analyzer.recordAt(pos.node, pos.offset);
  if (!rec) return null;
  // caretPositionFromPoint snaps to the nearest character, so confirm the pointer is on the word.
  const range = document.createRange();
  range.setStart(rec.startNode, rec.startOffset);
  range.setEnd(rec.endNode, rec.endOffset);
  const pad = 2;
  for (const r of range.getClientRects()) {
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return { rec, rect: r };
  }
  return null;
}
