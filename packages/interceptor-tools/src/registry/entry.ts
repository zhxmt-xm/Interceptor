import { collectLeaves } from '@interceptor/core-protocol';
import type {
  BreakpointEdit,
  CaptureBodyRef,
  CaptureExchangeDetail,
  ComposerSendCommand,
  PendingBreakpoint,
  RuleHeaderPair,
  RuleNode,
  TlsProbeCommand,
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
  requireIntegerInRange,
  requireObjectArray,
  requireString,
  requireStringArray,
} from '../arguments/entry';
import { InterceptorToolCatalog } from '../catalog/entry';
import type { ToolCapability, ToolDescriptor } from '../catalog/entry';
import type {
  InterceptorToolChangeDescription,
  InterceptorToolContext,
  InterceptorToolDefinition,
  InterceptorToolJsonSchema,
  InterceptorToolJsonSchemaProperty,
} from '../interfaces';
import { InterceptorToolRedactor } from '../redaction/entry';
import {
  APPLY_RULES_INPUT_SCHEMA,
  parseRuleNodes,
  redactRuleNodesForTools,
  restorePreservedRuleLocalPaths,
} from '../rules/entry';
import { TOOL_BODY_PREVIEW_MAX_BYTES } from '../constants';
import { buildSettingsQueryTools } from '../settings/queries';
import { buildSystemProxyTools } from '../settings/system-proxy';
import { buildTlsTools } from '../settings/tls';
import { buildCertificateTools } from '../settings/certificates';
import { buildAppContainerTools } from '../settings/app-containers';
import { buildPreferenceTools } from '../settings/preferences';
import { buildRulesExportTool } from '../rules/export';
import { buildRulesImportTool } from '../rules/import';
import { buildCollectionTools } from '../composer/collection';
import { buildCollectionTransferTools } from '../composer/transfer';
import { buildBreakpointBatchTools } from '../breakpoints/batch';
import { buildDiagnosticsTools } from '../diagnostics/entry';
import { buildTransferJobTools } from '../transfer/entry';
import { buildBodyExportTool } from '../transfer/body-export';
import { buildHarTransferTools } from '../transfer/har';
import { buildArchiveTransferTools } from '../transfer/archive';

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
    id: 'capture',
    title: 'Capture',
    description: 'Inspect and control Capture, proxy state, HTTP, WebSocket, and gRPC traffic.',
  },
  {
    id: 'rules',
    title: 'Rules',
    description: 'Inspect, replace, export, and import the Rule tree.',
  },
  {
    id: 'composer',
    title: 'Composer',
    description: 'Inspect and replace Composer Collections, send requests, and probe TLS connections.',
  },
  {
    id: 'breakpoints',
    title: 'Breakpoints',
    description: 'Inspect and resolve suspended HTTP and WebSocket traffic.',
  },
  {
    id: 'diagnostics',
    title: 'Diagnostics',
    description: 'Query structured application diagnostics.',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Inspect Core, certificates, and AppContainer access; control the system proxy and TLS settings.',
  },
];

