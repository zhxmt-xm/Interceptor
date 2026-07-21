import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InterceptorDesktopApi } from '../../../../shared/desktop-api';
import { useCaptureStore } from '../data/captureStore';
import { retryCaptureProxyReadiness, toggleCapture } from '../data/useCaptureData';

const originalWindow = globalThis.window;

describe('capture proxy readiness', () => {
  beforeEach(() => {
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

  it('prompts when a manual Start has no owned system proxy', async () => {
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
    });

    await toggleCapture();

    expect(useCaptureStore.getState().capturing).toBe(false);
    expect(useCaptureStore.getState().proxyReadinessIssue).toMatchObject({
      kind: 'system-proxy',
      ownershipLost: false,
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
  };
}