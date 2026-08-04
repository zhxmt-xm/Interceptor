import type {
  CaptureExchangeDetail,
  CaptureHeader,
} from '@interceptor/core-protocol';

import type {
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  SessionQuery,
  SessionQueryFilter,
  SessionQueryPage,
} from '../../capture/interfaces';

export interface ParsedHarEntry {
  /** 请求开始的 Unix 毫秒时间。 */
  readonly startedAt: number;
  /** HAR 声明的总耗时毫秒数。 */
  readonly durationMs: number;
  /** HTTP 请求方法。 */
  readonly method: string;
  /** 已校验 scheme 的完整请求 URL。 */
  readonly url: string;
  /** 归一化后的 h1/h2/h3 协议标识。 */
  readonly protocol: string;
  /** 大于零时的 HTTP 响应状态码。 */
  readonly statusCode?: number;
  /** 可选 HTTP 响应状态文本。 */
  readonly statusText?: string;
  /** 保序请求 header。 */
  readonly requestHeaders: CaptureHeader[];
  /** 保序响应 header。 */
  readonly responseHeaders: CaptureHeader[];
  /** 请求正文 MIME。 */
  readonly requestMime?: string;
  /** 响应正文 MIME。 */
  readonly responseMime?: string;
  /** 已按文本或 base64 解码的请求正文。 */
  readonly requestBody?: Buffer;
  /** 已按文本或 base64 解码的响应正文。 */
  readonly responseBody?: Buffer;
}

export interface ParsedHarCreator {
  /** HAR producer 名称。 */
  readonly name: string;
  /** HAR producer 版本。 */
  readonly version: string;
}

export interface ParsedHarDocument {
  /** 文档声明的 producer；缺失时使用稳定占位值。 */
  readonly creator: ParsedHarCreator;
  /** 已完成结构、上限与 URL 校验的 entry 列表。 */
  readonly entries: ParsedHarEntry[];
}

export interface HarBlobWriteResult {
  /** 内容寻址 SHA-256 hash。 */
  readonly hash: string;
  /** 实际持久化字节数。 */
  readonly size: number;
  /** 是否命中已有相同正文。 */
  readonly deduplicated: boolean;
}

export interface HarAppendedExchange {
  /** 已持久化 Exchange ID。 */
  readonly id: string;
  /** Storage 分配的单调序列号。 */
  readonly seq: number;
}

export interface HarAllScope {
  /** 导出全部 Exchange。 */
  readonly kind: 'all';
}

export interface HarFilterScope {
  /** 按当前 Capture filter 导出。 */
  readonly kind: 'filter';
  /** 下推 Storage 的查询过滤器。 */
  readonly filter: SessionQueryFilter;
}

export interface HarSelectedScope {
  /** 只导出明确选择的 Exchange。 */
  readonly kind: 'selected';
  /** 去重前的有限 Exchange ID 列表。 */
  readonly exchangeIds: readonly string[];
}

export type HarExportScope =
  | HarAllScope
  | HarFilterScope
  | HarSelectedScope;

export interface HarRedactionOptions {
  /** 是否遮罩 Authorization 与 Proxy-Authorization。 */
  readonly authorization: boolean;
  /** 是否遮罩 Cookie 与 Set-Cookie。 */
  readonly cookies: boolean;
  /** 是否完全移除请求和响应正文。 */
  readonly bodies: boolean;
}

export interface HarExportOptions {
  /** 待导出的全部、当前过滤或选中范围。 */
  readonly scope: HarExportScope;
  /** 应用于写文件前的敏感数据处理策略。 */
  readonly redaction: HarRedactionOptions;
}

export interface HarTransferProgress {
  /** 已完成处理的 Exchange 数量。 */
  readonly processed: number;
  /** 本任务预计处理的 Exchange 总数。 */
  readonly total: number;
}

export interface HarTransferResult extends HarTransferProgress {
  /** 完成后向用户展示的格式损失或兼容性警告。 */
  readonly warnings: string[];
}

export type HarProgressListener = (progress: HarTransferProgress) => void;