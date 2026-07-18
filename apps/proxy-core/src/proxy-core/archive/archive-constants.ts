/**
 * 原生 archive 格式常量与安全上限。
 *
 * archive 是版本化 ZIP：manifest.json + 一致 SQLite 快照（capture.sqlite）+ 内容寻址
 * Blob（blobs/<sha256>）。所有上限用于把不可信 ZIP 当作攻击输入处理——解压前即校验
 * 路径、条目数、单条与总解压字节、压缩比，防目录穿越与 zip bomb。
 */

/** manifest 声明的稳定格式标识。 */
export const ARCHIVE_FORMAT = 'interceptor-capture-archive';
/** 当前 archive 容器版本；导入时只接受已知版本。 */
export const ARCHIVE_VERSION = 1;
/** Renderer 系统对话框使用的原生 archive 扩展名。 */
export const ARCHIVE_EXTENSION = '.iarchive';

/** manifest 条目名。 */
export const MANIFEST_ENTRY_NAME = 'manifest.json';
/** SQLite 快照条目名。 */
export const SNAPSHOT_ENTRY_NAME = 'capture.sqlite';
/** Blob 条目目录前缀。 */
export const BLOB_ENTRY_PREFIX = 'blobs/';

/** 允许的压缩方法：0=store、8=deflate。 */
export const ALLOWED_ZIP_METHODS: readonly number[] = [0, 8];

/** 导入源 ZIP 文件（压缩后）最大字节数。 */
export const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024 - 1;
/** archive 内最多条目数。 */
export const MAX_ARCHIVE_ENTRIES = 500_000;
/** 单条目解压后最大字节数（SQLite 快照可能接近全局配额）。 */
export const MAX_ENTRY_UNCOMPRESSED_BYTES = 3 * 1024 * 1024 * 1024;
/** 所有条目解压后总字节上限（zip bomb 绝对护栏）。 */
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 6 * 1024 * 1024 * 1024;
/** 单条目允许的最大压缩比（解压/压缩），超过视为 zip bomb 拒绝。 */
export const MAX_COMPRESSION_RATIO = 300;
/** manifest.json 解压后最大字节数（含大文件列表时的上限）。 */
export const MAX_MANIFEST_BYTES = 256 * 1024 * 1024;

/** 导出时每页枚举的 Exchange 数量。 */
export const ARCHIVE_EXPORT_PAGE_SIZE = 500;
/** 导入时每批持久化的 Exchange 数量。 */
export const ARCHIVE_IMPORT_BATCH_SIZE = 100;
/** WebSocket 帧导入时每页读取数量。 */
export const ARCHIVE_WS_FRAME_PAGE_SIZE = 500;
/** 逐块读取 Blob / 条目字节的块大小。 */
export const ARCHIVE_CHUNK_BYTES = 1024 * 1024;
/** Core 与一次性 Archive Worker 间每批 Exchange 数量。 */
export const ARCHIVE_WORKER_BATCH_SIZE = 100;
/** 单次 Archive Worker 请求超时。 */
export const ARCHIVE_WORKER_REQUEST_TIMEOUT_MS = 30_000;

/** SHA-256 内容寻址 hash 的严格字符串格式。 */
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
