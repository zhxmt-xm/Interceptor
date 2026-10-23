import type {
  BreakpointEdit,
  BreakpointQueueKey,
  CaptureBodyRef,
  CaptureBodyRuleEffect,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
  CaptureHeaderRuleEffect,
  Collection,
  CollectionNode,
  ComposerTiming,
  ComposerTlsInfo,
  CoreProcessState,
  TlsCertificate,
  TlsCompatibilityEvent,
  DiagnosticProcess,
  GrpcMessageSide,
  GrpcMessageSummary,
  GrpcReadRangeCommand,
  HeaderOperation,
  KeyMatchMode,
  PendingBreakpoint,
  RuleAction,
  RuleActionType,
  RuleBreakpointAction,
  RuleDefinition,
  RuleFolder,
  RuleHeaderPair,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RuleNode,
  RulePhase,
  RuleSet,
  StringMatchMode,
  TlsPassthroughSettings,
  TransferJobSnapshot,
  WebSocketBreakpointDirection,
  WebSocketBreakpointFrame,
  WebSocketBreakpointSettings,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
  UpstreamProxySettings,
} from '@interceptor/core-protocol';
import type {
  AppContainerAccessSnapshot,
  CertificateInfo,
  ClientAppIcon,
  SystemProxyStatus,
  SystemProxyRestoreResult,
  UpstreamSettingsSnapshot,
} from '@interceptor/platform-capabilities';

export type { CoreProcessState, UpstreamProxySettings, UpstreamProxyProtocol } from '@interceptor/core-protocol';
export type {
  AppContainerAccessInfo,
  AppContainerAccessSnapshot,
  CertificateInfo,
  ClientAppIcon,
  SystemProxyStatus,
  SystemProxyRestoreResult,
  UpstreamSettingsSnapshot,
  UpstreamRoute,
} from '@interceptor/platform-capabilities';

import type {
  AgentModelSummary,
  AgentModelsSnapshot,
  AgentProviderDraft,
  AgentProviderVerification,
  AgentRuntimeEvent,
  AgentSessionSnapshot,
  AgentSessionsSnapshot,
  AgentTranscriptItem,
  AgentTurnSnapshot,
  AgentToolCallTranscriptItem,
  AgentToolResultTranscriptItem,
} from '@interceptor/agent-runtime';
import type { InterceptorToolSettingsGroup, MainToolResultPayloads } from '@interceptor/tools';
import type {
  McpApprovalRequest as McpServerApprovalRequest,
  McpToolExecutionMode,
} from '@interceptor/mcp-server';
import type { DesktopUiTheme, ExportPrivacyDefaults, UiPreferenceAppliedChange, UiPreferenceChange, UiPreferenceResponse } from './ui-preferences';

export {
  BODY_PREVIEW_MAX_BYTES,
  FORMAT_AUTO_MAX_BYTES,
  FORMAT_MAX_BYTES,
  IMAGE_PREVIEW_MAX_BYTES,
} from '@interceptor/core-protocol';

export type {
  AgentModelSummary,
  AgentModelsSnapshot,
  AgentProviderDraft,
  AgentProviderVerification,
  AgentRuntimeEvent,
  AgentSessionSnapshot,
  AgentSessionsSnapshot,
  AgentTranscriptItem,
  AgentToolCallTranscriptItem,
  AgentToolResultTranscriptItem,
  AgentTurnSnapshot,
  InterceptorToolSettingsGroup,
  BreakpointEdit,
  BreakpointQueueKey,
  CaptureBodyRef,
  CaptureBodyRuleEffect,
  CaptureExchangeDetail,
  CaptureExchangeEvent,
  CaptureExchangeSummary,
  CaptureHeader,
  CaptureHeaderRuleEffect,
  ComposerTiming,
  ComposerTlsInfo,
  TlsCertificate,
  TlsCompatibilityEvent,
  DiagnosticProcess,
  GrpcMessageSide,
  GrpcMessageSummary,
  HeaderOperation,
  KeyMatchMode,
  PendingBreakpoint,
  RuleAction,
  RuleActionType,
  RuleBreakpointAction,
  RuleDefinition,
  RuleFolder,
  RuleHeaderPair,
  RuleHitCount,
  RuleMatcher,
  RuleMatcherType,
  RuleNode,
  RulePhase,
  RuleSet,
  StringMatchMode,
  TlsPassthroughSettings,
  TransferJobSnapshot,
  WebSocketBreakpointDirection,
  WebSocketBreakpointFrame,
  WebSocketBreakpointSettings,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
};

