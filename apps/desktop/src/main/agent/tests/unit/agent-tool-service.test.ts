import { describe, expect, it, vi } from 'vitest';

import type {
  AgentMessage,
  AgentTool,
  ToolExecutionResult,
} from '@interceptor/agent-runtime';
import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import { buildInterceptorToolSettingsGroups } from '@interceptor/tools';

import type { ToolCapabilitySettingsSnapshot } from '../../../../shared/desktop-api';
import { CoreRuntime } from '../../../core/core-runtime';
import type { CoreRequestOptions } from '../../../interfaces';
import { ToolCapabilitySettingsService } from '../../../tool-capabilities/entry';
import { AgentToolService } from '../../entry';

class FakeCoreRuntime extends CoreRuntime {
  readonly commands: CoreCommand[] = [];
  readonly abortSignals: Array<AbortSignal | undefined> = [];
  readonly results = new Map<string, unknown>();

  override async request<T extends CoreCommand>(
    command: T,
    options: CoreRequestOptions = {},
  ): Promise<CoreResultForCommand<T>> {
    this.commands.push(command);
    this.abortSignals.push(options.abortSignal);
    const result = this.results.get(command.type);
    if (result === undefined) throw new Error(`No fake result for ${command.type}.`);
    return result as CoreResultForCommand<T>;
  }
}

class FakeToolCapabilitySettingsService extends ToolCapabilitySettingsService {
  agentDisabledToolNames: string[] = [];

  constructor() {
    super('unused');
  }

  override snapshot(): ToolCapabilitySettingsSnapshot {
    return {
      groups: buildInterceptorToolSettingsGroups(),
      agentDisabledToolNames: [...this.agentDisabledToolNames],
      mcpDisabledToolNames: [],
    };
  }
}

function tool(snapshot: { readonly tools: readonly AgentTool[] }, name: string): AgentTool {
  const result = snapshot.tools.find((candidate) => candidate.descriptor.name === name);
  if (result === undefined) throw new Error(`Missing Agent Tool ${name}.`);
  return result;
}

function discoveredHistory(result: ToolExecutionResult): readonly AgentMessage[] {
  return [
    { role: 'user', content: 'Inspect current traffic.' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{
        id: 'discover-1',
        name: 'discover_tools',
        arguments: { capabilityId: 'traffic' },
      }],
    },
    {
      role: 'tool',
      toolCallId: 'discover-1',
      name: 'discover_tools',
      content: JSON.stringify(result),
    },
  ];
}

describe('AgentToolService', () => {
  it('initially exposes only enabled capabilities and discover_tools', () => {
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(new FakeCoreRuntime(), settings, () => undefined);

    const snapshot = service.snapshot([{ role: 'user', content: 'Inspect traffic.' }]);

    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual(['discover_tools']);
    expect(snapshot.systemMessages).toHaveLength(1);
    expect(snapshot.systemMessages[0]?.content).toContain('traffic');
    expect(snapshot.systemMessages[0]?.content).not.toContain('get_proxy_status');
  });

  it('discovers and then discloses the connected Traffic query and change Tools', async () => {
    const service = new AgentToolService(
      new FakeCoreRuntime(),
      new FakeToolCapabilitySettingsService(),
      () => undefined,
    );
    const initial = service.snapshot([]);

    const discovery = await tool(initial, 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    expect(discovery).toMatchObject({
      ok: true,
      value: {
        matches: [
          { descriptor: { name: 'get_proxy_status' } },
          { descriptor: { name: 'get_storage_status' } },
          { descriptor: { name: 'list_exchanges' } },
          { descriptor: { name: 'get_exchange' } },
          { descriptor: { name: 'stop_recording' } },
        ],
      },
    });

    const disclosed = service.snapshot(discoveredHistory(discovery));
    expect(disclosed.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'get_proxy_status',
      'get_storage_status',
      'list_exchanges',
      'get_exchange',
      'stop_recording',
    ]);
    expect(tool(disclosed, 'stop_recording').kind).toBe('change');
  });

  it('removes disabled capabilities and previously disclosed Tools on the next snapshot', async () => {
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(new FakeCoreRuntime(), settings, () => undefined);
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const history = discoveredHistory(discovery);

    settings.agentDisabledToolNames = ['get_proxy_status'];

    const snapshot = service.snapshot(history);
    expect(snapshot.tools.map((entry) => entry.descriptor.name)).toEqual([
      'discover_tools',
      'get_storage_status',
      'list_exchanges',
      'get_exchange',
      'stop_recording',
    ]);
  });

  it('executes get_storage_status through capture.status with the caller AbortSignal', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('capture.status', {
      type: 'capture.status',
      payload: {
        sessionCount: 1,
        exchangeCount: 2,
        bodyCount: 3,
        databaseBytes: 0,
        blobBytes: 184,
        totalBytes: 184,
      },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));
    const abortController = new AbortController();

    const result = await tool(snapshot, 'get_storage_status').execute(
      {},
      { abortSignal: abortController.signal },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        sessionCount: 1,
        exchangeCount: 2,
        bodyCount: 3,
        databaseBytes: 0,
        blobBytes: 184,
        totalBytes: 184,
      },
    });
    expect(coreRuntime.commands).toEqual([{ type: 'capture.status', payload: {} }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
  });

  it('executes disclosed Tools through the shared registry and CoreRuntime', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('proxy.status', {
      type: 'proxy.status',
      payload: { running: true, recording: true },
    });
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      () => undefined,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    const abortController = new AbortController();
    const result = await tool(snapshot, 'get_proxy_status').execute(
      {},
      { abortSignal: abortController.signal },
    );

    expect(result).toEqual({ ok: true, value: { running: true, recording: true } });
    expect(coreRuntime.commands).toEqual([{ type: 'proxy.status', payload: {} }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
  });

  it('executes stop_recording through the formal Core recording command', async () => {
    const coreRuntime = new FakeCoreRuntime();
    coreRuntime.results.set('proxy.setRecording', {
      type: 'proxy.setRecording',
      payload: { recording: false },
    });
    const captureStatusChanged = vi.fn();
    const service = new AgentToolService(
      coreRuntime,
      new FakeToolCapabilitySettingsService(),
      captureStatusChanged,
    );
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const snapshot = service.snapshot(discoveredHistory(discovery));

    const abortController = new AbortController();
    const result = await tool(snapshot, 'stop_recording').execute(
      {},
      { abortSignal: abortController.signal },
    );

    expect(result).toEqual({ ok: true, value: { recording: false } });
    expect(coreRuntime.commands).toEqual([{
      type: 'proxy.setRecording',
      payload: { recording: false },
    }]);
    expect(coreRuntime.abortSignals).toEqual([abortController.signal]);
    expect(captureStatusChanged).toHaveBeenCalledWith({ recording: false });
  });

  it('rejects a Tool disabled after disclosure without invoking CoreRuntime', async () => {
    const coreRuntime = new FakeCoreRuntime();
    const settings = new FakeToolCapabilitySettingsService();
    const service = new AgentToolService(coreRuntime, settings, () => undefined);
    const discovery = await tool(service.snapshot([]), 'discover_tools').execute(
      { capabilityId: 'traffic' },
      { abortSignal: new AbortController().signal },
    );
    const getStorageStatus = tool(
      service.snapshot(discoveredHistory(discovery)),
      'get_storage_status',
    );

    settings.agentDisabledToolNames = ['get_storage_status'];
    const result = await getStorageStatus.execute(
      {},
      { abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unknown_tool',
        message: 'Unknown tool "get_storage_status".',
      },
    });
    expect(coreRuntime.commands).toHaveLength(0);
  });
});
