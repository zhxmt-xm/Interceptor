import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import { generateCACertificate } from 'mockttp';
import {
  CORE_PROTOCOL_VERSION,
  type CaptureExchangeDetail,
  parseCoreToMainMessage,
} from '@interceptor/core-protocol';

import { initializeRuntime } from '../../constants';
import { CaptureService } from '../../capture/entry';
import { ProxyService } from '../entry';
import { CaptureEventQueue } from '../internal/capture-event-queue';
import { decodeBodyStream } from '../utils';

/**
 * 端到端集成：真实 ProxyService + Core 内 Temporary Capture/Body Store + 真实源站。
 * 验证请求形成规范 Exchange 后可被分页查询，Capture 不依赖预构建 Worker bundle。
 */

function startOrigin(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"pong":true}');
  });
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
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: proxy.host, port: proxy.port, method: 'GET', path: absoluteUrl },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function startGzipOrigin(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    });
    res.end(zlib.gzipSync(Buffer.from(JSON.stringify({ pong: true }))));
  });
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

/** 记录 origin 实际收到的请求字节，并以压缩正文回复，用于校验双向线上保真。 */
function startEchoOrigin(responseBytes: Buffer): Promise<{
  port: number;
  received: () => Buffer;
  close: () => Promise<void>;
}> {
  let received = Buffer.alloc(0);
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received = Buffer.concat(chunks);
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      });
      res.end(responseBytes);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        received: () => received,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** startEchoOrigin 的 TLS 版本，供 HTTPS MITM 解密路径使用。 */
function startSecureEchoOrigin(
  cert: string,
  key: string,
  responseBytes: Buffer,
): Promise<{
  port: number;
  received: () => Buffer;
  close: () => Promise<void>;
}> {
  let received = Buffer.alloc(0);
  const server = https.createServer({ cert, key }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received = Buffer.concat(chunks);
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      });
      res.end(responseBytes);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        received: () => received,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** 经 CONNECT 隧道用代理 CA 完成 TLS，再在解密连接上 POST 并原样收集响应字节。 */
function mitmHttpsPost(
  proxyPort: number,
  originHost: string,
  originPort: number,
  caCert: string,
  body: Buffer,
  headers: Record<string, string>,
): Promise<{ statusCode: number | undefined; body: Buffer }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(
        `CONNECT ${originHost}:${originPort} HTTP/1.1\r\n` +
          `Host: ${originHost}:${originPort}\r\n\r\n`,
      );
    });
    // 结束后立刻拆掉隧道；否则 afterEach 停代理时闲置连接会抛出无人处理的 ECONNRESET。
    const finish = (result: { statusCode: number | undefined; body: Buffer }): void => {
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const fail = (error: unknown): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    socket.once('data', (chunk: Buffer) => {
      const statusLine = chunk.toString('utf8').split('\r\n', 1)[0] ?? '';
      if (!statusLine.includes(' 200 ')) {
        fail(new Error(`CONNECT failed: ${statusLine}`));
        return;
      }
      const tlsSocket = tls.connect(
        { socket, servername: originHost, ca: [caCert] },
        () => {
          // TLS 已建立，http 模块直接把它当作明文双工流复用，得到未解压的原始正文。
          const request = http.request(
            {
              createConnection: () => tlsSocket,
              host: originHost,
              port: originPort,
              method: 'POST',
              path: '/echo',
              headers: {
                ...headers,
                connection: 'close',
                'content-length': String(body.byteLength),
              },
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on('data', (data: Buffer) => chunks.push(data));
              response.on('end', () =>
                finish({
                  statusCode: response.statusCode,
                  body: Buffer.concat(chunks),
                }),
              );
            },
          );
          request.on('error', fail);
          request.end(body);
        },
      );
      tlsSocket.on('error', fail);
    });
    socket.on('error', fail);
  });
}

