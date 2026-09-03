import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import type { McpApprovalRequest } from '@interceptor/mcp-server';
import { buildInterceptorToolSettingsGroups } from '@interceptor/tools';

import type { ToolCapabilitySettingsSnapshot } from '../../../../shared/desktop-api';
import { CoreRuntime } from '../../../core/core-runtime';
import type { CoreRequestOptions, SecureStore } from '../../../interfaces';
import { ToolCapabilitySettingsService } from '../../../tool-capabilities/entry';
import { McpDesktopService } from '../../entry';
import { McpSettingsStore } from '../../internal/settings-store';

/** Reversible encryption fake for the persisted Client record. */
class FakeSecureStore implements SecureStore {
  /** Secure storage remains available for these integration tests. */
  isEncryptionAvailable(): boolean {
    return true;
  }

  /** Encodes plaintext into a non-plaintext file representation. */
  encryptString(plaintext: string): Buffer {
    return Buffer.from(Buffer.from(plaintext, 'utf8').toString('base64'), 'utf8');
  }

  /** Decodes the reversible test representation. */
  decryptString(data: Buffer): string {
    return Buffer.from(data.toString('utf8'), 'base64').toString('utf8');
  }
}

/** Concrete CoreRuntime fake required by the Main ownership boundary. */
class FakeCoreRuntime extends CoreRuntime {
  /** Commands received from MCP Tools. */
  readonly commands: CoreCommand[] = [];
  /** Whether Capture cleanup should fail before committing. */
  failCaptureCleanup = false;

  /** Returns deterministic results for the connected vertical slice. */
  override async request<T extends CoreCommand>(
    command: T,
    _options: CoreRequestOptions = {},
  ): Promise<CoreResultForCommand<T>> {
    this.commands.push(command);
    if (command.type === 'proxy.status') {
      return {
        type: 'proxy.status',
        payload: { listening: true, recording: true },
      } as CoreResultForCommand<T>;
    }
    if (command.type === 'proxy.setRecording') {
      return {
        type: 'capture.status',
        payload: { recording: false },
      } as unknown as CoreResultForCommand<T>;
    }
    if (command.type === 'capture.cleanup') {
      if (this.failCaptureCleanup) throw new Error('cleanup failed');
      return {
        type: 'capture.status',
        payload: {
          sessionCount: 0,
          exchangeCount: 0,
          bodyCount: 0,
          databaseBytes: 4_096,
          blobBytes: 0,
          totalBytes: 4_096,
        },
      } as unknown as CoreResultForCommand<T>;
    }
    throw new Error(`Unexpected Core command "${command.type}".`);
  }
}

/** Mutable MCP Tool exposure fake over the real owning service class. */
class FakeToolCapabilitySettingsService extends ToolCapabilitySettingsService {
  /** Current disabled MCP names. */
  mcpDisabledToolNames: string[] = [];

  constructor() {
    super('unused');
  }

  /** Returns a detached Settings snapshot. */
  override snapshot(): ToolCapabilitySettingsSnapshot {
    return {
      groups: buildInterceptorToolSettingsGroups(),
      agentDisabledToolNames: [],
      mcpDisabledToolNames: [...this.mcpDisabledToolNames],
    };
  }
}

