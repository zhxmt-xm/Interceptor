import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { McpClientRegistration, McpToolExecutionMode } from '@interceptor/mcp-server';

import type {
  McpSettingsRecord,
  McpSettingsSnapshot,
  McpSettingsStoreOptions,
  McpStoredClient,
} from '../interfaces';

const SETTINGS_FILE_NAME = 'mcp-settings.enc';
const SETTINGS_MAX_BYTES = 256 * 1024;
const EXECUTION_MODES: readonly McpToolExecutionMode[] = ['ask', 'auto'];

const EMPTY_RECORD: McpSettingsRecord = {
  enabled: false,
  endpointPort: null,
  clients: [],
};

/** Owns MCP endpoint settings and encrypted per-client credentials. */
export class McpSettingsStore {
  /** Encrypted settings path under the MCP data directory. */
  readonly #settingsPath: string;
  /** OS-backed encryption boundary. */
  readonly #secureStore: McpSettingsStoreOptions['secureStore'];
  /** Current committed record. */
  #record: McpSettingsRecord = EMPTY_RECORD;
  /** Serializes all persistence mutations. */
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(options: McpSettingsStoreOptions) {
    this.#settingsPath = path.join(options.dataDirectory, SETTINGS_FILE_NAME);
    this.#secureStore = options.secureStore;
  }

  /** Restores and validates the complete encrypted record. */
  async start(): Promise<void> {
    this.#record = await this.#readRecord() ?? EMPTY_RECORD;
  }

  /** Returns a detached public snapshot without tokens. */
  snapshot(): McpSettingsSnapshot {
    return structuredClone({
      enabled: this.#record.enabled,
      endpointPort: this.#record.endpointPort,
      clients: this.#record.clients.map(({ token: _token, ...client }) => client),
    });
  }

