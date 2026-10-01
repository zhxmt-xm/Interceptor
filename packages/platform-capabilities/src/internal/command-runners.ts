import { execFile } from 'node:child_process';

import type { CommandRunner, ElevatedRunner, SudoExec } from '../interfaces';

let sudoExecPromise: Promise<SudoExec> | null = null;

/** Execute native helper commands without a shell. */
export const commandRunner: CommandRunner & ElevatedRunner = {
  run(command, args, input, options) {
    return new Promise((resolve) => {
      const child = execFile(
        command,
        [...args],
        { encoding: 'utf8', windowsHide: true, ...options },
        (error, stdout, stderr) => {
          const rawCode = (error as { code?: number | string } | null)?.code;
          resolve({
            code: typeof rawCode === 'number' ? rawCode : error ? 1 : 0,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
          });
        },
      );
      if (input !== undefined) child.stdin?.end(input);
    });
  },
  async runElevated(command) {
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