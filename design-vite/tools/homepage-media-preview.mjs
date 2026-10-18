import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const homepage = path.resolve(repository, '../Interceptor-Homepage');
const homepageRequire = createRequire(path.join(homepage, 'package.json'));
const { createServer } = await import(pathToFileURL(homepageRequire.resolve('vite')).href);
const { chromium, expect, selectors } = homepageRequire('@playwright/test');
const { getPreferenceTrigger, showHeaderControls, toggleHeaderLanguage } = await import(
  pathToFileURL(path.join(homepage, 'tests/integration/header-controls.ts')).href
);
selectors.setTestIdAttribute('data-automation-id');

const mediaDirectory = path.resolve(process.argv[2] ?? '');
const output = path.resolve(process.argv[3] ?? '');
assert.ok(process.argv[2] && process.argv[3], 'Usage: node homepage-media-preview.mjs <native-output-directory> <review-output-directory>');
assert.ok(!existsSync(path.join(output, 'review.json')), 'Do not overwrite an existing completed review.');
const features = ['capture', 'rules', 'breakpoints', 'composer', 'agent', 'mcp'];
const proposalCopy = {
  'zh.ts': [
    ['Interceptor Capture 工作台设计预览，展示示例 HTTP、WebSocket 和 gRPC 流量。', 'Interceptor 发布版 Capture 实拍，展示本地示例请求与 JSON 响应。'],
    ['界面设计预览与示例数据，非发布版本截图。', '发布版 App 实拍 · 本地演示数据'],
    ['查看原尺寸设计图', '查看原尺寸截图'],
    ['界面设计预览 · 示例数据', '真实 App 截图 · 本地演示数据'],
    ['Capture 设计预览，展示应用筛选与示例网络交互。', 'Capture 实拍，展示本地请求列表、筛选区与 JSON 响应。'],
    ['Rules 设计预览，展示匹配条件、本地映射与响应改写。', 'Rules 实拍，展示已生效的 Host、Path 条件与请求 Header 改写。'],
    ['Breakpoints 设计预览，展示已挂起的响应和可编辑的状态码、headers及正文。', 'Breakpoints 实拍，展示已挂起的 POST 请求与可编辑的 JSON 正文。'],
    ['Composer 设计预览，展示请求集合、示例请求和JSON响应。', 'Composer 实拍，展示请求 Header、真实发送结果与 JSON 响应。'],
    ['Agent 设计预览，展示Capture旁的示例调试对话。', 'Agent 实拍，展示 Capture 旁使用本地演示模型完成的对话。'],
    ['MCP设置设计预览，展示本机端点、接入客户端及独立的Tool权限开关。', 'MCP 设置实拍，展示运行中的本机服务、演示 Client 和 Tool 开关，不代表外部 Host 验收。'],
  ],
  'en.ts': [
    ['Interceptor Capture workspace design preview with sample HTTP, WebSocket, and gRPC traffic.', 'Released Interceptor Capture workspace with local demo requests and a JSON response.'],
    ['Interface design with sample data — not a released-build screenshot.', 'Released App screenshot · Local demo data'],
    ['Open the full-size design image', 'Open the full-size screenshot'],
    ['Interface design · Sample data', 'Actual App screenshot · Local demo data'],
    ['Capture design preview with application filters and sample network exchanges.', 'Actual Capture workspace with local requests, filters, and a JSON response.'],
    ['Rules design preview showing match conditions and local-response rewriting.', 'Actual Rules workspace with applied Host and Path conditions and a request-header rewrite.'],
    ['Breakpoints design preview with a paused response and editable status, headers, and body.', 'Actual Breakpoints workspace with a paused POST request and editable JSON body.'],
    ['Composer design preview with a request collection, sample request, and JSON response.', 'Actual Composer workspace with a request header, a real send, and its JSON response.'],
    ['Agent design preview showing a sample debugging conversation beside Capture.', 'Actual Agent conversation beside Capture, completed with a local demonstration model.'],
    ['MCP settings design preview showing a local endpoint, configured client, and per-tool permissions.', 'Actual MCP settings with a running loopback server, a demo Client, and Tool switches; not external-host acceptance.'],
  ],
};

