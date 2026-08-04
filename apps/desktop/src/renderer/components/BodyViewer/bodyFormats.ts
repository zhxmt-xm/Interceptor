/**
 * 正文预览的两个维度：`kind` 是内容本身是什么（由 MIME + 内容探测决定），
 * `mode` 是用哪个视图看它。切换 mode 不得改变 kind，否则 MIME/体积标签会跟着视图跳变。
 */
export type BodyKind =
  | 'json'
  | 'code'
  | 'text'
  | 'image'
  | 'markdown'
  | 'form'
  | 'media'
  | 'binary';

export type BodyMode = 'default' | 'tree' | 'raw' | 'hex' | 'split' | 'source';

/** Monaco language ids the viewer can select from a MIME type. */
export type BodyLanguage =
  | 'json'
  | 'html'
  | 'xml'
  | 'javascript'
  | 'css'
  | 'yaml'
  | 'markdown'
  | 'plaintext';

export interface BodyFormat {
  kind: BodyKind;
  language: BodyLanguage;
  /** 可选档位，顺序即 Segmented 的显示顺序；首项不一定是默认档。 */
  modes: BodyMode[];
  /** 打开时选中的档位。 */
  defaultMode: BodyMode;
}

/** 档位名是技术术语（Pretty/Raw/Hex…），与 JSON、Hex 同类，不进 i18n catalog。 */
const MODE_LABELS: Record<BodyKind, Partial<Record<BodyMode, string>>> = {
  json: { default: 'Pretty', tree: 'Tree', raw: 'Raw', hex: 'Hex' },
  code: { default: 'Code', raw: 'Raw', hex: 'Hex' },
  text: { default: 'Text', hex: 'Hex' },
  image: { default: 'Preview', hex: 'Hex' },
  markdown: { default: 'Preview', split: 'Split', source: 'Source', hex: 'Hex' },
  form: { default: 'Form', raw: 'Raw', hex: 'Hex' },
  binary: { raw: 'Text', hex: 'Hex' },
  media: {},
};

export function modeLabel(kind: BodyKind, mode: BodyMode): string {
  return MODE_LABELS[kind][mode] ?? mode;
}

function essenceOf(mime: string | undefined): string {
  return mime?.split(';')[0]?.trim().toLowerCase() ?? '';
}

/** 工具行只展示 MIME 与字符集，其余参数（boundary 等）对读者没有价值。 */
export function formatMediaType(mime: string | undefined): string {
  const essence = essenceOf(mime);
  const charset = /charset=([^;]+)/i.exec(mime ?? '')?.[1]?.trim();
  return charset ? `${essence} · ${charset}` : essence;
}

export function isJsonMime(mime: string | undefined): boolean {
  const essence = essenceOf(mime);
  return essence === 'application/json'
    || essence.endsWith('+json')
    || essence === 'application/x-ndjson'
    || essence === 'application/json-seq'
    || essence === 'application/x-json-stream';
}

/** 音视频正文不进入 Renderer 预览，只允许 Core 流式保存。 */
export function isMediaMime(mime: string | undefined): boolean {
  const essence = essenceOf(mime);
  return essence.startsWith('video/') || essence.startsWith('audio/');
}

/** SVG 是可执行 XML，按代码显示而不是交给 `<img>`。 */
export function isSvgMime(mime: string | undefined): boolean {
  return essenceOf(mime) === 'image/svg+xml';
}

export function isImageMime(mime: string | undefined): boolean {
  return essenceOf(mime).startsWith('image/') && !isSvgMime(mime);
}

export function isTextMime(mime: string | undefined): boolean {
  if (!mime) {
    return false;
  }
  const essence = essenceOf(mime);
  return (
    essence.startsWith('text/')
    || isJsonMime(mime)
    || essence === 'application/javascript'
    || essence === 'application/x-javascript'
    || essence === 'application/ecmascript'
    || essence === 'application/xml'
    || essence.endsWith('+xml')
    || essence === 'application/x-www-form-urlencoded'
    || essence === 'application/graphql'
    || essence === 'application/yaml'
    || essence === 'application/x-yaml'
    || essence.endsWith('+yaml')
  );
}

