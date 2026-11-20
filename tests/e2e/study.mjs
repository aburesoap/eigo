// E2E: study page — cloze review, FSRS rating, promotion, card list.  node tests/e2e/study.mjs [outDir]
import { join } from 'node:path';
import { dbRows, highlighted, launch, pointOf, root } from './setup.mjs';

const outDir = process.argv[2] ?? join(root, '.output');
const { ctx, sw, extId, url, close } = await launch();
const check = (name, ok) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
const page = await ctx.newPage();
await page.goto(url);
await page.waitForTimeout(2500);
for (const w of ['meticulous', 'perseverance', 'quandary']) {
  const p = await pointOf(page, w);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
}
check('3 cards saved', (await dbRows(sw, 'cards')).length === 3);

// promote after a single Good, to test promotion quickly
await sw.evaluate(async () => {
  const cur = (await chrome.storage.local.get('settings')).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, promoteAfter: 1, dailyNewLimit: 2 } });
});

const study = await ctx.newPage();
await study.setViewportSize({ width: 820, height: 760 });
await study.goto(`chrome-extension://${extId}/study.html`);
await study.waitForTimeout(800);
const counts = await study.locator('.counts').innerText();
check('new-card daily limit applied (2 of 3)', /新規\s*2/.test(counts));
const front = await study.locator('.cloze').innerText();
check('front hides the word', front.includes("The gardener's") && !/meticulous/.test(front) && (await study.locator('.blank').count()) === 1);
await study.screenshot({ path: join(outDir, 'e2e-study-front.png') });
await study.keyboard.press(' ');
await study.waitForTimeout(200);
await study.screenshot({ path: join(outDir, 'e2e-study-back.png') });
const back = await study.locator('.card').innerText();
check('back shows lemma, meaning and source', back.includes('meticulous') && back.includes('出典') && back.includes('eigo test page'));
await study.keyboard.press('3'); // Good → streak 1 → promoted
await study.waitForTimeout(800);
const cards = await dbRows(sw, 'cards');
const met = cards.find((c) => c.lemma === 'meticulous');
check('Good review recorded with FSRS state', met.srs.reps === 1 && met.streak === 1 && (await dbRows(sw, 'reviews')).length === 1);
check('card promoted to known list', met.promoted && (await dbRows(sw, 'words')).some((w) => w.lemma === 'meticulous' && w.source === 'promoted'));
await page.waitForTimeout(300);
check('promoted word no longer underlined on the page', !(await highlighted(page, 'eigo-learning')).includes('meticulous') && !(await highlighted(page)).includes('meticulous'));

// Again keeps the card in learning
await study.keyboard.press(' ');
await study.keyboard.press('1');
await study.waitForTimeout(600);
const again = (await dbRows(sw, 'cards')).find((c) => c.lemma === 'perseverance');
check('Again → learning state, streak 0, not promoted', again.srs.state === 1 && again.streak === 0 && !again.promoted);
const after = await study.locator('.counts').innerText();
check('new count decreased to 0 after 2 new cards', /新規\s*0/.test(after));

// card list: search, edit, delete
await study.goto(`chrome-extension://${extId}/study.html#cards`);
await study.waitForTimeout(600);
check('list shows all cards', (await study.locator('tbody tr').count()) === 3);
await study.fill('input[type=search]', 'quand');
check('search filters', (await study.locator('tbody tr').count()) === 1);
await study.screenshot({ path: join(outDir, 'e2e-study-list.png') });
await study.locator('tbody tr button', { hasText: '編集' }).click();
await study.fill('dialog textarea >> nth=1', 'カスタムの意味');
await study.locator('dialog button[type=submit]').click();
await study.waitForTimeout(500);
check('edit saved', (await dbRows(sw, 'cards')).find((c) => c.lemma === 'quandary').meaning === 'カスタムの意味');
study.once('dialog', (d) => d.accept());
await study.locator('tbody tr button', { hasText: '削除' }).click();
await study.waitForTimeout(600);
check('delete removed the card', !(await dbRows(sw, 'cards')).some((c) => c.lemma === 'quandary'));
await page.waitForTimeout(300);
check('deleted word back to normal underline on the page', (await highlighted(page)).includes('quandary'));
await close();
