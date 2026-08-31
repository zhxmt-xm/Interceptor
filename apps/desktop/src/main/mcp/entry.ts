import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import {
  McpServer,
  type McpApprovalRequest,
  type McpApprovalVerdict,
  type McpAuditEvent,
  type McpClientIdentity,
  type McpHostBridge,
} from '@interceptor/mcp-server';
import { INTERCEPTOR_TOOL_NAMES } from '@interceptor/tools';

import type { CoreRequestOptions } from '../interfaces';
import { McpHttpServer } from './internal/http-server';
import { McpSettingsStore } from './internal/settings-store';
import type {
  McpDesktopClientSummary,
  McpDesktopServiceOptions,
  McpDesktopStatus,
} from './interfaces';

const MCP_ENDPOINT_HOST = '127.0.0.1';
const MCP_ENDPOINT_PATH = '/mcp';
const DEFAULT_APPROVAL_TIMEOUT_MILLISECONDS = 5 * 60_000;

interface PendingApproval {
  readonly request: McpApprovalRequest;
  readonly resolve: (verdict: McpApprovalVerdict) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly abortSignal: AbortSignal;
  readonly abortListener: () => void;
}

/** Owns Desktop MCP settings, listener, Tool execution, approvals and lifecycle. */
export class McpDesktopService implements McpHostBridge {
  /** Encrypted endpoint and Client settings. */
  readonly #mcpSettingsStore: McpSettingsStore;
  /** Existing Main/Core business owner. */
  readonly #coreRuntime: McpDesktopServiceOptions['coreRuntime'];
  /** Existing shared Tool exposure settings owner. */
  readonly #toolCapabilitySettingsService: McpDesktopServiceOptions['toolCapabilitySettingsService'];
  /** Application version advertised through MCP. */
  readonly #appVersion: string;
  /** Delivers approval requests to the App shell. */
  readonly #approvalRequested: McpDesktopServiceOptions['approvalRequested'];
  /** Removes approvals from the App shell after every terminal outcome. */
  readonly #approvalClosed: McpDesktopServiceOptions['approvalClosed'];
  /** Synchronizes capture UI after a Tool changes recording. */
  readonly #captureStatusChanged: McpDesktopServiceOptions['captureStatusChanged'];
  /** Main-only clipboard boundary for secret-bearing MCP configuration. */
  readonly #copyText: McpDesktopServiceOptions['copyText'];
  /** Makes approval UI visible before publishing the request. */
  readonly #showAndFocusWindow: McpDesktopServiceOptions['showAndFocusWindow'];
  /** Non-blocking audit sink. */
  readonly #recordAudit: NonNullable<McpDesktopServiceOptions['recordAudit']>;
  /** Maximum time an external Host call may wait for a user verdict. */
  readonly #approvalTimeoutMilliseconds: number;
  /** Public status listeners. */
  readonly #statusListeners = new Set<(status: McpDesktopStatus) => void>();
  /** Pending Ask-mode approvals keyed by approval ID. */
  readonly #pendingApprovals = new Map<string, PendingApproval>();
  /** Serializes settings and listener mutations. */
  #mutationQueue: Promise<void> = Promise.resolve();
  /** Active transport-neutral MCP server. */
  #mcpServer: McpServer | null = null;
  /** Active loopback listener. */
  #mcpHttpServer: McpHttpServer | null = null;
  /** Current public operational state. */
  #state: McpDesktopStatus['state'] = 'disabled';
  /** Current operational detail, used for endpoint conflict. */
  #detail: string | null = null;
  /** Whether persisted settings have been loaded. */
  #started = false;

