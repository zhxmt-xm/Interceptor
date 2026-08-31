import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { CoreCommand } from '@interceptor/core-protocol';
import {
  McpServer,
  type McpApprovalRequest,
  type McpApprovalVerdict,
  type McpAuditEvent,
  type McpHostBridge,
} from '@interceptor/mcp-server';

import { McpHttpServer } from '../../internal/http-server';

/** Minimal MCP host for transport integration tests. */
class FakeMcpHostBridge implements McpHostBridge {
  /** Commands reached through an authenticated Tool call. */
  readonly commands: CoreCommand[] = [];

  /** Returns deterministic proxy status. */
  async invoke(command: CoreCommand): Promise<never> {
    this.commands.push(command);
    if (command.type === 'proxy.status') {
      return {
        type: 'proxy.status',
        payload: { listening: true, recording: true },
      } as never;
    }
    throw new Error(`unexpected command ${command.type}`);
  }

  /** Rejects unused change Tool approvals. */
  async requestApproval(_request: McpApprovalRequest): Promise<McpApprovalVerdict> {
    return 'rejected';
  }

  /** Ignores audit events in this transport-focused test. */
  record(_event: McpAuditEvent): void {}
}

describe('McpHttpServer', () => {
  /** Servers and Clients closed after every test. */
  const servers: McpHttpServer[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  });

  it('binds a random loopback port and serves the official MCP Client', async () => {
    const fixture = await startServer(servers);
    const client = new Client(
      { name: 'http-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(fixture.endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${fixture.token}` } },
    }));

    const tools = await client.listTools();

    expect(new URL(fixture.endpoint).hostname).toBe('127.0.0.1');
    expect(new URL(fixture.endpoint).port).not.toBe('8888');
    expect(tools.tools.map((tool) => tool.name)).toContain('get_proxy_status');
  });

  it('rejects missing credentials and every browser Origin before MCP dispatch', async () => {
    const fixture = await startServer(servers);
    const requestBody = '{}';

    const missing = await fetch(fixture.endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      body: requestBody,
    });
    const browser = await fetch(fixture.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${fixture.token}`,
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
      },
      body: requestBody,
    });

    expect(missing.status).toBe(401);
    expect(browser.status).toBe(403);
    expect(browser.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('serves only the MCP endpoint and releases its port on close', async () => {
    const fixture = await startServer(servers);

    await expect(fetch(new URL('/other', fixture.endpoint))).resolves.toMatchObject({ status: 404 });
    await fixture.mcpHttpServer.close();
    servers.splice(servers.indexOf(fixture.mcpHttpServer), 1);

    await expect(fetch(fixture.endpoint)).rejects.toThrow();
  });
});

async function startServer(servers: McpHttpServer[]): Promise<{
  endpoint: string;
  mcpHttpServer: McpHttpServer;
  token: string;
}> {
  const mcpServer = new McpServer({
    host: new FakeMcpHostBridge(),
    version: '0.1.0',
  });
  const token = 'mcp-http-server-test-token';
  mcpServer.authenticator.restore([{
    clientId: 'mcp-http-server-test-client',
    label: 'VS Code',
    token,
  }]);
  const mcpHttpServer = new McpHttpServer(mcpServer);
  servers.push(mcpHttpServer);
  const endpointPort = await mcpHttpServer.start(0);
  return {
    endpoint: `http://127.0.0.1:${endpointPort}/mcp`,
    mcpHttpServer,
    token,
  };
}