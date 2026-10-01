import type { SecureStore, CommandRunner, ElevatedRunner } from '../../interfaces';
import type { MacosHelperServiceClient } from '../../helper/macos/helper-client';
import type { PlatformOperation } from '@interceptor/tools';
import type { DiagnosticsRecorder } from '@interceptor/core-protocol';
import type { PlatformCoreRequest } from '../../interfaces';
import type { HelperService } from '../../helper/entry';

export type CertificateOperation = Extract<PlatformOperation, `certificate.${string}` | `https-decryption.${string}`>;

export interface CertificateOperationStatus {
  readonly operation: CertificateOperation;
  readonly state: 'running' | 'uncertain';
}

export type X509Module = typeof import('@peculiar/x509');

export interface CertificateServiceOptions extends TrustStoreServiceOptions {
  readonly dataDir: string;
  readonly secureStore: SecureStore;
  readonly requestCore: PlatformCoreRequest;
  readonly diagnostics: DiagnosticsRecorder;
  readonly helperService: HelperService;
  readonly now?: () => Date;
  readonly onChanged?: () => void;
}

export interface CaMaterial {
  readonly key: string;
  readonly cert: string;
}

export interface CertificateStatus {
  readonly present: boolean;
  readonly fingerprint: string | null;
  readonly subject: string | null;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
}

/** Public Root CA status; never contains private key material. */
export interface CertificateInfo {
  present: boolean;
  trusted: boolean;
  supported: boolean;
  mitmEnabled: boolean;
  fingerprint: string | null;
  subject: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  /** Public certificate PEM path, not a private key path. */
  path: string | null;
}

export interface CaMeta {
  fingerprint: string;
  sha1: string;
  subject: string;
  createdAt: string;
  expiresAt: string;
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
