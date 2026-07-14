// Focused screenshot pass for the footer theme/language switcher variants.
// Crops the bottom-left of .app (Settings + Language + Theme + any open popover)
// so the variants are easy to compare. Writes to shots/switchers/.
// Run from repo root:  node design/app/shoot-switchers.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = pathToFileURL(path.join(dir, 'index.html')).href;
const out = path.join(dir, 'shots', 'switchers');
await mkdir(out, { recursive: true });

const shots = [];
for (const ui of ['a', 'b', 'c', 'd']) {
  shots.push({ name: `theme-${ui}-expanded`, state: { view: 'capture', theme: 'light', sidebar: 'expanded', themeui: ui, langui: 'l1', pop2: ui === 'a' ? 'theme' : '' } });
  shots.push({ name: `theme-${ui}-collapsed`, state: { view: 'capture', theme: 'light', sidebar: 'collapsed', themeui: ui, langui: 'l1', pop2: '' } });
}
for (const ui of ['l1', 'l2', 'l3']) {
  shots.push({ name: `lang-${ui}-expanded`, state: { view: 'capture', theme: 'light', sidebar: 'expanded', themeui: 'a', langui: ui, pop2: ui === 'l1' ? 'lang' : '' } });
  shots.push({ name: `lang-${ui}-collapsed`, state: { view: 'capture', theme: 'light', sidebar: 'collapsed', themeui: 'a', langui: ui, pop2: '' } });
}
// collapsed interaction demos: popover open next to the rail
shots.push({ name: 'theme-a-collapsed-open', wide: true, state: { view: 'capture', theme: 'light', sidebar: 'collapsed', themeui: 'a', langui: 'l1', pop2: 'theme' } });
shots.push({ name: 'lang-a-collapsed-open', wide: true, state: { view: 'capture', theme: 'light', sidebar: 'collapsed', themeui: 'a', langui: 'l1', pop2: 'lang' } });

const STABILIZE = '*{transition:none!important;animation:none!important;caret-color:transparent!important}';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1360, height: 920 } });
await page.goto(fileUrl, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: STABILIZE });
await page.evaluate(() => { const c = document.querySelector('.dock'); if (c) c.style.display = 'none'; });
await page.waitForTimeout(250);

const app = page.locator('.app');
for (const s of shots) {
  await page.evaluate((st) => window.__setState(st), s.state);
  await page.waitForTimeout(140);
  const box = await app.boundingBox();
  const collapsed = s.state.sidebar === 'collapsed';
  const width = s.wide ? 300 : collapsed ? 108 : 300;
  const height = 344;
  const clip = { x: box.x, y: box.y + box.height - height, width, height };
  await page.screenshot({ path: path.join(out, `${s.name}.png`), clip });
  console.log('  ✓', s.name);
}

await browser.close();
console.log(`\nDone — ${shots.length} switcher shots → ${out}`);
