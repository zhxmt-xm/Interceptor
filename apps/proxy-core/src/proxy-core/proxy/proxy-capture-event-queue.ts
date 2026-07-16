import type {
  CaptureExchangeEventKind,
  CaptureExchangeSummary,
} from '@interceptor/core-protocol';

import { CAPTURE_EVENT_QUEUE_CAPACITY } from '../constants';
import type { CaptureEvent, PendingCaptureEvent } from './interfaces';
import { TERMINAL_STATES } from './proxy-constants';

/**
 * Core 内非阻塞、有界、按 Exchange 合并的捕获事件队列。
 *
 * 数据面（ProxyService）通过 enqueue 投递事件，永不阻塞；对同一 Exchange 的重复
 * Progress 合并为一条（保留首次 sequence 保证顺序稳定，摘要取最新）。超容量时优先
 * 淘汰最旧的**非终态**事件并计数，终态（completed/failed/aborted）不被容量压力静默
 * 丢弃。消费者通过 drain 批量取走并按 sequence 递增排序，实现批处理与背压解耦。
 *
 * 跨进程 push/ack 传输与 Renderer 订阅在 T3.4 后续集成；本队列是其算法核心，可独立单测。
 */
export class CaptureEventQueue {
  /** 合并后允许保留的非终态事件容量。 */
  private readonly capacity = CAPTURE_EVENT_QUEUE_CAPACITY;
  /** 按 Exchange ID 合并的待发事件。 */
  private readonly pending = new Map<string, PendingCaptureEvent>();
  /** 下一条新 Exchange 事件的单调序号。 */
  private nextSequence = 1;
  /** 因容量压力淘汰的非终态事件数。 */
  private droppedCount = 0;

  /**
   * 投递一条 Exchange 事件；对未 drain 的同 id 事件就地合并（摘要取最新）。
   * 调用方：ProxyService 捕获/更新 Exchange 后；非阻塞，保护数据面。
   */
  enqueue(kind: CaptureExchangeEventKind, summary: CaptureExchangeSummary): void {
    const terminal = TERMINAL_STATES.has(summary.state);
    const existing = this.pending.get(summary.id);
    if (existing) {
      // 合并：保留首次 sequence 保证顺序稳定，摘要与终态取最新。
      existing.summary = summary;
      existing.terminal = existing.terminal || terminal;
      return;
    }

    this.pending.set(summary.id, {
      sequence: this.nextSequence++,
      kind,
      summary,
      terminal,
    });
    this.enforceCapacity();
  }

  /**
   * 按 sequence 递增取走至多 maxBatch 条待发事件（取走即从队列移除）。
   * 调用方：事件推送循环批量发送；返回空数组表示当前无待发。
   */
  drain(maxBatch: number): CaptureEvent[] {
    if (maxBatch <= 0 || this.pending.size === 0) {
      return [];
    }
    const ordered = [...this.pending.values()].sort(
      (a, b) => a.sequence - b.sequence,
    );
    const batch = ordered.slice(0, maxBatch);
    for (const event of batch) {
      this.pending.delete(event.summary.id);
    }
    return batch.map((event) => ({
      sequence: event.sequence,
      kind: event.kind,
      summary: event.summary,
    }));
  }

  /** 当前待发事件数（合并后）。调用方：背压判断与测试。 */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** 因容量压力淘汰的非终态事件累计数。调用方：诊断与测试。 */
  get dropped(): number {
    return this.droppedCount;
  }

  /** 淘汰最旧非终态事件直到满足容量，终态事件永不静默丢弃。 */
  private enforceCapacity(): void {
    while (this.pending.size > this.capacity) {
      const victim = this.oldestNonTerminal();
      if (!victim) {
        // 全部为终态：不静默丢弃，允许暂时超容量，等待消费者 drain。
        return;
      }
      this.pending.delete(victim.summary.id);
      this.droppedCount += 1;
    }
  }

  /** 返回当前最旧的非终态事件。 */
  private oldestNonTerminal(): PendingCaptureEvent | null {
    let victim: PendingCaptureEvent | null = null;
    for (const event of this.pending.values()) {
      if (event.terminal) {
        continue;
      }
      if (!victim || event.sequence < victim.sequence) {
        victim = event;
      }
    }
    return victim;
  }
}
