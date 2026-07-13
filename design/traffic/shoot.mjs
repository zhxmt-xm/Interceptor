// Renders mockup.html and exports one PNG per UI state into ./shots/.
// Usage: node design/traffic/shoot.mjs
// Requires @playwright/test (already a devDependency) + system Edge/Chrome.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const mockupUrl = 'file://' + path.join(dir, 'mockup.html').replace(/\\/g, '/');
const shotsDir = path.join(dir, 'shots');
await mkdir(shotsDir, { recursive: true });

// One entry per state worth capturing. `side`/`theme` map to the mockup's
// toggles; `pop` opens the filter popover; `hover` hovers a selector.
const shots = [
  { name: 'light-expanded', side: 'expanded', theme: 'light' },
  { name: 'light-collapsed', side: 'collapsed', theme: 'light' },
  { name: 'dark-expanded', side: 'expanded', theme: 'cool' },
  { name: 'dark-collapsed', side: 'collapsed', theme: 'cool' },
  { name: 'light-filter', side: 'expanded', theme: 'light', pop: true },
  { name: 'light-split', side: 'expanded', theme: 'light', hover: '.split' },
];

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({
  viewport: { width: 1360, height: 1000 },
  deviceScaleFactor: 2,
});
await page.goto(mockupUrl, { waitUntil: 'networkidle' });
// Static export: kill transitions, left-align the frame, hide dev-only chrome
// so element screenshots stay stable and capture the full (viewport-exceeding) app.
await page.addStyleTag({
  content:
    '*{transition:none!important;animation:none!important} body{align-items:flex-start!important;padding:0!important} .controls,.caption{display:none!important}',
});
await page.evaluate(() => document.fonts.ready);

const app = page.locator('.app');
for (const s of shots) {
  await page.evaluate((s) => {
    const a = document.querySelector('.app');
    a.classList.remove('expanded', 'collapsed');
    a.classList.add(s.side);
    a.setAttribute('data-theme', s.theme);
    a.classList.toggle('showpop', !!s.pop);
  }, s);
  if (s.hover) await page.hover(s.hover);
  await page.waitForTimeout(250);
  await app.screenshot({ path: path.join(shotsDir, `${s.name}.png`) });
  console.log('shot', s.name);
}

await browser.close();
console.log('done ->', shotsDir);
