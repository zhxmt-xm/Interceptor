import {
  createServer,
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from 'node:http';

import {
  toNodeHandler,
  type NodeMcpRequestHandler,
} from '@modelcontextprotocol/node';
import type { McpServer } from '@interceptor/mcp-server';

const MCP_ENDPOINT_PATH = '/mcp';
const LOOPBACK_ADDRESS = '127.0.0.1';

/** Owns the loopback Node HTTP listener around the transport-neutral MCP package. */
export class McpHttpServer {
  /** MCP request handler with authentication and Tool dispatch. */
  readonly #mcpServer: McpServer;
  /** Official Node adapter for the SDK's Web-standard handler. */
  readonly #nodeMcpRequestHandler: NodeMcpRequestHandler;
  /** Active listener; null before start and after close. */
  #nodeHttpServer: NodeHttpServer | null = null;

  constructor(mcpServer: McpServer) {
    this.#mcpServer = mcpServer;
    this.#nodeMcpRequestHandler = toNodeHandler(mcpServer);
  }

  /** Binds the requested loopback port; zero asks the OS for an unused port. */
  async start(endpointPort: number): Promise<number> {
    if (this.#nodeHttpServer !== null) {
      throw new Error('MCP HTTP server is already running.');
    }
    if (!Number.isInteger(endpointPort) || endpointPort < 0 || endpointPort > 65_535) {
      throw new Error('MCP endpoint port is invalid.');
    }
    const nodeHttpServer = createServer((request, response) => {
      void this.#handleRequest(request, response);
    });
    this.#nodeHttpServer = nodeHttpServer;
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          nodeHttpServer.off('listening', onListening);
          reject(error);
        };
        const onListening = (): void => {
          nodeHttpServer.off('error', onError);
          resolve();
        };
        nodeHttpServer.once('error', onError);
        nodeHttpServer.once('listening', onListening);
        nodeHttpServer.listen(endpointPort, LOOPBACK_ADDRESS);
      });
    } catch (error) {
      this.#nodeHttpServer = null;
      throw error;
    }
    const address = nodeHttpServer.address();
    if (address === null || typeof address === 'string') {
      await this.close();
      throw new Error('MCP HTTP server did not expose a TCP port.');
    }
    return address.port;
  }

  /** Closes the SDK handler and listener, releasing every in-flight request and port. */
  async close(): Promise<void> {
    const nodeHttpServer = this.#nodeHttpServer;
    this.#nodeHttpServer = null;
    await this.#mcpServer.close();
    if (nodeHttpServer === null) return;
    await new Promise<void>((resolve, reject) => {
      nodeHttpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /** Applies the product HTTP boundary before delegating MCP semantics to the SDK. */
  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname !== MCP_ENDPOINT_PATH) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Expose-Headers',
      'MCP-Protocol-Version, WWW-Authenticate',
    );
    if (request.method === 'OPTIONS') {
      const requestedHeaders = request.headers['access-control-request-headers'];
      const requestedMethod = request.headers['access-control-request-method'];
      if (requestedHeaders !== undefined) {
        response.setHeader('Access-Control-Allow-Headers', requestedHeaders);
      }
      if (requestedMethod !== undefined) {
        response.setHeader('Access-Control-Allow-Methods', requestedMethod);
      }
      response.setHeader('Access-Control-Max-Age', '600');
      response.writeHead(204).end();
      return;
    }
    try {
      await this.#nodeMcpRequestHandler(request, response);
    } catch {
      if (!response.headersSent) response.writeHead(500);
      if (!response.writableEnded) response.end();
    }
  }
}