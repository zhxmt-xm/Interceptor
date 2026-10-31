import type { CaptureReplayOutcome } from '@interceptor/core-protocol';

import type { CaptureService } from '../capture/entry';
import type { CoreDiagnostics } from '../core-diagnostics';
import type { ProxyService } from '../proxy/entry';
import { ProxyClient } from './internal/proxy-client';
import type { ReplayRequest } from './interfaces';
import * as ReplayUtils from './utils';

/**
 * 把一条已录制的 HTTP 请求经本地代理原样重发。
 *
 * 本服务只负责读取原始请求与发送；新 Capture 行由 Mockttp 正常管线创建，
 * 这里不写存储、不造 summary、不碰事件队列。
 */
export class ReplayService {
  /** 发送客户端；无状态，可跨命令复用。 */
  private readonly proxyClient: ProxyClient;

  /** 依赖 Capture 读取原始请求，依赖 Proxy 取监听端口与按 host 的解密状态。 */
  constructor(
    private readonly captureService: CaptureService,
    private readonly proxyService: ProxyService,
    private readonly diagnostics?: CoreDiagnostics,
  ) {
    this.proxyClient = new ProxyClient();
  }

  /** 执行一次重放；前置检查失败只返回 reason，不发送请求。 */
  async replay(
    exchangeId: string,
    abortSignal: AbortSignal,
  ): Promise<CaptureReplayOutcome> {
    const detail = await this.captureService.getExchangeDetail(exchangeId);
    if (detail === null) {
      return { ok: false, reason: 'not-found' };
    }
    const protocol = ReplayUtils.replayProtocolOf(detail.summary.protocol);
    if (protocol === null || ReplayUtils.isGrpcRequest(detail.requestMime)) {
      return { ok: false, reason: 'unsupported-exchange' };
    }
    const proxyStatus = this.proxyService.status();
    if (!proxyStatus.listening || proxyStatus.port === null) {
      return { ok: false, reason: 'proxy-not-listening' };
    }
    const host = detail.summary.host;
    if (
      detail.summary.secure
      && (host === undefined || !this.proxyService.interceptsHost(host))
    ) {
      return { ok: false, reason: 'https-not-decrypted' };
    }
    const snapshot = await this.captureService.getExchangeBodySnapshot(
      exchangeId,
      'request',
    );
    if (!snapshot.complete) {
      return { ok: false, reason: 'request-body-unavailable' };
    }
    const bodyRef = ReplayUtils.originalBodyRef(detail);
    if (bodyRef?.truncated === true) {
      return { ok: false, reason: 'request-body-truncated' };
    }
    const body = bodyRef?.bodyHash === undefined
      ? null
      : { hash: bodyRef.bodyHash, size: bodyRef.encodedSize };
    if (body === null && ReplayUtils.requestHadBody(detail)) {
      return { ok: false, reason: 'request-body-unavailable' };
    }
    const request: ReplayRequest = {
      method: detail.summary.method,
      url: detail.url,
      protocol,
      headers: ReplayUtils.originalRequestHeaders(detail.requestHeaders),
      body,
    };
    try {
      await this.proxyClient.send({
        port: proxyStatus.port,
        request,
        abortSignal,
        openBody: body === null
          ? null
          : () => this.captureService.openBlobStream(body.hash),
        onAsyncFailure: (error) => this.diagnostics?.warn('replay.failed', {
          outcome: 'failed',
          errorCode: error.message,
        }),
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: 'send-failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
