import {
  TOOL_BODY_PREVIEW_MAX_BYTES,
  TOOL_OPAQUE_BODY_MIME_PREFIXES,
  TOOL_REDACTED_HEADERS,
  TOOL_REDACTED_PLACEHOLDER,
  TOOL_REDACTED_QUERY_KEYS,
} from '../constants';

/** Redacts captured traffic before it enters an Agent or MCP context. */
export class InterceptorToolRedactor {
  readonly #headerNames: ReadonlySet<string>;
  readonly #queryKeys: ReadonlySet<string>;

  constructor(
    headerNames: readonly string[] = TOOL_REDACTED_HEADERS,
    queryKeys: readonly string[] = TOOL_REDACTED_QUERY_KEYS,
  ) {
    this.#headerNames = new Set(headerNames.map((name) => name.toLowerCase()));
    this.#queryKeys = new Set(queryKeys.map((name) => name.toLowerCase()));
  }

  /** Masks sensitive header values while preserving all other fields. */
  redactHeaders<T extends { name: string; value: string }>(headers: readonly T[]): T[] {
    return headers.map((header) => (
      this.#headerNames.has(header.name.toLowerCase())
        ? { ...header, value: TOOL_REDACTED_PLACEHOLDER }
        : header
    ));
  }

  /** Masks credential query parameters in an absolute URL. */
  redactUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }
    return this.#redactSearchParams(parsed) ? parsed.toString() : url;
  }

  /** Masks credential query parameters in a relative request path. */
  redactPath(path: string | undefined): string | undefined {
    if (path === undefined || !path.includes('?')) return path;
    let parsed: URL;
    try {
      parsed = new URL(path, 'http://redaction.invalid');
    } catch {
      return path;
    }
    return this.#redactSearchParams(parsed) ? `${parsed.pathname}${parsed.search}` : path;
  }

  /** Returns whether body bytes must remain outside Tool results. */
  isOpaqueBody(mimeType: string | null | undefined): boolean {
    if (!mimeType) return false;
    const normalized = mimeType.toLowerCase();
    return TOOL_OPAQUE_BODY_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  /** Converts body bytes into a bounded text preview or opaque metadata. */
  previewBody(
    data: Uint8Array,
    mimeType: string | null | undefined,
  ): { text: string; truncated: boolean; bytesRead: number } | { opaque: true; mimeType: string } {
    if (this.isOpaqueBody(mimeType)) {
      return { opaque: true, mimeType: mimeType ?? 'application/octet-stream' };
    }
    const limited = data.byteLength > TOOL_BODY_PREVIEW_MAX_BYTES
      ? data.subarray(0, TOOL_BODY_PREVIEW_MAX_BYTES)
      : data;
    return {
      text: new TextDecoder('utf-8', { fatal: false }).decode(limited),
      truncated: limited.byteLength < data.byteLength,
      bytesRead: limited.byteLength,
    };
  }

  /** Masks configured query values and reports whether the URL changed. */
  #redactSearchParams(parsed: URL): boolean {
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (this.#queryKeys.has(key.toLowerCase())) {
        parsed.searchParams.set(key, TOOL_REDACTED_PLACEHOLDER);
        changed = true;
      }
    }
    return changed;
  }
}