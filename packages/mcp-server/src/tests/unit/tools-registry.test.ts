import { describe, expect, it, vi } from 'vitest';

import type { CoreCommand } from '@interceptor/core-protocol';

import type {
  McpApprovalRequest,
  McpApprovalVerdict,
  McpAuditEvent,
  McpClientIdentity,
  McpHostBridge,
} from '../../interfaces';
import { McpToolRegistry } from '../../tools/entry';

const IDENTITY: McpClientIdentity = {
  clientId: 'client-1',
  label: 'VS Code',
};

/** 记录全部下沉调用的假宿主，用来断言"未获批准就不产生 Core command"。 */
class FakeHost implements McpHostBridge {
  /** 已下沉的 command，按顺序。 */
  readonly commands: CoreCommand[] = [];
  /** 收到的审批请求。 */
  readonly approvals: McpApprovalRequest[] = [];
  /** 记录的审计事件。 */
  readonly audit: McpAuditEvent[] = [];
  /** 逐 command 类型的返回值。 */
  readonly #results: Map<string, unknown>;
  /** 审批固定裁决。 */
  readonly #verdict: McpApprovalVerdict;

  constructor(results: Record<string, unknown> = {}, verdict: McpApprovalVerdict = 'approved') {
    this.#results = new Map(Object.entries(results));
    this.#verdict = verdict;
  }

  /** 记录并返回预设结果。 */
  async invoke(command: CoreCommand): Promise<never> {
    this.commands.push(command);
    const result = this.#results.get(command.type);
    if (result === undefined) {
      throw new Error(`no fake result for ${command.type}`);
    }
    return result as never;
  }

  async invokeMain(): Promise<never> {
    throw new Error('Main queries use the Desktop Settings fixture.');
  }

  /** 记录审批请求并返回固定裁决。 */
  async requestApproval(request: McpApprovalRequest): Promise<McpApprovalVerdict> {
    this.approvals.push(request);
    return this.#verdict;
  }

  /** 记录审计事件。 */
  record(event: McpAuditEvent): void {
    this.audit.push(event);
  }
}

function call(
  mcpToolRegistry: McpToolRegistry,
  name: string,
  args: Record<string, unknown> = {},
): ReturnType<McpToolRegistry['call']> {
  return mcpToolRegistry.call(name, args, IDENTITY, new AbortController().signal);
}

