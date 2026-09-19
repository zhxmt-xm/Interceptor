import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  process.cwd(),
  'dist/system-proxy/wininet-proxy-helper.exe',
);

describe.runIf(process.platform === 'win32')('WinINet proxy helper', () => {
  it('reads one complete current-user snapshot', async () => {
    const { stdout } = await execFileAsync(helperPath, ['get'], {
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(JSON.parse(stdout)).toEqual({
      flags: expect.any(Number),
      proxyEnabled: expect.any(Boolean),
      autoDetect: expect.any(Boolean),
      proxyServer: expect.toSatisfy((value) => value === null || typeof value === 'string'),
      bypassList: expect.toSatisfy((value) => value === null || typeof value === 'string'),
      pacUrl: expect.toSatisfy((value) => value === null || typeof value === 'string'),
    });
  });
});