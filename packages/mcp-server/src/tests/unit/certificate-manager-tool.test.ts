import { describe, expect, it, vi } from 'vitest';

import type { MainToolCommand } from '@interceptor/tools';
import type { McpApprovalVerdict, McpHostBridge } from '../../interfaces';
import { McpToolRegistry } from '../../tools/entry';

const TOOL_NAME = 'settings_open_certificate_manager';
const OPEN_COMMAND = { type: 'settings.certificate-manager.open', payload: {} };
const IDENTITY = { clientId: 'manager-client', label: 'Manager test' };

function createManagerHost(verdict: McpApprovalVerdict = 'approved') {
  return {
    invoke: vi.fn(async () => { throw new Error('Manager must not send Core commands.'); }),
    invokeMain: vi.fn(async (command: MainToolCommand, _abortSignal: AbortSignal) => {
      if (command.type === 'settings.certificate.status') {
        return { type: command.type, payload: { present: false, trusted: false, supported: true, mitmEnabled: false } } as never;
      }
      return { type: command.type, payload: { requested: true, path: 'C:\\private\\certmgr.msc' } } as never;
    }),
    requestApproval: vi.fn(async () => verdict),
    record: vi.fn(),
  } satisfies McpHostBridge;
}

describe('Certificate manager MCP Tool', () => {
  it.each(['ask', 'auto'] as const)('opens once through Main in %s mode and returns only requested', async (executionMode) => {
    const host = createManagerHost();
    const mcpToolRegistry = new McpToolRegistry(host);
    const abortSignal = new AbortController().signal;

    await expect(mcpToolRegistry.call(TOOL_NAME, {}, IDENTITY, abortSignal, { executionMode }))
      .resolves.toEqual({ ok: true, payload: { requested: true } });
    expect(host.invokeMain.mock.calls.filter(([command]) => command.type === OPEN_COMMAND.type))
      .toEqual([[OPEN_COMMAND, abortSignal]]);
    expect(host.requestApproval).toHaveBeenCalledTimes(executionMode === 'ask' ? 1 : 0);
    if (executionMode === 'ask') {
      expect(host.requestApproval).toHaveBeenCalledWith(expect.objectContaining({
        toolName: TOOL_NAME, arguments: {}, destructive: false, identity: IDENTITY,
      }), abortSignal);
    }
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'timeout', 'cancelled'] as const)('does not start Main after approval is %s', async (verdict) => {
    const host = createManagerHost(verdict);
    const mcpToolRegistry = new McpToolRegistry(host);

    await expect(mcpToolRegistry.call(TOOL_NAME, {}, IDENTITY, new AbortController().signal))
      .resolves.toMatchObject({ ok: false });
    expect(host.requestApproval).toHaveBeenCalledTimes(1);
    expect(host.invokeMain.mock.calls.map(([command]) => command.type)).toEqual(['settings.certificate.status']);
    expect(host.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'approval', toolName: TOOL_NAME, verdict }));
  });

  it.each(['ask', 'auto'] as const)('rejects external arguments before any %s operation', async (executionMode) => {
    const host = createManagerHost();
    const mcpToolRegistry = new McpToolRegistry(host);

    await expect(mcpToolRegistry.call(TOOL_NAME, { path: 'other.msc' }, IDENTITY, new AbortController().signal, { executionMode }))
      .resolves.toMatchObject({ ok: false });
    expect(host.requestApproval).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('hides revoked discovery and rejects a previously known Tool without any owner call', async () => {
    const host = createManagerHost();
    const mcpToolRegistry = new McpToolRegistry(host);
    expect(mcpToolRegistry.listTools([TOOL_NAME]).map((tool) => tool.name)).toEqual([TOOL_NAME]);
    expect(mcpToolRegistry.listTools([])).toEqual([]);

    await expect(mcpToolRegistry.call(TOOL_NAME, {}, IDENTITY, new AbortController().signal, { enabledToolNames: [] }))
      .resolves.toEqual({ ok: false, payload: { error: `unknown tool: ${TOOL_NAME}` } });
    expect(host.requestApproval).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('does not launch after cancellation while approval is pending', async () => {
    const abortController = new AbortController();
    const host = createManagerHost();
    host.requestApproval.mockImplementation(async () => {
      abortController.abort();
      return 'approved';
    });

    await expect(new McpToolRegistry(host).call(TOOL_NAME, {}, IDENTITY, abortController.signal))
      .resolves.toMatchObject({ ok: false });
    expect(host.invokeMain.mock.calls.map(([command]) => command.type)).toEqual(['settings.certificate.status']);
  });

  it('does not start an already cancelled Auto operation', async () => {
    const host = createManagerHost();
    const abortController = new AbortController();
    abortController.abort();

    await expect(new McpToolRegistry(host).call(TOOL_NAME, {}, IDENTITY, abortController.signal, { executionMode: 'auto' }))
      .resolves.toMatchObject({ ok: false });
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('returns a sanitized failure when Main cannot start the system manager', async () => {
    const host = createManagerHost();
    host.invokeMain.mockRejectedValue(new Error('Cannot start C:\\private\\certmgr.msc token=secret'));

    await expect(new McpToolRegistry(host).call(TOOL_NAME, {}, IDENTITY, new AbortController().signal, { executionMode: 'auto' }))
      .resolves.toEqual({ ok: false, payload: { error: 'Unable to complete certificate operation.' } });
    expect(JSON.stringify(host.record.mock.calls)).not.toMatch(/private|secret/);
  });
});