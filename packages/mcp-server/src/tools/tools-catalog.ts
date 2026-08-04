import type { RuleDefinition, RuleHeaderPair } from '@interceptor/core-protocol';

import { MCP_MAX_PAGE_LIMIT } from '../constants';
import type { McpRedactor } from '../redaction/entry';
import type { McpToolContext, McpToolDefinition } from '../interfaces';
import {
  McpArgumentError,
  optionalEnum,
  optionalInteger,
  optionalString,
  readPageLimit,
  rejectUnknownKeys,
  requireBoolean,
  requireEnum,
  requireInteger,
  requireObjectArray,
  requireString,
} from './tools-arguments';

/**
 * 全部 MCP 工具的定义。每个工具都只是既有 Core command 的第二个调用入口，
 * 不允许在此新增绕过 Renderer 能力边界的行为。
 */
export function buildToolCatalog(mcpRedactor: McpRedactor): readonly McpToolDefinition[] {
  return [
    ...buildReadTools(mcpRedactor),
    ...buildWriteTools(),
  ];
}

/** 只读工具：不改变代理行为、不产生外发流量、不删除数据，自动执行。 */
function buildReadTools(mcpRedactor: McpRedactor): readonly McpToolDefinition[] {
  return [
    {
      name: 'list_exchanges',
      title: 'List captured exchanges',
      description:
        'List captured HTTP exchanges with optional filters and keyset pagination. '
        + 'Returns lightweight summaries; use get_exchange for full metadata.',
      level: 'read',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cursor: { type: 'string', description: 'Keyset cursor from a previous page.' },
          limit: {
            type: 'integer',
            description: `Maximum rows to return (capped at ${MCP_MAX_PAGE_LIMIT}).`,
            minimum: 1,
            maximum: MCP_MAX_PAGE_LIMIT,
          },
          sort: {
            type: 'string',
            description: 'Sort order by start time.',
            enum: ['started_desc', 'started_asc'],
          },
          host: { type: 'string', description: 'Match exchanges whose host contains this text.' },
          method: { type: 'string', description: 'Exact HTTP method, e.g. GET.' },
          status: { type: 'integer', description: 'Exact response status code.' },
          mime: { type: 'string', description: 'Match the response content type.' },
          appName: { type: 'string', description: 'Client application name that issued the request.' },
          search: { type: 'string', description: 'Free-text search across URL and host.' },
          protocol: {
            type: 'string',
            description: 'Wire protocol family.',
            enum: ['h1', 'h2', 'ws'],
          },
        },
      },
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
            path: mcpRedactor.redactPath(item.path),
          })),
          nextCursor: result.payload.nextCursor,
          hasMore: result.payload.hasMore,
        };
      },
    },

    {
      name: 'get_exchange',
      title: 'Get exchange detail',
      description:
        'Fetch full metadata for one exchange: request/response headers, timings, TLS and rule hits. '
        + 'Sensitive headers and credential query parameters are redacted.',
      level: 'read',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['exchangeId'],
        properties: {
          exchangeId: { type: 'string', description: 'Exchange identifier from list_exchanges.' },
        },
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['exchangeId']);
        const result = await context.host.invoke({
          type: 'sessions.detail',
          payload: { exchangeId: requireString(args, 'exchangeId') },
        }, context.abortSignal);
        const detail = result.payload.detail;
        if (detail === null) {
          return { detail: null };
        }
        return {
          detail: {
            ...detail,
            url: mcpRedactor.redactUrl(detail.url),
            summary: { ...detail.summary, path: mcpRedactor.redactPath(detail.summary.path) },
            requestHeaders: mcpRedactor.redactHeaders(detail.requestHeaders),
            responseHeaders: mcpRedactor.redactHeaders(detail.responseHeaders),
          },
        };
      },
    },

    {
      name: 'get_exchange_body',
      title: 'Read exchange body',
      description:
        'Read a byte range of a request or response body as text. '
        + 'Audio and video bodies are never read; only their metadata is returned.',
      level: 'read',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['bodyId'],
        properties: {
          bodyId: { type: 'string', description: 'Body identifier from get_exchange.' },
          offset: { type: 'integer', description: 'Byte offset to start from.', minimum: 0 },
          length: { type: 'integer', description: 'Bytes to read; clamped to the preview limit.', minimum: 1 },
          mimeType: { type: 'string', description: 'Content type from get_exchange, used to skip media.' },
        },
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['bodyId', 'offset', 'length', 'mimeType']);
        const mimeType = optionalString(args, 'mimeType');
        if (mcpRedactor.isOpaqueBody(mimeType)) {
          return { opaque: true, mimeType, reason: 'media bodies are not exposed over MCP' };
        }
        const result = await context.host.invoke({
          type: 'body.read-range',
          payload: {
            bodyId: requireString(args, 'bodyId'),
            offset: optionalInteger(args, 'offset') ?? 0,
            length: clampPreviewLength(optionalInteger(args, 'length')),
            decode: true,
          },
        }, context.abortSignal);
        return {
          bodyId: result.payload.bodyId,
          offset: result.payload.offset,
          end: result.payload.end,
          decodeStatus: result.payload.decodeStatus,
          ...mcpRedactor.previewBody(result.payload.data, mimeType),
        };
      },
    },

    {
      name: 'list_websocket_messages',
      title: 'List WebSocket messages',
      description: 'Page through WebSocket frames captured for one exchange.',
      level: 'read',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['exchangeId'],
        properties: {
          exchangeId: { type: 'string', description: 'WebSocket exchange identifier.' },
          cursor: { type: 'string', description: 'Keyset cursor from a previous page.' },
          limit: {
            type: 'integer',
            description: `Maximum frames to return (capped at ${MCP_MAX_PAGE_LIMIT}).`,
            minimum: 1,
            maximum: MCP_MAX_PAGE_LIMIT,
          },
          direction: {
            type: 'string',
            description: 'Restrict to one direction.',
            enum: ['client-to-server', 'server-to-client'],
          },
        },
      },
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
      description: 'Page through gRPC messages decoded from one exchange, per side.',
      level: 'read',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['exchangeId', 'side'],
        properties: {
          exchangeId: { type: 'string', description: 'gRPC exchange identifier.' },
          side: { type: 'string', description: 'Which side to read.', enum: ['request', 'response'] },
          cursor: { type: 'string', description: 'Keyset cursor from a previous page.' },
          limit: {
            type: 'integer',
            description: `Maximum messages to return (capped at ${MCP_MAX_PAGE_LIMIT}).`,
            minimum: 1,
            maximum: MCP_MAX_PAGE_LIMIT,
          },
        },
      },
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

    {
      name: 'get_rules',
      title: 'Get rule set',
      description:
        'Return the current rule set together with its revision. '
        + 'The revision must be passed back to apply_rules as baseRevision.',
      level: 'read',
      destructive: false,
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      async execute(args, context) {
        rejectUnknownKeys(args, []);
        const result = await context.host.invoke({
          type: 'rules.get',
          payload: {},
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'get_rule_hits',
      title: 'Get rule hit counts',
      description: 'Return how many captured exchanges each rule has matched.',
      level: 'read',
      destructive: false,
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      async execute(args, context) {
        rejectUnknownKeys(args, []);
        const result = await context.host.invoke({
          type: 'rules.hits',
          payload: {},
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'list_breakpoints',
      title: 'List pending breakpoints',
      description: 'Return breakpoints currently holding a real request or response.',
      level: 'read',
      destructive: false,
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      async execute(args, context) {
        rejectUnknownKeys(args, []);
        const result = await context.host.invoke({
          type: 'breakpoint.list',
          payload: {},
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'get_proxy_status',
      title: 'Get proxy status',
      description: 'Return whether the proxy is listening and whether it is recording.',
      level: 'read',
      destructive: false,
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      async execute(args, context) {
        rejectUnknownKeys(args, []);
        const result = await context.host.invoke({
          type: 'proxy.status',
          payload: {},
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'get_storage_status',
      title: 'Get storage status',
      description: 'Return capture counts and byte usage.',
      level: 'read',
      destructive: false,
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      async execute(args, context) {
        rejectUnknownKeys(args, []);
        const result = await context.host.invoke({
          type: 'capture.status',
          payload: {},
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'query_diagnostics',
      title: 'Query diagnostics',
      description: 'Page through structured diagnostic records from Core, Main and Renderer.',
      level: 'read',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cursor: { type: 'string', description: 'Keyset cursor from a previous page.' },
          limit: {
            type: 'integer',
            description: `Maximum records to return (capped at ${MCP_MAX_PAGE_LIMIT}).`,
            minimum: 1,
            maximum: MCP_MAX_PAGE_LIMIT,
          },
          process: { type: 'string', description: 'Originating process.', enum: ['core', 'main', 'renderer'] },
          level: { type: 'string', description: 'Minimum severity.', enum: ['debug', 'info', 'warn', 'error'] },
          outcome: {
            type: 'string',
            description: 'Command outcome.',
            enum: ['success', 'failed', 'cancelled', 'timed_out'],
          },
          traceId: { type: 'string', description: 'Restrict to one trace.' },
          command: { type: 'string', description: 'Restrict to one command name.' },
          minDurationMs: { type: 'integer', description: 'Only records at least this slow.', minimum: 0 },
          maxDurationMs: { type: 'integer', description: 'Only records at most this slow.', minimum: 0 },
        },
      },
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

/** 写工具：改变代理行为、产生外发流量或删除数据，一律需用户逐次确认。 */
function buildWriteTools(): readonly McpToolDefinition[] {
  return [
    {
      name: 'apply_rules',
      title: 'Apply rules',
      description:
        'Replace the rule set using optimistic concurrency. Call get_rules first and pass its '
        + 'revision as baseRevision. Newly written rules always land disabled; only the user can '
        + 'enable them in the Rules UI.',
      level: 'write',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['baseRevision', 'rules'],
        properties: {
          baseRevision: {
            type: 'integer',
            description: 'Revision returned by get_rules; the call fails if it moved.',
            minimum: 0,
          },
          rules: {
            type: 'array',
            description: 'Complete replacement rule set.',
            items: { type: 'object', description: 'A rule definition.' },
          },
        },
      },
      async describeChange(args, context) {
        const current = await context.host.invoke({
          type: 'rules.get',
          payload: {},
        }, context.abortSignal);
        const next = requireObjectArray(args, 'rules');
        const currentNames = current.payload.ruleSet.rules.map((rule) => rule.name);
        const nextNames = next.map((rule) => String(rule['name'] ?? '(unnamed)'));
        return [
          `Rule count: ${currentNames.length} → ${nextNames.length}`,
          `Removed: ${diffNames(currentNames, nextNames) || '(none)'}`,
          `Added: ${diffNames(nextNames, currentNames) || '(none)'}`,
        ];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['baseRevision', 'rules']);
        const baseRevision = requireInteger(args, 'baseRevision');
        const rules = requireObjectArray(args, 'rules');
        const current = await context.host.invoke({
          type: 'rules.get',
          payload: {},
        }, context.abortSignal);
        if (current.payload.ruleSet.revision !== baseRevision) {
          throw new McpArgumentError(
            `rule set moved from revision ${baseRevision} to `
            + `${current.payload.ruleSet.revision}; re-read with get_rules and retry`,
          );
        }
        const result = await context.host.invoke({
          type: 'rules.replace',
          payload: {
            expectedRevision: baseRevision,
            // AI 写入的规则永不直接对真实流量生效，启用只能由用户完成。
            rules: rules.map((rule) => ({ ...rule, enabled: false }) as unknown as RuleDefinition),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'set_recording',
      title: 'Set recording',
      description: 'Pause or resume recording. The listener and system proxy stay untouched.',
      level: 'write',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['recording'],
        properties: {
          recording: { type: 'boolean', description: 'True to record, false to pause.' },
        },
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['recording']);
        const result = await context.host.invoke({
          type: 'proxy.setRecording',
          payload: { recording: requireBoolean(args, 'recording') },
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'send_request',
      title: 'Send request',
      description:
        'Send a real HTTP request from this machine and return the response. '
        + 'This produces genuine outbound network traffic.',
      level: 'write',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['method', 'url'],
        properties: {
          method: { type: 'string', description: 'HTTP method.' },
          url: { type: 'string', description: 'Absolute request URL.' },
          headers: {
            type: 'array',
            description: 'Request headers as name/value pairs.',
            items: { type: 'object', description: 'A header pair with name and value.' },
          },
          body: { type: 'string', description: 'Request body as text.' },
          protocol: {
            type: 'string',
            description: 'Protocol preference.',
            enum: ['auto', 'http/1.1', 'h2'],
          },
          timeoutMs: { type: 'integer', description: 'Request timeout in milliseconds.', minimum: 1 },
        },
      },
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
            body: optionalString(args, 'body'),
            protocol: optionalEnum(args, 'protocol', ['auto', 'http/1.1', 'h2'] as const) ?? 'auto',
            timeoutMs: optionalInteger(args, 'timeoutMs'),
          },
        }, context.abortSignal);
        const payload = result.payload;
        return {
          ok: payload.ok,
          error: payload.error,
          status: payload.status,
          statusText: payload.statusText,
          httpVersion: payload.httpVersion,
          headers: payload.headers,
          totalBytes: payload.totalBytes,
          durationMs: payload.durationMs,
          remoteAddress: payload.remoteAddress,
          bodyText: new TextDecoder('utf-8', { fatal: false }).decode(payload.body),
        };
      },
    },

    {
      name: 'configure_breakpoint',
      title: 'Configure breakpoints',
      description:
        'Enable or disable HTTP and WebSocket breakpoints. '
        + 'Enabling suspends real requests until they are resolved.',
      level: 'write',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean', description: 'True to suspend matching traffic.' },
          channel: {
            type: 'string',
            description: 'Which breakpoint channel to configure.',
            enum: ['http', 'websocket'],
          },
        },
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['enabled', 'channel']);
        const enabled = requireBoolean(args, 'enabled');
        const channel = optionalEnum(args, 'channel', ['http', 'websocket'] as const) ?? 'http';
        if (channel === 'websocket') {
          const result = await context.host.invoke({
            type: 'websocket.breakpoint.configure',
            payload: { enabled },
          }, context.abortSignal);
          return result.payload;
        }
        const result = await context.host.invoke({
          type: 'breakpoint.configure',
          payload: { enabled },
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'resolve_breakpoint',
      title: 'Resolve breakpoint',
      description:
        'Continue or drop a suspended request or response, optionally editing it first. '
        + 'Edits change what the real client and origin observe.',
      level: 'write',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['breakpointId', 'action'],
        properties: {
          breakpointId: { type: 'string', description: 'Identifier from list_breakpoints.' },
          action: { type: 'string', description: 'How to resolve.', enum: ['continue', 'drop'] },
          method: { type: 'string', description: 'Replacement HTTP method.' },
          url: { type: 'string', description: 'Replacement URL.' },
          statusCode: { type: 'integer', description: 'Replacement response status.', minimum: 100 },
          body: { type: 'string', description: 'Replacement body; omit to forward the original.' },
        },
      },
      async describeChange(args) {
        return [
          `Breakpoint ${requireString(args, 'breakpointId')}: ${requireString(args, 'action')}`,
          ...describeEdit(args),
        ];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['breakpointId', 'action', 'method', 'url', 'statusCode', 'body']);
        const edit = buildBreakpointEdit(args);
        const result = await context.host.invoke({
          type: 'breakpoint.resolve',
          payload: {
            breakpointId: requireString(args, 'breakpointId'),
            action: requireEnum(args, 'action', ['continue', 'drop'] as const),
            ...(edit === null ? {} : { edit }),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'clear_capture',
      title: 'Clear capture',
      description: 'Irreversibly delete captured exchanges and their bodies.',
      level: 'write',
      destructive: true,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scope: { type: 'string', description: 'What to delete.', enum: ['all', 'session'] },
          sessionId: { type: 'string', description: 'Session to delete when scope is session.' },
        },
      },
      async describeChange(args, context) {
        const status = await context.host.invoke({
          type: 'capture.status',
          payload: {},
        }, context.abortSignal);
        return [
          `Scope: ${optionalString(args, 'scope') ?? 'all'}`,
          `This permanently deletes ${status.payload.exchangeCount} exchange(s) `
          + `and ${status.payload.bodyCount} body/bodies.`,
        ];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['scope', 'sessionId']);
        const scope = optionalEnum(args, 'scope', ['all', 'session'] as const) ?? 'all';
        const sessionId = optionalString(args, 'sessionId');
        if (scope === 'session' && sessionId === undefined) {
          throw new McpArgumentError('"sessionId" is required when scope is "session"');
        }
        const result = await context.host.invoke({
          type: 'capture.cleanup',
          payload: { scope, sessionId },
        }, context.abortSignal);
        return result.payload;
      },
    },

    {
      name: 'probe_connection',
      title: 'Probe connection',
      description:
        'Open a real TLS connection to a host and report the negotiated protocol and certificate chain.',
      level: 'write',
      destructive: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['host', 'port'],
        properties: {
          host: { type: 'string', description: 'Target host name.' },
          port: { type: 'integer', description: 'Target port.', minimum: 1, maximum: 65535 },
          timeoutMs: { type: 'integer', description: 'Probe timeout in milliseconds.', minimum: 1 },
        },
      },
      async describeChange(args) {
        return [`Opens a real connection to ${requireString(args, 'host')}:${requireInteger(args, 'port')}`];
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['host', 'port', 'timeoutMs']);
        const result = await context.host.invoke({
          type: 'tls.probe',
          payload: {
            host: requireString(args, 'host'),
            port: requireInteger(args, 'port'),
            timeoutMs: optionalInteger(args, 'timeoutMs'),
          },
        }, context.abortSignal);
        return result.payload;
      },
    },
  ];
}

/** 把读取长度夹到预览上限，避免一次调用把整段正文送进模型上下文。 */
function clampPreviewLength(requested: number | undefined): number {
  const fallback = 64 * 1024;
  if (requested === undefined || requested === 0) {
    return fallback;
  }
  return Math.min(requested, fallback);
}

/** 解析 composer 头参数。 */
function readHeaderPairs(args: Readonly<Record<string, unknown>>): RuleHeaderPair[] {
  if (args['headers'] === undefined) {
    return [];
  }
  return requireObjectArray(args, 'headers').map((pair, index) => {
    const name = pair['name'];
    const value = pair['value'];
    if (typeof name !== 'string' || typeof value !== 'string') {
      throw new McpArgumentError(`"headers[${index}]" must have string name and value`);
    }
    return { name, value };
  });
}

/** 只在模型确实提供了替换项时构造 edit，避免把真实正文抹成空。 */
function buildBreakpointEdit(
  args: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const edit: Record<string, unknown> = {};
  const method = optionalString(args, 'method');
  const url = optionalString(args, 'url');
  const statusCode = optionalInteger(args, 'statusCode');
  const body = optionalString(args, 'body');
  if (method !== undefined) {
    edit['method'] = method;
  }
  if (url !== undefined) {
    edit['url'] = url;
  }
  if (statusCode !== undefined) {
    edit['statusCode'] = statusCode;
  }
  if (body !== undefined) {
    edit['body'] = body;
  }
  return Object.keys(edit).length === 0 ? null : edit;
}

/** 为审批 UI 描述断点改写内容。 */
function describeEdit(args: Readonly<Record<string, unknown>>): readonly string[] {
  const edit = buildBreakpointEdit(args);
  if (edit === null) {
    return ['No edits; the original message is forwarded as-is.'];
  }
  return Object.entries(edit).map(([key, value]) => `${key} → ${String(value)}`);
}

/** 返回只在 left 中出现的名字。 */
function diffNames(left: readonly string[], right: readonly string[]): string {
  return left.filter((name) => !right.includes(name)).join(', ');
}

/** `tools/list` 用的注解，由分级派生。 */
export function annotationsFor(tool: McpToolDefinition): {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const readOnly = tool.level === 'read';
  return {
    readOnlyHint: readOnly,
    destructiveHint: tool.destructive,
    idempotentHint: readOnly,
    openWorldHint: tool.name === 'send_request' || tool.name === 'probe_connection',
  };
}

export type { McpToolContext };
