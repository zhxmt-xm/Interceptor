import { createWriteStream } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';

import {
  ALLOWED_ZIP_METHODS,
} from './constants';
import { InvalidArchiveError } from './errors';
import type { ValidatedZipEntry, ZipCentralEntry } from '../interfaces';
import {
  assertSafeEntryName,
  crc32Final,
  crc32Init,
  crc32Push,
  isAllowedEntryName,
  isSymlinkEntry,
} from '../utils';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MAX_SCAN = 22 + 0xffff;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

/**
 * 依赖零新增的最小 ZIP 读取器。
 *
 * 只信任 central directory：先解析全部条目，在提取任何字节前完成路径穿越、符号链接、
 * 加密位和压缩方法；提取时按声明大小逐条校验 CRC-32，拒绝损坏或谎报大小的数据。
 * 不支持 ZIP64（本产品写入器也不产生），遇到即拒绝。
 */
export class ZipReader {
  /** 只读文件句柄（由调用方创建并负责关闭）。 */
  private readonly handle: FileHandle;
  /** archive 文件总字节数。 */
  private readonly fileSize: number;
  /** 解析出的原始 central directory 条目。 */
  private entries: ZipCentralEntry[] = [];

  constructor(handle: FileHandle, fileSize: number) {
    this.handle = handle;
    this.fileSize = fileSize;
  }

  /** 定位 EOCD、读取并解析 central directory 全部条目。 */
  async open(): Promise<void> {
    const { centralOffset, centralSize, count } = await this.readEndOfCentralDirectory();
    if (centralOffset + centralSize > this.fileSize) {
      throw new InvalidArchiveError('Archive central directory is out of range.');
    }
    const buffer = Buffer.alloc(centralSize);
    await this.handle.read(buffer, 0, centralSize, centralOffset);
    this.entries = this.parseCentralDirectory(buffer, count);
  }

  /**
   * 在提取前对全部条目执行安全校验，返回可安全提取的条目。
   * 任一条违规立即整体拒绝。
   */
  validate(): ValidatedZipEntry[] {
    const seen = new Set<string>();
    const validated: ValidatedZipEntry[] = [];
    for (const entry of this.entries) {
      if ((entry.flag & 0x1) === 0x1) {
        throw new InvalidArchiveError('Archive entries must not be encrypted.');
      }
      if (!ALLOWED_ZIP_METHODS.includes(entry.method)) {
        throw new InvalidArchiveError('Archive uses an unsupported compression method.');
      }
      if (isSymlinkEntry(entry.externalAttributes)) {
        throw new InvalidArchiveError('Archive must not contain symbolic links.');
      }
      const safeName = assertSafeEntryName(entry.name);
      if (!isAllowedEntryName(safeName)) {
        throw new InvalidArchiveError(`Archive contains an unexpected entry: ${safeName}`);
      }
      if (seen.has(safeName)) {
        throw new InvalidArchiveError('Archive contains duplicate entries.');
      }
      seen.add(safeName);
      if (
        entry.localHeaderOffset >= this.fileSize ||
        entry.compressedSize > this.fileSize
      ) {
        throw new InvalidArchiveError('Archive entry offset is out of range.');
      }
      validated.push({ ...entry, safeName });
    }
    return validated;
  }

  /**
   * 提取单个已校验条目到目标路径：按声明大小设硬上限、流式解压并逐条校验 CRC-32 与大小。
   * 目标文件必须不存在（wx）。
   */
  async extractEntry(entry: ValidatedZipEntry, destPath: string): Promise<void> {
    const dataOffset = await this.resolveDataOffset(entry);
    const end = dataOffset + entry.compressedSize - 1;
    if (dataOffset + entry.compressedSize > this.fileSize) {
      throw new InvalidArchiveError('Archive entry data is truncated.');
    }

    const source = entry.compressedSize === 0
      ? PassThrough.from([])
      : this.handle.createReadStream({
          start: dataOffset,
          end,
          autoClose: false,
        });
    const decompressor = entry.method === 8 ? createInflateRaw() : new PassThrough();

    let crcState = crc32Init();
    let written = 0;
    const meter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        written += chunk.length;
        if (written > entry.uncompressedSize) {
          callback(new InvalidArchiveError('Archive entry expands beyond its declared size.'));
          return;
        }
        crcState = crc32Push(crcState, chunk);
        callback(null, chunk);
      },
    });
    const sink = createWriteStream(destPath, { flags: 'wx' });

    await pipeline(source, decompressor, meter, sink);

    if (written !== entry.uncompressedSize) {
      throw new InvalidArchiveError('Archive entry size does not match its header.');
    }
    if (crc32Final(crcState) !== entry.crc32) {
      throw new InvalidArchiveError('Archive entry failed its checksum.');
    }
  }

  /** 读取本地文件头以定位实际数据偏移（本地 name/extra 长度可能与 central 不同）。 */
  private async resolveDataOffset(entry: ValidatedZipEntry): Promise<number> {
    const header = Buffer.alloc(30);
    await this.handle.read(header, 0, 30, entry.localHeaderOffset);
    if (header.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
      throw new InvalidArchiveError('Archive local header is corrupt.');
    }
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    return entry.localHeaderOffset + 30 + nameLength + extraLength;
  }

  /** 从文件末尾扫描 EOCD 并解析 central directory 位置/大小/条目数。 */
  private async readEndOfCentralDirectory(): Promise<{
    centralOffset: number;
    centralSize: number;
    count: number;
  }> {
    if (this.fileSize < 22) {
      throw new InvalidArchiveError('Archive is too small to be valid.');
    }
    const scanLength = Math.min(this.fileSize, EOCD_MAX_SCAN);
    const tail = Buffer.alloc(scanLength);
    await this.handle.read(tail, 0, scanLength, this.fileSize - scanLength);
    let eocd = -1;
    for (let i = scanLength - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new InvalidArchiveError('Archive end-of-central-directory not found.');
    }
    const count = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (
      count === UINT16_MAX ||
      centralSize === UINT32_MAX ||
      centralOffset === UINT32_MAX
    ) {
      throw new InvalidArchiveError('ZIP64 archives are not supported.');
    }
    return { centralOffset, centralSize, count };
  }

  /** 解析 central directory 字节为条目记录，拒绝畸形记录。 */
  private parseCentralDirectory(buffer: Buffer, count: number): ZipCentralEntry[] {
    const entries: ZipCentralEntry[] = [];
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > buffer.length) {
        throw new InvalidArchiveError('Archive central directory is truncated.');
      }
      if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
        throw new InvalidArchiveError('Archive central directory record is corrupt.');
      }
      const flag = buffer.readUInt16LE(cursor + 8);
      const method = buffer.readUInt16LE(cursor + 10);
      const crc32 = buffer.readUInt32LE(cursor + 16);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const uncompressedSize = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
      const nameStart = cursor + 46;
      if (nameStart + nameLength > buffer.length) {
        throw new InvalidArchiveError('Archive central directory name is truncated.');
      }
      const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
      entries.push({
        name,
        method,
        crc32,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        flag,
        externalAttributes: buffer.readUInt32LE(cursor + 38),
      });
      cursor = nameStart + nameLength + extraLength + commentLength;
    }
    return entries;
  }
}
