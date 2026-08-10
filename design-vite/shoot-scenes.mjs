// Screenshot pass for the time-of-day theme popover (Chinese-landscape hover art).
// Captures the resting popover (neutral icons/labels), single-item hovers (one scene
// revealed), and an "all scenes on" overview — in a light and a dark theme to check
// the left panel-gradient keeps labels readable. Writes to shots/scenes/.
// Run from repo root:  node design-vite/shoot-scenes.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { startDesignPreview } from './tools/design-preview.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'shots', 'scenes');
await mkdir(out, { recursive: true });

const STABILIZE = '*{transition:none!important;animation:none!important;caret-color:transparent!important}';
const designPreview = await startDesignPreview(dir);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1360, height: 920 } });
await page.goto(designPreview.url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monacoReady === true, null, { timeout: 60_000 });
await page.addStyleTag({ content: STABILIZE });
await page.evaluate(() => { const c = document.querySelector('.dock'); if (c) c.style.display = 'none'; });

const pop = page.locator('.footpop.theme');

async function shoot(name, theme, { hover, all } = {}) {
  await page.evaluate(
    (t) => window.__setState({ view: 'capture', theme: t, sidebar: 'expanded', pop2: 'theme' }),
    theme,
  );
  await page.evaluate((on) => {
    let s = document.getElementById('__allart');
    if (on) {
      if (!s) { s = document.createElement('style'); s.id = '__allart'; document.head.appendChild(s); }
      s.textContent = '.footpop.theme .thi .art{opacity:1!important}';
    } else if (s) s.textContent = '';
  }, !!all);
  if (hover) await page.locator(`.footpop.theme .thi[data-themeset="${hover}"]`).hover();
  else await page.mouse.move(8, 8);
  await page.waitForTimeout(170);
  await pop.screenshot({ path: path.join(out, `${name}.png`) });
  console.log('  \u2713', name);
}

await shoot('rest-light', 'light');
await shoot('all-light', 'light', { all: true });
await shoot('all-dark', 'dark', { all: true });
await shoot('hover-warm', 'light', { hover: 'warm' });
await shoot('hover-light', 'light', { hover: 'light' });
await shoot('hover-ember', 'light', { hover: 'ember' });
await shoot('hover-dark', 'dark', { hover: 'dark' });

// full-app shot: popover docked to the right of the expanded sidebar
await page.evaluate(() => window.__setState({ view: 'capture', theme: 'light', sidebar: 'expanded', pop2: 'theme' }));
await page.evaluate(() => { const s = document.getElementById('__allart'); if (s) s.textContent = ''; });
await page.locator('.footpop.theme .thi[data-themeset="ember"]').hover();
await page.waitForTimeout(180);
await page.locator('.app').screenshot({ path: path.join(out, 'app-popover-right.png') });
console.log('  \u2713 app-popover-right');

await page.evaluate(() => window.__setState({ view: 'capture', theme: 'light', sidebar: 'collapsed', pop2: 'theme' }));
await page.locator('.footpop.theme .thi[data-themeset="ember"]').hover();
await page.waitForTimeout(180);
await page.locator('.app').screenshot({ path: path.join(out, 'app-popover-collapsed.png') });
console.log('  \u2713 app-popover-collapsed');

await browser.close();
await designPreview.close();
console.log(`\nDone \u2014 scenes \u2192 ${out}`);
