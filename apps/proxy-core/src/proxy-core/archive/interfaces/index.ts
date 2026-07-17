import type { ReadStream } from 'node:fs';

import type {
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../storage/interfaces';

/**
 * ArchiveService 所需的 Storage 门面。
 *
 * 导出只依赖一致快照 + 引用 Blob 枚举/流读；导入复用现有内容寻址写入与隔离 Session
 * 清理路径。ArchiveService 不直接触碰活动 SQLite 连接或 Blob 磁盘布局。
 */
export interface ArchiveStorage {
  /** 通过 SQLite VACUUM INTO 生成一致数据库快照。 */
  snapshot(targetPath: string): Promise<void>;
  /** 枚举仍被引用的去重 Blob hash。 */
  referencedBlobHashes(): Promise<string[]>;
  /** 打开一个内容寻址 Blob 的只读流。 */
  openBlobStream(hash: string): ReadStream;
  /** 把导入正文写入内容寻址 Blob Store。 */
  writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<{ hash: string; size: number; deduplicated: boolean }>;
  /** 建立一次 archive 导入对应的隔离 Capture Session。 */
  ensureSession(session: CaptureSessionInput): Promise<void>;
  /** 分批持久化从快照读出的 Exchange。 */
  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]>;
  /** 追加 WebSocket 有序应用消息。 */
  appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<void>;
  /** 在导入失败或取消时回滚新建 Session。 */
  cleanup(scope: CleanupScope): Promise<unknown>;
}

export interface ArchiveManifestFile {
  /** archive 内条目相对路径。 */
  readonly path: string;
  /** 解压后字节数。 */
  readonly size: number;
  /** 内容 SHA-256（小写十六进制）。 */
  readonly sha256: string;
}

export interface ArchiveManifest {
  /** 稳定格式标识。 */
  readonly format: string;
  /** archive 容器版本。 */
  readonly archiveVersion: number;
  /** 快照对应的 Capture 数据库 schema 版本。 */
  readonly schemaVersion: number;
  /** 产生 archive 的应用版本。 */
  readonly appVersion: string;
  /** ISO 8601 创建时间。 */
  readonly createdAt: string;
  /** 除 manifest 自身外的全部条目及其大小/hash。 */
  readonly files: readonly ArchiveManifestFile[];
}

/** 从 ZIP central directory 解析出的单条目原始记录。 */
export interface ZipCentralEntry {
  /** 条目名（未清洗，按原始字节 UTF-8 解码）。 */
  readonly name: string;
  /** 压缩方法（仅允许 0=store / 8=deflate）。 */
  readonly method: number;
  /** 声明的 CRC-32。 */
  readonly crc32: number;
  /** 声明的压缩字节数。 */
  readonly compressedSize: number;
  /** 声明的解压字节数。 */
  readonly uncompressedSize: number;
  /** 本地文件头在文件中的偏移。 */
  readonly localHeaderOffset: number;
  /** 通用位标志（bit 0 加密 / bit 3 数据描述符）。 */
  readonly flag: number;
  /** 外部属性（高 16 位含 Unix 权限/文件类型，用于识别符号链接）。 */
  readonly externalAttributes: number;
}

/** 已通过全部解压前安全校验、可安全提取的条目。 */
export interface ValidatedZipEntry extends ZipCentralEntry {
  /** 已确认安全的相对路径（无绝对、无穿越、无反斜杠）。 */
  readonly safeName: string;
}

export interface ArchiveTransferProgress {
  readonly processed: number;
  readonly total: number;
}

export type ArchiveProgressListener = (
  progress: ArchiveTransferProgress,
) => void;

export interface ArchiveTransferResult extends ArchiveTransferProgress {
  readonly warnings: string[];
}
