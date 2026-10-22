import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fontsReady, measure } from './homepage-element-data.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const homepage = path.resolve(repository, '../Interceptor-Homepage');
const homepageRequire = createRequire(path.join(homepage, 'package.json'));
const { createServer } = await import(pathToFileURL(homepageRequire.resolve('vite')).href);
const { chromium, expect, selectors } = homepageRequire('@playwright/test');
const { toggleHeaderLanguage } = await import(pathToFileURL(path.join(homepage, 'tests/integration/header-controls.ts')).href);
selectors.setTestIdAttribute('data-automation-id');
assert.ok(process.argv[2], 'Usage: node homepage-outline-preview.mjs <output-directory> [--data-only]');
const output = path.resolve(process.argv[2]);
const dataOnly = process.argv.includes('--data-only');
assert.ok(process.argv.slice(3).every((argument) => argument === '--data-only'), 'Unknown outline preview argument.');
assert.ok(!existsSync(path.join(output, 'report.json')), 'Do not overwrite an existing comparison.');

function outlineDesign() {
  return {
    name: 'homepage-outline-design-only',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './GuideOutline' && importer === path.join(homepage, 'src/features/guide/GuidePage.tsx')) {
        return '\0homepage-outline-design';
      }
    },
    load(id) {
      if (id !== '\0homepage-outline-design') return;
      return `
        import { useState } from 'react';
        import { jsx } from 'react/jsx-runtime';
        import { HomepageGuideOutlinePreview } from ${JSON.stringify(`/@fs/${repository}/design-vite/src/features/HomepageGuidePreview/HomepageGuideOutlinePreview.tsx`)};
        export default function OutlineDesign(props) {
          const [activeId, onActive] = useState('');
          return jsx(HomepageGuideOutlinePreview, { ...props, activeId, onActive });
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
    plugins: design ? [outlineDesign()] : [],
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { host: '127.0.0.1', port: design ? 6196 : 6195, strictPort: true, fs: { allow: [homepage, repository] } },
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Outline preview has no loopback address.');
    return { server, url: `http://127.0.0.1:${address.port}` };
  } catch (error) {
    await server.close();
    throw error;
  }
}

