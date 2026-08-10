import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirectory = path.join(appDirectory, 'src', 'fixtures', 'generated');
const source = await readFile(path.join(appDirectory, 'index.html'), 'utf8');
const documentSource = source
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<link[^>]*>/gi, '');

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.setContent(documentSource);

const fixtures = await page.evaluate(() => {
  function serialize(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return { type: 'text', value: node.nodeValue ?? '' };
    }
    if (!(node instanceof Element)) {
      return null;
    }

    const attributes = Object.fromEntries(
      [...node.attributes].map((attribute) => [attribute.name, attribute.value]),
    );
    if (node instanceof HTMLInputElement) {
      attributes.value = node.value;
      if (node.checked) attributes.checked = '';
    } else if (node instanceof HTMLTextAreaElement) {
      attributes.value = node.value;
    }

    return {
      type: 'element',
      tag: node.tagName.toLowerCase(),
      attributes,
      children: [...node.childNodes].map(serialize).filter(Boolean),
    };
  }

  const one = (selector) => serialize(document.querySelector(selector));
  const many = (selector) => [...document.querySelectorAll(selector)].map(serialize);
  const app = document.querySelector('.app');

  return {
    appAttributes: Object.fromEntries(
      [...app.attributes].map((attribute) => [attribute.name, attribute.value]),
    ),
    topbar: one('.topbar'),
    capture: one('.mainhost > [data-v="capture"]'),
    rules: one('.mainhost > [data-v="rules"]'),
    composer: one('.mainhost > [data-v="composer"]'),
    settings: one('.mainhost > [data-v="settings"]'),
    diagnostics: one('.mainhost > [data-v="diagnostics"]'),
    statusbar: one('.statusbar'),
    overlays: many('.app > .ov'),
    contextMenus: many('.app > .ctxmenu'),
    boot: one('.app > .boot'),
    updateNotice: one('.app > .unotice'),
    footerPopovers: many('.app > .footpop'),
    dock: one('body > .dock'),
  };
});

await browser.close();
await mkdir(fixtureDirectory, { recursive: true });

const exports = {
  appAttributes: fixtures.appAttributes,
  topbarFixture: fixtures.topbar,
  captureFixture: fixtures.capture,
  rulesFixture: fixtures.rules,
  composerFixture: fixtures.composer,
  settingsFixture: fixtures.settings,
  diagnosticsFixture: fixtures.diagnostics,
  statusbarFixture: fixtures.statusbar,
  overlayFixtures: fixtures.overlays,
  contextMenuFixtures: fixtures.contextMenus,
  bootFixture: fixtures.boot,
  updateNoticeFixture: fixtures.updateNotice,
  footerPopoverFixtures: fixtures.footerPopovers,
  dockFixture: fixtures.dock,
};

for (const [name, fixture] of Object.entries(exports)) {
  const type = name === 'appAttributes'
    ? 'Readonly<Record<string, string>>'
    : name.endsWith('Fixtures') ? 'readonly FixtureNode[]' : 'FixtureNode';
  const importLine = name === 'appAttributes'
    ? ''
    : "import type { FixtureNode } from '../FixtureNode';\n\n";
  const content = `${importLine}export const ${name}: ${type} = ${JSON.stringify(fixture, null, 2)};\n`;
  await writeFile(path.join(fixtureDirectory, `${name}.ts`), content, 'utf8');
}

console.log(`Generated ${Object.keys(exports).length} fixture modules in ${fixtureDirectory}`);