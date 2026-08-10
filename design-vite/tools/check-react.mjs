import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startDesignPreview } from './design-preview.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const requestedUrl = process.argv[2];
const designPreview = requestedUrl ? null : await startDesignPreview(path.dirname(dir));
const url = requestedUrl ?? designPreview.url;
const expectedCounts = {
  capture: 1587,
  rules: 306,
  composer: 428,
  settings: 443,
  diagnostics: 123,
};

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const errors = [];
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
});
page.on('requestfailed', (request) => {
  errors.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`);
});
page.on('console', (message) => {
  if (message.type() === 'error') {
    const location = message.location();
    errors.push(`console: ${message.text()} (${location.url}:${location.lineNumber})`);
  }
});
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
let readinessError = '';
try {
  await page.waitForFunction(() => window.__monacoReady === true, null, { timeout: 10_000 });
} catch (error) {
  readinessError = error instanceof Error ? error.message : String(error);
}
const before = await page.evaluate(() => ({
  contract: [typeof window.__setState, typeof window.__monacoRelayout, window.__monacoReady],
  loader: typeof window.require,
  counts: Object.fromEntries(
    ['capture', 'rules', 'composer', 'settings', 'diagnostics'].map((view) => [
      view,
      document.querySelector(`.mainhost > [data-v="${view}"]`)?.querySelectorAll('[data-fixture-node]').length,
    ]),
  ),
  total: document.querySelector('.app')?.querySelectorAll('[data-fixture-node]').length,
}));
await page.evaluate(() => window.__setState?.({ view: 'rules', theme: 'dark', sidebar: 'expanded' }));
const after = await page.evaluate(() => {
  const app = document.querySelector('.app');
  return app ? {
    view: app.getAttribute('data-view'),
    theme: app.getAttribute('data-theme'),
    expanded: app.classList.contains('expanded'),
  } : null;
});
await browser.close();
await designPreview?.close();

const failures = [];
if (readinessError) failures.push(readinessError);
for (const [view, expected] of Object.entries(expectedCounts)) {
  if (before.counts[view] !== expected) {
    failures.push(`${view}: expected ${expected}, received ${before.counts[view]}`);
  }
}
if (before.contract[0] !== 'function' || before.contract[1] !== 'function' || before.contract[2] !== true) {
  failures.push(`invalid window contract: ${JSON.stringify(before.contract)}`);
}
if (after?.view !== 'rules' || after.theme !== 'dark' || !after.expanded) {
  failures.push(`state bridge failed: ${JSON.stringify(after)}`);
}
failures.push(...errors);
if (before.total !== 3462) failures.push(`total: expected 3462, received ${before.total}`);

console.log(JSON.stringify({ before, after, errors, readinessError }, null, 2));
if (failures.length) {
  throw new Error(`React design check failed:\n${failures.join('\n')}`);
}
