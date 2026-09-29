import type { Collection, CollectionNode } from './collection';
import type {
  RuleDefinition,
  RuleHeaderPair,
  RuleHitCount,
  RuleNode,
  RuleSet,
} from './rules';

export const CORE_PROTOCOL_VERSION = 1 as const;

/** Renderer Inspector 单个正文预览的最大字节数；Core 仍完整保留正文。
 *  超出部分只影响预览，用户仍可经 Save body 导出完整内容。 */
export const BODY_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

/** 图片必须完整才能解码，半截字节渲染出来是坏图，所以它有独立于文本的上限。
 *  超过时不读字节，直接给元信息 + Save body。 */
export const IMAGE_PREVIEW_MAX_BYTES = 16 * 1024 * 1024;

/** 打开即格式化的上限；再大就只给按钮，避免用户为一次未必需要的解析干等。 */
export const FORMAT_AUTO_MAX_BYTES = 1024 * 1024;

/** 超过这个体积不提供格式化：解析时间与内存都不可接受。 */
export const FORMAT_MAX_BYTES = 2 * 1024 * 1024;

export interface EchoCommand {
  type: 'echo';
  payload: {
    value: string;
  };
}

export interface SessionsQueryCommand {
  type: 'sessions.query';
  payload: {
    cursor?: string;
    limit: number;
    sort: 'started_desc' | 'started_asc';
    filter: {
      sessionId?: string;
      host?: string;
      method?: string;
      status?: number;
      mime?: string;
      appName?: string;
      search?: string;
      protocol?: 'h1' | 'h2' | 'ws';
    };
  };
}

export interface BodyReadRangeCommand {
  type: 'body.read-range';
  payload: {
    bodyId: string;
    offset: number;
    length: number;
    /** true 时 Core 从 Body Store流式解码，再按明文字节 offset + length 返回有限range。 */
    decode?: boolean;
    /** 解码用的 content-encoding（gzip/deflate/br，可逗号分隔多层）。 */
    encoding?: string;
  };
}

export interface SessionsDetailCommand {
  type: 'sessions.detail';
  payload: {
    exchangeId: string;
  };
}

/** 按 Exchange 查询 WebSocket 应用消息；cursor 为不透明的 seq keyset 游标。 */
export interface WebSocketFramesCommand {
  type: 'websocket.frames';
  payload: {
    exchangeId: string;
    cursor?: string;
    limit: number;
    direction?: WebSocketFrameDirection;
  };
}

export interface WebSocketBreakpointEnableCommand {
  type: 'websocket.breakpoint.enable';
  payload: WebSocketBreakpointSettings;
}

export interface WebSocketBreakpointDisableCommand {
  type: 'websocket.breakpoint.disable';
  payload: Record<string, never>;
}

export type GrpcMessageSide = 'request' | 'response';

/** 按 HTTP body side 分页扫描 gRPC 5-byte envelope，不返回 payload 字节。 */
export interface GrpcMessagesCommand {
  type: 'grpc.messages';
  payload: {
    exchangeId: string;
    side: GrpcMessageSide;
    cursor?: string;
    limit: number;
  };
}

export interface GrpcReadRangeCommand {
  type: 'grpc.read-range';
  payload: {
    exchangeId: string;
    side: GrpcMessageSide;
    offset: number;
    length: number;
  };
}

export interface RulesReplaceCommand {
  type: 'rules.replace';
  payload: {
    expectedRevision: number;
    nodes: RuleNode[];
  };
}

export interface RulesGetCommand {
  type: 'rules.get';
  payload: Record<string, never>;
}

/** 查询按 ruleId 聚合的累计命中次数，供 Rules workspace 的 hit counter。 */
export interface RulesHitsCommand {
  type: 'rules.hits';
  payload: Record<string, never>;
}

/** 读取整棵 Composer 集合树。 */
export interface CollectionGetCommand {
  type: 'collection.get';
  payload: Record<string, never>;
}

/** 原子替换整棵集合树；revision 不匹配则拒绝。 */
export interface CollectionReplaceCommand {
  type: 'collection.replace';
  payload: {
    expectedRevision: number;
    nodes: CollectionNode[];
  };
}

/** Persisted TLS passthrough host patterns used before HTTPS interception. */
export interface TlsPassthroughSettings {
  revision: number;
  hosts: string[];
}

/** Read the complete persisted TLS passthrough host-pattern document. */
export interface TlsPassthroughGetCommand {
  type: 'tls-passthrough.get';
  payload: Record<string, never>;
}

/** Atomically replace TLS passthrough host patterns at one expected revision. */
export interface TlsPassthroughReplaceCommand {
  type: 'tls-passthrough.replace';
  payload: {
    expectedRevision: number;
    hosts: string[];
  };
}

/**
 * Composer 手工构造的出站请求：由 Core 用 Node http/https/http2 执行并回传响应。
 * protocol 为传输偏好（auto/HTTP1.1 走 http/https、h2 走 http2）。
 */
