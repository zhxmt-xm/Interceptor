import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { CoreCommand } from '@interceptor/core-protocol';
import { INTERCEPTOR_TOOL_NAMES } from '@interceptor/tools';

import type {
  McpApprovalRequest,
  McpApprovalVerdict,
  McpAuditEvent,
  McpHostBridge,
  McpToolExecutionMode,
} from '../../interfaces';
import { McpServer } from '../../server/entry';

/** Records the business boundary reached through the official MCP SDK. */
class FakeHost implements McpHostBridge {
  /** Commands sent to Core. */
  readonly commands: CoreCommand[] = [];
  /** Approval requests shown to the user. */
  readonly approvals: McpApprovalRequest[] = [];
  /** Audit records emitted by the MCP layer. */
  readonly audit: McpAuditEvent[] = [];
  /** Verdict returned for Ask mode. */
  verdict: McpApprovalVerdict = 'rejected';

  /** Returns deterministic results for the two Tools used by this test. */
  async invoke(command: CoreCommand): Promise<never> {
    this.commands.push(command);
    if (command.type === 'proxy.status') {
      return {
        type: 'proxy.status',
        payload: { listening: true, recording: true },
      } as never;
    }
    if (command.type === 'proxy.setRecording') {
      return {
        type: 'capture.status',
        payload: { recording: false },
      } as never;
    }
    throw new Error(`unexpected command ${command.type}`);
  }

  /** Records and resolves a user approval. */
  async requestApproval(request: McpApprovalRequest): Promise<McpApprovalVerdict> {
    this.approvals.push(request);
    return this.verdict;
  }

  /** Records one audit event. */
  record(event: McpAuditEvent): void {
    this.audit.push(event);
  }
}

const openClients: Client[] = [];
const openServers: McpServer[] = [];

afterEach(async () => {
  await Promise.allSettled(openClients.splice(0).map((client) => client.close()));
  await Promise.allSettled(openServers.splice(0).map((server) => server.close()));
});

function createServer(options: {
  enabledToolNames?: () => readonly string[];
  executionMode?: () => McpToolExecutionMode;
} = {}): { fakeHost: FakeHost; mcpServer: McpServer; token: string } {
  const fakeHost = new FakeHost();
  const mcpServer = new McpServer({
    host: fakeHost,
    version: '0.1.0',
    listEnabledToolNames: options.enabledToolNames ?? (() => INTERCEPTOR_TOOL_NAMES),
    readClientExecutionMode: options.executionMode ?? (() => 'ask'),
  });
  openServers.push(mcpServer);
  const token = 'sdk-handler-test-token';
  mcpServer.authenticator.restore([{
    clientId: 'sdk-handler-test-client',
    label: 'VS Code',
    token,
  }]);
  return { fakeHost, mcpServer, token };
}

async function connectClient(
  mcpServer: McpServer,
  token: string,
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (url, init) => mcpServer.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: 'mcp-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  openClients.push(client);
  await client.connect(transport);
  return client;
}

describe('McpServer official SDK handler', () => {
  it('serves the Tool registry through the current MCP protocol', async () => {
    const { mcpServer, token } = createServer();
    const client = await connectClient(mcpServer, token);

    await expect(client.listTools()).resolves.toMatchObject({
      tools: INTERCEPTOR_TOOL_NAMES.map((name) => ({ name })),
    });
  });

  it('rejects requests without the current protocol envelope', async () => {
    const { mcpServer, token } = createServer();

    const response = await mcpServer.fetch(new Request('http://test.local/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: {},
      }),
    }));

    expect(response.ok).toBe(false);
  });

  it('reads the current MCP Tool exposure for every request', async () => {
    let enabledToolNames = INTERCEPTOR_TOOL_NAMES.filter((name) => name !== 'capture_get_proxy_status');
    const { mcpServer, token } = createServer({ enabledToolNames: () => enabledToolNames });
    const firstClient = await connectClient(mcpServer, token);

    expect((await firstClient.listTools()).tools.map((tool) => tool.name))
      .not.toContain('capture_get_proxy_status');
    await firstClient.close();
    enabledToolNames = [...INTERCEPTOR_TOOL_NAMES];
    const secondClient = await connectClient(mcpServer, token);
    expect((await secondClient.listTools()).tools.map((tool) => tool.name))
      .toContain('capture_get_proxy_status');
  });

  it('executes query Tools directly and gates change Tools by the current Client mode', async () => {
    let executionMode: McpToolExecutionMode = 'ask';
    const { fakeHost, mcpServer, token } = createServer({ executionMode: () => executionMode });
    const client = await connectClient(mcpServer, token);

    const queryResult = await client.callTool({ name: 'capture_get_proxy_status', arguments: {} });
    expect(queryResult.isError).not.toBe(true);
    expect(fakeHost.approvals).toHaveLength(0);

    const denied = await client.callTool({ name: 'capture_stop_recording', arguments: {} });
    expect(denied.isError).toBe(true);
    expect(fakeHost.approvals).toHaveLength(1);
    expect(fakeHost.commands.map((command) => command.type)).not.toContain('proxy.setRecording');

    executionMode = 'auto';
    const completed = await client.callTool({ name: 'capture_stop_recording', arguments: {} });
    expect(completed.isError).not.toBe(true);
    expect(fakeHost.approvals).toHaveLength(1);
    expect(fakeHost.commands.map((command) => command.type)).toContain('proxy.setRecording');
  });

  it('rejects missing and invalid bearer credentials before MCP dispatch', async () => {
    const { mcpServer } = createServer();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

    const missing = await mcpServer.fetch(new Request('http://test.local/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      body,
    }));
    const invalid = await mcpServer.fetch(new Request('http://test.local/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer invalid',
        'Content-Type': 'application/json',
      },
      body,
    }));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });
});