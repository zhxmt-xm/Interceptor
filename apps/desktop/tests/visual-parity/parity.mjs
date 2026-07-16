// Design-parity harness. Renderer state is established through a fake Preload API and
// normal user interactions; product code contains no parity-only data or navigation hooks.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { createServer } from 'vite';

import * as config from './parity.config.mjs';
import {
  fakeInterceptorFixture,
  installFakeInterceptor,
} from './fake-interceptor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(here, '../../../..');
const outDir = path.join(here, 'renderer-shots');
const designIndexUrl = pathToFileURL(
  path.join(repoRoot, config.designIndex),
).href;

const onlyView = process.argv
  .find((arg) => arg.startsWith('--view='))
  ?.split('=')[1];
const views = config.views.filter((view) => !onlyView || view.id === onlyView);
const STYLE_KEYS = ['fontSize', 'fontWeight', 'color'];

const median = (numbers) => {
  const sorted = [...numbers].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

async function collect(page, rootSelector, targets) {
  const origin = await page.locator(rootSelector).first().boundingBox();
  const result = {};
  for (const name of targets) {
    const candidates = await page.getByText(name, { exact: true }).all();
    let element = null;
    let box = null;
    for (const candidate of candidates) {
      const candidateBox = await candidate.boundingBox().catch(() => null);
      if (candidateBox) {
        element = candidate;
        box = candidateBox;
        break;
      }
    }
    if (!element || !box || !origin) {
      continue;
    }
    const style = await element.evaluate((node, keys) => {
      const computed = getComputedStyle(node);
      return Object.fromEntries(keys.map((key) => [key, computed[key]]));
    }, STYLE_KEYS);
    result[name] = {
      x: box.x - origin.x,
      y: box.y - origin.y,
      w: box.width,
      h: box.height,
      style,
    };
  }
  return result;
}

async function applyRendererActions(page, actions = []) {
  for (const action of actions) {
    const index = action.index ?? 0;
    switch (action.type) {
      case 'clickText':
        await page.getByText(action.text, { exact: true }).nth(index).click();
        break;
      case 'clickRole':
        await page.getByRole(action.role, { name: action.name, exact: true }).nth(index).click();
        break;
      case 'fillLabel':
        await page.getByLabel(action.label, { exact: true }).nth(index).fill(action.value);
        break;
      case 'selectLabel':
        await page.getByLabel(action.label, { exact: true }).nth(index).selectOption(action.value);
        break;
      default:
        throw new Error(`Unknown Renderer parity action: ${action.type}`);
    }
  }
}

if (!onlyView) {
  await rm(outDir, { recursive: true, force: true });
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
  viewport: {
    width: config.viewport.width + 120,
    height: config.viewport.height + 120,
  },
  colorScheme: 'light',
});
await designPage.goto(designIndexUrl, { waitUntil: 'networkidle' });

let totalFlags = 0;
const viewSummaries = [];
const elementDiffs = [];

