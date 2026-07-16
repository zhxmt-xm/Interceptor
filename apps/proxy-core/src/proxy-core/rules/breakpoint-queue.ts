/**
 * M7/T7.6 Breakpoint 状态机：规则命中 breakpoint action 时挂起请求/响应，等待用户
 * resolve（continue/edited/drop）或超时（timed_out），并在断线/退出时确定性关闭。
 *
 * 纯逻辑（Promise + timer），不触碰 Mockttp/IPC：rule-engine（T7.7）在 beforeRequest/
 * beforeResponse 调 suspend 并 await outcome，据 state 放行/编辑/丢弃；breakpoint.resolve
 * command 经 core-application 调 resolve；断线/关闭调 closeAll 把全部等待断点关为 timed_out。
 */

import type { BreakpointEdit } from '@interceptor/core-protocol';

export type BreakpointPhase = 'request' | 'response';
export type BreakpointResolutionAction = 'continue' | 'drop' | 'timeout';
export type BreakpointState = 'continued' | 'edited' | 'dropped' | 'timed_out';
export type BreakpointTimeoutPolicy = 'continue' | 'drop';

/** 挂起断点解除后的结果：state + 可选编辑（仅 edited 携带）+ 超时兜底策略。 */
export interface BreakpointOutcome {
  readonly state: BreakpointState;
  readonly edit?: BreakpointEdit;
  /** timed_out 时供引擎决定放行还是丢弃（来自 breakpoint action 的 onTimeout）。 */
  readonly timeoutPolicy?: BreakpointTimeoutPolicy;
}

/** 供 UI/状态展示的等待中断点信息。 */
export interface PendingBreakpointInfo {
  readonly id: string;
  readonly phase: BreakpointPhase;
  readonly createdAt: number;
}

interface PendingEntry {
  readonly id: string;
  readonly phase: BreakpointPhase;
  readonly createdAt: number;
  readonly timeoutPolicy: BreakpointTimeoutPolicy;
  readonly settle: (outcome: BreakpointOutcome) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * 等待中断点的注册表。单实例由 CoreApplication 持有，rule-engine 与 breakpoint.resolve
 * handler 共享；所有解除路径都经 finish 统一清理 timer 并 settle Promise，保证不泄漏。
 */
export class BreakpointQueue {
  private readonly pending = new Map<string, PendingEntry>();
  private sequence = 0;

  /**
   * 挂起一个断点，返回稳定 id 与解除结果 Promise；timeoutMs>0 时到期自动 timed_out。
   * 调用方：rule-engine 在 beforeRequest/beforeResponse 命中 breakpoint action 时。
   */
  suspend(
    phase: BreakpointPhase,
    timeoutMs: number,
    timeoutPolicy: BreakpointTimeoutPolicy,
  ): { readonly id: string; readonly outcome: Promise<BreakpointOutcome> } {
    this.sequence += 1;
    const id = `bp-${Date.now().toString(36)}-${this.sequence}`;
    let settle!: (outcome: BreakpointOutcome) => void;
    const outcome = new Promise<BreakpointOutcome>((resolve) => {
      settle = resolve;
    });
    const entry: PendingEntry = {
      id,
      phase,
      createdAt: Date.now(),
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
  ): BreakpointState | null {
    const entry = this.pending.get(id);
    if (!entry) {
      return null;
    }
    let outcome: BreakpointOutcome;
    if (action === 'continue') {
      outcome = edit ? { state: 'edited', edit } : { state: 'continued' };
    } else if (action === 'drop') {
      outcome = { state: 'dropped' };
    } else {
      outcome = { state: 'timed_out', timeoutPolicy: entry.timeoutPolicy };
    }
    this.finish(id, outcome);
    return outcome.state;
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
    }));
  }

  /** 等待中断点数量。 */
  get size(): number {
    return this.pending.size;
  }

  private finish(id: string, outcome: BreakpointOutcome): void {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    this.pending.delete(id);
    if (entry.timer !== null) {
      clearTimeout(entry.timer);
    }
    entry.settle(outcome);
  }
}
