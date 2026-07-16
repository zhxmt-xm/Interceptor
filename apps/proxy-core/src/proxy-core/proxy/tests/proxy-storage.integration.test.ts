import { existsSync, promises as fs } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';

import { generateCACertificate } from 'mockttp';

import { initializeRuntime } from '../../constants';
import { StorageService } from '../../storage/entry';
import { ProxyService } from '../entry';
import { CaptureEventQueue } from '../proxy-capture-event-queue';

/**
 * M3 端到端集成：真实 ProxyService + 真实 StorageService（真实 Storage Worker 线程
 * 打开磁盘 capture.sqlite）+ 真实源站。验证一次代理请求形成规范 Exchange 并落库后
 * 可被分页查询回。需要已构建的 worker/entry.cjs bundle，缺失时跳过（smoke 兜底）。
 */
const workerBundle = path.resolve(
  process.cwd(),
  'dist/proxy-core/storage/worker/entry.cjs',
);

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

describe.skipIf(!existsSync(workerBundle))(
  'Proxy → Storage capture pipeline (real worker)',
  () => {
    let dataDir: string;
    let storage: StorageService | null = null;
    let proxy: ProxyService | null = null;

    afterEach(async () => {
      await proxy?.stop();
      await storage?.dispose();
      proxy = null;
      storage = null;
      if (dataDir) {
        await fs.rm(dataDir, { recursive: true, force: true });
      }
    });

    it('persists a proxied request as a queryable exchange', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-m3-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      storage = new StorageService();
      await storage.initialize();
      proxy = new ProxyService(storage, new CaptureEventQueue());
      const address = await proxy.start();
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
            const page = await storage!.querySessions({
              limit: 10,
              sort: 'started_desc',
              filter: {},
            });
            return page.items.length;
          }, { timeout: 5_000 })
          .toBe(1);

        const byHost = await storage.querySessions({
          limit: 10,
          sort: 'started_desc',
          filter: { search: 'ping' },
        });
        expect(byHost.items).toHaveLength(1);

        const usage = await storage.status();
        expect(usage.exchangeCount).toBe(1);
      } finally {
        await origin.close();
      }
    });

    it('decrypts HTTPS traffic via MITM into a queryable exchange', async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-m5-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      storage = new StorageService();
      await storage.initialize();

      const ca = await generateCACertificate();
      const originCertificate = await generateCACertificate();
      proxy = new ProxyService(storage, new CaptureEventQueue());
      // 先配置 CA 再启动，start 直接以 HTTPS MITM 模式监听；源站自签名靠 insecureHosts 例外。
      await proxy.configureTls({ ca, insecureHosts: ['localhost', '127.0.0.1'] });
      const address = await proxy.start();
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
            const page = await storage!.querySessions({
              limit: 10,
              sort: 'started_desc',
              filter: {},
            });
            return page.items.length;
          }, { timeout: 8_000 })
          .toBe(1);

        const page = await storage.querySessions({
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
