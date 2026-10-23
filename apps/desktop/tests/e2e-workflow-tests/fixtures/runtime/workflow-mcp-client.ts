import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { CallToolResultSchema, JSONRPCMessageSchema, ListToolsResultSchema } from '@modelcontextprotocol/core';
import type { TestInfo } from '@playwright/test';
import WebSocket from 'ws';

export type WorkflowMcpClient = Pick<Client, 'callTool' | 'listTools' | 'close'>;

interface McpConfiguration {
  readonly url: string;
  readonly headers: { readonly Authorization: string };
}

interface PendingHostRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface HostToolEvidence {
  readonly name: string;
  readonly argumentsSha256: string;
  readonly result?: unknown;
  readonly error?: { readonly message: string; readonly code?: number };
}

const CODE_CLI = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
const ROOT_CHANNEL = 'ahp-root://';

export async function connectWorkflowMcpClient(
  configuration: McpConfiguration,
  name: string,
  testInfo: TestInfo,
): Promise<WorkflowMcpClient> {
  const mode = process.env.INTERCEPTOR_E2E_MCP_CLIENT ?? 'sdk';
  if (mode === 'sdk') {
    const client = new Client({ name, version: '1.0.0' }, {
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
        requestInit: { headers: configuration.headers },
      }));
      return client;
    } catch (error) {
      try {
        await client.close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'SDK Client connection and cleanup failed.');
      }
      throw error;
    }
  }
  if (mode !== 'current-host') throw new Error('INTERCEPTOR_E2E_MCP_CLIENT must be sdk or current-host.');
  const session = process.env.INTERCEPTOR_E2E_CURRENT_HOST_SESSION;
  if (process.platform !== 'darwin' || !session || !/^ahp-session:\/[a-f0-9-]{36}$/.test(session)) {
    throw new Error('The current Host driver requires macOS and the verified current INTERCEPTOR_E2E_CURRENT_HOST_SESSION.');
  }
  const currentHostMcpClient = new CurrentHostMcpClient(configuration, session, testInfo);
  try {
    await currentHostMcpClient.connect();
    return currentHostMcpClient;
  } catch (error) {
    try {
      await currentHostMcpClient.close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Current Host connection and cleanup failed.');
    }
    throw error;
  }
}

