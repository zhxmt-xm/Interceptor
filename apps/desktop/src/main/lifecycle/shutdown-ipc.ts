import { DESKTOP_IPC_CHANNELS, type BreakpointsSnapshot } from '../../shared/desktop-api';

/**
 * 退出已经开始时，给只读 IPC 的兜底快照。
 *
 * Action Gate 会拒绝关闭后到达的请求，Electron 又会把每次 rejected handler 写进主进程日志。
 * 断点快照是只读查询，迟到的请求直接拿空快照即可，不把 shutdown 错误写进日志。
 */
export function readShutdownIpcSnapshot(channel: string): BreakpointsSnapshot | null {
  return channel === DESKTOP_IPC_CHANNELS.breakpointList
    ? { breakpoints: [], enabled: false }
    : null;
}