/** 经显式代理 POST，并原样收集响应字节（不做任何自动解压）。 */
function proxiedPost(
  proxy: { host: string; port: number },
  absoluteUrl: string,
  body: Buffer,
  headers: Record<string, string>,
): Promise<{ statusCode: number | undefined; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: proxy.host,
        port: proxy.port,
        method: 'POST',
        path: absoluteUrl,
        headers: { ...headers, 'content-length': String(body.byteLength) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function startHttpsOrigin(
  cert: string,
  key: string,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = https.createServer({ cert, key }, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"secure":true}');
  });
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

// 经显式代理 CONNECT 建逸道，再在隧道上用代理 CA 验证 leaf 完成 TLS 后发 GET。
function mitmHttpsGet(
  proxyPort: number,
  originHost: string,
  originPort: number,
  caCert: string,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(
        `CONNECT ${originHost}:${originPort} HTTP/1.1\r\n` +
          `Host: ${originHost}:${originPort}\r\n\r\n`,
      );
    });
    socket.once('data', (chunk: Buffer) => {
      const statusLine = chunk.toString('utf8').split('\r\n', 1)[0] ?? '';
      if (!statusLine.includes(' 200 ')) {
        reject(new Error(`CONNECT failed: ${statusLine}`));
        return;
      }
      const tlsSocket = tls.connect(
        { socket, servername: originHost, ca: [caCert] },
        () => {
          tlsSocket.write(
            `GET /secure HTTP/1.1\r\nHost: ${originHost}:${originPort}\r\n` +
              'Connection: close\r\n\r\n',
          );
        },
      );
      let body = '';
      tlsSocket.on('data', (data: Buffer) => {
        body += data.toString('utf8');
      });
      tlsSocket.on('end', () => {
        const line = body.split('\r\n', 1)[0] ?? '';
        const match = line.match(/HTTP\/1\.\d (\d{3})/);
        resolve(match ? Number(match[1]) : undefined);
      });
      tlsSocket.on('error', reject);
    });
    socket.on('error', reject);
  });
}

// 无用户 CA 时，经 CONNECT 原样完成 TLS，仅验证源站响应和 tunnel 元数据落库。
function passthroughHttpsGet(
  proxyPort: number,
  originPort: number,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `127.0.0.1:${originPort}`,
    });
    request.on('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        reject(new Error(`CONNECT failed: ${response.statusCode ?? 0}`));
        return;
      }
      if (head.length > 0) {
        socket.unshift(head);
      }
      const tlsSocket = tls.connect(
        { socket, servername: 'localhost', rejectUnauthorized: false },
        () => {
          tlsSocket.write(
            `GET /secure HTTP/1.1\r\nHost: 127.0.0.1:${originPort}\r\n` +
              'Connection: close\r\n\r\n',
          );
        },
      );
      let body = '';
      tlsSocket.on('data', (data: Buffer) => {
        body += data.toString('utf8');
      });
      tlsSocket.on('end', () => {
        const status = body.match(/HTTP\/1\.\d (\d{3})/)?.[1];
        resolve(status ? Number(status) : undefined);
      });
      tlsSocket.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

