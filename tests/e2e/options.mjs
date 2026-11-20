// E2E: first-run setup, settings, export / import, word list import.  node tests/e2e/options.mjs [outDir]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dbRows, highlighted, launch, root } from './setup.mjs';

const outDir = process.argv[2] ?? join(root, '.output');
const { ctx, sw, extId, url, close, setup } = await launch({ onboard: false });
const check = (name, ok) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);

// before setup: nothing is underlined
const page = await ctx.newPage();
await page.goto(url);
await page.waitForTimeout(1500);
check('no underlines before setup', (await highlighted(page)).length === 0);

await setup.setViewportSize({ width: 820, height: 900 });
await setup.screenshot({ path: join(outDir, 'e2e-setup.png'), fullPage: true });
await setup.locator('label.choice', { hasText: '3,000' }).click();
await setup.locator('button', { hasText: 'この設定で始める' }).click();
await setup.locator('.stats').waitFor();
await setup.waitForTimeout(500);
const known = (await dbRows(sw, 'words')).filter((w) => w.source === 'seed').length;
check(`seeded top 3000 (${known})`, known === 3000);
await page.waitForTimeout(1500);
check('page gets underlined after setup', (await highlighted(page)).length > 0);

// settings persist
await setup.locator('.field', { hasText: '新規カードの上限' }).locator('input').fill('7');
await setup.locator('.field', { hasText: '新規カードの上限' }).locator('input').blur();
await setup.waitForTimeout(300);
const s = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
check('setting saved', s.dailyNewLimit === 7 && s.seedSize === 3000 && s.onboarded === true);

// word list import (lemmatized)
await setup.fill('textarea.wordlist', '# test\nmeticulous\nquandaries\n123\n');
await setup.locator('button', { hasText: '取り込む' }).click();
await setup.waitForTimeout(800);
const words = await dbRows(sw, 'words');
check('word list imported and lemmatized', words.some((w) => w.lemma === 'meticulous' && w.source === 'import') && words.some((w) => w.lemma === 'quandary'));
check('import message shown', /2 語を既知語に追加/.test(await setup.locator('p.ok').innerText()));
await page.waitForTimeout(500);
const hl = await highlighted(page);
check('imported words no longer underlined', !hl.includes('meticulous') && !hl.includes('quandary'));
await setup.screenshot({ path: join(outDir, 'e2e-options.png'), fullPage: true });

// export
const [dl] = await Promise.all([setup.waitForEvent('download'), setup.locator('button', { hasText: 'JSON をエクスポート' }).click()]);
const file = join(outDir, 'backup.json');
await dl.saveAs(file);
const backup = JSON.parse(readFileSync(file, 'utf8'));
check('export contains words and settings', backup.format === 'eigo-backup' && backup.words.length === 3002 && backup.settings.dailyNewLimit === 7);

// reset, then replace-import restores everything
setup.on('dialog', (d) => d.accept());
await setup.locator('button', { hasText: 'すべてのデータを削除' }).click();
await setup.waitForTimeout(1000);
check('reset cleared data and shows setup again', (await dbRows(sw, 'words')).length === 0 && (await setup.locator('button', { hasText: 'この設定で始める' }).count()) === 1);
await setup.locator('input[name=mode]').nth(1).check();
await setup.locator('input[type=file][accept*=json]').setInputFiles(file);
await setup.waitForTimeout(1500);
const restored = await dbRows(sw, 'words');
const s2 = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
check('replace import restored words and settings', restored.length === 3002 && s2.dailyNewLimit === 7 && s2.onboarded);

// merge: a newer entry in the file wins, an older one does not
backup.words = [
  { lemma: 'meticulous', status: 'ignored', source: 'manual', updatedAt: Date.now() + 1000 },
  { lemma: 'quandary', status: 'ignored', source: 'manual', updatedAt: 1 },
];
backup.cards = []; backup.reviews = [];
writeFileSync(file, JSON.stringify(backup));
await setup.reload();
await setup.locator('input[name=mode]').first().check();
await setup.locator('input[type=file][accept*=json]').setInputFiles(file);
await setup.waitForTimeout(1200);
const merged = await dbRows(sw, 'words');
check('merge keeps newest', merged.find((w) => w.lemma === 'meticulous').status === 'ignored' && merged.find((w) => w.lemma === 'quandary').status === 'known');

// invalid file
writeFileSync(file, '{"hello": 1}');
await setup.locator('input[type=file][accept*=json]').setInputFiles(file);
await setup.waitForTimeout(500);
check('invalid file rejected with message', /バックアップファイルではありません/.test(await setup.locator('p.error').innerText()));
await close();
