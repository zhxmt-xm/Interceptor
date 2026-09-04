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
    id: 'capture',
    title: 'Capture',
    tools: [{
      name: 'capture_get_proxy_status',
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
  agentDisabledToolNames: ['capture_get_proxy_status'],
};

const mcpDisabledSnapshot: ToolCapabilitySettingsSnapshot = {
  ...agentDisabledSnapshot,
  mcpDisabledToolNames: ['capture_get_proxy_status'],
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

    await ToolCapabilitySettingsActions.disableAgentTool('capture_get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(agentDisabledSnapshot);
    await ToolCapabilitySettingsActions.disableMcpTool('capture_get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(mcpDisabledSnapshot);
    await ToolCapabilitySettingsActions.enableMcpTool('capture_get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(agentDisabledSnapshot);
    await ToolCapabilitySettingsActions.enableAgentTool('capture_get_proxy_status');
    expect(useToolCapabilitySettingsStore.getState().snapshot).toBe(enabledSnapshot);

    expect(interceptor.disableAgentTool).toHaveBeenCalledWith('capture_get_proxy_status');
    expect(interceptor.enableAgentTool).toHaveBeenCalledWith('capture_get_proxy_status');
    expect(interceptor.disableMcpTool).toHaveBeenCalledWith('capture_get_proxy_status');
    expect(interceptor.enableMcpTool).toHaveBeenCalledWith('capture_get_proxy_status');
  });

  it('keeps the last successful snapshot when a mutation fails', async () => {
    const interceptor = {
      disableAgentTool: vi.fn(async () => {
        throw new Error('save failed');
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useToolCapabilitySettingsStore.setState({ snapshot: enabledSnapshot });

    await expect(ToolCapabilitySettingsActions.disableAgentTool('capture_get_proxy_status'))
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
    await ToolCapabilitySettingsActions.disableAgentTool('capture_get_proxy_status');
    resolveLoad(enabledSnapshot);
    await loading;

    expect(useToolCapabilitySettingsStore.getState()).toMatchObject({
      snapshot: agentDisabledSnapshot,
      loading: false,
      error: null,
    });
  });
});