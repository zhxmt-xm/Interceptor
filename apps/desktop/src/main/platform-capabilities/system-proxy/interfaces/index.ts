import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import type { MacosHelperServiceClient } from '../../helper/macos/helper-client';

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
  status(canUpdateOwnership?: () => boolean): Promise<SystemProxyStatus>;
  recoverAfterCrash(): Promise<SystemProxyRestoreResult>;
  enable(host: string, port: number): Promise<SystemProxyStatus>;
  restore(): Promise<SystemProxyRestoreResult>;

  /** 接管前读到的用户原有上游代理；null 表示原本就直连。 */
  detectedUpstream(): UpstreamProxyConfig | null;
}

/** 崩溃安全的系统代理恢复日志记录。 */
export interface SystemProxyJournalRecord {
  /** App接管前的完整平台代理快照。 */
  readonly original: unknown;
  /** App接管时写入的完整平台代理快照。 */
  readonly owned: unknown;
  readonly effectiveProxies: Record<string, unknown>;
}

/** 系统代理恢复日志存储抽象。 */
export interface SystemProxyJournalStore {
  read(): Promise<SystemProxyJournalRecord | null>;
  save(original: unknown, owned: unknown, effectiveProxies: Record<string, unknown>): Promise<void>;
  clear(): Promise<void>;
}

/** Windows user-level crash journal schema. */
export interface WindowsSystemProxyJournalRecord {
  /** 最小Windows journal schema版本。 */
  readonly version: 1;
  /** 接管前的完整WinINet快照。 */
  readonly original: WinInetProxySettings;
  /** 接管时写入的完整WinINet快照。 */
  readonly owned: WinInetProxySettings;
}

/** Atomic Windows crash persistence for the single supported App instance. */
export interface WindowsSystemProxyJournalStore {
  read(): Promise<WindowsSystemProxyJournalRecord | null>;
  save(
    original: WinInetProxySettings,
    owned: WinInetProxySettings,
  ): Promise<void>;
  clear(): Promise<void>;
}

/** WinINet 代理设置快照。 */
export interface WinInetProxySettings {
  /** WinINet per-connection flags原值。 */
  readonly flags: number;
  /** 显式代理位是否启用。 */
  readonly proxyEnabled: boolean;
  /** Auto Detect位是否启用。 */
  readonly autoDetect: boolean;
  /** 显式代理服务器字符串。 */
  readonly proxyServer: string | null;
  /** WinINet bypass列表。 */
  readonly bypassList: string | null;
  /** PAC URL。 */
  readonly pacUrl: string | null;
}

/** WindowsSystemProxyService 构造可选项。 */
export interface WindowsSystemProxyServiceOptions {
  /** 测试可覆盖的运行平台。 */
  readonly platform?: NodeJS.Platform;
  /** WinINet native helper绝对路径。 */
  readonly helperPath: string;
  /** 测试可注入的helper执行边界。 */
  readonly runner?: SystemProxyCommandRunner;
  /** 可选的用户级crash journal。 */
  readonly journal?: WindowsSystemProxyJournalStore;
}

/** 单个 macOS 网络服务的代理设置。 */
export interface MacosNetworkServiceProxySettings {
  /** SystemConfiguration network service ID。 */
  readonly id: string;
  /** 用户可见的network service名称。 */
  readonly name: string;
  /** 该service的完整代理设置。 */
  readonly settings: Readonly<Record<string, unknown>>;
}

/** 全部活动 macOS 网络服务的代理快照。 */
export interface MacosSystemProxySnapshot {
  /** 当前Network Set中的全部活动service快照。 */
  readonly services: readonly MacosNetworkServiceProxySettings[];
}

/** MacosSystemProxyService 构造可选项。 */
export interface MacosSystemProxyServiceOptions {
  /** 测试可覆盖的运行平台。 */
  readonly platform?: NodeJS.Platform;
  readonly macosHelperServiceClient?: MacosHelperServiceClient;
  /** 可选的当前profile crash journal。 */
  readonly journal?: SystemProxyJournalStore;
}
