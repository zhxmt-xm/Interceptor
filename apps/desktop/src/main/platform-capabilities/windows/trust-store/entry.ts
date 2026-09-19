import { execFile } from 'node:child_process';

import type { CommandResult, CommandRunner, ElevatedRunner, TrustStoreServiceOptions } from '../../interfaces';
import { elevatedCommandRunner } from '../../internal/elevated-runner';

const windowsTrustCommandRunner: CommandRunner = {
  run(command, args) {
    return new Promise((resolve) => {
      execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
        const rawCode = (error as { code?: number | string } | null)?.code;
        const code = typeof rawCode === 'number' ? rawCode : error ? 1 : 0;
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      });
    });
  },
};

/** Preserves the Windows local-machine Root store commands and UAC behavior. */
export class WindowsTrustStoreService {
  private readonly runner: CommandRunner;
  private readonly elevatedRunner: ElevatedRunner;

  constructor(options: TrustStoreServiceOptions = {}) {
    this.runner = options.runner ?? windowsTrustCommandRunner;
    this.elevatedRunner = options.elevatedRunner ?? elevatedCommandRunner;
  }

  install(certPath: string): Promise<CommandResult> {
    return this.elevatedRunner.run(`certutil -addstore -f Root "${certPath}"`);
  }

  uninstall(sha1Thumbprint: string): Promise<CommandResult> {
    return this.elevatedRunner.run(`certutil -delstore Root ${sha1Thumbprint}`);
  }

  async isTrusted(sha1Thumbprint: string): Promise<boolean> {
    const result = await this.runner.run('certutil', ['-verifystore', 'Root', sha1Thumbprint]);
    return result.code === 0;
  }
}