import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../constants';
import {
  CoreApplication,
  type CoreLifecycleMessage,
  type CoreParentPort,
  type ParentMessageEvent,
} from '../core-application';
import { CoreCommandError } from '../core-rpc-server';
import { WorkspaceService } from '../workspace/entry';

class FakeParentPort implements CoreParentPort {
  /** TLS settings command tests do not use lifecycle messages. */
  on(_event: 'message', _listener: (event: ParentMessageEvent) => void): void {}

  /** TLS settings command tests do not publish lifecycle messages. */
  postMessage(_message: CoreLifecycleMessage): void {}
}

describe('CoreApplication TLS passthrough settings commands', () => {
  let dataDirectory: string;
  let workspaceService: WorkspaceService;
  let coreApplication: CoreApplication;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'interceptor-tls-settings-'));
    initializeRuntime([`--data-dir=${dataDirectory}`]);
    workspaceService = new WorkspaceService();
    workspaceService.initialize();
    coreApplication = new CoreApplication(new FakeParentPort(), { workspaceService });
  });

  afterEach(async () => {
    workspaceService.dispose();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('gets, replaces, and persists normalized host patterns', async () => {
    await expect(coreApplication.executeCommand({
      type: 'tls-passthrough.get',
      payload: {},
    }, new AbortController().signal)).resolves.toEqual({
      type: 'tls-passthrough.settings',
      payload: {
        settings: { revision: 0, hosts: [] },
      },
    });

    await expect(coreApplication.executeCommand({
      type: 'tls-passthrough.replace',
      payload: {
        expectedRevision: 0,
        hosts: ['EXAMPLE.com', '*.MÜNCHEN.example'],
      },
    }, new AbortController().signal)).resolves.toEqual({
      type: 'tls-passthrough.revision',
      payload: { revision: 1 },
    });

    await expect(coreApplication.executeCommand({
      type: 'tls-passthrough.get',
      payload: {},
    }, new AbortController().signal)).resolves.toEqual({
      type: 'tls-passthrough.settings',
      payload: {
        settings: {
          revision: 1,
          hosts: ['example.com', '*.xn--mnchen-3ya.example'],
        },
      },
    });
  });

  it('maps a stale replacement to a retryable conflict', async () => {
    await coreApplication.executeCommand({
      type: 'tls-passthrough.replace',
      payload: { expectedRevision: 0, hosts: ['example.com'] },
    }, new AbortController().signal);

    await expect(coreApplication.executeCommand({
      type: 'tls-passthrough.replace',
      payload: { expectedRevision: 0, hosts: ['other.example'] },
    }, new AbortController().signal)).rejects.toMatchObject({
      detail: {
        code: 'conflict',
        retryable: true,
      },
    });
  });
});
