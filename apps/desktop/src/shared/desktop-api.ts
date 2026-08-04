import type {
  BreakpointEdit,
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
  CaptureHeaderRuleEffect,
  Collection,
  CollectionNode,
  ComposerTiming,
  ComposerTlsInfo,
  TlsCertificate,
  DiagnosticProcess,
  GrpcMessageSide,
  GrpcMessageSummary,
  HeaderOperation,
  KeyMatchMode,
  PendingBreakpoint,
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
  TransferJobSnapshot,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '@interceptor/core-protocol';

export { BODY_PREVIEW_MAX_BYTES } from '@interceptor/core-protocol';

export type {
  BreakpointEdit,
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
  CaptureHeaderRuleEffect,
  ComposerTiming,
  ComposerTlsInfo,
  TlsCertificate,
  DiagnosticProcess,
  GrpcMessageSide,
  GrpcMessageSummary,
  HeaderOperation,
  KeyMatchMode,
  PendingBreakpoint,
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
  TransferJobSnapshot,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
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
  process: DiagnosticProcess;
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

export interface DiagnosticsQueryRequest {
  cursor?: string;
  limit?: number;
  process?: DiagnosticProcess;
  level?: CoreDiagnosticRecord['level'];
  outcome?: NonNullable<CoreDiagnosticRecord['outcome']>;
  traceId?: string;
  command?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
}

export interface CoreDiagnosticPage extends CoreDiagnosticSnapshot {
  nextCursor?: string;
  hasMore: boolean;
}

/** 当前用户系统代理的公开状态；不暴露 helper 路径或原始 snapshot。 */
export interface SystemProxyStatus {
  supported: boolean;
  enabled: boolean;
  owned: boolean;
  ownershipLost: boolean;
  proxyServer: string | null;
  bypassList: string | null;
  pacUrl: string | null;
  autoDetect: boolean;
}

export interface SystemProxyRestoreResult {
  restored: boolean;
  reason?: 'not-owned' | 'externally-modified';
  status: SystemProxyStatus;
}

/** 诊断 JSONL 导出的可选筛选（按 level / outcome）。 */
export interface DiagnosticsExportFilter {
  process?: DiagnosticProcess;
  level?: 'debug' | 'info' | 'warn' | 'error';
  outcome?: 'success' | 'failed' | 'cancelled' | 'timed_out';
}

/** Renderer 仅可上报两类全局错误的短摘要，不提供通用日志入口。 */
export interface RendererDiagnosticReport {
  kind: 'uncaught-error' | 'unhandled-rejection';
  name: string;
  message: string;
}

export interface CaptureUsage {
  sessionCount: number;
  exchangeCount: number;
  bodyCount: number;
  databaseBytes: number;
  blobBytes: number;
  totalBytes: number;
}

/** 代理捕获运行态：监听地址、当前会话与已捕获 Exchange 计数。 */
export interface CaptureStatus {
  listening: boolean;
  /** 是否正在记录新流量；暂停（Stop recording）时为 false，但 listening 仍可为 true。 */
  recording: boolean;
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
    sessionId?: string;
    host?: string;
    method?: string;
    status?: number;
    mime?: string;
    process?: string;
    search?: string;
    protocol?: 'h1' | 'h2' | 'ws';
  };
}

/** 会话分页结果：Exchange 摘要行 + keyset 游标。 */
export interface SessionsPage {
  items: CaptureExchangeSummary[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface WebSocketFrameQuery {
  exchangeId: string;
  cursor?: string;
  limit: number;
  direction?: WebSocketFrameDirection;
}

export interface WebSocketFramePage {
  items: WebSocketFrameSummary[];
  nextCursor?: string;
  hasMore: boolean;
  breakpointsEnabled: boolean;
}

export interface GrpcMessageQuery {
  exchangeId: string;
  side: GrpcMessageSide;
  cursor?: string;
  limit: number;
}

export interface GrpcMessagePage {
  recognized: boolean;
  side: GrpcMessageSide;
  contentType?: string;
  encoding?: string;
  bodyHash?: string;
  bodySize: number;
  items: GrpcMessageSummary[];
  nextCursor?: string;
  hasMore: boolean;
  malformedOffset?: number;
}

/** 一段按需读取的正文字节及是否已到结尾。 */
export interface BodyChunk {
  offset: number;
  data: Uint8Array;
  end: boolean;
  /** 请求解码时的结果：ok/limited/skipped/failed；未请求解码时为 undefined。 */
  decodeStatus?: string;
}

/** Renderer 提交的单正文保存意图；目录与最终路径始终由 Main 选择。 */
export interface BodyExportRequest {
  bodyId: string;
  suggestedName: string;
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

/** 规则集替换结果：成功返回新 revision；失败带原因（conflict 表示他处已改需重载）。 */
export type RuleReplaceResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict' | 'invalid' | 'error'; message: string };

/** Composer 集合替换结果：语义与 RuleReplaceResult 一致。 */
export type CollectionReplaceResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict' | 'invalid' | 'error'; message: string };

/** Composer 手工请求：method/url/头/正文 + 协议偏好。 */
export interface ComposerRequest {
  method: string;
  url: string;
  headers: RuleHeaderPair[];
  body?: string;
  protocol: 'auto' | 'http/1.1' | 'h2';
  timeoutMs?: number;
}

/** Composer 响应 DTO：成功带状态/头/有界正文/时序/TLS；失败 ok=false + error。 */
export interface ComposerResponse {
  ok: boolean;
  error?: string;
  status: number;
  statusText: string;
  httpVersion: string;
  headers: RuleHeaderPair[];
  body: Uint8Array;
  totalBytes: number;
  durationMs: number;
  timing: ComposerTiming;
  tls: ComposerTlsInfo | null;
  remoteAddress: string | null;
}

/** 当前等待中的断点快照 + 全局 break-on-match 开关。 */
export interface BreakpointsSnapshot {
  breakpoints: PendingBreakpoint[];
  enabled: boolean;
}

/** TLS 探测结果 DTO：协议/套件/ALPN/授权/证书链；失败 ok=false + error。 */
export interface TlsProbe {
  ok: boolean;
  error?: string;
  protocol: string;
  cipher: string;
  alpn: string;
  authorized: boolean;
  authorizationError?: string;
  certificates: TlsCertificate[];
}

/** 单个本机应用的图标推送；icon 为 PNG data URL，不可读时为 null。 */
export interface ClientAppIcon {
  clientAppId: string;
  icon: string | null;
}

export type HarExportScope =
  | { kind: 'all' }
  | { kind: 'filter'; filter: SessionQueryRequest['filter'] }
  | { kind: 'selected'; exchangeIds: string[] };

/** Renderer 提交的 HAR 导出意图；文件路径由 Main 的系统对话框选择。 */
export interface HarExportRequest {
  scope: HarExportScope;
  redaction: {
    authorization: boolean;
    cookies: boolean;
    bodies: boolean;
  };
}

export const DESKTOP_UI_LANGUAGES = [
  'en',
  'zh-CN',
  'zh-TW',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'it',
  'pt-BR',
  'ru',
  'nl',
  'pl',
  'tr',
  'uk',
] as const;

export type DesktopUiLanguage = (typeof DESKTOP_UI_LANGUAGES)[number];

export const DESKTOP_IPC_CHANNELS = {
  coreEcho: 'core:echo',
  appQuit: 'app:quit',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  coreGetProcessStatus: 'core:get-process-status',
  coreGetTrace: 'core:get-trace',
  coreGetDiagnostics: 'core:get-diagnostics',
  coreQueryDiagnostics: 'core:query-diagnostics',
  rendererDiagnosticReport: 'diagnostics:renderer-report',
  coreProcessStatus: 'core:process-status',
  systemProxyGetStatus: 'system-proxy:get-status',
  systemProxyEnable: 'system-proxy:enable',
  systemProxyRestore: 'system-proxy:restore',
  systemProxyRepair: 'system-proxy:repair',
  updateGetStatus: 'update:get-status',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateOpenDownloaded: 'update:open-downloaded',
  updateStatus: 'update:status',
  captureGetUsage: 'capture:get-usage',
  captureClear: 'capture:clear',
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureGetStatus: 'capture:get-status',
  captureEvents: 'capture:events',
  sessionsQuery: 'sessions:query',
  sessionsDetail: 'sessions:detail',
  websocketFrames: 'websocket:frames',
  websocketBreakpointConfigure: 'websocket:breakpoint-configure',
  grpcMessages: 'grpc:messages',
  bodyReadRange: 'body:read-range',
  bodyExportStart: 'body:export-start',
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
  rulesReplace: 'rules:replace',
  rulesHits: 'rules:hits',
  collectionGet: 'collection:get',
  collectionReplace: 'collection:replace',
  composerSend: 'composer:send',
  breakpointList: 'breakpoint:list',
  breakpointResolve: 'breakpoint:resolve',
  breakpointConfigure: 'breakpoint:configure',
  tlsProbe: 'tls:probe',
  clientAppIcons: 'client-app:icons',
  harExportStart: 'har:export-start',
  harImportStart: 'har:import-start',
  archiveExportStart: 'archive:export-start',
  archiveImportStart: 'archive:import-start',
  diagnosticsExportStart: 'diagnostics:export-start',
  transferJobGet: 'transfer:job-get',
  transferJobCancel: 'transfer:job-cancel',
} as const;

export interface InterceptorDesktopApi {
  echoCore(value: string): Promise<CoreEchoResult>;
  closeApplication(): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<boolean>;
  getCoreProcessStatus(): Promise<CoreProcessStatus>;
  getCoreTrace(traceId: string): Promise<CoreDiagnosticTrace>;
  getRecentDiagnostics(limit?: number): Promise<CoreDiagnosticSnapshot>;
  queryDiagnostics(request: DiagnosticsQueryRequest): Promise<CoreDiagnosticPage>;
  reportRendererDiagnostic(report: RendererDiagnosticReport): Promise<void>;
  getSystemProxyStatus(): Promise<SystemProxyStatus>;
  enableSystemProxy(): Promise<SystemProxyStatus>;
  restoreSystemProxy(): Promise<SystemProxyRestoreResult>;
  repairSystemProxy(): Promise<SystemProxyRestoreResult>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  openDownloadedUpdate(): Promise<void>;
  onUpdateStatusChange(listener: (status: UpdateStatus) => void): () => void;
  onCoreProcessStatusChange(
    listener: (status: CoreProcessStatus) => void,
  ): () => void;
  getCaptureUsage(): Promise<CaptureUsage>;
  clearCapture(): Promise<CaptureUsage>;
  startCapture(port?: number): Promise<CaptureStatus>;
  stopCapture(): Promise<CaptureStatus>;
  getCaptureStatus(): Promise<CaptureStatus>;
  querySessions(request: SessionQueryRequest): Promise<SessionsPage>;
  getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null>;
  queryWebSocketFrames(request: WebSocketFrameQuery): Promise<WebSocketFramePage>;
  setWebSocketBreakpointsEnabled(enabled: boolean): Promise<boolean>;
  queryGrpcMessages(request: GrpcMessageQuery): Promise<GrpcMessagePage>;
  readBody(
    bodyId: string,
    offset: number,
    length: number,
    options?: { decode?: boolean; encoding?: string },
  ): Promise<BodyChunk>;
  startBodyExport(
    request: BodyExportRequest,
    title: string,
  ): Promise<TransferJobSnapshot | null>;
  onCaptureEvents(
    listener: (events: CaptureExchangeEvent[]) => void,
  ): () => void;
  /**
   * 订阅本机应用图标推送。Main 在捕获事件里发现新应用后主动取图标并下发，
   * 因此 Renderer 从不主动索取；图标按应用去重，不随每条 Exchange 重复传输。
   */
  onClientAppIcons(listener: (icons: ClientAppIcon[]) => void): () => void;
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
  replaceRules(
    expectedRevision: number,
    rules: RuleDefinition[],
  ): Promise<RuleReplaceResult>;
  getRuleHits(): Promise<RuleHitCount[]>;
  getCollection(): Promise<Collection>;
  replaceCollection(
    expectedRevision: number,
    nodes: CollectionNode[],
  ): Promise<CollectionReplaceResult>;
  sendComposerRequest(request: ComposerRequest): Promise<ComposerResponse>;
  listBreakpoints(): Promise<BreakpointsSnapshot>;
  resolveBreakpoint(
    breakpointId: string,
    action: 'continue' | 'drop',
    edit?: BreakpointEdit,
  ): Promise<{ state: string }>;
  setBreakpointsEnabled(enabled: boolean): Promise<boolean>;
  probeTls(host: string, port: number): Promise<TlsProbe>;
  startHarExport(
    request: HarExportRequest,
    title: string,
  ): Promise<TransferJobSnapshot | null>;
  startHarImport(title: string): Promise<TransferJobSnapshot | null>;
  startArchiveExport(title: string): Promise<TransferJobSnapshot | null>;
  startArchiveImport(title: string): Promise<TransferJobSnapshot | null>;
  startDiagnosticsExport(
    filter: DiagnosticsExportFilter,
    title: string,
  ): Promise<TransferJobSnapshot | null>;
  getTransferJob(jobId: string): Promise<TransferJobSnapshot | null>;
  cancelTransferJob(jobId: string): Promise<TransferJobSnapshot | null>;
}

export type UpdateState =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'failed';

/** Public update state; release notes are bounded plain text, never rendered as HTML. */
export interface UpdateStatus {
  supported: boolean;
  state: UpdateState;
  currentVersion: string;
  latestVersion: string | null;
  progress: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  releaseNotes: string | null;
  message: string | null;
  lastCheckedAt: string | null;
}