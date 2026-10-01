import { createHash } from 'node:crypto';
import path from 'node:path';

import type { ClientAppIdentity } from '@interceptor/core-protocol';
import { CLIENT_APP_ID_LENGTH } from '../internal/constants';

/** Derive a stable application id with Windows path case normalization. */
export function toClientAppId(imagePath: string): string {
  return createHash('sha256')
    .update(imagePath.toLowerCase())
    .digest('hex')
    .slice(0, CLIENT_APP_ID_LENGTH);
}

export function toClientAppName(displayName: string | undefined, imagePath: string): string {
  const trimmed = displayName?.trim() ?? '';
  if (trimmed.length > 0) return trimmed;
  return path.win32.basename(imagePath, path.win32.extname(imagePath));
}

/** Native TSV columns: source port, process id, display name and application identity. */
export function parseAppsByPort(output: string): Map<number, ClientAppIdentity> {
  const appByPort = new Map<number, ClientAppIdentity>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length === 0) continue;
    const columns = line.split('\t');
    const sourcePort = Number(columns[0]);
    const displayName = columns[2] ?? '';
    const imagePath = columns[3] ?? '';
    const identity = imagePath.length > 0 ? imagePath : displayName;
    if (!Number.isInteger(sourcePort) || sourcePort <= 0 || identity.length === 0) continue;
    appByPort.set(sourcePort, {
      id: toClientAppId(identity),
      name: toClientAppName(displayName, imagePath),
      path: imagePath,
    });
  }
  return appByPort;
}
