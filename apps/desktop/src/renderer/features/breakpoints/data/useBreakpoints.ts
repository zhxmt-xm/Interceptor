import { useEffect } from 'react';

import { useBreakpointsStore } from './breakpointsStore';
import { POLL_INTERVAL_MS } from '../constants';
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

/** Breakpoints 工作区数据管线：挂载后每秒轮询等待断点快照。挂载一次。 */
export function useBreakpoints(): void {
  useEffect(() => {
    void refreshBreakpoints();
    const handle = setInterval(() => {
      void refreshBreakpoints();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, []);
}
