import { useEffect, useRef } from 'react';

import type { SessionQueryRequest } from '../../../shared/desktop-api';
import { useCaptureStore, type CaptureFilter } from './captureStore';

const PAGE_SIZE = 200;
const SEARCH_DEBOUNCE_MS = 180;
const DEFAULT_CAPTURE_PORT = 8888;
const BOOTSTRAP_MAX_ATTEMPTS = 30;
const BOOTSTRAP_RETRY_MS = 300;
let captureBootstrapPromise: Promise<void> | null = null;

/** 由视图过滤条件构造 Core 分页查询请求；segment 为客户端过滤不下推。 */
function toQueryRequest(
  filter: CaptureFilter,
  sessionId: string,
  cursor?: string,
): SessionQueryRequest {
  const queryFilter: SessionQueryRequest['filter'] = { sessionId };
  if (filter.search) {
    queryFilter.search = filter.search;
  }
  if (filter.method) {
    queryFilter.method = filter.method;
  }
  if (filter.status !== null) {
    queryFilter.status = filter.status;
  }
  if (filter.host) {
    queryFilter.host = filter.host;
  }
  return { limit: PAGE_SIZE, sort: 'started_desc', cursor, filter: queryFilter };
}

/** 拉取首页并替换视图；供过滤变化与恢复 Live tail 时调用。 */
export async function refetchSessions(): Promise<void> {
  const api = window.interceptor;
  if (!api?.querySessions) {
    return;
  }
  const store = useCaptureStore.getState();
  if (!store.activeSessionId) {
    return;
  }
  store.beginLoad();
  try {
    const page = await api.querySessions(
      toQueryRequest(store.filter, store.activeSessionId),
    );
    useCaptureStore.getState().replaceRows(page);
  } catch (error) {
    useCaptureStore.getState().loadFailed(describeError(error));
  }
}

/** 按游标追加下一页历史行；列表滚动接近底部时调用。 */
export async function loadMoreSessions(): Promise<void> {
  const api = window.interceptor;
  const store = useCaptureStore.getState();
  if (
    !api?.querySessions
    || !store.activeSessionId
    || store.loading
    || !store.hasMore
    || !store.cursor
  ) {
    return;
  }
  store.beginLoad();
  try {
    const page = await api.querySessions(
      toQueryRequest(store.filter, store.activeSessionId, store.cursor),
    );
    useCaptureStore.getState().appendRows(page);
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
    const recordingStartedAt = Date.now();
    if (store.capturing) {
      const status = await api.stopCapture();
      useCaptureStore.getState().clearView(Date.now());
      useCaptureStore.getState().setActiveSessionId(null);
      useCaptureStore.getState().setCapturing(status.listening);
      useCaptureStore.getState().setLive(false);
      return;
    }

    const status = await api.startCapture(DEFAULT_CAPTURE_PORT);
    if (status.listening) {
      useCaptureStore.getState().clearView(recordingStartedAt - 1);
      useCaptureStore.getState().setActiveSessionId(status.sessionId);
    }
    useCaptureStore.getState().setCapturing(status.listening);
    useCaptureStore.getState().setLive(status.listening);
    if (status.listening) {
      await enableSystemProxyWhenSupported();
    }
  } catch (error) {
    useCaptureStore.getState().loadFailed(describeError(error));
  }
}

/** 首次进入 Capture 时启动固定 loopback listener，并尽力接管系统代理。 */
async function bootstrapCapture(): Promise<void> {
  const status = await waitForCaptureListener();
  useCaptureStore.getState().setActiveSessionId(status.sessionId);
  useCaptureStore.getState().setCapturing(status.listening);
  useCaptureStore.getState().setLive(status.listening);
  if (status.listening) {
    await enableSystemProxyWhenSupported();
    if (useCaptureStore.getState().rows.length === 0) {
      await refetchSessions();
    }
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
 * 会话列表数据管线：订阅 Core 实时捕获事件、按过滤条件分页查询，写入 Zustand 视图状态。
 * 在 Capture 工作区挂载一次；不持有 body/header，全部按需从 Core 拉取。
 */
export function useCaptureData(): void {
  const searchKey = useCaptureStore((state) => state.filter.search);
  const method = useCaptureStore((state) => state.filter.method);
  const status = useCaptureStore((state) => state.filter.status);
  const host = useCaptureStore((state) => state.filter.host);
  const live = useCaptureStore((state) => state.live);
  const filterEffectMounted = useRef(false);
  const liveEffectMounted = useRef(false);

  // 实时事件订阅：批量合并进视图（store 内部按 Live 开关与过滤条件裁剪）。
  useEffect(() => {
    const api = window.interceptor;
    if (!api?.onCaptureEvents) {
      return;
    }
    return api.onCaptureEvents((events) => {
      useCaptureStore.getState().applyEvents(events);
    });
  }, []);

  // Renderer 生命周期只自动初始化一次；StrictMode 重挂载复用同一 Promise。
  useEffect(() => {
    captureBootstrapPromise ??= bootstrapCapture().catch((error: unknown) => {
      useCaptureStore.getState().loadFailed(describeError(error));
    });
  }, []);

  // Core 过滤条件变化时重查首页；search 输入去抖。
  useEffect(() => {
    if (!filterEffectMounted.current) {
      filterEffectMounted.current = true;
      if (useCaptureStore.getState().rows.length > 0) {
        return;
      }
    }
    const handle = setTimeout(() => {
      void refetchSessions();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchKey, method, status, host]);

  // 恢复 Live tail 时补拉最新一页，追平暂停期间遗漏的行。
  useEffect(() => {
    if (!liveEffectMounted.current) {
      liveEffectMounted.current = true;
      return;
    }
    if (live) {
      void refetchSessions();
    }
  }, [live]);
}