/** 由 MIME 选择语法高亮语言；未知类型按纯文本展示。 */
export function bodyLanguage(mime: string | undefined): BodyLanguage {
  const essence = essenceOf(mime);
  if (isJsonMime(mime)) {
    return 'json';
  }
  if (essence === 'text/html' || essence === 'application/xhtml+xml') {
    return 'html';
  }
  if (
    essence === 'text/xml'
    || essence === 'application/xml'
    || essence.endsWith('+xml')
  ) {
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
  if (
    essence === 'application/yaml'
    || essence === 'application/x-yaml'
    || essence.endsWith('+yaml')
  ) {
    return 'yaml';
  }
  if (essence === 'text/markdown') {
    return 'markdown';
  }
  return 'plaintext';
}

const FORMATS: Record<BodyKind, Omit<BodyFormat, 'kind' | 'language'>> = {
  json: { modes: ['default', 'tree', 'raw', 'hex'], defaultMode: 'default' },
  code: { modes: ['default', 'raw', 'hex'], defaultMode: 'default' },
  text: { modes: ['default', 'hex'], defaultMode: 'default' },
  image: { modes: ['default', 'hex'], defaultMode: 'default' },
  markdown: { modes: ['default', 'split', 'source', 'hex'], defaultMode: 'default' },
  form: { modes: ['default', 'raw', 'hex'], defaultMode: 'default' },
  binary: { modes: ['raw', 'hex'], defaultMode: 'hex' },
  media: { modes: [], defaultMode: 'default' },
};

/** 未知 MIME 时探测内容：合法 UTF-8 且无二进制控制字符才算文本。 */
export function looksLikeText(bytes: Uint8Array): boolean {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  for (const character of decoded) {
    const code = character.charCodeAt(0);
    if (code < 32 && character !== '\n' && character !== '\r' && character !== '\t') {
      return false;
    }
  }
  return true;
}

/** 只把对象/数组根视为 JSON 文档，避免把 `42`、`"text"` 当成 JSON。 */
function looksLikeJson(bytes: Uint8Array): boolean {
  for (const byte of bytes.subarray(0, 64)) {
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue;
    }
    return byte === 0x7b || byte === 0x5b;
  }
  return false;
}

/**
 * 解析正文的展示形态。MIME 是主依据；只有 MIME 缺失或声明为通用二进制时才看内容，
 * 因为服务端谎报 `octet-stream` 比谎报具体类型常见得多。
 */
export function bodyFormat(mime: string | undefined, bytes?: Uint8Array): BodyFormat {
  const kind = resolveKind(mime, bytes);
  return { kind, language: languageFor(kind, mime), ...FORMATS[kind] };
}

function resolveKind(mime: string | undefined, bytes?: Uint8Array): BodyKind {
  if (isMediaMime(mime)) {
    return 'media';
  }
  if (isImageMime(mime)) {
    return 'image';
  }
  if (isJsonMime(mime)) {
    return 'json';
  }
  if (essenceOf(mime) === 'application/x-www-form-urlencoded') {
    return 'form';
  }
  if (essenceOf(mime) === 'text/markdown') {
    return 'markdown';
  }
  const language = bodyLanguage(mime);
  if (language !== 'plaintext' && language !== 'markdown') {
    return 'code';
  }
  if (isTextMime(mime)) {
    return 'text';
  }
  if (!bytes) {
    return 'binary';
  }
  if (!looksLikeText(bytes)) {
    return 'binary';
  }
  return looksLikeJson(bytes) ? 'json' : 'text';
}

function languageFor(kind: BodyKind, mime: string | undefined): BodyLanguage {
  if (kind === 'json') {
    return 'json';
  }
  if (kind === 'markdown') {
    return 'markdown';
  }
  // SVG 落在 code 上但 MIME 是 image/svg+xml，bodyLanguage 已按 +xml 归到 xml。
  return bodyLanguage(mime);
}