/** Stable registry order grouped for Settings and discovery. */
export const INTERCEPTOR_TOOL_NAMES = [
  'capture_get_proxy_status',
  'capture_get_storage_status',
  'capture_start_recording',
  'capture_stop_recording',
  'capture_clear',
  'capture_list_exchanges',
  'capture_get_exchange',
  'capture_get_exchange_body',
  'capture_list_websocket_messages',
  'capture_list_grpc_messages',
  'capture_get_transfer_job',
  'capture_cancel_transfer_job',
  'capture_export_body',
  'capture_export_har',
  'capture_import_har',
  'capture_export_archive',
  'capture_import_archive',
  'rules_get_tree',
  'rules_get_hits',
  'rules_replace_tree',
  'rules_export',
  'rules_import',
  'composer_send_request',
  'composer_probe_connection',
  'composer_get_collection',
  'composer_replace_collection',
  'composer_export_collection',
  'composer_import_collection',
  'breakpoints_list',
  'breakpoints_enable_http',
  'breakpoints_disable_http',
  'breakpoints_enable_websocket',
  'breakpoints_disable_websocket',
  'breakpoints_continue',
  'breakpoints_forward_edited',
  'breakpoints_drop',
  'breakpoints_continue_queue',
  'breakpoints_drop_queue',
  'breakpoints_continue_rule',
  'diagnostics_query',
  'diagnostics_get_trace',
  'diagnostics_get_recent',
  'diagnostics_export',
  'settings_get_core_process_status',
  'settings_get_system_proxy_status',
  'settings_get_certificate_status',
  'settings_generate_certificate',
  'settings_install_certificate',
  'settings_uninstall_certificate',
  'settings_delete_certificate',
  'settings_reveal_certificate',
  'settings_view_certificate',
  'settings_open_certificate_manager',
  'settings_get_tls_insecure_hosts',
  'settings_get_tls_passthrough',
  'settings_list_app_containers',
  'settings_enable_app_container',
  'settings_disable_app_container',
  'settings_enable_all_app_containers',
  'settings_disable_all_app_containers',
  'settings_enable_system_proxy',
  'settings_restore_system_proxy',
  'settings_replace_tls_insecure_hosts',
  'settings_replace_tls_passthrough',
  'settings_enable_https_decryption',
  'settings_disable_https_decryption',
  'settings_set_language',
  'settings_set_theme',
  'settings_set_export_privacy_defaults',
] as const;

