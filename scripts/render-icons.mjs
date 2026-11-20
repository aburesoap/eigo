// Renders scripts/icon.svg to public/icon/{16,32,48,128}.png (uses the preinstalled Playwright).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(import.meta.dirname, '..');
const svg = readFileSync(join(root, 'scripts/icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, `public/icon/${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
