import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import type { PlaygroundMcpConfiguration } from './config';
import { createObservedFetch, type ObservedMcpExchange } from './observed-fetch';

export const CURRENT_MCP_PROTOCOL = '2026-07-28';

export type PlaygroundMcpTool = Awaited<ReturnType<Client['listTools']>>['tools'][number];
export type PlaygroundMcpCallResult = Awaited<ReturnType<Client['callTool']>>;

export interface PlaygroundMcpConnection {
  readonly credentialFingerprint: string;
  readonly protocol: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly tools: readonly PlaygroundMcpTool[];
}

export class PlaygroundMcpSession {
  readonly #client: Client;

  private constructor(client: Client) {
    this.#client = client;
  }

  static async connect(
    configuration: PlaygroundMcpConfiguration,
    onExchange: (exchange: ObservedMcpExchange) => void,
    signal?: AbortSignal,
  ): Promise<{ connection: PlaygroundMcpConnection; session: PlaygroundMcpSession }> {
    const client = new Client(
      { name: 'interceptor-playground', version: '0.0.0' },
      { versionNegotiation: { mode: { pin: CURRENT_MCP_PROTOCOL } } },
    );
    const observedFetch = createObservedFetch(configuration.token, onExchange);
    const transport = new StreamableHTTPClientTransport(new URL(configuration.endpoint), {
      fetch: (url, init) => observedFetch(url, init),
      requestInit: {
        headers: { Authorization: `Bearer ${configuration.token}` },
      },
    });
    const abortConnection = (): void => {
      void client.close();
    };
    signal?.throwIfAborted();
    signal?.addEventListener('abort', abortConnection, { once: true });
    try {
      await client.connect(transport);
      const protocol = client.getNegotiatedProtocolVersion();
      if (protocol !== CURRENT_MCP_PROTOCOL) {
        throw new Error(`Expected MCP ${CURRENT_MCP_PROTOCOL}, received ${protocol ?? 'unknown'}.`);
      }
      const tools = (await client.listTools(undefined, { cacheMode: 'refresh' })).tools;
      const server = client.getServerVersion();
      return {
        connection: {
          credentialFingerprint: await sha256(configuration.token),
          protocol,
          serverName: server?.title ?? server?.name ?? 'Interceptor',
          serverVersion: server?.version ?? 'unknown',
          tools,
        },
        session: new PlaygroundMcpSession(client),
      };
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    } finally {
      signal?.removeEventListener('abort', abortConnection);
    }
  }

  async refreshTools(): Promise<readonly PlaygroundMcpTool[]> {
    return (await this.#client.listTools(undefined, { cacheMode: 'refresh' })).tools;
  }

  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<PlaygroundMcpCallResult> {
    return this.#client.callTool({ name, arguments: args }, { signal });
  }

  async close(): Promise<void> {
    await this.#client.close();
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}