describe('McpToolRegistry', () => {
  it('exposes read tools as non-destructive and write tools as requiring approval', () => {
    const mcpToolRegistry = new McpToolRegistry(new FakeHost());
    const tools = mcpToolRegistry.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(tools.map((tool) => tool.name)).toEqual([
      'capture_get_proxy_status',
      'capture_get_storage_status',
      'capture_start_recording',
      'capture_stop_recording',
      'capture_clear',
      'capture_list_exchanges',
      'capture_get_exchange',
      'capture_get_exchange_body',
      'capture_list_websocket_messages',
      'capture_list_grpc_messages',
      'rules_get_tree',
      'rules_get_hits',
      'rules_replace_tree',
      'rules_export',
      'rules_import',
      'composer_send_request',
      'composer_probe_connection',
      'composer_get_collection',
      'composer_replace_collection',
      'composer_export_collection',
      'composer_import_collection',
      'breakpoints_list',
      'breakpoints_enable_http',
      'breakpoints_disable_http',
      'breakpoints_enable_websocket',
      'breakpoints_disable_websocket',
      'breakpoints_continue',
      'breakpoints_forward_edited',
      'breakpoints_drop',
      'breakpoints_continue_queue',
      'breakpoints_drop_queue',
      'breakpoints_continue_rule',
      'diagnostics_query',
      'diagnostics_get_trace',
      'diagnostics_get_recent',
      'diagnostics_export',
      'settings_get_core_process_status',
      'settings_get_system_proxy_status',
      'settings_get_certificate_status',
      'settings_get_tls_insecure_hosts',
      'settings_get_tls_passthrough',
      'settings_list_app_containers',
      'settings_enable_system_proxy',
      'settings_restore_system_proxy',
      'settings_replace_tls_insecure_hosts',
      'settings_replace_tls_passthrough',
      'settings_enable_https_decryption',
      'settings_disable_https_decryption',
    ]);

    expect(byName.get('capture_list_exchanges')?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get('capture_clear')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(byName.get('composer_send_request')?.annotations).toMatchObject({ openWorldHint: true });
    expect(byName.get('rules_export')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(byName.get('rules_import')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(byName.get('breakpoints_list')?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get('breakpoints_drop')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('does not expose obsolete or unrestricted internal commands', () => {
    const mcpToolRegistry = new McpToolRegistry(new FakeHost());
    const names = mcpToolRegistry.listTools().map((tool) => tool.name);

    for (const forbidden of [
      'configure_tls', 'start_proxy', 'stop_proxy',
      'import_har', 'export_har', 'export_archive', 'export_body',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('runs read tools without asking for approval', async () => {
    const fakeHost = new FakeHost({
      'proxy.status': { type: 'proxy.status', payload: { listening: true, recording: true } },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_get_proxy_status');

    expect(outcome.ok).toBe(true);
    expect(fakeHost.approvals).toHaveLength(0);
    expect(fakeHost.commands.map((command) => command.type)).toEqual(['proxy.status']);
  });

  it('produces no Core command when the user rejects a write tool', async () => {
    const fakeHost = new FakeHost(
      { 'capture.status': { type: 'capture.status', payload: { exchangeCount: 3, bodyCount: 2 } } },
      'rejected',
    );
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_clear');

    expect(outcome.ok).toBe(false);
    expect(fakeHost.approvals).toHaveLength(1);
    expect(fakeHost.approvals[0]?.diff).toEqual([
      'Scope: all',
      'This permanently deletes 3 exchange(s) and 2 body/bodies.',
    ]);
    expect(fakeHost.approvals[0]).not.toHaveProperty('metadata');
    // 只允许出现 describeChange 为审批 UI 读取的状态，绝不能出现 capture.cleanup。
    expect(fakeHost.commands.map((command) => command.type)).not.toContain('capture.cleanup');
  });

  it('treats an approval timeout as a rejection', async () => {
    const fakeHost = new FakeHost(
      { 'capture.status': { type: 'capture.status', payload: { exchangeCount: 0, bodyCount: 0 } } },
      'timeout',
    );
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_clear', {});

    expect(outcome.ok).toBe(false);
    expect(fakeHost.commands.map((command) => command.type)).not.toContain('capture.cleanup');
    expect(fakeHost.audit).toContainEqual(
      expect.objectContaining({ kind: 'approval', verdict: 'timeout' }),
    );
  });

  it('reports a cancelled approval separately from a user rejection', async () => {
    const fakeHost = new FakeHost(
      { 'capture.status': { type: 'capture.status', payload: { exchangeCount: 0, bodyCount: 0 } } },
      'cancelled' as McpApprovalVerdict,
    );
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_clear');

    expect(outcome).toEqual({
      ok: false,
      payload: { error: 'the MCP call was cancelled before approval' },
    });
    expect(fakeHost.audit).toContainEqual(
      expect.objectContaining({ kind: 'approval', verdict: 'cancelled' }),
    );
  });

  it('passes the full arguments to the approval prompt, not a summary', async () => {
    const fakeHost = new FakeHost({
      'tls.probe': { type: 'tls.probed', payload: { ok: true } },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    await call(mcpToolRegistry, 'composer_probe_connection', { host: 'evil.com', port: 443 });

    expect(fakeHost.approvals[0]?.arguments).toEqual({ host: 'evil.com', port: 443 });
    expect(fakeHost.approvals[0]?.diff?.[0]).toContain('evil.com');
  });

  it('preserves the complete AI-authored Rule tree and enabled state', async () => {
    const fakeHost = new FakeHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 7, nodes: [] } } },
      'rules.replace': { type: 'rules.revision', payload: { revision: 8 } },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);
    const nodes = [{
      kind: 'folder',
      id: 'f1',
      name: 'Auth',
      children: [{
        kind: 'rule',
        id: 'r1',
        name: 'redirect',
        enabled: true,
        priority: 10,
        matchers: [{ type: 'host', value: 'api.test', mode: 'exact' }],
        actions: [{
          type: 'header',
          phase: 'request',
          op: 'set',
          name: 'x-auth-mode',
          value: 'active',
        }],
      }],
    }];

    const outcome = await call(mcpToolRegistry, 'rules_replace_tree', {
      baseRevision: 7,
      nodes,
    });

    expect(outcome.ok).toBe(true);
    const replace = fakeHost.commands.find((command) => command.type === 'rules.replace');
    expect(replace).toBeDefined();
    expect((replace as { payload: { nodes: unknown[] } }).payload.nodes).toEqual(nodes);
  });

  it('refuses to overwrite rules edited since the AI last read them', async () => {
    const fakeHost = new FakeHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 9, nodes: [] } } },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'rules_replace_tree', { baseRevision: 7, nodes: [] });

    expect(outcome.ok).toBe(false);
    expect(fakeHost.commands.map((command) => command.type)).not.toContain('rules.replace');
  });

  it('rejects arguments the schema does not declare', async () => {
    const mcpToolRegistry = new McpToolRegistry(new FakeHost());

    const outcome = await call(mcpToolRegistry, 'capture_get_proxy_status', { extra: 1 });

    expect(outcome.ok).toBe(false);
    expect(outcome.payload).toMatchObject({ error: expect.stringContaining('unknown argument') });
  });

  it('rejects unknown tool names', async () => {
    const mcpToolRegistry = new McpToolRegistry(new FakeHost());

    const outcome = await call(mcpToolRegistry, 'delete_everything');

    expect(outcome.ok).toBe(false);
  });

  it('rejects page limits outside the published schema', async () => {
    const fakeHost = new FakeHost({
      'sessions.query': { type: 'sessions.page', payload: { items: [], hasMore: false } },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_list_exchanges', { limit: 100_000 });

    expect(outcome.ok).toBe(false);
    expect(outcome.payload).toMatchObject({ error: expect.stringContaining('at most 200') });
    expect(fakeHost.commands).toHaveLength(0);
  });

  it('derives media type from the exchange before deciding whether to read a body', async () => {
    const fakeHost = new FakeHost({
      'sessions.detail': {
        type: 'sessions.detail',
        payload: {
          detail: {
            responseBody: { bodyHash: 'b1', mediaType: 'video/mp4' },
          },
        },
      },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_get_exchange_body', {
      exchangeId: 'exchange-1',
      bodyId: 'b1',
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.payload).toMatchObject({ opaque: true });
    expect(fakeHost.commands).toEqual([
      { type: 'sessions.detail', payload: { exchangeId: 'exchange-1' } },
    ]);
  });

  it('continues a breakpoint unchanged without fabricating an edit', async () => {
    const fakeHost = new FakeHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [{
            id: 'bp1',
            phase: 'request',
            queueKey: 'http',
            createdAt: 1,
            ruleName: 'Pause API',
            method: 'GET',
            url: 'http://api.test/items',
            headers: [],
            bodyAvailable: false,
          }],
        },
      },
      'breakpoint.resolve': {
        type: 'breakpoint.resolution',
        payload: { breakpointId: 'bp1', state: 'continued' },
      },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    await call(mcpToolRegistry, 'breakpoints_continue', { breakpointId: 'bp1' });

    expect(fakeHost.approvals).toHaveLength(1);
    expect(fakeHost.approvals[0]?.diff).toContain('Breakpoint: bp1');
    expect(fakeHost.commands[0]).toEqual({ type: 'breakpoint.list', payload: {} });
    const resolve = fakeHost.commands.find((command) => command.type === 'breakpoint.resolve');
    expect(resolve).toBeDefined();
    expect(resolve).not.toHaveProperty('payload.edit');
  });

  it('denies a current Breakpoint after showing its bounded dynamic impact', async () => {
    const fakeHost = new FakeHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [{
            id: 'bp1',
            phase: 'request',
            queueKey: 'http',
            createdAt: 1,
            ruleName: 'Pause API',
            method: 'GET',
            url: 'http://api.test/items',
            headers: [],
            bodyAvailable: false,
          }],
        },
      },
    }, 'rejected');
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'breakpoints_continue', {
      breakpointId: 'bp1',
    });

    expect(outcome.ok).toBe(false);
    expect(fakeHost.approvals[0]?.diff).toEqual([
      'Breakpoint: bp1',
      'Phase: request',
      'Queue: http',
      'Target: GET http://api.test/items',
    ]);
    expect(fakeHost.commands).toEqual([{ type: 'breakpoint.list', payload: {} }]);
  });

  it('rejects a stale Breakpoint before creating an approval', async () => {
    const fakeHost = new FakeHost({
      'breakpoint.list': {
        type: 'breakpoint.pending',
        payload: { enabled: true, breakpoints: [] },
      },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'breakpoints_drop', {
      breakpointId: 'bp-stale',
    });

    expect(outcome).toEqual({
      ok: false,
      payload: { error: expect.stringContaining('is no longer pending') },
    });
    expect(fakeHost.approvals).toEqual([]);
    expect(fakeHost.commands).toEqual([{ type: 'breakpoint.list', payload: {} }]);
  });

  it('enables a WebSocket breakpoint', async () => {
    const fakeHost = new FakeHost({
      'websocket.breakpoint.enable': {
        type: 'websocket.breakpoint.state',
        payload: { enabled: true },
      },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    await call(mcpToolRegistry, 'breakpoints_enable_websocket', {
      exchangeId: 'exchange-1',
      frames: ['message', 'ping'],
      direction: 'client-to-server',
    });

    expect(fakeHost.commands).toEqual([
      {
        type: 'websocket.breakpoint.enable',
        payload: {
          exchangeId: 'exchange-1',
          direction: 'client-to-server',
          frames: ['message', 'ping'],
        },
      },
    ]);
  });

  it('reports tool failures without throwing', async () => {
    const fakeHost = new FakeHost();
    vi.spyOn(fakeHost, 'invoke').mockRejectedValue(new Error('core disconnected'));
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_get_proxy_status');

    expect(outcome).toEqual({ ok: false, payload: { error: 'core disconnected' } });
  });

  it('refuses extra calls beyond the concurrency limit instead of queueing them', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fakeHost = new FakeHost();
    vi.spyOn(fakeHost, 'invoke').mockImplementation(async () => {
      await gate;
      return { type: 'proxy.status', payload: {} } as never;
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const inflight = Array.from({ length: 4 }, () => call(mcpToolRegistry, 'capture_get_proxy_status'));
    const overflow = await call(mcpToolRegistry, 'capture_get_proxy_status');

    expect(overflow.ok).toBe(false);
    expect(overflow.payload).toMatchObject({
      error: expect.stringContaining('too many concurrent'),
    });
    release();
    await Promise.all(inflight);
  });

  it('replaces oversized results with guidance rather than flooding the model context', async () => {
    const fakeHost = new FakeHost({
      'proxy.status': { type: 'proxy.status', payload: { blob: 'x'.repeat(600_000) } },
    });
    const mcpToolRegistry = new McpToolRegistry(fakeHost);

    const outcome = await call(mcpToolRegistry, 'capture_get_proxy_status');

    expect(outcome.ok).toBe(true);
    expect(outcome.payload).toMatchObject({ truncated: true });
  });
});
