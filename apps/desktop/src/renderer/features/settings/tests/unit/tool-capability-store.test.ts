import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  InterceptorDesktopApi,
  ToolCapabilitySettingsSnapshot,
} from '../../../../../shared/desktop-api';
import {
  ToolCapabilitySettingsActions,
  useToolCapabilitySettingsStore,
} from '../../data/toolCapabilitySettingsStore';

const enabledSnapshot: ToolCapabilitySettingsSnapshot = {
  groups: [{
    id: 'traffic',
    title: 'Traffic',
    tools: [{
      name: 'get_proxy_status',
      title: 'Proxy status',
      description: 'Read listener and recording state.',
      kind: 'query',
    }],
  }],
  agentDisabledToolNames: [],
  mcpDisabledToolNames: [],
};

const agentDisabledSnapshot: ToolCapabilitySettingsSnapshot = {
  ...enabledSnapshot,
  agentDisabledToolNames: ['get_proxy_status'],
};

const mcpDisabledSnapshot: ToolCapabilitySettingsSnapshot = {
  ...agentDisabledSnapshot,
  mcpDisabledToolNames: ['get_proxy_status'],
};

afterEach(() => {
  vi.unstubAllGlobals();
  useToolCapabilitySettingsStore.setState({
    snapshot: null,
    loading: false,
    busy: false,
    error: null,
  });
});

describe('ToolCapabilitySettingsActions', () => {
  it('loads the complete Main-owned snapshot', async () => {
    const interceptor = {
      getToolCapabilitySettings: vi.fn(async () => enabledSnapshot),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    await ToolCapabilitySettingsActions.load();

    expect(useToolCapabilitySettingsStore.getState()).toMatchObject({
      snapshot: enabledSnapshot,
      loading: false,
      error: null,
    });
  });

  it('uses four semantic intents and merges each returned snapshot', async () => {
    const interceptor = {
      disableAgentTool: vi.fn(async () => agentDisabledSnapshot),
      enableAgentTool: vi.fn(async () => enabledSnapshot),
      disableMcpTool: vi.fn(async () => mcpDisabledSnapshot),
      enableMcpTool: vi.fn(async () => agentDisabledSnapshot),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useToolCapabilitySettingsStore.setState({ snapshot: enabledSnapshot });

    await ToolCapabilitySettingsActions.disableAgentTool('get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(agentDisabledSnapshot);
    await ToolCapabilitySettingsActions.disableMcpTool('get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(mcpDisabledSnapshot);
    await ToolCapabilitySettingsActions.enableMcpTool('get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(agentDisabledSnapshot);
    await ToolCapabilitySettingsActions.enableAgentTool('get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(enabledSnapshot);

    expect(interceptor.disableAgentTool).toHaveBeenCalledWith('get_proxy_status');
    expect(interceptor.enableAgentTool).toHaveBeenCalledWith('get_proxy_status');
    expect(interceptor.disableMcpTool).toHaveBeenCalledWith('get_proxy_status');
    expect(interceptor.enableMcpTool).toHaveBeenCalledWith('get_proxy_status');
  });

  it('keeps the last successful snapshot when a mutation fails', async () => {
    const interceptor = {
      disableAgentTool: vi.fn(async () => {
        throw new Error('save failed');
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useToolCapabilitySettingsStore.setState({ snapshot: enabledSnapshot });

    await expect(ToolCapabilitySettingsActions.disableAgentTool('get_proxy_status'))
      .rejects.toThrow('save failed');

    expect(useToolCapabilitySettingsStore.getState()).toMatchObject({
      snapshot: enabledSnapshot,
      busy: false,
      error: 'save failed',
    });
  });

  it('does not let an older load overwrite a successful mutation', async () => {
    let resolveLoad!: (snapshot: ToolCapabilitySettingsSnapshot) => void;
    const delayedLoad = new Promise<ToolCapabilitySettingsSnapshot>((resolve) => {
      resolveLoad = resolve;
    });
    const interceptor = {
      getToolCapabilitySettings: vi.fn(async () => delayedLoad),
      disableAgentTool: vi.fn(async () => agentDisabledSnapshot),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    const loading = ToolCapabilitySettingsActions.load();
    await ToolCapabilitySettingsActions.disableAgentTool('get_proxy_status');
    resolveLoad(enabledSnapshot);
    await loading;

    expect(useToolCapabilitySettingsStore.getState()).toMatchObject({
      snapshot: agentDisabledSnapshot,
      loading: false,
      error: null,
    });
  });
});