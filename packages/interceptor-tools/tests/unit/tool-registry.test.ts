import { describe, expect, it } from 'vitest';

import type { CoreCommand } from '@interceptor/core-protocol';

import {
  buildInterceptorToolCatalog,
  buildInterceptorToolRegistry,
  TOOL_BODY_PREVIEW_MAX_BYTES,
  type InterceptorToolDefinition,
  type InterceptorToolHost,
} from '../../src';

const TOOL_NAMES = [
  'get_proxy_status',
  'get_storage_status',
  'start_recording',
  'stop_recording',
  'clear_capture',
  'list_exchanges',
  'get_exchange',
  'get_exchange_body',
  'list_websocket_messages',
  'list_grpc_messages',
  'get_rules',
  'get_rule_hits',
  'apply_rules',
  'list_breakpoints',
  'enable_http_breakpoints',
  'disable_http_breakpoints',
  'enable_websocket_breakpoint',
  'disable_websocket_breakpoint',
  'continue_breakpoint',
  'forward_edited_breakpoint',
  'drop_breakpoint',
  'send_request',
  'probe_connection',
  'query_diagnostics',
] as const;

class FakeToolHost implements InterceptorToolHost {
  readonly commands: CoreCommand[] = [];
  readonly #results: ReadonlyMap<string, unknown>;

  constructor(results: Readonly<Record<string, unknown>> = {}) {
    this.#results = new Map(Object.entries(results));
  }

  async invoke(command: CoreCommand): Promise<never> {
    this.commands.push(command);
    const result = this.#results.get(command.type);
    if (result === undefined) throw new Error(`no fake result for ${command.type}`);
    return result as never;
  }
}

function definition(name: string): InterceptorToolDefinition {
  const result = buildInterceptorToolRegistry().find((tool) => tool.name === name);
  if (!result) throw new Error(`missing Tool ${name}`);
  return result;
}

async function execute(
  name: string,
  args: Readonly<Record<string, unknown>>,
  fakeToolHost: FakeToolHost,
): Promise<unknown> {
  return definition(name).execute(args, {
    host: fakeToolHost,
    abortSignal: new AbortController().signal,
  });
}

