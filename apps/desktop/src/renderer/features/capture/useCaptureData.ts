import { useEffect } from 'react';

import type {
  CoreProcessStatus,
  SessionQueryRequest,
} from '../../../shared/desktop-api';
import { useCaptureStore } from './captureStore';

const PAGE_SIZE = 500;
const DEFAULT_CAPTURE_PORT = 8888;
const BOOTSTRAP_MAX_ATTEMPTS = 30;
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

/** 切换代理捕获开关：启动/停止 Core 代理并同步录制与 Live tail 状态。 */
export async function toggleCapture(): Promise<void> {
  const api = window.interceptor;
  if (!api?.startCapture || !api.stopCapture) {
    return;
  }
  const store = useCaptureStore.getState();
  try {
    if (store.capturing) {
      const status = await api.stopCapture();
      useCaptureStore.getState().setCapturing(status.listening);
      await refetchSessions();
      return;
    }

    const status = await api.startCapture(DEFAULT_CAPTURE_PORT);
    useCaptureStore.getState().setCapturing(status.listening);
    if (status.listening) {
      await enableSystemProxyWhenSupported();
      await refetchSessions();
    }
  } catch (error) {
    useCaptureStore.getState().loadFailed(describeError(error));
  }
}

/** 首次进入 Capture 时启动固定 loopback listener，并尽力接管系统代理。 */
async function bootstrapCapture(): Promise<void> {
  const status = await waitForCaptureListener();
  useCaptureStore.getState().setCapturing(status.listening);
  if (status.listening) {
    await enableSystemProxyWhenSupported();
    if (useCaptureStore.getState().rows.length === 0) {
      await refetchSessions();
    }
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
  }
}

/** 等待可用 Core 代际并启动 listener；启动期间的断连只在此有界重试。 */
async function waitForCaptureListener(): Promise<Awaited<ReturnType<typeof window.interceptor.getCaptureStatus>>> {
  const api = window.interceptor;
  let lastError: unknown = new Error('Proxy Core did not become ready.');
  for (let attempt = 0; attempt < BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
    try {
      const core = await api.getCoreProcessStatus();
      if (core.state === 'running') {
        const current = await api.getCaptureStatus();
        return current.listening
          ? current
          : await api.startCapture(DEFAULT_CAPTURE_PORT);
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, BOOTSTRAP_RETRY_MS);
    });
  }
  throw lastError;
}

/** 支持的平台上启用系统代理；已由 Interceptor 持有时保持幂等。 */
async function enableSystemProxyWhenSupported(): Promise<void> {
  const api = window.interceptor;
  const status = await api.getSystemProxyStatus();
  if (status.supported && !status.owned) {
    await api.enableSystemProxy();
  }
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