  /** Returns detached registrations for restoring the in-memory authenticator. */
  registrations(): readonly McpClientRegistration[] {
    return structuredClone(this.#record.clients.map(({ clientId, label, token }) => ({
      clientId,
      label,
      token,
    })));
  }

  /** Returns one complete Main-only Client record. */
  client(clientId: string): McpStoredClient | null {
    const client = this.#record.clients.find((candidate) => candidate.clientId === clientId);
    return client === undefined ? null : structuredClone(client);
  }

  /** Persists an enabled Server and its successfully bound port. */
  enableServer(endpointPort: number): Promise<McpSettingsSnapshot> {
    validateEndpointPort(endpointPort);
    return this.#mutate((record) => ({ ...record, enabled: true, endpointPort }));
  }

  /** Persists a disabled Server without discarding its stable endpoint or Clients. */
  disableServer(): Promise<McpSettingsSnapshot> {
    return this.#mutate((record) => ({ ...record, enabled: false }));
  }

  /** Replaces the endpoint only after the new listener has bound successfully. */
  changeEndpoint(endpointPort: number): Promise<McpSettingsSnapshot> {
    validateEndpointPort(endpointPort);
    return this.#mutate((record) => ({ ...record, endpointPort }));
  }

  /** Creates one Client with a stable random credential and default Ask mode. */
  async createClient(label: string): Promise<McpClientRegistration> {
    const normalizedLabel = validateLabel(label);
    const client: McpStoredClient = {
      clientId: randomUUID(),
      label: normalizedLabel,
      executionMode: 'ask',
      token: randomBytes(32).toString('base64url'),
    };
    await this.#mutate((record) => ({ ...record, clients: [...record.clients, client] }));
    return registrationFor(client);
  }

  /** Rotates exactly one Client credential while preserving identity and mode. */
  async regenerateClientCredential(clientId: string): Promise<McpClientRegistration> {
    let regenerated: McpStoredClient | null = null;
    await this.#mutate((record) => ({
      ...record,
      clients: record.clients.map((client) => {
        if (client.clientId !== clientId) return client;
        regenerated = { ...client, token: randomBytes(32).toString('base64url') };
        return regenerated;
      }),
    }), () => {
      if (this.#record.clients.every((client) => client.clientId !== clientId)) {
        throw new Error(`Unknown MCP client "${clientId}".`);
      }
    });
    return registrationFor(regenerated!);
  }

  /** Removes exactly one Client and its credential. */
  revokeClient(clientId: string): Promise<McpSettingsSnapshot> {
    return this.#changeClient(clientId, (record) => ({
      ...record,
      clients: record.clients.filter((client) => client.clientId !== clientId),
    }));
  }

  /** Requires user approval for future change Tool calls from one Client. */
  requireClientApproval(clientId: string): Promise<McpSettingsSnapshot> {
    return this.#changeExecutionMode(clientId, 'ask');
  }

  /** Allows one Client to execute enabled change Tools without product approval. */
  automaticallyExecuteClientTools(clientId: string): Promise<McpSettingsSnapshot> {
    return this.#changeExecutionMode(clientId, 'auto');
  }

  /** Serializes one Client mode mutation. */
  #changeExecutionMode(
    clientId: string,
    executionMode: McpToolExecutionMode,
  ): Promise<McpSettingsSnapshot> {
    return this.#changeClient(clientId, (record) => ({
      ...record,
      clients: record.clients.map((client) => (
        client.clientId === clientId ? { ...client, executionMode } : client
      )),
    }));
  }

  /** Rejects an unknown Client before queuing its mutation. */
  #changeClient(
    clientId: string,
    change: (record: McpSettingsRecord) => McpSettingsRecord,
  ): Promise<McpSettingsSnapshot> {
    return this.#mutate(change, () => {
      if (this.#record.clients.every((client) => client.clientId !== clientId)) {
        throw new Error(`Unknown MCP client "${clientId}".`);
      }
    });
  }

  /** Persists one complete candidate before committing it to memory. */
  #mutate(
    change: (record: McpSettingsRecord) => McpSettingsRecord,
    validate?: () => void,
  ): Promise<McpSettingsSnapshot> {
    const operation = this.#mutationQueue.then(async () => {
      validate?.();
      const next = change(this.#record);
      await this.#writeRecord(next);
      this.#record = next;
    });
    this.#mutationQueue = operation.then(() => undefined, () => undefined);
    return operation.then(() => this.snapshot());
  }

  /** Reads one bounded regular encrypted file without deleting invalid data. */
  async #readRecord(): Promise<McpSettingsRecord | null> {
    let metadata;
    try {
      metadata = await lstat(this.#settingsPath);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('MCP settings must be a regular file.');
    }
    if (metadata.size > SETTINGS_MAX_BYTES) {
      throw new Error('MCP settings exceed the size limit.');
    }
    this.#requireSecureStorage();
    let value: unknown;
    try {
      const plaintext = this.#secureStore.decryptString(await readFile(this.#settingsPath));
      value = JSON.parse(plaintext);
    } catch {
      throw new Error('MCP settings could not be decrypted or contain invalid JSON.');
    }
    return parseRecord(value);
  }

  /** Encrypts and atomically replaces the complete record. */
  async #writeRecord(record: McpSettingsRecord): Promise<void> {
    this.#requireSecureStorage();
    if (isEmptyRecord(record)) {
      await rm(this.#settingsPath, { force: true });
      return;
    }
    const directory = path.dirname(this.#settingsPath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.#settingsPath)}.${randomUUID()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    const encrypted = this.#secureStore.encryptString(JSON.stringify(record));
    if (encrypted.byteLength > SETTINGS_MAX_BYTES) {
      throw new Error('MCP settings exceed the size limit.');
    }
    try {
      const file = await open(temporaryPath, 'wx', 0o600);
      try {
        await file.writeFile(encrypted);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporaryPath, this.#settingsPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  /** Requires OS-backed encryption before any credential read or write. */
  #requireSecureStorage(): void {
    if (!this.#secureStore.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable for MCP credentials.');
    }
  }
}

/** Parses the complete fixed record with no version or migration branch. */
function parseRecord(value: unknown): McpSettingsRecord {
  if (!isRecord(value) || !hasExactKeys(value, ['enabled', 'endpointPort', 'clients'])) {
    throw new Error('MCP settings fields are invalid.');
  }
  if (typeof value.enabled !== 'boolean') {
    throw new Error('MCP settings fields are invalid.');
  }
  if (value.endpointPort !== null) validateEndpointPort(value.endpointPort);
  if (!Array.isArray(value.clients)) {
    throw new Error('MCP settings fields are invalid.');
  }
  const clients = value.clients.map(parseClient);
  const clientIds = new Set(clients.map((client) => client.clientId));
  const tokens = new Set(clients.map((client) => client.token));
  if (clientIds.size !== clients.length || tokens.size !== clients.length) {
    throw new Error('MCP settings fields are invalid.');
  }
  return {
    enabled: value.enabled,
    endpointPort: value.endpointPort,
    clients,
  };
}

/** Parses one strict Client record. */
function parseClient(value: unknown): McpStoredClient {
  if (!isRecord(value) || !hasExactKeys(value, [
    'clientId', 'label', 'executionMode', 'token',
  ])) {
    throw new Error('MCP settings fields are invalid.');
  }
  if (
    typeof value.clientId !== 'string'
    || value.clientId.length === 0
    || typeof value.token !== 'string'
    || value.token.length === 0
    || !EXECUTION_MODES.includes(value.executionMode as McpToolExecutionMode)
  ) {
    throw new Error('MCP settings fields are invalid.');
  }
  const label = validateLabel(value.label);
  return {
    clientId: value.clientId,
    label,
    executionMode: value.executionMode as McpToolExecutionMode,
    token: value.token,
  };
}

/** Returns a detached registration without Main-only settings fields. */
function registrationFor(client: McpStoredClient): McpClientRegistration {
  return {
    clientId: client.clientId,
    label: client.label,
    token: client.token,
  };
}

/** Validates a persisted or newly-bound non-privileged endpoint port. */
function validateEndpointPort(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 1_024 || Number(value) > 65_535) {
    throw new Error('MCP endpoint port is invalid.');
  }
}

/** Normalizes and validates a user-visible Client label. */
function validateLabel(value: unknown): string {
  if (typeof value !== 'string') throw new Error('MCP Client label is invalid.');
  const label = value.trim();
  if (label.length === 0 || label.length > 80) {
    throw new Error('MCP Client label is invalid.');
  }
  return label;
}

/** Returns whether a parsed value is a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Enforces a fixed top-level or Client record shape. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

/** Returns whether persistence can be removed entirely. */
function isEmptyRecord(record: McpSettingsRecord): boolean {
  return !record.enabled && record.endpointPort === null && record.clients.length === 0;
}

/** Detects only an absent file; every other filesystem error remains observable. */
function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}