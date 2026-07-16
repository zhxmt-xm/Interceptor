export interface ConnectionCertificate {
  /** 证书主体摘要。 */
  readonly subject: string;
  /** 证书签发者摘要。 */
  readonly issuer: string;
  /** 证书有效期起点。 */
  readonly validFrom: string;
  /** 证书有效期终点。 */
  readonly validTo: string;
  /** 证书序列号。 */
  readonly serialNumber: string;
  /** SHA-256 证书指纹。 */
  readonly fingerprint256: string;
}

export interface ConnectionProbeResult {
  /** TLS 握手是否成功。 */
  readonly ok: boolean;
  /** 失败时的可展示错误。 */
  readonly error?: string;
  /** 协商 TLS 协议版本。 */
  readonly protocol: string;
  /** 协商加密套件。 */
  readonly cipher: string;
  /** 协商 ALPN。 */
  readonly alpn: string;
  /** Node 是否验证证书链。 */
  readonly authorized: boolean;
  /** 证书链验证失败原因。 */
  readonly authorizationError?: string;
  /** 从叶子到根收集的有限证书链。 */
  readonly certificates: ConnectionCertificate[];
}