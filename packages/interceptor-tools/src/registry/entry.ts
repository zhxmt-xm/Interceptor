import { collectLeaves } from '@interceptor/core-protocol';
import type {
  BreakpointEdit,
  CaptureBodyRef,
  CaptureExchangeDetail,
  RuleHeaderPair,
  RuleNode,
  WebSocketBreakpointDirection,
  WebSocketBreakpointFrame,
} from '@interceptor/core-protocol';

import {
  InterceptorToolArgumentError,
  optionalEnum,
  optionalInteger,
  optionalIntegerInRange,
  optionalString,
  optionalText,
  readPageLimit,
  rejectUnknownKeys,
  requireEnum,
  requireInteger,
  requireIntegerInRange,
  requireObjectArray,
  requireString,
  requireStringArray,
} from '../arguments/entry';
import { InterceptorToolCatalog } from '../catalog/entry';
import type { ToolCapability, ToolDescriptor } from '../catalog/entry';
import type {
  InterceptorToolDefinition,
  InterceptorToolJsonSchema,
  InterceptorToolJsonSchemaProperty,
} from '../interfaces';
import { InterceptorToolRedactor } from '../redaction/entry';
import { TOOL_BODY_PREVIEW_MAX_BYTES } from '../constants';

const WEBSOCKET_DIRECTIONS: readonly WebSocketBreakpointDirection[] = [
  'both',
  'client-to-server',
  'server-to-client',
];

const WEBSOCKET_FRAMES: readonly WebSocketBreakpointFrame[] = [
  'message',
  'ping',
  'pong',
  'close',
];

/** Capability summaries disclosed before individual Tool schemas. */
export const INTERCEPTOR_TOOL_CAPABILITIES: readonly ToolCapability[] = [
  {
    id: 'traffic',
    title: 'Traffic',
    description: 'Inspect and control Capture, proxy state, HTTP, WebSocket, and gRPC traffic.',
  },
  {
    id: 'rules',
    title: 'Rules',
    description: 'Inspect Rule configuration and replace the complete Rule tree.',
  },
  {
    id: 'breakpoints',
    title: 'Breakpoints',
    description: 'Inspect and resolve suspended HTTP and WebSocket traffic.',
  },
  {
    id: 'requests',
    title: 'Requests',
    description: 'Send Composer requests and probe TLS connections.',
  },
  {
    id: 'diagnostics',
    title: 'Diagnostics',
    description: 'Query structured application diagnostics.',
  },
];

