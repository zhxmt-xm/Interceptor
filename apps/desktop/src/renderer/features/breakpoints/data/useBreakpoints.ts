import { useEffect } from 'react';

import type {
  BreakpointQueueKey,
  BreakpointsSnapshot,
} from '../../../../shared/desktop-api';
import { useCaptureStore } from '../../capture/data/captureStore';
import { useBreakpointsStore } from './breakpointsStore';
import { buildEdit, nextQueueHeadExchangeId, selectedBreakpoint } from '../utils';

/** 拉取当前等待断点快照并写入视图状态；轮询与操作后调用。 */
export async function refreshBreakpoints(): Promise<BreakpointsSnapshot | null> {
  const api = window.interceptor;
  if (!api?.listBreakpoints) {
    return null;
  }
  try {
    const snapshot = await api.listBreakpoints();
    useBreakpointsStore.getState().applySnapshot(snapshot);
    return snapshot;
  } catch {
    /* Core 重连瞬间断点列表不可用时保持既有视图。 */
    return null;
  }
}

/** 命令完成后只在用户仍查看旧队首时推进到最新同队列队首。 */
function advanceCaptureSelection(
  resolved: ReturnType<typeof selectedBreakpoint>,
  latest: BreakpointsSnapshot | null,
): void {
  if (!resolved || !latest) {
    return;
  }
  const captureStore = useCaptureStore.getState();
  const nextExchangeId = nextQueueHeadExchangeId(
    resolved,
    latest.breakpoints,
    captureStore.selectedId,
  );
  if (nextExchangeId) {
    captureStore.select(nextExchangeId);
  }
}

/** 放行当前选中断点：continue（edited 时带草稿编辑）/ drop。 */
export async function resolveSelected(
  action: 'continue' | 'drop',
  edited: boolean,
): Promise<void> {
  const api = window.interceptor;
  const store = useBreakpointsStore.getState();
  if (!api?.resolveBreakpoint || !store.draft || store.resolving) {
    return;
  }
  const breakpointId = store.draft.breakpointId;
  const resolved = selectedBreakpoint(store);
  store.setResolving(true);
  try {
    const edit = action === 'continue' && edited ? buildEdit(store.draft) : undefined;
    await api.resolveBreakpoint(breakpointId, action, edit);
    advanceCaptureSelection(resolved, await refreshBreakpoints());
  } catch {
    /* 已被客户端abort或他处解除时忽略。 */
  } finally {
    useBreakpointsStore.getState().setResolving(false);
  }
}

/** 原样放行命令开始时当前逻辑队列中的全部断点。 */
export async function continueQueue(queueKey: BreakpointQueueKey): Promise<void> {
  const api = window.interceptor;
  const store = useBreakpointsStore.getState();
  if (!api?.continueBreakpointQueue || store.resolving) {
    return;
  }
  store.setResolving(true);
  const resolved = selectedBreakpoint(store);
  try {
    await api.continueBreakpointQueue(queueKey);
    advanceCaptureSelection(resolved, await refreshBreakpoints());
  } catch {
    /* 调用期间目标并发消失时由Core返回实际计数；连接失败留给下一次快照纠正。 */
  } finally {
    useBreakpointsStore.getState().setResolving(false);
  }
}

/** 丢弃命令开始时当前逻辑队列中的全部断点。 */
export async function dropQueue(queueKey: BreakpointQueueKey): Promise<void> {
  const api = window.interceptor;
  const store = useBreakpointsStore.getState();
  if (!api?.dropBreakpointQueue || store.resolving) {
    return;
  }
  store.setResolving(true);
  const resolved = selectedBreakpoint(store);
  try {
    await api.dropBreakpointQueue(queueKey);
    advanceCaptureSelection(resolved, await refreshBreakpoints());
  } catch {
    /* Core重连时保留当前视图，下一次状态信号会同步真实队列。 */
  } finally {
    useBreakpointsStore.getState().setResolving(false);
  }
}

/** 原样放行命令开始时由当前Rule挂起的全部断点。 */
export async function continueRule(ruleId: string): Promise<void> {
  const api = window.interceptor;
  const store = useBreakpointsStore.getState();
  if (!api?.continueBreakpointRule || store.resolving) {
    return;
  }
  store.setResolving(true);
  const resolved = selectedBreakpoint(store);
  try {
    await api.continueBreakpointRule(ruleId);
    advanceCaptureSelection(resolved, await refreshBreakpoints());
  } catch {
    /* Rule已删除或Core重连时由后续快照纠正。 */
  } finally {
    useBreakpointsStore.getState().setResolving(false);
  }
}

/** 切换全局 break-on-match 开关。 */
export async function setBreakOnMatch(enabled: boolean): Promise<void> {
  const api = window.interceptor;
  if (!api?.setBreakpointsEnabled) {
    return;
  }
  try {
    await api.setBreakpointsEnabled(enabled);
  } catch {
    /* 忽略，下次轮询会同步真实状态。 */
  }
  await refreshBreakpoints();
}

/**
 * 断点感知数据管线：Core 每次挂起/解除都推一个信号，收到就重取快照。
 *
 * 必须由 App 壳挂载一次：断点挂起的是真实流量，如果只在某个页面订阅，
 * 用户在其他工作区时浏览器会莫名卡死再自己恢复，全程零提示。
 *
 * Core 一离开 running 就清空：那一代的队列已随进程一起消失，listener 也没了，
 * 再显示 paused 就是骗人——不能等新 Core 起来才纠正。
 */
export function useBreakpoints(): void {
  useEffect(() => {
    void refreshBreakpoints();
    const stopBreakpointSignals = window.interceptor.onBreakpointsChange(() => {
      void refreshBreakpoints();
    });
    const stopCoreStatus = window.interceptor.onCoreProcessStatusChange((status) => {
      if (status.state === 'running') {
        void refreshBreakpoints();
      } else {
        useBreakpointsStore.getState().clear();
      }
    });
    return () => {
      stopBreakpointSignals();
      stopCoreStatus();
    };
  }, []);
}
