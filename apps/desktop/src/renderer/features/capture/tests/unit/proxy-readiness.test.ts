import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import type { CaptureStatus, SystemProxyStatus as DesktopSystemProxyStatus, InterceptorDesktopApi } from '../../../../../shared/desktop-api';
import { useCaptureStore } from '../../data/captureStore';
import { retryCaptureProxyReadiness, toggleCapture, useCaptureData } from '../../data/useCaptureData';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: vi.fn(),
}));

const originalWindow = globalThis.window;

describe('capture proxy readiness', () => {
  beforeEach(() => {
    vi.mocked(useEffect).mockClear();
    useCaptureStore.setState({
      rows: [],
      proxyReadinessIssue: null,
      capturing: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('explicitly enables system routing and clears the issue', async () => {
    const enableSystemProxy = vi.fn().mockResolvedValue(proxyStatus(true));
    installApi({ enableSystemProxy });

    await expect(retryCaptureProxyReadiness()).resolves.toBe(true);
    expect(enableSystemProxy).toHaveBeenCalledOnce();
    expect(useCaptureStore.getState().capturing).toBe(true);
    expect(useCaptureStore.getState().proxyReadinessIssue).toBeNull();
  });

  it.each(['retry', 'start'])('reapplies the route for an already owned system proxy on %s', async action => {
    useCaptureStore.setState({ capturing: false });
    const enableSystemProxy = vi.fn().mockResolvedValue(proxyStatus(true));
    installApi({
      getSystemProxyStatus: vi.fn().mockResolvedValue(proxyStatus(true)),
      startCapture: vi.fn().mockResolvedValue(recordingStatus(true)),
      enableSystemProxy,
    });
    if (action === 'retry') await expect(retryCaptureProxyReadiness()).resolves.toBe(true);
    else await toggleCapture();
    expect(enableSystemProxy).toHaveBeenCalledOnce();
    expect(useCaptureStore.getState().capturing).toBe(true);
  });

  it('keeps Core recording events paused until system routing is confirmed', async () => {
    useCaptureStore.setState({ capturing: false });
    let resolveProxy!: (status: DesktopSystemProxyStatus) => void;
    const pendingProxy = new Promise<DesktopSystemProxyStatus>((resolve) => { resolveProxy = resolve; });
    const getSystemProxyStatus = vi.fn().mockReturnValue(pendingProxy);
    const receiveStatus = subscribeCaptureStatus({ getSystemProxyStatus });

    receiveStatus(recordingStatus(true));
    expect(useCaptureStore.getState().capturing).toBe(false);
    expect(getSystemProxyStatus).toHaveBeenCalledOnce();
    resolveProxy(proxyStatus(true));
    await vi.waitFor(() => expect(useCaptureStore.getState().capturing).toBe(true));
  });

  it('does not let a delayed proxy check overwrite a newer Stop event', async () => {
    useCaptureStore.setState({ capturing: false });
    let resolveProxy!: (status: DesktopSystemProxyStatus) => void;
    const pendingProxy = new Promise<DesktopSystemProxyStatus>((resolve) => { resolveProxy = resolve; });
    const receiveStatus = subscribeCaptureStatus({ getSystemProxyStatus: vi.fn().mockReturnValue(pendingProxy) });
    receiveStatus(recordingStatus(true));
    receiveStatus(recordingStatus(false));
    resolveProxy(proxyStatus(true));
    await pendingProxy;
    await Promise.resolve();
    expect(useCaptureStore.getState().capturing).toBe(false);
  });

  it('does not show Recording when Core is ready but supported system routing is not owned', async () => {
    useCaptureStore.setState({ capturing: false });
    const receiveStatus = subscribeCaptureStatus({});
    receiveStatus(recordingStatus(true));
    await Promise.resolve();
    await Promise.resolve();
    expect(useCaptureStore.getState().capturing).toBe(false);
  });

  it('retains a bounded issue when enabling system routing fails', async () => {
    installApi({
      getSystemProxyStatus: vi.fn().mockResolvedValue({
        ...proxyStatus(false),
        ownershipLost: true,
      }),
      enableSystemProxy: vi.fn().mockRejectedValue(new Error('ownership changed')),
    });

    await expect(retryCaptureProxyReadiness()).resolves.toBe(false);
    expect(useCaptureStore.getState().capturing).toBe(false);
    expect(useCaptureStore.getState().proxyReadinessIssue).toMatchObject({
      kind: 'system-proxy',
      ownershipLost: true,
      message: 'ownership changed',
    });
  });

  it('takes over the system proxy on a manual Start', async () => {
    useCaptureStore.setState({ capturing: false });
    const enableSystemProxy = vi.fn().mockResolvedValue(proxyStatus(true));
    installApi({
      startCapture: vi.fn().mockResolvedValue({
        listening: true,
        recording: true,
        host: '127.0.0.1',
        port: 8888,
        sessionId: 'session-1',
        capturedExchanges: 0,
      }),
      enableSystemProxy,
    });

    await toggleCapture();

    expect(enableSystemProxy).toHaveBeenCalledOnce();
    expect(useCaptureStore.getState().capturing).toBe(true);
    expect(useCaptureStore.getState().proxyReadinessIssue).toBeNull();
  });

  it('prompts when the system proxy takeover does not stick', async () => {
    useCaptureStore.setState({ capturing: false });
    installApi({
      startCapture: vi.fn().mockResolvedValue({
        listening: true,
        recording: true,
        host: '127.0.0.1',
        port: 8888,
        sessionId: 'session-1',
        capturedExchanges: 0,
      }),
      enableSystemProxy: vi.fn().mockResolvedValue({
        ...proxyStatus(false),
        ownershipLost: true,
      }),
    });

    await toggleCapture();

    expect(useCaptureStore.getState().capturing).toBe(false);
    expect(useCaptureStore.getState().proxyReadinessIssue).toMatchObject({
      kind: 'system-proxy',
      ownershipLost: true,
    });
  });
});

/** Install the narrow fake API required by retryCaptureProxyReadiness. */
function installApi(overrides: Partial<InterceptorDesktopApi>): void {
  const api = {
    getCaptureStatus: vi.fn().mockResolvedValue({
      listening: true,
      recording: true,
      host: '127.0.0.1',
      port: 8888,
      sessionId: 'session-1',
      capturedExchanges: 0,
    }),
    getSystemProxyStatus: vi.fn().mockResolvedValue(proxyStatus(false)),
    enableSystemProxy: vi.fn().mockResolvedValue(proxyStatus(true)),
    startCapture: vi.fn(),
    stopCapture: vi.fn(),
    querySessions: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    ...overrides,
  } as unknown as InterceptorDesktopApi;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { interceptor: api },
  });
}

/** Build one bounded system-proxy status fixture. */
function proxyStatus(owned: boolean) {
  return {
    supported: true,
    enabled: owned,
    owned,
    ownershipLost: false,
    proxyServer: owned ? 'http=127.0.0.1:8888' : null,
    bypassList: owned ? '<local>' : null,
    pacUrl: null,
    autoDetect: false,
    upstreamProxy: null,
    upstreamReachable: true,
  };
}

function recordingStatus(recording: boolean): CaptureStatus {
  return { listening: true, recording, host: '127.0.0.1', port: 8888, sessionId: 'session-1', capturedExchanges: 0 };
}

function subscribeCaptureStatus(overrides: Partial<InterceptorDesktopApi>): (status: CaptureStatus) => void {
  let receiveStatus!: (status: CaptureStatus) => void;
  installApi({
    onCaptureStatusChange: (callback) => { receiveStatus = callback; return () => undefined; },
    onCaptureReset: () => () => undefined,
    onCaptureImported: () => () => undefined,
    onCoreProcessStatusChange: () => () => undefined,
    getCoreProcessStatus: vi.fn().mockReturnValue(new Promise(() => undefined)),
    ...overrides,
  });
  useCaptureData();
  for (const [effect] of vi.mocked(useEffect).mock.calls) effect();
  return receiveStatus;
}