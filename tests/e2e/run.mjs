// Manual E2E smoke test: node tests/e2e/run.mjs [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const ext = join(root, '.output/chrome-mv3');
const outDir = process.argv[2] ?? join(root, '.output');
const html = readFileSync(join(import.meta.dirname, 'fixture.html'));
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
await new Promise((r) => setTimeout(r, 1500)); // seeding on install

const page = await ctx.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(url);
await page.waitForTimeout(3500);

const hl = await page.evaluate(() => {
  const words = (name) => [...(CSS.highlights.get(name) ?? [])].map((r) => {
    const rr = document.createRange(); rr.setStart(r.startContainer, r.startOffset); rr.setEnd(r.endContainer, r.endOffset); return rr.toString();
  });
  return { unknown: words('eigo-unknown'), learning: words('eigo-learning') };
});
console.log('unknown:', hl.unknown.join(', '));
const badge = await sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
  const tabs = await chrome.tabs.query({});
  const t = tabs.find((x) => x.url?.startsWith('http://127.0.0.1'));
  return chrome.action.getBadgeText({ tabId: t.id });
});
console.log('badge:', badge);
await page.screenshot({ path: join(outDir, 'e2e-page.png') });

// popup: open as a page, pointing at the test tab is not possible directly; check stats via content message
const stats = await sw.evaluate(async () => {
  const t = (await chrome.tabs.query({})).find((x) => x.url?.startsWith('http://127.0.0.1'));
  return chrome.tabs.sendMessage(t.id, { type: 'getStats' });
});
console.log('stats:', JSON.stringify({ ...stats, topUnknown: stats.topUnknown.map((u) => `${u.lemma}:${u.count}`) }));

const popup = await ctx.newPage();
await popup.setViewportSize({ width: 340, height: 520 });
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({})).find((x) => x.url?.startsWith('http://127.0.0.1')).id);
await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
await popup.waitForTimeout(800);
await popup.screenshot({ path: join(outDir, 'e2e-popup.png') });

// "知ってる" on the first unknown word in the popup removes its underline on the page
const first = (await popup.locator('.row .w').first().textContent()).trim();
await popup.locator('.row button', { hasText: '知ってる' }).first().click();
await page.waitForTimeout(800);
const after = await page.evaluate(() => [...CSS.highlights.get('eigo-unknown')].length);
console.log(`marked "${first}" known → unknown ranges: ${hl.unknown.length} → ${after}`);

// toggle site off → highlights and badge cleared
await popup.locator('.toggle input').click();
await page.waitForTimeout(800);
const off = await page.evaluate(() => CSS.highlights.has('eigo-unknown'));
const badgeOff = await sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
console.log('after disabling site: highlight registered =', off, ', badge =', JSON.stringify(badgeOff));
await popup.locator('.toggle input').click();
await page.waitForTimeout(1500);
console.log('re-enabled: ranges =', await page.evaluate(() => [...(CSS.highlights.get('eigo-unknown') ?? [])].length));

globalThis.__ctx = { ctx, page, sw, extId, url };
if (!process.env.KEEP) { await ctx.close(); server.close(); }
