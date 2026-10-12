import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { WindowsSystemProxyService } from '../../entry';

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(process.cwd(), 'dist', 'system-proxy', 'wininet-proxy-helper.exe');

describe('Windows WPAD native process boundary', () => {
  it('discovers a PAC or reports native absence without changing WinINet', async () => {
    const before = await execFileAsync(helperPath, ['get'], { encoding: 'utf8', windowsHide: true });
    try {
      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile(helperPath, ['discover-wpad'], { encoding: 'utf8', windowsHide: true, timeout: 35_000 }, (error, stdout, stderr) => {
          const code = error ? error.code : 0;
          if (typeof code !== 'number') reject(error);
          else resolve({ code, stdout, stderr });
        });
      });
      if (result.code === 0) {
        const value: unknown = JSON.parse(result.stdout);
        expect(value).toEqual({ pacUrl: expect.any(String) });
        if (typeof value !== 'object' || value === null || !('pacUrl' in value) || typeof value.pacUrl !== 'string') {
          throw new Error('The native PAC URL is missing.');
        }
        expect(['http:', 'https:']).toContain(new URL(value.pacUrl).protocol);
        expect(result.stderr.trim()).toBe('');
      } else {
        expect(result.code).toBe(1);
        expect(JSON.parse(result.stderr)).toEqual({ win32Error: 12180 });
        expect(result.stdout.trim()).toBe('');
      }
    } finally {
      const after = await execFileAsync(helperPath, ['get'], { encoding: 'utf8', windowsHide: true });
      expect(JSON.parse(after.stdout)).toEqual(JSON.parse(before.stdout));
    }
  }, 40_000);

  it('ends a stalled native process before the 30-second discovery call rejects', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-wpad-timeout-'));
    const delayedHelperPath = path.join(directory, 'wpad-delayed-helper.exe');
    try {
      const frameworkRoot = path.join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET');
      const compiler = [
        path.join(frameworkRoot, 'Framework64', 'v4.0.30319', 'csc.exe'),
        path.join(frameworkRoot, 'Framework', 'v4.0.30319', 'csc.exe'),
      ].find(existsSync);
      if (!compiler) throw new Error('Windows .NET Framework C# compiler was not found.');
      await execFileAsync(compiler, [
        '/nologo', '/target:exe', '/platform:anycpu', `/out:${delayedHelperPath}`,
        path.join(import.meta.dirname, 'wpad-delayed-helper.cs'),
      ], { encoding: 'utf8', windowsHide: true });

      const windowsSystemProxyService = new WindowsSystemProxyService({ platform: 'win32', helperPath: delayedHelperPath });
      const started = performance.now();
      await expect(windowsSystemProxyService.discoverWpadPacUrl()).rejects.toThrow('timed out after 30000 ms');
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(29_000);
      expect(elapsed).toBeLessThan(35_000);
      const pid = Number(await readFile(path.join(directory, 'wpad-delayed-helper.pid'), 'utf8'));
      expect(Number.isInteger(pid) && pid > 0).toBe(true);
      expect(() => process.kill(pid, 0)).toThrowError(expect.objectContaining({ code: 'ESRCH' }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 50_000);
});