/** Main-owned global Agent/MCP Tool exposure settings. */
export interface ToolCapabilitySettingsSnapshot {
  readonly groups: readonly InterceptorToolSettingsGroup[];
  readonly agentDisabledToolNames: readonly string[];
  readonly mcpDisabledToolNames: readonly string[];
}

/** Renderer-safe MCP Client state; credentials never cross Preload. */
export interface McpDesktopClientSummary {
  readonly clientId: string;
  readonly label: string;
  readonly executionMode: McpToolExecutionMode;
}

/** Renderer-safe Desktop MCP listener state. */
export interface McpDesktopStatus {
  readonly state: 'disabled' | 'running' | 'endpoint-conflict';
  readonly endpoint: string | null;
  readonly detail: string | null;
  readonly clients: readonly McpDesktopClientSummary[];
}

/** App-level change Tool approval request; contains no credential. */
export type McpApprovalRequest = McpServerApprovalRequest;

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

/** One committed full Capture cleanup and its old-event rejection boundary. */
export interface CaptureReset {
  clearedBefore: number;
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
  /** 当前连接的 WebSocket 断点配置；null 表示未启用。 */
  breakpoint: WebSocketBreakpointSettings | null;
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
  bodyAvailable: boolean;
  bodyComplete: boolean;
  items: GrpcMessageSummary[];
  nextCursor?: string;
  hasMore: boolean;
  malformedOffset?: number;
}

export type GrpcBodyReadRequest = GrpcReadRangeCommand['payload'];

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

/** 规则集替换结果：成功返回新 revision；失败带原因（conflict 表示他处已改需重载）。 */
export type RuleReplaceResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict' | 'invalid' | 'error'; message: string };

/** One externally committed Rule tree revision. */
export interface RulesChanged {
  revision: number;
}

export interface CollectionChanged {
  revision: number;
}

export type RulesImportOutcome = MainToolResultPayloads['rules.import'];

export type RulesImportResponse =
  | { status: 'completed'; result: RulesImportOutcome }
  | { status: 'failed' };

export type CollectionImportResponse =
  | { status: 'completed'; result: MainToolResultPayloads['composer.collection.import'] }
  | { status: 'failed' };

/** Composer 集合替换结果：语义与 RuleReplaceResult 一致。 */
export type CollectionReplaceResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict' | 'invalid' | 'error'; message: string };

/**
 * 导入文件读取结果：Main 只做 IO，解析与校验归拥有该领域的 Renderer feature。
 *
 * 失败是文件级的（读不到、超出大小上限、不是合法文本），此时一个节点都定位不到，
 * 因此只带原因不带内容。
 */
export type ImportFileResult =
  | { ok: true; fileName: string; content: string }
  | { ok: false; reason: 'not-json' | 'too-large' | 'unreadable' };

/** TLS passthrough replacement returns Core-normalized patterns on success. */
export type TlsPassthroughReplaceResult =
  | { ok: true; settings: TlsPassthroughSettings }
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

/**
 * 用户选来替换正文的文件。
 *
 * 路径交给 Renderer 只是为了放行时回传给 Core（同 Map Local），Renderer 自己不读写文件。
 * preview只承载有界只读字节，不是编辑值；放行仍使用完整文件路径。
 */
