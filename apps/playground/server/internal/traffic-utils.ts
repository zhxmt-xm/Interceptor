import { isUtf8 } from 'node:buffer';
import type { IncomingHttpHeaders, Server } from 'node:http';

import type {
  TrafficResponseFact,
  TrafficScenarioResult,
} from '../interfaces.ts';

export type TrafficExecution = Omit<
  TrafficScenarioResult,
  'durationMs' | 'scenarioId' | 'startedAt'
>;

export function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

export function elapsed(startedAtMs: number): number {
  return Math.round((performance.now() - startedAtMs) * 10) / 10;
}

export function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Traffic Lab origin did not expose a numeric port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

export function responseFact(
  bodyBytes: Buffer,
  headers: Readonly<Record<string, string>>,
  statusCode: number,
  chunkTimingsMs: readonly number[],
  trailers?: Readonly<Record<string, string>>,
): TrafficResponseFact {
  const bodyEncoding = shouldUseUtf8(bodyBytes, headers) ? 'utf8' : 'base64';
  return {
    body: bodyBytes.toString(bodyEncoding),
    bodyBytes: bodyBytes.byteLength,
    bodyEncoding,
    chunkTimingsMs,
    headers,
    statusCode,
    ...(trailers === undefined ? {} : { trailers }),
  };
}

export function stringHeaders(
  headers: IncomingHttpHeaders | Readonly<Record<string, string | string[] | undefined>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(headers).flatMap(([name, value]) => {
    if (value === undefined) return [];
    return [[name, Array.isArray(value) ? value.join(', ') : String(value)]];
  }));
}

function shouldUseUtf8(
  body: Buffer,
  headers: Readonly<Record<string, string>>,
): boolean {
  if (headers['content-encoding'] !== undefined) return false;
  const contentType = headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== undefined) {
    return contentType.startsWith('text/')
      || contentType.endsWith('+json')
      || contentType.endsWith('+xml')
      || contentType === 'application/json'
      || contentType === 'application/x-ndjson'
      || contentType === 'application/xml'
      || contentType === 'application/yaml'
      || contentType === 'application/x-www-form-urlencoded'
      || contentType === 'image/svg+xml';
  }
  return !body.includes(0) && isUtf8(body);
}