import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentRuntime,
  type AgentProviderDraft,
  type AgentSecureStore,
} from '../../src';

const renameProbe = vi.hoisted(() => ({
  enabled: false,
  calls: 0,
  active: 0,
  maximumActive: 0,
}));

const readFileProbe = vi.hoisted(() => ({
  error: null as Error | null,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    async readFile(...arguments_: Parameters<typeof actual.readFile>) {
      if (readFileProbe.error !== null) {
        const error = readFileProbe.error;
        readFileProbe.error = null;
        throw error;
      }
      return actual.readFile(...arguments_);
    },
    async rename(...arguments_: Parameters<typeof actual.rename>): Promise<void> {
      if (!renameProbe.enabled) {
        await actual.rename(...arguments_);
        return;
      }
      renameProbe.calls += 1;
      renameProbe.active += 1;
      renameProbe.maximumActive = Math.max(renameProbe.maximumActive, renameProbe.active);
      if (renameProbe.calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      try {
        await actual.rename(...arguments_);
      } finally {
        renameProbe.active -= 1;
      }
    },
  };
});

class FakeAgentSecureStore implements AgentSecureStore {
  available = true;
  failNextDecryptAsUnavailable = false;
  failNextDecrypt: Error | null = null;
  nextEncryptedSize: number | null = null;

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  encryptString(plaintext: string): Buffer {
    if (this.nextEncryptedSize !== null) {
      const size = this.nextEncryptedSize;
      this.nextEncryptedSize = null;
      return Buffer.alloc(size, 0x61);
    }
    return Buffer.from(Buffer.from(plaintext, 'utf8').toString('base64'), 'utf8');
  }

  decryptString(data: Buffer): string {
    if (this.failNextDecrypt !== null) {
      const error = this.failNextDecrypt;
      this.failNextDecrypt = null;
      throw error;
    }
    if (this.failNextDecryptAsUnavailable) {
      this.failNextDecryptAsUnavailable = false;
      this.available = false;
      throw new Error('secure storage became unavailable');
    }
    return Buffer.from(data.toString('utf8'), 'base64').toString('utf8');
  }
}

interface CapturedModelRequest {
  readonly authorization: string | null;
  readonly body: Record<string, unknown>;
  readonly url: string;
}

class ProviderFixture {
  readonly secureStore = new FakeAgentSecureStore();
  readonly requests: CapturedModelRequest[] = [];
  readonly fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    this.requests.push({
      authorization: headers.get('authorization'),
      body,
      url: String(input),
    });
    return modelTestResponse();
  });
  private nextId = 1;
  readonly runtimes: AgentRuntime[] = [];

  constructor(readonly root: string) {}

  createRuntime(options: { readonly providerConnectionTestTimeoutMs?: number } = {}): AgentRuntime {
    const runtimeOptions = {
      dataDirectory: this.root,
      fetcher: this.fetcher as typeof fetch,
      secureStore: this.secureStore,
      tools: [],
      createId: () => `id-${this.nextId++}`,
      ...options,
    };
    const agentRuntime = new AgentRuntime(runtimeOptions);
    this.runtimes.push(agentRuntime);
    return agentRuntime;
  }
}

const roots: string[] = [];
const fixtures: ProviderFixture[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  renameProbe.enabled = false;
  renameProbe.calls = 0;
  renameProbe.active = 0;
  renameProbe.maximumActive = 0;
  readFileProbe.error = null;
  await Promise.all(fixtures.splice(0).flatMap((fixture) =>
    fixture.runtimes.map((agentRuntime) => agentRuntime.stop().catch(() => undefined))));
  await Promise.all(roots.map(async (root) => {
    await import('node:fs/promises').then(({ rm }) => rm(root, { force: true, recursive: true }));
  }));
  roots.length = 0;
});

