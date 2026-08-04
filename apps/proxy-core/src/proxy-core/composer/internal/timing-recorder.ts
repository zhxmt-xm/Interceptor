import type { Socket } from 'node:net';

import type { ComposerTiming } from '../interfaces';

/**
 * 按 socket 生命周期事件记录各阶段时刻，并在结束时折算成分阶段耗时。
 *
 * 阶段用相邻时刻相减得到，因此复用连接（无 lookup/connect）或明文请求（无 secureConnect）
 * 只会让对应阶段为 0，不需要分支判断。
 */
export class TimingRecorder {
  /** 发起时刻，全部阶段以它为起点。 */
  private readonly startedAt = Date.now();
  /** DNS 解析完成时刻。 */
  private lookupAt = 0;
  /** TCP 建连完成时刻。 */
  private connectAt = 0;
  /** TLS 握手完成时刻。 */
  private secureConnectAt = 0;
  /** 请求写出完成时刻。 */
  private requestSentAt = 0;
  /** 首个响应字节到达时刻。 */
  private responseAt = 0;

  /** 订阅 socket 的连接阶段事件；socket 复用时相应事件不会触发。 */
  observeSocket(socket: Socket): void {
    socket.once('lookup', () => {
      this.lookupAt = Date.now();
    });
    socket.once('connect', () => {
      this.connectAt = Date.now();
    });
    socket.once('secureConnect', () => {
      this.secureConnectAt = Date.now();
    });
  }

  /** 请求头与正文已写完。 */
  markRequestSent(): void {
    this.requestSentAt = Date.now();
  }

  /** 收到响应头（首字节）。 */
  markResponseStarted(): void {
    if (this.responseAt === 0) {
      this.responseAt = Date.now();
    }
  }

  /** 响应结束，折算出各阶段耗时。 */
  finish(): ComposerTiming {
    const endedAt = Date.now();
    // 缺失的时刻回落到前一个已知时刻，使该阶段计为 0 而不是产生负数。
    const lookupAt = this.lookupAt || this.startedAt;
    const connectAt = this.connectAt || lookupAt;
    const secureConnectAt = this.secureConnectAt || connectAt;
    const requestSentAt = this.requestSentAt || secureConnectAt;
    const responseAt = this.responseAt || requestSentAt;
    return {
      dnsMs: lookupAt - this.startedAt,
      tcpMs: connectAt - lookupAt,
      tlsMs: secureConnectAt - connectAt,
      requestMs: requestSentAt - secureConnectAt,
      waitingMs: responseAt - requestSentAt,
      downloadMs: endedAt - responseAt,
      totalMs: endedAt - this.startedAt,
    };
  }

  /** 未建立连接就失败时的空时序，只保留已经过去的总时长。 */
  static empty(totalMs = 0): ComposerTiming {
    return {
      dnsMs: 0,
      tcpMs: 0,
      tlsMs: 0,
      requestMs: 0,
      waitingMs: 0,
      downloadMs: 0,
      totalMs,
    };
  }
}
