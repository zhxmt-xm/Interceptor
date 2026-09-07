import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer as createViteServer } from 'vite';
import type { TrafficScenarioId } from './scenarios/interfaces.ts';
import { TrafficLab } from './scenarios/traffic-lab.ts';
import { parseTrafficRequestDraft } from './api/traffic-request-draft.ts';

const playgroundRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PLAYGROUND_PORT ?? 4175);
const vite = await createViteServer({
  appType: 'spa',
  root: playgroundRoot,
  server: { hmr: false, middlewareMode: true, ws: false },
});
const trafficLab = await TrafficLab.start();

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});

const close = async (): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await trafficLab.close();
  await vite.close();
};

process.once('SIGINT', () => void close().finally(() => process.exit()));
process.once('SIGTERM', () => void close().finally(() => process.exit()));

console.log(`Interceptor Playground: http://127.0.0.1:${port}`);

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && requestUrl.pathname === '/api/runtime') {
    writeJson(response, 200, { name: 'Interceptor Playground', version: '0.0.0' });
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/traffic/scenarios') {
    writeJson(response, 200, trafficLab.scenarios());
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/traffic/run') {
    try {
      const body = await readJsonBody(request) as {
        proxyPort?: unknown;
        draft?: unknown;
        scenarioId?: unknown;
      };
      if (typeof body.scenarioId !== 'string') throw new Error('scenarioId is required.');
      const draft = parseTrafficRequestDraft(body.draft);
      const proxyPort = body.proxyPort === undefined ? 8888 : Number(body.proxyPort);
      if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65_535) {
        throw new Error('proxyPort must be a valid TCP port.');
      }
      const result = await trafficLab.run(body.scenarioId as TrafficScenarioId, draft, proxyPort);
      writeJson(response, 200, result);
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  vite.middlewares(request, response, () => response.writeHead(404).end());
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > 64 * 1024) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}
