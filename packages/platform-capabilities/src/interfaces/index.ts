import type { CoreCommand, CoreProcessState, CoreResultForCommand, DiagnosticsRecorder } from '@interceptor/core-protocol';
import type { ClientAppIcon } from '../client-app/interfaces';
import type { SystemProxyStatus } from '../system-proxy/interfaces/public';
import type { PlatformOperation } from '@interceptor/tools';
import type { HelperServiceOptions } from '../helper/interfaces';

export interface SecureStore {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(data: Buffer): string;
}

export type PlatformCapability =
  | 'system-proxy'
  | 'certificates'
  | 'client-app'
  | 'app-container';

export type PlatformCoreCommand = Extract<CoreCommand, {
  type: 'proxy.status' | 'proxy.setUpstream' | 'tls.getDecryptionPreference'
    | 'tls.saveDecryptionPreference' | 'tls.useCertificate' | 'tls.startDecryption' | 'tls.stopDecryption'
    | 'upstream.getSettings' | 'upstream.applySettings';
}>;

export type PlatformCoreRequest = <Command extends PlatformCoreCommand>(
  command: Command,
) => Promise<CoreResultForCommand<Command>>;

export interface PlatformCapabilitiesOptions extends HelperServiceOptions {
  readonly secureStore: SecureStore;
  readonly requestCore: PlatformCoreRequest;
  readonly getCoreProcessState: () => CoreProcessState;
  readonly diagnostics: DiagnosticsRecorder;
  readonly onCertificateChanged?: () => void;
  readonly onAppContainersChanged?: () => void;
  readonly onClientAppIconsChanged?: (icons: ClientAppIcon[]) => void;
  readonly onSystemProxyChanged?: (status: SystemProxyStatus) => void;
  readonly onUpstreamSettingsChanged?: () => void;
  readonly onStartupStageChanged?: (stage: 'platform' | 'certificate') => void;
  readonly onError?: (operation: PlatformOperation, error: unknown) => void;
  readonly userDataDirectory: string;
  readonly localAppDataDirectory?: string;
}

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
  run(command: string, args: readonly string[], input?: string, options?: { readonly maxBuffer?: number }): Promise<CommandResult>;
}

/** 提权命令执行抽象；install/uninstall 需管理员/root 写机器级信任库。 */
export interface ElevatedRunner {
  runElevated(command: string): Promise<CommandResult>;
}

/** 平台信任库命令（command + args）。 */
export interface PlatformCommand {
  readonly command: string;
  readonly args: string[];
}
