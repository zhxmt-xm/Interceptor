import { mkdtemp, rm } from 'node:fs/promises';
import { get } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { getLocal, type AbortedRequest, type BodyData } from 'mockttp';
import { afterEach, beforeEach, expect, it } from 'vitest';

let mockttpServer: ReturnType<typeof getLocal>;
let abortedRequests: AbortedRequest[];
let responseBodies: BodyData[];

beforeEach(async () => {
  abortedRequests = [];
  responseBodies = [];
  mockttpServer = getLocal({ recordTraffic: false });
  await mockttpServer.on('abort', (request) => abortedRequests.push(request));
  await mockttpServer.on('response-body-data', (body) => responseBodies.push(body));
  await mockttpServer.start();
});

afterEach(async () => {
  await mockttpServer.stop();
});

it('keeps a live pre-response failure as the existing 500 error response', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-response-error-'));
  try {
    await mockttpServer.forGet('/missing').thenFromFile(200, path.join(directory, 'not-created.txt'));
    const response = await readResponse(`${mockttpServer.url}/missing`);
    expect(response.statusCode).toBe(500);
    expect(response.complete).toBe(true);
    expect(response.body).toContain('ENOENT');
    expect(response.body).toContain('not-created.txt');
    expect(abortedRequests).toEqual([]);
    await expect.poll(() => responseBodies.some((body) => body.isEnded)).toBe(true);
    expect(Buffer.concat(responseBodies.map((body) => body.content)).toString('utf8')).toBe(response.body);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('keeps a completed normal response out of the abort path', async () => {
  await mockttpServer.forGet('/complete').thenReply(200, 'complete body');
  await expect(readResponse(`${mockttpServer.url}/complete`)).resolves.toEqual({
    statusCode: 200, body: 'complete body', complete: true,
  });
  await expect.poll(() => responseBodies.some((body) => body.isEnded)).toBe(true);
  expect(abortedRequests).toEqual([]);
  expect(Buffer.concat(responseBodies.map((body) => body.content)).toString('utf8')).toBe('complete body');
});

it('preserves an explicit AbortError and does not turn a close rule into a 500', async () => {
  await mockttpServer.forGet('/close').thenCloseConnection();
  await expect(readResponse(`${mockttpServer.url}/close`)).rejects.toThrow();
  await expect.poll(() => abortedRequests[0]?.error?.code).toBe('E_RULE_CLOSE');
  expect(abortedRequests).toHaveLength(1);
  expect(Buffer.concat(responseBodies.map((body) => body.content))).toHaveLength(0);
});

it('preserves an existing stream AbortError after response headers have been sent', async () => {
  const source = new PassThrough();
  const chunks: Buffer[] = [];
  try {
    await mockttpServer.forGet('/stream').thenStream(200, source, {
      'content-type': 'text/plain',
      'transfer-encoding': 'chunked',
    });
    const response = readResponse(`${mockttpServer.url}/stream`, chunks);
    void response.catch(() => undefined);
    source.write('received prefix');
    await expect.poll(() => Buffer.concat(chunks).toString('utf8')).toBe('received prefix');
    source.destroy(new Error('controlled stream failure'));
    await expect(response).rejects.toThrow();
    await expect.poll(() => abortedRequests[0]?.error?.code).toBe('STREAM_RULE_ERROR');
    expect(abortedRequests).toHaveLength(1);
    expect(Buffer.concat(chunks).toString('utf8')).toBe('received prefix');
  } finally {
    source.destroy();
  }
});

function readResponse(url: string, chunks: Buffer[] = []): Promise<{
  statusCode: number | undefined;
  body: string;
  complete: boolean;
}> {
  return new Promise((resolve, reject) => {
    const request = get(url, { agent: false }, (response) => {
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.once('error', reject);
      response.once('end', () => resolve({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
        complete: response.complete,
      }));
    });
    request.once('error', reject);
  });
}
