import { execFile, type ExecFileException } from 'node:child_process';
import { parseUpstreamProxySettings } from '@interceptor/core-protocol';

import { SystemProxyError, WpadNotFoundError } from '../internal/errors';

const DISCOVERY_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const ERROR_WINHTTP_AUTODETECTION_FAILED = 12180;

/** Discover through the Windows helper without changing WinINet or downloading the PAC. */
export async function discoverWpadPacUrl(helperPath: string): Promise<string> {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(helperPath, ['discover-wpad'], {
      encoding: 'utf8', windowsHide: true, timeout: DISCOVERY_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES,
    }, (error, output, stderr) => {
      // execFile completes after the child and its output streams have closed, including on timeout.
      if (error) reject(readDiscoveryError(error, stderr));
      else resolve(output);
    });
  });
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new SystemProxyError('Windows helper returned an invalid WPAD response.');
  }
  if (!isRecord(value) || Object.keys(value).length !== 1
    || typeof value.pacUrl !== 'string' || !value.pacUrl.trim()) {
    throw new SystemProxyError('Windows helper returned an invalid WPAD response.');
  }
  const settings = parseUpstreamProxySettings({ mode: 'pac', url: value.pacUrl });
  if (settings.mode !== 'pac') throw new SystemProxyError('The Windows WPAD PAC URL is invalid.');
  return settings.url;
}

function readDiscoveryError(error: ExecFileException, stderr: string): Error {
  if (error.killed && error.signal === 'SIGTERM' && (error.code === null || error.code === undefined)) {
    return new SystemProxyError(`Windows WPAD discovery timed out after ${DISCOVERY_TIMEOUT_MS} ms.`);
  }
  if (error.code !== 1) return error;
  let value: unknown;
  try {
    value = JSON.parse(stderr);
  } catch {
    return new SystemProxyError('Windows helper returned an invalid WPAD error response.');
  }
  if (!isRecord(value) || Object.keys(value).length !== 1
    || typeof value.win32Error !== 'number' || !Number.isInteger(value.win32Error) || value.win32Error <= 0) {
    return new SystemProxyError('Windows helper returned an invalid WPAD error response.');
  }
  if (value.win32Error === ERROR_WINHTTP_AUTODETECTION_FAILED) return new WpadNotFoundError();
  return new SystemProxyError(`Windows WPAD discovery failed (Win32 error ${value.win32Error}).`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
