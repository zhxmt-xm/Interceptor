/**
 * Main 层的全部 interface / type 契约集中于此，按所属模块分区。
 *
 * 每个 Service/Runtime 实现文件只保留 class 本体；其 module-level 的 interface 与 type
 * 声明统一收纳到此处，避免散落在各文件顶部。
 */

import type {
  DiagnosticIngestPayload,
  MainToCoreMessage,
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
  coreProcessHeartbeatTimeoutMs?: number;
  coreProcessRestartBaseDelayMs?: number;
  coreProcessRestartMaxDelayMs?: number;
  coreProcessShutdownTimeoutMs?: number;
  now?: () => number;
}

/** CoreProcess 状态变更监听器。 */
export type CoreProcessStatusListener = (status: CoreProcessStatus) => void;

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
  signal?: AbortSignal;
  timeoutMs?: number;
  traceId?: string;
}

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

// ─── certificates ───

/** 懒加载的 @peculiar/x509 模块类型。 */
export type X509Module = typeof import('@peculiar/x509');

/**
 * OS 级安全存储抽象（Electron `safeStorage`：Windows DPAPI / macOS Keychain）。
 * 抽成接口以便注入 fake 做单元测试；Root 私钥只经它加密后落盘。
 */
export interface SecureStore {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(data: Buffer): string;
}

/** CertificateService 构造可选项。 */
export interface CertificateServiceOptions {
  /** 证书目录（`<userData>/certificates`）；cert/加密 key/meta 都在其下。 */
  readonly dataDir: string;
  readonly secureStore: SecureStore;
  readonly now?: () => Date;
}

/**
 * CA 材料（PEM）。私钥只在 Main 内存与下发 Core 做 MITM 时出现，
 * 绝不进入 Renderer、日志、导出文件或遥测。
 */
export interface CaMaterial {
  readonly key: string;
  readonly cert: string;
}

/** 面向 Renderer 的 CA 状态；只含公开元数据，绝不含私钥。 */
export interface CertificateStatus {
  readonly present: boolean;
  readonly fingerprint: string | null;
  readonly subject: string | null;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
}

/** CA 公开元数据落盘结构。 */
export interface CaMeta {
  fingerprint: string;
  sha1: string;
  subject: string;
  createdAt: string;
  expiresAt: string;
}

// ─── certificates / trust-store ───

/** @vscode/sudo-prompt 的 exec 函数类型（懒加载）。 */
export type SudoExec = (typeof import('@vscode/sudo-prompt'))['exec'];

/** 平台信任库命令结果。 */
export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** 平台命令执行抽象；抽成接口以便注入 fake 做单元测试（不真实修改系统）。 */
export interface CommandRunner {
  run(command: string, args: string[]): Promise<CommandResult>;
}

/** 提权命令执行抽象；install/uninstall 需管理员/root 写机器级信任库。 */
export interface ElevatedRunner {
  run(command: string): Promise<CommandResult>;
}

/** TrustStoreService 构造可选项。 */
export interface TrustStoreServiceOptions {
  readonly platform?: NodeJS.Platform;
  readonly runner?: CommandRunner;
  readonly elevatedRunner?: ElevatedRunner;
  /** macOS 系统钥匙串路径；默认 /Library/Keychains/System.keychain（本地计算机级信任）。 */
  readonly systemKeychainPath?: string;
}

/** 平台信任库命令（command + args）。 */
export interface PlatformCommand {
  readonly command: string;
  readonly args: string[];
}

// ─── system-proxy ───

/** 当前系统代理状态快照。 */
export interface SystemProxyStatus {
  readonly supported: boolean;
  readonly enabled: boolean;
  readonly owned: boolean;
  readonly ownershipLost: boolean;
  readonly proxyServer: string | null;
  readonly bypassList: string | null;
  readonly pacUrl: string | null;
  readonly autoDetect: boolean;
}

/** 系统代理恢复结果。 */
export interface SystemProxyRestoreResult {
  readonly restored: boolean;
  readonly reason?: 'not-owned' | 'externally-modified';
  readonly status: SystemProxyStatus;
}

/** 系统代理 helper 命令结果。 */
export interface SystemProxyCommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** 系统代理 helper 命令执行抽象。 */
export interface SystemProxyCommandRunner {
  run(command: string, args: readonly string[]): Promise<SystemProxyCommandResult>;
}

/** 平台系统代理 Service 契约（Windows/macOS 各一实现）。 */
export interface SystemProxyService {
  supported(): boolean;
  status(): Promise<SystemProxyStatus>;
  enable(host: string, port: number): Promise<SystemProxyStatus>;
  restore(): Promise<SystemProxyRestoreResult>;
  repair(): Promise<SystemProxyRestoreResult>;
}

/** 系统代理归属日志目标平台。 */
export type SystemProxyPlatform = 'win32' | 'darwin';

/** 系统代理归属日志阶段。 */
export type SystemProxyJournalPhase = 'preparing' | 'owned';

/** 崩溃安全的系统代理归属日志记录。 */
export interface SystemProxyJournalRecord {
  readonly version: 1;
  readonly platform: SystemProxyPlatform;
  readonly phase: SystemProxyJournalPhase;
  readonly original: unknown;
  readonly owned: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 系统代理归属日志存储抽象。 */
export interface SystemProxyJournalStore {
  read(): Promise<SystemProxyJournalRecord | null>;
  begin(
    platform: SystemProxyPlatform,
    original: unknown,
    owned: unknown,
  ): Promise<void>;
  markOwned(platform: SystemProxyPlatform): Promise<void>;
  clear(): Promise<void>;
}

/** WinINet 代理设置快照。 */
export interface WinInetProxySettings {
  readonly flags: number;
  readonly proxyEnabled: boolean;
  readonly autoDetect: boolean;
  readonly proxyServer: string | null;
  readonly bypassList: string | null;
  readonly pacUrl: string | null;
}

/** WindowsSystemProxyService 构造可选项。 */
export interface WindowsSystemProxyServiceOptions {
  readonly platform?: NodeJS.Platform;
  readonly helperPath: string;
  readonly runner?: SystemProxyCommandRunner;
  readonly journal?: SystemProxyJournalStore;
}

/** 单个 macOS 网络服务的代理设置。 */
export interface MacosNetworkServiceProxySettings {
  readonly id: string;
  readonly name: string;
  readonly settings: Readonly<Record<string, unknown>>;
}

/** 全部活动 macOS 网络服务的代理快照。 */
export interface MacosSystemProxySnapshot {
  readonly services: readonly MacosNetworkServiceProxySettings[];
}

/** MacosSystemProxyService 构造可选项。 */
export interface MacosSystemProxyServiceOptions {
  readonly platform?: NodeJS.Platform;
  readonly helperPath: string;
  readonly runner?: SystemProxyCommandRunner;
  readonly journal?: SystemProxyJournalStore;
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
