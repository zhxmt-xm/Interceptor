import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
} from '@interceptor/core-protocol';

export type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
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
}

/** 面向 Renderer 的 Root CA 状态；只含公开元数据，绝不含私钥。 */
export interface CertificateInfo {
  /** CA 是否已生成。 */
  present: boolean;
  /** CA 是否已在当前用户信任库（信任后才启用 MITM）。 */
  trusted: boolean;
  /** 当前平台是否支持信任库安装（Windows/macOS）。 */
  supported: boolean;
  fingerprint: string | null;
  subject: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export const DESKTOP_IPC_CHANNELS = {
  coreEcho: 'core:echo',
  coreGetProcessStatus: 'core:get-process-status',
  coreGetTrace: 'core:get-trace',
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
  httpsGetInsecureHosts: 'https:get-insecure-hosts',
  httpsSetInsecureHosts: 'https:set-insecure-hosts',
} as const;

export interface InterceptorDesktopApi {
  echoCore(value: string): Promise<CoreEchoResult>;
  getCoreProcessStatus(): Promise<CoreProcessStatus>;
  getCoreTrace(traceId: string): Promise<CoreDiagnosticTrace>;
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
  readBody(bodyId: string, offset: number, length: number): Promise<BodyChunk>;
  onCaptureEvents(
    listener: (events: CaptureExchangeEvent[]) => void,
  ): () => void;
  getCertificateStatus(): Promise<CertificateInfo>;
  generateCertificate(): Promise<CertificateInfo>;
  installCertificate(): Promise<CertificateInfo>;
  uninstallCertificate(): Promise<CertificateInfo>;
  getInsecureHosts(): Promise<string[]>;
  setInsecureHosts(hosts: string[]): Promise<string[]>;
}