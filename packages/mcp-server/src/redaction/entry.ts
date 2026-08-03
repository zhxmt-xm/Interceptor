import {
  MCP_BODY_PREVIEW_MAX_BYTES,
  MCP_OPAQUE_BODY_MIME_PREFIXES,
  MCP_REDACTED_HEADERS,
  MCP_REDACTED_PLACEHOLDER,
  MCP_REDACTED_QUERY_KEYS,
} from '../constants';

/**
 * 把 Core 数据裁剪成可以进入外部 LLM 上下文的形态。
 *
 * 前提：MCP 返回的一切都必须视为已离开本机。Interceptor 持有的是解密后的
 * HTTPS 流量，泄露的不是普通文件而是用户在所有站点上的身份。
 */
export class McpRedactor {
  /** 遮罩后的头名集合，小写。 */
  readonly #headerDenyList: ReadonlySet<string>;
  /** 遮罩后的 query 参数名集合，小写。 */
  readonly #queryDenyList: ReadonlySet<string>;

  constructor(
    headerDenyList: readonly string[] = MCP_REDACTED_HEADERS,
    queryDenyList: readonly string[] = MCP_REDACTED_QUERY_KEYS,
  ) {
    this.#headerDenyList = new Set(headerDenyList.map((name) => name.toLowerCase()));
    this.#queryDenyList = new Set(queryDenyList.map((name) => name.toLowerCase()));
  }

  /** 遮罩敏感请求/响应头，保留头名以便模型理解请求形态。 */
  redactHeaders<T extends { name: string; value: string }>(headers: readonly T[]): T[] {
    return headers.map((header) => (
      this.#headerDenyList.has(header.name.toLowerCase())
        ? { ...header, value: MCP_REDACTED_PLACEHOLDER }
        : header
    ));
  }

  /** 遮罩 URL query 中的凭据字段；URL 无法解析时原样返回。 */
  redactUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }
    return this.#redactSearchParams(parsed) ? parsed.toString() : url;
  }

  /** 同上，但适用于摘要里的相对 path（Core 不在摘要里给完整 URL）。 */
  redactPath(path: string | undefined): string | undefined {
    if (path === undefined || !path.includes('?')) {
      return path;
    }
    let parsed: URL;
    try {
      parsed = new URL(path, 'http://redaction.invalid');
    } catch {
      return path;
    }
    return this.#redactSearchParams(parsed) ? `${parsed.pathname}${parsed.search}` : path;
  }

  /** 就地遮罩 query；返回是否发生了替换。 */
  #redactSearchParams(parsed: URL): boolean {
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (this.#queryDenyList.has(key.toLowerCase())) {
        parsed.searchParams.set(key, MCP_REDACTED_PLACEHOLDER);
        changed = true;
      }
    }
    return changed;
  }

  /** 音视频正文零读取，只允许返回 metadata。 */
  isOpaqueBody(mimeType: string | null | undefined): boolean {
    if (!mimeType) {
      return false;
    }
    const normalized = mimeType.toLowerCase();
    return MCP_OPAQUE_BODY_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  /** 把正文字节转成文本预览，超限截断并标注实际读取量。 */
  previewBody(
    data: Uint8Array,
    mimeType: string | null | undefined,
  ): { text: string; truncated: boolean; bytesRead: number } | { opaque: true; mimeType: string } {
    if (this.isOpaqueBody(mimeType)) {
      return { opaque: true, mimeType: mimeType ?? 'application/octet-stream' };
    }
    const limited = data.byteLength > MCP_BODY_PREVIEW_MAX_BYTES
      ? data.subarray(0, MCP_BODY_PREVIEW_MAX_BYTES)
      : data;
    return {
      text: new TextDecoder('utf-8', { fatal: false }).decode(limited),
      truncated: limited.byteLength < data.byteLength,
      bytesRead: limited.byteLength,
    };
  }
}
