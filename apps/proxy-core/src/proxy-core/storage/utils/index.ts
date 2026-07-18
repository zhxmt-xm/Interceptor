import { createWriteStream, promises as fs } from 'node:fs';
import type {
  StorageKeysetCursor,
} from '../interfaces';
import { InvalidCursorError } from '../storage-invalid-cursor-error';

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
