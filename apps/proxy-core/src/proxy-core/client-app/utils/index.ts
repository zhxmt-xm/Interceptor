import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  CLIENT_APP_ID_LENGTH,
  CLIENT_APP_LOOKUP_MAX_OUTPUT_BYTES,
  CLIENT_APP_LOOKUP_TIMEOUT_MS,
} from '../client-app-constants';
import type { ClientAppIdentity, ClientAppLookupRunner } from '../interfaces';

const execFileAsync = promisify(execFile);

/** 生产运行器：无 shell 调用本机进程反查 helper，输出按 UTF-8 解码。 */
export const clientAppLookupRunner: ClientAppLookupRunner = async (
  helperPath,
  args,
) => {
  const { stdout } = await execFileAsync(helperPath, [...args], {
    encoding: 'utf8',
    maxBuffer: CLIENT_APP_LOOKUP_MAX_OUTPUT_BYTES,
    timeout: CLIENT_APP_LOOKUP_TIMEOUT_MS,
    windowsHide: true,
  });
  return stdout;
};

/** 由可执行文件路径派生稳定应用 id；大小写归一以适配 Windows 路径。 */
export function toClientAppId(imagePath: string): string {
  return createHash('sha256')
    .update(imagePath.toLowerCase())
    .digest('hex')
    .slice(0, CLIENT_APP_ID_LENGTH);
}

/**
 * 判断客户端地址是否来自本机；只有本机连接才存在可反查的本地进程，
 * 远程设备（手机等）经代理连入时不做反查。
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) {
    return false;
  }
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return normalized === '::1' || normalized.startsWith('127.');
}

/** 优先使用可执行文件自带显示名，缺失时回退到不含扩展名的文件名。 */
export function toClientAppName(
  displayName: string | undefined,
  imagePath: string,
): string {
  const trimmed = displayName?.trim() ?? '';
  if (trimmed.length > 0) {
    return trimmed;
  }
  return path.basename(imagePath, path.extname(imagePath));
}

/**
 * 把 helper 的 TSV 输出解析成「客户端源端口 → 应用」表。
 * 每行格式为 `源端口 \t 进程 ID \t 显示名 \t 可执行文件路径`；路径为空表示进程不可读
 * （通常是系统权限进程），该行直接丢弃而不是伪造条目。
 */
export function parseAppsByPort(
  output: string,
): Map<number, ClientAppIdentity> {
  const appByPort = new Map<number, ClientAppIdentity>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length === 0) {
      continue;
    }
    const columns = line.split('\t');
    const sourcePort = Number(columns[0]);
    const imagePath = columns[3] ?? '';
    if (!Number.isInteger(sourcePort) || sourcePort <= 0 || imagePath.length === 0) {
      continue;
    }
    appByPort.set(sourcePort, {
      id: toClientAppId(imagePath),
      name: toClientAppName(columns[2], imagePath),
      path: imagePath,
    });
  }
  return appByPort;
}