describe('McpDesktopService', () => {
  /** Temporary profiles removed after each test. */
  const roots: string[] = [];
  /** Services stopped after each test. */
  const services: McpDesktopService[] = [];
  /** Clients closed after each test. */
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    await Promise.allSettled(services.splice(0).map((service) => service.stop()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    vi.restoreAllMocks();
  });

  it('publishes one timestamped reset after Capture cleanup succeeds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234);
    const fixture = await createFixture(roots, services);

    await fixture.mcpDesktopService.invoke(
      { type: 'capture.cleanup', payload: { scope: 'all' } },
      new AbortController().signal,
    );

    expect(fixture.captureReset).toHaveBeenCalledWith({ clearedBefore: 1_234 });
  });

  it('does not publish a reset when Capture cleanup fails', async () => {
    const fixture = await createFixture(roots, services);
    fixture.coreRuntime.failCaptureCleanup = true;

    await expect(fixture.mcpDesktopService.invoke(
      { type: 'capture.cleanup', payload: { scope: 'all' } },
      new AbortController().signal,
    )).rejects.toThrow('cleanup failed');

    expect(fixture.captureReset).not.toHaveBeenCalled();
  });

  it('enables one loopback endpoint and projects current MCP Tool switches', async () => {
    const fixture = await createFixture(roots, services);
    await fixture.mcpDesktopService.enableServer();
    const client = await fixture.mcpDesktopService.createClient('VS Code');
    await fixture.mcpDesktopService.copyClientConfiguration(client.clientId);
    const firstConfiguration = readVsCodeConfiguration(fixture.copiedText());
    const firstClient = await connectClient(firstConfiguration);
    clients.push(firstClient);

    expect(fixture.mcpDesktopService.status()).toMatchObject({
      state: 'running',
      endpoint: firstConfiguration.url,
      clients: [{ clientId: client.clientId, label: 'VS Code', executionMode: 'ask' }],
    });
    expect((await firstClient.listTools()).tools.map((tool) => tool.name))
      .toContain('get_proxy_status');

    fixture.toolCapabilitySettingsService.mcpDisabledToolNames = ['get_proxy_status'];
    const secondClient = await connectClient(firstConfiguration);
    clients.push(secondClient);
    expect((await secondClient.listTools()).tools.map((tool) => tool.name))
      .not.toContain('get_proxy_status');
  });

  it('holds an Ask call for an app-level verdict and lets Auto bypass only the prompt', async () => {
    const fixture = await createFixture(roots, services);
    await fixture.mcpDesktopService.enableServer();
    const registration = await fixture.mcpDesktopService.createClient('VS Code');
    await fixture.mcpDesktopService.copyClientConfiguration(registration.clientId);
    const client = await connectClient(readVsCodeConfiguration(fixture.copiedText()));
    clients.push(client);

    const deniedCall = client.callTool({ name: 'stop_recording', arguments: {} });
    await vi.waitFor(() => expect(fixture.approvals).toHaveLength(1));
    expect(fixture.coreRuntime.commands.map((command) => command.type))
      .not.toContain('proxy.setRecording');
    fixture.mcpDesktopService.denyToolCall(fixture.approvals[0]!.approvalId);
    await expect(deniedCall).resolves.toMatchObject({ isError: true });

    await fixture.mcpDesktopService.automaticallyExecuteClientTools(registration.clientId);
    await expect(client.callTool({ name: 'stop_recording', arguments: {} }))
      .resolves.not.toMatchObject({ isError: true });
    expect(fixture.approvals).toHaveLength(1);
    expect(fixture.coreRuntime.commands.map((command) => command.type))
      .toContain('proxy.setRecording');
  });

  it('closes an approval when its external request is aborted', async () => {
    const fixture = await createFixture(roots, services, undefined, {
      approvalTimeoutMilliseconds: 50,
    });
    const abortController = new AbortController();
    const approval: McpApprovalRequest = {
      approvalId: 'approval-aborted',
      identity: { clientId: 'client-aborted', label: 'External client' },
      toolName: 'stop_recording',
      toolTitle: 'Stop recording',
      destructive: false,
      arguments: {},
    };

    const verdict = fixture.mcpDesktopService.requestApproval(
      approval,
      abortController.signal,
    );
    abortController.abort();

    await expect(verdict).resolves.toBe('cancelled');
    expect(fixture.closedApprovalIds).toEqual([approval.approvalId]);
  });

  it('reuses the same URL and token after app restart until the user regenerates it', async () => {
    const first = await createFixture(roots, services);
    await first.mcpDesktopService.enableServer();
    const registration = await first.mcpDesktopService.createClient('VS Code');
    await first.mcpDesktopService.copyClientConfiguration(registration.clientId);
    const original = readVsCodeConfiguration(first.copiedText());
    await first.mcpDesktopService.stop();
    services.splice(services.indexOf(first.mcpDesktopService), 1);

    const second = await createFixture(roots, services, first.root);
    expect(second.mcpDesktopService.status()).toMatchObject({
      state: 'running',
      endpoint: original.url,
    });
    const restoredClient = await connectClient(original);
    clients.push(restoredClient);
    await expect(restoredClient.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });

    await second.mcpDesktopService.regenerateClientCredential(registration.clientId);
    const oldTokenResponse = await fetch(original.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${original.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(oldTokenResponse.status).toBe(401);

    await second.mcpDesktopService.copyClientConfiguration(registration.clientId);
    const regenerated = readVsCodeConfiguration(second.copiedText());
    expect(regenerated.url).toBe(original.url);
    expect(regenerated.token).not.toBe(original.token);
    const regeneratedClient = await connectClient(regenerated);
    clients.push(regeneratedClient);
    await expect(regeneratedClient.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });
  });

  it('rejects the old token while a credential rotation is being persisted', async () => {
    const fixture = await createFixture(roots, services);
    await fixture.mcpDesktopService.enableServer();
    const registration = await fixture.mcpDesktopService.createClient('VS Code');
    await fixture.mcpDesktopService.copyClientConfiguration(registration.clientId);
    const original = readVsCodeConfiguration(fixture.copiedText());
    const originalRegenerate = McpSettingsStore.prototype.regenerateClientCredential;
    let releasePersistence!: () => void;
    let reportPersistenceStarted!: () => void;
    const persistenceBlocked = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const persistenceStarted = new Promise<void>((resolve) => {
      reportPersistenceStarted = resolve;
    });
    vi.spyOn(McpSettingsStore.prototype, 'regenerateClientCredential')
      .mockImplementationOnce(async function regenerateClientCredential(
        this: McpSettingsStore,
        clientId,
      ) {
        reportPersistenceStarted();
        await persistenceBlocked;
        return originalRegenerate.call(this, clientId);
      });

    const rotation = fixture.mcpDesktopService.regenerateClientCredential(registration.clientId);
    await persistenceStarted;
    const response = await fetch(original.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${original.token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    releasePersistence();
    await rotation;

    expect(response.status).toBe(401);
  });
});

async function createFixture(
  roots: string[],
  services: McpDesktopService[],
  existingRoot?: string,
  options: { approvalTimeoutMilliseconds?: number } = {},
): Promise<{
  approvals: McpApprovalRequest[];
  captureReset: ReturnType<typeof vi.fn>;
  closedApprovalIds: string[];
  copiedText: () => string;
  coreRuntime: FakeCoreRuntime;
  mcpDesktopService: McpDesktopService;
  root: string;
  toolCapabilitySettingsService: FakeToolCapabilitySettingsService;
}> {
  const root = existingRoot ?? await mkdtemp(path.join(os.tmpdir(), 'interceptor-mcp-service-'));
  if (existingRoot === undefined) roots.push(root);
  const coreRuntime = new FakeCoreRuntime();
  const toolCapabilitySettingsService = new FakeToolCapabilitySettingsService();
  const approvals: McpApprovalRequest[] = [];
  const captureReset = vi.fn();
  const closedApprovalIds: string[] = [];
  let copiedText = '';
  const mcpDesktopService = new McpDesktopService({
    appVersion: '0.1.0',
    coreRuntime,
    dataDirectory: root,
    secureStore: new FakeSecureStore(),
    toolCapabilitySettingsService,
    approvalRequested: (request) => approvals.push(request),
    approvalClosed: (approvalId) => closedApprovalIds.push(approvalId),
    captureStatusChanged: () => undefined,
    captureReset,
    copyText: (value) => {
      copiedText = value;
    },
    showAndFocusWindow: () => undefined,
    ...(options.approvalTimeoutMilliseconds === undefined
      ? {}
      : { approvalTimeoutMilliseconds: options.approvalTimeoutMilliseconds }),
  });
  services.push(mcpDesktopService);
  await mcpDesktopService.start();
  return {
    approvals,
    captureReset,
    closedApprovalIds,
    copiedText: () => copiedText,
    coreRuntime,
    mcpDesktopService,
    root,
    toolCapabilitySettingsService,
  };
}

function readVsCodeConfiguration(value: string): { token: string; url: string } {
  const parsed = JSON.parse(value) as {
    servers: { interceptor: { headers: { Authorization: string }; url: string } };
  };
  const authorization = parsed.servers.interceptor.headers.Authorization;
  expect(authorization).toMatch(/^Bearer /);
  return {
    token: authorization.slice('Bearer '.length),
    url: parsed.servers.interceptor.url,
  };
}

async function connectClient(configuration: { token: string; url: string }): Promise<Client> {
  const client = new Client(
    { name: 'desktop-service-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
    requestInit: { headers: { Authorization: `Bearer ${configuration.token}` } },
  }));
  return client;
}