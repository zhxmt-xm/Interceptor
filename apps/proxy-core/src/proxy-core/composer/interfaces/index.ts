export interface ComposerHeaderPair {
  /** Header 原始名称。 */
  readonly name: string;
  /** Header 原始值。 */
  readonly value: string;
}

export interface ComposerRequestInput {
  /** HTTP 请求方法。 */
  readonly method: string;
  /** 完整 http/https URL。 */
  readonly url: string;
  /** 保序请求 header。 */
  readonly headers: readonly ComposerHeaderPair[];
  /** 可选 UTF-8 请求正文。 */
  readonly body?: string;
  /** 传输协议偏好。 */
  readonly protocol: 'auto' | 'http/1.1' | 'h2';
  /** 可选请求超时毫秒数。 */
  readonly timeoutMs?: number;
}

export interface ComposerTiming {
  /** DNS 解析耗时。 */
  readonly dnsMs: number;
  /** TCP 建连耗时。 */
  readonly tcpMs: number;
  /** TLS 握手耗时；明文请求为 0。 */
  readonly tlsMs: number;
  /** 请求头与正文写出耗时。 */
  readonly requestMs: number;
  /** 等待首个响应字节的耗时。 */
  readonly waitingMs: number;
  /** 响应正文下载耗时。 */
  readonly downloadMs: number;
  /** 从发起到结束的总耗时。 */
  readonly totalMs: number;
}

export interface ComposerTlsInfo {
  /** TLS 协议版本。 */
  readonly protocol: string;
  /** 协商加密套件。 */
  readonly cipher: string;
  /** 协商 ALPN。 */
  readonly alpn: string;
  /** 对端证书主体。 */
  readonly subject: string;
  /** 对端证书签发者。 */
  readonly issuer: string;
  /** 证书有效期起点。 */
  readonly validFrom: string;
  /** 证书有效期终点。 */
  readonly validTo: string;
}

export interface ComposerResponseOutput {
  /** 请求是否成功得到响应。 */
  readonly ok: boolean;
  /** 失败时的可展示错误。 */
  readonly error?: string;
  /** HTTP 响应状态码。 */
  readonly status: number;
  /** HTTP 响应状态文本。 */
  readonly statusText: string;
  /** 实际 HTTP 协议版本。 */
  readonly httpVersion: string;
  /** 保序响应 header。 */
  readonly headers: ComposerHeaderPair[];
  /** 完整响应正文。 */
  readonly body: Uint8Array;
  /** 完整响应总字节数。 */
  readonly totalBytes: number;
  /** 完整请求耗时毫秒数。 */
  readonly durationMs: number;
  /** 分阶段耗时；未发生的阶段为 0。 */
  readonly timing: ComposerTiming;
  /** HTTPS 请求的 TLS 摘要。 */
  readonly tls: ComposerTlsInfo | null;
  /** 对端网络地址。 */
  readonly remoteAddress: string | null;
}