export interface ComposerSendCommand {
  type: 'composer.send';
  payload: {
    method: string;
    url: string;
    headers: RuleHeaderPair[];
    body?: string;
    protocol: 'auto' | 'http/1.1' | 'h2';
    timeoutMs?: number;
  };
}

/**
 * 断点放行时对请求/响应的可选编辑（waiting→edited→continued）。
 * 请求阶段用 method/url，响应阶段用 statusCode，headers/body 两阶段通用（完整替换）。
 */
export interface BreakpointEdit {
  method?: string;
  url?: string;
  statusCode?: number;
  headers?: RuleHeaderPair[];
  /** 用户显式设置或删除过的 header 名，trim 后小写并按首次编辑顺序去重。 */
  editedHeaderNames?: string[];
  body?: string;
  /**
   * 用本地文件整体替换正文；与 `body` 互斥，优先级更高。
   * 大文件与二进制不经 IPC 搬运，由 Core 直接读，和 Map Local 同一条路。
   */
  bodyFilePath?: string;
  /** 仅 WebSocket close 帧：转发时改写的 close code。 */
  closeCode?: number;
}

export interface BreakpointResolveCommand {
  type: 'breakpoint.resolve';
  payload: {
    breakpointId: string;
    action: 'continue' | 'drop';
    edit?: BreakpointEdit;
  };
}

export type BreakpointQueueKey = 'http' | `ws:${string}`;

/** 原样放行命令开始时属于指定逻辑队列的全部等待断点。 */
export interface BreakpointContinueQueueCommand {
  type: 'breakpoint.continueQueue';
  payload: {
    queueKey: BreakpointQueueKey;
  };
}

/** 丢弃命令开始时属于指定逻辑队列的全部等待断点。 */
export interface BreakpointDropQueueCommand {
  type: 'breakpoint.dropQueue';
  payload: {
    queueKey: BreakpointQueueKey;
  };
}

/** 原样放行命令开始时由指定 Rule 挂起的全部等待断点。 */
export interface BreakpointContinueRuleCommand {
  type: 'breakpoint.continueRule';
  payload: {
    ruleId: string;
  };
}

/** 查询当前等待中的断点（含请求/响应快照）与全局 break-on-match 开关。 */
export interface BreakpointListCommand {
  type: 'breakpoint.list';
  payload: Record<string, never>;
}

/** 设置全局 break-on-match 开关；关闭时命中 breakpoint action 直接放行。 */
export interface BreakpointConfigureCommand {
  type: 'breakpoint.configure';
  payload: {
    enabled: boolean;
  };
}

/** 对 host:port 发起 TLS 探测，读取当前协议/套件/ALPN/证书链。 */
export interface TlsProbeCommand {
  type: 'tls.probe';
  payload: {
    host: string;
    port: number;
    timeoutMs?: number;
  };
}

export interface DiagnosticsRecentCommand {
  type: 'diagnostics.recent';
  payload: {
    limit: number;
    traceId?: string;
  };
}

export interface DiagnosticsIngestCommand {
  type: 'diagnostics.ingest';
  payload: DiagnosticIngestPayload;
}

export interface DiagnosticsQueryCommand {
  type: 'diagnostics.query';
  payload: {
    cursor?: string;
    limit: number;
    process?: DiagnosticProcess;
    level?: DiagnosticLevel;
    outcome?: DiagnosticOutcome;
    traceId?: string;
    command?: string;
    minDurationMs?: number;
    maxDurationMs?: number;
  };
}

export interface DiagnosticsExportStartCommand {
  type: 'diagnostics.export.start';
  payload: {
    jobId: string;
    filePath: string;
    process?: DiagnosticProcess;
    level?: DiagnosticLevel;
    outcome?: DiagnosticOutcome;
  };
}

export interface CaptureStatusCommand {
  type: 'capture.status';
  payload: Record<string, never>;
}

export interface CaptureCleanupCommand {
  type: 'capture.cleanup';
  payload: {
    scope: 'all' | 'session';
    sessionId?: string;
  };
}

export interface HarExportStartCommand {
  type: 'har.export.start';
  payload: {
    jobId: string;
    filePath: string;
    scope:
      | { kind: 'all' }
      | {
          kind: 'filter';
          filter: {
            host?: string;
            method?: string;
            status?: number;
            mime?: string;
            appName?: string;
            search?: string;
            protocol?: 'h1' | 'h2' | 'ws';
          };
        }
      | { kind: 'selected'; exchangeIds: string[] };
    redaction: {
      authorization: boolean;
      cookies: boolean;
      bodies: boolean;
    };
  };
}

export interface HarImportStartCommand {
  type: 'har.import.start';
  payload: {
    jobId: string;
    filePath: string;
  };
}

export interface ArchiveExportStartCommand {
  type: 'archive.export.start';
  payload: {
    jobId: string;
    filePath: string;
  };
}

