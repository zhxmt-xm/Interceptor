import type { SecureStore, CommandRunner, ElevatedRunner } from '../../interfaces';
import type { MacosHelperServiceClient } from '../../helper/macos/helper-client';
import type { PlatformOperation } from '@interceptor/tools';
import type { CoreRuntime } from '../../../core/core-runtime';
import type { MainDiagnostics } from '../../../diagnostics/main-diagnostics';
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
  readonly coreRuntime: CoreRuntime;
  readonly diagnostics: MainDiagnostics;
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