/** Builds the complete set of currently implemented transport-neutral Tools. */
export function buildInterceptorToolRegistry(
  interceptorToolRedactor = new InterceptorToolRedactor(),
): readonly InterceptorToolDefinition[] {
  const definitions = [
    ...buildQueryTools(interceptorToolRedactor),
    ...buildChangeTools(interceptorToolRedactor),
    ...buildSettingsQueryTools(),
    ...buildSystemProxyTools(),
    ...buildTlsTools(),
    ...buildCertificateTools(),
    ...buildAppContainerTools(),
    ...buildPreferenceTools(),
    buildRulesExportTool(),
    buildRulesImportTool(),
    ...buildCollectionTools(interceptorToolRedactor),
    ...buildCollectionTransferTools(),
    ...buildBreakpointBatchTools(),
    ...buildDiagnosticsTools(),
    ...buildTransferJobTools(),
    buildBodyExportTool(),
    ...buildHarTransferTools(),
    ...buildArchiveTransferTools(),
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
      name: 'capture_list_exchanges',
      title: 'List exchanges',
      description: 'Query lightweight captured traffic summaries.',
      capabilityId: 'capture',
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
      name: 'capture_get_exchange',
      title: 'Exchange detail',
      description: 'Read headers, timings, TLS, and rule effects.',
      capabilityId: 'capture',
      searchTerms: ['capture', 'request', 'response', 'headers', 'timing', 'tls'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        exchangeId: property('string', 'Exchange identifier from capture_list_exchanges.'),
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
      name: 'capture_get_exchange_body',
      title: 'Exchange body',
      description: 'Read a bounded body byte range.',
      capabilityId: 'capture',
      searchTerms: ['capture', 'request', 'response', 'payload', 'content'],
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        exchangeId: property('string', 'Exchange identifier from capture_get_exchange.'),
        bodyId: property('string', 'Body identifier from capture_get_exchange.'),
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
      name: 'capture_list_websocket_messages',
      title: 'WebSocket messages',
      description: 'Page through captured WebSocket frames.',
      capabilityId: 'capture',
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
      name: 'capture_list_grpc_messages',
      title: 'gRPC messages',
      description: 'Page through decoded gRPC messages.',
      capabilityId: 'capture',
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
    {
      name: 'rules_get_tree',
      title: 'Rule set',
      description: 'Read the current rule tree and revision.',
      capabilityId: 'rules',
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: schema(),
      async execute(args, context) {
        rejectUnknownKeys(args, []);
        const result = await context.host.invoke({ type: 'rules.get', payload: {} }, context.abortSignal);
        return {
          ruleSet: {
            ...result.payload.ruleSet,
            nodes: redactRuleNodesForTools(result.payload.ruleSet.nodes),
          },
        };
      },
    },
    simpleQuery('rules_get_hits', 'Rule hits', 'Read match counts for current rules.', 'rules', 'rules.hits'),
    simpleQuery(
      'breakpoints_list',
      'Pending breakpoints',
      'Read requests, responses, and frames waiting for action.',
      'breakpoints',
      'breakpoint.list',
    ),
    simpleQuery('capture_get_proxy_status', 'Proxy status', 'Read listener and recording state.', 'capture', 'proxy.status'),
    simpleQuery('capture_get_storage_status', 'Capture storage', 'Read captured item and byte counts.', 'capture', 'capture.status'),
    {
      name: 'diagnostics_query',
      title: 'Query diagnostics',
      description: 'Read filtered structured diagnostic records.',
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
      name: 'rules_replace_tree',
      title: 'Apply rules',
      description: 'Replace the rule set with revision checking.',
      capabilityId: 'rules',
      searchTerms: ['replace', 'configuration'],
      kind: 'change',
      destructive: false,
      openWorld: false,
      inputSchema: APPLY_RULES_INPUT_SCHEMA,
      async describeChange(args, context) {
        rejectUnknownKeys(args, ['baseRevision', 'nodes']);
        const baseRevision = requireIntegerInRange(args, 'baseRevision', { minimum: 0 });
        const parsedNodes = parseRuleNodes(args['nodes']);
        const current = await context.host.invoke({ type: 'rules.get', payload: {} }, context.abortSignal);
        requireCurrentRuleRevision(baseRevision, current.payload.ruleSet.revision);
        const nextNodes = restorePreservedRuleLocalPaths(
          parsedNodes,
          current.payload.ruleSet.nodes,
        );
        const currentNames = collectLeaves(current.payload.ruleSet.nodes).map((rule) => rule.name);
        const nextNames = collectLeaves(nextNodes).map((rule) => rule.name);
        const currentEnabledCount = collectLeaves(current.payload.ruleSet.nodes)
          .filter((rule) => rule.enabled).length;
        const nextEnabledCount = collectLeaves(nextNodes).filter((rule) => rule.enabled).length;
        return {
          lines: [
            `Rule count: ${currentNames.length} → ${nextNames.length}`,
            `Removed: ${diffNames(currentNames, nextNames) || '(none)'}`,
            `Added: ${diffNames(nextNames, currentNames) || '(none)'}`,
          ],
          metadata: {
            baseRevision,
            currentRuleCount: currentNames.length,
            nextRuleCount: nextNames.length,
            currentEnabledCount,
            nextEnabledCount,
            removedNames: diffNames(currentNames, nextNames),
            addedNames: diffNames(nextNames, currentNames),
          },
        };
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['baseRevision', 'nodes']);
        const baseRevision = requireIntegerInRange(args, 'baseRevision', { minimum: 0 });
        const parsedNodes = parseRuleNodes(args['nodes']);
        const current = await context.host.invoke({ type: 'rules.get', payload: {} }, context.abortSignal);
        requireCurrentRuleRevision(baseRevision, current.payload.ruleSet.revision);
        const nodes = restorePreservedRuleLocalPaths(
          parsedNodes,
          current.payload.ruleSet.nodes,
        );
        const result = await context.host.invoke({
          type: 'rules.replace',
          payload: { expectedRevision: baseRevision, nodes },
        }, context.abortSignal);
        return result.payload;
      },
    },
    commandChange(
      'capture_start_recording',
      'Start recording',
      'Resume capture in the current session.',
      'capture',
      { type: 'proxy.start', payload: {} },
    ),
    commandChange(
      'capture_stop_recording',
      'Stop recording',
      'Pause capture without stopping the proxy.',
      'capture',
      { type: 'proxy.setRecording', payload: { recording: false } },
      'New traffic will continue through the proxy but will not be captured.',
    ),
    {
      name: 'composer_send_request',
      title: 'Send request',
      description: 'Send a Composer request from this machine.',
      capabilityId: 'composer',
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
        const request = readComposerRequest(args);
        return {
          lines: [
            `${request.method} ${request.url}`,
            'This sends real traffic from your machine.',
          ],
        };
      },
      async execute(args, context) {
        const request = readComposerRequest(args);
        const result = await context.host.invoke({
          type: 'composer.send',
          payload: request,
        }, context.abortSignal);
        const payload = result.payload;
        const mimeType = headerValue(payload.headers, 'content-type');
        return {
          method: request.method,
          url: interceptorToolRedactor.redactUrl(request.url),
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
      'breakpoints_enable_http',
      'Enable HTTP breakpoints',
      'Start suspending matching HTTP traffic.',
      'breakpoints',
      { type: 'breakpoint.configure', payload: { enabled: true } },
    ),
    commandChange(
      'breakpoints_disable_http',
      'Disable HTTP breakpoints',
      'Stop suspending matching HTTP traffic.',
      'breakpoints',
      { type: 'breakpoint.configure', payload: { enabled: false } },
    ),
    {
      name: 'breakpoints_enable_websocket',
      title: 'Enable WebSocket breakpoint',
      description: 'Suspend selected frames on one connection.',
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
      async describeChange(args) {
        rejectUnknownKeys(args, ['exchangeId', 'direction', 'frames']);
        const exchangeId = requireString(args, 'exchangeId');
        const direction = optionalEnum(args, 'direction', WEBSOCKET_DIRECTIONS) ?? 'both';
        const frames = requireStringArray(args, 'frames', WEBSOCKET_FRAMES);
        return {
          lines: [
            `Connection: ${exchangeId}`,
            `Direction: ${direction}`,
            `Frames: ${frames.join(', ')}`,
          ],
          metadata: { exchangeId, direction, frameCount: frames.length },
        };
      },
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
      'breakpoints_disable_websocket',
      'Disable WebSocket breakpoint',
      'Resume frames on the selected connection.',
      'breakpoints',
      { type: 'websocket.breakpoint.disable', payload: {} },
      'The active WebSocket breakpoint configuration will be disabled.',
    ),
    breakpointResolveTool(
      'breakpoints_continue',
      'Continue breakpoint',
      'Forward one suspended item unchanged.',
      'continue',
    ),
    {
      name: 'breakpoints_forward_edited',
      title: 'Forward edited breakpoint',
      description: 'Forward one suspended item with explicit edits.',
      capabilityId: 'breakpoints',
      searchTerms: ['request', 'response', 'edit'],
      kind: 'change',
      destructive: false,
      openWorld: false,
      inputSchema: schema({
        breakpointId: property('string', 'Identifier from breakpoints_list.'),
        method: property('string', 'Replacement HTTP method.'),
        url: property('string', 'Replacement URL.'),
        statusCode: property('integer', 'Replacement response status.', { minimum: 100 }),
        body: property('string', 'Replacement body; empty text explicitly clears it.'),
      }, ['breakpointId']),
      async describeChange(args, context) {
        rejectUnknownKeys(args, ['breakpointId', 'method', 'url', 'statusCode', 'body']);
        const edit = buildBreakpointEdit(args);
        if (edit === null) {
          throw new InterceptorToolArgumentError(
            'breakpoints_forward_edited requires at least one edit',
          );
        }
        const breakpoint = await requirePendingBreakpoint(args, context);
        validateBreakpointEdit(breakpoint, edit);
        const current = describePendingBreakpointValue(breakpoint);
        return {
          lines: [...current.lines, ...describeEdit(args)],
          metadata: current.metadata,
        };
      },
      async execute(args, context) {
        rejectUnknownKeys(args, ['breakpointId', 'method', 'url', 'statusCode', 'body']);
        const edit = buildBreakpointEdit(args);
        if (edit === null) {
          throw new InterceptorToolArgumentError(
            'breakpoints_forward_edited requires at least one edit',
          );
        }
        const breakpoint = await requirePendingBreakpoint(args, context);
        validateBreakpointEdit(breakpoint, edit);
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
      'breakpoints_drop',
      'Drop breakpoint',
      'Discard one suspended item.',
      'drop',
      true,
    ),
    {
      name: 'capture_clear',
      title: 'Clear capture',
      description: 'Delete captured exchanges and bodies.',
      capabilityId: 'capture',
      searchTerms: ['delete', 'reset'],
      kind: 'change',
      destructive: true,
      openWorld: false,
      inputSchema: schema(),
      async describeChange(args, context) {
        rejectUnknownKeys(args, []);
        const status = await context.host.invoke({ type: 'capture.status', payload: {} }, context.abortSignal);
        return {
          lines: [
            'Scope: all',
            `This permanently deletes ${status.payload.exchangeCount} exchange(s) `
            + `and ${status.payload.bodyCount} body/bodies.`,
          ],
          metadata: {
            scope: 'all',
            exchangeCount: status.payload.exchangeCount,
            bodyCount: status.payload.bodyCount,
          },
        };
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
      name: 'composer_probe_connection',
      title: 'Probe connection',
      description: 'Open a TLS probe to a host and port.',
      capabilityId: 'composer',
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
        const request = readTlsProbeRequest(args);
        return {
          lines: [
            `Opens a real connection to ${request.host}:${request.port}`,
          ],
        };
      },
      async execute(args, context) {
        const request = readTlsProbeRequest(args);
        const result = await context.host.invoke({
          type: 'tls.probe',
          payload: request,
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
  effectDescription?: string,
): InterceptorToolDefinition {
  return {
    ...(effectDescription === undefined ? {} : { effectDescription }),
    name,
    title,
    description,
    capabilityId,
    kind: 'change',
    destructive: false,
    openWorld: false,
    inputSchema: schema(),
    ...(command.type === 'breakpoint.configure' ? {
      describeChange: (
        args: Readonly<Record<string, unknown>>,
        context: InterceptorToolContext,
      ) => describeHttpBreakpointConfiguration(args, context, command.payload.enabled),
    } : {}),
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
      breakpointId: property('string', 'Identifier from breakpoints_list.'),
    }, ['breakpointId']),
    async describeChange(args, context) {
      rejectUnknownKeys(args, ['breakpointId']);
      return describePendingBreakpoint(args, context);
    },
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

/** Describes one HTTP breakpoint toggle from the current pending state. */
async function describeHttpBreakpointConfiguration(
  args: Readonly<Record<string, unknown>>,
  context: InterceptorToolContext,
  nextEnabled: boolean,
): Promise<InterceptorToolChangeDescription> {
  rejectUnknownKeys(args, []);
  const current = await context.host.invoke(
    { type: 'breakpoint.list', payload: {} },
    context.abortSignal,
  );
  return {
    lines: [
      `HTTP breakpoints: ${current.payload.enabled ? 'enabled' : 'disabled'} → ${nextEnabled ? 'enabled' : 'disabled'}`,
      `Currently pending: ${current.payload.breakpoints.length}`,
    ],
    metadata: {
      currentEnabled: current.payload.enabled,
      nextEnabled,
      pendingCount: current.payload.breakpoints.length,
    },
  };
}

/** Finds one current pending and returns a bounded approval description. */
async function describePendingBreakpoint(
  args: Readonly<Record<string, unknown>>,
  context: InterceptorToolContext,
): Promise<InterceptorToolChangeDescription> {
  return describePendingBreakpointValue(await requirePendingBreakpoint(args, context));
}

/** Finds one current pending by its Core-owned identity. */
async function requirePendingBreakpoint(
  args: Readonly<Record<string, unknown>>,
  context: InterceptorToolContext,
): Promise<PendingBreakpoint> {
  const breakpointId = requireString(args, 'breakpointId');
  const current = await context.host.invoke(
    { type: 'breakpoint.list', payload: {} },
    context.abortSignal,
  );
  const breakpoint = current.payload.breakpoints.find(
    (candidate) => candidate.id === breakpointId,
  );
  if (!breakpoint) {
    throw new InterceptorToolArgumentError(
      `breakpoint "${breakpointId}" is no longer pending; re-read with breakpoints_list`,
    );
  }
  return breakpoint;
}

/** Builds one bounded approval description from a current pending. */
function describePendingBreakpointValue(
  breakpoint: PendingBreakpoint,
): InterceptorToolChangeDescription {
  const target = describeBreakpointTarget(breakpoint);
  return {
    lines: [
      `Breakpoint: ${breakpoint.id}`,
      `Phase: ${breakpoint.phase}`,
      `Queue: ${breakpoint.queueKey}`,
      `Target: ${target}`,
    ],
    metadata: {
      breakpointId: breakpoint.id,
      phase: breakpoint.phase,
      queueKey: breakpoint.queueKey,
      ...(breakpoint.ruleId === undefined ? {} : { ruleId: breakpoint.ruleId }),
      ...(breakpoint.exchangeId === undefined ? {} : { exchangeId: breakpoint.exchangeId }),
      target,
    },
  };
}

/** Formats one pending target without including headers or body content. */
function describeBreakpointTarget(breakpoint: PendingBreakpoint): string {
  if (breakpoint.phase === 'websocket') {
    return [
      breakpoint.direction ?? 'unknown-direction',
      breakpoint.frame ?? 'frame',
      breakpoint.exchangeId === undefined ? '' : `on ${breakpoint.exchangeId}`,
    ].filter((part) => part.length > 0).join(' ');
  }
  return [breakpoint.method, breakpoint.url]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(' ') || breakpoint.ruleName;
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
    if (name.startsWith(':')) {
      throw new InterceptorToolArgumentError(
        `"headers[${index}].name" must not contain an HTTP/2 pseudo-header`,
      );
    }
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

/** Rejects HTTP fields that cannot affect the selected Breakpoint phase. */
function validateBreakpointEdit(breakpoint: PendingBreakpoint, edit: BreakpointEdit): void {
  let invalidField: string | undefined;
  if (breakpoint.phase === 'request') {
    if (edit.statusCode !== undefined) invalidField = 'statusCode';
  } else if (breakpoint.phase === 'response') {
    if (edit.method !== undefined) invalidField = 'method';
    else if (edit.url !== undefined) invalidField = 'url';
  } else {
    if (edit.method !== undefined) invalidField = 'method';
    else if (edit.url !== undefined) invalidField = 'url';
    else if (edit.statusCode !== undefined) invalidField = 'statusCode';
  }
  if (invalidField === undefined) return;
  throw new InterceptorToolArgumentError(
    `"${invalidField}" cannot edit a ${breakpoint.phase} breakpoint`,
  );
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

/** Rejects a stale Rule replacement before approval or execution. */
function requireCurrentRuleRevision(baseRevision: number, currentRevision: number): void {
  if (currentRevision === baseRevision) return;
  throw new InterceptorToolArgumentError(
    `rule set moved from revision ${baseRevision} to ${currentRevision}; `
    + 're-read with rules_get_tree and retry',
  );
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

/** Reads one complete Composer request for approval and execution. */
function readComposerRequest(
  args: Readonly<Record<string, unknown>>,
): ComposerSendCommand['payload'] {
  rejectUnknownKeys(args, ['method', 'url', 'headers', 'body', 'protocol', 'timeoutMs']);
  return {
    method: requireString(args, 'method'),
    url: requireHttpUrl(args, 'url'),
    headers: readHeaderPairs(args),
    body: optionalText(args, 'body'),
    protocol: optionalEnum(args, 'protocol', ['auto', 'http/1.1', 'h2'] as const) ?? 'auto',
    timeoutMs: optionalIntegerInRange(args, 'timeoutMs', { minimum: 1 }),
  };
}

/** Reads one absolute HTTP(S) URL before any open-world approval is requested. */
function requireHttpUrl(
  args: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = requireString(args, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InterceptorToolArgumentError(
      `"${key}" must be an absolute http or https URL`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InterceptorToolArgumentError(`"${key}" must use http or https`);
  }
  return value;
}

/** Reads one bounded TLS probe target for approval and execution. */
function readTlsProbeRequest(
  args: Readonly<Record<string, unknown>>,
): TlsProbeCommand['payload'] {
  rejectUnknownKeys(args, ['host', 'port', 'timeoutMs']);
  return {
    host: requireString(args, 'host'),
    port: requireIntegerInRange(args, 'port', { minimum: 1, maximum: 65_535 }),
    timeoutMs: optionalIntegerInRange(args, 'timeoutMs', { minimum: 1 }),
  };
}