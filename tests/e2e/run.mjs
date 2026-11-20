// E2E: underlines, exclusions, dynamic content, badge, popup, per-site toggle.  node tests/e2e/run.mjs [outDir]
import { join } from 'node:path';
import { highlighted, launch, root } from './setup.mjs';

const outDir = process.argv[2] ?? join(root, '.output');
const { ctx, sw, extId, url, close } = await launch();
const check = (name, ok) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);

const page = await ctx.newPage();
await page.goto(url);
await page.waitForTimeout(3000); // includes the dynamically inserted paragraph (1.5 s)
const unknown = await highlighted(page);
console.log('  unknown:', unknown.join(', '));
for (const w of ['meticulous', 'ubiquitous', 'esoteric', 'quandary']) check(`"${w}" underlined`, unknown.includes(w));
for (const w of ['London', 'Smith', 'NASA', 'example', 'ephemeralValue', 'obfuscate', 'inscrutable', 'gardener', 'slowly'])
  check(`"${w}" not underlined (proper noun / URL / code / editable / known)`, !unknown.includes(w));
check('dynamically inserted text is analyzed', unknown.includes('peculiar'));

const tabId = await sw.evaluate(async () => (await chrome.tabs.query({})).find((x) => x.url?.startsWith('http://127.0.0.1')).id);
const stats = await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'getStats' }), tabId);
const badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
console.log(`  coverage ${stats.coverage}% (${stats.known}/${stats.total}), badge "${badge}"`);
check('badge shows floored coverage', badge === String(Math.floor(stats.coverage)));
await page.screenshot({ path: join(outDir, 'e2e-page.png') });

const popup = await ctx.newPage();
await popup.setViewportSize({ width: 340, height: 560 });
await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
await popup.waitForTimeout(800);
await popup.screenshot({ path: join(outDir, 'e2e-popup.png') });
check('popup shows coverage', (await popup.locator('.meter .num').innerText()) === stats.coverage.toFixed(1));

const first = (await popup.locator('.row .w').first().textContent()).trim();
await popup.locator('.row button', { hasText: '知ってる' }).first().click();
await page.waitForTimeout(800);
check(`popup "知ってる" removes "${first}" from the page`, !(await highlighted(page)).includes(first));

await popup.locator('.toggle input').click();
await page.waitForTimeout(800);
check('disabling the site clears highlights', !(await page.evaluate(() => CSS.highlights.has('eigo-unknown'))));
check('disabling the site clears the badge', (await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)) === '');
await popup.locator('.toggle input').click();
await page.waitForTimeout(1500);
check('re-enabling restores highlights', (await highlighted(page)).length === unknown.length - 1);
await close();