for (const view of views) {
  console.log(`== ${view.id} (${view.theme}) ==`);
  let pixelDiffPercent = null;
  let viewFlags = 0;
  let viewMissing = 0;
  let viewMaxGeometryDelta = 0;

  await designPage.evaluate((state) => window.__setState?.(state), view.designState);
  await designPage.evaluate(() => document.fonts?.ready);
  await designPage.waitForTimeout(400);

  const appPage = await browser.newPage({
    viewport: config.viewport,
    deviceScaleFactor: 2,
    colorScheme: view.theme === 'dark' ? 'dark' : 'light',
  });
  await appPage.addInitScript(installFakeInterceptor, {
    fixture: fakeInterceptorFixture,
    theme: view.theme,
  });
  await appPage.goto(url, { waitUntil: 'networkidle' });
  await appPage.evaluate(() => document.fonts?.ready);

  if (view.rendererNav) {
    await appPage
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('button', { name: view.rendererNav, exact: true })
      .click();
  }
  await applyRendererActions(appPage, view.rendererActions);
  await appPage.waitForTimeout(400);

  const shotPath = path.join(outDir, `${view.id}-${view.theme}.png`);
  await rm(shotPath, { force: true });
  await rm(
    path.join(outDir, `${view.id}-${view.theme}-diff.png`),
    { force: true },
  );
  await appPage.screenshot({ path: shotPath });
  if (view.designShot) {
    const designShotPath = path.join(
      repoRoot,
      config.designShotsDir,
      view.designShot,
    );
    if (existsSync(designShotPath)) {
      try {
        const actual = PNG.sync.read(await readFile(shotPath));
        const expected = PNG.sync.read(await readFile(designShotPath));
        if (actual.width === expected.width && actual.height === expected.height) {
          const diff = new PNG({ width: actual.width, height: actual.height });
          const changed = pixelmatch(
            actual.data,
            expected.data,
            diff.data,
            actual.width,
            actual.height,
            {
              threshold: 0.12,
              includeAA: false,
              diffColor: [255, 0, 255],
            },
          );
          await writeFile(
            path.join(outDir, `${view.id}-${view.theme}-diff.png`),
            PNG.sync.write(diff),
          );
          pixelDiffPercent =
            (100 * changed) / (actual.width * actual.height);
          console.log(
            `  pixel diff ${pixelDiffPercent.toFixed(2)}% (includes the design's 1px canvas-border shift)`,
          );
        } else {
          console.log(
            `  pixel diff skipped (size ${actual.width}x${actual.height} vs ${expected.width}x${expected.height})`,
          );
        }
      } catch (error) {
        console.log('  pixel diff error:', error.message);
      }
    }
  }

  const design = await collect(designPage, '.app', view.targets);
  const app = await collect(appPage, '[data-collapsed]', view.targets);
  const matched = view.targets.filter((name) => design[name] && app[name]);
  const systemX = median(
    matched.map((name) => app[name].x - design[name].x),
  );
  const systemY = median(
    matched.map((name) => app[name].y - design[name].y),
  );
  console.log(
    `  systematic offset x ${systemX.toFixed(1)} y ${systemY.toFixed(1)} (design card border - subtracted below)`,
  );

  for (const name of view.targets) {
    if (!design[name] || !app[name]) {
      viewMissing += 1;
      elementDiffs.push({
        view: view.id,
        element: name,
        dx: null,
        dy: null,
        dw: null,
        dh: null,
        maxGeometryDelta: null,
        styleDiffs: [],
        status: design[name] ? 'app missing' : 'design missing',
      });
      console.log(
        `    ${name.padEnd(16)} ${design[name] ? 'app-missing' : 'design-missing'}`,
      );
      continue;
    }
    const dx = +(app[name].x - design[name].x - systemX).toFixed(1);
    const dy = +(app[name].y - design[name].y - systemY).toFixed(1);
    const dw = +(app[name].w - design[name].w).toFixed(1);
    const dh = +(app[name].h - design[name].h).toFixed(1);
    const styleDiffs = STYLE_KEYS.filter(
      (key) => design[name].style[key] !== app[name].style[key],
    ).map(
      (key) =>
        `${key} ${design[name].style[key]}->${app[name].style[key]}`,
    );
    const flagged =
      [dx, dy, dw, dh].some((value) => Math.abs(value) >= 1) ||
      styleDiffs.length > 0;
    const maxGeometryDelta = Math.max(
      Math.abs(dx),
      Math.abs(dy),
      Math.abs(dw),
      Math.abs(dh),
    );
    viewMaxGeometryDelta = Math.max(viewMaxGeometryDelta, maxGeometryDelta);
    if (flagged) {
      totalFlags += 1;
      viewFlags += 1;
    }
    elementDiffs.push({
      view: view.id,
      element: name,
      dx,
      dy,
      dw,
      dh,
      maxGeometryDelta,
      styleDiffs,
      status: flagged ? 'flagged' : 'ok',
    });
    console.log(
      `  ${flagged ? '! ' : '  '}${name.padEnd(16)} dx ${dx} dy ${dy} dw ${dw} dh ${dh}${styleDiffs.length ? `  [${styleDiffs.join(', ')}]` : ''}`,
    );
  }
  viewSummaries.push({
    view: view.id,
    pixelDiffPercent,
    targets: view.targets.length,
    matched: view.targets.length - viewMissing,
    missing: viewMissing,
    flagged: viewFlags,
    maxGeometryDelta: viewMaxGeometryDelta,
  });
  console.log('');
  await appPage.close();
}

