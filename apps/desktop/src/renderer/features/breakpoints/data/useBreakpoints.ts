import { useEffect } from 'react';

import { useBreakpointsStore } from './breakpointsStore';
import { buildEdit } from '../utils';

/** 拉取当前等待断点快照并写入视图状态；轮询与操作后调用。 */
export async function refreshBreakpoints(): Promise<void> {
  const api = window.interceptor;
  if (!api?.listBreakpoints) {
    return;
  }
  try {
    const snapshot = await api.listBreakpoints();
    useBreakpointsStore.getState().applySnapshot(snapshot);
  } catch {
    /* Core 重连瞬间断点列表不可用时保持既有视图。 */
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
  store.setResolving(true);
  try {
    const edit = action === 'continue' && edited ? buildEdit(store.draft) : undefined;
    await api.resolveBreakpoint(breakpointId, action, edit);
    await refreshBreakpoints();
  } catch {
    /* 已被超时/他处解除时忽略。 */
  } finally {
    useBreakpointsStore.getState().setResolving(false);
  }
}

/** 放行全部等待断点（continue，不编辑）。 */
export async function continueAllBreakpoints(): Promise<void> {
  const api = window.interceptor;
  if (!api?.resolveBreakpoint) {
    return;
  }
  const { breakpoints } = useBreakpointsStore.getState();
  for (const breakpoint of breakpoints) {
    try {
      await api.resolveBreakpoint(breakpoint.id, 'continue');
    } catch {
      /* 逐个放行，个别失败不阻断其余。 */
    }
  }
  await refreshBreakpoints();
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
