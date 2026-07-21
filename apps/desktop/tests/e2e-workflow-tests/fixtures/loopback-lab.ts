import { createServer, request, type Server as HttpServer } from 'node:http';

/** Deterministic loopback origin and explicit-proxy client shared by workflow tests. */
export class LoopbackLab {
  /** Loopback HTTP server that returns bounded synthetic responses. */
  private readonly server: HttpServer;

  /** Random loopback port selected by the operating system. */
  readonly port: number;

  /** Create one running lab after its random port is known. */
  private constructor(server: HttpServer, port: number) {
    this.server = server;
    this.port = port;
  }

  /** Start a random-port origin with stable JSON, headers and cookies. */
  static async start(): Promise<LoopbackLab> {
    const server = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'set-cookie': [
            'interceptor_e2e=active; Path=/; HttpOnly',
            'workflow=capture; Path=/',
          ],
          'x-interceptor-e2e': 'loopback-lab',
          connection: 'close',
        });
        response.end(JSON.stringify({
          workflow: 'capture',
          method: incoming.method ?? 'GET',
          path: incoming.url ?? '/',
          requestBody: Buffer.concat(chunks).toString('utf8'),
          ok: true,
        }));
      });
    });
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Loopback lab did not expose a numeric port.'));
          return;
        }
        resolve(address.port);
      });
    });
    return new LoopbackLab(server, port);
  }

  /** Absolute URL used by Composer or explicit-proxy requests. */
  url(requestPath = '/'): string {
    return `http://127.0.0.1:${this.port}${requestPath}`;
  }

  /** Send one absolute-form HTTP request through the Interceptor proxy listener. */
  async requestThroughProxy(
    proxyPort: number,
    requestPath: string,
    options: { method?: string; body?: string } = {},
  ): Promise<{ statusCode: number | undefined; body: string }> {
    const method = options.method ?? 'GET';
    const body = options.body ?? '';
    return new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: proxyPort,
        method,
        path: this.url(requestPath),
        headers: {
          host: `127.0.0.1:${this.port}`,
          connection: 'close',
          ...(body ? {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body)),
          } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('error', reject);
        response.once('end', () => resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      outgoing.once('error', reject);
      if (body) {
        outgoing.write(body);
      }
      outgoing.end();
    });
  }

  /** Close the origin after every in-flight response has completed. */
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => error ? reject(error) : resolve());
    });
  }
}