describe(
  'Proxy → Core temporary capture pipeline',
  () => {
    let dataDir: string;
    let captureService: CaptureService | null = null;
    let proxyService: ProxyService | null = null;

    afterEach(async () => {
      await proxyService?.stop();
      await captureService?.dispose();
      proxyService = null;
      captureService = null;
      if (dataDir) {
        await fs.rm(dataDir, { recursive: true, force: true });
      }
    });

    it('persists a proxied request as a queryable exchange', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-m3-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      captureService = new CaptureService();
      await captureService.initialize();
      proxyService = new ProxyService(captureService, new CaptureEventQueue());
      const address = await proxyService.start();
      const origin = await startOrigin();

      try {
        const status = await proxiedGet(
          address,
          `http://127.0.0.1:${origin.port}/ping`,
        );
        expect(status).toBe(200);

        // 等待异步落库后查询。
        await expect
          .poll(async () => {
            const page = await captureService!.querySessions({
              limit: 10,
              sort: 'started_desc',
              filter: {},
            });
            return page.items.length;
          }, { timeout: 5_000 })
          .toBe(1);

        const byHost = await captureService.querySessions({
          limit: 10,
          sort: 'started_desc',
          filter: { search: 'ping' },
        });
        expect(byHost.items).toHaveLength(1);

        const usage = await captureService.status();
        expect(usage.exchangeCount).toBe(1);
      } finally {
        await origin.close();
      }
    });

    it('records the response content-encoding on the stored body reference', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-encoding-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      captureService = new CaptureService();
      await captureService.initialize();
      proxyService = new ProxyService(captureService, new CaptureEventQueue());
      const address = await proxyService.start();
      const origin = await startGzipOrigin();

      try {
        await expect(proxiedGet(
          address,
          `http://127.0.0.1:${origin.port}/compressed`,
        )).resolves.toBe(200);
        await expect.poll(async () => {
          const page = await captureService!.querySessions({
            limit: 10,
            sort: 'started_desc',
            filter: {},
          });
          const summary = page.items[0];
          const captureExchangeDetail = summary
            ? await captureService!.getExchangeDetail(summary.id)
            : null;
          return captureExchangeDetail?.responseBody;
        }, { timeout: 5_000 }).toMatchObject({
          mediaType: 'application/json',
          contentEncoding: 'gzip',
        });
      } finally {
        await origin.close();
      }
    });

    it('forwards compressed bodies byte-for-byte and stores them decodable', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-wire-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      captureService = new CaptureService();
      await captureService.initialize();
      proxyService = new ProxyService(captureService, new CaptureEventQueue());
      const address = await proxyService.start();
      // 随机二进制经 gzip：任何转码、截断或字符集损坏都会让逐字节比较失败。
      const responsePlain = randomBytes(256 * 1024);
      const responseWire = zlib.gzipSync(responsePlain);
      const requestPlain = randomBytes(64 * 1024);
      const requestWire = zlib.gzipSync(requestPlain);
      const origin = await startEchoOrigin(responseWire);

      try {
        const response = await proxiedPost(
          address,
          `http://127.0.0.1:${origin.port}/echo`,
          requestWire,
          { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        );

        // Origin 侧：上游收到的请求正文与客户端发出的完全一致。
        expect(response.statusCode).toBe(200);
        expect(origin.received().equals(requestWire)).toBe(true);
        expect(zlib.gunzipSync(origin.received()).equals(requestPlain)).toBe(true);

        // Client 侧：浏览器收到的响应正文与源站发出的完全一致。
        expect(response.body.equals(responseWire)).toBe(true);
        expect(zlib.gunzipSync(response.body).equals(responsePlain)).toBe(true);

        let captureExchangeDetail: CaptureExchangeDetail | null = null;
        await expect.poll(async () => {
          const page = await captureService!.querySessions({
            limit: 10,
            sort: 'started_desc',
            filter: {},
          });
          const summary = page.items[0];
          captureExchangeDetail = summary ? await captureService!.getExchangeDetail(summary.id) : null;
          return captureExchangeDetail;
        }, { timeout: 8_000 }).toMatchObject({
          responseBody: { mediaType: 'application/json', contentEncoding: 'gzip' },
          requestBody: { mediaType: 'application/json', contentEncoding: 'gzip' },
        });
        const responseRef = (captureExchangeDetail as CaptureExchangeDetail | null)?.responseBody;
        const requestRef = (captureExchangeDetail as CaptureExchangeDetail | null)?.requestBody;

        // Capture 侧：落库的是线上编码字节，配合记录的 content-encoding 可完整还原明文。
        await expect(
          captureService.readBodyRange(responseRef!.bodyHash!, 0, responseWire.byteLength),
        ).resolves.toEqual(responseWire);
        await expect(
          captureService.readBodyRange(requestRef!.bodyHash!, 0, requestWire.byteLength),
        ).resolves.toEqual(requestWire);

        const decoded = await decodeBodyStream(
          () => captureService!.openBlobStream(responseRef!.bodyHash!),
          responseRef!.contentEncoding,
          responsePlain.byteLength,
        );
        expect(decoded.status).toBe('ok');
        expect(Buffer.from(decoded.data).equals(responsePlain)).toBe(true);
      } finally {
        await origin.close();
      }
    }, 20_000);

    it('forwards compressed bodies byte-for-byte through HTTPS MITM', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-mitm-wire-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      captureService = new CaptureService();
      await captureService.initialize();
      const ca = await generateCACertificate();
      const originCertificate = await generateCACertificate();
      proxyService = new ProxyService(captureService, new CaptureEventQueue());
      await proxyService.configureTls({
        ca,
        insecureHosts: ['localhost', '127.0.0.1'],
        passthroughHosts: [],
      });
      const address = await proxyService.start();
      const responsePlain = randomBytes(192 * 1024);
      const responseWire = zlib.gzipSync(responsePlain);
      const requestPlain = randomBytes(64 * 1024);
      const requestWire = zlib.gzipSync(requestPlain);
      const origin = await startSecureEchoOrigin(
        originCertificate.cert,
        originCertificate.key,
        responseWire,
      );

      try {
        const response = await mitmHttpsPost(
          address.port,
          'localhost',
          origin.port,
          ca.cert,
          requestWire,
          { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        );

        // 解密后转发给源站的请求正文与客户端发出的完全一致。
        expect(response.statusCode).toBe(200);
        expect(origin.received().equals(requestWire)).toBe(true);
        expect(zlib.gunzipSync(origin.received()).equals(requestPlain)).toBe(true);

        // 重新加密后回给客户端的响应正文与源站发出的完全一致。
        expect(response.body.equals(responseWire)).toBe(true);
        expect(zlib.gunzipSync(response.body).equals(responsePlain)).toBe(true);

        let captureExchangeDetail: CaptureExchangeDetail | null = null;
        await expect.poll(async () => {
          const page = await captureService!.querySessions({
            limit: 10,
            sort: 'started_desc',
            filter: { search: '/echo' },
          });
          const summary = page.items[0];
          captureExchangeDetail = summary ? await captureService!.getExchangeDetail(summary.id) : null;
          return captureExchangeDetail;
        }, { timeout: 8_000 }).toMatchObject({
          summary: { secure: true },
          responseBody: { mediaType: 'application/json', contentEncoding: 'gzip' },
          requestBody: { mediaType: 'application/json', contentEncoding: 'gzip' },
        });
        const responseRef = (captureExchangeDetail as CaptureExchangeDetail | null)!.responseBody!;

        const decoded = await decodeBodyStream(
          () => captureService!.openBlobStream(responseRef.bodyHash!),
          responseRef.contentEncoding,
          responsePlain.byteLength,
        );
        expect(decoded.status).toBe('ok');
        expect(Buffer.from(decoded.data).equals(responsePlain)).toBe(true);
      } finally {
        await origin.close();
      }
    }, 30_000);

    it('preserves a long URL path across events, pages, and detail', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-long-path-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      captureService = new CaptureService();
      await captureService.initialize();
      const captureEventQueue = new CaptureEventQueue();
      proxyService = new ProxyService(captureService, captureEventQueue);
      const address = await proxyService.start();
      const origin = await startOrigin();
      const longPath = `/${'segment'.repeat(320)}`;

      try {
        await expect(proxiedGet(
          address,
          `http://127.0.0.1:${origin.port}${longPath}`,
        )).resolves.toBe(200);
        await expect.poll(async () => {
          const page = await captureService!.querySessions({
            limit: 10,
            sort: 'started_desc',
            filter: {},
          });
          return page.items[0];
        }).toMatchObject({ statusCode: 200 });

        const page = await captureService.querySessions({
          limit: 10,
          sort: 'started_desc',
          filter: {},
        });
        const summary = page.items[0];
        const captureExchangeDetail = summary
          ? await captureService.getExchangeDetail(summary.id)
          : null;
        const batch = captureEventQueue.drain(10).map(({ kind, summary: eventSummary }) => ({
          kind,
          summary: eventSummary,
        }));

        expect(summary?.path).toBe(longPath);
        expect(captureExchangeDetail?.summary.path).toBe(longPath);
        expect(captureExchangeDetail?.url).toBe(`http://127.0.0.1:${origin.port}${longPath}`);
        expect(parseCoreToMainMessage({
          kind: 'event-batch',
          protocolVersion: CORE_PROTOCOL_VERSION,
          batchSequence: 1,
          events: batch,
        }).ok).toBe(true);
      } finally {
        await origin.close();
      }
    });

    it('persists an undecrypted HTTPS connection as a queryable TLS tunnel', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-tunnel-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      captureService = new CaptureService();
      await captureService.initialize();
      proxyService = new ProxyService(captureService, new CaptureEventQueue());
      const address = await proxyService.start();
      const originCertificate = await generateCACertificate();
      const origin = await startHttpsOrigin(
        originCertificate.cert,
        originCertificate.key,
      );

      try {
        await expect(passthroughHttpsGet(address.port, origin.port)).resolves.toBe(200);
        await expect
          .poll(async () => {
            const page = await captureService!.querySessions({
              limit: 10,
              sort: 'started_desc',
              filter: {},
            });
            return page.items[0];
          }, { timeout: 8_000 })
          .toMatchObject({
            method: 'CONNECT',
            secure: true,
            host: '127.0.0.1',
            protocol: 'tls',
            statusCode: 200,
            responseMime: 'application/x-encrypted-tunnel',
          });
      } finally {
        await origin.close();
      }
    }, 20_000);

    it('decrypts HTTPS traffic via MITM into a queryable exchange', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-m5-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      captureService = new CaptureService();
      await captureService.initialize();

      const ca = await generateCACertificate();
      const originCertificate = await generateCACertificate();
      proxyService = new ProxyService(captureService, new CaptureEventQueue());
      // 先配置 CA 再启动，start 直接以 HTTPS MITM 模式监听；源站自签名靠 insecureHosts 例外。
      await proxyService.configureTls({
        ca,
        insecureHosts: ['localhost', '127.0.0.1'],
        passthroughHosts: [],
      });
      const address = await proxyService.start();
      const origin = await startHttpsOrigin(
        originCertificate.cert,
        originCertificate.key,
      );

      try {
        const status = await mitmHttpsGet(
          address.port,
          'localhost',
          origin.port,
          ca.cert,
        );
        expect(status).toBe(200);

        await expect
          .poll(async () => {
            const page = await captureService!.querySessions({
              limit: 10,
              sort: 'started_desc',
              filter: {},
            });
            return page.items.length;
          }, { timeout: 8_000 })
          .toBe(1);

        const page = await captureService.querySessions({
          limit: 10,
          sort: 'started_desc',
          filter: {},
        });
        expect(page.items[0]?.secure).toBe(true);
      } finally {
        await origin.close();
      }
    }, 20_000);
  },
);
