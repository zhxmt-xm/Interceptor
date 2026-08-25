/**
 * M7/T7.6 Breakpoint 状态机：规则命中 breakpoint action 时挂起请求/响应，等待用户
 * resolve（continue/edited/drop），并在客户端断开或Core退出时确定性关闭。
 *
 * 纯逻辑（Promise），不触碰 Mockttp/IPC：rule-engine（T7.7）在 beforeRequestHead/
 * beforeResponseHead 调 suspend 并 await outcome，据 state 放行/编辑/丢弃；breakpoint.resolve
 * command 经 core-application 调 resolve；断线/关闭调 closeAll 把全部等待断点关为 aborted。
 */

import type { BreakpointEdit, BreakpointQueueKey } from '@interceptor/core-protocol';
import type {
  BreakpointOutcome,
  BreakpointPhase,
  BreakpointResolutionAction,
  BreakpointResolutionState,
  BreakpointSnapshot,
  BreakpointSuspension,
  PendingBreakpointEntry,
  PendingBreakpointInfo,
} from '../interfaces';

/**
 * 等待中断点的注册表。单实例由 CoreApplication 持有，rule-engine 与 breakpoint.resolve
 * handler 共享；所有解除路径都经 finish 统一移除记录并 settle Promise，保证不泄漏。
 */
export class BreakpointQueue {
  /** 以断点 ID 索引的等待中记录。 */
  private readonly pending = new Map<string, PendingBreakpointEntry>();
  /** 同一进程内用于生成稳定 ID 后缀的递增序号。 */
  private sequence = 0;
  /** 欠 Renderer 的一次集合变更通知。 */
  private pendingChangeNotice = false;

  /**
    * 挂起一个断点，返回稳定 id 与解除结果 Promise。
   * 调用方：rule-engine 在 beforeRequestHead/beforeResponseHead 命中 breakpoint action 时。
   */
  suspend(
    phase: BreakpointPhase,
    queueKey: BreakpointQueueKey,
    ruleId: string | undefined,
    snapshot: BreakpointSnapshot = {
      ruleName: '',
      headers: [],
      bodyAvailable: false,
    },
    requestId?: string,
  ): BreakpointSuspension {
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
      queueKey,
      ...(ruleId !== undefined ? { ruleId } : {}),
      createdAt,
      snapshot,
      ...(requestId !== undefined ? { requestId } : {}),
      settle,
    };
    this.pending.set(id, entry);
    this.pendingChangeNotice = true;
    return { id, outcome };
  }

  /**
    * 解除一个等待中断点：continue（带 edit→edited）或drop。
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
    } else {
      state = 'dropped';
      outcome = { state };
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

  /** 原样放行命令开始时属于指定逻辑队列的全部等待断点。 */
  continueQueue(queueKey: BreakpointQueueKey): number {
    return this.resolveMatching(
      (entry) => entry.queueKey === queueKey,
      { state: 'continued' },
    );
  }

  /** 丢弃命令开始时属于指定逻辑队列的全部等待断点。 */
  dropQueue(queueKey: BreakpointQueueKey): number {
    return this.resolveMatching(
      (entry) => entry.queueKey === queueKey,
      { state: 'dropped' },
    );
  }

  /** 原样放行命令开始时由指定Rule挂起的全部等待断点。 */
  continueRule(ruleId: string): number {
    return this.resolveMatching(
      (entry) => entry.ruleId === ruleId,
      { state: 'continued' },
    );
  }

  /**
   * 断线/退出时确定性关闭全部等待断点为aborted。
   * 调用方：CoreApplication.stop 与 RPC 断线。
   */
  closeAll(): void {
    for (const entry of [...this.pending.values()]) {
      this.finish(entry.id, { state: 'aborted' });
    }
  }

  /** 当前等待中的断点信息（供 UI/状态）。 */
  list(): PendingBreakpointInfo[] {
    return [...this.pending.values()].map((entry) => ({
      id: entry.id,
      phase: entry.phase,
      queueKey: entry.queueKey,
      ...(entry.ruleId !== undefined ? { ruleId: entry.ruleId } : {}),
      createdAt: entry.createdAt,
      snapshot: entry.snapshot,
    }));
  }

  /** 等待中断点数量。 */
  get size(): number {
    return this.pending.size;
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

  /** 固定匹配项ID快照后逐项结算，返回执行时仍存在的目标数。 */
  private resolveMatching(
    matches: (entry: PendingBreakpointEntry) => boolean,
    outcome: BreakpointOutcome,
  ): number {
    const breakpointIds = [...this.pending.values()]
      .filter(matches)
      .map((entry) => entry.id);
    let resolvedCount = 0;
    for (const breakpointId of breakpointIds) {
      if (this.finish(breakpointId, outcome)) {
        resolvedCount += 1;
      }
    }
    return resolvedCount;
  }

  /** 移除一个等待记录并完成其Promise；目标已消失时返回false。 */
  private finish(id: string, outcome: BreakpointOutcome): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }
    this.pending.delete(id);
    this.pendingChangeNotice = true;
    entry.settle(outcome);
    return true;
  }
}
