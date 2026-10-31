import type { Readable } from 'node:stream';

import type { CaptureReplayOutcome } from '@interceptor/core-protocol';

/** 重放命令对 Renderer 的结果；成功只表示请求已交给本地代理。 */
export type ReplayOutcome = CaptureReplayOutcome;

/** 重放使用的传输协议；与录制时保持一致。 */
export type ReplayProtocol = 'h1' | 'h2';

/** 一条待发送的原始请求头；h2 伪首部保留 isPseudo 标记。 */
export interface ReplayHeader {
  readonly name: string;
  readonly value: string;
  readonly isPseudo?: boolean;
}

/** 从 Capture 存储还原出的原始请求。 */
export interface ReplayRequest {
  readonly method: string;
  readonly url: string;
  readonly protocol: ReplayProtocol;
  readonly headers: readonly ReplayHeader[];
  /** 线上编码的正文引用；无正文时为 null。 */
  readonly body: { readonly hash: string; readonly size: number } | null;
}

/** ProxyClient 发送一次重放所需的全部输入。 */
export interface ReplaySendOptions {
  /** 本地代理监听端口。 */
  readonly port: number;
  readonly request: ReplayRequest;
  readonly abortSignal: AbortSignal;
  /** 打开原始正文的只读流；无正文时为 null。 */
  readonly openBody: (() => Readable) | null;
  /** 发送完成后的异步失败回调，只用于诊断，不影响命令结果。 */
  readonly onAsyncFailure: (error: Error) => void;
}
