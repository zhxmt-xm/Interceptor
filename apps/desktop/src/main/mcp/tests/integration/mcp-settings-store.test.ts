import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { SecureStore } from '@interceptor/platform-capabilities/interfaces/index';
import { McpSettingsStore } from '../../internal/settings-store';

/** Reversible encryption fake that lets tests assert plaintext never reaches disk. */
class FakeSecureStore implements SecureStore {
  /** Whether the OS-backed encryption boundary is available. */
  available = true;

  /** Reports the configured availability. */
  isEncryptionAvailable(): boolean {
    return this.available;
  }

  /** Encodes plaintext so the persisted file cannot contain secrets verbatim. */
  encryptString(plaintext: string): Buffer {
    return Buffer.from(Buffer.from(plaintext, 'utf8').toString('base64'), 'utf8');
  }

  /** Decodes the reversible test representation. */
  decryptString(data: Buffer): string {
    return Buffer.from(data.toString('utf8'), 'base64').toString('utf8');
  }
}

describe('McpSettingsStore', () => {
  /** Temporary roots removed after each test. */
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('starts disabled without creating a persistence file', async () => {
    const fixture = await createFixture(roots);

    expect(fixture.store.snapshot()).toEqual({
      enabled: false,
      endpointPort: null,
      clients: [],
    });
    expect(fixture.store.registrations()).toEqual([]);
    await expect(access(fixture.settingsPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('encrypts endpoint, Client mode and stable credentials across app restarts', async () => {
    const fixture = await createFixture(roots);

    await fixture.store.enableServer(43_127);
    const registration = await fixture.store.createClient('VS Code');
    await fixture.store.automaticallyExecuteClientTools(registration.clientId);

    const encrypted = await readFile(fixture.settingsPath);
    expect(encrypted.toString('utf8')).not.toContain(registration.token);
    expect(encrypted.toString('utf8')).not.toContain('VS Code');

    const restored = new McpSettingsStore({
      dataDirectory: fixture.root,
      secureStore: fixture.secureStore,
    });
    await restored.start();

    expect(restored.snapshot()).toEqual({
      enabled: true,
      endpointPort: 43_127,
      clients: [{
        clientId: registration.clientId,
        label: 'VS Code',
        executionMode: 'auto',
      }],
    });
    expect(restored.registrations()).toEqual([registration]);
  });

  it('never rotates a token during server disable, enable or restart', async () => {
    const fixture = await createFixture(roots);
    await fixture.store.enableServer(43_127);
    const registration = await fixture.store.createClient('VS Code');

    await fixture.store.disableServer();
    await fixture.store.enableServer(43_127);
    expect(fixture.store.registrations()).toEqual([registration]);

    const restored = new McpSettingsStore({
      dataDirectory: fixture.root,
      secureStore: fixture.secureStore,
    });
    await restored.start();
    expect(restored.registrations()).toEqual([registration]);
  });

  it('rotates only the explicitly regenerated Client credential', async () => {
    const fixture = await createFixture(roots);
    const first = await fixture.store.createClient('VS Code');
    const second = await fixture.store.createClient('Other editor');

    const regenerated = await fixture.store.regenerateClientCredential(first.clientId);

    expect(regenerated.clientId).toBe(first.clientId);
    expect(regenerated.token).not.toBe(first.token);
    expect(fixture.store.registrations()).toEqual([regenerated, second]);
  });

  it('serializes independent mutations without dropping Clients or modes', async () => {
    const fixture = await createFixture(roots);
    const first = await fixture.store.createClient('VS Code');
    const second = await fixture.store.createClient('Other editor');

    await Promise.all([
      fixture.store.automaticallyExecuteClientTools(first.clientId),
      fixture.store.requireClientApproval(second.clientId),
      fixture.store.enableServer(43_127),
    ]);

    expect(fixture.store.snapshot()).toMatchObject({
      enabled: true,
      endpointPort: 43_127,
      clients: [
        { clientId: first.clientId, executionMode: 'auto' },
        { clientId: second.clientId, executionMode: 'ask' },
      ],
    });
  });

  it('rejects invalid encrypted records without replacing them with a new baseline', async () => {
    const fixture = await createFixture(roots);
    await writeFile(
      fixture.settingsPath,
      fixture.secureStore.encryptString(JSON.stringify({
        version: 1,
        enabled: true,
        endpointPort: 43_127,
        clients: [],
      })),
    );
    const invalid = new McpSettingsStore({
      dataDirectory: fixture.root,
      secureStore: fixture.secureStore,
    });

    await expect(invalid.start()).rejects.toThrow(/fields are invalid/i);
    await expect(readFile(fixture.settingsPath)).resolves.toEqual(
      fixture.secureStore.encryptString(JSON.stringify({
        version: 1,
        enabled: true,
        endpointPort: 43_127,
        clients: [],
      })),
    );
  });

  it('refuses mutations while secure storage is unavailable', async () => {
    const fixture = await createFixture(roots);
    fixture.secureStore.available = false;

    await expect(fixture.store.createClient('VS Code'))
      .rejects.toThrow(/secure storage/i);
    expect(fixture.store.snapshot().clients).toEqual([]);
    await expect(access(fixture.settingsPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function createFixture(roots: string[]): Promise<{
  root: string;
  secureStore: FakeSecureStore;
  settingsPath: string;
  store: McpSettingsStore;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'interceptor-mcp-settings-'));
  roots.push(root);
  const secureStore = new FakeSecureStore();
  const store = new McpSettingsStore({ dataDirectory: root, secureStore });
  await store.start();
  return {
    root,
    secureStore,
    settingsPath: path.join(root, 'mcp-settings.enc'),
    store,
  };
}