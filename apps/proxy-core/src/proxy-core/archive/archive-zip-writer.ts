import type { FileHandle } from 'node:fs/promises';
import { once } from 'node:events';
import { createDeflateRaw } from 'node:zlib';

import { ArchiveInvalidError } from './archive-invalid-error';
import { crc32Final, crc32Init, crc32Push } from './utils';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const DEFLATE_METHOD = 8;
const VERSION = 20;
const UINT32_MAX = 0xffffffff;

interface WrittenEntry {
  readonly name: Buffer;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

/**
 * 依赖零新增的最小流式 ZIP 写入器。
 *
 * 每个条目：先写占位本地文件头，再流式 deflate 源数据并顺序追加压缩字节（增量计算
 * CRC-32 与两侧大小），完成后回填本地头的 crc/大小；finalize 写 central directory + EOCD。
 * 通过 FileHandle 定位回填，避免使用数据描述符，读取端只需解析权威的 central directory。
 * 全程流式，不把大条目整块读入内存；超 32 位 ZIP 限制时明确拒绝。
 */
export class ArchiveZipWriter {
  /** 目标 archive 的读写文件句柄（由调用方创建并负责关闭/重命名）。 */
  private readonly handle: FileHandle;
  /** 当前写入偏移。 */
  private offset = 0;
  /** 已写入条目的 central directory 记录。 */
  private readonly entries: WrittenEntry[] = [];
  /** finalize 后禁止继续写入。 */
  private finalized = false;

  constructor(handle: FileHandle) {
    this.handle = handle;
  }

  /**
   * 追加一个 deflate 压缩条目，源数据以异步字节序列提供（流式，不整块入内存）。
   * 调用方：ArchiveService 写 manifest/快照/各引用 Blob。
   */
  async addStream(
    name: string,
    source: AsyncIterable<Uint8Array>,
  ): Promise<void> {
    if (this.finalized) {
      throw new Error('ArchiveZipWriter is already finalized.');
    }
    const nameBytes = Buffer.from(name, 'utf8');
    const localHeaderOffset = this.offset;
    const header = this.buildLocalHeader(nameBytes);
    await this.writeAll(header);

    let crcState = crc32Init();
    let uncompressedSize = 0;
    let compressedSize = 0;
    for await (const compressed of this.compress(source, (chunk) => {
      crcState = crc32Push(crcState, chunk);
      uncompressedSize += chunk.length;
    })) {
      compressedSize += compressed.length;
      await this.writeAll(compressed);
    }

    const crc = crc32Final(crcState);
    this.assertWithinLimits(localHeaderOffset, uncompressedSize, compressedSize);
    await this.patchLocalHeader(
      localHeaderOffset,
      crc,
      compressedSize,
      uncompressedSize,
    );
    this.entries.push({
      name: nameBytes,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
  }

  /** 写 central directory 与 EOCD，完成 archive。调用方：ArchiveService 收尾。 */
  async finalize(): Promise<void> {
    if (this.finalized) {
      return;
    }
    this.finalized = true;
    const centralStart = this.offset;
    for (const entry of this.entries) {
      await this.writeAll(this.buildCentralHeader(entry));
    }
    const centralSize = this.offset - centralStart;
    if (centralStart > UINT32_MAX || centralSize > UINT32_MAX) {
      throw new ArchiveInvalidError('Archive exceeds the supported size.');
    }
    await this.writeAll(this.buildEndOfCentralDirectory(centralStart, centralSize));
    await this.handle.sync();
  }

  /** deflate 源字节流并逐块产出压缩输出，同时回调原始（未压缩）块。 */
  private async *compress(
    source: AsyncIterable<Uint8Array>,
    onUncompressed: (chunk: Buffer) => void,
  ): AsyncGenerator<Buffer> {
    const deflate = createDeflateRaw();
    let pumpError: unknown;
    const pump = (async (): Promise<void> => {
      try {
        for await (const chunk of source) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          onUncompressed(buffer);
          if (!deflate.write(buffer)) {
            await once(deflate, 'drain');
          }
        }
        deflate.end();
      } catch (error) {
        pumpError = error;
        deflate.destroy(
          error instanceof Error ? error : new Error('deflate pump failed'),
        );
      }
    })();
    try {
      for await (const output of deflate) {
        yield output as Buffer;
      }
    } finally {
      await pump.catch(() => undefined);
    }
    if (pumpError) {
      throw pumpError;
    }
  }

  /** 构造带占位 crc/大小的本地文件头。 */
  private buildLocalHeader(nameBytes: Buffer): Buffer {
    const header = Buffer.alloc(30 + nameBytes.length);
    header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    header.writeUInt16LE(VERSION, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(DEFLATE_METHOD, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(0, 18);
    header.writeUInt32LE(0, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    nameBytes.copy(header, 30);
    return header;
  }

  /** 回填本地文件头的 crc-32、压缩大小与解压大小。 */
  private async patchLocalHeader(
    headerOffset: number,
    crc: number,
    compressedSize: number,
    uncompressedSize: number,
  ): Promise<void> {
    const patch = Buffer.alloc(12);
    patch.writeUInt32LE(crc, 0);
    patch.writeUInt32LE(compressedSize, 4);
    patch.writeUInt32LE(uncompressedSize, 8);
    await this.handle.write(patch, 0, patch.length, headerOffset + 14);
  }

  /** 构造一条 central directory 记录。 */
  private buildCentralHeader(entry: WrittenEntry): Buffer {
    const record = Buffer.alloc(46 + entry.name.length);
    record.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    record.writeUInt16LE(VERSION, 4);
    record.writeUInt16LE(VERSION, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(DEFLATE_METHOD, 10);
    record.writeUInt16LE(0, 12);
    record.writeUInt16LE(0, 14);
    record.writeUInt32LE(entry.crc32, 16);
    record.writeUInt32LE(entry.compressedSize, 20);
    record.writeUInt32LE(entry.uncompressedSize, 24);
    record.writeUInt16LE(entry.name.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(0, 38);
    record.writeUInt32LE(entry.localHeaderOffset, 42);
    entry.name.copy(record, 46);
    return record;
  }

  /** 构造 End Of Central Directory 记录。 */
  private buildEndOfCentralDirectory(
    centralStart: number,
    centralSize: number,
  ): Buffer {
    const record = Buffer.alloc(22);
    record.writeUInt32LE(EOCD_SIGNATURE, 0);
    record.writeUInt16LE(0, 4);
    record.writeUInt16LE(0, 6);
    record.writeUInt16LE(this.entries.length, 8);
    record.writeUInt16LE(this.entries.length, 10);
    record.writeUInt32LE(centralSize, 12);
    record.writeUInt32LE(centralStart, 16);
    record.writeUInt16LE(0, 20);
    return record;
  }

  /** 拒绝超出 32 位 ZIP 表达范围的偏移/大小。 */
  private assertWithinLimits(
    headerOffset: number,
    uncompressedSize: number,
    compressedSize: number,
  ): void {
    if (
      headerOffset > UINT32_MAX ||
      uncompressedSize > UINT32_MAX ||
      compressedSize > UINT32_MAX ||
      this.offset > UINT32_MAX
    ) {
      throw new ArchiveInvalidError('Archive exceeds the supported size.');
    }
  }

  /** 顺序写入一段字节并推进偏移。 */
  private async writeAll(data: Buffer): Promise<void> {
    await this.handle.write(data, 0, data.length, this.offset);
    this.offset += data.length;
  }
}
