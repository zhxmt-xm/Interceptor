import { useEffect } from 'react';

import type { SessionQueryRequest } from '../../../shared/desktop-api';
import { useCaptureStore, type CaptureFilter } from './captureStore';

const PAGE_SIZE = 200;
const SEARCH_DEBOUNCE_MS = 180;

/** 由视图过滤条件构造 Core 分页查询请求；segment 为客户端过滤不下推。 */
function toQueryRequest(
  filter: CaptureFilter,
  cursor?: string,
): SessionQueryRequest {
  const queryFilter: SessionQueryRequest['filter'] = {};
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
  store.beginLoad();
  try {
    const page = await api.querySessions(toQueryRequest(store.filter));
    useCaptureStore.getState().replaceRows(page);
  } catch (error) {
    useCaptureStore.getState().loadFailed(describeError(error));
  }
}

/** 按游标追加下一页历史行；列表滚动接近底部时调用。 */
export async function loadMoreSessions(): Promise<void> {
  const api = window.interceptor;
  const store = useCaptureStore.getState();
  if (!api?.querySessions || store.loading || !store.hasMore || !store.cursor) {
    return;
  }
  store.beginLoad();
  try {
    const page = await api.querySessions(toQueryRequest(store.filter, store.cursor));
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
    const status = store.capturing ? await api.stopCapture() : await api.startCapture();
    useCaptureStore.getState().setCapturing(status.listening);
    useCaptureStore.getState().setLive(status.listening);
    if (status.listening) {
      void refetchSessions();
    }
  } catch (error) {
    useCaptureStore.getState().loadFailed(describeError(error));
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

  // 挂载时同步一次代理捕获状态，驱动录制指示灯。
  useEffect(() => {
    const api = window.interceptor;
    if (!api?.getCaptureStatus) {
      return;
    }
    let active = true;
    void api
      .getCaptureStatus()
      .then((status) => {
        if (active) {
          useCaptureStore.getState().setCapturing(status.listening);
        }
      })
      .catch(() => {
        /* 代理状态不可用时保持默认未捕获状态。 */
      });
    return () => {
      active = false;
    };
  }, []);

  // Core 过滤条件变化时重查首页；search 输入去抖。
  useEffect(() => {
    const handle = setTimeout(() => {
      void refetchSessions();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchKey, method, status, host]);

  // 恢复 Live tail 时补拉最新一页，追平暂停期间遗漏的行。
  useEffect(() => {
    if (live) {
      void refetchSessions();
    }
  }, [live]);
}
