import path from 'node:path';

import {
  ARCHIVE_FORMAT,
  BLOB_ENTRY_PREFIX,
  MANIFEST_ENTRY_NAME,
  SHA256_PATTERN,
  SNAPSHOT_ENTRY_NAME,
} from '../archive-constants';
import { ArchiveInvalidError } from '../archive-invalid-error';
import type { ArchiveManifest, ArchiveManifestFile } from '../interfaces';

// ===== CRC-32（IEEE 802.3，ZIP 使用）=====

let crcTable: Uint32Array | null = null;

/** 惰性构建 CRC-32 查表。 */
function crc32Table(): Uint32Array {
  if (crcTable) {
    return crcTable;
  }
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** CRC-32 运行态初值。 */
export function crc32Init(): number {
  return 0xffffffff;
}

/** 向 CRC-32 运行态推入一段字节。 */
export function crc32Push(state: number, chunk: Uint8Array): number {
  const table = crc32Table();
  let c = state;
  for (let i = 0; i < chunk.length; i += 1) {
    c = table[(c ^ chunk[i]!) & 0xff]! ^ (c >>> 8);
  }
  return c >>> 0;
}

/** 从 CRC-32 运行态得到最终值。 */
export function crc32Final(state: number): number {
  return (state ^ 0xffffffff) >>> 0;
}

/** 一次性计算一段数据的 CRC-32。 */
export function crc32(data: Uint8Array): number {
  return crc32Final(crc32Push(crc32Init(), data));
}

// ===== 条目名安全校验 =====

/**
 * 校验 ZIP 条目名不含绝对路径、驱动器前缀、反斜杠、NUL 或 `.`/`..` 段。
 * 解压前对每个条目调用，任何异常都阻止后续提取。返回安全的相对名。
 */
export function assertSafeEntryName(name: string): string {
  if (!name) {
    throw new ArchiveInvalidError('Archive entry name must not be empty.');
  }
  if (name.includes('\\') || name.includes('\0')) {
    throw new ArchiveInvalidError('Archive entry name has illegal characters.');
  }
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) {
    throw new ArchiveInvalidError('Archive entry name must be relative.');
  }
  for (const segment of name.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new ArchiveInvalidError('Archive entry name traverses directories.');
    }
  }
  return name;
}

/** 是否为 archive 允许的条目名（manifest、快照或 blobs/<sha256>）。 */
export function isAllowedEntryName(name: string): boolean {
  if (name === MANIFEST_ENTRY_NAME || name === SNAPSHOT_ENTRY_NAME) {
    return true;
  }
  if (name.startsWith(BLOB_ENTRY_PREFIX)) {
    return SHA256_PATTERN.test(name.slice(BLOB_ENTRY_PREFIX.length));
  }
  return false;
}

/** 依据 ZIP 外部属性判断条目是否为符号链接（Unix S_IFLNK）。 */
export function isSymlinkEntry(externalAttributes: number): boolean {
  return ((externalAttributes >>> 16) & 0xf000) === 0xa000;
}

// ===== manifest =====

/** 构建导出 manifest。 */
export function buildManifest(
  appVersion: string,
  files: readonly ArchiveManifestFile[],
): ArchiveManifest {
  return {
    format: ARCHIVE_FORMAT,
    appVersion,
    createdAt: new Date().toISOString(),
    files: [...files],
  };
}

/** 判断值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 严格解析并校验一条 manifest 文件记录。 */
function parseManifestFile(value: unknown): ArchiveManifestFile {
  if (!isRecord(value)) {
    throw new ArchiveInvalidError('Archive manifest file entry is malformed.');
  }
  const { path: entryPath, size, sha256 } = value;
  if (typeof entryPath !== 'string' || !isAllowedEntryName(entryPath)) {
    throw new ArchiveInvalidError('Archive manifest lists an unexpected path.');
  }
  assertSafeEntryName(entryPath);
  if (
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < 0
  ) {
    throw new ArchiveInvalidError('Archive manifest declares an invalid size.');
  }
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
    throw new ArchiveInvalidError('Archive manifest declares an invalid hash.');
  }
  return { path: entryPath, size, sha256 };
}

/**
 * 严格解析 manifest.json：只接受当前固定字段集合与格式标识。
 */
export function parseManifest(bytes: Buffer): ArchiveManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ArchiveInvalidError('Archive manifest is not valid JSON.');
  }
  if (!isRecord(raw)) {
    throw new ArchiveInvalidError('Archive manifest must be an object.');
  }
  const allowedKeys = new Set(['format', 'appVersion', 'createdAt', 'files']);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new ArchiveInvalidError('Archive manifest contains unexpected fields.');
  }
  const { format, appVersion, createdAt, files } = raw;
  if (format !== ARCHIVE_FORMAT) {
    throw new ArchiveInvalidError('Unknown archive format.');
  }
  if (typeof appVersion !== 'string') {
    throw new ArchiveInvalidError('Archive manifest app version is invalid.');
  }
  if (typeof createdAt !== 'string') {
    throw new ArchiveInvalidError('Archive manifest timestamp is invalid.');
  }
  if (!Array.isArray(files)) {
    throw new ArchiveInvalidError('Archive manifest file list is invalid.');
  }
  return {
    format,
    appVersion,
    createdAt,
    files: files.map(parseManifestFile),
  };
}

// ===== 通用 =====

/** 在任务已取消时抛出稳定 AbortError。 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('The archive transfer was cancelled.', 'AbortError');
  }
}

/** 将一个 Buffer 包装成单块异步字节序列。 */
export async function* singleChunk(
  data: Buffer,
): AsyncGenerator<Uint8Array> {
  yield data;
}

/** 要求 Core 收到的文件路径为绝对路径和预期扩展名。 */
export function assertTransferPath(filePath: string, extension: string): void {
  if (
    !path.isAbsolute(filePath) ||
    path.extname(filePath).toLowerCase() !== extension
  ) {
    throw new ArchiveInvalidError(
      `Transfer path must be an absolute ${extension} file.`,
    );
  }
}
