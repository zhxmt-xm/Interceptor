import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type {
  AgentModelSummary,
  AgentModelsSnapshot,
  AgentProviderDraft,
  AgentProviderVerification,
  AgentSecureStore,
  ModelAdapter,
} from '../interfaces';
import { DeepSeekModelAdapter } from '../models/deepseek-model-adapter';
import { AgentProviderRecordCorruptionError } from './internal/errors';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_CONTEXT_WINDOW_TOKENS = 1_000_000;
const DEEPSEEK_MAXIMUM_OUTPUT_TOKENS = 384_000;
const PROVIDER_RECORD_VERSION = 1;
const MAX_PROVIDER_RECORD_BYTES = 256 * 1024;
const PROVIDER_CONNECTION_TEST_TIMEOUT_MS = 15_000;
const PROVIDER_CONNECTION_TEST_MAX_OUTPUT_TOKENS = 8;
const PROVIDER_CONNECTION_TEST_MAX_RESPONSE_BYTES = 1024 * 1024;

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function customBaseUrlError(url: URL): string | null {
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== '') {
    return 'OpenAI-compatible Base URL must be an HTTP(S) URL without credentials, query or hash.';
  }
  if (url.protocol === 'http:' && !isLocalHostname(url.hostname)) {
    return 'HTTP endpoints are only allowed on the local machine.';
  }
  return null;
}

const credentialChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }).strict(),
  z.object({
    action: z.literal('replace'),
    apiKey: z.string().min(1).max(16_384),
  }).strict(),
  z.object({ action: z.literal('remove') }).strict(),
]);

const providerDraftSchema = z.discriminatedUnion('kind', [
  z.object({
    providerId: z.string().min(1).nullable(),
    kind: z.literal('deepseek'),
    profileName: z.string().trim().min(1).max(120),
    modelId: z.string().trim().min(1).max(240),
    credential: credentialChangeSchema,
  }).strict(),
  z.object({
    providerId: z.string().min(1).nullable(),
    kind: z.literal('openai-compatible'),
    profileName: z.string().trim().min(1).max(120),
    baseUrl: z.string().trim().url().max(2_048),
    modelId: z.string().trim().min(1).max(240),
    contextWindowTokens: z.number().int().positive(),
    maximumOutputTokens: z.number().int().positive(),
    credential: credentialChangeSchema,
  }).strict(),
]);

const storedProviderSchema = z.object({
  providerId: z.string().min(1),
  kind: z.enum(['deepseek', 'openai-compatible']),
  profileName: z.string().min(1),
  baseUrl: z.string().url(),
  modelId: z.string().min(1),
  contextWindowTokens: z.number().int().positive(),
  maximumOutputTokens: z.number().int().positive(),
  apiKey: z.string().min(1).nullable(),
}).strict();

const providerRecordSchema = z.object({
  version: z.literal(PROVIDER_RECORD_VERSION),
  defaultProviderId: z.string().min(1).nullable(),
  providers: z.array(storedProviderSchema),
}).strict().superRefine((record, context) => {
  const providerIds = new Set<string>();
  for (const provider of record.providers) {
    if (providerIds.has(provider.providerId)) {
      context.addIssue({ code: 'custom', message: 'Provider IDs must be unique.' });
    }
    providerIds.add(provider.providerId);
    if (provider.kind === 'deepseek' && provider.apiKey === null) {
      context.addIssue({ code: 'custom', message: 'DeepSeek requires an API key.' });
    }
    if (provider.kind === 'deepseek'
      && (provider.baseUrl !== DEEPSEEK_BASE_URL
        || provider.contextWindowTokens !== DEEPSEEK_CONTEXT_WINDOW_TOKENS
        || provider.maximumOutputTokens !== DEEPSEEK_MAXIMUM_OUTPUT_TOKENS)) {
      context.addIssue({ code: 'custom', message: 'DeepSeek Provider configuration is invalid.' });
    }
    if (provider.kind === 'openai-compatible') {
      const baseUrlError = customBaseUrlError(new URL(provider.baseUrl));
      if (baseUrlError !== null) {
        context.addIssue({ code: 'custom', message: baseUrlError });
      }
    }
  }
  if (record.defaultProviderId !== null && !providerIds.has(record.defaultProviderId)) {
    context.addIssue({ code: 'custom', message: 'Default Provider must exist.' });
  }
  if ((record.providers.length === 0) !== (record.defaultProviderId === null)) {
    context.addIssue({ code: 'custom', message: 'Empty Provider records cannot have a default.' });
  }
});

