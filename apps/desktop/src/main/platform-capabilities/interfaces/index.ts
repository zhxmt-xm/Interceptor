import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import type { MacosHelperServiceClient } from '../macos/helper-client';

export type PlatformCapability =
  | 'system-proxy'
  | 'certificate-trust'
  | 'connection-owner'
  | 'application-icon'
  | 'app-container';

export interface PlatformCapabilitiesOptions {
  readonly platform?: NodeJS.Platform;
  readonly applicationEnvironment?: 'production' | 'development';
  readonly nativeDirectory: string;
  readonly userDataDirectory: string;
  readonly localAppDataDirectory?: string;
  readonly applicationPath?: string;
  readonly userId?: number;
}

export type MacosHelperDeploymentOptions = {
  readonly helperPath: string;
  readonly userId: number;
  readonly runner?: CommandRunner;
} & (
  | { readonly environment: 'production'; readonly applicationPath: string }
  | { readonly environment: 'development' }
);

export interface MacosApplicationIdentity {
  readonly bundleIdentifier: 'com.zhxmt.interceptor';
  readonly bundleVersion: string;
  readonly clientRequirement: string;
  readonly helperRequirement: string;
}

export interface MacosHelperServiceStatus {
  readonly processId: number;
  readonly privileged: boolean;
  readonly clientAuthorizedForWrites: boolean;
  readonly capabilities: readonly MacosHelperServiceOperation[];
}

export type MacosHelperServiceOperation = 'status' | 'system-proxy.read' | 'system-proxy.replace' | 'certificate.import' | 'certificate.remove';

export interface MacosCertificatePayload {
  readonly certificate: string;
  readonly sha256: string;
}

export type MacosHelperServiceRequest =
  | { readonly operation: 'status' | 'system-proxy.read' }
  | { readonly operation: 'certificate.import' | 'certificate.remove'; readonly parameters: MacosCertificatePayload }
  | {
    readonly operation: 'system-proxy.replace';
    readonly parameters: {
      readonly expectedSnapshot: MacosSystemProxySnapshot;
      readonly replacementSnapshot: MacosSystemProxySnapshot;
    };
  };

export type MacosHelperServiceErrorCode =
  | 'unavailable'
  | 'timeout'
  | 'invalid-response'
  | 'unauthorized-client'
  | 'unsupported-operation'
  | 'protocol-mismatch'
  | 'invalid-request'
  | 'authorization-required'
  | 'snapshot-conflict'
  | 'operation-failed'
  | 'verification-failed';

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
  run(command: string, args: string[], input?: string): Promise<CommandResult>;
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
  readonly macosHelperServiceClient?: MacosHelperServiceClient;
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
  recoverAfterCrash(): Promise<SystemProxyRestoreResult>;
  enable(host: string, port: number): Promise<SystemProxyStatus>;
  restore(): Promise<SystemProxyRestoreResult>;

  /** 接管前读到的用户原有上游代理；null 表示原本就直连。 */
  detectedUpstream(): UpstreamProxyConfig | null;
}

/** 崩溃安全的系统代理恢复日志记录。 */
export interface SystemProxyJournalRecord {
  /** 最小journal schema版本。 */
  readonly version: 1;
  /** App接管前的完整平台代理快照。 */
  readonly original: unknown;
  /** App接管时写入的完整平台代理快照。 */
  readonly owned: unknown;
}

/** 系统代理恢复日志存储抽象。 */
export interface SystemProxyJournalStore {
  read(): Promise<SystemProxyJournalRecord | null>;
  save(original: unknown, owned: unknown): Promise<void>;
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

/** One AppContainer returned by Windows Network Isolation APIs. */
export interface AppContainerInfo {
  readonly appContainerSid: string;
  readonly userSid: string | null;
  readonly packageFamilyName: string | null;
  readonly displayName: string | null;
  readonly description: string | null;
  readonly packageFullName: string | null;
  readonly workingDirectory: string | null;
  readonly binaries: readonly string[];
  readonly capabilities: readonly string[];
  readonly exempt: boolean;
}

/** Current AppContainer candidates and the complete loopback exemption SID set. */
export interface AppContainerSnapshot {
  readonly supported: boolean;
  readonly containers: readonly AppContainerInfo[];
  readonly exemptSids: readonly string[];
}

/** Injectable AppContainer service dependencies. */
export interface AppContainerServiceOptions {
  readonly platform?: NodeJS.Platform;
  readonly helperPath: string;
  readonly commandRunner?: CommandRunner;
  readonly elevatedRunner?: ElevatedRunner;
}
