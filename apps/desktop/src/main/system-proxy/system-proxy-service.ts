import { execFile } from 'node:child_process';

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

export interface SystemProxyRestoreResult {
  readonly restored: boolean;
  readonly reason?: 'not-owned' | 'externally-modified';
  readonly status: SystemProxyStatus;
}

export interface SystemProxyCommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SystemProxyCommandRunner {
  run(command: string, args: readonly string[]): Promise<SystemProxyCommandResult>;
}

export interface SystemProxyService {
  supported(): boolean;
  status(): Promise<SystemProxyStatus>;
  enable(host: string, port: number): Promise<SystemProxyStatus>;
  restore(): Promise<SystemProxyRestoreResult>;
  repair(): Promise<SystemProxyRestoreResult>;
}

export const systemProxyCommandRunner: SystemProxyCommandRunner = {
  run(command, args) {
    return new Promise((resolve) => {
      execFile(
        command,
        [...args],
        { windowsHide: true },
        (error, stdout, stderr) => {
          const rawCode = (error as { code?: number | string } | null)?.code;
          resolve({
            code: typeof rawCode === 'number' ? rawCode : error ? 1 : 0,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
          });
        },
      );
    });
  },
};

export class SystemProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemProxyError';
  }
}