export interface BreakpointBodyFile {
  path: string;
  name: string;
  size: number;
  mediaType: string;
  preview?: { bytes: Uint8Array; truncated: boolean };
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

export type ApplicationStartupStage = 'platform' | 'certificate' | 'ready';

export type AndroidDeviceState = 'ready' | 'unauthorized' | 'offline';

export type AndroidApplicationState =
  | 'unavailable'
  | 'missing'
  | 'current'
  | 'update-available'
  | 'reinstall-required'
  | 'newer-installed'
  | 'signature-mismatch';

export interface AndroidApplicationInfo {
  readonly state: AndroidApplicationState;
  readonly bundledVersion: string | null;
  readonly installedVersion: string | null;
  readonly detail: string | null;
}

export interface AndroidDeviceInfo {
  readonly serial: string;
  readonly state: AndroidDeviceState;
  readonly model: string | null;
  readonly application: AndroidApplicationInfo;
}

export interface AndroidDesktopStatus {
  readonly devices: AndroidDeviceInfo[];
  readonly computerFingerprint: string;
  readonly connectedSerial: string | null;
  readonly deviceFingerprint: string | null;
  readonly ingressListening: boolean;
  readonly phoneConnected: boolean;
}

export type PlatformOperation = import('@interceptor/tools').PlatformOperation;

export interface PlatformOperationConflict {
  readonly operation: PlatformOperation;
}

export const DESKTOP_IPC_CHANNELS = {
  startupGetStage: 'startup:get-stage',
  startupStageChanged: 'startup:stage-changed',
  platformOperationConflict: 'platform:operation-conflict',
  uiLanguageSet: 'settings:language:set',
  uiThemeSet: 'settings:theme:set',
  exportPrivacyDefaultsSet: 'settings:export-privacy-defaults:set',
  uiPreferenceChangeRequested: 'settings:preference:requested',
  uiPreferenceChangeClaim: 'settings:preference:claim',
  uiPreferenceChangeComplete: 'settings:preference:complete',
  uiPreferenceChanged: 'settings:preference:changed',
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
  systemProxyStatus: 'system-proxy:status-changed',
  upstreamGetSettings: 'upstream:get-settings',
  upstreamApplySettings: 'upstream:apply-settings',
  upstreamSettingsChanged: 'upstream:settings-changed',
  appContainerList: 'app-container:list',
  appContainerSetExemption: 'app-container:set-exemption',
  appContainerEnableAll: 'app-container:enable-all',
  appContainerDisableAll: 'app-container:disable-all',
  appContainersChanged: 'app-container:changed',
  agentModelsGet: 'agent-models:get',
  agentProviderTest: 'agent-provider:test',
  agentProviderSaveVerified: 'agent-provider:save-verified',
  agentProviderRemove: 'agent-provider:remove',
  agentModelSetDefault: 'agent-model:set-default',
  toolCapabilitySettingsGet: 'tool-capabilities:get',
  agentToolDisable: 'tool-capabilities:agent-disable',
  agentToolEnable: 'tool-capabilities:agent-enable',
  mcpToolDisable: 'tool-capabilities:mcp-disable',
  mcpToolEnable: 'tool-capabilities:mcp-enable',
  mcpStatusGet: 'mcp:status-get',
  mcpServerEnable: 'mcp:server-enable',
  mcpServerDisable: 'mcp:server-disable',
  mcpEndpointChange: 'mcp:endpoint-change',
  mcpClientCreate: 'mcp:client-create',
  mcpClientCredentialRegenerate: 'mcp:client-credential-regenerate',
  mcpClientRevoke: 'mcp:client-revoke',
  mcpClientRequireApproval: 'mcp:client-require-approval',
  mcpClientAutomaticallyExecuteTools: 'mcp:client-automatically-execute-tools',
  mcpClientConfigurationCopy: 'mcp:client-configuration-copy',
  mcpToolCallAllow: 'mcp:tool-call-allow',
  mcpToolCallDeny: 'mcp:tool-call-deny',
  mcpStatus: 'mcp:status-changed',
  mcpApprovalRequest: 'mcp:approval-request',
  mcpApprovalSettled: 'mcp:approval-settled',
  agentSessionsList: 'agent-sessions:list',
  agentSessionCreate: 'agent-session:create',
  agentSessionSelect: 'agent-session:select',
  agentSessionGet: 'agent-session:get',
  agentSessionRename: 'agent-session:rename',
  agentSessionDelete: 'agent-session:delete',
  agentSessionSetModel: 'agent-session:set-model',
  agentSessionRequireToolApproval: 'agent-session:require-tool-approval',
  agentSessionAutomaticallyExecuteTools: 'agent-session:automatically-execute-tools',
  agentMessageSend: 'agent-message:send',
  agentTurnCancel: 'agent-turn:cancel',
  agentTurnRetry: 'agent-turn:retry',
  agentToolCallAllow: 'agent-tool-call:allow',
  agentToolCallDeny: 'agent-tool-call:deny',
  agentSessionEvent: 'agent-session:event',
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
  captureStatus: 'capture:status-changed',
  captureReset: 'capture:reset',
  captureImported: 'capture:imported',
  captureEvents: 'capture:events',
  androidGetStatus: 'android:get-status',
  androidInstallApplication: 'android:install-application',
  androidConnect: 'android:connect',
  androidDisconnect: 'android:disconnect',
  androidOpenApplication: 'android:open-application',
  androidStatus: 'android:status-changed',
  sessionsQuery: 'sessions:query',
  sessionsDetail: 'sessions:detail',
  websocketFrames: 'websocket:frames',
  websocketBreakpointEnable: 'websocket:breakpoint-enable',
  websocketBreakpointDisable: 'websocket:breakpoint-disable',
  grpcMessages: 'grpc:messages',
  grpcReadRange: 'grpc:read-range',
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
  tlsPassthroughGet: 'tls-passthrough:get',
  tlsPassthroughReplace: 'tls-passthrough:replace',
  tlsCompatibility: 'tls:compatibility',
  tlsSettingsChanged: 'tls:settings-changed',
  rulesGet: 'rules:get',
  rulesReplace: 'rules:replace',
  rulesHits: 'rules:hits',
  rulesChanged: 'rules:changed',
  rulesImport: 'rules:import',
  rulesImportRequested: 'rules:import-requested',
  rulesImportCanceled: 'rules:import-canceled',
  rulesImportCompleted: 'rules:import-completed',
  collectionGet: 'collection:get',
  collectionReplace: 'collection:replace',
  collectionChanged: 'collection:changed',
  collectionExport: 'collection:export',
  collectionImport: 'collection:import',
  collectionImportRequested: 'collection:import-requested',
  collectionImportCanceled: 'collection:import-canceled',
  collectionImportCompleted: 'collection:import-completed',
  importFileRead: 'import-file:read',
  rulesExport: 'rules:export',
  composerSend: 'composer:send',
  breakpointList: 'breakpoint:list',
  breakpointsChanged: 'breakpoint:changed',
  breakpointPickBodyFile: 'breakpoint:pick-body-file',
  breakpointResolve: 'breakpoint:resolve',
  breakpointContinueQueue: 'breakpoint:continue-queue',
  breakpointDropQueue: 'breakpoint:drop-queue',
  breakpointContinueRule: 'breakpoint:continue-rule',
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
  getStartupStage(): Promise<ApplicationStartupStage>;
  onStartupStageChange(listener: (stage: ApplicationStartupStage) => void): () => void;
  onPlatformOperationConflict(listener: (conflict: PlatformOperationConflict) => void): () => void;
  setUiLanguage(language: DesktopUiLanguage): Promise<{ language: DesktopUiLanguage }>;
  setUiTheme(theme: DesktopUiTheme): Promise<{ theme: DesktopUiTheme }>;
  setExportPrivacyDefaults(preferences: Partial<ExportPrivacyDefaults>): Promise<ExportPrivacyDefaults>;
  claimUiPreferenceChange(requestId: string): Promise<UiPreferenceChange | null>;
  completeUiPreferenceChange(requestId: string, response: UiPreferenceResponse): Promise<void>;
  onUiPreferenceChangeRequested(listener: (requestId: string) => void): () => void;
  onUiPreferenceChanged(listener: (change: UiPreferenceAppliedChange) => void): () => void;
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
  getUpstreamSettings(): Promise<UpstreamSettingsSnapshot>;
  applyUpstreamSettings(settings: UpstreamProxySettings): Promise<UpstreamSettingsSnapshot>;
  onUpstreamSettingsChanged(listener: () => void): () => void;
  enableSystemProxy(): Promise<SystemProxyStatus>;
  restoreSystemProxy(): Promise<SystemProxyRestoreResult>;
  listAppContainers(): Promise<AppContainerAccessSnapshot>;
  setAppContainerLoopbackExemption(
    appContainerSid: string,
    enabled: boolean,
  ): Promise<AppContainerAccessSnapshot>;
  enableAllAppContainers(): Promise<AppContainerAccessSnapshot>;
  disableAllAppContainers(): Promise<AppContainerAccessSnapshot>;
  onAppContainersChanged(listener: () => void): () => void;
  getAgentModels(): Promise<AgentModelsSnapshot>;
  testAgentProviderConnection(
    draft: AgentProviderDraft,
  ): Promise<AgentProviderVerification>;
  saveVerifiedAgentProvider(verificationId: string): Promise<AgentModelsSnapshot>;
  removeAgentProvider(providerId: string): Promise<AgentModelsSnapshot>;
  setDefaultAgentModel(providerId: string): Promise<AgentModelsSnapshot>;
  getToolCapabilitySettings(): Promise<ToolCapabilitySettingsSnapshot>;
  disableAgentTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot>;
  enableAgentTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot>;
  disableMcpTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot>;
  enableMcpTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot>;
  getMcpStatus(): Promise<McpDesktopStatus>;
  enableMcpServer(): Promise<McpDesktopStatus>;
  disableMcpServer(): Promise<McpDesktopStatus>;
  changeMcpEndpoint(): Promise<McpDesktopStatus>;
  createMcpClient(label: string): Promise<McpDesktopStatus>;
  regenerateMcpClientCredential(clientId: string): Promise<McpDesktopStatus>;
  revokeMcpClient(clientId: string): Promise<McpDesktopStatus>;
  requireMcpClientApproval(clientId: string): Promise<McpDesktopStatus>;
  automaticallyExecuteMcpClientTools(clientId: string): Promise<McpDesktopStatus>;
  copyMcpClientConfiguration(clientId: string): Promise<void>;
  allowMcpToolCall(approvalId: string): Promise<void>;
  denyMcpToolCall(approvalId: string): Promise<void>;
  onMcpStatusChange(listener: (status: McpDesktopStatus) => void): () => void;
  onMcpApprovalRequest(listener: (request: McpApprovalRequest) => void): () => void;
  onMcpApprovalSettled(listener: (approvalId: string) => void): () => void;
  listAgentSessions(): Promise<AgentSessionsSnapshot>;
  createAgentSession(): Promise<AgentSessionSnapshot>;
  selectAgentSession(sessionId: string): Promise<AgentSessionSnapshot>;
  getAgentSession(sessionId: string): Promise<AgentSessionSnapshot>;
  renameAgentSession(sessionId: string, title: string): Promise<AgentSessionSnapshot>;
  deleteAgentSession(sessionId: string): Promise<AgentSessionsSnapshot>;
  setAgentSessionModel(sessionId: string, providerId: string): Promise<AgentSessionSnapshot>;
  requireAgentToolApproval(sessionId: string): Promise<AgentSessionSnapshot>;
  automaticallyExecuteAgentTools(sessionId: string): Promise<AgentSessionSnapshot>;
  sendAgentMessage(sessionId: string, content: string): Promise<AgentTurnSnapshot>;
  cancelAgentTurn(turnId: string): Promise<AgentTurnSnapshot>;
  retryAgentTurn(turnId: string): Promise<AgentTurnSnapshot>;
  allowAgentToolCall(approvalId: string): Promise<AgentSessionSnapshot>;
  denyAgentToolCall(approvalId: string): Promise<AgentSessionSnapshot>;
  onAgentSessionEvent(listener: (event: AgentRuntimeEvent) => void): () => void;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  openDownloadedUpdate(): Promise<void>;
  onUpdateStatusChange(listener: (status: UpdateStatus) => void): () => void;
  onCoreProcessStatusChange(
    listener: (status: CoreProcessStatus) => void,
  ): () => void;
  /** 上游可达性跃迁等不由 Renderer 发起的系统代理变化。 */
  onSystemProxyStatusChange(
    listener: (status: SystemProxyStatus) => void,
  ): () => void;
  getCaptureUsage(): Promise<CaptureUsage>;
  clearCapture(): Promise<CaptureUsage>;
  startCapture(port?: number): Promise<CaptureStatus>;
  stopCapture(): Promise<CaptureStatus>;
  getCaptureStatus(): Promise<CaptureStatus>;
  onCaptureStatusChange(listener: (status: CaptureStatus) => void): () => void;
  onCaptureReset(listener: (reset: CaptureReset) => void): () => void;
  onCaptureImported(listener: () => void): () => void;
  getAndroidStatus(): Promise<AndroidDesktopStatus>;
  installAndroidApplication(serial: string): Promise<AndroidDesktopStatus>;
  connectAndroidDevice(serial: string, deviceFingerprint: string): Promise<AndroidDesktopStatus>;
  disconnectAndroidDevice(): Promise<AndroidDesktopStatus>;
  openAndroidApplication(serial: string): Promise<void>;
  onAndroidStatusChange(listener: (status: AndroidDesktopStatus) => void): () => void;
  querySessions(request: SessionQueryRequest): Promise<SessionsPage>;
  getExchangeDetail(exchangeId: string): Promise<CaptureExchangeDetail | null>;
  queryWebSocketFrames(request: WebSocketFrameQuery): Promise<WebSocketFramePage>;
  enableWebSocketBreakpoints(
    settings: WebSocketBreakpointSettings,
  ): Promise<WebSocketBreakpointSettings | null>;
  disableWebSocketBreakpoints(): Promise<WebSocketBreakpointSettings | null>;
  queryGrpcMessages(request: GrpcMessageQuery): Promise<GrpcMessagePage>;
  readGrpcBody(request: GrpcBodyReadRequest): Promise<BodyChunk>;
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
  getTlsPassthroughSettings(): Promise<TlsPassthroughSettings>;
  replaceTlsPassthroughSettings(
    expectedRevision: number,
    hosts: string[],
  ): Promise<TlsPassthroughReplaceResult>;
  onTlsCompatibilityChange(
    listener: (event: TlsCompatibilityEvent) => void,
  ): () => void;
  onTlsSettingsChanged(listener: () => void): () => void;
  getRules(): Promise<RuleSet>;
  replaceRules(
    expectedRevision: number,
    nodes: RuleNode[],
  ): Promise<RuleReplaceResult>;
  getRuleHits(): Promise<RuleHitCount[]>;
  onRulesChanged(listener: (change: RulesChanged) => void): () => void;
  importRules(): Promise<void>;
  onRulesImportRequested(listener: (requestId: string) => void): () => void;
  onRulesImportCanceled(listener: (requestId: string) => void): () => void;
  completeRulesImport(requestId: string, response: RulesImportResponse): Promise<void>;
  getCollection(): Promise<Collection>;
  onCollectionChanged(listener: (change: CollectionChanged) => void): () => void;
  replaceCollection(
    expectedRevision: number,
    nodes: CollectionNode[],
  ): Promise<CollectionReplaceResult>;
  /** 把整棵集合写成 JSON 文件；路径由 Main 的系统对话框选择，取消时返回 false。 */
  exportCollection(nodes: CollectionNode[], title: string): Promise<boolean>;
  importCollection(): Promise<void>;
  onCollectionImportRequested(listener: (requestId: string) => void): () => void;
  onCollectionImportCanceled(listener: (requestId: string) => void): () => void;
  completeCollectionImport(requestId: string, response: CollectionImportResponse): Promise<void>;
  /** 把整棵规则树导出成 JSON；落盘路径由 Main 的系统对话框选择。 */
  exportRules(nodes: RuleNode[], title: string): Promise<boolean>;
  /**
   * 选一个 JSON 文件并读回内容，供 Rules 与 Composer 导入共用。
   *
   * 不接受路径参数，路径只能由用户在原生对话框选择；取消返回 null，
   * 读取失败以结构化结果返回而不抛 IPC 错误。
   */
  readImportFile(title: string): Promise<ImportFileResult | null>;
  sendComposerRequest(request: ComposerRequest): Promise<ComposerResponse>;
  listBreakpoints(): Promise<BreakpointsSnapshot>;
  /** 挂起中的断点变化时回调；返回取消订阅函数。 */
  onBreakpointsChange(listener: () => void): () => void;
  /** 选一个文件作为断点替换正文；取消返回 null，Renderer 不接触真实路径。 */
  pickBreakpointBodyFile(): Promise<BreakpointBodyFile | null>;
  resolveBreakpoint(
    breakpointId: string,
    action: 'continue' | 'drop',
    edit?: BreakpointEdit,
  ): Promise<{ state: string }>;
  continueBreakpointQueue(queueKey: BreakpointQueueKey): Promise<{ resolvedCount: number }>;
  dropBreakpointQueue(queueKey: BreakpointQueueKey): Promise<{ resolvedCount: number }>;
  continueBreakpointRule(ruleId: string): Promise<{ resolvedCount: number }>;
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