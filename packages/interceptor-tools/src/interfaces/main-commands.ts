import type { CollectionNode, DiagnosticLevel, DiagnosticOutcome, DiagnosticProcess, HarExportStartCommand, TransferJobSnapshot } from '@interceptor/core-protocol';

export interface MainToolResultPayloads {
  'settings.app-container.enable': MainToolResultPayloads['settings.app-containers.list'];
  'settings.app-container.disable': MainToolResultPayloads['settings.app-containers.list'];
  'settings.app-containers.enable-all': MainToolResultPayloads['settings.app-containers.list'];
  'settings.app-containers.disable-all': MainToolResultPayloads['settings.app-containers.list'];
  'settings.language.set': { language: string };
  'settings.theme.set': { theme: 'warm' | 'light' | 'ember' | 'dark' };
  'settings.export-privacy-defaults.set': { maskAuthorization: boolean; maskCookies: boolean; warnBeforeUnmasked: boolean };
  'capture.archive.export': { job: TransferJobSnapshot | null };
  'capture.archive.import': { job: TransferJobSnapshot | null };
  'capture.har.export': { job: TransferJobSnapshot | null };
  'capture.har.import': { job: TransferJobSnapshot | null };
  'capture.body.export': { job: TransferJobSnapshot | null };
  'diagnostics.export': { job: TransferJobSnapshot | null };
  'composer.collection.export': { exported: boolean };
  'composer.collection.import':
    | { imported: false }
    | { imported: true; revision: number; requestCount: number; folderCount: number; skippedCount: number };
  'composer.collection.replace': { revision: number };
  'rules.export': { exported: boolean };
  'rules.import':
    | { imported: false }
    | { imported: true; revision: number; ruleCount: number; folderCount: number; enabledCount: number; skippedCount: number };
  'settings.tls-insecure-hosts.replace': { hosts: string[] };
  'settings.tls-passthrough.replace':
    | { ok: true; settings: { revision: number; hosts: string[] } }
    | { ok: false; reason: 'conflict' | 'invalid' | 'error'; message: string };
  'settings.https-decryption.enable': MainToolResultPayloads['settings.certificate.status'] & { decrypting: boolean };
  'settings.https-decryption.disable': MainToolResultPayloads['settings.certificate.status'] & { decrypting: boolean };
  'settings.system-proxy.enable': MainToolResultPayloads['settings.system-proxy.status'];
  'settings.system-proxy.restore': {
    restored: boolean;
    reason?: 'not-owned' | 'externally-modified';
    status: MainToolResultPayloads['settings.system-proxy.status'];
  };
  'settings.core-process.status': {
    state: 'stopped' | 'starting' | 'running' | 'unresponsive' | 'restarting' | 'stopping';
    pid: number | null;
    restartCount: number;
    startedAt: string | null;
    lastHeartbeatAt: string | null;
    updatedAt: string;
  };
  'settings.system-proxy.status': {
    supported: boolean;
    enabled: boolean;
    owned: boolean;
    ownershipLost: boolean;
    autoDetect: boolean;
    upstreamReachable: boolean;
  };
  'settings.certificate.status': {
    present: boolean;
    trusted: boolean;
    supported: boolean;
    mitmEnabled: boolean;
    fingerprint: string | null;
    subject: string | null;
    createdAt: string | null;
    expiresAt: string | null;
  };
  'settings.app-containers.list': {
    supported: boolean;
    containers: {
      appContainerSid: string;
      packageFamilyName: string | null;
      displayName: string | null;
      exempt: boolean;
    }[];
  };
}

export interface MainToolCommandPayloads {
  'settings.app-container.enable': { appContainerSid: string };
  'settings.app-container.disable': { appContainerSid: string };
  'settings.language.set': { language: string };
  'settings.theme.set': MainToolResultPayloads['settings.theme.set'];
  'settings.export-privacy-defaults.set': MainToolResultPayloads['settings.export-privacy-defaults.set'];
  'capture.har.export': Omit<HarExportStartCommand['payload'], 'jobId' | 'filePath'>;
  'capture.body.export': { exchangeId: string; bodyId: string };
  'diagnostics.export': { process?: DiagnosticProcess; level?: DiagnosticLevel; outcome?: DiagnosticOutcome };
  'composer.collection.replace': { expectedRevision: number; nodes: CollectionNode[] };
  'settings.tls-insecure-hosts.replace': { hosts: string[] };
  'settings.tls-passthrough.replace': { expectedRevision: number; hosts: string[] };
}

export type MainToolPayloadForType<CommandType extends keyof MainToolResultPayloads> =
  CommandType extends keyof MainToolCommandPayloads
    ? MainToolCommandPayloads[CommandType]
    : Record<string, never>;

export interface MainToolCommand<CommandType extends keyof MainToolResultPayloads = keyof MainToolResultPayloads> {
  readonly type: CommandType;
  readonly payload: MainToolPayloadForType<CommandType>;
}

export type MainToolResultForCommand<Command extends MainToolCommand> = {
  readonly type: Command['type'];
  readonly payload: MainToolResultPayloads[Command['type']];
};