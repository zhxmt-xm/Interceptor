import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const homepage = path.resolve(repository, '../Interceptor-Homepage');
const homepageRequire = createRequire(path.join(homepage, 'package.json'));
const { createServer } = await import(pathToFileURL(homepageRequire.resolve('vite')).href);
const { chromium, expect, selectors } = homepageRequire('@playwright/test');
selectors.setTestIdAttribute('data-automation-id');
assert.ok(process.argv[2], 'Usage: node homepage-search-preview.mjs <output-directory> [--data-only]');
const output = path.resolve(process.argv[2]);
const dataOnly = process.argv.includes('--data-only');
assert.ok(process.argv.slice(3).every((argument) => argument === '--data-only'), 'Unknown preview argument.');
assert.ok(!existsSync(path.join(output, 'report.json')), 'Do not overwrite a completed comparison.');
const feature = `/@fs/${repository}/design-vite/src/features/HomepageGuidePreview`;

function designSearch() {
  return {
    name: 'homepage-search-design-only',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer?.startsWith(path.join(homepage, 'src/features/guide/'))) return;
      if (source === './search/GuideSearchDialog') return '\0guide-search-design-dialog';
      if (source === './search/GuideSearchTrigger') return '\0guide-search-design-trigger';
    },
    load(id) {
      if (id === '\0guide-search-design-trigger') {
        return `export { HomepageGuideSearchTrigger as default } from ${JSON.stringify(`${feature}/HomepageGuideSearchTrigger.tsx`)};`;
      }
      if (id !== '\0guide-search-design-dialog') return;
      // Both presentations receive the same compiled book; geometry never comes from the product.
      return `
        import { jsx } from 'react/jsx-runtime';
        import { HomepageGuideSearchDialog } from ${JSON.stringify(`${feature}/HomepageGuideSearchDialog.tsx`)};
        import { searchGuide } from '/src/features/guide/utils.ts';
        import { GUIDE_UI } from '/src/content/guidebook.ts';
        export default function DesignSearchDialog(props) {
          const entries = searchGuide(props.query, props.locale).map(result => ({
            href: result.href,
            chapter: result.chapter + (result.step === undefined ? '' : ' · ' + GUIDE_UI[props.locale].search.step + ' ' + result.step),
            title: result.title,
            text: result.excerpt,
          }));
          return jsx(HomepageGuideSearchDialog, { ...props, entries });
        }
      `;
    },
  };
}

