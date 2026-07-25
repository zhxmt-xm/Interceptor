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
const onlyFeature = process.argv
  .find((argument) => argument.startsWith('--feature='))
  ?.split('=')[1];

// Every shot declares { feature, theme, variant, state, full? }.
// Output path is shots/<theme>/<feature>/<variant>.png so light and dark stay separated.
const shots = [];
for (const feature of FEATURES) {
  for (const theme of ['light', 'dark']) {
    const base = { view: feature, theme: TOKEN[theme], sidebar: 'expanded', overlay: '', ...(feature === 'settings' ? { settings: 'certificates', repair: 'idle' } : {}) };
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
  shots.push({ feature: 'capture', theme, variant: 'import-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', fileMenu: 'import' } });
  shots.push({ feature: 'capture', theme, variant: 'export-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', fileMenu: 'export' } });
  shots.push({ feature: 'import-export', theme, variant: 'export-har', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'har-export' } });
  shots.push({ feature: 'import-export', theme, variant: 'import-har', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'har-import' } });
  shots.push({ feature: 'import-export', theme, variant: 'save-capture', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'archive-export' } });
  shots.push({ feature: 'import-export', theme, variant: 'open-capture', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'archive-import' } });
  shots.push({ feature: 'https-setup', theme, variant: 'dialog', state: { view: 'capture', theme: TOKEN[theme], overlay: 'https-setup', scene: 'tunnel', tab: 'tunnel' } });
  shots.push({ feature: 'https-setup', theme, variant: 'ready', state: { view: 'capture', theme: TOKEN[theme], overlay: 'https-setup', scene: 'tunnel', tab: 'tunnel', https: 'ready' } });
  shots.push({ feature: 'proxy-not-ready', theme, variant: 'dialog', state: { view: 'capture', theme: TOKEN[theme], overlay: 'proxy-not-ready' } });
  shots.push({ feature: 'settings', theme, variant: 'proxy', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'proxy', repair: 'idle' } });
  shots.push({ feature: 'settings', theme, variant: 'proxy-repair', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'proxy', repair: 'confirm' } });
  for (const update of ['checking', 'available', 'downloading', 'downloaded', 'up-to-date', 'failed', 'unsupported']) {
    shots.push({ feature: 'settings', theme, variant: `updates-${update}`, state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'updates', update } });
  }
}
// capture inspector tabs (Headers is the framed default)
for (const theme of ['light', 'dark']) {
  for (const tab of ['request', 'response', 'timing', 'cookies', 'tls']) {
    shots.push({ feature: 'capture', theme, variant: `inspector-${tab}`, state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tab } });
  }
  shots.push({ feature: 'capture', theme, variant: 'inspector-copy-actions', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tab: 'headers', copy: 'error' } });
  shots.push({ feature: 'capture', theme, variant: 'request-rule-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tab: 'headers', requestMenu: 'open' } });
  shots.push({ feature: 'capture', theme, variant: 'rule-filter', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tab: 'headers', ruleFilter: 'rule-stub' } });
    shots.push({ feature: 'capture', theme, variant: 'rule-filter-disabled', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true, ruleOptions: 'empty' } });
  shots.push({ feature: 'capture', theme, variant: 'body-preview-limited', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tab: 'response', bodyPreview: 'limited' } });
  shots.push({ feature: 'capture', theme, variant: 'body-media-save', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tab: 'response', bodyPreview: 'media' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-websocket', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', scene: 'websocket', tab: 'messages' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-grpc', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', scene: 'grpc', tab: 'grpc' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-tunnel', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', scene: 'tunnel', tab: 'tunnel' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-tunnel-mitm-active', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', scene: 'tunnel', tab: 'tunnel', mitm: 'active' } });
}
// rules add-action popover
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'rules', theme, variant: 'add-action', state: { view: 'rules', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true } });
  shots.push({ feature: 'rules', theme, variant: 'select-dropdown', state: { view: 'rules', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', ruleSelect: 'open' } });
}
// capture add-filter popover + right-flyout multi-select cascade
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'add-filter', theme, variant: 'menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true } });
  shots.push({ feature: 'add-filter', theme, variant: 'method', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true, filtersub: 'method' } });
  shots.push({ feature: 'add-filter', theme, variant: 'status', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true, filtersub: 'status' } });
  shots.push({ feature: 'add-filter', theme, variant: 'rule', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true, filtersub: 'rule' } });
  shots.push({ feature: 'add-filter', theme, variant: 'pill-overflow', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', tip: 'method' } });
  shots.push({ feature: 'capture', theme, variant: 'recording-loading', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', recording: 'pending' } });
}
// Default shell: a dedicated global window header with feature tools inside content.
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'shell-v2', theme, variant: 'capture', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '' } });
  shots.push({ feature: 'shell-v2', theme, variant: 'capture-collapsed', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '' } });
  for (const feature of ['rules', 'composer', 'settings', 'breakpoints', 'diagnostics']) {
    shots.push({ feature: 'shell-v2', theme, variant: feature, state: { view: feature, theme: TOKEN[theme], sidebar: 'expanded', overlay: '' } });
  }
}

const STABILIZE = '*{transition:none!important;animation:none!important;caret-color:transparent!important}';
const FULL_CSS = `
.app{height:auto!important;min-height:800px!important}
.mainhost,.mv{overflow:visible!important}
.listwrap,.rlist,.reditor,.insp,.scroll,.edscroll,.cbuild,.cresp,.htab,.jsonv,
.snav,.scontent,.bqueue,.beditor,.bscroll,.dlist,.ddetail,.dscroll{overflow:visible!important;max-height:none!important}
`;

const selectedShots = onlyFeature
  ? shots.filter((shot) => shot.feature === onlyFeature)
  : shots;

// Only clean feature directories owned by this run; preserve scene scripts.
const selectedDirectories = new Set(
  selectedShots.map((shot) => path.join(shotsRoot, shot.theme, shot.feature)),
);
await Promise.all(
  [...selectedDirectories].map((directory) =>
    rm(directory, { recursive: true, force: true })),
);
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
    await page.evaluate((st) => window.__setState({
      fileMenu: '',
      settings: 'certificates',
      repair: 'idle',
      update: 'up-to-date',
      https: 'fresh',
      mitm: 'inactive',
      copy: 'hidden',
      requestMenu: '',
      ruleFilter: '',
        ruleOptions: '',
      bodyPreview: '',
      ...st,
    }), s.state);
    await page.waitForTimeout(140);
    const dest = path.join(shotsRoot, s.theme, s.feature);
    await mkdir(dest, { recursive: true });
    await app.screenshot({ path: path.join(dest, `${s.variant}.png`) });
    console.log('  ✓', `${s.theme}/${s.feature}/${s.variant}`);
  }
}

const framedShots = selectedShots.filter((shot) => !shot.full);
const fullShots = selectedShots.filter((shot) => shot.full);

console.log('framed:');
await shoot(framedShots);
console.log('full-content:');
await page.addStyleTag({ content: FULL_CSS });
await shoot(fullShots);

await browser.close();
console.log(`\nDone — ${selectedShots.length} shots → ${shotsRoot}`);
