import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  InterceptorDesktopApi,
  McpApprovalRequest,
  McpDesktopStatus,
} from '../../../../../shared/desktop-api';
import {
  McpSettingsActions,
  useMcpSettingsStore,
} from '../../data/mcpSettingsStore';

const disabledStatus: McpDesktopStatus = {
  state: 'disabled',
  endpoint: null,
  detail: null,
  clients: [],
};

const runningStatus: McpDesktopStatus = {
  state: 'running',
  endpoint: 'http://127.0.0.1:43127/mcp',
  detail: null,
  clients: [{
    clientId: 'client-1',
    label: 'VS Code',
    executionMode: 'ask',
  }],
};

const autoStatus: McpDesktopStatus = {
  ...runningStatus,
  clients: [{ ...runningStatus.clients[0]!, executionMode: 'auto' }],
};

const approval: McpApprovalRequest = {
  approvalId: 'approval-1',
  identity: { clientId: 'client-1', label: 'VS Code' },
  toolName: 'stop_recording',
  toolTitle: 'Stop recording',
  destructive: false,
  arguments: {},
  effectDescription: 'New traffic will continue through the proxy but will not be captured.',
};

afterEach(() => {
  vi.unstubAllGlobals();
  McpSettingsActions.resetForTests();
  useMcpSettingsStore.setState({
    status: null,
    approvals: [],
    loading: false,
    busy: false,
    error: null,
  });
});

describe('McpSettingsActions', () => {
  it('loads and subscribes to public status and approval events', async () => {
    let statusListener: ((status: McpDesktopStatus) => void) | null = null;
    let approvalListener: ((request: McpApprovalRequest) => void) | null = null;
    let approvalSettledListener: ((approvalId: string) => void) | null = null;
    const unsubscribeStatus = vi.fn();
    const unsubscribeApproval = vi.fn();
    const unsubscribeApprovalSettled = vi.fn();
    const interceptor = {
      getMcpStatus: vi.fn(async () => disabledStatus),
      onMcpStatusChange: vi.fn((listener) => {
        statusListener = listener;
        return unsubscribeStatus;
      }),
      onMcpApprovalRequest: vi.fn((listener) => {
        approvalListener = listener;
        return unsubscribeApproval;
      }),
      onMcpApprovalSettled: vi.fn((listener) => {
        approvalSettledListener = listener;
        return unsubscribeApprovalSettled;
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    const unsubscribe = McpSettingsActions.subscribe();
    await McpSettingsActions.load();
    statusListener!(runningStatus);
    approvalListener!(approval);

    expect(useMcpSettingsStore.getState()).toMatchObject({
      status: runningStatus,
      approvals: [approval],
      loading: false,
      error: null,
    });
    approvalSettledListener!(approval.approvalId);
    expect(useMcpSettingsStore.getState().approvals).toEqual([]);
    unsubscribe();
    expect(unsubscribeStatus).toHaveBeenCalledOnce();
    expect(unsubscribeApproval).toHaveBeenCalledOnce();
    expect(unsubscribeApprovalSettled).toHaveBeenCalledOnce();
  });

  it('uses semantic Server and Client intents and merges returned statuses', async () => {
    const interceptor = {
      enableMcpServer: vi.fn(async () => runningStatus),
      disableMcpServer: vi.fn(async () => disabledStatus),
      changeMcpEndpoint: vi.fn(async () => runningStatus),
      createMcpClient: vi.fn(async () => runningStatus),
      regenerateMcpClientCredential: vi.fn(async () => runningStatus),
      revokeMcpClient: vi.fn(async () => disabledStatus),
      requireMcpClientApproval: vi.fn(async () => runningStatus),
      automaticallyExecuteMcpClientTools: vi.fn(async () => autoStatus),
      copyMcpClientConfiguration: vi.fn(async () => undefined),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    await McpSettingsActions.enableServer();
    await McpSettingsActions.changeEndpoint();
    await McpSettingsActions.createClient('VS Code');
    await McpSettingsActions.automaticallyExecuteClientTools('client-1');
    expect(useMcpSettingsStore.getState().status).toBe(autoStatus);
    await McpSettingsActions.requireClientApproval('client-1');
    await McpSettingsActions.copyClientConfiguration('client-1');
    await McpSettingsActions.regenerateClientCredential('client-1');
    await McpSettingsActions.revokeClient('client-1');
    await McpSettingsActions.disableServer();

    expect(interceptor.enableMcpServer).toHaveBeenCalledOnce();
    expect(interceptor.disableMcpServer).toHaveBeenCalledOnce();
    expect(interceptor.changeMcpEndpoint).toHaveBeenCalledOnce();
    expect(interceptor.createMcpClient).toHaveBeenCalledWith('VS Code');
    expect(interceptor.requireMcpClientApproval).toHaveBeenCalledWith('client-1');
    expect(interceptor.automaticallyExecuteMcpClientTools).toHaveBeenCalledWith('client-1');
    expect(interceptor.copyMcpClientConfiguration).toHaveBeenCalledWith('client-1');
    expect(interceptor.regenerateMcpClientCredential).toHaveBeenCalledWith('client-1');
    expect(interceptor.revokeMcpClient).toHaveBeenCalledWith('client-1');
  });

  it('does not let an older load overwrite a successful mutation', async () => {
    let resolveLoad!: (status: McpDesktopStatus) => void;
    const delayedLoad = new Promise<McpDesktopStatus>((resolve) => {
      resolveLoad = resolve;
    });
    const interceptor = {
      getMcpStatus: vi.fn(async () => delayedLoad),
      enableMcpServer: vi.fn(async () => runningStatus),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    const loading = McpSettingsActions.load();
    await McpSettingsActions.enableServer();
    resolveLoad(disabledStatus);
    await loading;

    expect(useMcpSettingsStore.getState()).toMatchObject({
      status: runningStatus,
      loading: false,
      error: null,
    });
  });

  it('removes an approval only after Allow or Deny succeeds', async () => {
    const interceptor = {
      allowMcpToolCall: vi.fn(async () => undefined),
      denyMcpToolCall: vi.fn(async () => {
        throw new Error('approval already closed');
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useMcpSettingsStore.setState({ approvals: [approval] });

    await expect(McpSettingsActions.denyToolCall(approval.approvalId))
      .rejects.toThrow('approval already closed');
    expect(useMcpSettingsStore.getState().approvals).toEqual([approval]);

    await McpSettingsActions.allowToolCall(approval.approvalId);
    expect(useMcpSettingsStore.getState().approvals).toEqual([]);
  });
});