/** Stable registry order grouped for Settings and discovery. */
export const INTERCEPTOR_TOOL_NAMES = [
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

/** Builds the complete set of currently implemented transport-neutral Tools. */
export function buildInterceptorToolRegistry(
  interceptorToolRedactor = new InterceptorToolRedactor(),
): readonly InterceptorToolDefinition[] {
  const definitions = [
    ...buildQueryTools(interceptorToolRedactor),
    ...buildChangeTools(interceptorToolRedactor),
  ];
  const definitionsByName = new Map(definitions.map((tool) => [tool.name, tool]));
  if (definitionsByName.size !== definitions.length) {
    throw new Error('Interceptor Tool registry contains duplicate names.');
  }
  const orderedDefinitions = INTERCEPTOR_TOOL_NAMES.map((name) => {
    const definition = definitionsByName.get(name);
    if (!definition) throw new Error(`Interceptor Tool registry is missing "${name}".`);
    definitionsByName.delete(name);
    return definition;
  });
  if (definitionsByName.size > 0) {
    throw new Error(
      `Interceptor Tool registry contains unordered Tool(s): ${[...definitionsByName.keys()].join(', ')}`,
    );
  }
  return orderedDefinitions;
}

/** Builds Tools that only read product state. */
function buildQueryTools(
  interceptorToolRedactor: InterceptorToolRedactor,
): readonly InterceptorToolDefinition[] {
  return [
    {
      name: 'list_exchanges',
      title: 'List captured exchanges',
      description: 'List captured exchanges with filters and keyset pagination.',
      capabilityId: 'traffic',
      searchTerms: ['capture', 'http', 'request', 'response'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        cursor: property('string', 'Keyset cursor from a previous page.'),
        limit: property('integer', 'Maximum rows to return.', { minimum: 1, maximum: 200 }),
        sort: property('string', 'Sort order by start time.', { enum: ['started_desc', 'started_asc'] }),
        host: property('string', 'Match exchanges whose host contains this text.'),
        method: property('string', 'Exact HTTP method.'),
        status: property('integer', 'Exact response status code.'),
        mime: property('string', 'Match the response content type.'),
        appName: property('string', 'Client application name.'),
        search: property('string', 'Free-text URL and host search.'),
        protocol: property('string', 'Wire protocol family.', { enum: ['h1', 'h2', 'ws'] }),
      }),
      async execute(args, context) {
        rejectUnknownKeys(args, [
          'cursor', 'limit', 'sort', 'host', 'method',
          'status', 'mime', 'appName', 'search', 'protocol',
        ]);
        const result = await context.host.invoke({
          type: 'sessions.query',
          payload: {
            cursor: optionalString(args, 'cursor'),
            limit: readPageLimit(args),
            sort: optionalEnum(args, 'sort', ['started_desc', 'started_asc'] as const)
              ?? 'started_desc',
            filter: {
              host: optionalString(args, 'host'),
              method: optionalString(args, 'method'),
              status: optionalInteger(args, 'status'),
              mime: optionalString(args, 'mime'),
              appName: optionalString(args, 'appName'),
              search: optionalString(args, 'search'),
              protocol: optionalEnum(args, 'protocol', ['h1', 'h2', 'ws'] as const),
            },
          },
        }, context.abortSignal);
        return {
          items: result.payload.items.map((item) => ({
            ...item,
            path: interceptorToolRedactor.redactPath(item.path),
          })),
          nextCursor: result.payload.nextCursor,
          hasMore: result.payload.hasMore,
        };
      },
    },
    {
      name: 'get_exchange',
      title: 'Get exchange detail',
      description: 'Read headers, timings, TLS metadata, and Rule effects for one exchange.',
      capabilityId: 'traffic',
      searchTerms: ['capture', 'request', 'response', 'headers', 'timing', 'tls'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        exchangeId: property('string', 'Exchange identifier from list_exchanges.'),
      }, ['exchangeId']),
      async execute(args, context) {
        rejectUnknownKeys(args, ['exchangeId']);
        const result = await context.host.invoke({
          type: 'sessions.detail',
          payload: { exchangeId: requireString(args, 'exchangeId') },
        }, context.abortSignal);
        const detail = result.payload.detail;
        if (detail === null) return { detail: null };
        return {
          detail: {
            ...detail,
            url: interceptorToolRedactor.redactUrl(detail.url),
            summary: {
              ...detail.summary,
              path: interceptorToolRedactor.redactPath(detail.summary.path),
            },
            requestHeaders: interceptorToolRedactor.redactHeaders(detail.requestHeaders),
            responseHeaders: interceptorToolRedactor.redactHeaders(detail.responseHeaders),
            requestTrailers: interceptorToolRedactor.redactHeaders(detail.requestTrailers),
            responseTrailers: interceptorToolRedactor.redactHeaders(detail.responseTrailers),
          },
        };
      },
    },
    {
      name: 'get_exchange_body',
      title: 'Read exchange body',
      description: 'Read a bounded byte range from a request or response body.',
      capabilityId: 'traffic',
      searchTerms: ['capture', 'request', 'response', 'payload', 'content'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        exchangeId: property('string', 'Exchange identifier from get_exchange.'),
        bodyId: property('string', 'Body identifier from get_exchange.'),
        offset: property('integer', 'Byte offset to start from.', { minimum: 0 }),
        length: property('integer', 'Bytes to read.', {
          minimum: 1,
          maximum: TOOL_BODY_PREVIEW_MAX_BYTES,
        }),
      }, ['exchangeId', 'bodyId']),
      async execute(args, context) {
        rejectUnknownKeys(args, ['exchangeId', 'bodyId', 'offset', 'length']);
        const exchangeId = requireString(args, 'exchangeId');
        const bodyId = requireString(args, 'bodyId');
        const offset = optionalInteger(args, 'offset') ?? 0;
        const length = optionalIntegerInRange(args, 'length', {
          minimum: 1,
          maximum: TOOL_BODY_PREVIEW_MAX_BYTES,
        }) ?? 64 * 1024;
        const detailResult = await context.host.invoke({
          type: 'sessions.detail',
          payload: { exchangeId },
        }, context.abortSignal);
        const detail = detailResult.payload.detail;
        if (detail === null) {
          throw new InterceptorToolArgumentError(`exchange "${exchangeId}" was not found`);
        }
        const bodyReference = findBodyReference(detail, bodyId);
        if (bodyReference === undefined) {
          throw new InterceptorToolArgumentError(
            `body "${bodyId}" does not belong to exchange "${exchangeId}"`,
          );
        }
        const mimeType = bodyReference.mediaType;
        if (interceptorToolRedactor.isOpaqueBody(mimeType)) {
          return { bodyId, opaque: true, mimeType, reason: 'media bodies are not exposed to Tools' };
        }
        const result = await context.host.invoke({
          type: 'body.read-range',
          payload: {
            bodyId,
            offset,
            length,
            decode: true,
            ...(bodyReference.contentEncoding === undefined
              ? {}
              : { encoding: bodyReference.contentEncoding }),
          },
        }, context.abortSignal);
        return {
          bodyId: result.payload.bodyId,
          offset: result.payload.offset,
          end: result.payload.end,
          decodeStatus: result.payload.decodeStatus,
          ...interceptorToolRedactor.previewBody(result.payload.data, mimeType),
        };
      },
    },
    {
      name: 'list_websocket_messages',
      title: 'List WebSocket messages',
      description: 'Page through captured WebSocket frames for one exchange.',
      capabilityId: 'traffic',
      searchTerms: ['websocket', 'frame', 'message'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        exchangeId: property('string', 'WebSocket exchange identifier.'),
        cursor: property('string', 'Keyset cursor from a previous page.'),
        limit: property('integer', 'Maximum frames to return.', { minimum: 1, maximum: 200 }),
        direction: property('string', 'Restrict to one direction.', {
          enum: ['client-to-server', 'server-to-client'],
        }),
      }, ['exchangeId']),
      async execute(args, context) {
        rejectUnknownKeys(args, ['exchangeId', 'cursor', 'limit', 'direction']);
        const result = await context.host.invoke({
          type: 'websocket.frames',
          payload: {
            exchangeId: requireString(args, 'exchangeId'),
            cursor: optionalString(args, 'cursor'),
            limit: readPageLimit(args),
            direction: optionalEnum(
              args,
              'direction',
              ['client-to-server', 'server-to-client'] as const,
            ),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },
    {
      name: 'list_grpc_messages',
      title: 'List gRPC messages',
      description: 'Page through decoded gRPC message envelopes for one exchange.',
      capabilityId: 'traffic',
      searchTerms: ['grpc', 'message', 'protobuf'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        exchangeId: property('string', 'gRPC exchange identifier.'),
        side: property('string', 'Body side to read.', { enum: ['request', 'response'] }),
        cursor: property('string', 'Keyset cursor from a previous page.'),
        limit: property('integer', 'Maximum messages to return.', { minimum: 1, maximum: 200 }),
      }, ['exchangeId', 'side']),
      async execute(args, context) {
        rejectUnknownKeys(args, ['exchangeId', 'side', 'cursor', 'limit']);
        const result = await context.host.invoke({
          type: 'grpc.messages',
          payload: {
            exchangeId: requireString(args, 'exchangeId'),
            side: requireEnum(args, 'side', ['request', 'response'] as const),
            cursor: optionalString(args, 'cursor'),
            limit: readPageLimit(args),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },
    simpleQuery('get_rules', 'Get Rule set', 'Read the current Rule tree and revision.', 'rules', 'rules.get'),
    simpleQuery('get_rule_hits', 'Get Rule hits', 'Read current Rule match counts.', 'rules', 'rules.hits'),
    simpleQuery(
      'list_breakpoints',
      'List pending breakpoints',
      'Read requests, responses, and frames waiting for action.',
      'breakpoints',
      'breakpoint.list',
    ),
    simpleQuery('get_proxy_status', 'Get proxy status', 'Read listener and recording state.', 'traffic', 'proxy.status'),
    simpleQuery('get_storage_status', 'Get storage status', 'Read Capture counts and byte usage.', 'traffic', 'capture.status'),
    {
      name: 'query_diagnostics',
      title: 'Query diagnostics',
      description: 'Page through structured diagnostic records.',
      capabilityId: 'diagnostics',
      searchTerms: ['logs', 'errors', 'trace'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        cursor: property('string', 'Keyset cursor from a previous page.'),
        limit: property('integer', 'Maximum records to return.', { minimum: 1, maximum: 200 }),
        process: property('string', 'Originating process.', { enum: ['core', 'main', 'renderer'] }),
        level: property('string', 'Minimum severity.', { enum: ['debug', 'info', 'warn', 'error'] }),
        outcome: property('string', 'Command outcome.', {
          enum: ['success', 'failed', 'cancelled', 'timed_out'],
        }),
        traceId: property('string', 'Restrict to one trace.'),
        command: property('string', 'Restrict to one command name.'),
        minDurationMs: property('integer', 'Minimum duration.', { minimum: 0 }),
        maxDurationMs: property('integer', 'Maximum duration.', { minimum: 0 }),
      }),
      async execute(args, context) {
        rejectUnknownKeys(args, [
          'cursor', 'limit', 'process', 'level', 'outcome',
          'traceId', 'command', 'minDurationMs', 'maxDurationMs',
        ]);
        const result = await context.host.invoke({
          type: 'diagnostics.query',
          payload: {
            cursor: optionalString(args, 'cursor'),
            limit: readPageLimit(args),
            process: optionalEnum(args, 'process', ['core', 'main', 'renderer'] as const),
            level: optionalEnum(args, 'level', ['debug', 'info', 'warn', 'error'] as const),
            outcome: optionalEnum(
              args,
              'outcome',
              ['success', 'failed', 'cancelled', 'timed_out'] as const,
            ),
            traceId: optionalString(args, 'traceId'),
            command: optionalString(args, 'command'),
            minDurationMs: optionalInteger(args, 'minDurationMs'),
            maxDurationMs: optionalInteger(args, 'maxDurationMs'),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },
  ];
}

/** Builds Tools that can change product or external state. */
function buildChangeTools(
  interceptorToolRedactor: InterceptorToolRedactor,
): readonly InterceptorToolDefinition[] {
  return [
    {
      name: 'apply_rules',
      title: 'Apply Rules',
      description: 'Replace the complete Rule tree using optimistic concurrency.',
      capabilityId: 'rules',
      searchTerms: ['replace', 'configuration'],
      kind: 'change',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        baseRevision: property('integer', 'Revision returned by get_rules.', { minimum: 0 }),
        nodes: property('array', 'Complete replacement Rule tree.', {
          items: property('object', 'A Rule or folder node.'),
        }),
      }, ['baseRevision', 'nodes']),
      async describeChange(args, context) {
        rejectUnknownKeys(args, ['baseRevision', 'nodes']);
        const current = await context.host.invoke({ type: 'rules.get', payload: {} }, context.abortSignal);
        const nextNodes = requireObjectArray(args, 'nodes') as unknown as RuleNode[];
        const currentNames = collectLeaves(current.payload.ruleSet.nodes).map((rule) => rule.name);
        const nextNames = collectLeaves(nextNodes).map((rule) => rule.name);
        return [
          `Rule count: ${currentNames.length} → ${nextNames.length}`,
          `Removed: ${diffNames(currentNames, nextNames) || '(none)'}`,
          `Added: ${diffNames(nextNames, currentNames) || '(none)'}`,
        ];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['baseRevision', 'nodes']);
        const baseRevision = requireInteger(args, 'baseRevision');
        const nodes = requireObjectArray(args, 'nodes') as unknown as RuleNode[];
        const current = await context.host.invoke({ type: 'rules.get', payload: {} }, context.abortSignal);
        if (current.payload.ruleSet.revision !== baseRevision) {
          throw new InterceptorToolArgumentError(
            `rule set moved from revision ${baseRevision} to ${current.payload.ruleSet.revision}; `
            + 're-read with get_rules and retry',
          );
        }
        const result = await context.host.invoke({
          type: 'rules.replace',
          payload: { expectedRevision: baseRevision, nodes },
        }, context.abortSignal);
        return result.payload;
      },
    },
    commandChange(
      'start_recording',
      'Start recording',
      'Resume Capture in the current session.',
      'traffic',
      { type: 'proxy.start', payload: {} },
    ),
    commandChange(
      'stop_recording',
      'Stop recording',
      'Pause Capture without stopping the proxy.',
      'traffic',
      { type: 'proxy.setRecording', payload: { recording: false } },
    ),
    {
      name: 'send_request',
      title: 'Send request',
      description: 'Send a real HTTP request from this machine.',
      capabilityId: 'requests',
      searchTerms: ['composer', 'http', 'outbound'],
      kind: 'change',
      destructive: false,
      openWorld: true,
      inputSchema: schema({
        method: property('string', 'HTTP method.'),
        url: property('string', 'Absolute request URL.'),
        headers: property('array', 'Request headers.', {
          items: property('object', 'A name/value pair.', {
            properties: {
              name: property('string', 'Header name.', { minLength: 1 }),
              value: property('string', 'Header value.'),
            },
            required: ['name', 'value'],
            additionalProperties: false,
          }),
        }),
        body: property('string', 'Request body text.'),
        protocol: property('string', 'Protocol preference.', { enum: ['auto', 'http/1.1', 'h2'] }),
        timeoutMs: property('integer', 'Request timeout in milliseconds.', { minimum: 1 }),
      }, ['method', 'url']),
      async describeChange(args) {
        return [
          `${requireString(args, 'method')} ${requireString(args, 'url')}`,
          'This sends real traffic from your machine.',
        ];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['method', 'url', 'headers', 'body', 'protocol', 'timeoutMs']);
        const result = await context.host.invoke({
          type: 'composer.send',
          payload: {
            method: requireString(args, 'method'),
            url: requireString(args, 'url'),
            headers: readHeaderPairs(args),
            body: optionalText(args, 'body'),
            protocol: optionalEnum(args, 'protocol', ['auto', 'http/1.1', 'h2'] as const) ?? 'auto',
            timeoutMs: optionalIntegerInRange(args, 'timeoutMs', { minimum: 1 }),
          },
        }, context.abortSignal);
        const payload = result.payload;
        const mimeType = headerValue(payload.headers, 'content-type');
        return {
          ok: payload.ok,
          error: payload.error,
          status: payload.status,
          statusText: payload.statusText,
          httpVersion: payload.httpVersion,
          headers: interceptorToolRedactor.redactHeaders(payload.headers),
          totalBytes: payload.totalBytes,
          durationMs: payload.durationMs,
          timing: payload.timing,
          tls: payload.tls,
          remoteAddress: payload.remoteAddress,
          body: interceptorToolRedactor.previewBody(payload.body, mimeType),
        };
      },
    },
    commandChange(
      'enable_http_breakpoints',
      'Enable HTTP breakpoints',
      'Start suspending matching HTTP traffic.',
      'breakpoints',
      { type: 'breakpoint.configure', payload: { enabled: true } },
    ),
    commandChange(
      'disable_http_breakpoints',
      'Disable HTTP breakpoints',
      'Stop suspending matching HTTP traffic.',
      'breakpoints',
      { type: 'breakpoint.configure', payload: { enabled: false } },
    ),
    {
      name: 'enable_websocket_breakpoint',
      title: 'Enable WebSocket breakpoint',
      description: 'Suspend selected WebSocket frame kinds on one connection.',
      capabilityId: 'breakpoints',
      searchTerms: ['websocket', 'frames'],
      kind: 'change',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        exchangeId: property('string', 'WebSocket exchange identifier.'),
        direction: property('string', 'Travel direction.', {
          enum: ['both', 'client-to-server', 'server-to-client'],
        }),
        frames: property('array', 'Frame kinds to suspend.', {
          items: property('string', 'One frame kind.', { enum: ['message', 'ping', 'pong', 'close'] }),
        }),
      }, ['exchangeId', 'frames']),
      async execute(args, context) {
        rejectUnknownKeys(args, ['exchangeId', 'direction', 'frames']);
        const result = await context.host.invoke({
          type: 'websocket.breakpoint.enable',
          payload: {
            exchangeId: requireString(args, 'exchangeId'),
            direction: optionalEnum(args, 'direction', WEBSOCKET_DIRECTIONS) ?? 'both',
            frames: requireStringArray(args, 'frames', WEBSOCKET_FRAMES),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },
    commandChange(
      'disable_websocket_breakpoint',
      'Disable WebSocket breakpoint',
      'Stop suspending WebSocket frames.',
      'breakpoints',
      { type: 'websocket.breakpoint.disable', payload: {} },
    ),
    breakpointResolveTool(
      'continue_breakpoint',
      'Continue breakpoint',
      'Forward one suspended item unchanged.',
      'continue',
    ),
    {
      name: 'forward_edited_breakpoint',
      title: 'Forward edited breakpoint',
      description: 'Forward one suspended item with explicit edits.',
      capabilityId: 'breakpoints',
      searchTerms: ['request', 'response', 'edit'],
      kind: 'change',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        breakpointId: property('string', 'Identifier from list_breakpoints.'),
        method: property('string', 'Replacement HTTP method.'),
        url: property('string', 'Replacement URL.'),
        statusCode: property('integer', 'Replacement response status.', { minimum: 100 }),
        body: property('string', 'Replacement body; empty text explicitly clears it.'),
      }, ['breakpointId']),
      async describeChange(args) {
        return [`Breakpoint ${requireString(args, 'breakpointId')}`, ...describeEdit(args)];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['breakpointId', 'method', 'url', 'statusCode', 'body']);
        const edit = buildBreakpointEdit(args);
        if (edit === null) {
          throw new InterceptorToolArgumentError(
            'forward_edited_breakpoint requires at least one edit',
          );
        }
        const result = await context.host.invoke({
          type: 'breakpoint.resolve',
          payload: {
            breakpointId: requireString(args, 'breakpointId'),
            action: 'continue',
            edit,
          },
        }, context.abortSignal);
        return result.payload;
      },
    },
    breakpointResolveTool(
      'drop_breakpoint',
      'Drop breakpoint',
      'Discard one suspended item.',
      'drop',
      true,
    ),
    {
      name: 'clear_capture',
      title: 'Clear Capture',
      description: 'Delete all captured exchanges and bodies.',
      capabilityId: 'traffic',
      searchTerms: ['delete', 'reset'],
      kind: 'change',
      destructive: true,
      openWorld: false,
      inputSchema: schema(),
      async describeChange(args, context) {
        rejectUnknownKeys(args, []);
        const status = await context.host.invoke({ type: 'capture.status', payload: {} }, context.abortSignal);
        return [
          'Scope: all',
          `This permanently deletes ${status.payload.exchangeCount} exchange(s) `
          + `and ${status.payload.bodyCount} body/bodies.`,
        ];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, []);
        const result = await context.host.invoke({
          type: 'capture.cleanup',
          payload: { scope: 'all' },
        }, context.abortSignal);
        return result.payload;
      },
    },
    {
      name: 'probe_connection',
      title: 'Probe connection',
      description: 'Open a real TLS connection and report negotiation details.',
      capabilityId: 'requests',
      searchTerms: ['tls', 'certificate', 'alpn'],
      kind: 'change',
      destructive: false,
      openWorld: true,
      inputSchema: schema({
        host: property('string', 'Target host name.'),
        port: property('integer', 'Target port.', { minimum: 1, maximum: 65535 }),
        timeoutMs: property('integer', 'Probe timeout in milliseconds.', { minimum: 1 }),
      }, ['host', 'port']),
      async describeChange(args) {
        return [`Opens a real connection to ${requireString(args, 'host')}:${requireInteger(args, 'port')}`];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['host', 'port', 'timeoutMs']);
        const result = await context.host.invoke({
          type: 'tls.probe',
          payload: {
            host: requireString(args, 'host'),
                  port: requireIntegerInRange(args, 'port', { minimum: 1, maximum: 65_535 }),
                  timeoutMs: optionalIntegerInRange(args, 'timeoutMs', { minimum: 1 }),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },
  ];
}

/** Builds a query Tool with no arguments and one Core command. */
function simpleQuery(
  name: string,
  title: string,
  description: string,
  capabilityId: string,
  commandType: 'rules.get' | 'rules.hits' | 'breakpoint.list' | 'proxy.status' | 'capture.status',
): InterceptorToolDefinition {
  return {
    name,
    title,
    description,
    capabilityId,
    kind: 'query',
    destructive: false,
    openWorld: false,
    inputSchema: schema(),
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      switch (commandType) {
        case 'rules.get':
          return (await context.host.invoke({ type: 'rules.get', payload: {} }, context.abortSignal)).payload;
        case 'rules.hits':
          return (await context.host.invoke({ type: 'rules.hits', payload: {} }, context.abortSignal)).payload;
        case 'breakpoint.list':
          return (await context.host.invoke({ type: 'breakpoint.list', payload: {} }, context.abortSignal)).payload;
        case 'proxy.status':
          return (await context.host.invoke({ type: 'proxy.status', payload: {} }, context.abortSignal)).payload;
        case 'capture.status':
          return (await context.host.invoke({ type: 'capture.status', payload: {} }, context.abortSignal)).payload;
      }
    },
  };
}

/** Builds a no-argument change Tool around one typed product command. */
function commandChange(
  name: string,
  title: string,
  description: string,
  capabilityId: string,
  command:
    | { type: 'proxy.start'; payload: Record<string, never> }
    | { type: 'proxy.setRecording'; payload: { recording: boolean } }
    | { type: 'breakpoint.configure'; payload: { enabled: boolean } }
    | { type: 'websocket.breakpoint.disable'; payload: Record<string, never> },
): InterceptorToolDefinition {
  return {
    name,
    title,
    description,
    capabilityId,
    kind: 'change',
    destructive: false,
    openWorld: false,
    inputSchema: schema(),
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      switch (command.type) {
        case 'proxy.start':
          return (await context.host.invoke(command, context.abortSignal)).payload;
        case 'proxy.setRecording':
          return (await context.host.invoke(command, context.abortSignal)).payload;
        case 'breakpoint.configure':
          return (await context.host.invoke(command, context.abortSignal)).payload;
        case 'websocket.breakpoint.disable':
          return (await context.host.invoke(command, context.abortSignal)).payload;
      }
    },
  };
}

/** Builds an unedited continue or drop Tool. */
function breakpointResolveTool(
  name: string,
  title: string,
  description: string,
  action: 'continue' | 'drop',
  destructive = false,
): InterceptorToolDefinition {
  return {
    name,
    title,
    description,
    capabilityId: 'breakpoints',
    kind: 'change',
    destructive,
    openWorld: false,
    inputSchema: schema({
      breakpointId: property('string', 'Identifier from list_breakpoints.'),
    }, ['breakpointId']),
    async execute(args, context) {
      rejectUnknownKeys(args, ['breakpointId']);
      const result = await context.host.invoke({
        type: 'breakpoint.resolve',
        payload: { breakpointId: requireString(args, 'breakpointId'), action },
      }, context.abortSignal);
      return result.payload;
    },
  };
}

/** Creates a JSON Schema object. */
function schema(
  properties: Readonly<Record<string, InterceptorToolJsonSchemaProperty>> = {},
  required?: readonly string[],
): InterceptorToolJsonSchema {
  return {
    type: 'object',
    properties,
    ...(required === undefined ? {} : { required }),
    additionalProperties: false,
  };
}

/** Creates one JSON Schema property. */
function property(
  type: InterceptorToolJsonSchemaProperty['type'],
  description: string,
  options: Omit<InterceptorToolJsonSchemaProperty, 'type' | 'description'> = {},
): InterceptorToolJsonSchemaProperty {
  return { type, description, ...options };
}

/** Finds a body reference only within the exchange named by the caller. */
function findBodyReference(
  detail: CaptureExchangeDetail,
  bodyId: string,
): CaptureBodyRef | undefined {
  return [
    detail.requestBody,
    detail.responseBody,
    detail.requestBodyEffect?.originalBody,
    detail.responseBodyEffect?.originalBody,
  ].find((reference) => reference?.bodyHash === bodyId);
}

/** Parses Composer request headers. */
function readHeaderPairs(args: Readonly<Record<string, unknown>>): RuleHeaderPair[] {
  if (args['headers'] === undefined) return [];
  return requireObjectArray(args, 'headers').map((pair, index) => {
    rejectUnknownKeys(pair, ['name', 'value']);
    const name = requireString(pair, 'name');
    const value = pair['value'];
    if (typeof value !== 'string') {
      throw new InterceptorToolArgumentError(
        `"headers[${index}]" must have string name and value`,
      );
    }
    return { name, value };
  });
}

/** Finds one header value without trusting caller-provided response metadata. */
function headerValue(headers: readonly RuleHeaderPair[], name: string): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === name)?.value;
}

