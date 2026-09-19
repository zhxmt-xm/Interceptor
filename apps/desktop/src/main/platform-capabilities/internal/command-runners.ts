import { execFile } from 'node:child_process';

import type { SystemProxyCommandRunner } from '../interfaces';

/** Execute native helper commands without a shell. */
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