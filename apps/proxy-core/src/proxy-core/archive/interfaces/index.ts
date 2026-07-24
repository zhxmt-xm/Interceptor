import type {
  CaptureArchiveSnapshot,
  CaptureSnapshotBatch,
  CaptureSnapshotExchange,
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
  /** 捕获用户点击时的 Exchange/Body 时间切面。 */
  createArchiveSnapshot(batchSize: number): CaptureArchiveSnapshot;
  /** 打开一个临时正文异步字节流；可来自内存或 spill 文件。 */
  openBlobStream(hash: string): AsyncIterable<Uint8Array>;
  /** 把导入正文写入内容寻址 TemporaryBodyStore。 */
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

/** 一次性 Archive Worker 的启动参数。 */
export interface ArchiveWorkerData {
  readonly mode: 'export' | 'import';
  readonly snapshotPath: string;
}

/** Core 向一次性 Archive Worker 发出的有界请求。 */
export type ArchiveWorkerRequest =
  | { readonly kind: 'append-batch'; readonly batch: CaptureSnapshotBatch }
  | { readonly kind: 'read-batch'; readonly cursor?: string; readonly limit: number }
  | { readonly kind: 'finish' };

/** Archive SQLite 快照的一页 Exchange。 */
export interface ArchiveSnapshotPage {
  readonly exchanges: readonly CaptureSnapshotExchange[];
  readonly total: number;
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

/** Archive Worker 生命周期与请求响应。 */
export type ArchiveWorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'fatal'; readonly message: string }
  | {
      readonly type: 'result';
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly type: 'result';
      readonly ok: false;
      readonly error: { readonly name: string; readonly message: string };
    };

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