const media = new Map();
const provenance = [];
const recording = JSON.parse(await readFile(path.join(mediaDirectory, 'homepage-steps.json'), 'utf8'));
assert.equal(recording.actualNativeWindow, true);
for (const feature of features) {
  for (const theme of ['light', 'dark']) {
    const file = `homepage-${feature}-${theme}.png`;
    assert.ok(recording.steps.some((step) => step.image === file), `Unrecorded screenshot: ${file}`);
    const bytes = await readFile(path.join(mediaDirectory, file));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(width / height, 16 / 9);
    media.set(`/media/features/${feature}-${theme}.png`, bytes);
    provenance.push({ feature, theme, file, width, height, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}

function proposedMedia() {
  return {
    name: 'homepage-media-review-only',
    enforce: 'pre',
    transform(source, id) {
      const file = path.basename(id);
      if (!id.startsWith(path.join(homepage, 'src/content/')) || !(file in proposalCopy)) return;
      let updated = source;
      for (const [before, after] of proposalCopy[file]) {
        assert.ok(updated.includes(before), `The current homepage copy changed: ${before}`);
        updated = updated.replaceAll(before, after);
      }
      return { code: updated, map: null };
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        const bytes = media.get(pathname);
        if (!bytes) return next();
        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Content-Length', bytes.length);
        response.end(bytes);
      });
    },
  };
}

async function serve(proposal) {
  const server = await createServer({
    root: homepage,
    logLevel: 'warn',
    cacheDir: path.join(output, proposal ? 'cache-after' : 'cache-before'),
    plugins: proposal ? [proposedMedia()] : [],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('The local homepage preview has no TCP address.');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function loadedFonts(page) {
  await page.evaluate(async () => {
    for (const [family, weights] of Object.entries({
      Inter: [400, 450, 500, 600, 700],
      'JetBrains Mono': [400, 500],
    })) {
      for (const weight of weights) {
        const faces = await document.fonts.load(`${weight} 16px "${family}"`, 'Interceptor');
        if (!faces.length || faces.some((face) => face.status !== 'loaded')) {
          throw new Error(`The design font did not load: ${family} ${weight}`);
        }
      }
    }
  });
}

await mkdir(output, { recursive: true });
const before = await serve(false);
let after;
let browser;
try {
  after = await serve(true);
  browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--disable-gpu', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const snapshots = [];
  for (const width of [1600, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const locale of ['zh-CN', 'en']) {
        for (const [variant, site] of [['before', before], ['after', after]]) {
          const context = await browser.newContext({
            viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce',
          });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(site.url);
          await expect(page.locator('h1')).toBeVisible();
          if (locale === 'en') await toggleHeaderLanguage(page);
          await showHeaderControls(page);
          await getPreferenceTrigger(page, 'theme').click();
          await page.getByTestId(`homepage.theme.${theme}`).click();
          await page.keyboard.press('Escape');
          await page.keyboard.press('Escape');
          await loadedFonts(page);
          const key = `${width}-${theme}-${locale}`;
          const directory = path.join(output, variant, key);
          await mkdir(directory, { recursive: true });
          for (const feature of ['overview', ...features]) {
            const area = feature === 'overview' ? page.locator('#workspace')
              : page.getByTestId(`homepage.feature.${feature}`);
            await area.scrollIntoViewIfNeeded();
            await area.locator('img').evaluateAll(async (images) => {
              for (const image of images) await image.decode();
            });
            await page.mouse.move(0, 0);
            await area.screenshot({ path: path.join(directory, `${feature}.png`), animations: 'disabled' });
            const state = await area.evaluate((element) => {
              const image = element.querySelector('img');
              const caption = element.querySelector('figcaption');
              const rect = element.getBoundingClientRect();
              const imageRect = image?.getBoundingClientRect();
              const captionRect = caption?.getBoundingClientRect();
              return {
                width: rect.width, height: rect.height,
                image: imageRect ? { x: imageRect.x - rect.x, y: imageRect.y - rect.y,
                  width: imageRect.width, height: imageRect.height } : null,
                caption: caption?.textContent?.trim(),
                captionBox: captionRect ? { x: captionRect.x - rect.x, y: captionRect.y - rect.y,
                  width: captionRect.width, height: captionRect.height } : null,
                natural: image ? [image.naturalWidth, image.naturalHeight] : null,
              };
            });
            assert.ok(state.image && state.natural, `Missing ${feature} image`);
            snapshots.push({ variant, key, feature, file: `${variant}/${key}/${feature}.png`, ...state });
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          assert.deepEqual(errors, []);
          await context.close();
        }
      }
    }
  }
  await writeFile(path.join(output, 'review.json'), `${JSON.stringify({
    kind: 'design preview, not product acceptance',
    method: 'The existing homepage SPA is rendered unchanged except for in-memory media and copy substitutions.',
    originalFilesModified: false, recording: path.join(mediaDirectory, 'homepage-steps.json'),
    provenance, proposalCopy, snapshots,
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output, snapshots: snapshots.length, images: provenance.length }));
} finally {
  await browser?.close();
  await after?.server.close();
  await before.server.close();
}
