import type { ElevatedRunner, SudoExec } from '../interfaces';

let sudoExecPromise: Promise<SudoExec> | null = null;

export const elevatedCommandRunner: ElevatedRunner = {
  async run(command) {
    sudoExecPromise ??= import('@vscode/sudo-prompt').then((module) => module.exec);
    const sudoExec = await sudoExecPromise;
    return new Promise((resolve) => {
      sudoExec(command, { name: 'Interceptor' }, (error, stdout, stderr) => {
        resolve({
          code: error ? 1 : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? error?.message ?? ''),
        });
      });
    });
  },
};