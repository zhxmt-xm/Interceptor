import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';

import { expect, type TestInfo } from '@playwright/test';

/** Owns one real Playground Node process and its dynamically allocated loopback port. */
export class PlaygroundServer {
  /** Direct Node child that serves Vite, the Lab API, and every protocol origin. */
  private readonly childProcess: ChildProcess;

  /** Bounded process output retained as workflow evidence. */
  private output = '';

  /** Random loopback port exposed to the real system Browser. */
  readonly port: number;

  /** Build the public Browser URL for this test-owned process. */
  readonly url: string;

  /** Create one owner after the child has reached its runtime endpoint. */
  private constructor(childProcess: ChildProcess, port: number) {
    this.childProcess = childProcess;
    this.port = port;
    this.url = `http://127.0.0.1:${port}`;
    const append = (chunk: Buffer | string): void => {
      this.output = `${this.output}${chunk.toString()}`.slice(-64_000);
    };
    childProcess.stdout?.on('data', append);
    childProcess.stderr?.on('data', append);
  }

  /** Start the repository Playground entry through a direct Node child process. */
  static async start(): Promise<PlaygroundServer> {
    const port = await availablePort();
    const playgroundDirectory = path.resolve(__dirname, '../../../../playground');
    const childProcess = spawn(
      process.execPath,
      ['--experimental-strip-types', 'server/entry.ts'],
      {
        cwd: playgroundDirectory,
        env: { ...process.env, PLAYGROUND_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const playgroundServer = new PlaygroundServer(childProcess, port);
    try {
      await expect.poll(async () => {
        if (childProcess.exitCode !== null) {
          return `exited:${childProcess.exitCode}`;
        }
        try {
          const response = await fetch(`${playgroundServer.url}/api/runtime`);
          return response.ok ? 'ready' : `http:${response.status}`;
        } catch {
          return 'pending';
        }
      }, {
        message: 'Playground server did not become ready',
        timeout: 20_000,
      }).toBe('ready');
      return playgroundServer;
    } catch (error) {
      childProcess.kill();
      throw new Error(`${String(error)}\n${playgroundServer.output}`);
    }
  }

  /** Stop the child and prove the public port was released. */
  async close(): Promise<void> {
    if (this.childProcess.exitCode === null) {
      this.childProcess.kill();
      await Promise.race([
        once(this.childProcess, 'exit'),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error('Playground child did not exit.')),
          10_000,
        )),
      ]);
    }
    await expect.poll(
      () => canBindPort(this.port),
      { message: `Playground port ${this.port} was not released`, timeout: 10_000 },
    ).toBe(true);
  }

  /** Attach bounded child output and the released-port contract. */
  async writeEvidence(testInfo: TestInfo): Promise<void> {
    await Promise.all([
      testInfo.attach('playground-process-log', {
        body: Buffer.from(this.output),
        contentType: 'text/plain',
      }),
      testInfo.attach('playground-metadata', {
        body: Buffer.from(JSON.stringify({
          port: this.port,
          processId: this.childProcess.pid ?? null,
          released: await canBindPort(this.port),
          url: this.url,
        }, null, 2)),
        contentType: 'application/json',
      }),
    ]);
  }
}

/** Reserve an ephemeral loopback port before handing it to the child. */
async function availablePort(): Promise<number> {
  const server = net.createServer();
  server.unref();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Ephemeral Playground port was not numeric.');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

/** Probe whether the operating system will accept a fresh listener. */
function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}