export interface ArchiveImportStartCommand {
  type: 'archive.import.start';
  payload: {
    jobId: string;
    filePath: string;
  };
}

export interface BodyExportStartCommand {
  type: 'body.export.start';
  payload: {
    jobId: string;
    filePath: string;
    bodyId: string;
  };
}

export interface TransferJobGetCommand {
  type: 'transfer.job.get';
  payload: { jobId: string };
}

export interface TransferJobCancelCommand {
  type: 'transfer.job.cancel';
  payload: { jobId: string };
}

export interface ProxyStartCommand {
  type: 'proxy.start';
  payload: {
    port?: number;
  };
}

export interface ProxyStopCommand {
  type: 'proxy.stop';
  payload: Record<string, never>;
}

export interface ProxyStatusCommand {
  type: 'proxy.status';
  payload: Record<string, never>;
}

/**
 * 暂停/恢复捕获记录。暂停时监听器与系统代理保持运行、流量继续转发，
 * 仅停止持久化与推送新 Exchange；恢复后继续在同一会话追加。
 */
export interface ProxySetRecordingCommand {
  type: 'proxy.setRecording';
  payload: {
    recording: boolean;
  };
}

/**
 * 上游代理配置：Interceptor 把流量再转发给它，而不是直连源站。
 * 企业 PAC / VPN / 认证代理环境下必须链式转发，否则接管系统代理期间会完全断网。
 */
export interface SingleUpstreamProxyConfig {
  /** 代理 URL；支持 http://、https://、socks5://、pac+http://（PAC 脚本）。 */
  readonly proxyUrl: string;
  /** 不经上游、直连源站的主机列表（curl 风格 no_proxy）。 */
  readonly noProxy?: readonly string[];
}

export interface ProtocolUpstreamProxyConfig {
  readonly httpProxyUrl: string | null;
  readonly httpsProxyUrl: string | null;
  readonly exceptions: readonly string[];
  readonly excludeSimpleHostnames: boolean;
}

export type UpstreamProxyConfig = SingleUpstreamProxyConfig | ProtocolUpstreamProxyConfig;

/**
 * 由 Main 内部下发的上游代理配置（非 Renderer 发起）。
 * upstream 为 null 表示直连源站。切换即时生效，不重启监听器。
 */
export interface ProxySetUpstreamCommand {
  type: 'proxy.setUpstream';
  payload: {
    upstream: UpstreamProxyConfig | null;
  };
}

/**
 * 换用一份新的 CA 材料（Root CA 生成 / 安装信任 / 删除后由 Main 下发）。
 * null 表示当前没有可用且受信任的 CA，Core 退回进程内临时身份。
 * 私钥只在 Main↔Core 内部通道流转，绝不经 Renderer。
 */
export interface TlsUseCertificateCommand {
  type: 'tls.useCertificate';
  payload: {
    ca: { key: string; cert: string } | null;
  };
}

/** 开始解密 HTTPS（对应 Settings 里 Decrypt HTTPS 开关拨到开）。 */
export interface TlsStartDecryptionCommand {
  type: 'tls.startDecryption';
  payload: Record<string, never>;
}

/** 停止解密 HTTPS（对应 Settings 里 Decrypt HTTPS 开关拨到关）。 */
export interface TlsStopDecryptionCommand {
  type: 'tls.stopDecryption';
  payload: Record<string, never>;
}

/**
 * 全量替换源站证书的不安全例外名单（对应 Certificates 里的 Per-host overrides）。
 * 名单内的 host 在 Interceptor→源站 方向跳过证书校验。名单同时持久化，重启后自动恢复。
 */
export interface TlsReplaceInsecureHostsCommand {
  type: 'tls.replaceInsecureHosts';
  payload: {
    hosts: string[];
  };
}

/** 读取持久化的源站证书例外名单。 */
export interface TlsGetInsecureHostsCommand {
  type: 'tls.getInsecureHosts';
  payload: Record<string, never>;
}

/**
 * 记住用户是否想解密 HTTPS。与 tls.startDecryption / tls.stopDecryption 正交：
 * 这条只写用户意图，实际是否解密还取决于 CA 是否已被系统信任。
 */
export interface TlsSaveDecryptionPreferenceCommand {
  type: 'tls.saveDecryptionPreference';
  payload: {
    enabled: boolean;
  };
}

/** 读取用户上次留下的 HTTPS 解密意图。 */
export interface TlsGetDecryptionPreferenceCommand {
  type: 'tls.getDecryptionPreference';
  payload: Record<string, never>;
}