class CurrentHostMcpClient implements WorkflowMcpClient {
  private readonly serverName = `interceptor-e2e-${randomUUID().slice(0, 8)}`;
  private readonly pendingRequestsById = new Map<string | number, PendingHostRequest>();
  private readonly calls: HostToolEvidence[] = [];
  private readonly lifecycle = ['created'];
  private readonly evidencePath: string;
  private readonly tokenHash: string;
  private webSocket: WebSocket | undefined;
  private requestSequence = 0;
  private actionSequence = 0;
  private ownsConfiguration = false;
  private closing = false;
  private configurationRemoved = false;
  private serverStopped = false;
  private hostVersion = '';
  private protocolVersion = '';
  private hostConnectionToken = '';
  private toolNames: string[] = [];
  private protocolError: Error | undefined;
  private pendingEvidenceWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly configuration: McpConfiguration,
    private readonly session: string,
    testInfo: TestInfo,
  ) {
    const endpoint = new URL(configuration.url);
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1'
      || endpoint.pathname !== '/mcp' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
      || !configuration.headers.Authorization.startsWith('Bearer ')
      || configuration.headers.Authorization.length <= 'Bearer '.length) {
      throw new Error('The Host driver requires the real App loopback endpoint and copied Client credential.');
    }
    this.tokenHash = digest(configuration.headers.Authorization.slice('Bearer '.length));
    this.evidencePath = testInfo.outputPath(`current-host-${this.serverName}.json`);
  }

  async connect(): Promise<void> {
    let discovery: unknown;
    try {
      discovery = JSON.parse(execFileSync(CODE_CLI, ['agent', 'endpoints'], {
        encoding: 'utf8', timeout: 15_000,
      }));
    } catch {
      // CLI output and parser excerpts can contain the Host connection credential.
      throw new Error('The official Code CLI did not return a valid Host endpoint descriptor.');
    }
    if (!isRecord(discovery) || !Array.isArray(discovery.endpoints) || discovery.endpoints.length !== 1) {
      throw new Error('Expected one officially advertised local VS Code Agent Host.');
    }
    const endpoint = discovery.endpoints[0];
    if (!isRecord(endpoint) || !isRecord(endpoint.endpoint) || endpoint.endpoint.type !== 'socket'
      || typeof endpoint.endpoint.path !== 'string' || typeof endpoint.connectionToken !== 'string' || endpoint.connectionToken.length === 0
      || endpoint.protocolVersion !== '1.1.0') {
      throw new Error('This driver requires the advertised local socket and AHP 1.1.0.');
    }
    const socketPath = endpoint.endpoint.path;
    this.hostConnectionToken = endpoint.connectionToken;
    this.protocolVersion = endpoint.protocolVersion;
    const version = execFileSync(CODE_CLI, ['--version'], { encoding: 'utf8', timeout: 15_000 }).trim().split('\n')[0];
    this.hostVersion = `VS Code ${version} / AHP ${this.protocolVersion}`;
    const webSocket = new WebSocket(`ws://localhost/?tkn=${encodeURIComponent(this.hostConnectionToken)}`, {
      createConnection: () => createConnection(socketPath),
      handshakeTimeout: 10_000,
    });
    this.webSocket = webSocket;
    webSocket.on('message', bytes => {
      try {
        const message = JSONRPCMessageSchema.parse(JSON.parse(bytes.toString()));
        if ('method' in message) {
          if ('id' in message) webSocket.send(JSON.stringify({
            jsonrpc: '2.0', id: message.id,
            error: { code: -32601, message: 'The workflow Host connection does not expose client methods.' },
          }));
          return;
        }
        const id = message.id;
        if (id === undefined || id === null) throw new Error('The Host returned an uncorrelated RPC response.');
        const pending = this.pendingRequestsById.get(id);
        if (!pending) return;
        this.pendingRequestsById.delete(id);
        clearTimeout(pending.timer);
        if ('error' in message) {
          pending.reject(Object.assign(new Error(this.redact(message.error.message)), { code: message.error.code }));
        } else pending.resolve(message.result);
      } catch (error) {
        this.protocolError = new Error(`Invalid public Host JSON-RPC response (${error instanceof Error ? error.name : 'unknown error'}).`);
        this.rejectPendingRequests(this.protocolError);
      }
    });
    webSocket.on('error', error => this.rejectPendingRequests(new Error(`Public Host transport failed: ${this.errorMessage(error)}`)));
    webSocket.on('close', () => {
      if (!this.closing) this.rejectPendingRequests(new Error('The public Host connection closed unexpectedly.'));
    });
    await once(webSocket, 'open');
    this.recordLifecycle('transport-connected');
    await this.request('initialize', {
      channel: ROOT_CHANNEL, clientId: this.serverName, protocolVersions: [this.protocolVersion],
    });
    this.recordLifecycle('initialized');
    const session = await this.readState(this.session);
    if (session.provider !== 'copilotcli') throw new Error('The selected session is not the current Copilot SDK Host.');
    const servers = await this.readServerConfigurations();
    if (this.serverName in servers) throw new Error('The workflow Host Server name already exists.');
    this.ownsConfiguration = true;
    this.dispatchAction(ROOT_CHANNEL, {
      type: 'root/configChanged',
      config: { mcpServers: { ...servers, [this.serverName]: { type: 'http', ...this.configuration } } },
    });
    await this.waitFor(async () => {
      const configured = (await this.readServerConfigurations())[this.serverName];
      return isRecord(configured) && this.matchesConfiguration(configured);
    }, 'The public Host did not apply the workflow Server configuration.');
    this.verifyOtherConfigurations(servers, await this.readServerConfigurations());
    this.recordLifecycle('configuration-applied');
    await this.writeEvidence();
    console.log(
      `[current-host-mcp] ${this.serverName} configuration applied; run /mcp reload in the disposable target Host session.`,
    );
    await this.waitFor(
      async () => Boolean(await this.findServer()),
      'The target Host session did not expose the workflow Server. '
        + 'VS Code 1.143 requires an official /mcp reload turn in a disposable same-Host session '
        + 'after this configuration-applied message.',
    );
    this.recordLifecycle('server-advertised');
    await this.writeEvidence();
    const server = await this.findServer();
    if (!server || typeof server.id !== 'string') throw new Error('The workflow Server omitted its public identity.');
    this.dispatchAction(this.session, { type: 'session/mcpServerStartRequested', id: server.id });
    await this.waitFor(async () => {
      const current = await this.findServer();
      return current !== undefined && isRecord(current.state) && current.state.kind === 'ready';
    }, 'The actual Host MCP connection did not become ready.');
    this.recordLifecycle('server-ready');
    await this.writeEvidence();
    await this.listTools();
  }

  async listTools(...[params, options]: Parameters<Client['listTools']>): ReturnType<Client['listTools']> {
    const timeout = this.requestTimeout(options);
    const result = ListToolsResultSchema.parse(await this.request('tools/list', params ?? {}, await this.serverChannel(), timeout));
    if (this.protocolError) throw this.protocolError;
    this.toolNames = result.tools.map(tool => tool.name);
    this.recordLifecycle('tools-listed');
    await this.writeEvidence();
    return result;
  }

  async callTool(...[params, options]: Parameters<Client['callTool']>): ReturnType<Client['callTool']> {
    const argumentsSha256 = digest(JSON.stringify(params.arguments ?? {}));
    let result: Awaited<ReturnType<Client['callTool']>>;
    try {
      const timeout = this.requestTimeout(options);
      result = CallToolResultSchema.parse(await this.request('tools/call', params, await this.serverChannel(), timeout));
      if (this.protocolError) throw this.protocolError;
    } catch (error) {
      this.calls.push({
        name: params.name, argumentsSha256,
        error: { message: this.errorMessage(error), ...(isRecord(error) && typeof error.code === 'number' ? { code: error.code } : {}) },
      });
      await this.writeEvidence();
      throw error;
    }
    this.calls.push({ name: params.name, argumentsSha256, result });
    this.recordLifecycle('tools-called');
    await this.writeEvidence();
    return result;
  }

  async close(): Promise<void> {
    const cleanupErrors: unknown[] = [];
    try {
      if (this.ownsConfiguration) {
        await this.readOwnedServerConfigurations();
        const server = await this.findServer();
        if (server) {
          if (typeof server.id !== 'string') throw new Error('The owned Server omitted its public identity during cleanup.');
          this.dispatchAction(this.session, { type: 'session/mcpServerStopRequested', id: server.id });
          await this.waitFor(async () => {
            const current = await this.findServer();
            return current === undefined || isRecord(current.state) && current.state.kind === 'stopped';
          }, 'The Host did not stop its workflow MCP Server.');
          this.recordLifecycle('server-stopped');
        }
        this.serverStopped = true;
        const servers = await this.readOwnedServerConfigurations();
        const remaining = Object.fromEntries(Object.entries(servers).filter(([name]) => name !== this.serverName));
        this.dispatchAction(ROOT_CHANNEL, { type: 'root/configChanged', config: { mcpServers: remaining } });
        await this.waitFor(async () => !(this.serverName in await this.readServerConfigurations()),
          'The owned Host configuration was not removed.');
        this.verifyOtherConfigurations(servers, await this.readServerConfigurations());
        this.configurationRemoved = true;
        this.ownsConfiguration = false;
        this.recordLifecycle('configuration-removed');
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      this.closing = true;
      const webSocket = this.webSocket;
      if (webSocket && webSocket.readyState !== WebSocket.CLOSED) {
        const closed = once(webSocket, 'close');
        const timer = setTimeout(() => webSocket.terminate(), 5_000);
        webSocket.close();
        try { await closed; } finally { clearTimeout(timer); }
      }
      this.recordLifecycle('transport-closed');
    } catch (error) {
      cleanupErrors.push(error);
    }
    this.rejectPendingRequests(new Error('The workflow Host connection was closed.'));
    try {
      await this.writeEvidence();
      await this.pendingEvidenceWrite;
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (this.protocolError) cleanupErrors.push(this.protocolError);
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Current Host cleanup or evidence failed.');
  }

  private async serverChannel(): Promise<string> {
    if (this.protocolError) throw this.protocolError;
    const server = await this.findServer();
    if (!server || !isRecord(server.state) || server.state.kind !== 'ready'
      || typeof server.channel !== 'string' || !server.channel.startsWith('mcp://')
      || !isRecord(server.mcpApp) || !isRecord(server.mcpApp.capabilities)
      || !isRecord(server.mcpApp.capabilities.serverTools)) {
      throw new Error('The current Host has not advertised a ready serverTools MCP channel.');
    }
    return server.channel;
  }

  private async findServer(): Promise<Record<string, unknown> | undefined> {
    const session = await this.readState(this.session);
    if (!Array.isArray(session.customizations)) throw new Error('The current Host omitted its customization list.');
    const matches: Record<string, unknown>[] = [];
    const find = (values: readonly unknown[]): void => {
      for (const value of values) {
        if (!isRecord(value)) throw new Error('The current Host returned an invalid customization.');
        if (value.type === 'mcpServer' && value.name === this.serverName) matches.push(value);
        if (Array.isArray(value.children)) find(value.children);
      }
    };
    find(session.customizations);
    if (matches.length > 1) throw new Error('The current Host exposed an ambiguous workflow Server identity.');
    return matches[0];
  }

  private async readServerConfigurations(): Promise<Record<string, unknown>> {
    const root = await this.readState(ROOT_CHANNEL);
    if (!isRecord(root.config) || !isRecord(root.config.schema) || !isRecord(root.config.schema.properties)
      || !isRecord(root.config.schema.properties.mcpServers)
      || !isRecord(root.config.values) || !isRecord(root.config.values.mcpServers)) {
      throw new Error('The actual Host has not exposed its public MCP Server configuration.');
    }
    return root.config.values.mcpServers;
  }

  private async readOwnedServerConfigurations(): Promise<Record<string, unknown>> {
    const servers = await this.readServerConfigurations();
    const configured = servers[this.serverName];
    if (configured !== undefined && (!isRecord(configured) || !this.matchesConfiguration(configured))) {
      throw new Error('The owned Host configuration changed; it was preserved for manual inspection.');
    }
    return servers;
  }

  private verifyOtherConfigurations(before: Record<string, unknown>, after: Record<string, unknown>): void {
    if (Object.entries(before).some(([name, value]) => name !== this.serverName && !isDeepStrictEqual(value, after[name]))) {
      throw new Error('Other Host Server configuration changed; no unrelated configuration will be restored or replaced.');
    }
  }

  private matchesConfiguration(value: Record<string, unknown>): boolean {
    return value.url === this.configuration.url && isRecord(value.headers)
      && typeof value.headers.Authorization === 'string'
      && digest(value.headers.Authorization) === digest(this.configuration.headers.Authorization);
  }

  private async readState(channel: string): Promise<Record<string, unknown>> {
    const value = await this.request('subscribe', { channel });
    if (!isRecord(value) || !isRecord(value.snapshot) || !isRecord(value.snapshot.state)) {
      throw new Error('The public Host omitted its requested state snapshot.');
    }
    return value.snapshot.state;
  }

  private request(method: string, params: object, channel?: string, timeout = 15_000): Promise<unknown> {
    const webSocket = this.webSocket;
    if (!webSocket || webSocket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('The public Host connection is not open.'));
    const id = ++this.requestSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequestsById.delete(id);
        reject(new Error(`Public Host ${method} timed out.`));
      }, timeout);
      this.pendingRequestsById.set(id, { resolve, reject, timer });
      // VS Code 1.143 / AHP 1.1 routes the advertised MCP channel through params.
      webSocket.send(JSON.stringify({
        jsonrpc: '2.0', id, method, params: channel ? { ...params, channel } : params,
      }));
    });
  }

  private dispatchAction(channel: string, action: Record<string, unknown>): void {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) throw new Error('The public Host connection is not open.');
    this.webSocket.send(JSON.stringify({
      jsonrpc: '2.0', method: 'dispatchAction',
      params: { channel, clientSeq: ++this.actionSequence, action },
    }));
  }

  private async waitFor(check: () => Promise<boolean>, message: string): Promise<void> {
    const deadline = Date.now() + 60_000;
    do {
      if (await check()) return;
      await delay(250);
    } while (Date.now() < deadline);
    throw new Error(message);
  }

  private requestTimeout(options: unknown): number {
    if (options === undefined) return 60_000;
    if (!isRecord(options) || Object.keys(options).some(key => key !== 'timeout')) {
      throw new Error('The advertised Host channel supports only the explicit request timeout option; other SDK options are not emulated.');
    }
    if (options.timeout === undefined) return 60_000;
    if (typeof options.timeout !== 'number' || !Number.isFinite(options.timeout) || options.timeout <= 0) {
      throw new Error('The Host request timeout must be a positive finite number.');
    }
    return options.timeout;
  }

  private rejectPendingRequests(error: Error): void {
    for (const request of this.pendingRequestsById.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pendingRequestsById.clear();
  }

  private redact(text: string): string {
    let value = text.replaceAll(this.configuration.headers.Authorization.slice('Bearer '.length), '<redacted>');
    if (this.hostConnectionToken) value = value.replaceAll(this.hostConnectionToken, '<redacted>');
    return value;
  }

  private errorMessage(error: unknown): string {
    return this.redact(error instanceof Error ? error.message : String(error));
  }

  private recordLifecycle(stage: string): void {
    if (this.lifecycle.at(-1) !== stage) this.lifecycle.push(stage);
  }

  private writeEvidence(): Promise<void> {
    this.pendingEvidenceWrite = this.pendingEvidenceWrite.then(async () => {
      const text = JSON.stringify({
        schemaVersion: 2, source: 'Current VS Code Host public MCP channel, not a direct product SDK Client',
        session: this.session, serverName: this.serverName, hostVersion: this.hostVersion,
        protocolVersion: this.protocolVersion, endpoint: this.configuration.url, tokenHash: this.tokenHash,
        lifecycle: this.lifecycle, requiredHostRefresh: '/mcp reload',
        toolNames: this.toolNames, calls: this.calls,
        protocolError: this.protocolError?.message,
        cleanup: { serverStopped: this.serverStopped, configurationRemoved: this.configurationRemoved },
      }, null, 2);
      if (this.redact(text) !== text) throw new Error('Refusing to write Host authentication material into workflow evidence.');
      await writeFile(this.evidencePath, text, { encoding: 'utf8', mode: 0o600 });
    });
    return this.pendingEvidenceWrite;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
