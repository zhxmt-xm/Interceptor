export interface MainToolResultPayloads {
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