/** 部分服务在 JSON 正文前加防 JSON 劫持的守卫前缀，必须跳过它才能解析。 */
const XSSI_GUARD = /^\s*(?:\)\]\}'[^\n]*|while\s*\(1\);?|for\s*\(;;\);?|&&&START&&&)/;

export function stripXssiGuard(text: string): string {
  return text.slice(XSSI_GUARD.exec(text)?.[0]?.length ?? 0);
}

export function decodeUtf8(bytes: Uint8Array, truncated = false): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes, { stream: truncated });
}

export function previewSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const divisor = bytes < 1024 * 1024 ? 1024 : 1024 * 1024;
  const value = bytes / divisor;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${divisor === 1024 ? 'KiB' : 'MiB'}`;
}

/** 只把对象/数组根视为 JSON 文档，避免把 `42`、`"text"` 这类纯文本当成 JSON。 */
function parseJsonDocument(record: string): unknown {
  const trimmed = record.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * 美化 JSON 正文，无法解析时返回 null。
 * 兼容 XSSI 守卫前缀（保留原文首行）与 NDJSON / JSON-seq 多文档流。
 */
export function formatJsonBody(text: string): string | null {
  const guard = XSSI_GUARD.exec(text)?.[0] ?? '';
  const payload = text.slice(guard.length);
  const prefix = guard.trim() ? `${guard.trim()}\n` : '';
  const single = parseJsonDocument(payload);
  if (single !== undefined) {
    return prefix + JSON.stringify(single, null, 2);
  }
  const records = payload.split(/[\n\u001e]/).filter((record) => record.trim().length > 0);
  if (records.length < 2) {
    return null;
  }
  const documents: string[] = [];
  for (const record of records) {
    const value = parseJsonDocument(record);
    if (value === undefined) {
      return null;
    }
    documents.push(JSON.stringify(value, null, 2));
  }
  return prefix + documents.join('\n');
}

export interface FormField {
  name: string;
  value: string;
}

/** 解析 `application/x-www-form-urlencoded`，坏转义序列保留原文而不是丢字段。 */
export function parseFormBody(text: string): FormField[] {
  return text
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const separator = pair.indexOf('=');
      const rawName = separator === -1 ? pair : pair.slice(0, separator);
      const rawValue = separator === -1 ? '' : pair.slice(separator + 1);
      return { name: decodeFormPart(rawName), value: decodeFormPart(rawValue) };
    });
}

function decodeFormPart(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    return part;
  }
}

/** 一行 hex dump：`offset  字节…  ASCII`，供虚拟列表按需生成。 */
export function hexLine(bytes: Uint8Array, index: number, bytesPerLine: number): string {
  const offset = index * bytesPerLine;
  const slice = bytes.subarray(offset, offset + bytesPerLine);
  const hex = Array.from(slice, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(slice, (byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.')).join('');
  return `${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(bytesPerLine * 3 - 1, ' ')}  ${ascii}`;
}

export function hexLineCount(byteLength: number, bytesPerLine: number): number {
  return Math.ceil(byteLength / bytesPerLine) || 0;
}

/** 整份 hex dump，只用于 Copy；渲染走虚拟化的逐行生成。 */
export function toHexDump(bytes: Uint8Array, bytesPerLine = 16): string {
  const lines: string[] = [];
  const width = Math.max(4, bytesPerLine);
  for (let index = 0; index < hexLineCount(bytes.byteLength, width); index += 1) {
    lines.push(hexLine(bytes, index, width));
  }
  return lines.join('\n');
}