describe('Interceptor Tool registry', () => {
  it('registers the exact 24 transport-neutral Tools in stable order', () => {
    const tools = buildInterceptorToolRegistry();

    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    expect(new Set(tools.map((tool) => tool.name))).toHaveLength(24);
    expect(tools.every((tool) => tool.capabilityId.length > 0)).toBe(true);
    expect(tools.every((tool) => tool.kind === 'query' || tool.kind === 'change')).toBe(true);
    expect(tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      'set_recording',
      'configure_breakpoint',
      'resolve_breakpoint',
    ]));
  });

  it('projects progressive discovery descriptors from the same executable registry', () => {
    const registry = buildInterceptorToolRegistry();
    const catalog = buildInterceptorToolCatalog(registry);

    expect(catalog.listCapabilities().map((capability) => capability.id)).toEqual([
      'traffic',
      'rules',
      'breakpoints',
      'requests',
      'diagnostics',
    ]);
    const discovered = catalog.discover({ capabilityId: 'traffic' });
    expect(discovered.map((match) => match.descriptor.name)).toEqual(
      registry.filter((tool) => tool.capabilityId === 'traffic').map((tool) => tool.name),
    );
    expect(discovered[0]?.descriptor).not.toHaveProperty('execute');
  });

  it('maps recording and HTTP breakpoint intents to separate Core commands', async () => {
    const fakeToolHost = new FakeToolHost({
      'proxy.start': { type: 'proxy.status', payload: {} },
      'proxy.setRecording': { type: 'proxy.status', payload: {} },
      'breakpoint.configure': { type: 'breakpoint.configuration', payload: {} },
    });

    await execute('start_recording', {}, fakeToolHost);
    await execute('stop_recording', {}, fakeToolHost);
    await execute('enable_http_breakpoints', {}, fakeToolHost);
    await execute('disable_http_breakpoints', {}, fakeToolHost);

    expect(fakeToolHost.commands).toEqual([
      { type: 'proxy.start', payload: {} },
      { type: 'proxy.setRecording', payload: { recording: false } },
      { type: 'breakpoint.configure', payload: { enabled: true } },
      { type: 'breakpoint.configure', payload: { enabled: false } },
    ]);
    expect(definition('stop_recording').effectDescription)
      .toBe('New traffic will continue through the proxy but will not be captured.');
  });

  it('maps continue, edited forward, and drop to distinct breakpoint actions', async () => {
    const fakeToolHost = new FakeToolHost({
      'breakpoint.resolve': { type: 'breakpoint.resolution', payload: {} },
    });

    await execute('continue_breakpoint', { breakpointId: 'bp-1' }, fakeToolHost);
    await execute('forward_edited_breakpoint', { breakpointId: 'bp-2', body: '' }, fakeToolHost);
    await execute('drop_breakpoint', { breakpointId: 'bp-3' }, fakeToolHost);

    expect(fakeToolHost.commands).toEqual([
      { type: 'breakpoint.resolve', payload: { breakpointId: 'bp-1', action: 'continue' } },
      {
        type: 'breakpoint.resolve',
        payload: { breakpointId: 'bp-2', action: 'continue', edit: { body: '' } },
      },
      { type: 'breakpoint.resolve', payload: { breakpointId: 'bp-3', action: 'drop' } },
    ]);
    await expect(execute('forward_edited_breakpoint', { breakpointId: 'bp-4' }, fakeToolHost))
      .rejects.toThrow('at least one edit');
  });

  it('clears only the complete Capture and rejects the obsolete session scope', async () => {
    const fakeToolHost = new FakeToolHost({
      'capture.cleanup': { type: 'capture.cleaned', payload: {} },
    });

    await execute('clear_capture', {}, fakeToolHost);

    expect(fakeToolHost.commands).toEqual([
      { type: 'capture.cleanup', payload: { scope: 'all' } },
    ]);
    await expect(execute('clear_capture', { scope: 'session', sessionId: 's1' }, fakeToolHost))
      .rejects.toThrow('unknown argument');
  });

  it('preserves the complete Rule tree and enabled state during compare-and-replace', async () => {
    const nodes = [{
      kind: 'folder',
      id: 'folder-1',
      name: 'Auth',
      children: [{ kind: 'rule', id: 'rule-1', name: 'Redirect', enabled: true }],
    }];
    const fakeToolHost = new FakeToolHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 7, nodes: [] } } },
      'rules.replace': { type: 'rules.revision', payload: { revision: 8 } },
    });

    await execute('apply_rules', { baseRevision: 7, nodes }, fakeToolHost);

    expect(fakeToolHost.commands.at(-1)).toEqual({
      type: 'rules.replace',
      payload: { expectedRevision: 7, nodes },
    });
  });

  it('does not replace Rules when the base revision moved', async () => {
    const fakeToolHost = new FakeToolHost({
      'rules.get': { type: 'rules.ruleset', payload: { ruleSet: { revision: 9, nodes: [] } } },
    });

    await expect(execute('apply_rules', { baseRevision: 7, nodes: [] }, fakeToolHost))
      .rejects.toThrow('rule set moved from revision 7 to 9');
    expect(fakeToolHost.commands.map((command) => command.type)).not.toContain('rules.replace');
  });

  it('derives body media type and encoding from the owning exchange', async () => {
    const mediaHost = new FakeToolHost({
      'sessions.detail': {
        type: 'sessions.detail',
        payload: {
          detail: {
            requestBody: {
              bodyHash: 'media-body',
              mediaType: 'video/mp4',
              contentEncoding: 'gzip',
            },
          },
        },
      },
    });

    const media = await execute('get_exchange_body', {
      exchangeId: 'exchange-1',
      bodyId: 'media-body',
    }, mediaHost);

    expect(media).toMatchObject({ bodyId: 'media-body', opaque: true, mimeType: 'video/mp4' });
    expect(mediaHost.commands).toEqual([
      { type: 'sessions.detail', payload: { exchangeId: 'exchange-1' } },
    ]);

    const textHost = new FakeToolHost({
      'sessions.detail': {
        type: 'sessions.detail',
        payload: {
          detail: {
            responseBody: {
              bodyHash: 'text-body',
              mediaType: 'text/plain',
              contentEncoding: 'br',
            },
          },
        },
      },
      'body.read-range': {
        type: 'body.range',
        payload: {
          bodyId: 'text-body',
          offset: 0,
          end: 5,
          decodeStatus: 'decoded',
          data: new TextEncoder().encode('hello'),
        },
      },
    });

    await execute('get_exchange_body', {
      exchangeId: 'exchange-2',
      bodyId: 'text-body',
    }, textHost);

    expect(textHost.commands).toEqual([
      { type: 'sessions.detail', payload: { exchangeId: 'exchange-2' } },
      {
        type: 'body.read-range',
        payload: {
          bodyId: 'text-body',
          offset: 0,
          length: 64 * 1024,
          decode: true,
          encoding: 'br',
        },
      },
    ]);
    expect(definition('get_exchange_body').inputSchema).toMatchObject({
      required: ['exchangeId', 'bodyId'],
      properties: { exchangeId: { type: 'string' }, bodyId: { type: 'string' } },
    });
    expect(definition('get_exchange_body').inputSchema.properties).not.toHaveProperty('mimeType');
  });

  it('maps WebSocket and gRPC message pagination to their formal Core commands', async () => {
    const webSocketPage = {
      items: [{
        seq: 2,
        direction: 'server-to-client',
        opcode: 1,
        timestamp: 1_000,
        payloadSize: 5,
      }],
      nextCursor: 'ws-next',
      hasMore: true,
      breakpoint: null,
    };
    const grpcPage = {
      recognized: true,
      side: 'response',
      contentType: 'application/grpc+json',
      bodySize: 24,
      items: [{
        index: 0,
        envelopeOffset: 0,
        payloadOffset: 5,
        payloadLength: 19,
        compressed: false,
        truncated: false,
      }],
      hasMore: false,
    };
    const fakeToolHost = new FakeToolHost({
      'websocket.frames': { type: 'websocket.frames', payload: webSocketPage },
      'grpc.messages': { type: 'grpc.messages', payload: grpcPage },
    });

    await expect(execute('list_websocket_messages', {
      exchangeId: 'exchange-ws',
      cursor: 'ws-cursor',
      limit: 25,
      direction: 'server-to-client',
    }, fakeToolHost)).resolves.toEqual(webSocketPage);
    await expect(execute('list_grpc_messages', {
      exchangeId: 'exchange-grpc',
      side: 'response',
      cursor: 'grpc-cursor',
      limit: 30,
    }, fakeToolHost)).resolves.toEqual(grpcPage);

    expect(fakeToolHost.commands).toEqual([
      {
        type: 'websocket.frames',
        payload: {
          exchangeId: 'exchange-ws',
          cursor: 'ws-cursor',
          limit: 25,
          direction: 'server-to-client',
        },
      },
      {
        type: 'grpc.messages',
        payload: {
          exchangeId: 'exchange-grpc',
          side: 'response',
          cursor: 'grpc-cursor',
          limit: 30,
        },
      },
    ]);
  });

  it('redacts sensitive request and response trailers with headers', async () => {
    const fakeToolHost = new FakeToolHost({
      'sessions.detail': {
        type: 'sessions.detail',
        payload: {
          detail: {
            url: 'https://example.test/',
            summary: { path: '/' },
            requestHeaders: [{ name: 'authorization', value: 'request-secret' }],
            responseHeaders: [{ name: 'set-cookie', value: 'response-secret' }],
            requestTrailers: [{ name: 'x-api-key', value: 'trailer-secret' }],
            responseTrailers: [{ name: 'x-auth-token', value: 'trailer-secret' }],
          },
        },
      },
    });

    const result = await execute('get_exchange', { exchangeId: 'exchange-1' }, fakeToolHost);

    expect(result).toMatchObject({
      detail: {
        requestHeaders: [{ value: '<redacted>' }],
        responseHeaders: [{ value: '<redacted>' }],
        requestTrailers: [{ value: '<redacted>' }],
        responseTrailers: [{ value: '<redacted>' }],
      },
    });
  });

  it('rejects declared numeric bounds before invoking a product command', async () => {
    const fakeToolHost = new FakeToolHost();

    await expect(execute('probe_connection', { host: 'example.com', port: 0 }, fakeToolHost))
      .rejects.toThrow('"port" must be at least 1');
    await expect(execute('probe_connection', { host: 'example.com', port: 65_536 }, fakeToolHost))
      .rejects.toThrow('"port" must be at most 65535');
    await expect(execute(
      'probe_connection',
      { host: 'example.com', port: 443, timeoutMs: 0 },
      fakeToolHost,
    )).rejects.toThrow('"timeoutMs" must be at least 1');
    await expect(execute(
      'forward_edited_breakpoint',
      { breakpointId: 'bp-1', statusCode: 99 },
      fakeToolHost,
    )).rejects.toThrow('"statusCode" must be at least 100');
    await expect(execute('list_exchanges', { limit: 0 }, fakeToolHost))
      .rejects.toThrow('"limit" must be at least 1');
    await expect(execute('list_exchanges', { limit: 201 }, fakeToolHost))
      .rejects.toThrow('"limit" must be at most 200');
    await expect(execute(
      'get_exchange_body',
      { exchangeId: 'exchange-1', bodyId: 'body-1', length: 0 },
      fakeToolHost,
    )).rejects.toThrow('"length" must be at least 1');
    await expect(execute(
      'get_exchange_body',
      { exchangeId: 'exchange-1', bodyId: 'body-1', length: TOOL_BODY_PREVIEW_MAX_BYTES + 1 },
      fakeToolHost,
    )).rejects.toThrow(`"length" must be at most ${TOOL_BODY_PREVIEW_MAX_BYTES}`);
    expect(fakeToolHost.commands).toHaveLength(0);
  });

  it('publishes the exact Composer header schema', () => {
    expect(definition('send_request').inputSchema.properties['headers']).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          value: { type: 'string' },
        },
        required: ['name', 'value'],
        additionalProperties: false,
      },
    });
  });

  it('preserves an empty Composer body and redacts its bounded response', async () => {
    const timing = {
      dnsMs: 1,
      tcpMs: 2,
      tlsMs: 3,
      requestMs: 4,
      waitingMs: 5,
      downloadMs: 6,
      totalMs: 21,
    };
    const tls = {
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_256_GCM_SHA384',
      alpn: 'h2',
      subject: 'example.test',
      issuer: 'Test CA',
      validFrom: '2026-01-01',
      validTo: '2027-01-01',
    };
    const fakeToolHost = new FakeToolHost({
      'composer.send': {
        type: 'composer.response',
        payload: {
          ok: true,
          status: 200,
          statusText: 'OK',
          httpVersion: '2.0',
          headers: [
            { name: 'content-type', value: 'text/plain' },
            { name: 'set-cookie', value: 'session=secret' },
          ],
          body: new TextEncoder().encode('x'.repeat(TOOL_BODY_PREVIEW_MAX_BYTES + 1)),
          totalBytes: TOOL_BODY_PREVIEW_MAX_BYTES + 1,
          durationMs: 1,
          timing,
          tls,
          remoteAddress: '127.0.0.1',
        },
      },
    });

    const result = await execute('send_request', {
      method: 'POST',
      url: 'https://example.test/',
      body: '',
    }, fakeToolHost);

    expect(fakeToolHost.commands[0]).toMatchObject({
      type: 'composer.send',
      payload: { body: '' },
    });
    expect(result).toMatchObject({
      headers: [
        { name: 'content-type', value: 'text/plain' },
        { name: 'set-cookie', value: '<redacted>' },
      ],
      timing,
      tls,
      body: { truncated: true, bytesRead: TOOL_BODY_PREVIEW_MAX_BYTES },
    });
    expect(result).not.toHaveProperty('bodyText');
  });
});