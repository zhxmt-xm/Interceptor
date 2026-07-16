import { createWriteStream, promises as fs } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type {
  CaptureExchangeSummary,
  CaptureHeader,
} from '@interceptor/core-protocol';

import { applyMigrations } from '../../migration-runner';
import { BUSY_TIMEOUT_MS } from '../storage-constants';
import type {
  OpenCaptureDatabaseResult,
  StorageHeaderRow,
  StorageKeysetCursor,
  StorageSummaryRow,
  StorageWorkerRequest,
} from '../interfaces';
import { InvalidCursorError } from '../worker/worker-invalid-cursor-error';
import { CAPTURE_MIGRATIONS } from '../worker/worker-schema';
import type { CaptureStore } from '../worker/worker-store';

/** 打开 Capture 数据库、配置 pragma 并执行只向前迁移。 */
export function openCaptureDatabase(
  location: string,
): OpenCaptureDatabaseResult {
  const db = new DatabaseSync(location);
  try {
    configurePragmas(db);
    const migration = applyMigrations(db, CAPTURE_MIGRATIONS);
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}

/** 配置 Capture SQLite 的 WAL、外键、同步与 busy timeout。 */
function configurePragmas(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
}

/** 将一条 Worker 请求分派到 CaptureStore 对应同步操作。 */
export function applyStorageRequest(
  store: CaptureStore,
  request: StorageWorkerRequest,
): unknown {
  switch (request.kind) {
    case 'ensure-session':
      store.ensureSession(request.session);
      return undefined;
    case 'append-exchanges':
      return store.appendExchanges(request.exchanges);
    case 'update-exchange':
      store.updateExchangeResponse(request.patch);
      return undefined;
    case 'query-sessions':
      return store.querySessions(request.query);
    case 'exchange-detail':
      return store.getExchangeDetail(request.exchangeId);
    case 'storage-status':
      return store.getStorageStats();
    case 'cleanup':
      return store.cleanup(request.scope);
    case 'referenced-hashes':
      return store.referencedBlobHashes();
    case 'save-rule-set':
      return store.saveRuleSet(request.expectedRevision, request.rules);
    case 'load-rule-set':
      return store.loadRuleSet();
    case 'append-rule-hits':
      store.appendRuleHits(request.exchangeId, request.hits);
      return undefined;
    case 'append-websocket-frames':
      store.appendWebSocketFrames(request.exchangeId, request.frames);
      return undefined;
    case 'query-websocket-frames':
      return store.queryWebSocketFrames(request.query);
    case 'count-rule-hits':
      return store.countRuleHits();
    case 'close':
      store.close();
      return undefined;
    default: {
      const exhaustive: never = request;
      throw new Error(
        `Unknown storage worker request: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/** 将 SQLite summary row 映射为 Capture Exchange 摘要。 */
export function toStorageSummary(
  row: StorageSummaryRow,
): CaptureExchangeSummary {
  return {
    id: row.id,
    method: row.method,
    secure: row.scheme === 'https' || row.scheme === 'wss',
    host: row.host ?? undefined,
    path: row.path ?? undefined,
    protocol: row.protocol,
    statusCode: row.statusCode ?? undefined,
    responseMime: row.responseMime ?? undefined,
    state: row.state,
    startedAt: row.startedAt,
    durationMs: row.completedAt !== null
      ? Math.max(0, row.completedAt - row.startedAt)
      : undefined,
    requestBytes: row.requestBytes,
    responseBytes: row.responseBytes,
  };
}

/** 将 SQLite header row 映射为 Capture header。 */
export function toStorageHeader(row: StorageHeaderRow): CaptureHeader {
  return row.isPseudo
    ? { name: row.name, value: row.value, isPseudo: true }
    : { name: row.name, value: row.value };
}

/** 编码 Exchange startedAt/seq keyset 游标。 */
export function encodeStorageCursor(startedAt: number, seq: number): string {
  return Buffer.from(`${startedAt}:${seq}`, 'utf8').toString('base64url');
}

/** 解码并校验 Exchange keyset 游标。 */
export function decodeStorageCursor(
  cursor: string | undefined,
): StorageKeysetCursor | null {
  if (cursor === undefined) {
    return null;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new InvalidCursorError();
  }
  const match = /^(\d+):(\d+)$/.exec(decoded);
  if (!match) {
    throw new InvalidCursorError();
  }
  const startedAt = Number(match[1]);
  const seq = Number(match[2]);
  if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(seq)) {
    throw new InvalidCursorError();
  }
  return { startedAt, seq };
}

/** 编码 WebSocket seq 游标。 */
export function encodeWebSocketCursor(seq: number): string {
  return Buffer.from(String(seq), 'utf8').toString('base64url');
}

/** 解码并校验 WebSocket seq 游标。 */
export function decodeWebSocketCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new InvalidCursorError();
  }
  if (!/^\d+$/.test(decoded)) {
    throw new InvalidCursorError();
  }
  const seq = Number(decoded);
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new InvalidCursorError();
  }
  return seq;
}

/** 转义 SQL LIKE 的控制字符。 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** 将用户搜索词转为安全 FTS5 短语。 */
export function toMatchQuery(search: string): string {
  const escaped = search.replace(/"/g, '""');
  return `"${escaped}"`;
}

/** 等待 Node write stream 完成或失败。 */
export function closeWriteStream(
  output: ReturnType<typeof createWriteStream>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    output.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

/** 判断文件系统路径是否存在。 */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** 读取文件字节数；路径消失时返回零。 */
export async function fileSize(target: string): Promise<number> {
  try {
    return (await fs.stat(target)).size;
  } catch {
    return 0;
  }
}
