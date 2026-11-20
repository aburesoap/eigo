import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Analyzer, HIGHLIGHT_CSS } from '../../content/analyzer';
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

    const start = () => {
      if (analyzer || !settings) return;
      (document.head ?? document.documentElement).appendChild(style);
      analyzer = new Analyzer({
        classify: (items) => sendToBackground('classify', { items }),
        onStats: (s) => void sendToBackground('pageStats', { coverage: s.coverage, level: s.level }).catch(() => {}),
        showLearning: settings.showLearning,
      });
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
      source?.stop();
      analyzer?.destroy();
      source = null;
      analyzer = null;
      style.remove();
      void sendToBackground('pageStats', { coverage: null, level: 'none' }).catch(() => {});
    };

    const applySettings = (s: Settings) => {
      settings = s;
      const next = isSiteEnabled(s, hostname);
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
      source?.stop();
      analyzer?.destroy();
      style.remove();
    });
  },
});
