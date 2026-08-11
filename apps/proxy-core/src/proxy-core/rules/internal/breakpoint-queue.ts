/**
 * M7/T7.6 Breakpoint 状态机：规则命中 breakpoint action 时挂起请求/响应，等待用户
 * resolve（continue/edited/drop）或超时（timed_out），并在断线/退出时确定性关闭。
 *
 * 纯逻辑（Promise + timer），不触碰 Mockttp/IPC：rule-engine（T7.7）在 beforeRequestHead/
 * beforeResponseHead 调 suspend 并 await outcome，据 state 放行/编辑/丢弃；breakpoint.resolve
 * command 经 core-application 调 resolve；断线/关闭调 closeAll 把全部等待断点关为 timed_out。
 */

import type { BreakpointEdit } from '@interceptor/core-protocol';
import type {
  BreakpointOutcome,
  BreakpointPhase,
  BreakpointResolutionAction,
  BreakpointResolutionState,
  BreakpointSnapshot,
  BreakpointState,
  BreakpointSuspension,
  BreakpointTimeoutPolicy,
  PendingBreakpointEntry,
  PendingBreakpointInfo,
} from '../interfaces';
import { BREAKPOINT_QUEUE_LIMIT } from './constants';

/**
 * 等待中断点的注册表。单实例由 CoreApplication 持有，rule-engine 与 breakpoint.resolve
 * handler 共享；所有解除路径都经 finish 统一清理 timer 并 settle Promise，保证不泄漏。
 */
export class BreakpointQueue {
  /** 以断点 ID 索引的等待中记录。 */
  private readonly pending = new Map<string, PendingBreakpointEntry>();
  /** 同一进程内用于生成稳定 ID 后缀的递增序号。 */
  private sequence = 0;
  /** 队列已满而未挂起、直接放行的命中累计数。 */
  private autoContinuedCount = 0;
  /** 欠 Renderer 的一次集合变更通知；挂起、解除与溢出放行都会置上。 */
  private pendingChangeNotice = false;

  /**
   * 挂起一个断点，返回稳定 id 与解除结果 Promise；timeoutMs>0 时到期自动 timed_out。
   * 队列已满时返回 null 并累加自动放行数，调用方必须原样放行，不得继续挂起真实流量。
   * 调用方：rule-engine 在 beforeRequestHead/beforeResponseHead 命中 breakpoint action 时。
   */
  suspend(
    phase: BreakpointPhase,
    timeoutMs: number,
    timeoutPolicy: BreakpointTimeoutPolicy,
    snapshot: BreakpointSnapshot = {
      ruleName: '',
      headers: [],
      bodyAvailable: false,
    },
    requestId?: string,
  ): BreakpointSuspension | null {
    if (this.pending.size >= BREAKPOINT_QUEUE_LIMIT) {
      this.autoContinuedCount += 1;
      this.pendingChangeNotice = true;
      return null;
    }
    this.sequence += 1;
    const id = `bp-${Date.now().toString(36)}-${this.sequence}`;
    let settle!: (outcome: BreakpointOutcome) => void;
    const outcome = new Promise<BreakpointOutcome>((resolve) => {
      settle = resolve;
    });
    const createdAt = Date.now();
    const entry: PendingBreakpointEntry = {
      id,
      phase,
      createdAt,
      deadline: timeoutMs > 0 ? createdAt + timeoutMs : 0,
      snapshot,
      ...(requestId !== undefined ? { requestId } : {}),
      timeoutPolicy,
      settle,
      timer: null,
    };
    if (timeoutMs > 0) {
      entry.timer = setTimeout(() => {
        this.finish(id, { state: 'timed_out', timeoutPolicy });
      }, timeoutMs);
    }
    this.pending.set(id, entry);
    this.pendingChangeNotice = true;
    return { id, outcome };
  }

  /**
   * 解除一个等待中断点：continue（带 edit→edited）/drop/timeout。
   * 返回最终 state；id 不存在或已解除返回 null。
   * 调用方：breakpoint.resolve command handler。
   */
  resolve(
    id: string,
    action: BreakpointResolutionAction,
    edit?: BreakpointEdit,
  ): BreakpointResolutionState | null {
    const entry = this.pending.get(id);
    if (!entry) {
      return null;
    }
    let state: BreakpointResolutionState;
    let outcome: BreakpointOutcome;
    if (action === 'continue') {
      state = edit ? 'edited' : 'continued';
      outcome = edit ? { state, edit } : { state };
    } else if (action === 'drop') {
      state = 'dropped';
      outcome = { state };
    } else {
      state = 'timed_out';
      outcome = { state, timeoutPolicy: entry.timeoutPolicy };
    }
    this.finish(id, outcome);
    return state;
  }

  /** 客户端中止 HTTP 请求时，只释放绑定同一 Mockttp request ID 的断点。 */
  abortRequest(requestId: string): number {
    const entries = [...this.pending.values()].filter(
      (entry) => entry.requestId === requestId,
    );
    for (const entry of entries) {
      this.finish(entry.id, { state: 'aborted' });
    }
    return entries.length;
  }

  /**
   * 断线/退出时确定性关闭全部等待断点为 timed_out（按各自 timeoutPolicy 兜底）。
   * 调用方：CoreApplication.stop 与 RPC 断线。
   */
  closeAll(): void {
    for (const entry of [...this.pending.values()]) {
      this.finish(entry.id, {
        state: 'timed_out',
        timeoutPolicy: entry.timeoutPolicy,
      });
    }
  }

  /** 当前等待中的断点信息（供 UI/状态）。 */
  list(): PendingBreakpointInfo[] {
    return [...this.pending.values()].map((entry) => ({
      id: entry.id,
      phase: entry.phase,
      createdAt: entry.createdAt,
      deadline: entry.deadline,
      snapshot: entry.snapshot,
    }));
  }

  /** 等待中断点数量。 */
  get size(): number {
    return this.pending.size;
  }

  /** 队列已满而被自动放行的命中累计数；供 UI 与诊断说明为什么没有停下来。 */
  get autoContinued(): number {
    return this.autoContinuedCount;
  }

  /** 取走待发的变更通知；事件泵据此决定这一批要不要带信号。 */
  drainChangeNotice(): boolean {
    const pending = this.pendingChangeNotice;
    this.pendingChangeNotice = false;
    return pending;
  }

  /** 通知没送出去时放回，下一轮重发。 */
  restoreChangeNotice(): void {
    this.pendingChangeNotice = true;
  }

  /** 统一清理 timer、移除记录并完成等待 Promise。 */
  private finish(id: string, outcome: BreakpointOutcome): void {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    this.pending.delete(id);
    this.pendingChangeNotice = true;
    if (entry.timer !== null) {
      clearTimeout(entry.timer);
    }
    entry.settle(outcome);
  }
}
