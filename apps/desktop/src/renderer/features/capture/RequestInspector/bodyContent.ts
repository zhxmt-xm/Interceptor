import { BODY_PREVIEW_MAX_BYTES, type CaptureBodyRef } from '../../../../shared/desktop-api';

export type BodyViewMode = 'auto' | 'text' | 'json' | 'hex';

/** Monaco language ids the body viewer can select from a MIME type. */
export type BodyLanguage =
  | 'json'
  | 'html'
  | 'xml'
  | 'javascript'
  | 'css'
  | 'yaml'
  | 'markdown'
  | 'plaintext';

export interface BodyPreviewRequest {
  length: number;
  decode: boolean;
  limited: boolean;
}

export interface BodyText {
  text: string;
  language: BodyLanguage;
}

/** 计算安全的正文预览读取范围；压缩输入不完整时禁止尝试解码。 */
export function bodyPreviewRequest(body: CaptureBodyRef): BodyPreviewRequest {
  const length = Math.min(body.encodedSize, BODY_PREVIEW_MAX_BYTES);
  const encodings = body.contentEncoding
    ?.split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .filter((encoding) => encoding && encoding !== 'identity') ?? [];
  return {
    length,
    decode: encodings.length > 0,
    limited: body.encodedSize > length,
  };
}

function essenceOf(mime: string | undefined): string {
  return mime?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isTextMime(mime: string | undefined): boolean {
  if (!mime) {
    return false;
  }
  const essence = essenceOf(mime);
  return (
    essence.startsWith('text/') ||
    essence === 'application/json' ||
    essence.endsWith('+json') ||
    essence === 'application/javascript' ||
    essence === 'application/x-javascript' ||
    essence === 'application/ecmascript' ||
    essence === 'application/xml' ||
    essence.endsWith('+xml') ||
    essence === 'application/x-www-form-urlencoded' ||
    essence === 'application/graphql' ||
    essence === 'application/yaml' ||
    essence === 'application/x-yaml' ||
    essence.endsWith('+yaml') ||
    essence === 'application/x-ndjson' ||
    essence === 'application/json-seq' ||
    essence === 'application/x-json-stream'
  );
}

/** 音视频正文不进入 Renderer 预览，只允许 Core 流式保存。 */
export function isMediaMime(mime: string | undefined): boolean {
  const essence = essenceOf(mime);
  return essence.startsWith('video/') || essence.startsWith('audio/');
}

export function isJsonMime(mime: string | undefined): boolean {
  const essence = essenceOf(mime);
  return essence === 'application/json'
    || essence.endsWith('+json')
    || essence === 'application/x-ndjson'
    || essence === 'application/json-seq'
    || essence === 'application/x-json-stream';
}

/** 由 MIME 选择 Monaco 语法高亮语言；未知类型按纯文本展示。 */
export function bodyLanguage(mime: string | undefined): BodyLanguage {
  const essence = essenceOf(mime);
  if (isJsonMime(mime)) {
    return 'json';
  }
  if (essence === 'text/html' || essence === 'application/xhtml+xml') {
    return 'html';
  }
  if (essence === 'text/xml' || essence === 'application/xml' || essence.endsWith('+xml')) {
    return 'xml';
  }
  if (
    essence === 'application/javascript'
    || essence === 'text/javascript'
    || essence === 'application/x-javascript'
    || essence === 'application/ecmascript'
  ) {
    return 'javascript';
  }
  if (essence === 'text/css') {
    return 'css';
  }
  if (essence === 'application/yaml' || essence === 'application/x-yaml' || essence.endsWith('+yaml')) {
    return 'yaml';
  }
  if (essence === 'text/markdown') {
    return 'markdown';
  }
  return 'plaintext';
}

/** 部分服务在 JSON 正文前加防 JSON 劫持的守卫前缀，必须跳过它才能解析。 */
const XSSI_GUARD = /^\s*(?:\)\]\}'[^\n]*|while\s*\(1\);?|for\s*\(;;\);?|&&&START&&&)/;

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

/** Unknown MIME falls back to text only for valid UTF-8 with no binary controls. */
export function detectTextBody(bytes: Uint8Array, mime: string | undefined): BodyText | null {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: !isTextMime(mime) }).decode(bytes);
  } catch {
    return null;
  }
  if (!isTextMime(mime)) {
    for (const character of decoded) {
      const code = character.charCodeAt(0);
      if (code < 32 && character !== '\n' && character !== '\r' && character !== '\t') {
        return null;
      }
    }
  }
  const formatted = formatJsonBody(decoded);
  return formatted !== null
    ? { text: formatted, language: 'json' }
    : { text: decoded, language: bodyLanguage(mime) };
}

/** Resolve the selected display mode without hiding malformed text from the user. */
export function bodyTextForMode(
  bytes: Uint8Array,
  mime: string | undefined,
  mode: BodyViewMode,
): BodyText | null {
  if (mode === 'hex') {
    return null;
  }
  if (mode === 'auto') {
    return detectTextBody(bytes, mime);
  }
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return mode === 'json'
    ? { text: formatJsonBody(decoded) ?? decoded, language: 'json' }
    : { text: decoded, language: 'plaintext' };
}

export function toHexDump(bytes: Uint8Array, bytesPerLine = 16): string {
  const lines: string[] = [];
  const lineWidth = Math.max(4, bytesPerLine);
  for (let offset = 0; offset < bytes.length; offset += lineWidth) {
    const slice = bytes.subarray(offset, offset + lineWidth);
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(slice, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(
      `${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(lineWidth * 3 - 1, ' ')}  ${ascii}`,
    );
  }
  return lines.join('\n');
}