const report = buildMarkdownReport(viewSummaries, elementDiffs);
const reportPath = path.join(here, 'parity-report.md');
await writeFile(reportPath, report, 'utf8');

console.log('== Parity summary ==');
console.log(report);
console.log(`Report: ${reportPath}\n`);

console.log(
  totalFlags === 0
    ? 'OK - parity within 1px and matching font style after canvas-border offset'
    : `${totalFlags} element(s) flagged - inspect deltas above and the diff PNGs`,
);

await designPage.close();
await browser.close();
await server.close();

function buildMarkdownReport(summaries, diffs) {
  const pixelDiffs = summaries
    .map((summary) => summary.pixelDiffPercent)
    .filter((value) => value !== null);
  const totalTargets = summaries.reduce(
    (total, summary) => total + summary.targets,
    0,
  );
  const totalMatched = summaries.reduce(
    (total, summary) => total + summary.matched,
    0,
  );
  const totalMissing = summaries.reduce(
    (total, summary) => total + summary.missing,
    0,
  );
  const totalFlagged = summaries.reduce(
    (total, summary) => total + summary.flagged,
    0,
  );
  const averagePixelDiff = pixelDiffs.length
    ? pixelDiffs.reduce((total, value) => total + value, 0) /
      pixelDiffs.length
    : null;
  const worstElement = diffs
    .filter((diff) => diff.maxGeometryDelta !== null)
    .sort(
      (left, right) =>
        right.maxGeometryDelta - left.maxGeometryDelta,
    )[0];
  const result = totalFlagged === 0 && totalMissing === 0
    ? 'Within tolerance'
    : 'Review required';
  const lines = [
    '# Visual Parity Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Overall Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Result | ${result} |`,
    `| Views checked | ${summaries.length} |`,
    `| Average pixel diff | ${
      averagePixelDiff === null ? 'n/a' : `${averagePixelDiff.toFixed(2)}%`
    } |`,
    `| Targets | ${totalTargets} |`,
    `| Matched | ${totalMatched} |`,
    `| Missing | ${totalMissing} |`,
    `| Flagged | ${totalFlagged} |`,
    `| Largest geometry delta | ${
      worstElement ? formatPx(worstElement.maxGeometryDelta) : 'n/a'
    } |`,
    `| Worst element | ${
      worstElement
        ? `${escapeCell(worstElement.view)} / ${escapeCell(worstElement.element)}`
        : 'n/a'
    } |`,
    '',
    '## View Summary',
    '',
    '| View | Pixel diff | Targets | Matched | Missing | Flagged | Max geometry delta |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summaries.map((summary) =>
      `| ${escapeCell(summary.view)} | ${
        summary.pixelDiffPercent === null
          ? 'n/a'
          : `${summary.pixelDiffPercent.toFixed(2)}%`
      } | ${summary.targets} | ${summary.matched} | ${summary.missing} | ${summary.flagged} | ${formatPx(summary.maxGeometryDelta)} |`,
    ),
    '',
    '## Element Geometry',
    '',
    '| View | Element | dx | dy | dw | dh | Max delta | Style differences | Status |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...diffs.map((diff) =>
      `| ${escapeCell(diff.view)} | ${escapeCell(diff.element)} | ${formatPx(diff.dx)} | ${formatPx(diff.dy)} | ${formatPx(diff.dw)} | ${formatPx(diff.dh)} | ${formatPx(diff.maxGeometryDelta)} | ${escapeCell(diff.styleDiffs.join('; ') || 'none')} | ${diff.status} |`,
    ),
    '',
    '> Geometry deltas are measured after subtracting the detected systematic canvas-border offset. A row is flagged when any absolute geometry delta is at least 1 px or a tracked font style differs.',
    '',
  ];
  return lines.join('\n');
}

function formatPx(value) {
  return value === null ? 'n/a' : `${Number(value).toFixed(1)} px`;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}