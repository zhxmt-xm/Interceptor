import type {
  CaptureExchangeEventKind,
  CaptureExchangeSummary,
} from '@interceptor/core-protocol';

import type { CaptureEvent, PendingCaptureEvent } from './interfaces';

/**
 * Core 内非阻塞、按 Exchange 合并的捕获事件队列。
 *
 * 数据面（ProxyService）通过 enqueue 投递事件，永不阻塞；对同一 Exchange 的重复
 * Progress 合并为一条（保留首次 sequence 保证顺序稳定，摘要取最新），不因队列大小
 * 淘汰任何 Exchange。消费者通过 drain 批量取走并按 sequence 递增排序。
 *
 * 跨进程 push/ack 传输与 Renderer 订阅在 T3.4 后续集成；本队列是其算法核心，可独立单测。
 */
export class CaptureEventQueue {
  /** 按 Exchange ID 合并的待发事件。 */
  private readonly pending = new Map<string, PendingCaptureEvent>();
  /** 下一条新 Exchange 事件的单调序号。 */
  private nextSequence = 1;

  /**
   * 投递一条 Exchange 事件；对未 drain 的同 id 事件就地合并（摘要取最新）。
   * 调用方：ProxyService 捕获/更新 Exchange 后；非阻塞，保护数据面。
   */
  enqueue(kind: CaptureExchangeEventKind, summary: CaptureExchangeSummary): void {
    const existing = this.pending.get(summary.id);
    if (existing) {
      // 合并：保留首次 sequence 保证顺序稳定，摘要与终态取最新。
      existing.summary = summary;
      return;
    }

    this.pending.set(summary.id, {
      sequence: this.nextSequence++,
      kind,
      summary,
    });
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

  /** 丢弃清空时间切面之前尚未发送的事件；调用方：storage.cleanup(all)。 */
  reset(): void {
    this.pending.clear();
  }

}