/** Builds only fields the caller explicitly supplied. */
function buildBreakpointEdit(args: Readonly<Record<string, unknown>>): BreakpointEdit | null {
  const edit: BreakpointEdit = {};
  const method = optionalString(args, 'method');
  const url = optionalString(args, 'url');
  const statusCode = optionalIntegerInRange(args, 'statusCode', { minimum: 100 });
  const body = optionalText(args, 'body');
  if (method !== undefined) edit.method = method;
  if (url !== undefined) edit.url = url;
  if (statusCode !== undefined) edit.statusCode = statusCode;
  if (body !== undefined) edit.body = body;
  return Object.keys(edit).length === 0 ? null : edit;
}

/** Describes explicit breakpoint edits for an ask-mode UI. */
function describeEdit(args: Readonly<Record<string, unknown>>): readonly string[] {
  const edit = buildBreakpointEdit(args);
  if (edit === null) return ['No edits.'];
  return Object.entries(edit).map(([key, value]) => `${key} → ${String(value)}`);
}

/** Returns names that occur only in the left collection. */
function diffNames(left: readonly string[], right: readonly string[]): string {
  return left.filter((name) => !right.includes(name)).join(', ');
}

/** Projects progressive-disclosure descriptors from the executable registry. */
export function buildInterceptorToolCatalog(
  registry: readonly InterceptorToolDefinition[] = buildInterceptorToolRegistry(),
): InterceptorToolCatalog {
  const descriptors: readonly ToolDescriptor[] = registry.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    capabilityId: tool.capabilityId,
    ...(tool.searchTerms === undefined ? {} : { searchTerms: tool.searchTerms }),
    inputSchema: tool.inputSchema,
  }));
  return new InterceptorToolCatalog(INTERCEPTOR_TOOL_CAPABILITIES, descriptors);
}