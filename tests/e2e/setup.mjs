// Shared helpers for the manual E2E smoke tests (Chromium + built extension).
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
export const root = resolve(import.meta.dirname, '../..');

export async function launch({ fixture = 'fixture.html', onboard = true } = {}) {
  const ext = join(root, '.output/chrome-mv3');
  const html = readFileSync(join(import.meta.dirname, fixture));
  const server = http.createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end(html); }).listen(0);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const ctx = await chromium.launchPersistentContext('', {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    viewport: { width: 900, height: 900 },
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  // First run: the setup page opens automatically; complete it with the default (5000 words).
  const deadline = Date.now() + 10_000;
  let setup;
  while (!(setup = ctx.pages().find((p) => p.url().includes('/options.html'))) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  if (!setup) throw new Error('setup page did not open');
  if (onboard) {
    await setup.locator('button', { hasText: 'この設定で始める' }).click();
    await setup.locator('.stats').waitFor();
    await setup.close();
  }
  const close = async () => { await ctx.close(); server.close(); };
  return { ctx, sw, extId, url, close, setup };
}

/** Words currently in a highlight. */
export function highlighted(page, name = 'eigo-unknown') {
  return page.evaluate((name) => [...(CSS.highlights.get(name) ?? [])].map((r) => {
    const rr = document.createRange(); rr.setStart(r.startContainer, r.startOffset); rr.setEnd(r.endContainer, r.endOffset); return rr.toString();
  }), name);
}

/** Center point of the first highlighted occurrence of `word`. */
export function pointOf(page, word) {
  return page.evaluate((word) => {
    for (const name of ['eigo-unknown', 'eigo-learning']) {
      for (const r of CSS.highlights.get(name) ?? []) {
        const rr = document.createRange(); rr.setStart(r.startContainer, r.startOffset); rr.setEnd(r.endContainer, r.endOffset);
        if (rr.toString() === word) { const b = rr.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
      }
    }
    return null;
  }, word);
}

/** Read all rows of an object store of the extension DB (from the service worker). */
export function dbRows(sw, store) {
  return sw.evaluate((store) => new Promise((resolve, reject) => {
    const req = indexedDB.open('eigo');
    req.onsuccess = () => {
      const all = req.result.transaction(store).objectStore(store).getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  }), store);
}
