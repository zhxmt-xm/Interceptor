import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
  type Server as HttpServer,
} from 'node:http';

export interface LoopbackRequestObservation {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

/** Deterministic loopback origin and explicit-proxy client shared by workflow tests. */
export class LoopbackLab {
  /** Loopback HTTP server that returns bounded synthetic responses. */
  private readonly server: HttpServer;

  /** Random loopback port selected by the operating system. */
  readonly port: number;

  /** Requests that reached the origin, in completion order. */
  private readonly requestObservations: LoopbackRequestObservation[] = [];

  /** Test-owned response gates keyed by exact request path. */
  private readonly responseGates = new Map<string, {
    promise: Promise<void>;
    release: () => void;
  }>();

  /** Create one running lab after its random port is known. */
  private constructor(server: HttpServer, port: number) {
    this.server = server;
    this.port = port;
  }

  /** Start a random-port origin with stable JSON, headers and cookies. */
  static async start(): Promise<LoopbackLab> {
    let loopbackLab: LoopbackLab;
    const server = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const body = Buffer.concat(chunks);
        loopbackLab.requestObservations.push({
          method: incoming.method ?? 'GET',
          path: incoming.url ?? '/',
          headers: { ...incoming.headers },
          body,
        });
        const finishResponse = (): void => {
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
            requestBody: body.toString('utf8'),
            ok: true,
          }));
        };
        const gate = loopbackLab.responseGates.get(incoming.url ?? '/');
        if (gate) {
          void gate.promise.then(finishResponse);
        } else {
          finishResponse();
        }
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
    loopbackLab = new LoopbackLab(server, port);
    return loopbackLab;
  }

  /** Hold one exact origin response until the returned release function is called. */
  holdResponse(requestPath: string): () => void {
    let releasePromise!: () => void;
    const promise = new Promise<void>((resolve) => {
      releasePromise = resolve;
    });
    const release = (): void => {
      this.responseGates.delete(requestPath);
      releasePromise();
    };
    this.responseGates.set(requestPath, { promise, release });
    return release;
  }

  /** Absolute URL used by Composer or explicit-proxy requests. */
  url(requestPath = '/'): string {
    return `http://127.0.0.1:${this.port}${requestPath}`;
  }

  /** Send one absolute-form HTTP request through the Interceptor proxy listener. */
  async requestThroughProxy(
    proxyPort: number,
    requestPath: string,
    options: {
      method?: string;
      body?: string | Uint8Array;
      headers?: OutgoingHttpHeaders;
    } = {},
  ): Promise<{ statusCode: number | undefined; body: string }> {
    const method = options.method ?? 'GET';
    const body = Buffer.from(options.body ?? '');
    return new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: proxyPort,
        method,
        path: this.url(requestPath),
        headers: {
          host: `127.0.0.1:${this.port}`,
          connection: 'close',
          ...(body.byteLength > 0 && options.headers === undefined ? {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body)),
          } : {}),
          ...options.headers,
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
      if (body.byteLength > 0) {
        outgoing.write(body);
      }
      outgoing.end();
    });
  }

  /** Return the first completed origin observation for one exact request path. */
  observation(requestPath: string): LoopbackRequestObservation | undefined {
    return this.requestObservations.find((entry) => entry.path === requestPath);
  }

  /** Return serializable origin evidence without exposing mutable internal buffers. */
  evidence(): object[] {
    return this.requestObservations.map((entry) => ({
      method: entry.method,
      path: entry.path,
      headers: entry.headers,
      bodyBase64: entry.body.toString('base64'),
    }));
  }

  /** Close the origin after every in-flight response has completed. */
  async close(): Promise<void> {
    for (const gate of this.responseGates.values()) {
      gate.release();
    }
    this.responseGates.clear();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => error ? reject(error) : resolve());
    });
  }
}
