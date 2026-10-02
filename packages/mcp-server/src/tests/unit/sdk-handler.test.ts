import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-11-25', '2026-07-28'] as const;
type McpProtocolVersion = typeof MCP_PROTOCOL_VERSIONS[number];

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

  async invokeMain(): Promise<never> {
    throw new Error('Main queries use the Desktop Settings fixture.');
  }

  /** Records and resolves a user approval. */
  async requestApproval(
    request: McpApprovalRequest,
    _abortSignal: AbortSignal,
  ): Promise<McpApprovalVerdict> {
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
  vi.restoreAllMocks();
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
  protocolVersion: McpProtocolVersion,
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (url, init) => mcpServer.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: 'mcp-test-client', version: '1.0.0' },
    {
      supportedProtocolVersions: [protocolVersion],
      versionNegotiation: {
        mode: protocolVersion === '2026-07-28' ? { pin: protocolVersion } : 'legacy',
      },
    },
  );
  openClients.push(client);
  await client.connect(transport);
  return client;
}

describe.each(MCP_PROTOCOL_VERSIONS)('McpServer official SDK handler (%s)', (protocolVersion) => {
  it('serves the Tool registry through the requested MCP protocol', async () => {
    const { mcpServer, token } = createServer();
    const client = await connectClient(mcpServer, token, protocolVersion);

    expect(client.getNegotiatedProtocolVersion()).toBe(protocolVersion);
    await expect(client.listTools()).resolves.toMatchObject({
      tools: INTERCEPTOR_TOOL_NAMES.map((name) => ({ name })),
    });
  });

  it('rejects malformed JSON-RPC requests before Tool dispatch', async () => {
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
        method: 123,
        params: {},
      }),
    }));

    expect(response.ok).toBe(false);
  });

  it('reads the current MCP Tool exposure for every request', async () => {
    let enabledToolNames = INTERCEPTOR_TOOL_NAMES.filter((name) => name !== 'capture_get_proxy_status');
    const { mcpServer, token } = createServer({ enabledToolNames: () => enabledToolNames });
    const firstClient = await connectClient(mcpServer, token, protocolVersion);

    expect((await firstClient.listTools()).tools.map((tool) => tool.name))
      .not.toContain('capture_get_proxy_status');
    await firstClient.close();
    enabledToolNames = [...INTERCEPTOR_TOOL_NAMES];
    const secondClient = await connectClient(mcpServer, token, protocolVersion);
    expect((await secondClient.listTools()).tools.map((tool) => tool.name))
      .toContain('capture_get_proxy_status');
  });

  it('executes query Tools directly and gates change Tools by the current Client mode', async () => {
    let executionMode: McpToolExecutionMode = 'ask';
    const { fakeHost, mcpServer, token } = createServer({ executionMode: () => executionMode });
    const client = await connectClient(mcpServer, token, protocolVersion);

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

it('serves different protocol versions concurrently without changing server mode', async () => {
  const { fakeHost, mcpServer, token } = createServer();
  const clients = await Promise.all(
    MCP_PROTOCOL_VERSIONS.map((version) => connectClient(mcpServer, token, version)),
  );

  expect(clients.map((client) => client.getNegotiatedProtocolVersion()))
    .toEqual(MCP_PROTOCOL_VERSIONS);
  const results = await Promise.all(clients.map((client) =>
    client.callTool({ name: 'capture_get_proxy_status', arguments: {} })));
  expect(results.every((result) => result.isError !== true)).toBe(true);
  expect(fakeHost.commands.map((command) => command.type))
    .toEqual(MCP_PROTOCOL_VERSIONS.map(() => 'proxy.status'));
});

it.each(['2025-06-18', '2025-11-25'])(
  'keeps credential cancellation active after %s SSE headers have returned',
  async (protocolVersion) => {
    const { fakeHost, mcpServer, token } = createServer();
    let approvalSignal: AbortSignal | undefined;
    let resolveApproval: ((verdict: McpApprovalVerdict) => void) | undefined;
    const approval = new Promise<McpApprovalVerdict>((resolve) => {
      resolveApproval = resolve;
    });
    vi.spyOn(fakeHost, 'requestApproval').mockImplementation((_request, signal) => {
      approvalSignal = signal;
      return approval;
    });
    let response: Response | undefined;
    try {
      response = await mcpServer.fetch(new Request('http://test.local/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': protocolVersion,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'capture_stop_recording', arguments: {} },
        }),
      }));
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      await vi.waitFor(() => expect(approvalSignal).toBeDefined());

      mcpServer.cancelClientRequests('sdk-handler-test-client');

      expect(approvalSignal?.aborted).toBe(true);
      expect(fakeHost.commands.map((command) => command.type)).not.toContain('proxy.setRecording');
    } finally {
      resolveApproval?.('cancelled');
      await response?.body?.cancel();
    }
  },
);

