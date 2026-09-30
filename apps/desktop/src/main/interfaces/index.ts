/**
 * Main 层的全部 interface / type 契约集中于此，按所属模块分区。
 *
 * 每个 Service/Runtime 实现文件只保留 class 本体；其 module-level 的 interface 与 type
 * 声明统一收纳到此处，避免散落在各文件顶部。
 */

import type {
  DiagnosticIngestPayload,
  MainToCoreMessage,
  UpstreamProxyConfig,
} from '@interceptor/core-protocol';

import type {
  CoreProcessStatus,
  UpdateStatus,
} from '../../shared/desktop-api';

// ─── core：CoreRuntime / CoreProcess 生命周期 ───

/** Main 侧对当前 CoreProcess（Proxy Core UtilityProcess）的窄句柄；隔离 Electron 类型。 */
export interface CoreProcessHandle {
  readonly pid: number | undefined;
  onSpawn(listener: () => void): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number) => void): void;
  onError(listener: (detail: string) => void): void;
  postMessage(message: unknown): void;
  kill(): boolean;
}

/** CoreRuntime 构造可选项：CoreProcess 生命周期超时、重启退避与时间源注入。 */
export interface CoreRuntimeOptions {
  coreProcessStartupTimeoutMs?: number;
  coreProcessRestartBaseDelayMs?: number;
  coreProcessRestartMaxDelayMs?: number;
  coreProcessShutdownTimeoutMs?: number;
  now?: () => number;
}

/** CoreProcess 状态变更监听器。 */
export type CoreProcessStatusListener = (status: CoreProcessStatus) => void;

/** CoreProcess 首次 ready 后、公开 running 前执行的初始化监听器。 */
export type CoreProcessReadyListener = () => void | Promise<void>;

/** CoreProcess 经 parentPort 上报的生命周期消息（收窄后使用）。 */
export type CoreProcessLifecycleMessage =
  | { type: 'ready'; pid: number; startedAt: string }
  | { type: 'heartbeat'; pid: number; timestamp: string }
  | { type: 'stopped'; pid: number; timestamp: string }
  | { type: 'fatal'; message: string };

// ─── core：CoreRpcClient（Main↔Core RPC 通道）───

/** 不泄漏 Electron 类型的 Core RPC 端口抽象。 */
export interface CoreRpcPort {
  onMessage(listener: (message: unknown) => void): () => void;
  onClose(listener: () => void): () => void;
  postMessage(message: MainToCoreMessage): void;
  start(): void;
  close(): void;
}

/** 单次 Core 请求的可选项：requestId / AbortSignal / 超时 / traceId。 */
export interface CoreRequestOptions {
  requestId?: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  traceId?: string;
}

/** Main 收到无法用于当前消息/请求的 Core RPC 信封时接收诊断原因。 */
export type CoreRpcProtocolIssueListener = (detail: string) => void;

/** CoreRpcClient 构造可选项：id 生成器与默认请求超时注入。 */
export interface CoreRpcClientOptions {
  createId?: () => string;
  requestTimeoutMs?: number;
}

// ─── diagnostics ───

/** MainDiagnostics 上报 payload 中由调用方提供的字段（去掉 process/level/phase）。 */
export type DiagnosticFields = Omit<
  DiagnosticIngestPayload,
  'process' | 'level' | 'phase'
>;

/** MainDiagnostics 的持久化投递出口（注入 CoreRuntime.ingestDiagnostic）。 */
export interface MainDiagnosticsTransport {
  ingestDiagnostic(payload: DiagnosticIngestPayload): Promise<void>;
}

// ─── updates ───

/** 用户触发的安装器下载器契约（GitHub Releases 检查/下载/打开）。 */
export interface UpdateService {
  start(): void;
  status(): UpdateStatus;
  check(): Promise<UpdateStatus> | UpdateStatus;
  download(): Promise<UpdateStatus>;
  openDownloaded(): Promise<void>;
  onStatusChange(listener: (status: UpdateStatus) => void): () => void;
  stop(): void;
}

/** GitHubReleaseUpdateService 的结构化诊断出口。 */
export interface GitHubReleaseUpdateDiagnostics {
  info(phase: string, fields?: GitHubReleaseUpdateDiagnosticFields): void;
  error(phase: string, fields?: GitHubReleaseUpdateDiagnosticFields): void;
}

/** GitHubReleaseUpdateService 诊断字段。 */
export interface GitHubReleaseUpdateDiagnosticFields {
  readonly errorCode?: string;
  readonly outcome?: 'success' | 'failed';
}

/** GitHubReleaseUpdateService 构造可选项。 */
export interface GitHubReleaseUpdateServiceOptions {
  readonly platform?: NodeJS.Platform;
  readonly architecture?: NodeJS.Architecture;
  readonly packaged: boolean;
  readonly currentVersion: string;
  readonly dataDirectory: string;
  readonly diagnostics: GitHubReleaseUpdateDiagnostics;
  readonly fetcher?: typeof fetch;
  readonly openPath: (filePath: string) => Promise<string>;
  readonly now?: () => Date;
}

/** 校验后的 GitHub Release 安装器资产。 */
export interface GitHubReleaseAsset {
  readonly id: number;
  readonly name: string;
  readonly url: string;
  readonly size: number;
  readonly sha256: string;
}

// ─── security ───

/** 可信 Renderer URL 判定选项。 */
export interface TrustedRendererUrlOptions {
  devServerUrl: string | undefined;
  packagedRendererUrl: string;
}
