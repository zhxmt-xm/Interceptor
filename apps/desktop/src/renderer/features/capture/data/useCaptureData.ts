import { useEffect } from 'react';

import type {
  CoreProcessStatus,
  SessionQueryRequest,
} from '../../../../shared/desktop-api';
import { useCaptureStore } from './captureStore';

const PAGE_SIZE = 500;
const DEFAULT_CAPTURE_PORT = 8888;
const BOOTSTRAP_RETRY_MS = 300;
let captureBootstrapPromise: Promise<void> | null = null;
let captureCoreGeneration: string | null = null;

/** 构造当前 Core 代际的无过滤分页请求；包含 Stop 前的全部 Recording Session。 */
function toQueryRequest(
  cursor?: string,
): SessionQueryRequest {
  return {
    limit: PAGE_SIZE,
    sort: 'started_desc',
    cursor,
    filter: {},
  };
}

/** 分批拉取当前 Core 代际的完整 summary 镜像，完成后一次合并进 Zustand。 */
export async function refetchSessions(): Promise<void> {
  const api = window.interceptor;
  if (!api?.querySessions) {
    return;
  }
  const store = useCaptureStore.getState();
  const syncRevision = store.beginLoad();
  try {
    const rows = [];
    let cursor: string | undefined;
    do {
      const page = await api.querySessions(toQueryRequest(cursor));
      rows.push(...page.items);
      cursor = page.hasMore ? page.nextCursor : undefined;
    } while (cursor);
    useCaptureStore.getState().replaceAllRows(rows, syncRevision);
  } catch (error) {
    useCaptureStore.getState().loadFailed(describeError(error));
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 切换记录开关：Start 确保监听器/系统代理就绪并恢复记录；Stop 只暂停记录，保留代理管线。 */
export async function toggleCapture(): Promise<void> {
  const api = window.interceptor;
  if (!api?.startCapture || !api.stopCapture) {
    return;
  }
  const store = useCaptureStore.getState();
  try {
    if (store.capturing) {
      // Stop 只暂停记录：监听器与系统代理保持运行，流量继续转发，记录保留。
      const status = await api.stopCapture();
      useCaptureStore.getState().setCapturing(status.recording);
      return;
    }

    const status = await api.startCapture(DEFAULT_CAPTURE_PORT);
    if (status.listening) {
      const ready = await checkSystemProxyReadiness();
      useCaptureStore.getState().setCapturing(ready && status.recording);
      await refetchSessions();
    } else {
      useCaptureStore.getState().setCapturing(false);
      setProxyReadinessIssue(
        'listener',
        new Error('Local proxy listener did not start.'),
      );
    }
  } catch (error) {
    useCaptureStore.getState().loadFailed(describeError(error));
    setProxyReadinessIssue('listener', error);
  }
}

/** 首次进入 Capture 时启动固定 loopback listener，并尽力接管系统代理。 */
async function bootstrapCapture(): Promise<void> {
  const status = await waitForCaptureListener();
  if (status.listening) {
    const ready = await checkSystemProxyReadiness();
    useCaptureStore.getState().setCapturing(ready && status.recording);
    if (useCaptureStore.getState().rows.length === 0) {
      await refetchSessions();
    }
  } else {
    useCaptureStore.getState().setCapturing(false);
  }
}

/** 对齐 Core 进程代际：同代际 Stop/Start 保留行，PID 变化则清空失效详情并重新 bootstrap。 */
function applyCoreStatus(status: CoreProcessStatus): void {
  if (status.state === 'running' && status.pid !== null) {
    const generation = `${status.pid}:${status.startedAt ?? ''}:${status.restartCount}`;
    if (captureCoreGeneration === generation && captureBootstrapPromise) {
      return;
    }
    if (captureCoreGeneration !== null && captureCoreGeneration !== generation) {
      useCaptureStore.getState().clearView(Date.now());
    }
    captureCoreGeneration = generation;
    const bootstrap = bootstrapCapture().catch((error: unknown) => {
      if (
        captureBootstrapPromise === bootstrap
        && captureCoreGeneration === generation
      ) {
        useCaptureStore.getState().loadFailed(describeError(error));
        setProxyReadinessIssue('listener', error);
        captureBootstrapPromise = null;
      }
    });
    captureBootstrapPromise = bootstrap;
    return;
  }

  if (captureCoreGeneration !== null) {
    captureCoreGeneration = null;
    captureBootstrapPromise = null;
    useCaptureStore.getState().clearView(Date.now());
    useCaptureStore.getState().setCapturing(false);
    useCaptureStore.getState().setProxyReadinessIssue(null);
  }
}

/** 等待可用 Core 代际并启动 listener；启动期间的断连只在此有界重试。 */
async function waitForCaptureListener(): Promise<Awaited<ReturnType<typeof window.interceptor.getCaptureStatus>>> {
  const api = window.interceptor;
  while (true) {
    try {
      const core = await api.getCoreProcessStatus();
      if (core.state === 'running') {
        const current = await api.getCaptureStatus();
        return current.listening
          ? current
          : await api.startCapture(DEFAULT_CAPTURE_PORT);
      }
    } catch {
      // Core generation transitions are transient; keep waiting for a running generation.
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, BOOTSTRAP_RETRY_MS);
    });
  }
}

