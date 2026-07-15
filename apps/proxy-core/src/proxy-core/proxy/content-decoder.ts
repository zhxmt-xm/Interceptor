import { promisify } from 'node:util';
import zlib from 'node:zlib';

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const inflateRaw = promisify(zlib.inflateRaw);
const brotliDecompress = promisify(zlib.brotliDecompress);

/**
 * 支持的 content-encoding 令牌。`identity` 与空值视为无编码，直接跳过。
 * 未列出的编码（如 `compress`）无法解码，按 skipped 原样返回。
 */
const SUPPORTED_ENCODINGS = new Set(['gzip', 'x-gzip', 'deflate', 'br']);

export type BodyDecodeOutcome = 'ok' | 'skipped' | 'failed';

export interface DecodeResult {
  /** ok=已解码；skipped=无/不支持的编码，原样返回；failed=已知编码但解码出错，原样返回。 */
  readonly status: BodyDecodeOutcome;
  readonly data: Uint8Array;
}

/**
 * 按 content-encoding 延迟解码一段正文；仅在 Inspector/规则需要时调用，捕获时不解。
 *
 * Content-Encoding 头列出的是编码的应用顺序（如 `gzip, br` 表示先 gzip 再 br），
 * 故解码须逆序进行。任一层为不支持的编码时整体按 skipped 原样返回；已知编码解码
 * 抛错（数据损坏/截断）时按 failed 返回原始字节，绝不抛给调用方。
 */
export async function decodeBody(
  data: Uint8Array,
  contentEncoding: string | undefined,
): Promise<DecodeResult> {
  const encodings = parseEncodings(contentEncoding);
  if (encodings.length === 0) {
    return { status: 'skipped', data };
  }
  if (encodings.some((encoding) => !SUPPORTED_ENCODINGS.has(encoding))) {
    return { status: 'skipped', data };
  }
  let current = data;
  for (let index = encodings.length - 1; index >= 0; index -= 1) {
    const encoding = encodings[index];
    if (encoding === undefined) {
      continue;
    }
    try {
      current = await decodeOne(current, encoding);
    } catch {
      return { status: 'failed', data };
    }
  }
  return { status: 'ok', data: current };
}

function parseEncodings(header: string | undefined): string[] {
  if (!header) {
    return [];
  }
  return header
    .split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .filter((encoding) => encoding.length > 0 && encoding !== 'identity');
}

async function decodeOne(
  data: Uint8Array,
  encoding: string,
): Promise<Uint8Array> {
  switch (encoding) {
    case 'gzip':
    case 'x-gzip':
      return new Uint8Array(await gunzip(data));
    case 'deflate':
      return new Uint8Array(await inflateMaybeRaw(data));
    case 'br':
      return new Uint8Array(await brotliDecompress(data));
    default:
      // parseEncodings/SUPPORTED_ENCODINGS 已过滤，此处不可达。
      throw new Error(`unsupported content-encoding: ${encoding}`);
  }
}

// `deflate` 可能是 zlib 包裹或裸 DEFLATE 流；先按 zlib 解，失败再按裸流解。
async function inflateMaybeRaw(data: Uint8Array): Promise<Buffer> {
  try {
    return await inflate(data);
  } catch {
    return await inflateRaw(data);
  }
}
