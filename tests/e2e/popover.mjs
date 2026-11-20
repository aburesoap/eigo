// E2E: click a word → popover → 保存 / 知ってる / 無視.  node tests/e2e/popover.mjs [outDir]
import { join } from 'node:path';
import { dbRows, highlighted, launch, pointOf, root } from './setup.mjs';

const outDir = process.argv[2] ?? join(root, '.output');
const { ctx, sw, url, close } = await launch();
const page = await ctx.newPage();
await page.goto(url);
await page.waitForTimeout(2500);
const check = (name, ok) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);

// 1) click → popover → screenshot → S (save)
let p = await pointOf(page, 'meticulous');
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, 'e2e-popover.png') });
await page.keyboard.press('s');
await page.waitForTimeout(1200);
const cards = await dbRows(sw, 'cards');
check('card saved with sentence/url/title/meaning', cards.length === 1 && cards[0].lemma === 'meticulous'
  && cards[0].sentence.startsWith("The gardener's meticulous habits") && cards[0].url === url && cards[0].title === 'eigo test page' && cards[0].meaning.length > 0);
console.log('  card:', JSON.stringify({ ...cards[0], srs: undefined, meaning: cards[0]?.meaning.slice(0, 30) }));
check('saved word moves to the learning highlight', (await highlighted(page, 'eigo-learning')).includes('meticulous'));

// 2) 知ってる (K) removes the underline immediately
p = await pointOf(page, 'perennial');
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
await page.keyboard.press('k');
await page.waitForTimeout(800);
check('known word is no longer underlined', !(await highlighted(page)).includes('perennial'));
check('known word stored', (await dbRows(sw, 'words')).some((w) => w.lemma === 'perennial' && w.status === 'known' && w.source === 'manual'));

// 3) plain click on a link word follows the link (no popover); Alt+click opens it
p = await pointOf(page, 'esoteric');
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
check('plain click on link navigates', page.url().endsWith('#x'));
await page.keyboard.press('i'); // no popover → nothing happens
await page.waitForTimeout(500);
check('no popover after plain link click', (await highlighted(page)).includes('esoteric'));
await page.keyboard.down('Alt');
await page.mouse.click(p.x, p.y);
await page.keyboard.up('Alt');
await page.waitForTimeout(300);
await page.keyboard.press('i');
await page.waitForTimeout(800);
check('Alt+click → 無視 removes underline', !(await highlighted(page)).includes('esoteric'));
const stats = await sw.evaluate(async () => {
  const t = (await chrome.tabs.query({})).find((x) => x.url?.startsWith('http://127.0.0.1'));
  return chrome.tabs.sendMessage(t.id, { type: 'getStats' });
});
check('ignored word excluded from coverage', stats.ignored === 1);

// 4) clicking blank space near a word does nothing
await page.mouse.click(880, 140);
await page.keyboard.press('k');
await page.waitForTimeout(500);
check('click on empty space opens nothing', (await dbRows(sw, 'words')).filter((w) => w.source === 'manual').length === 2);
await close();
