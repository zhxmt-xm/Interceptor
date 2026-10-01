import type { CommandRunner, ElevatedRunner } from '../../interfaces';
import type { HelperService } from '../../helper/entry';

/** Public AppContainer identity; excludes local paths and capability SIDs. */
export interface AppContainerAccessInfo {
  appContainerSid: string;
  packageFamilyName: string | null;
  displayName: string | null;
  description: string | null;
  packageFullName: string | null;
  exempt: boolean;
}

export interface AppContainerAccessSnapshot {
  supported: boolean;
  containers: AppContainerAccessInfo[];
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
  readonly helperService: HelperService;
  readonly commandRunner?: CommandRunner;
  readonly elevatedRunner?: ElevatedRunner;
  readonly onChanged?: () => void;
}
