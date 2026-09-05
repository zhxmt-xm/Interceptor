export interface MainToolResultPayloads {
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

export type MainToolCommand = {
  [CommandType in keyof MainToolResultPayloads]: {
    readonly type: CommandType;
    readonly payload: Record<string, never>;
  };
}[keyof MainToolResultPayloads];

export type MainToolResultForCommand<Command extends MainToolCommand> = {
  readonly type: Command['type'];
  readonly payload: MainToolResultPayloads[Command['type']];
};