it.each(['2025-06-18', '2025-11-25'])(
  'isolates %s cancellation by authenticated Client, protocol, and exact JSON-RPC id',
  async (protocolVersion) => {
    const { fakeHost, mcpServer, token } = createServer();
    const otherToken = 'sdk-handler-other-client-token';
    mcpServer.authenticator.restore([
      { clientId: 'sdk-handler-test-client', label: 'First Client', token },
      { clientId: 'sdk-handler-other-client', label: 'Second Client', token: otherToken },
    ]);
    const approvals: Array<{
      signal: AbortSignal;
      resolve: (verdict: McpApprovalVerdict) => void;
    }> = [];
    vi.spyOn(fakeHost, 'requestApproval').mockImplementation((_request, signal) =>
      new Promise<McpApprovalVerdict>((resolve) => {
        approvals.push({ signal, resolve });
        signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
      }));
    const responses: Response[] = [];
    const post = (
      credential: string,
      message: Readonly<Record<string, unknown>>,
      version = protocolVersion,
    ): Promise<Response> =>
      mcpServer.fetch(new Request('http://test.local/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${credential}`,
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': version,
        },
        body: JSON.stringify({ jsonrpc: '2.0', ...message }),
      }));

    try {
      for (const [credential, id] of [[token, 0], [token, '0'], [otherToken, 0]] as const) {
        responses.push(await post(credential, {
          id,
          method: 'tools/call',
          params: { name: 'capture_stop_recording', arguments: {} },
        }));
      }
      const otherProtocolVersion = protocolVersion === '2025-06-18' ? '2025-11-25' : '2025-06-18';
      responses.push(await post(token, {
        id: 0,
        method: 'tools/call',
        params: { name: 'capture_stop_recording', arguments: {} },
      }, otherProtocolVersion));
      await vi.waitFor(() => expect(approvals).toHaveLength(4));
      expect(approvals.every((approval) => !approval.signal.aborted)).toBe(true);

      const cancelOtherClient = await post(otherToken, {
        method: 'notifications/cancelled',
        params: { requestId: 0, reason: 'Cancel the second Client only.' },
      });
      expect(cancelOtherClient.status).toBe(202);
      await vi.waitFor(() => expect(approvals[2]!.signal.aborted).toBe(true));
      expect(approvals.slice(0, 2).every((approval) => !approval.signal.aborted)).toBe(true);

      const cancelStringId = await post(token, {
        method: 'notifications/cancelled',
        params: { requestId: '0', reason: 'Cancel the string id only.' },
      });
      expect(cancelStringId.status).toBe(202);
      await vi.waitFor(() => expect(approvals[1]!.signal.aborted).toBe(true));
      expect(approvals[0]!.signal.aborted).toBe(false);

      const cancelNumberId = await post(token, {
        method: 'notifications/cancelled',
        params: { requestId: 0, reason: 'Cancel the remaining numeric id.' },
      });
      expect(cancelNumberId.status).toBe(202);
      await vi.waitFor(() => expect(approvals[0]!.signal.aborted).toBe(true));
      expect(approvals[3]!.signal.aborted).toBe(false);

      const cancelOtherProtocol = await post(token, {
        method: 'notifications/cancelled',
        params: { requestId: 0, reason: 'Cancel the other protocol only.' },
      }, otherProtocolVersion);
      expect(cancelOtherProtocol.status).toBe(202);
      await vi.waitFor(() => expect(approvals[3]!.signal.aborted).toBe(true));
      expect(fakeHost.commands.map((command) => command.type)).not.toContain('proxy.setRecording');
    } finally {
      for (const approval of approvals) approval.resolve('cancelled');
      await Promise.all(responses.map((response) => response.body?.cancel()));
    }
  },
);

it.each(['2025-06-18', '2025-11-25'])(
  'rejects duplicate active %s request ids without replacing the original call',
  async (protocolVersion) => {
    const { fakeHost, mcpServer, token } = createServer();
    let resolveApproval: ((verdict: McpApprovalVerdict) => void) | undefined;
    let approvalSignal: AbortSignal | undefined;
    const requestApproval = vi.spyOn(fakeHost, 'requestApproval')
      .mockResolvedValue('rejected')
      .mockImplementationOnce((_request, signal) => {
        approvalSignal = signal;
        return new Promise<McpApprovalVerdict>((resolve) => {
          resolveApproval = resolve;
          signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
        });
      });
    const request = (): Request => new Request('http://test.local/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': protocolVersion,
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'pending-call', method: 'tools/call',
        params: { name: 'capture_stop_recording', arguments: {} },
      }),
    });
    const original = await mcpServer.fetch(request());
    try {
      await vi.waitFor(() => expect(approvalSignal).toBeDefined());
      const duplicate = await mcpServer.fetch(request());

      expect(await duplicate.text()).toContain('Duplicate active MCP request id');
      expect(requestApproval).toHaveBeenCalledTimes(1);
      expect(approvalSignal?.aborted).toBe(false);
      expect(fakeHost.audit).toEqual(expect.arrayContaining([
        expect.objectContaining({ ok: false, message: expect.stringContaining('Duplicate active MCP request id') }),
      ]));
    } finally {
      resolveApproval?.('cancelled');
      await original.body?.cancel();
    }
  },
);