export type CoreCommand =
  | EchoCommand
  | SessionsQueryCommand
  | SessionsDetailCommand
  | WebSocketFramesCommand
  | WebSocketBreakpointEnableCommand
  | WebSocketBreakpointDisableCommand
  | GrpcMessagesCommand
  | GrpcReadRangeCommand
  | BodyReadRangeCommand
  | RulesReplaceCommand
  | RulesGetCommand
  | RulesHitsCommand
  | CollectionGetCommand
  | CollectionReplaceCommand
  | TlsPassthroughGetCommand
  | TlsPassthroughReplaceCommand
  | ComposerSendCommand
  | BreakpointResolveCommand
  | BreakpointContinueQueueCommand
  | BreakpointDropQueueCommand
  | BreakpointContinueRuleCommand
  | BreakpointListCommand
  | BreakpointConfigureCommand
  | TlsProbeCommand
  | DiagnosticsRecentCommand
  | DiagnosticsIngestCommand
  | DiagnosticsQueryCommand
  | DiagnosticsExportStartCommand
  | CaptureStatusCommand
  | CaptureCleanupCommand
  | HarExportStartCommand
  | HarImportStartCommand
  | ArchiveExportStartCommand
  | ArchiveImportStartCommand
  | BodyExportStartCommand
  | TransferJobGetCommand
  | TransferJobCancelCommand
  | ProxyStartCommand
  | ProxyStopCommand
  | ProxyStatusCommand
  | ProxySetRecordingCommand
  | ProxySetUpstreamCommand
  | TlsUseCertificateCommand
  | TlsStartDecryptionCommand
  | TlsStopDecryptionCommand
  | TlsReplaceInsecureHostsCommand
  | TlsGetInsecureHostsCommand
  | TlsSaveDecryptionPreferenceCommand
  | TlsGetDecryptionPreferenceCommand;

export interface EchoResult {
  type: 'echo';
  payload: {
    value: string;
    handledAt: string;
  };
}

