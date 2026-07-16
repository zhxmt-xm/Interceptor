import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
  HeaderOperation,
  KeyMatchMode,
  ProtocolDiagnostic,
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleHeaderPair,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RulePhase,
  RuleSet,
  StringMatchMode,
} from '@interceptor/core-protocol';

export type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
  HeaderOperation,
  KeyMatchMode,
  ProtocolDiagnostic,
  RuleAction,
  RuleActionType,
  RuleDefinition,
  RuleHeaderPair,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RulePhase,
  RuleSet,
  StringMatchMode,
};

export type CoreProcessState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unresponsive'
  | 'restarting'
  | 'stopping';
export interface CoreProcessStatus {
  state: CoreProcessState;
  pid: number | null;
  restartCount: number;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string;
  detail: string | null;
}

export interface CoreEchoResult {
  value: string;
  handledAt: string;
  traceId: string;
}

export interface CoreDiagnosticRecord {
  timestamp: string;
  sequence: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  traceId?: string;
  requestId?: string;
  command?: string;
  phase: string;
  action?: string;
  durationMs?: number;
  outcome?: 'success' | 'failed' | 'cancelled' | 'timed_out';
  errorCode?: string;
}

export interface CoreDiagnosticTrace {
  traceId: string;
  records: CoreDiagnosticRecord[];
  droppedCount: number;
}

/** 最近诊断记录快照：不限 traceId 的最新 N 条 + 累计丢弃数。 */
export interface CoreDiagnosticSnapshot {
  records: CoreDiagnosticRecord[];
  droppedCount: number;
}

export interface StorageUsage {
  sessionCount: number;
  exchangeCount: number;
  bodyCount: number;
  databaseBytes: number;
  blobBytes: number;
  totalBytes: number;
  quotaBytes: number;
}

/** 代理捕获运行态：监听地址、当前会话与已捕获 Exchange 计数。 */
export interface CaptureStatus {
  listening: boolean;
  host: string | null;
  port: number | null;
  sessionId: string | null;
  capturedExchanges: number;
}

/** Renderer 侧会话分页查询请求；与 Core sessions.query 载荷保持同构。 */
export interface SessionQueryRequest {
  cursor?: string;
  limit: number;
  sort: 'started_desc' | 'started_asc';
  filter: {
    host?: string;
    method?: string;
    status?: number;
    mime?: string;
    process?: string;
    search?: string;
  };
}

/** 会话分页结果：Exchange 摘要行 + keyset 游标。 */
export interface SessionsPage {
  items: CaptureExchangeSummary[];
  nextCursor?: string;
  hasMore: boolean;
}

/** 一段按需读取的正文字节及是否已到结尾。 */
export interface BodyChunk {
  offset: number;
  data: Uint8Array;
  end: boolean;
  /** 请求解码时的结果：ok/skipped/failed；未请求解码时为 undefined。 */
  decodeStatus?: string;
}

/** 面向 Renderer 的 Root CA 状态；只含公开元数据，绝不含私钥。 */
export interface CertificateInfo {  /** CA 是否已生成。 */
  present: boolean;
  /** CA 是否已在当前用户信任库（信任后才启用 MITM）。 */
  trusted: boolean;
  /** 当前平台是否支持信任库安装（Windows/macOS）。 */
  supported: boolean;  /** HTTPS 解密(MITM)开关；与 trusted 解耦，仅当 trusted && mitmEnabled 才实际解密。 */
  mitmEnabled: boolean;  fingerprint: string | null;
  subject: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  /** Root CA 证书 PEM 文件路径；未生成时为 null。仅公开证书路径，不含私钥。 */
  path: string | null;
}

/** 规则集语义校验结果：整体是否有效 + 逐项诊断（重复 id、regex 可编译、路径穿越等）。 */
export interface RuleValidation {
  valid: boolean;
  diagnostics: ProtocolDiagnostic[];
}

/** 规则集替换结果：成功返回新 revision；失败带原因（conflict 表示他处已改需重载）。 */
export type RuleReplaceResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict' | 'invalid' | 'error'; message: string };

export const DESKTOP_IPC_CHANNELS = {
  coreEcho: 'core:echo',
  coreGetProcessStatus: 'core:get-process-status',
  coreGetTrace: 'core:get-trace',
  coreGetDiagnostics: 'core:get-diagnostics',
  coreProcessStatus: 'core:process-status',
  storageGetStatus: 'storage:get-status',
  storageClear: 'storage:clear',
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureGetStatus: 'capture:get-status',
  captureEvents: 'capture:events',
  sessionsQuery: 'sessions:query',
  sessionsDetail: 'sessions:detail',
  bodyReadRange: 'body:read-range',
  caStatus: 'ca:status',
  caGenerate: 'ca:generate',
  caInstall: 'ca:install',
  caUninstall: 'ca:uninstall',
  caDelete: 'ca:delete',
  caReveal: 'ca:reveal',
  caView: 'ca:view',
  caOpenManager: 'ca:open-manager',
  httpsGetInsecureHosts: 'https:get-insecure-hosts',
  httpsSetInsecureHosts: 'https:set-insecure-hosts',
  httpsSetDecryption: 'https:set-decryption',
  rulesGet: 'rules:get',
  rulesValidate: 'rules:validate',
  rulesReplace: 'rules:replace',
  rulesHits: 'rules:hits',
} as const;

export interface InterceptorDesktopApi {
  echoCore(value: string): Promise<CoreEchoResult>;
  getCoreProcessStatus(): Promise<CoreProcessStatus>;
  getCoreTrace(traceId: string): Promise<CoreDiagnosticTrace>;
  getRecentDiagnostics(limit?: number): Promise<CoreDiagnosticSnapshot>;
  onCoreProcessStatusChange(
    listener: (status: CoreProcessStatus) => void,
  ): () => void;
  getStorageStatus(): Promise<StorageUsage>;
  clearStorage(): Promise<StorageUsage>;
  startCapture(port?: number): Promise<CaptureStatus>;
  stopCapture(): Promise<CaptureStatus>;
  getCaptureStatus(): Promise<CaptureStatus>;
  querySessions(request: SessionQueryRequest): Promise<SessionsPage>;
  getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null>;
  readBody(
    bodyId: string,
    offset: number,
    length: number,
    options?: { decode?: boolean; encoding?: string },
  ): Promise<BodyChunk>;
  onCaptureEvents(
    listener: (events: CaptureExchangeEvent[]) => void,
  ): () => void;
  getCertificateStatus(): Promise<CertificateInfo>;
  generateCertificate(): Promise<CertificateInfo>;
  installCertificate(): Promise<CertificateInfo>;
  uninstallCertificate(): Promise<CertificateInfo>;
  deleteCertificate(): Promise<CertificateInfo>;
  revealCertificate(): Promise<void>;
  viewCertificate(): Promise<void>;
  openCertificateManager(): Promise<void>;
  getInsecureHosts(): Promise<string[]>;
  setInsecureHosts(hosts: string[]): Promise<string[]>;
  setHttpsDecryption(enabled: boolean): Promise<CertificateInfo>;
  getRules(): Promise<RuleSet>;
  validateRules(rules: RuleDefinition[]): Promise<RuleValidation>;
  replaceRules(
    expectedRevision: number,
    rules: RuleDefinition[],
  ): Promise<RuleReplaceResult>;
  getRuleHits(): Promise<RuleHitCount[]>;
}