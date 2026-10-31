import { expect, type Locator, type Page } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from './automation';

/** 归一化 Inspector 文本：折叠空白，便于跨行比较。 */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 读取一个 Section 的完整文本（标题、工具栏与内容）；textContent 不要求元素在视口内。 */
async function readSection(page: Page, sectionId: string): Promise<string> {
  const header = getByAutomationId(page, sectionId);
  await expect(header).toBeVisible();
  return normalizeText(await header.locator('xpath=..').textContent() ?? '');
}

/** 读取 header Section 的 name=value 行并按名称排序；HTTP header 语义与顺序无关。 */
async function readHeaderSection(page: Page, sectionId: string): Promise<string> {
  const header = getByAutomationId(page, sectionId);
  await expect(header).toBeVisible();
  const pairs = await header.locator('xpath=..').evaluate((root) => {
    const rows: Array<[string, string]> = [];
    for (const row of Array.from(root.querySelectorAll('div'))) {
      const children = Array.from(row.children);
      if (children.length === 2
        && children[0]?.tagName === 'SPAN'
        && children[1]?.tagName === 'SPAN') {
        // header 名大小写不敏感；值保持原样。
        rows.push([(children[0].textContent ?? '').toLowerCase(), children[1].textContent ?? '']);
      }
    }
    return rows;
  });
  return pairs
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join('\n');
}

/** 一行在 Inspector 中可见的完整请求与响应内容。 */
export interface ExchangeUiSnapshot {
  readonly general: string;
  readonly requestHeaders: string;
  readonly responseHeaders: string;
  readonly requestBody: string;
  readonly responseBody: string;
}

/** 选中一行并读取 Inspector 中完整的请求与响应内容。 */
export async function readExchangeUi(page: Page, row: Locator): Promise<ExchangeUiSnapshot> {
  if (await row.getAttribute('aria-pressed') !== 'true') {
    await row.click();
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
  // 详情异步到达；等 General 里出现 URL 后再读，避免读到半加载状态。
  await expect.poll(async () => (await readSection(
    page,
    AUTOMATION_IDS.capture.inspector.section.general,
  )).includes('http'), { timeout: 5_000 }).toBe(true);
  const general = await readSection(page, AUTOMATION_IDS.capture.inspector.section.general);
  const requestHeaders = await readHeaderSection(page, AUTOMATION_IDS.capture.inspector.section.requestHeaders);
  const responseHeaders = await readHeaderSection(page, AUTOMATION_IDS.capture.inspector.section.responseHeaders);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  const requestBody = await readSection(page, AUTOMATION_IDS.capture.inspector.section.requestBody);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  const responseBody = await readSection(page, AUTOMATION_IDS.capture.inspector.section.responseBody);
  return { general, requestHeaders, responseHeaders, requestBody, responseBody };
}

/** 断言两条记录在 App 内的完整请求与响应一致；General 只比较 URL/method/status。 */
export async function expectSameExchangeUi(
  page: Page,
  source: Locator,
  replayed: Locator,
  expected: { readonly url: string; readonly method: string; readonly status: string },
  options: {
    readonly compareRequestHeaders?: boolean;
    readonly compareRequestBody?: boolean;
  } = {},
): Promise<void> {
  const first = await readExchangeUi(page, source);
  const second = await readExchangeUi(page, replayed);
  for (const snapshot of [first, second]) {
    expect(snapshot.general).toContain(expected.url);
    expect(snapshot.general).toContain(expected.method);
    expect(snapshot.general).toContain(expected.status);
  }
  if (options.compareRequestHeaders !== false) {
    expect(second.requestHeaders).toBe(first.requestHeaders);
  }
  if (options.compareRequestBody !== false) {
    expect(second.requestBody).toBe(first.requestBody);
  }
  expect(second.responseHeaders).toBe(first.responseHeaders);
  expect(second.responseBody).toBe(first.responseBody);
}

/** 去掉 hop-by-hop 与 h2 伪首部，得到端到端 header 集合。 */
export function endToEndHeaders(
  headers: Readonly<Record<string, string | string[]>>,
): Record<string, string | string[]> {
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-connection',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade',
  ]);
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([name]) => !name.startsWith(':') && !hopByHop.has(name.toLowerCase()))
      .map(([name, value]) => [name.toLowerCase(), value]),
  );
}

/** origin 侧一次请求的可比较视图。 */
export interface OriginRequestView {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[]>>;
  readonly bodyBase64?: string;
  readonly body?: string;
}

/** 断言 origin 收到的两次请求在端到端语义上完全一致。 */
export function expectSameOriginRequest(
  first: OriginRequestView,
  second: OriginRequestView,
): void {
  expect(second.method).toBe(first.method);
  expect(second.path).toBe(first.path);
  expect(endToEndHeaders(second.headers)).toEqual(endToEndHeaders(first.headers));
  if (first.bodyBase64 !== undefined || second.bodyBase64 !== undefined) {
    expect(second.bodyBase64).toBe(first.bodyBase64);
  } else {
    expect(second.body).toBe(first.body);
  }
}
