import type { CommandResult, CommandRunner, ElevatedRunner } from '../../interfaces';
import type { TrustStoreServiceOptions } from '../interfaces';
import { commandRunner } from '../../internal/command-runners';

/** Preserves the Windows local-machine Root store commands and UAC behavior. */
export class WindowsTrustStoreService {
  private readonly runner: CommandRunner;
  private readonly elevatedRunner: ElevatedRunner;

  constructor(options: TrustStoreServiceOptions = {}) {
    this.runner = options.runner ?? commandRunner;
    this.elevatedRunner = options.elevatedRunner ?? commandRunner;
  }

  install(certPath: string): Promise<CommandResult> {
    return this.elevatedRunner.runElevated(`certutil -addstore -f Root "${certPath}"`);
  }

  uninstall(sha1Thumbprint: string): Promise<CommandResult> {
    return this.elevatedRunner.runElevated(`certutil -delstore Root ${sha1Thumbprint}`);
  }

  async isTrusted(sha1Thumbprint: string): Promise<boolean> {
    const result = await this.runner.run('certutil', ['-verifystore', 'Root', sha1Thumbprint]);
    return result.code === 0;
  }
}