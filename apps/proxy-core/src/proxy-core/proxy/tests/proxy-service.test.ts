import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CaptureSessionInput, ExchangeInput } from '../../storage/types';
import { ProxyService, type CaptureSink } from '../proxy-service';

class RecordingSink implements CaptureSink {
  readonly sessions: CaptureSessionInput[] = [];
  readonly exchanges: ExchangeInput[] = [];
  readonly bodies: Buffer[] = [];

  ensureSession(session: CaptureSessionInput): Promise<void> {
    this.sessions.push(session);
    return Promise.resolve();
  }

  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    this.exchanges.push(...exchanges);
    return Promise.resolve(
      exchanges.map((e, index) => ({ id: e.id, seq: index + 1 })),
    );
  }

  async writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<{ hash: string; size: number; deduplicated: boolean }> {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    this.bodies.push(buffer);
    return {
      hash: createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
      deduplicated: false,
    };
  }
}

function startOrigin(
  handler: http.RequestListener,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function proxiedGet(
  proxy: { host: string; port: number },
  absoluteUrl: string,
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: proxy.host, port: proxy.port, method: 'GET', path: absoluteUrl },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function waitForExchange(sink: RecordingSink): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (sink.exchanges.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('ProxyService (Mockttp explicit proxy)', () => {
  let sink: RecordingSink;
  let proxy: ProxyService;
  let address: { host: string; port: number };

  beforeEach(async () => {
    sink = new RecordingSink();
    proxy = new ProxyService({ sink, appVersion: '0.0.0' });
    address = await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
  });

  it('registers a capture session and reports listening status', () => {
    expect(sink.sessions).toHaveLength(1);
    expect(sink.sessions[0]?.captureMode).toBe('explicit-proxy');
    const status = proxy.status();
    expect(status.listening).toBe(true);
    expect(status.port).toBe(address.port);
  });

  it('forwards an absolute-form request and captures a canonical exchange', async () => {
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    try {
      const response = await proxiedGet(
        address,
        `http://127.0.0.1:${origin.port}/api/ping`,
      );
      expect(response.status).toBe(200);
      expect(response.body).toBe('{"ok":true}');

      await waitForExchange(sink);
      expect(sink.exchanges).toHaveLength(1);
      const exchange = sink.exchanges[0];
      expect(exchange).toMatchObject({
        method: 'GET',
        host: '127.0.0.1',
        port: origin.port,
        path: '/api/ping',
        protocol: 'http/1.1',
        statusCode: 200,
        responseMime: 'application/json',
        state: 'completed',
      });
      expect(exchange?.headers?.some((h) => h.kind === 'response')).toBe(true);
    } finally {
      await origin.close();
    }
  });

  it('persists request and response bodies as body_ref references', async () => {
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"echo":true}');
    });
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = http.request(
          {
            host: address.host,
            port: address.port,
            method: 'POST',
            path: `http://127.0.0.1:${origin.port}/submit`,
            headers: { 'content-type': 'application/json' },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
          },
        );
        req.on('error', reject);
        req.end('{"name":"interceptor"}');
      });
      expect(status).toBe(200);

      await waitForExchange(sink);
      const exchange = sink.exchanges[0];
      expect(exchange?.requestBody?.blobHash).toBeDefined();
      expect(exchange?.responseBody?.blobHash).toBeDefined();
      expect(exchange?.responseBody?.mediaType).toBe('application/json');
      // Blob 里应存下了请求与响应两段正文。
      expect(sink.bodies.length).toBeGreaterThanOrEqual(2);
    } finally {
      await origin.close();
    }
  });
});