type StoredProvider = z.infer<typeof storedProviderSchema>;
type ProviderRecord = z.infer<typeof providerRecordSchema>;

interface PendingProviderVerification {
  readonly provider: StoredProvider;
  readonly providerRevision: number;
}

export interface AgentProviderSave {
  readonly models: AgentModelsSnapshot;
  readonly rollback: () => Promise<void>;
}

export interface AgentProviderRegistryOptions {
  readonly dataDirectory: string;
  readonly secureStore: AgentSecureStore;
  readonly fetcher?: typeof fetch;
  readonly createId?: () => string;
  readonly connectionTestTimeoutMs?: number;
}

/** Owns configured Providers, encrypted credentials, verification and adapter creation. */
export class AgentProviderRegistry {
  readonly #credentialPath: string;
  readonly #secureStore: AgentSecureStore;
  readonly #fetcher: typeof fetch;
  readonly #createId: () => string;
  readonly #connectionTestTimeoutMs: number;
  readonly #pendingVerifications = new Map<string, PendingProviderVerification>();
  readonly #connectionTestCompletions = new Set<Promise<void>>();
  #connectionTestAbortController: AbortController | null = null;
  #verificationGeneration = 0;
  #providerMutationTail: Promise<void> = Promise.resolve();
  #providers: StoredProvider[] = [];
  #defaultProviderId: string | null = null;
  #running = false;
  #providerRecordPendingRestore = false;
  #providerRevision = 0;