export interface SessionsPageResult {
  type: 'sessions.page';
  payload: {
    items: CaptureExchangeSummary[];
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface SessionsDetailResult {
  type: 'sessions.detail';
  payload: {
    detail: CaptureExchangeDetail | null;
  };
}

export type WebSocketFrameDirection = 'client-to-server' | 'server-to-client';

/** 断点作用的方向；both 表示两个方向都拦。 */
export type WebSocketBreakpointDirection = WebSocketFrameDirection | 'both';

/** 断点作用的帧类别；message 覆盖 text 与 binary 应用消息。 */
export type WebSocketBreakpointFrame = 'message' | 'ping' | 'pong' | 'close';

export interface WebSocketBreakpointSettings {
  /** 断点只作用于这条连接的 Capture Exchange。 */
  exchangeId: string;
  direction: WebSocketBreakpointDirection;
  frames: readonly WebSocketBreakpointFrame[];
}

/** 一条有序 WebSocket 应用消息摘要；payload 字节仍经 body.read-range 按需读取。 */
export interface WebSocketFrameSummary {
  seq: number;
  direction: WebSocketFrameDirection;
  opcode: 1 | 2;
  timestamp: number;
  payloadSize: number;
  payload?: CaptureBodyRef;
}

export interface WebSocketFramesResult {
  type: 'websocket.frames';
  payload: {
    items: WebSocketFrameSummary[];
    nextCursor?: string;
    hasMore: boolean;
    /** 当前连接的 WebSocket 断点配置；null 表示未启用。 */
    breakpoint: WebSocketBreakpointSettings | null;
  };
}

export interface WebSocketBreakpointStateResult {
  type: 'websocket.breakpoint.state';
  payload: {
    enabled: boolean;
    settings: WebSocketBreakpointSettings | null;
  };
}

export interface GrpcMessageSummary {
  index: number;
  envelopeOffset: number;
  payloadOffset: number;
  payloadLength: number;
  compressed: boolean;
  truncated: boolean;
}

export interface GrpcMessagesResult {
  type: 'grpc.messages';
  payload: {
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
  };
}

export interface GrpcRangeResult {
  type: 'grpc.range';
  payload: {
    offset: number;
    data: Uint8Array;
    end: boolean;
  };
}

export interface BodyRangeResult {
  type: 'body.range';
  payload: {
    bodyId: string;
    offset: number;
    data: Uint8Array;
    end: boolean;
    /** 解码结果：ok=完整，limited=有限明文前缀，skipped=未解码，failed=失败返回原始。 */
    decodeStatus?: string;
  };
}

export interface RuleRevisionResult {
  type: 'rules.revision';
  payload: {
    revision: number;
  };
}

export interface RulesRuleSetResult {
  type: 'rules.ruleset';
  payload: {
    ruleSet: RuleSet;
  };
}

export interface RulesHitsResult {
  type: 'rules.hits';
  payload: {
    counts: RuleHitCount[];
  };
}

/** 整棵 Composer 集合树。 */
export interface CollectionResult {
  type: 'collection.collection';
  payload: {
    collection: Collection;
  };
}

/** 集合替换成功后的新 revision。 */
export interface CollectionRevisionResult {
  type: 'collection.revision';
  payload: {
    revision: number;
  };
}

/** Complete persisted TLS passthrough settings document. */
export interface TlsPassthroughSettingsResult {
  type: 'tls-passthrough.settings';
  payload: {
    settings: TlsPassthroughSettings;
  };
}

/** TLS passthrough replacement result. */
export interface TlsPassthroughRevisionResult {
  type: 'tls-passthrough.revision';
  payload: {
    revision: number;
  };
}

/** Composer 连接的 TLS/ALPN/证书摘要（只包含展示用公开元数据）。 */export interface ComposerTlsInfo {
  protocol: string;
  cipher: string;
  alpn: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
}

/**
 * Composer 一次发送的分阶段耗时（毫秒）。
 * 阶段从 socket 事件推导，未发生的阶段为 0（明文请求没有 tls，复用连接没有 dns/tcp）。
 */
export interface ComposerTiming {
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  requestMs: number;
  waitingMs: number;
  downloadMs: number;
  totalMs: number;
}

/** Composer 响应：成功时带状态/头/完整正文/时序/TLS；失败时 ok=false + error。 */
export interface ComposerResponseResult {
  type: 'composer.response';
  payload: {
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
  };
}

export interface BreakpointResolutionResult {
  type: 'breakpoint.resolution';
  payload: {
    breakpointId: string;
    state: 'continued' | 'edited' | 'dropped';
  };
}

/** 批量断点命令实际解除的目标数；并发消失的目标不计入。 */
export interface BreakpointBatchResolutionResult {
  type: 'breakpoint.batch-resolution';
  payload: {
    resolvedCount: number;
  };
}

/** 断点编辑器中的最终 header；当前值由 Rule 产生时携带可展示 marker。 */
export interface BreakpointHeader extends RuleHeaderPair {
  ruleEffect?: Extract<CaptureHeaderRuleEffect, 'set' | 'append'>;
  ruleId?: string;
}

/** 一个等待中的断点：标识/阶段/时序 + 请求或响应快照（flatten）。 */
export interface PendingBreakpoint {
  id: string;
  phase: 'request' | 'response' | 'websocket';
  queueKey: BreakpointQueueKey;
  /** WebSocket 帧断点不由 Rule 触发，因此没有 ruleId。 */
  ruleId?: string;
  /**
   * 挂起流量所属的 Capture Exchange，使暂停状态能在流量列表原行展示，
   * 也使同一 exchange 的 request / response 两阶段可关联。未记录时缺省。
   */
  exchangeId?: string;
  createdAt: number;
  ruleName: string;
  method?: string;
  url?: string;
  statusCode?: number;
  direction?: WebSocketFrameDirection;
  /** WebSocket 帧类别；message 之外的都是控制帧。 */
  frame?: WebSocketBreakpointFrame;
  /** 当前应用消息已写入Capture时分配的frame sequence；控制帧缺省。 */
  webSocketFrameSequence?: number;
  opcode?: 1 | 2;
  bodyFormat?: 'text' | 'hex';
  headers: BreakpointHeader[];
  /**
   * 此刻是否能看到原始正文。HTTP 规则断点在头部阶段挂起，此时正文还没到达，
   * 因此为 false；WebSocket 消息断点拿得到完整 payload，为 true。
   * false 时 UI 不得把空输入框当作原文，也不得把空值当作“把正文改成空”。
   */
  bodyAvailable: boolean;
  body?: string;
  /** 仅 WebSocket close 帧：对端给出的 close code。 */
  closeCode?: number;
}

export interface BreakpointPendingResult {
  type: 'breakpoint.pending';
  payload: {
    breakpoints: PendingBreakpoint[];
    enabled: boolean;
  };
}

export interface BreakpointConfigResult {
  type: 'breakpoint.config';
  payload: {
    enabled: boolean;
  };
}

/** 一张证书的展示摘要（主体/签发者/有效期/序列号/指纹）。 */
export interface TlsCertificate {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  fingerprint256: string;
}

/** TLS 探测结果：成功带协议/套件/ALPN/授权状态/证书链；失败 ok=false + error。 */
export interface TlsProbeResult {
  type: 'tls.probed';
  payload: {
    ok: boolean;
    error?: string;
    protocol: string;
    cipher: string;
    alpn: string;
    authorized: boolean;
    authorizationError?: string;
    certificates: TlsCertificate[];
  };
}

/**
 * 发起本机流量的客户端应用身份。
 * `path` 只在 Core → Main 之间流转供取应用图标，绝不转发给 Renderer。
 */
export interface ClientAppIdentity {
  id: string;
  name: string;
  path: string;
}

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';
export type DiagnosticProcess = 'core' | 'main' | 'renderer';
export type DiagnosticOutcome =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'timed_out';
export type DiagnosticAttribute = string | number | boolean;

export interface DiagnosticIngestPayload {
  process: Exclude<DiagnosticProcess, 'core'>;
  level: Exclude<DiagnosticLevel, 'debug'>;
  phase: string;
  traceId?: string;
  requestId?: string;
  action?: string;
  durationMs?: number;
  outcome?: DiagnosticOutcome;
  errorCode?: string;
  attributes?: Record<string, DiagnosticAttribute>;
}

export interface DiagnosticLogRecord {
  timestamp: string;
  sequence: number;
  level: DiagnosticLevel;
  process: DiagnosticProcess;
  traceId?: string;
  requestId?: string;
  command?: CoreCommand['type'];
  phase: string;
  action?: string;
  durationMs?: number;
  outcome?: DiagnosticOutcome;
  errorCode?: string;
  attributes?: Record<string, DiagnosticAttribute>;
}

export interface DiagnosticsRecordsResult {
  type: 'diagnostics.records';
  payload: {
    records: DiagnosticLogRecord[];
    droppedCount: number;
  };
}

export interface DiagnosticsIngestedResult {
  type: 'diagnostics.ingested';
  payload: Record<string, never>;
}

export interface DiagnosticsPageResult {
  type: 'diagnostics.page';
  payload: {
    records: DiagnosticLogRecord[];
    nextCursor?: string;
    hasMore: boolean;
    droppedCount: number;
  };
}

export interface CaptureStatusResult {
  type: 'capture.status';
  payload: {
    sessionCount: number;
    exchangeCount: number;
    bodyCount: number;
    databaseBytes: number;
    blobBytes: number;
    totalBytes: number;
  };
}

export type TransferJobKind =
  | 'har-export'
  | 'har-import'
  | 'archive-export'
  | 'archive-import'
  | 'body-export'
  | 'diagnostics-export';
export type TransferJobState =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TransferJobSnapshot {
  id: string;
  kind: TransferJobKind;
  state: TransferJobState;
  fileName: string;
  processed: number;
  total: number;
  startedAt: string;
  completedAt?: string;
  message?: string;
  warnings: string[];
}

export interface TransferJobResult {
  type: 'transfer.job';
  payload: { job: TransferJobSnapshot | null };
}

export interface ProxyStatusResult {
  type: 'proxy.status';
  payload: {
    listening: boolean;
    /** 是否正在记录新流量；监听器暂停时为 false，但 listening 仍可为 true。 */
    recording: boolean;
    host: string | null;
    port: number | null;
    sessionId: string | null;
    capturedExchanges: number;
  };
}

/** 当前 TLS 运行态：是否持有可用 CA，以及是否正在解密。 */
export interface TlsStateResult {
  type: 'tls.state';
  payload: {
    certificateReady: boolean;
    decrypting: boolean;
  };
}

/** 持久化的源站证书例外名单。 */
export interface TlsInsecureHostsResult {
  type: 'tls.insecureHosts';
  payload: {
    hosts: string[];
  };
}

/** 用户留下的 HTTPS 解密意图。 */
export interface TlsDecryptionPreferenceResult {
  type: 'tls.decryptionPreference';
  payload: {
    enabled: boolean;
  };
}

export type CoreResult =
  | EchoResult
  | SessionsPageResult
  | SessionsDetailResult
  | WebSocketFramesResult
  | WebSocketBreakpointStateResult
  | GrpcMessagesResult
  | GrpcRangeResult
  | BodyRangeResult
  | RuleRevisionResult
  | RulesRuleSetResult
  | RulesHitsResult
  | CollectionResult
  | CollectionRevisionResult
  | TlsPassthroughSettingsResult
  | TlsPassthroughRevisionResult
  | ComposerResponseResult
  | BreakpointResolutionResult
  | BreakpointBatchResolutionResult
  | BreakpointPendingResult
  | BreakpointConfigResult
  | TlsProbeResult
  | DiagnosticsRecordsResult
  | DiagnosticsIngestedResult
  | DiagnosticsPageResult
  | CaptureStatusResult
  | TransferJobResult
  | ProxyStatusResult
  | TlsStateResult
  | TlsInsecureHostsResult
  | TlsDecryptionPreferenceResult;

export type CoreResultForCommand<T extends CoreCommand> =
  T extends EchoCommand ? EchoResult
    : T extends SessionsQueryCommand ? SessionsPageResult
      : T extends SessionsDetailCommand ? SessionsDetailResult
        : T extends WebSocketFramesCommand ? WebSocketFramesResult
          : T extends WebSocketBreakpointEnableCommand
            ? WebSocketBreakpointStateResult
          : T extends WebSocketBreakpointDisableCommand
            ? WebSocketBreakpointStateResult
            : T extends GrpcMessagesCommand ? GrpcMessagesResult
              : T extends GrpcReadRangeCommand ? GrpcRangeResult
              : T extends BodyReadRangeCommand ? BodyRangeResult
            : T extends RulesReplaceCommand ? RuleRevisionResult
            : T extends CollectionGetCommand ? CollectionResult
            : T extends CollectionReplaceCommand ? CollectionRevisionResult
            : T extends TlsPassthroughGetCommand ? TlsPassthroughSettingsResult
            : T extends TlsPassthroughReplaceCommand ? TlsPassthroughRevisionResult
              : T extends BreakpointResolveCommand
                ? BreakpointResolutionResult
                : T extends BreakpointContinueQueueCommand
                  ? BreakpointBatchResolutionResult
                  : T extends BreakpointDropQueueCommand
                    ? BreakpointBatchResolutionResult
                    : T extends BreakpointContinueRuleCommand
                      ? BreakpointBatchResolutionResult
                : T extends BreakpointListCommand
                  ? BreakpointPendingResult
                  : T extends BreakpointConfigureCommand
                    ? BreakpointConfigResult                : T extends DiagnosticsRecentCommand
                  ? DiagnosticsRecordsResult
                  : T extends DiagnosticsIngestCommand
                    ? DiagnosticsIngestedResult
                  : T extends DiagnosticsQueryCommand
                    ? DiagnosticsPageResult
                    : T extends DiagnosticsExportStartCommand
                      ? TransferJobResult
                    : T extends CaptureStatusCommand
                      ? CaptureStatusResult
                      : T extends CaptureCleanupCommand
                        ? CaptureStatusResult
                        : T extends HarExportStartCommand
                          ? TransferJobResult
                          : T extends HarImportStartCommand
                            ? TransferJobResult
                            : T extends ArchiveExportStartCommand
                              ? TransferJobResult
                              : T extends ArchiveImportStartCommand
                                ? TransferJobResult
                                : T extends BodyExportStartCommand
                                  ? TransferJobResult
                            : T extends TransferJobGetCommand
                              ? TransferJobResult
                              : T extends TransferJobCancelCommand
                                ? TransferJobResult
                        : T extends ProxyStartCommand
                          ? ProxyStatusResult
                          : T extends ProxyStopCommand
                            ? ProxyStatusResult
                            : T extends ProxyStatusCommand
                              ? ProxyStatusResult
                              : T extends ProxySetRecordingCommand
                                ? ProxyStatusResult
                              : T extends ProxySetUpstreamCommand
                                ? ProxyStatusResult
                              : T extends TlsUseCertificateCommand
                                ? TlsStateResult
                                : T extends TlsStartDecryptionCommand
                                  ? TlsStateResult
                                  : T extends TlsStopDecryptionCommand
                                    ? TlsStateResult
                                    : T extends TlsReplaceInsecureHostsCommand
                                      ? TlsInsecureHostsResult
                                      : T extends TlsGetInsecureHostsCommand
                                        ? TlsInsecureHostsResult
                                        : T extends TlsSaveDecryptionPreferenceCommand
                                          ? TlsDecryptionPreferenceResult
                                          : T extends TlsGetDecryptionPreferenceCommand
                                            ? TlsDecryptionPreferenceResult
                                : T extends RulesGetCommand
                                  ? RulesRuleSetResult
                                  : T extends RulesHitsCommand
                                    ? RulesHitsResult
                                    : T extends ComposerSendCommand
                                      ? ComposerResponseResult
                                      : T extends TlsProbeCommand
                                        ? TlsProbeResult
                                        : never;

export interface CoreError {
  code:
    | 'invalid-message'
    | 'unsupported-command'
    | 'timeout'
    | 'cancelled'
    | 'disconnected'
    | 'conflict'
    | 'internal';
  message: string;
  retryable: boolean;
}

export interface CoreRequest {
  kind: 'request';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  traceId: string;
  command: CoreCommand;
}

export interface CoreCancel {
  kind: 'cancel';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  reason?: 'caller' | 'timeout' | 'shutdown';
}

export interface CoreSuccessResponse {
  kind: 'response';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  traceId: string;
  ok: true;
  result: CoreResult;
}

export interface CoreErrorResponse {
  kind: 'response';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  traceId: string;
  ok: false;
  error: CoreError;
}

export type CaptureExchangeEventKind = 'exchange-added' | 'exchange-updated';

/**
 * 面向订阅端与会话列表的有限 Exchange 摘要（不含正文、不 hydrate header）。
 * 实时事件与分页查询共用同一类型；Renderer 按 id 去重、按 startedAt 排序。
 */
export interface CaptureExchangeSummary {
  id: string;
  method: string;
  secure: boolean;
  host?: string;
  path?: string;
  protocol: string;
  statusCode?: number;
  responseMime?: string;
  state: string;
  startedAt: number;
  durationMs?: number;
  requestBytes: number;
  responseBytes: number;
  /** 对该 Exchange 实际执行过至少一个 action 的规则 id，按首次命中顺序去重。 */
  ruleIds?: string[];
  /** 发起该请求的本机应用 id；远程设备或无法解析时省略。 */
  appId?: string;
  /** 发起该请求的本机应用展示名；与 appId 同时存在。 */
  appName?: string;
  /**
   * 应用归属还在异步解析中。
   * 端口快照未命中时要拉起 helper 反查，期间无 appId 不代表“识别不出”；
   * 不区分两者会让 Application 筛选器先冒出 Unknown 再消失。
   */
  appPending?: boolean;
}

export interface CaptureExchangeEvent {
  kind: CaptureExchangeEventKind;
  summary: CaptureExchangeSummary;
}

/** Mockttp 的 TLS 握手失败原因全集；任何一种都可能指向需要 passthrough 的客户端。 */
export type TlsCompatibilityReason =
  | 'cert-rejected'
  | 'reset'
  | 'closed'
  | 'no-shared-cipher'
  | 'handshake-timeout'
  | 'unknown';

/** One deduplicated signal that a host may not accept HTTPS interception. */
export interface TlsCompatibilityEvent {
  generation: number;
  host: string;
  reason: TlsCompatibilityReason;
  timestamp: number;
}

/** 单个 HTTP 头部（名/值）；detail 请求/响应头按 ordinal 顺序返回。 */
export type CaptureHeaderRuleEffect = 'set' | 'append' | 'replace' | 'remove';

export interface CaptureHeader {
  name: string;
  value: string;
  /** HTTP/2 伪首部（:method/:path/:scheme/:authority/:status）标记；HTTP/1.1 恒为 undefined。 */
  isPseudo?: boolean;
  /** 规则在代理转发前产生的 request header 净效果；原始 header 行不设置。 */
  ruleEffect?: CaptureHeaderRuleEffect;
  /** 产生该 header effect 的规则 id；仅与 ruleEffect 同时存在。 */
  ruleId?: string;
}

/** 正文引用元数据；bodyHash 供 body.read-range 分块读取，无正文时省略。 */
export interface CaptureBodyRef {
  bodyHash?: string;
  mediaType?: string;
  /** 原始 content-encoding（gzip/deflate/br）；未压缩时省略，供 Inspector 解码预览。 */
  contentEncoding?: string;
  encodedSize: number;
  decodedSize?: number;
  truncated: boolean;
  decodeStatus: string;
}

export type CaptureBodyRuleEffectSource = 'text' | 'file';
export type CaptureBodyOriginalState = 'available' | 'empty' | 'unavailable';

/** 正文替换的最终写入者，以及可独立读取的原始正文证据。 */
export interface CaptureBodyRuleEffect {
  ruleId: string;
  effect: 'replace';
  source: CaptureBodyRuleEffectSource;
  originalState: CaptureBodyOriginalState;
  originalBody?: CaptureBodyRef;
}

/**
 * 单条 Exchange 的按需详情：在摘要基础上补齐 URL、头部与正文引用。
 * 由 Inspector 选中行时拉取；正文字节仍通过 body.read-range 单独按需读取。
 */
export interface CaptureExchangeDetail {
  summary: CaptureExchangeSummary;
  url: string;
  scheme?: string;
  port?: number;
  /** 响应首字节到达时间；用于真实 TTFB/下载分段。 */
  responseStartedAt?: number;
  /** Exchange 完成时间；用于真实下载分段。 */
  completedAt?: number;
  statusText?: string;
  requestMime?: string;
  errorCode?: string;
  /** HTTP/2 流标识；HTTP/1.1 或未知时省略。 */
  streamId?: number;
  requestHeaders: CaptureHeader[];
  responseHeaders: CaptureHeader[];
  /** HTTP/2 或 chunked trailer；无 trailer 时为空数组。 */
  requestTrailers: CaptureHeader[];
  responseTrailers: CaptureHeader[];
  requestBody?: CaptureBodyRef;
  responseBody?: CaptureBodyRef;
  requestBodyEffect?: CaptureBodyRuleEffect;
  responseBodyEffect?: CaptureBodyRuleEffect;
}

export interface CoreEventBatch {
  kind: 'event-batch';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  batchSequence: number;
  events: CaptureExchangeEvent[];
  /** Capture导入已完成；接收方重新查询summaries，不传文件信息。 */
  captureImported?: boolean;
  /** TLS compatibility signals are global settings events, not Capture exchanges. */
  tlsCompatibilityEvents?: TlsCompatibilityEvent[];
  /**
   * 挂起中的断点发生了变化。
   * 只传信号不传快照：断点少、且 Renderer 本来就要拉完整列表才能重建编辑草稿。
   */
  breakpointsChanged?: boolean;
  /**
   * 本批次中首次出现、尚未下发过的客户端应用身份。
   * Core 是唯一能解析出可执行文件路径的一侧，因此随事件一次性交给 Main 取图标，
   * 避免 Main 再按 appId 回问一次。
   */
  clientApps?: ClientAppIdentity[];
}

export interface CoreEventAck {
  kind: 'event-ack';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  batchSequence: number;
}

export type MainToCoreMessage =
  | CoreRequest
  | CoreCancel
  | CoreEventAck;
export type CoreToMainMessage =
  | CoreSuccessResponse
  | CoreErrorResponse
  | CoreEventBatch;
/** RPC payload 由同版本 TypeScript 契约负责，传输层不施加内容上限。 */
