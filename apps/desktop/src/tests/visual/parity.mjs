// Design-parity harness — verifies the React renderer matches design/app/ 1:1.
//
// For each view in parity.config.mjs it:
//   1. drives the design SPA (window.__setState) and the renderer
//      (window.__setView + __setTheme) into the same state,
//   2. pixel-diffs the renderer screenshot against the design baseline PNG,
//   3. compares every configured element by geometry (getBoundingClientRect,
//      relative to the shell root) AND computed font style, auto-detecting and
//      subtracting the systematic offset (the design's 1px card border) so only
//      real per-element differences are flagged.
//
// The renderer is preload-free safe (window.interceptor?.…), so it renders the
// same sample data as the mockups in a plain browser.
//
// Run from repo root:            node apps/desktop/src/tests/visual/parity.mjs
// One view only:                 node apps/desktop/src/tests/visual/parity.mjs --view=capture
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { createServer } from 'vite';

import * as config from './parity.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '../../..');
const repoRoot = path.resolve(here, '../../../../..');
const outDir = path.join(here, 'renderer-shots');
const designIndexUrl = pathToFileURL(path.join(repoRoot, config.designIndex)).href;

const onlyView = process.argv.find((arg) => arg.startsWith('--view='))?.split('=')[1];
const views = config.views.filter((view) => !onlyView || view.id === onlyView);
// lineHeight is intentionally excluded: the design computes to the keyword
// `normal` while the app uses an explicit px value, but the measured box height
// (dh) already captures the real line-height effect, so comparing the string
// would only produce false positives.
const STYLE_KEYS = ['fontSize', 'fontWeight', 'color'];

const median = (nums) => {
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

async function collect(page, rootSelector, targets) {
  const origin = await page.locator(rootSelector).first().boundingBox();
  const result = {};
  for (const name of targets) {
    const element = page.getByText(name, { exact: true }).first();
    const box = await element.boundingBox().catch(() => null);
    if (!box || !origin) {
      continue;
    }
    const style = await element.evaluate((node, keys) => {
      const computed = getComputedStyle(node);
      return Object.fromEntries(keys.map((key) => [key, computed[key]]));
    }, STYLE_KEYS);
    result[name] = { x: box.x - origin.x, y: box.y - origin.y, w: box.width, h: box.height, style };
  }
  return result;
}

await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: path.join(desktopRoot, 'vite.renderer.config.ts'),
  root: desktopRoot,
  server: { port: 5199, strictPort: true },
  logLevel: 'warn',
});
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/';
console.log('renderer:', url, '\n');

const browser = await chromium.launch({ channel: 'msedge' });
const designPage = await browser.newPage({
  viewport: { width: config.viewport.width + 120, height: config.viewport.height + 120 },
  colorScheme: 'light',
});
await designPage.goto(designIndexUrl, { waitUntil: 'networkidle' });
const appPage = await browser.newPage({
  viewport: config.viewport,
  deviceScaleFactor: 2,
  colorScheme: 'light',
});
await appPage.goto(url, { waitUntil: 'networkidle' });
await appPage.evaluate(() => document.fonts?.ready);

let totalFlags = 0;

for (const view of views) {
  console.log(`== ${view.id} (${view.theme}) ==`);

  await designPage.evaluate((state) => window.__setState?.(state), view.designState);
  await designPage.evaluate(() => document.fonts?.ready);
  await designPage.waitForTimeout(400);
  await appPage.evaluate((theme) => window.__setTheme?.(theme), view.theme);
  await appPage.evaluate((id) => window.__setView?.(id), view.id);
  await appPage.waitForTimeout(400);

  // 1. screenshot + pixel diff
  const shotPath = path.join(outDir, `${view.id}-${view.theme}.png`);
  await appPage.screenshot({ path: shotPath });
  if (view.designShot) {
    const designShotPath = path.join(repoRoot, config.designShotsDir, view.designShot);
    if (existsSync(designShotPath)) {
      try {
        const actual = PNG.sync.read(await readFile(shotPath));
        const expected = PNG.sync.read(await readFile(designShotPath));
        if (actual.width === expected.width && actual.height === expected.height) {
          const diff = new PNG({ width: actual.width, height: actual.height });
          const n = pixelmatch(actual.data, expected.data, diff.data, actual.width, actual.height, {
            threshold: 0.12,
            includeAA: false,
            diffColor: [255, 0, 255],
          });
          await writeFile(path.join(outDir, `${view.id}-${view.theme}-diff.png`), PNG.sync.write(diff));
          console.log(`  pixel diff ${(100 * n / (actual.width * actual.height)).toFixed(2)}% (includes the design's 1px canvas-border shift)`);
        } else {
          console.log(`  pixel diff skipped (size ${actual.width}x${actual.height} vs ${expected.width}x${expected.height})`);
        }
      } catch (error) {
        console.log('  pixel diff error:', error.message);
      }
    }
  }

  // 2. per-element geometry + font style, with systematic offset removed
  const design = await collect(designPage, '.app', view.targets);
  const app = await collect(appPage, '[data-collapsed]', view.targets);
  const matched = view.targets.filter((name) => design[name] && app[name]);
  const sysX = median(matched.map((name) => app[name].x - design[name].x));
  const sysY = median(matched.map((name) => app[name].y - design[name].y));
  console.log(`  systematic offset x ${sysX.toFixed(1)} y ${sysY.toFixed(1)} (design card border — subtracted below)`);

  for (const name of view.targets) {
    if (!design[name] || !app[name]) {
      console.log(`    ${name.padEnd(16)} ${design[name] ? 'app-missing' : 'design-missing'}`);
      continue;
    }
    const dx = +(app[name].x - design[name].x - sysX).toFixed(1);
    const dy = +(app[name].y - design[name].y - sysY).toFixed(1);
    const dw = +(app[name].w - design[name].w).toFixed(1);
    const dh = +(app[name].h - design[name].h).toFixed(1);
    const styleDiffs = STYLE_KEYS.filter((key) => design[name].style[key] !== app[name].style[key]).map(
      (key) => `${key} ${design[name].style[key]}->${app[name].style[key]}`,
    );
    const flagged = [dx, dy, dw, dh].some((value) => Math.abs(value) >= 1) || styleDiffs.length > 0;
    if (flagged) {
      totalFlags += 1;
    }
    console.log(
      `  ${flagged ? '! ' : '  '}${name.padEnd(16)} dx ${dx} dy ${dy} dw ${dw} dh ${dh}${styleDiffs.length ? '  [' + styleDiffs.join(', ') + ']' : ''}`,
    );
  }
  console.log('');
}

console.log(
  totalFlags === 0
    ? 'OK - parity within 1px and matching font style after canvas-border offset'
    : `${totalFlags} element(s) flagged - inspect deltas above and the diff PNGs`,
);

await browser.close();
await server.close();