const report = { scope: 'Homepage current section', dataOnly, checked: 0, scenes: [], differences: [], errors: [] };
await mkdir(output, { recursive: true });
let product;
let design;
let browser;
try {
  product = await serve(false);
  design = await serve(true);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const theme of ['light', 'dark']) {
    for (const locale of ['zh', 'en']) {
      for (const chapter of ['workspace', 'settings']) {
        const scene = `${chapter}/${theme}/${locale}`;
        const sides = {};
        let expectedHrefs;
        for (const [side, site] of [['design', design], ['product', product]]) {
          const context = await browser.newContext({
            viewport: { width: 1600, height: 900 }, colorScheme: theme, reducedMotion: 'reduce',
          });
          try {
            const page = await context.newPage();
            page.on('pageerror', (error) => report.errors.push({ scene, side, message: error.message }));
            await page.goto(`${site.url}/guide/${chapter}${locale === 'en' ? '?lang=en' : ''}`);
            await expect(page.getByTestId('guide.article')).toBeVisible();
            await fontsReady(page);
            const outline = page.getByTestId('guide.outline');
            expect(await outline.getAttribute('data-design-preview')).toBe(side === 'design' ? 'guide-outline' : null);
            const current = outline.locator('[aria-current="location"]');
            const hrefs = await outline.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
            assert.ok(hrefs.length >= 3 && hrefs.every((href) => typeof href === 'string' && href.startsWith('#')));
            assert.equal(new Set(hrefs).size, hrefs.length, 'Outline hrefs must be unique.');
            if (expectedHrefs) assert.deepEqual(hrefs, expectedHrefs);
            else expectedHrefs = hrefs;
            const targets = [
              { id: 'outline', selector: '[data-automation-id="guide.outline"]' },
              { id: 'title', selector: '[data-automation-id="guide.outline"] > p' },
              ...hrefs.map((href) => ({ id: href, selector: `[data-automation-id="guide.outline"] a[href="${href}"]` })),
            ];
            const states = {};
            const reachEnd = async () => {
              const viewport = page.viewportSize();
              assert.ok(viewport);
              await page.mouse.move(Math.min(800, viewport.width - 40), viewport.height / 2);
              const remaining = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY);
              if (remaining > 0) await page.mouse.wheel(0, remaining);
              await page.waitForFunction(() => {
                const root = document.documentElement;
                return Math.ceil(root.scrollTop + root.clientHeight) >= root.scrollHeight;
              });
              await expect(current).toHaveAttribute('href', hrefs.at(-1));
            };
            const save = async (state) => {
              states[state] = await measure(page, targets);
              if (!dataOnly) {
                await page.locator('img').evaluateAll(async (images) => {
                  await Promise.all(images.filter((image) => {
                    const rect = image.getBoundingClientRect();
                    return rect.width > 0 && rect.top < innerHeight && rect.bottom > 0;
                  }).map((image) => image.decode()));
                });
                await page.screenshot({ path: path.join(output, `${side}-${chapter}-${state}-${theme}-${locale}.png`) });
              }
            };
            await expect(current).toHaveAttribute('href', hrefs[0]);
            await save('start');
            await outline.locator(`a[href="${hrefs[1]}"]`).hover();
            await save('hover');
            await outline.locator(`a[href="${hrefs[2]}"]`).click();
            await expect(current).toHaveAttribute('href', hrefs[2]);
            await save('section');
            await reachEnd();
            await save('end');
            await page.setViewportSize({ width: 1600, height: 500 });
            await reachEnd();
            await save('short');
            await toggleHeaderLanguage(page);
            await expect(current).toHaveAttribute('href', hrefs[2]);
            await fontsReady(page);
            await save('language');
            await page.setViewportSize({ width: 900, height: 500 });
            await expect(outline).not.toBeVisible();
            await reachEnd();
            await save('narrow');
            await page.setViewportSize({ width: 1600, height: 900 });
            await reachEnd();
            await save('restored');
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
                if (actualValue !== expectedValue) {
                  report.differences.push({
                    scene, state, target, property: `${group}.${property}`,
                    file: `src/features/guide/GuideOutline.${group === 'state' ? 'tsx' : 'module.css'}`,
                    expected: expectedValue, actual: actualValue,
                    ...(typeof actualValue === 'number' && typeof expectedValue === 'number' ? { delta: actualValue - expectedValue } : {}),
                  });
                }
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
const passed = report.errors.length === 0 && report.differences.length === 0 && report.scenes.length === 8;
await writeFile(path.join(output, 'report.json'), JSON.stringify({ passed, ...report }, null, 2), 'utf8');
await writeFile(path.join(output, 'report.md'), [
  '# Homepage 本章导航元素对照',
  '',
  `结论：${passed ? '通过' : '未通过'}；场景 ${report.scenes.length}/8；字段 ${report.checked}；差异 ${report.differences.length}；执行错误 ${report.errors.length}。`,
  '',
  '逐项原值比较目录、标题和每一个链接的几何、样式、文本与状态，没有容差或整体偏移。--data-only 不读取或生成截图。关联文件是定位入口，不代表根因；链接语义还需核对 GuideLink.tsx。',
  '',
  ...report.errors.map((error) => `- 执行错误：${JSON.stringify(error)}`),
  ...report.differences.map((difference) => `- ${difference.file}：${JSON.stringify(difference)}`),
].join('\n'), 'utf8');
console.log(`对照${passed ? '通过' : '未通过'}：${report.checked} 字段，${report.differences.length} 差异，${report.errors.length} 错误。`);
for (const issue of [...report.errors, ...report.differences].slice(0, 10)) console.log(JSON.stringify(issue));
process.exitCode = report.errors.length ? 2 : passed ? 0 : 1;