  constructor(options: AgentProviderRegistryOptions) {
    this.#credentialPath = path.join(options.dataDirectory, 'providers.enc');
    this.#secureStore = options.secureStore;
    this.#fetcher = options.fetcher ?? fetch;
    this.#createId = options.createId ?? randomUUID;
    this.#connectionTestTimeoutMs = options.connectionTestTimeoutMs
      ?? PROVIDER_CONNECTION_TEST_TIMEOUT_MS;
    if (!Number.isFinite(this.#connectionTestTimeoutMs)
      || this.#connectionTestTimeoutMs <= 0) {
      throw new RangeError('connectionTestTimeoutMs must be a positive finite number.');
    }
  }

  /** Restores one bounded encrypted record, clearing invalid local state. */
  async start(): Promise<void> {
    this.#running = false;
    this.#providerRecordPendingRestore = false;
    this.#cancelConnectionTest('Agent Provider registry restarted.');
    await Promise.all([
      ...this.#connectionTestCompletions,
      this.#providerMutationTail,
    ]);
    if (!this.#secureStore.isEncryptionAvailable()) {
      this.#providers = [];
      this.#defaultProviderId = null;
      this.#providerRecordPendingRestore = true;
      this.#providerRevision += 1;
      this.#running = true;
      return;
    }
    try {
      const record = await this.#readRecord();
      this.#providers = record?.providers.map((provider) => ({ ...provider })) ?? [];
      this.#defaultProviderId = record?.defaultProviderId ?? null;
    } catch (error) {
      this.#providers = [];
      this.#defaultProviderId = null;
      if (error instanceof AgentProviderRecordCorruptionError) {
        await rm(this.#credentialPath, { force: true });
      } else if (!this.#secureStore.isEncryptionAvailable()) {
        this.#providerRecordPendingRestore = true;
      } else {
        throw error;
      }
    }
    this.#providerRevision += 1;
    this.#running = true;
  }

  /** Clears non-persistent one-time verifications. */
  async stop(): Promise<void> {
    this.#running = false;
    this.#cancelConnectionTest('Agent Runtime stopped.');
    await Promise.all([
      ...this.#connectionTestCompletions,
      this.#providerMutationTail,
    ]);
  }

  /** Returns a detached redacted snapshot. */
  snapshot(): AgentModelsSnapshot {
    return {
      defaultProviderId: this.#defaultProviderId,
      models: this.#providers.map((provider) => this.#summary(provider)),
    };
  }

  /** Tests one exact draft and returns a one-time save authorization. */
  async testConnection(draftInput: unknown): Promise<AgentProviderVerification> {
    this.#requireRunning();
    this.#requireSecureStorage();
    this.#requireProviderRecordLoaded();
    const { abortController, generation } = this.#beginConnectionTest();
    const providerRevision = this.#providerRevision;
    let finishConnectionTest!: () => void;
    const connectionTestCompletion = new Promise<void>((resolve) => {
      finishConnectionTest = resolve;
    });
    this.#connectionTestCompletions.add(connectionTestCompletion);
    try {
      const draft = providerDraftSchema.parse(draftInput);
      const existing = draft.providerId === null
        ? undefined
        : this.#providers.find((provider) => provider.providerId === draft.providerId);
      if (draft.providerId !== null && existing === undefined) {
        throw new Error('Agent Provider does not exist.');
      }
      if (existing !== undefined && existing.kind !== draft.kind) {
        throw new Error('Agent Provider kind cannot be changed.');
      }

      const providerId = existing?.providerId ?? this.#createId();
      const apiKey = this.#resolveApiKey(draft, existing);
      const provider = this.#storedProvider(providerId, draft, apiKey);
      const modelAdapter = this.#createModelAdapter(
        provider,
        this.#connectionTestTimeoutMs,
        PROVIDER_CONNECTION_TEST_MAX_RESPONSE_BYTES,
      );
      for await (const _event of modelAdapter.stream({
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        tools: [],
        maxOutputTokens: PROVIDER_CONNECTION_TEST_MAX_OUTPUT_TOKENS,
      }, { abortSignal: abortController.signal })) {
        // Consuming through response-completed validates the complete Provider protocol.
      }
      if (generation !== this.#verificationGeneration) {
        throw abortController.signal.reason
          ?? new DOMException('Provider connection test was superseded.', 'AbortError');
      }
      if (providerRevision !== this.#providerRevision) {
        throw new Error('Agent Provider configuration changed during connection test.');
      }

      const verificationId = this.#createId();
      this.#pendingVerifications.set(verificationId, { provider, providerRevision });
      return {
        verificationId,
        model: this.#summary(provider),
      };
    } finally {
      if (this.#connectionTestAbortController === abortController) {
        this.#connectionTestAbortController = null;
      }
      finishConnectionTest();
      this.#connectionTestCompletions.delete(connectionTestCompletion);
    }
  }

  /** Atomically persists exactly one previously tested draft. */
  saveVerified(verificationId: string): Promise<AgentProviderSave> {
    this.#requireRunning();
    this.#requireProviderRecordLoaded();
    const verification = this.#pendingVerifications.get(verificationId);
    this.#pendingVerifications.delete(verificationId);
    if (verification === undefined) {
      return Promise.reject(new Error('Provider verification is missing or expired.'));
    }
    return this.#enqueueProviderMutation(async () => {
      if (verification.providerRevision !== this.#providerRevision) {
        throw new Error('Provider verification is missing or expired.');
      }
      const previousRecord: ProviderRecord = {
        version: PROVIDER_RECORD_VERSION,
        defaultProviderId: this.#defaultProviderId,
        providers: this.#providers.map((provider) => ({ ...provider })),
      };
      const providers = this.#providers.map((provider) => ({ ...provider }));
      const existingIndex = providers.findIndex(
        (provider) => provider.providerId === verification.provider.providerId,
      );
      if (existingIndex === -1) {
        providers.push({ ...verification.provider });
      } else {
        providers[existingIndex] = { ...verification.provider };
      }
      const defaultProviderId = this.#defaultProviderId ?? verification.provider.providerId;
      await this.#writeRecord({
        version: PROVIDER_RECORD_VERSION,
        defaultProviderId,
        providers,
      });
      this.#providers = providers;
      this.#defaultProviderId = defaultProviderId;
      this.#providerRevision += 1;
      this.#pendingVerifications.clear();
      const savedRevision = this.#providerRevision;
      let rollbackStarted = false;
      return {
        models: this.snapshot(),
        rollback: () => {
          if (rollbackStarted) {
            return Promise.reject(new Error('Agent Provider save rollback is no longer available.'));
          }
          rollbackStarted = true;
          return this.#enqueueProviderMutation(async () => {
            if (this.#providerRevision !== savedRevision) {
              throw new Error('Agent Provider configuration changed before save rollback.');
            }
            await this.#writeRecord(previousRecord);
            this.#providers = previousRecord.providers.map((provider) => ({ ...provider }));
            this.#defaultProviderId = previousRecord.defaultProviderId;
            this.#providerRevision += 1;
            this.#pendingVerifications.clear();
          });
        },
      };
    });
  }

  /** Changes only the default Provider, preserving stable order. */
  setDefault(providerId: string): Promise<AgentModelsSnapshot> {
    this.#requireRunning();
    this.#requireProviderRecordLoaded();
    return this.#enqueueProviderMutation(async () => {
      if (!this.#providers.some((provider) => provider.providerId === providerId)) {
        throw new Error('Agent Provider does not exist.');
      }
      await this.#writeRecord({
        version: PROVIDER_RECORD_VERSION,
        defaultProviderId: providerId,
        providers: this.#providers,
      });
      this.#defaultProviderId = providerId;
      this.#providerRevision += 1;
      this.#pendingVerifications.clear();
      return this.snapshot();
    });
  }

  /** Removes one Provider and deterministically selects the first remaining default. */
  remove(providerId: string): Promise<AgentModelsSnapshot> {
    this.#requireRunning();
    this.#requireProviderRecordLoaded();
    return this.#enqueueProviderMutation(async () => {
      if (!this.#providers.some((provider) => provider.providerId === providerId)) {
        throw new Error('Agent Provider does not exist.');
      }
      const providers = this.#providers
        .filter((provider) => provider.providerId !== providerId)
        .map((provider) => ({ ...provider }));
      const defaultProviderId = this.#defaultProviderId === providerId
        ? providers[0]?.providerId ?? null
        : this.#defaultProviderId;
      await this.#writeRecord({
        version: PROVIDER_RECORD_VERSION,
        defaultProviderId,
        providers,
      });
      this.#providers = providers;
      this.#defaultProviderId = defaultProviderId;
      this.#providerRevision += 1;
      this.#pendingVerifications.clear();
      return this.snapshot();
    });
  }

  /** Builds one fresh adapter for a configured Provider. */
  modelAdapter(providerId: string): ModelAdapter {
    this.#requireRunning();
    this.#requireProviderRecordLoaded();
    const provider = this.#providers.find((entry) => entry.providerId === providerId);
    if (provider === undefined) {
      throw new Error('Agent Provider does not exist.');
    }
    return this.#createModelAdapter(provider);
  }

  #resolveApiKey(draft: AgentProviderDraft, existing: StoredProvider | undefined): string | null {
    switch (draft.credential.action) {
      case 'keep':
        if (existing === undefined) {
          throw new Error('A new Agent Provider cannot keep a missing credential.');
        }
        return existing.apiKey;
      case 'replace':
        return draft.credential.apiKey;
      case 'remove':
        if (draft.kind === 'deepseek') {
          throw new Error('DeepSeek requires an API key.');
        }
        return null;
    }
  }

  #storedProvider(
    providerId: string,
    draft: AgentProviderDraft,
    apiKey: string | null,
  ): StoredProvider {
    if (draft.kind === 'deepseek') {
      return {
        providerId,
        kind: draft.kind,
        profileName: draft.profileName,
        baseUrl: DEEPSEEK_BASE_URL,
        modelId: draft.modelId,
        contextWindowTokens: DEEPSEEK_CONTEXT_WINDOW_TOKENS,
        maximumOutputTokens: DEEPSEEK_MAXIMUM_OUTPUT_TOKENS,
        apiKey,
      };
    }
    const url = new URL(draft.baseUrl);
    const baseUrlError = customBaseUrlError(url);
    if (baseUrlError !== null) {
      throw new Error(baseUrlError);
    }
    return {
      providerId,
      kind: draft.kind,
      profileName: draft.profileName,
      baseUrl: draft.baseUrl.replace(/\/+$/, ''),
      modelId: draft.modelId,
      contextWindowTokens: draft.contextWindowTokens,
      maximumOutputTokens: draft.maximumOutputTokens,
      apiKey,
    };
  }

  #createModelAdapter(
    provider: StoredProvider,
    attemptTimeoutMs?: number,
    maxResponseBytes?: number,
  ): DeepSeekModelAdapter {
    return new DeepSeekModelAdapter({
      apiKey: provider.apiKey ?? undefined,
      baseUrl: provider.baseUrl,
      contextWindowTokens: provider.contextWindowTokens,
      maxOutputTokens: provider.maximumOutputTokens,
      fetch: this.#fetcher,
      model: provider.modelId,
      ...(attemptTimeoutMs === undefined ? {} : { attemptTimeoutMs }),
      ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
    });
  }

  #beginConnectionTest(): {
    readonly abortController: AbortController;
    readonly generation: number;
  } {
    this.#cancelConnectionTest('Provider connection test was superseded.');
    const abortController = new AbortController();
    this.#connectionTestAbortController = abortController;
    return { abortController, generation: this.#verificationGeneration };
  }

  #cancelConnectionTest(reason: string): void {
    this.#verificationGeneration += 1;
    this.#pendingVerifications.clear();
    this.#connectionTestAbortController?.abort(new DOMException(reason, 'AbortError'));
    this.#connectionTestAbortController = null;
  }

  #enqueueProviderMutation<T>(
    mutation: () => Promise<T>,
  ): Promise<T> {
    const result = this.#providerMutationTail.then(mutation);
    this.#providerMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #summary(provider: StoredProvider): AgentModelSummary {
    return {
      providerId: provider.providerId,
      kind: provider.kind,
      profileName: provider.profileName,
      baseUrl: provider.baseUrl,
      modelId: provider.modelId,
      contextWindowTokens: provider.contextWindowTokens,
      maximumOutputTokens: provider.maximumOutputTokens,
      credentialConfigured: provider.apiKey !== null,
      credentialLastFour: provider.apiKey?.slice(-4) ?? null,
      isDefault: provider.providerId === this.#defaultProviderId,
    };
  }

  #requireSecureStorage(): void {
    if (!this.#secureStore.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable.');
    }
  }

  #requireRunning(): void {
    if (!this.#running) {
      throw new Error('Agent Provider registry is not running.');
    }
  }

  #requireProviderRecordLoaded(): void {
    if (this.#providerRecordPendingRestore) {
      throw new Error('OS secure storage recovered after startup. Restart Agent before changing Providers.');
    }
  }

  async #writeRecord(record: ProviderRecord): Promise<void> {
    this.#requireSecureStorage();
    const parsedRecord = providerRecordSchema.parse(record);
    const encrypted = this.#secureStore.encryptString(JSON.stringify(parsedRecord));
    if (encrypted.byteLength > MAX_PROVIDER_RECORD_BYTES) {
      throw new Error('Agent Provider record exceeds the encrypted size limit.');
    }
    const directory = path.dirname(this.#credentialPath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.#credentialPath)}.${randomUUID()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    const file = await open(temporaryPath, 'wx', 0o600);
    try {
      await file.writeFile(encrypted);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temporaryPath, this.#credentialPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async #readRecord(): Promise<ProviderRecord | null> {
    let metadata;
    try {
      metadata = await lstat(this.#credentialPath);
    } catch (error) {
      if (AgentProviderRegistry.#isMissing(error)) {
        return null;
      }
      throw error;
    }
    if (!metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.size > MAX_PROVIDER_RECORD_BYTES) {
      throw new AgentProviderRecordCorruptionError('Agent Provider record is invalid.');
    }
    this.#requireSecureStorage();
    const plaintext = this.#secureStore.decryptString(await readFile(this.#credentialPath));
    let record: unknown;
    try {
      record = JSON.parse(plaintext) as unknown;
    } catch (error) {
      throw new AgentProviderRecordCorruptionError(
        'Agent Provider record is not valid JSON.',
        { cause: error },
      );
    }
    const parsedRecord = providerRecordSchema.safeParse(record);
    if (!parsedRecord.success) {
      throw new AgentProviderRecordCorruptionError(
        'Agent Provider record schema is invalid.',
        { cause: parsedRecord.error },
      );
    }
    return parsedRecord.data;
  }

  static #isMissing(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === 'ENOENT';
  }

}