async function serve(design) {
  const server = await createServer({
    root: homepage,
    logLevel: 'warn',
    cacheDir: path.join(output, design ? 'cache-design' : 'cache-product'),
    plugins: design ? [designSearch()] : [],
    resolve: { dedupe: ['react', 'react-dom', 'antd', 'lucide-react'] },
    server: {
      host: '127.0.0.1', port: 0, strictPort: false,
      fs: { allow: [homepage, repository] },
    },
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Preview has no loopback TCP address.');
    return { server, url: `http://127.0.0.1:${address.port}` };
  } catch (error) {
    await server.close();
    throw error;
  }
}

async function fontsReady(page) {
  await page.evaluate(async () => {
    for (const [family, weights] of Object.entries({
      Inter: [400, 450, 500, 600, 700],
      'JetBrains Mono': [400, 500],
    })) {
      for (const weight of weights) {
        const faces = await document.fonts.load(`${weight} 16px "${family}"`, 'Interceptor');
        if (!faces.length || faces.some((face) => face.status !== 'loaded'))
          throw new Error(`Font did not load: ${family} ${weight}`);
      }
    }
  });
}

const styleKeys = [
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color',
  'backgroundColor', 'borderColor', 'borderRadius', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'gap', 'display', 'alignItems', 'overflowY',
];
const targetsFor = (state) => state === 'entry' || state === 'closed'
  ? [{ id: 'trigger', selector: '[data-automation-id="guide.search.trigger"]', visibleOnly: true }]
  : [
    { id: 'dialog', selector: '[role="dialog"]', visibleOnly: true },
    { id: 'content', selector: '[data-automation-id="guide.search.dialog"]' },
    { id: 'input', selector: '[data-automation-id="guide.search.input"]' },
    { id: 'count', selector: '[data-automation-id="guide.search.dialog"] [role="status"]' },
    { id: 'list', selector: '[data-automation-id="guide.search.dialog"] [role="listbox"]' },
    ...(state === 'empty' || state === 'no-results'
      ? [{ id: 'empty', selector: '[data-automation-id="guide.search.empty"]' }]
      : [
        { id: 'selected', selector: '[data-automation-id="guide.search.result"][aria-selected="true"]' },
        { id: 'chapter', selector: '[data-automation-id="guide.search.result"][aria-selected="true"] small' },
        { id: 'title', selector: '[data-automation-id="guide.search.result"][aria-selected="true"] strong' },
        { id: 'excerpt', selector: '[data-automation-id="guide.search.result"][aria-selected="true"] p' },
      ]),
  ];

async function measure(page, state) {
  const targets = targetsFor(state);
  const collect = () => page.evaluate(({ targets, styleKeys }) => Object.fromEntries(targets.map((target) => {
    const elements = [...document.querySelectorAll(target.selector)]
      .filter((element) => !target.visibleOnly || element.checkVisibility());
    if (elements.length !== 1) throw new Error(`${target.id}: expected one node, found ${elements.length}`);
    const element = elements[0];
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return [target.id, {
      geometry: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles: Object.fromEntries(styleKeys.map((key) => [key, css[key]])),
      state: {
        visible: element.checkVisibility(),
        focused: document.activeElement === element,
        role: element.getAttribute('role'),
        selected: element.getAttribute('aria-selected'),
        expanded: element.getAttribute('aria-expanded'),
        value: element instanceof HTMLInputElement ? element.value : null,
        text: element.textContent,
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      },
    }];
  })), { targets, styleKeys });
  const end = Date.now() + 2000;
  let previous = await collect();
  do {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const current = await collect();
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  } while (Date.now() < end);
  throw new Error(`Unstable measurements: ${state}`);
}

const report = { scope: 'Homepage guide search', dataOnly, checked: 0, scenes: [], differences: [], errors: [] };
await mkdir(output, { recursive: true });
let product;
let design;
let browser;
try {
  product = await serve(false);
  design = await serve(true);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const width of [1600, 390, 320]) {
    for (const theme of ['light', 'dark']) {
      for (const locale of ['zh', 'en']) {
        const scene = `${width}/${theme}/${locale}`;
        const sides = {};
        for (const [side, site] of [['design', design], ['product', product]]) {
          const context = await browser.newContext({
            viewport: { width, height: width === 320 ? 480 : 900 },
            colorScheme: theme, reducedMotion: 'reduce',
          });
          try {
            const page = await context.newPage();
            page.on('pageerror', (error) => report.errors.push({ scene, side, message: error.message }));
            await page.goto(`${site.url}/guide/capture${locale === 'en' ? '?lang=en' : ''}`);
            await expect(page.getByTestId('guide.article')).toBeVisible();
            await fontsReady(page);
            await expect(
              page.getByTestId('guide.search.trigger').filter({ visible: true }).locator('[data-fixture-node]'),
            ).toHaveCount(side === 'design' ? 1 : 0);
            const states = {};
            const save = async (state) => {
              states[state] = await measure(page, state);
              if (!dataOnly) {
                await page.locator('img').evaluateAll(async (images) => {
                  await Promise.all(images.filter((image) => {
                    const rect = image.getBoundingClientRect();
                    return rect.width > 0 && rect.top < innerHeight && rect.bottom > 0;
                  }).map((image) => image.decode()));
                });
                await page.screenshot({ path: path.join(output, `${side}-${state}-${width}-${theme}-${locale}.png`) });
              }
            };
            await save('entry');
            await page.getByTestId('guide.search.trigger').filter({ visible: true }).click();
            const input = page.getByTestId('guide.search.input');
            await expect(input).toBeFocused();
            const designIcons = page.getByTestId('guide.search.dialog').locator('[data-fixture-node]');
            if (side === 'design') expect(await designIcons.count()).toBeGreaterThan(0);
            else await expect(designIcons).toHaveCount(0);
            await save('empty');
            await input.fill(locale === 'en' ? 'certificate' : '证书');
            await expect(page.getByTestId('guide.search.result').first()).toBeVisible();
            await save('results');
            await input.press('ArrowDown');
            await save('keyboard');
            await input.fill('no-matching-guide-step');
            await expect(page.getByTestId('guide.search.empty')).toBeVisible();
            await save('no-results');
            await input.press('Escape');
            await expect(page.getByTestId('guide.search.dialog')).not.toBeVisible();
            await save('closed');
            sides[side] = states;
          } catch (error) {
            report.errors.push({ scene, side, message: error instanceof Error ? error.message : String(error) });
          } finally {
            await context.close();
          }
        }
        if (!sides.design || !sides.product) continue;
        report.scenes.push({ scene, ...sides });
        for (const [state, expected] of Object.entries(sides.design)) {
          for (const [target, value] of Object.entries(expected)) {
            const actual = sides.product[state][target];
            for (const [group, properties] of Object.entries(value)) {
              for (const [property, expectedValue] of Object.entries(properties)) {
                report.checked += 1;
                const actualValue = actual[group][property];
                if (actualValue !== expectedValue)
                  report.differences.push({ scene, state, target, property: `${group}.${property}`, expected: expectedValue, actual: actualValue });
              }
            }
          }
        }
        console.log(`${scene}: compared`);
      }
    }
  }
} catch (error) {
  report.errors.push({ scene: 'runner', message: error instanceof Error ? error.message : String(error) });
} finally {
  const cleanup = await Promise.allSettled([
    browser?.close(), design?.server.close(), product?.server.close(),
  ]);
  for (const result of cleanup) {
    if (result.status === 'rejected') report.errors.push({ scene: 'cleanup', message: String(result.reason) });
  }
  await rm(path.join(output, 'cache-design'), { recursive: true, force: true });
  await rm(path.join(output, 'cache-product'), { recursive: true, force: true });
}
const passed = report.errors.length === 0 && report.differences.length === 0 && report.scenes.length === 12;
await writeFile(path.join(output, 'report.json'), JSON.stringify({ passed, ...report }, null, 2), 'utf8');
await writeFile(path.join(output, 'report.md'), [
  '# Homepage 教程搜索元素对照',
  '',
  `结论：${passed ? '通过' : '未通过'}；场景 ${report.scenes.length}/12；字段 ${report.checked}；差异 ${report.differences.length}；执行错误 ${report.errors.length}。`,
  '',
  '两侧使用同一已编译教程数据，独立渲染已确认设计组件和正式搜索组件。逐项严格比较几何、样式、文本与状态；没有容差、偏移补偿或截图输入。',
  '',
  ...report.errors.map((error) => `- 执行错误：${JSON.stringify(error)}`),
  ...report.differences.map((difference) => `- 差异：${JSON.stringify(difference)}`),
].join('\n'), 'utf8');
console.log(`对照${passed ? '通过' : '未通过'}：${report.checked} 字段，${report.differences.length} 差异，${report.errors.length} 错误。`);
for (const issue of [...report.errors, ...report.differences].slice(0, 10)) console.log(JSON.stringify(issue));
process.exitCode = report.errors.length ? 2 : passed ? 0 : 1;