describe('AgentRuntime Provider registry', () => {
  it('tests, encrypts and exposes only a redacted Custom Provider snapshot', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    expect(agentRuntime.getModels()).toEqual({ defaultProviderId: null, models: [] });
    const verification = await agentRuntime.testProviderConnection(customDraft({
      credential: { action: 'replace', apiKey: 'custom-secret-9K4Q' },
    }));

    expect(fixture.requests).toEqual([{
      authorization: 'Bearer custom-secret-9K4Q',
      body: expect.objectContaining({ model: 'lab-model', stream: true, max_tokens: 8 }),
      url: 'http://127.0.0.1:43123/v1/chat/completions',
    }]);
    expect(JSON.stringify(verification)).not.toContain('custom-secret-9K4Q');

    const snapshot = await agentRuntime.saveVerifiedProvider(verification.verificationId);
    expect(snapshot).toEqual({
      defaultProviderId: 'id-1',
      models: [{
        providerId: 'id-1',
        kind: 'openai-compatible',
        profileName: 'Local lab',
        baseUrl: 'http://127.0.0.1:43123/v1',
        modelId: 'lab-model',
        contextWindowTokens: 131_072,
        maximumOutputTokens: 8_192,
        credentialConfigured: true,
        credentialLastFour: '9K4Q',
        isDefault: true,
      }],
    });
    const encrypted = await readFile(path.join(fixture.root, 'providers.enc'));
    expect(encrypted.toString('utf8')).not.toContain('custom-secret-9K4Q');
    expect(encrypted.toString('utf8')).not.toContain('lab-model');
  });

  it('omits Authorization for a Custom Provider with an explicit removed credential', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    const verification = await agentRuntime.testProviderConnection(customDraft({
      credential: { action: 'remove' },
    }));
    await agentRuntime.saveVerifiedProvider(verification.verificationId);

    expect(fixture.requests[0]?.authorization).toBeNull();
    expect(agentRuntime.getModels().models[0]).toMatchObject({
      credentialConfigured: false,
      credentialLastFour: null,
    });
  });

  it('makes a verification single-use and saves exactly the tested draft', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    const verification = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(verification.verificationId);

    await expect(agentRuntime.saveVerifiedProvider(verification.verificationId))
      .rejects.toThrow('Provider verification is missing or expired.');
    expect(agentRuntime.getModels().models[0]?.modelId).toBe('lab-model');
  });

  it('invalidates an older verification when a newer draft is tested', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    const older = await agentRuntime.testProviderConnection(customDraft());
    const newer = await agentRuntime.testProviderConnection(customDraft({
      modelId: 'newer-model',
    }));

    await expect(agentRuntime.saveVerifiedProvider(older.verificationId))
      .rejects.toThrow('Provider verification is missing or expired.');
    await agentRuntime.saveVerifiedProvider(newer.verificationId);
    expect(agentRuntime.getModels().models[0]?.modelId).toBe('newer-model');
  });

  it('invalidates an older verification when a newer connection test fails', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    const older = await agentRuntime.testProviderConnection(customDraft());
    fixture.fetcher.mockImplementationOnce(async () => new Response('', { status: 401 }));

    await expect(agentRuntime.testProviderConnection(customDraft({ modelId: 'rejected-model' })))
      .rejects.toThrow();
    await expect(agentRuntime.saveVerifiedProvider(older.verificationId))
      .rejects.toThrow('Provider verification is missing or expired.');
  });

  it('rejects plaintext HTTP endpoints outside the local machine before network access', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    await expect(agentRuntime.testProviderConnection(customDraft({
      baseUrl: 'http://192.0.2.10:43123/v1',
    }))).rejects.toThrow('HTTP endpoints are only allowed on the local machine.');
    expect(fixture.requests).toEqual([]);
  });

  it('aborts an in-flight connection test when Runtime stops', async () => {
    const fixture = await createFixture();
    let abortCleanupFinished = false;
    fixture.fetcher.mockImplementationOnce(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        setTimeout(() => {
          abortCleanupFinished = true;
          reject(init.signal?.reason);
        }, 20);
      }, { once: true });
    }));
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    const testing = agentRuntime.testProviderConnection(customDraft());
    await vi.waitFor(() => expect(fixture.fetcher).toHaveBeenCalledOnce());
    await agentRuntime.stop();
    expect(abortCleanupFinished).toBe(true);
    const outcome = await Promise.race([
      testing.then(() => 'resolved', () => 'rejected'),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 50)),
    ]);

    expect(outcome).toBe('rejected');
  });

  it('rejects new Provider commands after Runtime stops', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await agentRuntime.stop();

    await expect(agentRuntime.testProviderConnection(customDraft()))
      .rejects.toThrow('Agent Provider registry is not running.');
    expect(fixture.requests).toEqual([]);
  });

  it('times out an in-flight connection test', async () => {
    const fixture = await createFixture();
    fixture.fetcher.mockImplementationOnce(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const agentRuntime = fixture.createRuntime({ providerConnectionTestTimeoutMs: 10 });
    await agentRuntime.start();

    const testing = agentRuntime.testProviderConnection(customDraft());
    const outcome = await Promise.race([
      testing.then(() => 'resolved', () => 'rejected'),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
    ]);

    expect(outcome).toBe('rejected');
  });

  it('runs through a saved Provider and preserves its identity in the result', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const verification = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(verification.verificationId);
    fixture.requests.length = 0;

    const result = await agentRuntime.run({
      providerId: 'id-1',
      messages: [{ role: 'user', content: 'Say OK.' }],
    });

    expect(result).toMatchObject({
      outcome: 'completed',
      output: 'OK',
      providerId: 'id-1',
    });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]?.body).toMatchObject({ model: 'lab-model' });
  });

  it('keeps stable order while editing, switching default and removing models', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    const first = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(first.verificationId);
    const second = await agentRuntime.testProviderConnection(customDraft({
      profileName: 'No-key model',
      modelId: 'second-model',
      credential: { action: 'remove' },
    }));
    await agentRuntime.saveVerifiedProvider(second.verificationId);
    const [firstModel, secondModel] = agentRuntime.getModels().models;
    expect([firstModel?.providerId, secondModel?.providerId]).toEqual(['id-1', 'id-3']);

    expect(await agentRuntime.setDefaultModel('id-3')).toMatchObject({
      defaultProviderId: 'id-3',
      models: [
        { providerId: 'id-1', isDefault: false },
        { providerId: 'id-3', isDefault: true },
      ],
    });
    const edited = await agentRuntime.testProviderConnection(customDraft({
      providerId: 'id-1',
      modelId: 'edited-model',
      credential: { action: 'keep' },
    }));
    await agentRuntime.saveVerifiedProvider(edited.verificationId);
    expect(agentRuntime.getModels().models.map((model) => model.providerId))
      .toEqual(['id-1', 'id-3']);
    expect(agentRuntime.getModels().models[0]).toMatchObject({
      modelId: 'edited-model',
      credentialLastFour: '9K4Q',
    });

    expect(await agentRuntime.removeProvider('id-3')).toMatchObject({
      defaultProviderId: 'id-1',
      models: [{ providerId: 'id-1', isDefault: true }],
    });
    expect(await agentRuntime.removeProvider('id-1')).toEqual({
      defaultProviderId: null,
      models: [],
    });
  });

  it('rejects a stale edit verification after its Provider is removed', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const created = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(created.verificationId);
    const providerId = agentRuntime.getModels().models[0]!.providerId;
    const edited = await agentRuntime.testProviderConnection(customDraft({
      providerId,
      modelId: 'stale-edit',
      credential: { action: 'keep' },
    }));

    await agentRuntime.removeProvider(providerId);
    await expect(agentRuntime.saveVerifiedProvider(edited.verificationId))
      .rejects.toThrow('Provider verification is missing or expired.');
    expect(agentRuntime.getModels()).toEqual({ defaultProviderId: null, models: [] });
  });

  it('serializes persisted mutations so removed Providers cannot reappear after restart', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const first = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(first.verificationId);
    const second = await agentRuntime.testProviderConnection(customDraft({
      profileName: 'Second',
      modelId: 'second-model',
      credential: { action: 'remove' },
    }));
    await agentRuntime.saveVerifiedProvider(second.verificationId);
    const secondProviderId = agentRuntime.getModels().models[1]!.providerId;
    renameProbe.enabled = true;

    await Promise.all([
      agentRuntime.setDefaultModel(secondProviderId),
      agentRuntime.removeProvider(secondProviderId),
    ]);

    expect(renameProbe.maximumActive).toBe(1);
    expect(agentRuntime.getModels()).toMatchObject({
      defaultProviderId: 'id-1',
      models: [{ providerId: 'id-1', isDefault: true }],
    });
    const restoredRuntime = fixture.createRuntime();
    await restoredRuntime.start();
    expect(restoredRuntime.getModels()).toMatchObject({
      defaultProviderId: 'id-1',
      models: [{ providerId: 'id-1', isDefault: true }],
    });
  });

  it('restores providers, order and default without issuing a model request', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const first = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(first.verificationId);
    const second = await agentRuntime.testProviderConnection(customDraft({
      profileName: 'Second',
      modelId: 'second-model',
      credential: { action: 'remove' },
    }));
    await agentRuntime.saveVerifiedProvider(second.verificationId);
    await agentRuntime.setDefaultModel('id-3');
    fixture.requests.length = 0;

    const restored = fixture.createRuntime();
    await restored.start();

    expect(restored.getModels()).toMatchObject({
      defaultProviderId: 'id-3',
      models: [
        { providerId: 'id-1', credentialLastFour: '9K4Q' },
        { providerId: 'id-3', credentialConfigured: false, isDefault: true },
      ],
    });
    expect(fixture.requests).toEqual([]);
  });

  it('rejects connection tests before network access when secure storage is unavailable', async () => {
    const fixture = await createFixture();
    fixture.secureStore.available = false;
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();

    await expect(agentRuntime.testProviderConnection(customDraft()))
      .rejects.toThrow('OS secure storage is unavailable.');
    expect(fixture.requests).toEqual([]);
    await expect(access(path.join(fixture.root, 'providers.enc')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves an existing encrypted record while secure storage is unavailable', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const verification = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(verification.verificationId);
    const credentialPath = path.join(fixture.root, 'providers.enc');

    fixture.secureStore.available = false;
    const unavailableRuntime = fixture.createRuntime();
    await unavailableRuntime.start();

    await expect(access(credentialPath)).resolves.toBeUndefined();
    expect(unavailableRuntime.getModels()).toEqual({ defaultProviderId: null, models: [] });

    fixture.secureStore.available = true;
    await expect(unavailableRuntime.testProviderConnection(customDraft({ modelId: 'must-not-overwrite' })))
      .rejects.toThrow('Restart Agent before changing Providers.');
    await expect(access(credentialPath)).resolves.toBeUndefined();
    await unavailableRuntime.start();
    expect(unavailableRuntime.getModels().models).toHaveLength(1);

    const restoredRuntime = fixture.createRuntime();
    await restoredRuntime.start();
    expect(restoredRuntime.getModels().models).toHaveLength(1);
  });

  it('preserves an encrypted record when secure storage becomes unavailable during decryption', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const verification = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(verification.verificationId);
    const credentialPath = path.join(fixture.root, 'providers.enc');

    fixture.secureStore.failNextDecryptAsUnavailable = true;
    const unavailableRuntime = fixture.createRuntime();
    await unavailableRuntime.start();

    await expect(access(credentialPath)).resolves.toBeUndefined();
    fixture.secureStore.available = true;
    await unavailableRuntime.start();
    expect(unavailableRuntime.getModels().models).toHaveLength(1);
  });

  it('preserves an encrypted record when a transient file read fails', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const verification = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(verification.verificationId);
    const credentialPath = path.join(fixture.root, 'providers.enc');
    const readError = Object.assign(new Error('temporary read failure'), { code: 'EIO' });
    readFileProbe.error = readError;
    const unavailableRuntime = fixture.createRuntime();

    await expect(unavailableRuntime.start()).rejects.toBe(readError);
    await expect(access(credentialPath)).resolves.toBeUndefined();
  });

  it('preserves an encrypted record when decryption fails without a corruption classification', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const verification = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(verification.verificationId);
    const credentialPath = path.join(fixture.root, 'providers.enc');
    const decryptError = new Error('temporary decrypt failure');
    fixture.secureStore.failNextDecrypt = decryptError;
    const unavailableRuntime = fixture.createRuntime();

    await expect(unavailableRuntime.start()).rejects.toBe(decryptError);
    await expect(access(credentialPath)).resolves.toBeUndefined();
  });

  it('rejects an encrypted record above the read limit without replacing the current file', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const first = await agentRuntime.testProviderConnection(customDraft());
    await agentRuntime.saveVerifiedProvider(first.verificationId);
    const credentialPath = path.join(fixture.root, 'providers.enc');
    const previousEncrypted = await readFile(credentialPath);
    const providerId = agentRuntime.getModels().models[0]!.providerId;
    const edited = await agentRuntime.testProviderConnection(customDraft({
      providerId,
      modelId: 'oversized-model',
      credential: { action: 'keep' },
    }));
    fixture.secureStore.nextEncryptedSize = 256 * 1024 + 1;

    await expect(agentRuntime.saveVerifiedProvider(edited.verificationId))
      .rejects.toThrow('Agent Provider record exceeds the encrypted size limit.');
    expect(await readFile(credentialPath)).toEqual(previousEncrypted);
  });

  it('clears malformed, oversized and symbolic-link Provider records on start', async () => {
    for (const arrange of [
      async (credentialPath: string, fixture: ProviderFixture) => {
        await writeFile(credentialPath, fixture.secureStore.encryptString('{"version":99}'));
      },
      async (credentialPath: string) => {
        await writeFile(credentialPath, Buffer.alloc(256 * 1024 + 1));
      },
      async (credentialPath: string, fixture: ProviderFixture) => {
        const target = path.join(fixture.root, 'target-directory');
        await mkdir(target);
        await symlink(target, credentialPath, 'junction');
      },
      async (credentialPath: string, fixture: ProviderFixture) => {
        await writeFile(credentialPath, fixture.secureStore.encryptString(JSON.stringify({
          version: 1,
          defaultProviderId: 'remote-http',
          providers: [{
            providerId: 'remote-http',
            kind: 'openai-compatible',
            profileName: 'Remote plaintext',
            baseUrl: 'http://192.0.2.10/v1',
            modelId: 'remote-model',
            contextWindowTokens: 8_192,
            maximumOutputTokens: 1_024,
            apiKey: 'plaintext-secret',
          }],
        })));
      },
    ]) {
      const fixture = await createFixture();
      const credentialPath = path.join(fixture.root, 'providers.enc');
      await arrange(credentialPath, fixture);
      const agentRuntime = fixture.createRuntime();

      await agentRuntime.start();

      expect(agentRuntime.getModels()).toEqual({ defaultProviderId: null, models: [] });
      await expect(access(credentialPath)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
});

async function createFixture(): Promise<ProviderFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'interceptor-agent-provider-'));
  roots.push(root);
  const fixture = new ProviderFixture(root);
  fixtures.push(fixture);
  return fixture;
}

function customDraft(overrides: Partial<AgentProviderDraft> = {}): AgentProviderDraft {
  return {
    providerId: null,
    kind: 'openai-compatible',
    profileName: 'Local lab',
    baseUrl: 'http://127.0.0.1:43123/v1',
    modelId: 'lab-model',
    contextWindowTokens: 131_072,
    maximumOutputTokens: 8_192,
    credential: { action: 'replace', apiKey: 'custom-secret-9K4Q' },
    ...overrides,
  } as AgentProviderDraft;
}

function modelTestResponse(): Response {
  const body = [
    'data: {"choices":[{"delta":{"content":"OK"}}]}',
    '',
    'data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":2}}',
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
    status: 200,
  });
}
