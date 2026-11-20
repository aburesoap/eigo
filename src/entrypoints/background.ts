import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { Engine } from '../background/engine';
import { badgeText, LEVEL_COLORS } from '../core/stats';
import { db } from '../db/schema';
import type { BgApi, BgMessage } from '../messaging/protocol';
import { getSettings } from '../settings';

const engine = new Engine();

type Handlers = {
  [K in keyof BgApi]: (req: BgApi[K]['req'], tabId: number | undefined) => Promise<BgApi[K]['res']> | BgApi[K]['res'];
};

const handlers: Handlers = {
  classify: ({ items }) => engine.classify(items),
  lookup: ({ surface, lemma }) => engine.lookup(surface, lemma),
  setStatus: ({ lemma, status }) => engine.setStatuses([lemma], status),
  saveCard: ({ card }) => engine.saveCard(card),
  pageStats: async ({ coverage, level }, tabId) => {
    if (tabId === undefined) return;
    await browser.action.setBadgeText({ tabId, text: badgeText(coverage) });
    await browser.action.setBadgeBackgroundColor({ tabId, color: LEVEL_COLORS[level] });
    await browser.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
  },
};

async function seedIfEmpty(): Promise<void> {
  const settings = await getSettings();
  if ((await db().words.count()) > 0 || settings.seedSize === 0) return;
  const lemmas = await engine.frequentLemmas(settings.seedSize);
  await engine.setStatuses(lemmas, 'known', 'seed');
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    const m = msg as BgMessage;
    const handler = handlers[m?.type] as ((req: unknown, tabId?: number) => unknown) | undefined;
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(m, sender.tab?.id))
      .then(
        (value) => sendResponse({ ok: true, value }),
        (err: unknown) => sendResponse({ ok: false, error: String((err as Error)?.message ?? err) }),
      );
    return true; // async response
  });

  browser.runtime.onInstalled.addListener(() => {
    void seedIfEmpty();
  });
});
