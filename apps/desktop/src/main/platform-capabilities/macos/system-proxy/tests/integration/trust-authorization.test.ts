import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execute = promisify(execFile);

describe.runIf(process.platform === 'darwin')('macOS temporary certificate authorization', () => {
  let directory: string;
  let executable: string;

  beforeAll(async () => {
    directory = await mkdtemp('/private/tmp/interceptor-trust-authorization-');
    executable = path.join(directory, 'authorization-tests');
    await execute('xcrun', ['swiftc', '-parse-as-library', '-framework', 'Security', '-o', executable,
      path.resolve(import.meta.dirname, '../../../trust-store/native-authorization.swift'),
      path.join(import.meta.dirname, 'native-trust-authorization.swift'),
    ]);
  }, 30_000);

  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it.each([
    'success', 'operation-failure', 'operation-state-uncertain', 'modify-denied', 'modify-partial-failure',
    'restore-write-failure', 'restore-read-failure', 'external-change', 'backup-failure',
    'unsupported-policy', 'already-root', 'recover-temporary', 'recover-original',
    'recover-external', 'recover-write-failure',
  ])('preserves authorization rule ownership for %s', async (scenario) => {
    const { stdout } = await execute(executable, [scenario], { encoding: 'utf8' });
    expect(JSON.parse(stdout)).toEqual({ scenario, passed: true });
  });
});