// Screenshot pipeline for the unified design SPA.
// Opens index.html once, drives it via window.__setState(), captures the .app element.
// Two passes: framed (1280x800 app state) and full (scroll areas expanded so nothing hides).
// Run from repo root:  node design/app/shoot.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = pathToFileURL(path.join(dir, 'index.html')).href;
const shotsRoot = path.join(dir, 'shots');

const FEATURES = ['capture', 'rules', 'composer', 'settings', 'breakpoints', 'diagnostics'];
const TOKEN = { light: 'light', dark: 'dark' }; // folder name -> data-theme token

// Every shot declares { feature, theme, variant, state, full? }.
// Output path is shots/<theme>/<feature>/<variant>.png so light and dark stay separated.
const shots = [];
for (const feature of FEATURES) {
  for (const theme of ['light', 'dark']) {
    const base = { view: feature, theme: TOKEN[theme], sidebar: 'expanded', overlay: '' };
    shots.push({ feature, theme, variant: 'framed', state: base });
    shots.push({ feature, theme, variant: 'full', full: true, state: base });
  }
}
for (const feature of ['capture', 'rules']) {
  for (const theme of ['light', 'dark']) {
    shots.push({ feature, theme, variant: 'collapsed', state: { view: feature, theme: TOKEN[theme], sidebar: 'collapsed', overlay: '' } });
  }
}
for (const theme of ['light', 'dark']) {
  for (const step of ['welcome', 'proxy', 'ca', 'ready']) {
    shots.push({ feature: 'first-run', theme, variant: step, state: { view: 'capture', theme: TOKEN[theme], overlay: 'first-run', step } });
  }
  shots.push({ feature: 'import-export', theme, variant: 'dialog', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export' } });
}
// capture inspector tabs (Headers is the framed default)
for (const theme of ['light', 'dark']) {
  for (const tab of ['request', 'response', 'timing', 'cookies', 'tls']) {
    shots.push({ feature: 'capture', theme, variant: `inspector-${tab}`, state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tab } });
  }
  shots.push({ feature: 'capture', theme, variant: 'inspector-websocket', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', scene: 'websocket', tab: 'messages' } });
}
// rules add-action popover
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'rules', theme, variant: 'add-action', state: { view: 'rules', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true } });
}

const STABILIZE = '*{transition:none!important;animation:none!important;caret-color:transparent!important}';
const FULL_CSS = `
.app{height:auto!important;min-height:800px!important}
.mainhost,.mv{overflow:visible!important}
.listwrap,.rlist,.reditor,.insp,.scroll,.edscroll,.cbuild,.cresp,.htab,.jsonv,
.snav,.scontent,.bqueue,.beditor,.bscroll,.dlist,.ddetail,.dscroll{overflow:visible!important;max-height:none!important}
`;

// Regenerate cleanly so renamed/removed shots never linger.
await rm(shotsRoot, { recursive: true, force: true });
await mkdir(shotsRoot, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1360, height: 920 } });
await page.goto(fileUrl, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: STABILIZE });
await page.evaluate(() => { const c = document.querySelector('.dock'); if (c) c.style.display = 'none'; });
await page.waitForTimeout(250);

const app = page.locator('.app');
async function shoot(list) {
  for (const s of list) {
    await page.evaluate((st) => window.__setState(st), s.state);
    await page.waitForTimeout(140);
    const dest = path.join(shotsRoot, s.theme, s.feature);
    await mkdir(dest, { recursive: true });
    await app.screenshot({ path: path.join(dest, `${s.variant}.png`) });
    console.log('  ✓', `${s.theme}/${s.feature}/${s.variant}`);
  }
}

const framedShots = shots.filter((s) => !s.full);
const fullShots = shots.filter((s) => s.full);

console.log('framed:');
await shoot(framedShots);
console.log('full-content:');
await page.addStyleTag({ content: FULL_CSS });
await shoot(fullShots);

await browser.close();
console.log(`\nDone — ${shots.length} shots → ${shotsRoot}`);