  constructor(options: McpDesktopServiceOptions) {
    this.#mcpSettingsStore = new McpSettingsStore({
      dataDirectory: options.dataDirectory,
      secureStore: options.secureStore,
    });
    this.#coreRuntime = options.coreRuntime;
    this.#toolCapabilitySettingsService = options.toolCapabilitySettingsService;
    this.#appVersion = options.appVersion;
    this.#approvalRequested = options.approvalRequested;
    this.#approvalClosed = options.approvalClosed;
    this.#captureStatusChanged = options.captureStatusChanged;
    this.#copyText = options.copyText;
    this.#showAndFocusWindow = options.showAndFocusWindow;
    this.#recordAudit = options.recordAudit ?? (() => undefined);
    this.#approvalTimeoutMilliseconds = options.approvalTimeoutMilliseconds
      ?? DEFAULT_APPROVAL_TIMEOUT_MILLISECONDS;
  }

  /** Restores settings and starts the persisted endpoint when enabled. */
  async start(): Promise<void> {
    if (this.#started) return;
    await this.#mcpSettingsStore.start();
    this.#started = true;
    const snapshot = this.#mcpSettingsStore.snapshot();
    if (!snapshot.enabled || snapshot.endpointPort === null) {
      this.#publishStatus('disabled', null);
      return;
    }
    try {
      await this.#openServer(snapshot.endpointPort);
      this.#publishStatus('running', null);
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
      this.#publishStatus('endpoint-conflict', 'The saved MCP endpoint port is already in use.');
    }
  }

  /** Returns a detached public status without credentials. */
  status(): McpDesktopStatus {
    const settings = this.#mcpSettingsStore.snapshot();
    return structuredClone({
      state: this.#state,
      endpoint: settings.endpointPort === null ? null : endpointFor(settings.endpointPort),
      detail: this.#detail,
      clients: settings.clients,
    });
  }

  /** Subscribes to public status changes. */
  onStatusChange(listener: (status: McpDesktopStatus) => void): () => void {
    this.#statusListeners.add(listener);
    return () => this.#statusListeners.delete(listener);
  }

  /** Enables the listener, assigning an OS-selected port on first use. */
  enableServer(): Promise<McpDesktopStatus> {
    return this.#enqueue(async () => {
      if (this.#state === 'running') return this.status();
      const savedPort = this.#mcpSettingsStore.snapshot().endpointPort;
      const endpointPort = await this.#openServer(savedPort ?? 0);
      try {
        await this.#mcpSettingsStore.enableServer(endpointPort);
      } catch (error) {
        await this.#closeServer();
        throw error;
      }
      return this.#publishStatus('running', null);
    });
  }

  /** Disables the listener while preserving endpoint and Client credentials. */
  disableServer(): Promise<McpDesktopStatus> {
    return this.#enqueue(async () => {
      await this.#mcpSettingsStore.disableServer();
      await this.#closeServer();
      return this.#publishStatus('disabled', null);
    });
  }

  /** Rebinds to a new OS-selected port only through an explicit user action. */
  changeEndpoint(): Promise<McpDesktopStatus> {
    return this.#enqueue(async () => {
      await this.#closeServer();
      const endpointPort = await this.#openServer(0);
      try {
        await this.#mcpSettingsStore.changeEndpoint(endpointPort);
        if (!this.#mcpSettingsStore.snapshot().enabled) {
          await this.#mcpSettingsStore.enableServer(endpointPort);
        }
      } catch (error) {
        await this.#closeServer();
        throw error;
      }
      return this.#publishStatus('running', null);
    });
  }

  /** Creates one Client and synchronizes it into the active authenticator. */
  async createClient(label: string): Promise<McpDesktopClientSummary> {
    return this.#enqueue(async () => {
      if (this.#mcpSettingsStore.snapshot().endpointPort === null) {
        throw new Error('Enable the MCP server before adding a Client.');
      }
      const registration = await this.#mcpSettingsStore.createClient(label);
      this.#restoreAuthenticator();
      this.#publishStatus(this.#state, this.#detail);
      return publicClient(this.#mcpSettingsStore.client(registration.clientId)!);
    });
  }

  /** Copies a complete MCP configuration without exposing its token to Renderer. */
  async copyClientConfiguration(clientId: string): Promise<void> {
    const client = this.#mcpSettingsStore.client(clientId);
    const endpointPort = this.#mcpSettingsStore.snapshot().endpointPort;
    if (client === null) throw new Error(`Unknown MCP client "${clientId}".`);
    if (endpointPort === null) throw new Error('MCP endpoint has not been assigned.');
    await this.#copyText(JSON.stringify({
      servers: {
        interceptor: {
          type: 'http',
          url: endpointFor(endpointPort),
          headers: { Authorization: `Bearer ${client.token}` },
        },
      },
    }, null, 2));
  }

  /** Replaces one credential and immediately invalidates its old requests. */
  regenerateClientCredential(clientId: string): Promise<McpDesktopStatus> {
    return this.#enqueue(async () => {
      this.#settleClientApprovals(clientId, 'cancelled');
      this.#removeClientFromAuthenticator(clientId);
      this.#mcpServer?.cancelClientRequests(clientId);
      try {
        await this.#mcpSettingsStore.regenerateClientCredential(clientId);
      } finally {
        this.#restoreAuthenticator();
      }
      return this.#publishStatus(this.#state, this.#detail);
    });
  }

  /** Revokes one Client and cancels only its pending work. */
  revokeClient(clientId: string): Promise<McpDesktopStatus> {
    return this.#enqueue(async () => {
      this.#settleClientApprovals(clientId, 'cancelled');
      this.#removeClientFromAuthenticator(clientId);
      this.#mcpServer?.cancelClientRequests(clientId);
      try {
        await this.#mcpSettingsStore.revokeClient(clientId);
      } finally {
        this.#restoreAuthenticator();
      }
      return this.#publishStatus(this.#state, this.#detail);
    });
  }

  /** Switches one Client to Ask mode. */
  requireClientApproval(clientId: string): Promise<McpDesktopStatus> {
    return this.#enqueue(async () => {
      await this.#mcpSettingsStore.requireClientApproval(clientId);
      return this.#publishStatus(this.#state, this.#detail);
    });
  }

  /** Switches one Client to Auto mode. */
  automaticallyExecuteClientTools(clientId: string): Promise<McpDesktopStatus> {
    return this.#enqueue(async () => {
      await this.#mcpSettingsStore.automaticallyExecuteClientTools(clientId);
      return this.#publishStatus(this.#state, this.#detail);
    });
  }

  /** Resolves one pending Tool call as approved. */
  allowToolCall(approvalId: string): void {
    this.#settleApproval(approvalId, 'approved');
  }

  /** Resolves one pending Tool call as rejected. */
  denyToolCall(approvalId: string): void {
    this.#settleApproval(approvalId, 'rejected');
  }

  /** Stops operational resources without changing the user's persisted enabled intent. */
  stop(): Promise<void> {
    return this.#enqueue(async () => {
      await this.#closeServer();
      this.#publishStatus('disabled', null);
      this.#statusListeners.clear();
      this.#started = false;
    });
  }

  /** Sends one shared Tool command through the existing CoreRuntime. */
  async invoke<T extends CoreCommand>(
    command: T,
    abortSignal: AbortSignal,
  ): Promise<CoreResultForCommand<T>> {
    const options: CoreRequestOptions = { abortSignal };
    const result = await this.#coreRuntime.request(command, options);
    if (command.type === 'proxy.start' || command.type === 'proxy.setRecording') {
      this.#captureStatusChanged(result.payload as never);
    }
    return result;
  }

  /** Publishes an App-level Ask request and waits for a user verdict. */
  requestApproval(
    request: McpApprovalRequest,
    abortSignal: AbortSignal,
  ): Promise<McpApprovalVerdict> {
    if (this.#pendingApprovals.has(request.approvalId)) {
      return Promise.reject(new Error(`Duplicate MCP approval "${request.approvalId}".`));
    }
    if (abortSignal.aborted) return Promise.resolve('cancelled');
    this.#showAndFocusWindow();
    return new Promise<McpApprovalVerdict>((resolve) => {
      const timeout = setTimeout(() => {
        this.#settleApproval(request.approvalId, 'timeout');
      }, this.#approvalTimeoutMilliseconds);
      const abortListener = (): void => {
        if (this.#pendingApprovals.has(request.approvalId)) {
          this.#settleApproval(request.approvalId, 'cancelled');
        }
      };
      this.#pendingApprovals.set(request.approvalId, {
        request,
        resolve,
        timeout,
        abortSignal,
        abortListener,
      });
      abortSignal.addEventListener('abort', abortListener, { once: true });
      this.#approvalRequested(request);
    });
  }

  /** Forwards audit facts without allowing Diagnostics failure to break a Tool. */
  record(event: McpAuditEvent): void {
    try {
      this.#recordAudit(event);
    } catch {
      // MCP audit is observability, not part of Tool success.
    }
  }

  /** Builds and starts a fresh authenticated SDK handler and loopback listener. */
  async #openServer(endpointPort: number): Promise<number> {
    if (this.#mcpHttpServer !== null || this.#mcpServer !== null) {
      throw new Error('MCP server is already open.');
    }
    const mcpServer = new McpServer({
      host: this,
      version: this.#appVersion,
      listEnabledToolNames: () => this.#enabledToolNames(),
      readClientExecutionMode: (identity) => this.#clientExecutionMode(identity),
    });
    mcpServer.authenticator.restore(this.#mcpSettingsStore.registrations());
    const mcpHttpServer = new McpHttpServer(mcpServer);
    this.#mcpServer = mcpServer;
    this.#mcpHttpServer = mcpHttpServer;
    try {
      return await mcpHttpServer.start(endpointPort);
    } catch (error) {
      this.#mcpServer = null;
      this.#mcpHttpServer = null;
      await mcpHttpServer.close().catch(() => undefined);
      throw error;
    }
  }

  /** Closes every MCP request and rejects every pending approval. */
  async #closeServer(): Promise<void> {
    this.#settleAllApprovals('cancelled');
    const mcpHttpServer = this.#mcpHttpServer;
    this.#mcpHttpServer = null;
    this.#mcpServer = null;
    await mcpHttpServer?.close();
  }

  /** Restores the complete committed Client set into the active authenticator. */
  #restoreAuthenticator(): void {
    this.#mcpServer?.authenticator.restore(this.#mcpSettingsStore.registrations());
  }

  /** Rejects the target credential while its durable replacement is in progress. */
  #removeClientFromAuthenticator(clientId: string): void {
    this.#mcpServer?.authenticator.restore(
      this.#mcpSettingsStore.registrations().filter(
        (registration) => registration.clientId !== clientId,
      ),
    );
  }

  /** Reads the latest global MCP Tool switches in fixed registry order. */
  #enabledToolNames(): readonly string[] {
    const disabledToolNames = new Set(
      this.#toolCapabilitySettingsService.snapshot().mcpDisabledToolNames,
    );
    return INTERCEPTOR_TOOL_NAMES.filter((name) => !disabledToolNames.has(name));
  }

  /** Reads one Client's latest mode; revoked identities fall back to Ask and fail auth next request. */
  #clientExecutionMode(identity: McpClientIdentity): 'ask' | 'auto' {
    return this.#mcpSettingsStore.client(identity.clientId)?.executionMode ?? 'ask';
  }

  /** Settles one pending approval exactly once. */
  #settleApproval(approvalId: string, verdict: McpApprovalVerdict): void {
    const pending = this.#pendingApprovals.get(approvalId);
    if (pending === undefined) throw new Error(`Unknown MCP approval "${approvalId}".`);
    this.#pendingApprovals.delete(approvalId);
    clearTimeout(pending.timeout);
    pending.abortSignal.removeEventListener('abort', pending.abortListener);
    this.#approvalClosed(approvalId);
    pending.resolve(verdict);
  }

  /** Settles approvals owned by one Client without touching other Clients. */
  #settleClientApprovals(clientId: string, verdict: McpApprovalVerdict): void {
    for (const pending of [...this.#pendingApprovals.values()]) {
      if (pending.request.identity.clientId === clientId) {
        this.#settleApproval(pending.request.approvalId, verdict);
      }
    }
  }

  /** Settles every pending approval during disable or shutdown. */
  #settleAllApprovals(verdict: McpApprovalVerdict): void {
    for (const approvalId of [...this.#pendingApprovals.keys()]) {
      this.#settleApproval(approvalId, verdict);
    }
  }

  /** Publishes and returns one detached status snapshot. */
  #publishStatus(state: McpDesktopStatus['state'], detail: string | null): McpDesktopStatus {
    this.#state = state;
    this.#detail = detail;
    const status = this.status();
    for (const listener of this.#statusListeners) listener(status);
    return status;
  }

  /** Serializes one lifecycle or settings mutation. */
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#mutationQueue.then(operation);
    this.#mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** Formats the one public loopback endpoint. */
function endpointFor(endpointPort: number): string {
  return `http://${MCP_ENDPOINT_HOST}:${endpointPort}${MCP_ENDPOINT_PATH}`;
}

/** Removes the Main-only token from a Client record. */
function publicClient(client: {
  readonly clientId: string;
  readonly label: string;
  readonly executionMode: 'ask' | 'auto';
}): McpDesktopClientSummary {
  return {
    clientId: client.clientId,
    label: client.label,
    executionMode: client.executionMode,
  };
}

/** Identifies only a listener port conflict. */
function isAddressInUse(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'EADDRINUSE';
}