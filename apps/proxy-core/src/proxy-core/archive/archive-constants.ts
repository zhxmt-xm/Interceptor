/**
 * 原生 archive 格式与无损调度常量。
 *
 * archive 是版本化 ZIP：manifest.json + 一致 SQLite 快照（capture.sqlite）+ 内容寻址
 * Blob（blobs/<sha256>）。导入校验路径、格式、CRC 与内容 hash；不限制数据大小或数量。
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

/** SHA-256 内容寻址 hash 的严格字符串格式。 */
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
