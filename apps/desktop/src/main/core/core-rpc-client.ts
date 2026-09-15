import { randomUUID } from 'node:crypto';

import {
  CORE_PROTOCOL_VERSION,
  parseCoreToMainMessage,
  type CaptureExchangeEvent,
  type ClientAppIdentity,
  type CoreCommand,
  type CoreEventBatch,
  type CoreResult,
  type CoreResultForCommand,
  type TlsCompatibilityEvent,
} from '@interceptor/core-protocol';

import type {
  CoreRpcProtocolIssueListener,
  CoreRequestOptions,
  CoreRpcClientOptions,
  CoreRpcPort,
} from '../interfaces';
import { CoreRpcError } from './core-rpc-error';
import { PendingRpcRequest } from './pending-rpc-request';

/** Main 侧唯一的 Core 业务入口：把 typed command 映射成 Promise。 */
export class CoreRpcClient {
  /** 每个 Command type 对应的期望 Result type；用于校验响应与请求匹配。 */
  private static readonly RESULT_TYPE_BY_COMMAND: Record<
    CoreCommand['type'],
    CoreResult['type']
  > = {
    'body.read-range': 'body.range',
    'body.export.start': 'transfer.job',
    'breakpoint.resolve': 'breakpoint.resolution',
    'breakpoint.continueQueue': 'breakpoint.batch-resolution',
    'breakpoint.dropQueue': 'breakpoint.batch-resolution',
    'breakpoint.continueRule': 'breakpoint.batch-resolution',
    'breakpoint.list': 'breakpoint.pending',
    'breakpoint.configure': 'breakpoint.config',
    'collection.get': 'collection.collection',
    'collection.replace': 'collection.revision',
    'tls-passthrough.get': 'tls-passthrough.settings',
    'tls-passthrough.replace': 'tls-passthrough.revision',
    'composer.send': 'composer.response',
    'tls.probe': 'tls.probed',
    'grpc.messages': 'grpc.messages',
    'grpc.read-range': 'grpc.range',
    'har.export.start': 'transfer.job',
    'har.import.start': 'transfer.job',
    'archive.export.start': 'transfer.job',
    'archive.import.start': 'transfer.job',
    'diagnostics.recent': 'diagnostics.records',
    'diagnostics.ingest': 'diagnostics.ingested',
    'diagnostics.query': 'diagnostics.page',
    'diagnostics.export.start': 'transfer.job',
    'echo': 'echo',
    'rules.get': 'rules.ruleset',
    'rules.hits': 'rules.hits',
    'rules.replace': 'rules.revision',
    'sessions.query': 'sessions.page',
    'sessions.detail': 'sessions.detail',
    'websocket.frames': 'websocket.frames',
    'websocket.breakpoint.enable': 'websocket.breakpoint.state',
    'websocket.breakpoint.disable': 'websocket.breakpoint.state',
    'capture.status': 'capture.status',
    'capture.cleanup': 'capture.status',
    'transfer.job.cancel': 'transfer.job',
    'transfer.job.get': 'transfer.job',
    'proxy.start': 'proxy.status',
    'proxy.stop': 'proxy.status',
    'proxy.status': 'proxy.status',
    'proxy.setRecording': 'proxy.status',
    'proxy.setUpstream': 'proxy.status',
    'tls.useCertificate': 'tls.state',
    'tls.startDecryption': 'tls.state',
    'tls.stopDecryption': 'tls.state',
    'tls.replaceInsecureHosts': 'tls.insecureHosts',
    'tls.getInsecureHosts': 'tls.insecureHosts',
    'tls.saveDecryptionPreference': 'tls.decryptionPreference',
    'tls.getDecryptionPreference': 'tls.decryptionPreference',
  };

  private readonly createId: () => string;
  private readonly pending = new Map<string, PendingRpcRequest>();
  private readonly requestTimeoutMs: number | undefined;
  private port: CoreRpcPort | null = null;
  private removeMessageListener: (() => void) | null = null;
  private removeCloseListener: (() => void) | null = null;
  private captureEventListener:
    | ((
        events: CaptureExchangeEvent[],
        clientApps: ClientAppIdentity[],
      ) => void)
    | null = null;
    /** Global TLS compatibility listener, independent from Capture exchange state. */
    private tlsCompatibilityEventListener:
      | ((events: TlsCompatibilityEvent[]) => void)
      | null = null;
  /** 断点集合变更信号；Renderer 据此立即重取，不必等下一次轮询。 */
  private breakpointsChangedListener: (() => void) | null = null;
  /** Capture成功导入后通知Main刷新所有Renderer。 */
  private captureImportedListener: (() => void) | null = null;
  /** 单条 Core 消息无法关联/解析时的诊断监听器；不代表连接失效。 */
  private protocolIssueListener: CoreRpcProtocolIssueListener | null = null;

