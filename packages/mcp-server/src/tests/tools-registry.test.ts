import { describe, expect, it, vi } from 'vitest';

import type { CoreCommand } from '@interceptor/core-protocol';

import type {
  McpApprovalRequest,
  McpApprovalVerdict,
  McpAuditEvent,
  McpClientIdentity,
  McpHostBridge,
} from '../interfaces';
import { McpToolRegistry } from '../tools/entry';

const IDENTITY: McpClientIdentity = {
  clientId: 'client-1',
  label: 'VS Code',
  reportedName: 'not-trusted',
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
  registry: McpToolRegistry,
  name: string,
  args: Record<string, unknown> = {},
): ReturnType<McpToolRegistry['call']> {
  return registry.call(name, args, IDENTITY, new AbortController().signal);
}

describe('McpToolRegistry', () => {
  it('exposes read tools as non-destructive and write tools as requiring approval', () => {
    const registry = new McpToolRegistry(new FakeHost());
    const tools = registry.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get('list_exchanges')?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get('clear_capture')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(byName.get('send_request')?.annotations).toMatchObject({ openWorldHint: true });
  });

  it('never registers commands that touch trust roots, system proxy or the file system', () => {
    const registry = new McpToolRegistry(new FakeHost());
    const names = registry.listTools().map((tool) => tool.name);

    for (const forbidden of [
      'configure_tls', 'start_proxy', 'stop_proxy',
      'import_har', 'export_har', 'export_archive', 'export_body',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('runs read tools without asking for approval', async () => {
    const host = new FakeHost({
      'proxy.status': { type: 'proxy.status', payload: { listening: true, recording: true } },
    });
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'get_proxy_status');

    expect(outcome.ok).toBe(true);
    expect(host.approvals).toHaveLength(0);
    expect(host.commands.map((command) => command.type)).toEqual(['proxy.status']);
  });

  it('produces no Core command when the user rejects a write tool', async () => {
    const host = new FakeHost(
      { 'storage.status': { type: 'storage.status', payload: { exchangeCount: 3, bodyCount: 2 } } },
      'rejected',
    );
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'clear_capture', { scope: 'all' });

    expect(outcome.ok).toBe(false);
    expect(host.approvals).toHaveLength(1);
    // 只允许出现 describeChange 为审批 UI 读取的状态，绝不能出现 storage.cleanup。
    expect(host.commands.map((command) => command.type)).not.toContain('storage.cleanup');
  });

  it('treats an approval timeout as a rejection', async () => {
    const host = new FakeHost(
      { 'storage.status': { type: 'storage.status', payload: { exchangeCount: 0, bodyCount: 0 } } },
      'timeout',
    );
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'clear_capture', {});

    expect(outcome.ok).toBe(false);
    expect(host.commands.map((command) => command.type)).not.toContain('storage.cleanup');
    expect(host.audit).toContainEqual(
      expect.objectContaining({ kind: 'approval', verdict: 'timeout' }),
    );
  });

  it('passes the full arguments to the approval prompt, not a summary', async () => {
    const host = new FakeHost({
      'connection.probe': { type: 'connection.probed', payload: { ok: true } },
    });
    const registry = new McpToolRegistry(host);

    await call(registry, 'probe_connection', { host: 'evil.com', port: 443 });

    expect(host.approvals[0]?.arguments).toEqual({ host: 'evil.com', port: 443 });
    expect(host.approvals[0]?.diff?.[0]).toContain('evil.com');
  });

  it('forces AI-authored rules to land disabled', async () => {
    const host = new FakeHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 7, rules: [] } } },
      'rules.replace': { type: 'rules.revision', payload: { revision: 8 } },
    });
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'apply_rules', {
      baseRevision: 7,
      rules: [{ id: 'r1', name: 'redirect', enabled: true }],
    });

    expect(outcome.ok).toBe(true);
    const replace = host.commands.find((command) => command.type === 'rules.replace');
    expect(replace).toBeDefined();
    expect((replace as { payload: { rules: { enabled: boolean }[] } }).payload.rules[0]?.enabled)
      .toBe(false);
  });

  it('refuses to overwrite rules edited since the AI last read them', async () => {
    const host = new FakeHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 9, rules: [] } } },
    });
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'apply_rules', { baseRevision: 7, rules: [] });

    expect(outcome.ok).toBe(false);
    expect(host.commands.map((command) => command.type)).not.toContain('rules.replace');
  });

  it('rejects arguments the schema does not declare', async () => {
    const registry = new McpToolRegistry(new FakeHost());

    const outcome = await call(registry, 'get_proxy_status', { extra: 1 });

    expect(outcome.ok).toBe(false);
    expect(outcome.payload).toMatchObject({ error: expect.stringContaining('unknown argument') });
  });

  it('rejects unknown tool names', async () => {
    const registry = new McpToolRegistry(new FakeHost());

    const outcome = await call(registry, 'delete_everything');

    expect(outcome.ok).toBe(false);
  });

  it('clamps page limits so one call cannot drain the whole capture', async () => {
    const host = new FakeHost({
      'sessions.query': { type: 'sessions.page', payload: { items: [], hasMore: false } },
    });
    const registry = new McpToolRegistry(host);

    await call(registry, 'list_exchanges', { limit: 100_000 });

    const query = host.commands[0] as { payload: { limit: number } };
    expect(query.payload.limit).toBe(200);
  });

  it('never reads media bodies', async () => {
    const host = new FakeHost();
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'get_exchange_body', {
      bodyId: 'b1',
      mimeType: 'video/mp4',
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.payload).toMatchObject({ opaque: true });
    expect(host.commands).toHaveLength(0);
  });

  it('does not fabricate a body edit when the model only changes a header', async () => {
    const host = new FakeHost({
      'breakpoint.resolve': {
        type: 'breakpoint.resolution',
        payload: { breakpointId: 'bp1', state: 'continued' },
      },
    });
    const registry = new McpToolRegistry(host);

    await call(registry, 'resolve_breakpoint', { breakpointId: 'bp1', action: 'continue' });

    const resolve = host.commands.find((command) => command.type === 'breakpoint.resolve');
    expect(resolve).toBeDefined();
    expect(resolve).not.toHaveProperty('payload.edit');
  });

  it('reports tool failures without throwing', async () => {
    const host = new FakeHost();
    vi.spyOn(host, 'invoke').mockRejectedValue(new Error('core disconnected'));
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'get_proxy_status');

    expect(outcome).toEqual({ ok: false, payload: { error: 'core disconnected' } });
  });

  it('refuses extra calls beyond the concurrency limit instead of queueing them', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const host = new FakeHost();
    vi.spyOn(host, 'invoke').mockImplementation(async () => {
      await gate;
      return { type: 'proxy.status', payload: {} } as never;
    });
    const registry = new McpToolRegistry(host);

    const inflight = Array.from({ length: 4 }, () => call(registry, 'get_proxy_status'));
    const overflow = await call(registry, 'get_proxy_status');

    expect(overflow.ok).toBe(false);
    expect(overflow.payload).toMatchObject({
      error: expect.stringContaining('too many concurrent'),
    });
    release();
    await Promise.all(inflight);
  });

  it('replaces oversized results with guidance rather than flooding the model context', async () => {
    const host = new FakeHost({
      'proxy.status': { type: 'proxy.status', payload: { blob: 'x'.repeat(600_000) } },
    });
    const registry = new McpToolRegistry(host);

    const outcome = await call(registry, 'get_proxy_status');

    expect(outcome.ok).toBe(true);
    expect(outcome.payload).toMatchObject({ truncated: true });
  });
});