/** 检查系统代理 readiness；未持有时只提示，不静默修改操作系统设置。 */
async function checkSystemProxyReadiness(): Promise<boolean> {
  const api = window.interceptor;
  try {
    const status = await api.getSystemProxyStatus();
    if (!status.supported || (status.owned && !status.ownershipLost)) {
      useCaptureStore.getState().setProxyReadinessIssue(null);
      return true;
    }
    useCaptureStore.getState().setProxyReadinessIssue({
      kind: 'system-proxy',
      ownershipLost: status.ownershipLost,
      message: null,
    });
    return false;
  } catch (error) {
    setProxyReadinessIssue('system-proxy', error);
    return false;
  }
}

/** 用户从 readiness 弹层显式重试 listener 并启用系统代理。 */
export async function retryCaptureProxyReadiness(): Promise<boolean> {
  const api = window.interceptor;
  let ownershipLost = false;
  try {
    const current = await api.getCaptureStatus();
    const capture = current.listening
      ? current
      : await api.startCapture(DEFAULT_CAPTURE_PORT);
    if (!capture.listening) {
      throw new Error('Local proxy listener did not start.');
    }

    const status = await api.getSystemProxyStatus();
    ownershipLost = status.ownershipLost;
    if (!status.supported) {
      useCaptureStore.getState().setCapturing(true);
      useCaptureStore.getState().setProxyReadinessIssue(null);
      return true;
    }
    const enabled = status.owned && !status.ownershipLost
      ? status
      : await api.enableSystemProxy();
    if (!enabled.owned || enabled.ownershipLost) {
      useCaptureStore.getState().setProxyReadinessIssue({
        kind: 'system-proxy',
        ownershipLost: enabled.ownershipLost,
        message: null,
      });
      useCaptureStore.getState().setCapturing(false);
      return false;
    }
    useCaptureStore.getState().setCapturing(true);
    useCaptureStore.getState().setProxyReadinessIssue(null);
    await refetchSessions();
    return true;
  } catch (error) {
    useCaptureStore.getState().setCapturing(false);
    const listening = await api.getCaptureStatus()
      .then((status) => status.listening)
      .catch(() => false);
    setProxyReadinessIssue(
      listening ? 'system-proxy' : 'listener',
      error,
      ownershipLost,
    );
    return false;
  }
}

/** Store one complete readiness failure for the global recovery dialog. */
function setProxyReadinessIssue(
  kind: 'listener' | 'system-proxy',
  error: unknown,
  ownershipLost = false,
): void {
  useCaptureStore.getState().setProxyReadinessIssue({
    kind,
    ownershipLost,
    message: describeError(error),
  });
}

/**
 * App 生命周期数据管线：持续订阅 Core 事件并维护当前 Core 的全量轻量 summary。
 * 切换 feature 不卸载；body/header 仍按需从 Core 拉取。
 */
export function useCaptureData(): void {
  // 实时事件订阅：无论当前 feature/filter/live 状态都合并进全量 summary 镜像。
  useEffect(() => {
    const api = window.interceptor;
    if (!api?.onCaptureEvents) {
      return;
    }
    return api.onCaptureEvents((events) => {
      useCaptureStore.getState().applyEvents(events);
    });
  }, []);

  // 应用图标由 Main 主动推送（每个应用一次），Renderer 从不主动索取。
  useEffect(() => {
    const api = window.interceptor;
    if (!api?.onClientAppIcons) {
      return;
    }
    return api.onClientAppIcons((icons) => {
      useCaptureStore.getState().applyClientAppIcons(icons);
    });
  }, []);

  // 订阅 Core 代际；同一 PID 内 Stop/Start 不清行，重启后新 Core 自动建立空 Capture。
  useEffect(() => {
    let active = true;
    const apply = (status: CoreProcessStatus): void => {
      if (active) {
        applyCoreStatus(status);
      }
    };
    const unsubscribe = window.interceptor.onCoreProcessStatusChange(apply);
    void window.interceptor.getCoreProcessStatus().then(apply).catch((error) => {
      if (active) {
        useCaptureStore.getState().loadFailed(describeError(error));
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

}