  constructor(options: CoreRpcClientOptions = {}) {
    this.createId = options.createId ?? randomUUID;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  attach(port: CoreRpcPort): void {
    // Core 每次重启都会替换 MessagePort。先拒绝旧连接上的 Promise，避免旧响应
    // 混入新进程；MessagePort 会暂存 listener 注册前到达的消息。
    this.disconnect('Core RPC connection was replaced.');
    this.port = port;

    try {
      this.removeMessageListener = port.onMessage((message) => {
        if (this.port === port) {
          this.handleResponse(message);
        }
      });
      this.removeCloseListener = port.onClose(() => {
        if (this.port === port) {
          this.disconnect('Core RPC connection closed.');
        }
      });
      port.start();
    } catch {
      this.disconnect('Unable to initialize the Core RPC connection.');
      throw new Error('Unable to initialize the Core RPC connection.');
    }
  }

  /**
   * 注册捕获事件订阅（跨 Core 重启持续）；每收到一批 event-batch 回调一次并自动 ack。
   * 调用方：CoreRuntime 向 Main 转发实时捕获事件。
   */
  onCaptureEvents(
    listener: (
      events: CaptureExchangeEvent[],
      clientApps: ClientAppIdentity[],
    ) => void,
  ): void {
    this.captureEventListener = listener;
  }

  /** Register the cross-Core-generation TLS compatibility event consumer. */
  onTlsCompatibilityEvents(
    listener: (events: TlsCompatibilityEvent[]) => void,
  ): void {
    this.tlsCompatibilityEventListener = listener;
  }

  /** 注册断点集合变更通知；只是信号，快照由 Renderer 自己拉。 */
  onBreakpointsChanged(listener: () => void): void {
    this.breakpointsChangedListener = listener;
  }

  /** 注册Capture导入通知，跨Core重启保留订阅。 */
  onCaptureImported(listener: () => void): void {
    this.captureImportedListener = listener;
  }

  /** 注册单消息协议问题监听器；问题只影响该消息或对应 request。 */
  onProtocolIssue(listener: CoreRpcProtocolIssueListener): void {
    this.protocolIssueListener = listener;
  }

  request<T extends CoreCommand>(
    command: T,
    options: CoreRequestOptions = {},
  ): Promise<CoreResultForCommand<T>> {
    const port = this.port;
    if (!port) {
      return Promise.reject(CoreRpcError.of(
        'disconnected',
        'Core RPC connection is unavailable.',
      ));
    }
    if (options.abortSignal?.aborted) {
      return Promise.reject(CoreRpcError.of(
        'cancelled',
        'The Core request was cancelled.',
      ));
    }

    const requestId = options.requestId ?? `request-${this.createId()}`;
    const traceId = options.traceId ?? `trace-${this.createId()}`;
    if (this.pending.has(requestId)) {
      return Promise.reject(CoreRpcError.of(
        'conflict',
        'The request ID is already active.',
      ));
    }

    // PendingRpcRequest 自己拥有 Promise、timer 和 AbortSignal listener；
    // CoreRpcClient 只负责 requestId correlation 与底层消息收发。
    const pendingRpcRequest = new PendingRpcRequest(command.type, traceId);
    this.pending.set(requestId, pendingRpcRequest);
    pendingRpcRequest.start(
      options.timeoutMs ?? this.requestTimeoutMs,
      options.abortSignal,
      (reason) => this.cancel(requestId, reason),
    );

    try {
      port.postMessage({
        kind: 'request',
        protocolVersion: CORE_PROTOCOL_VERSION,
        requestId,
        traceId,
        command,
      });
    } catch {
      this.finishWithError(
        requestId,
        CoreRpcError.of('disconnected', 'Unable to send the Core request.'),
      );
    }

    return pendingRpcRequest.promise as Promise<CoreResultForCommand<T>>;
  }

  close(): void {
    this.disconnect('Core RPC client closed.');
  }

  private handleResponse(message: unknown): void {
    const parsed = parseCoreToMainMessage(message);
    if (!parsed.ok) {
      this.rejectInvalidMessage(message, `Invalid Core response: ${parsed.error}`);
      return;
    }

    if (parsed.value.kind === 'event-batch') {
      this.handleEventBatch(parsed.value);
      return;
    }

    const response = parsed.value;
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      return; // timeout/cancel 后到达的 late response 可以安全忽略。
    }

    // requestId、traceId、result type 都匹配才能完成 Promise；不匹配只拒绝
    // 该 request，不能把单条响应的数据问题升级为连接或进程故障。
    if (
      response.traceId !== pending.traceId ||
      (response.ok &&
        response.result.type !==
          CoreRpcClient.RESULT_TYPE_BY_COMMAND[pending.commandType])
    ) {
      const detail = 'Core response does not match its request.';
      this.reportProtocolIssue(detail);
      this.finishWithError(
        response.requestId,
        CoreRpcError.of('invalid-message', detail),
      );
      return;
    }

    this.pending.delete(response.requestId);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new CoreRpcError(response.error));
    }
  }

  /**
   * 处理一批捕获事件：回调订阅者并向 Core 发送 ack 以推进背压窗口。
   * 调用方：handleResponse 收到 event-batch 时。ack 发送失败不影响本地事件分发。
   */
  private handleEventBatch(batch: CoreEventBatch): void {
    try {
      this.captureEventListener?.(batch.events, batch.clientApps ?? []);
    } catch (error) {
      this.reportProtocolIssue(
        `Capture event consumer failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      this.tlsCompatibilityEventListener?.(
        batch.tlsCompatibilityEvents ?? [],
      );
    } catch (error) {
      this.reportProtocolIssue(
        `TLS compatibility event consumer failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      if (batch.breakpointsChanged) {
        this.breakpointsChangedListener?.();
      }
    } catch (error) {
      this.reportProtocolIssue(
        `Breakpoint change consumer failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      if (batch.captureImported) this.captureImportedListener?.();
    } catch (error) {
      this.reportProtocolIssue(
        `Capture import consumer failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      this.port?.postMessage({
        kind: 'event-ack',
        protocolVersion: CORE_PROTOCOL_VERSION,
        batchSequence: batch.batchSequence,
      });
    } catch {
      // ack 发送失败最终由 Core 端窗口停滞体现；不影响已分发的事件。
    }
  }

  private cancel(
    requestId: string,
    reason: 'caller' | 'timeout',
  ): void {
    if (!this.pending.has(requestId)) {
      return;
    }
    try {
      this.port?.postMessage({
        kind: 'cancel',
        protocolVersion: CORE_PROTOCOL_VERSION,
        requestId,
        reason,
      });
    } catch {
      // 无论通知 Core 是否成功，本地 Promise 都必须完成清理。
    }
    this.finishWithError(
      requestId,
      CoreRpcError.of(
        reason === 'timeout' ? 'timeout' : 'cancelled',
        reason === 'timeout'
          ? 'The Core request timed out.'
          : 'The Core request was cancelled.',
      ),
    );
  }

  private finishWithError(requestId: string, error: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }
    this.pending.delete(requestId);
    pending.reject(error);
  }

  /**
   * 隔离一条非法 Core 消息：event-batch 在可关联时 ack 后丢弃，response 只拒绝
   * 对应 request；两者都不关闭 MessagePort。
   */
  private rejectInvalidMessage(message: unknown, detail: string): void {
    this.reportProtocolIssue(detail);
    if (!CoreRpcClient.isRecord(message)) {
      return;
    }
    if (message.kind === 'response' && typeof message.requestId === 'string') {
      this.finishWithError(
        message.requestId,
        CoreRpcError.of('invalid-message', detail),
      );
      return;
    }
    if (
      message.kind === 'event-batch'
      && Number.isSafeInteger(message.batchSequence)
      && Number(message.batchSequence) >= 0
    ) {
      try {
        this.port?.postMessage({
          kind: 'event-ack',
          protocolVersion: CORE_PROTOCOL_VERSION,
          batchSequence: Number(message.batchSequence),
        });
      } catch {
        // 下一次真实 port close/send failure 由传输生命周期处理。
      }
    }
  }

  /** 报告单消息协议问题；不改变 CoreProcess 或 MessagePort 状态。 */
  private reportProtocolIssue(detail: string): void {
    this.protocolIssueListener?.(detail);
  }

  private disconnect(message: string): void {
    const port = this.port;
    this.port = null;
    this.removeMessageListener?.();
    this.removeMessageListener = null;
    this.removeCloseListener?.();
    this.removeCloseListener = null;
    try {
      port?.close();
    } catch {
      // 即使底层 close 失败，也必须拒绝所有 pending Promise。
    }

    for (const [requestId, pending] of this.pending) {
      this.pending.delete(requestId);
      pending.reject(CoreRpcError.of('disconnected', message));
    }
  }

  /** 将未知 structured-clone 数据收窄为可读取信封字段的对象。 */
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}