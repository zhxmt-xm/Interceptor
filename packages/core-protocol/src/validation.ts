import {
  CORE_PROTOCOL_VERSION,
  MAX_BODY_CHUNK_BYTES,
  MAX_DIAGNOSTIC_RECORDS,
  MAX_EVENT_BATCH_SIZE,
  MAX_QUERY_PAGE_SIZE,
  type CoreCommand,
  type CoreResult,
  type CoreToMainMessage,
  type DiagnosticLogRecord,
  type MainToCoreMessage,
  type ProtocolDiagnostic,
} from './messages';
import {
  MAX_ACTIONS_PER_RULE,
  MAX_MATCHERS_PER_RULE,
  MAX_RULE_BODY_LENGTH,
  MAX_RULE_DELAY_MS,
  MAX_RULE_ID_LENGTH,
  MAX_RULE_NAME_LENGTH,
  MAX_RULE_STRING_LENGTH,
  MAX_RULE_THROTTLE_BPS,
  MAX_RULES,
  MIN_RULE_THROTTLE_BPS,
  type RuleAction,
  type RuleDefinition,
  type RuleMatcher,
} from './rules';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const COMMAND_TYPES = new Set<CoreCommand['type']>([
  'echo',
  'sessions.query',
  'sessions.detail',
  'body.read-range',
  'rules.validate',
  'rules.replace',
  'rules.get',
  'rules.hits',
  'composer.send',
  'breakpoint.resolve',
  'diagnostics.recent',
  'diagnostics.query',
  'storage.status',
  'storage.cleanup',
  'proxy.start',
  'proxy.stop',
  'proxy.status',
  'tls.configure',
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ATTRIBUTE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const MAX_CURSOR_LENGTH = 1_024;
const MAX_ECHO_LENGTH = 4_096;
const MAX_FILTER_LENGTH = 1_024;
const MAX_HEADER_COUNT = 1_000;
const MAX_HEADER_VALUE_LENGTH = 8_192;
const MAX_PEM_LENGTH = 32_768;
const MAX_INSECURE_HOSTS = 200;
const MAX_LOG_ATTRIBUTE_COUNT = 32;
const MAX_LOG_ATTRIBUTE_STRING_LENGTH = 512;
const MAX_MESSAGE_LENGTH = 2_048;

export function parseMainToCoreMessage(
  value: unknown,
): ValidationResult<MainToCoreMessage> {
  if (!isRecord(value)) {
    return invalid('message must be an object');
  }

  let error: string | null;
  switch (value.kind) {
    case 'request':
      error = validateRecordKeys(value, 'message', [
        'kind',
        'protocolVersion',
        'requestId',
        'traceId',
        'command',
      ]) ?? validateVersion(value.protocolVersion) ??
        validateId(value.requestId, 'requestId') ??
        validateId(value.traceId, 'traceId') ??
        validateCommand(value.command);
      break;
    case 'cancel':
      error = validateRecordKeys(value, 'message', [
        'kind',
        'protocolVersion',
        'requestId',
        'reason',
      ]) ?? validateVersion(value.protocolVersion) ??
        validateId(value.requestId, 'requestId') ??
        validateOptionalEnum(value.reason, 'reason', [
          'caller',
          'timeout',
          'shutdown',
        ]);
      break;
    case 'event-ack':
      error = validateRecordKeys(value, 'message', [
        'kind',
        'protocolVersion',
        'batchSequence',
      ]) ?? validateVersion(value.protocolVersion) ??
        validateNonNegativeSafeInteger(value.batchSequence, 'batchSequence');
      break;
    default:
      return invalid('message.kind is unknown');
  }

  return error
    ? invalid(error)
    : valid(value as unknown as MainToCoreMessage);
}

export function parseCoreToMainMessage(
  value: unknown,
): ValidationResult<CoreToMainMessage> {
  if (!isRecord(value)) {
    return invalid('message must be an object');
  }

  let error: string | null;
  switch (value.kind) {
    case 'response':
      error = validateResponse(value);
      break;
    case 'event-batch':
      error = validateEventBatch(value);
      break;
    default:
      return invalid('message.kind is unknown');
  }

  return error
    ? invalid(error)
    : valid(value as unknown as CoreToMainMessage);
}

function validateResponse(value: Record<string, unknown>): string | null {
  const commonError = validateVersion(value.protocolVersion) ??
    validateId(value.requestId, 'requestId') ??
    validateId(value.traceId, 'traceId');
  if (commonError) {
    return commonError;
  }

  if (value.ok === true) {
    return validateRecordKeys(value, 'message', [
      'kind',
      'protocolVersion',
      'requestId',
      'traceId',
      'ok',
      'result',
    ]) ?? validateResult(value.result);
  }
  if (value.ok === false) {
    return validateRecordKeys(value, 'message', [
      'kind',
      'protocolVersion',
      'requestId',
      'traceId',
      'ok',
      'error',
    ]) ?? validateCoreError(value.error);
  }
  return 'message.ok must be a boolean';
}

function validateEventBatch(value: Record<string, unknown>): string | null {
  const common = validateRecordKeys(value, 'message', [
    'kind',
    'protocolVersion',
    'batchSequence',
    'events',
  ]) ?? validateVersion(value.protocolVersion) ??
    validateNonNegativeSafeInteger(value.batchSequence, 'batchSequence');
  return common ?? validateCaptureEvents(value.events);
}

function validateCaptureEvents(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > MAX_EVENT_BATCH_SIZE) {
    return `message.events must contain at most ${MAX_EVENT_BATCH_SIZE} events`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateCaptureEvent(value[index], `message.events[${index}]`);
    if (error) {
      return error;
    }
  }
  return null;
}

function validateCaptureEvent(value: unknown, name: string): string | null {
  return validateExactObject(value, name, ['kind', 'summary'], (event) =>
    validateEnum(event.kind, `${name}.kind`, [
      'exchange-added',
      'exchange-updated',
    ]) ?? validateCaptureSummary(event.summary, `${name}.summary`));
}

function validateCaptureSummary(value: unknown, name: string): string | null {
  return validateExactObject(
    value,
    name,
    [
      'id',
      'method',
      'secure',
      'host',
      'path',
      'protocol',
      'statusCode',
      'responseMime',
      'state',
      'startedAt',
      'durationMs',
      'requestBytes',
      'responseBytes',
    ],
    (summary) => validateId(summary.id, `${name}.id`) ??
      validateBoundedString(summary.method, `${name}.method`, 32) ??
      validateBoolean(summary.secure, `${name}.secure`) ??
      validateOptionalBoundedString(summary.host, `${name}.host`, MAX_FILTER_LENGTH) ??
      validateOptionalBoundedString(summary.path, `${name}.path`, 2_048) ??
      validateBoundedString(summary.protocol, `${name}.protocol`, 32) ??
      validateOptionalIntegerRange(summary.statusCode, `${name}.statusCode`, 100, 599) ??
      validateOptionalBoundedString(summary.responseMime, `${name}.responseMime`, 256) ??
      validateBoundedString(summary.state, `${name}.state`, 32) ??
      validateNonNegativeSafeInteger(summary.startedAt, `${name}.startedAt`) ??
      validateOptionalNonNegativeNumber(summary.durationMs, `${name}.durationMs`) ??
      validateNonNegativeSafeInteger(summary.requestBytes, `${name}.requestBytes`) ??
      validateNonNegativeSafeInteger(summary.responseBytes, `${name}.responseBytes`),
  );
}

function validateCommand(value: unknown): string | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return 'command must contain a type';
  }

  switch (value.type) {
    case 'echo':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateEchoPayload(value.payload, 'command.payload');
    case 'sessions.query':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateSessionsQuery(value.payload);
    case 'sessions.detail':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateSessionsDetailRequest(value.payload);
    case 'tls.configure':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateTlsConfigure(value.payload);
    case 'body.read-range':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateBodyRangeRequest(value.payload);
    case 'rules.validate':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateRuleValidationRequest(value.payload);
    case 'rules.replace':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateRuleReplacementRequest(value.payload);
    case 'rules.get':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateRulesGetRequest(value.payload);
    case 'rules.hits':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateEmptyPayload(value.payload);
    case 'composer.send':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateComposerSend(value.payload);
    case 'breakpoint.resolve':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateBreakpointResolutionRequest(value.payload);
    case 'diagnostics.recent':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateDiagnosticsRecent(value.payload);
    case 'diagnostics.query':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateDiagnosticsQuery(value.payload);
    case 'storage.status':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateStorageStatusPayload(value.payload);
    case 'storage.cleanup':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateStorageCleanup(value.payload);
    case 'proxy.start':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateProxyStart(value.payload);
    case 'proxy.stop':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateEmptyPayload(value.payload);
    case 'proxy.status':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateEmptyPayload(value.payload);
    default:
      return 'command.type is unknown';
  }
}

function validateResult(value: unknown): string | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return 'result must contain a type';
  }

  switch (value.type) {
    case 'echo':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateEchoResultPayload(value.payload);
    case 'sessions.page':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateSessionsPage(value.payload);
    case 'sessions.detail':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateSessionsDetailResult(value.payload);
    case 'body.range':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateBodyRangeResult(value.payload);
    case 'rules.validation':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateRuleValidationResult(value.payload);
    case 'rules.revision':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateRuleRevision(value.payload);
    case 'rules.ruleset':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateRulesRuleSetResult(value.payload);
    case 'rules.hits':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateRulesHitsResult(value.payload);
    case 'composer.response':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateComposerResponse(value.payload);
    case 'breakpoint.resolution':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateBreakpointResolutionResult(value.payload);
    case 'diagnostics.records':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateDiagnosticsRecords(value.payload);
    case 'diagnostics.page':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateDiagnosticsPage(value.payload);
    case 'storage.status':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateStorageStatusResult(value.payload);
    case 'proxy.status':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateProxyStatusResult(value.payload);
    case 'tls.configured':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateTlsConfiguredResult(value.payload);
    default:
      return 'result.type is unknown';
  }
}

function validateEchoPayload(value: unknown, name: string): string | null {
  return validateExactObject(value, name, ['value'], (payload) =>
    validateBoundedString(payload.value, `${name}.value`, MAX_ECHO_LENGTH));
}

function validateEchoResultPayload(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['value', 'handledAt'],
    (payload) => validateBoundedString(
      payload.value,
      'result.payload.value',
      MAX_ECHO_LENGTH,
    ) ?? validateTimestamp(payload.handledAt, 'result.payload.handledAt'),
  );
}

function validateSessionsQuery(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['cursor', 'limit', 'sort', 'filter'],
    (payload) => validateOptionalBoundedString(
      payload.cursor,
      'command.payload.cursor',
      MAX_CURSOR_LENGTH,
    ) ?? validateIntegerRange(
      payload.limit,
      'command.payload.limit',
      1,
      MAX_QUERY_PAGE_SIZE,
    ) ?? validateEnum(payload.sort, 'command.payload.sort', [
      'started_desc',
      'started_asc',
    ]) ?? validateSessionFilter(payload.filter),
  );
}

function validateSessionFilter(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload.filter',
    ['host', 'method', 'status', 'mime', 'process', 'search'],
    (filter) => validateOptionalBoundedString(
      filter.host,
      'command.payload.filter.host',
      MAX_FILTER_LENGTH,
    ) ?? validateOptionalBoundedString(
      filter.method,
      'command.payload.filter.method',
      32,
    ) ?? validateOptionalIntegerRange(
      filter.status,
      'command.payload.filter.status',
      100,
      999,
    ) ?? validateOptionalBoundedString(
      filter.mime,
      'command.payload.filter.mime',
      256,
    ) ?? validateOptionalBoundedString(
      filter.process,
      'command.payload.filter.process',
      MAX_FILTER_LENGTH,
    ) ?? validateOptionalBoundedString(
      filter.search,
      'command.payload.filter.search',
      MAX_FILTER_LENGTH,
    ),
  );
}

function validateBodyRangeRequest(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['bodyId', 'offset', 'length', 'decode', 'encoding'],
    (payload) => validateId(payload.bodyId, 'command.payload.bodyId') ??
      validateNonNegativeSafeInteger(
        payload.offset,
        'command.payload.offset',
      ) ?? validateIntegerRange(
        payload.length,
        'command.payload.length',
        1,
        MAX_BODY_CHUNK_BYTES,
      ) ??
      (payload.decode === undefined
        ? null
        : validateBoolean(payload.decode, 'command.payload.decode')) ??
      validateOptionalBoundedString(
        payload.encoding,
        'command.payload.encoding',
        256,
      ),
  );
}

/**
 * 对已通过 wire 校验的规则集做语义级校验，返回诊断列表（空数组表示语义有效）。
 *
 * wire 校验（validateRuleDefinition）只保证结构/枚举/上限；此处补充跨字段与运行时
 * 可行性检查：重复规则 id、regex matcher 可编译性、status 区间 min<=max、JSON body
 * 可解析。供 rules.validate / rules.replace handler 复用；Renderer 经命令获取诊断。
 */
export function collectRuleDiagnostics(
  rules: readonly RuleDefinition[],
): ProtocolDiagnostic[] {
  const diagnostics: ProtocolDiagnostic[] = [];
  const seenIds = new Set<string>();
  rules.forEach((rule, index) => {
    const base = `rules[${index}]`;
    if (seenIds.has(rule.id)) {
      diagnostics.push({
        code: 'duplicate-rule-id',
        message: `Duplicate rule id "${rule.id}".`,
        path: `${base}.id`,
      });
    }
    seenIds.add(rule.id);
    rule.matchers.forEach((matcher, matcherIndex) => {
      collectMatcherDiagnostics(
        matcher,
        `${base}.matchers[${matcherIndex}]`,
        diagnostics,
      );
    });
    rule.actions.forEach((action, actionIndex) => {
      collectActionDiagnostics(
        action,
        `${base}.actions[${actionIndex}]`,
        diagnostics,
      );
    });
  });
  return diagnostics;
}

function collectMatcherDiagnostics(
  matcher: RuleMatcher,
  path: string,
  diagnostics: ProtocolDiagnostic[],
): void {
  if (
    (matcher.type === 'host' ||
      matcher.type === 'path' ||
      matcher.type === 'url') &&
    matcher.mode === 'regex' &&
    !isValidRegExp(matcher.value)
  ) {
    diagnostics.push(invalidRegexDiagnostic(matcher.value, `${path}.value`));
  }
  if (
    (matcher.type === 'query' || matcher.type === 'header') &&
    matcher.mode === 'regex' &&
    matcher.value !== undefined &&
    !isValidRegExp(matcher.value)
  ) {
    diagnostics.push(invalidRegexDiagnostic(matcher.value, `${path}.value`));
  }
  if (matcher.type === 'status' && matcher.min > matcher.max) {
    diagnostics.push({
      code: 'invalid-status-range',
      message: `Status range min (${matcher.min}) must not exceed max (${matcher.max}).`,
      path,
    });
  }
}

function collectActionDiagnostics(
  action: RuleAction,
  path: string,
  diagnostics: ProtocolDiagnostic[],
): void {
  if (action.type === 'body' && action.format === 'json') {
    try {
      JSON.parse(action.content);
    } catch {
      diagnostics.push({
        code: 'invalid-json-body',
        message: 'The JSON body action content is not valid JSON.',
        path: `${path}.content`,
      });
    }
  }
  if (action.type === 'map-local' && /(^|[/\\])\.\.([/\\]|$)/.test(action.path)) {
    diagnostics.push({
      code: 'unsafe-map-path',
      message: 'Map Local path must not contain ".." segments.',
      path: `${path}.path`,
    });
  }
  if (
    action.type === 'map-remote' &&
    action.scheme === undefined &&
    action.host === undefined &&
    action.port === undefined &&
    action.path === undefined
  ) {
    diagnostics.push({
      code: 'empty-map-remote',
      message: 'Map Remote must override at least one of scheme/host/port/path.',
      path,
    });
  }
}

function invalidRegexDiagnostic(
  pattern: string,
  path: string,
): ProtocolDiagnostic {
  return {
    code: 'invalid-regex',
    message: `Pattern "${pattern}" is not a valid regular expression.`,
    path,
  };
}

function isValidRegExp(pattern: string): boolean {
  try {
    // 仅测试可编译性；作为函数调用（而非独立 new 语句）避免 no-new lint。
    RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function validateRuleValidationRequest(value: unknown): string | null {
  return validateExactObject(value, 'command.payload', ['rules'], (payload) =>
    validateRuleArray(payload.rules, 'command.payload.rules'));
}

function validateRuleReplacementRequest(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['expectedRevision', 'rules'],
    (payload) => validateNonNegativeSafeInteger(
      payload.expectedRevision,
      'command.payload.expectedRevision',
    ) ?? validateRuleArray(payload.rules, 'command.payload.rules'),
  );
}

function validateRulesGetRequest(value: unknown): string | null {
  return validateExactObject(value, 'command.payload', [], () => null);
}

function validateRuleArray(value: unknown, name: string): string | null {
  if (!Array.isArray(value) || value.length > MAX_RULES) {
    return `${name} must contain at most ${MAX_RULES} rules`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateRuleDefinition(value[index], `${name}[${index}]`);
    if (error) {
      return error;
    }
  }
  return null;
}

function validateRuleDefinition(value: unknown, name: string): string | null {
  return validateExactObject(
    value,
    name,
    ['id', 'name', 'enabled', 'priority', 'matchers', 'actions'],
    (rule) => validateBoundedString(rule.id, `${name}.id`, MAX_RULE_ID_LENGTH) ??
      validateBoundedString(rule.name, `${name}.name`, MAX_RULE_NAME_LENGTH) ??
      validateBoolean(rule.enabled, `${name}.enabled`) ??
      validateIntegerRange(rule.priority, `${name}.priority`, 0, 1_000_000) ??
      validateRuleMatcherArray(rule.matchers, `${name}.matchers`) ??
      validateRuleActionArray(rule.actions, `${name}.actions`),
  );
}

function validateRuleMatcherArray(value: unknown, name: string): string | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_MATCHERS_PER_RULE
  ) {
    return `${name} must contain 1 to ${MAX_MATCHERS_PER_RULE} matchers`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateRuleMatcher(value[index], `${name}[${index}]`);
    if (error) {
      return error;
    }
  }
  return null;
}

function validateRuleMatcher(value: unknown, name: string): string | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return `${name}.type must be a string`;
  }
  switch (value.type) {
    case 'method':
      return validateRecordKeys(value, name, ['type', 'value']) ??
        validateBoundedString(value.value, `${name}.value`, 64);
    case 'host':
    case 'path':
    case 'url':
      return validateRecordKeys(value, name, ['type', 'value', 'mode']) ??
        validateBoundedString(value.value, `${name}.value`, MAX_RULE_STRING_LENGTH) ??
        validateEnum(value.mode, `${name}.mode`, ['exact', 'wildcard', 'regex']);
    case 'query':
      return validateRecordKeys(value, name, ['type', 'key', 'mode', 'value']) ??
        validateBoundedString(value.key, `${name}.key`, 256) ??
        validateEnum(value.mode, `${name}.mode`, ['present', 'exact', 'regex']) ??
        validateOptionalBoundedString(value.value, `${name}.value`, MAX_RULE_STRING_LENGTH);
    case 'header':
      return validateRecordKeys(value, name, [
        'type',
        'phase',
        'name',
        'mode',
        'value',
      ]) ??
        validateEnum(value.phase, `${name}.phase`, ['request', 'response']) ??
        validateBoundedString(value.name, `${name}.name`, 256) ??
        validateEnum(value.mode, `${name}.mode`, ['present', 'exact', 'regex']) ??
        validateOptionalBoundedString(value.value, `${name}.value`, MAX_RULE_STRING_LENGTH);
    case 'status':
      return validateRecordKeys(value, name, ['type', 'min', 'max']) ??
        validateIntegerRange(value.min, `${name}.min`, 100, 599) ??
        validateIntegerRange(value.max, `${name}.max`, 100, 599);
    case 'mime':
      return validateRecordKeys(value, name, ['type', 'phase', 'value']) ??
        validateEnum(value.phase, `${name}.phase`, ['request', 'response']) ??
        validateBoundedString(value.value, `${name}.value`, 256);
    default:
      return `${name}.type is invalid`;
  }
}

function validateRuleActionArray(value: unknown, name: string): string | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_ACTIONS_PER_RULE
  ) {
    return `${name} must contain 1 to ${MAX_ACTIONS_PER_RULE} actions`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateRuleAction(value[index], `${name}[${index}]`);
    if (error) {
      return error;
    }
  }
  return null;
}

function validateRuleAction(value: unknown, name: string): string | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return `${name}.type must be a string`;
  }
  switch (value.type) {
    case 'header':
      return validateRecordKeys(value, name, [
        'type',
        'phase',
        'op',
        'name',
        'value',
      ]) ??
        validateEnum(value.phase, `${name}.phase`, ['request', 'response']) ??
        validateEnum(value.op, `${name}.op`, ['set', 'append', 'remove']) ??
        validateBoundedString(value.name, `${name}.name`, 256) ??
        validateOptionalBoundedString(value.value, `${name}.value`, MAX_RULE_STRING_LENGTH);
    case 'query':
      return validateRecordKeys(value, name, ['type', 'op', 'name', 'value']) ??
        validateEnum(value.op, `${name}.op`, ['set', 'remove']) ??
        validateBoundedString(value.name, `${name}.name`, 256) ??
        validateOptionalBoundedString(value.value, `${name}.value`, MAX_RULE_STRING_LENGTH);
    case 'body':
      return validateRecordKeys(value, name, [
        'type',
        'phase',
        'format',
        'content',
      ]) ??
        validateEnum(value.phase, `${name}.phase`, ['request', 'response']) ??
        validateEnum(value.format, `${name}.format`, ['text', 'json']) ??
        validateBoundedString(value.content, `${name}.content`, MAX_RULE_BODY_LENGTH);
    case 'synthetic':
      return validateRecordKeys(value, name, [
        'type',
        'statusCode',
        'headers',
        'body',
      ]) ??
        validateIntegerRange(value.statusCode, `${name}.statusCode`, 100, 599) ??
        validateOptionalRuleHeaderPairs(value.headers, `${name}.headers`) ??
        validateOptionalBoundedString(value.body, `${name}.body`, MAX_RULE_BODY_LENGTH);
    case 'map-local':
      return validateRecordKeys(value, name, ['type', 'path']) ??
        validateBoundedString(value.path, `${name}.path`, MAX_RULE_STRING_LENGTH);
    case 'map-remote':
      return validateRecordKeys(value, name, [
        'type',
        'scheme',
        'host',
        'port',
        'path',
      ]) ??
        (value.scheme === undefined
          ? null
          : validateEnum(value.scheme, `${name}.scheme`, ['http', 'https'])) ??
        validateOptionalBoundedString(value.host, `${name}.host`, 256) ??
        validateOptionalIntegerRange(value.port, `${name}.port`, 1, 65_535) ??
        validateOptionalBoundedString(value.path, `${name}.path`, MAX_RULE_STRING_LENGTH);
    case 'block':
      return validateRecordKeys(value, name, ['type', 'mode']) ??
        validateEnum(value.mode, `${name}.mode`, ['reset', 'close']);
    case 'status':
      return validateRecordKeys(value, name, ['type', 'statusCode']) ??
        validateIntegerRange(value.statusCode, `${name}.statusCode`, 100, 599);
    case 'delay':
      return validateRecordKeys(value, name, ['type', 'phase', 'ms']) ??
        validateEnum(value.phase, `${name}.phase`, ['request', 'response']) ??
        validateIntegerRange(value.ms, `${name}.ms`, 0, MAX_RULE_DELAY_MS);
    case 'throttle':
      return validateRecordKeys(value, name, [
        'type',
        'phase',
        'bytesPerSecond',
      ]) ??
        validateEnum(value.phase, `${name}.phase`, ['request', 'response']) ??
        validateIntegerRange(
          value.bytesPerSecond,
          `${name}.bytesPerSecond`,
          MIN_RULE_THROTTLE_BPS,
          MAX_RULE_THROTTLE_BPS,
        );
    case 'breakpoint':
      return validateRecordKeys(value, name, [
        'type',
        'phase',
        'timeoutMs',
        'onTimeout',
      ]) ??
        validateEnum(value.phase, `${name}.phase`, ['request', 'response']) ??
        validateIntegerRange(value.timeoutMs, `${name}.timeoutMs`, 1_000, 600_000) ??
        validateEnum(value.onTimeout, `${name}.onTimeout`, ['continue', 'drop']);
    default:
      return `${name}.type is invalid`;
  }
}

function validateOptionalRuleHeaderPairs(
  value: unknown,
  name: string,
): string | null {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value) || value.length > 128) {
    return `${name} must contain at most 128 headers`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateExactObject(
      value[index],
      `${name}[${index}]`,
      ['name', 'value'],
      (header) => validateBoundedString(header.name, `${name}[${index}].name`, 256) ??
        validateBoundedString(header.value, `${name}[${index}].value`, MAX_RULE_STRING_LENGTH),
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function validateRuleSet(value: unknown, name: string): string | null {
  return validateExactObject(value, name, ['revision', 'rules'], (ruleSet) =>
    validateNonNegativeSafeInteger(ruleSet.revision, `${name}.revision`) ??
      validateRuleArray(ruleSet.rules, `${name}.rules`));
}

function validateRulesRuleSetResult(value: unknown): string | null {
  return validateExactObject(value, 'result.payload', ['ruleSet'], (payload) =>
    validateRuleSet(payload.ruleSet, 'result.payload.ruleSet'));
}

function validateRulesHitsResult(value: unknown): string | null {
  return validateExactObject(value, 'result.payload', ['counts'], (payload) => {
    if (!Array.isArray(payload.counts) || payload.counts.length > MAX_RULES) {
      return `result.payload.counts must contain at most ${MAX_RULES} entries`;
    }
    for (let index = 0; index < payload.counts.length; index += 1) {
      const error = validateExactObject(
        payload.counts[index],
        `result.payload.counts[${index}]`,
        ['ruleId', 'count'],
        (entry) => validateBoundedString(
          entry.ruleId,
          `result.payload.counts[${index}].ruleId`,
          MAX_RULE_ID_LENGTH,
        ) ?? validateIntegerRange(
          entry.count,
          `result.payload.counts[${index}].count`,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      );
      if (error) {
        return error;
      }
    }
    return null;
  });
}

function validateComposerSend(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['method', 'url', 'headers', 'body', 'protocol', 'timeoutMs'],
    (payload) => validateBoundedString(payload.method, 'command.payload.method', 64) ??
      validateBoundedString(payload.url, 'command.payload.url', MAX_RULE_STRING_LENGTH) ??
      (!Array.isArray(payload.headers)
        ? 'command.payload.headers must be an array'
        : validateOptionalRuleHeaderPairs(payload.headers, 'command.payload.headers')) ??
      validateOptionalBoundedString(payload.body, 'command.payload.body', MAX_RULE_BODY_LENGTH) ??
      validateEnum(payload.protocol, 'command.payload.protocol', ['auto', 'http/1.1', 'h2']) ??
      (payload.timeoutMs === undefined
        ? null
        : validateIntegerRange(payload.timeoutMs, 'command.payload.timeoutMs', 1, 120_000)),
  );
}

function validateComposerResponse(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    [
      'ok',
      'error',
      'status',
      'statusText',
      'httpVersion',
      'headers',
      'body',
      'bodyTruncated',
      'totalBytes',
      'durationMs',
      'tls',
      'remoteAddress',
    ],
    (payload) => validateBoolean(payload.ok, 'result.payload.ok') ??
      validateOptionalBoundedString(payload.error, 'result.payload.error', MAX_MESSAGE_LENGTH) ??
      validateIntegerRange(payload.status, 'result.payload.status', 0, 599) ??
      validateBoundedString(payload.statusText, 'result.payload.statusText', 256) ??
      validateBoundedString(payload.httpVersion, 'result.payload.httpVersion', 32) ??
      (!Array.isArray(payload.headers)
        ? 'result.payload.headers must be an array'
        : validateOptionalRuleHeaderPairs(payload.headers, 'result.payload.headers')) ??
      validateByteArray(payload.body, 'result.payload.body') ??
      validateBoolean(payload.bodyTruncated, 'result.payload.bodyTruncated') ??
      validateNonNegativeSafeInteger(payload.totalBytes, 'result.payload.totalBytes') ??
      validateNonNegativeSafeInteger(payload.durationMs, 'result.payload.durationMs') ??
      validateComposerTls(payload.tls, 'result.payload.tls') ??
      (payload.remoteAddress === null
        ? null
        : validateBoundedString(payload.remoteAddress, 'result.payload.remoteAddress', 128)),
  );
}

function validateComposerTls(value: unknown, name: string): string | null {
  if (value === null) {
    return null;
  }
  return validateExactObject(
    value,
    name,
    ['protocol', 'cipher', 'alpn', 'subject', 'issuer', 'validFrom', 'validTo'],
    (tls) => validateBoundedString(tls.protocol, `${name}.protocol`, 64) ??
      validateBoundedString(tls.cipher, `${name}.cipher`, 128) ??
      validateBoundedString(tls.alpn, `${name}.alpn`, 32) ??
      validateBoundedString(tls.subject, `${name}.subject`, 512) ??
      validateBoundedString(tls.issuer, `${name}.issuer`, 512) ??
      validateBoundedString(tls.validFrom, `${name}.validFrom`, 64) ??
      validateBoundedString(tls.validTo, `${name}.validTo`, 64),
  );
}

function validateBreakpointResolutionRequest(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['breakpointId', 'action', 'edit'],
    (payload) => validateId(
      payload.breakpointId,
      'command.payload.breakpointId',
    ) ?? validateEnum(payload.action, 'command.payload.action', [
      'continue',
      'drop',
      'timeout',
    ]) ?? validateBreakpointEdit(payload.edit, 'command.payload.edit'),
  );
}

function validateBreakpointEdit(value: unknown, name: string): string | null {
  if (value === undefined) {
    return null;
  }
  return validateExactObject(
    value,
    name,
    ['method', 'url', 'statusCode', 'headers', 'body'],
    (edit) => validateOptionalBoundedString(edit.method, `${name}.method`, 64) ??
      validateOptionalBoundedString(
        edit.url,
        `${name}.url`,
        MAX_RULE_STRING_LENGTH,
      ) ?? validateOptionalIntegerRange(
        edit.statusCode,
        `${name}.statusCode`,
        100,
        599,
      ) ?? validateOptionalRuleHeaderPairs(edit.headers, `${name}.headers`) ??
      validateOptionalBoundedString(
        edit.body,
        `${name}.body`,
        MAX_RULE_BODY_LENGTH,
      ),
  );
}

function validateDiagnosticsRecent(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['limit', 'traceId'],
    (payload) => validateIntegerRange(
      payload.limit,
      'command.payload.limit',
      1,
      MAX_DIAGNOSTIC_RECORDS,
    ) ?? validateOptionalId(payload.traceId, 'command.payload.traceId'),
  );
}

function validateDiagnosticsQuery(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['cursor', 'limit', 'level', 'traceId'],
    (payload) => validateOptionalBoundedString(
      payload.cursor,
      'command.payload.cursor',
      MAX_CURSOR_LENGTH,
    ) ?? validateIntegerRange(
      payload.limit,
      'command.payload.limit',
      1,
      MAX_DIAGNOSTIC_RECORDS,
    ) ?? validateOptionalEnum(payload.level, 'command.payload.level', [
      'debug',
      'info',
      'warn',
      'error',
    ]) ?? validateOptionalId(payload.traceId, 'command.payload.traceId'),
  );
}

function validateStorageStatusPayload(value: unknown): string | null {
  return validateExactObject(value, 'command.payload', [], () => null);
}

function validateEmptyPayload(value: unknown): string | null {
  return validateExactObject(value, 'command.payload', [], () => null);
}

function validateProxyStart(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['port'],
    (payload) =>
      validateOptionalIntegerRange(payload.port, 'command.payload.port', 1, 65_535),
  );
}

function validateStorageCleanup(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['scope', 'sessionId'],
    (payload) => {
      const scopeError = validateEnum(payload.scope, 'command.payload.scope', [
        'all',
        'session',
      ]);
      if (scopeError) {
        return scopeError;
      }
      if (payload.scope === 'session') {
        return validateId(payload.sessionId, 'command.payload.sessionId');
      }
      return payload.sessionId === undefined
        ? null
        : 'command.payload.sessionId is not allowed when scope is all';
    },
  );
}

function validateSessionsPage(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['items', 'nextCursor', 'hasMore'],
    (payload) => validateSummaryArray(payload.items) ??
      validateOptionalBoundedString(
        payload.nextCursor,
        'result.payload.nextCursor',
        MAX_CURSOR_LENGTH,
      ) ?? validateBoolean(payload.hasMore, 'result.payload.hasMore'),
  );
}

function validateSummaryArray(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > MAX_QUERY_PAGE_SIZE) {
    return `result.payload.items must contain at most ${MAX_QUERY_PAGE_SIZE} items`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateCaptureSummary(
      value[index],
      `result.payload.items[${index}]`,
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function validateSessionsDetailRequest(value: unknown): string | null {
  return validateExactObject(value, 'command.payload', ['exchangeId'], (payload) =>
    validateId(payload.exchangeId, 'command.payload.exchangeId'));
}

function validateTlsConfigure(value: unknown): string | null {
  return validateExactObject(value, 'command.payload', ['ca', 'insecureHosts'], (payload) =>
    validateCaMaterial(payload.ca) ?? validateInsecureHosts(payload.insecureHosts));
}

function validateCaMaterial(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return validateExactObject(value, 'command.payload.ca', ['key', 'cert'], (ca) =>
    validateBoundedString(ca.key, 'command.payload.ca.key', MAX_PEM_LENGTH) ??
    validateBoundedString(ca.cert, 'command.payload.ca.cert', MAX_PEM_LENGTH));
}

function validateInsecureHosts(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > MAX_INSECURE_HOSTS) {
    return `command.payload.insecureHosts must contain at most ${MAX_INSECURE_HOSTS} hosts`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateBoundedString(
      value[index],
      `command.payload.insecureHosts[${index}]`,
      MAX_FILTER_LENGTH,
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function validateTlsConfiguredResult(value: unknown): string | null {
  return validateExactObject(value, 'result.payload', ['mitmEnabled'], (payload) =>
    validateBoolean(payload.mitmEnabled, 'result.payload.mitmEnabled'));
}

function validateSessionsDetailResult(value: unknown): string | null {
  return validateExactObject(value, 'result.payload', ['detail'], (payload) =>
    payload.detail === null
      ? null
      : validateExchangeDetail(payload.detail, 'result.payload.detail'));
}

function validateExchangeDetail(value: unknown, name: string): string | null {
  return validateExactObject(
    value,
    name,
    [
      'summary',
      'url',
      'scheme',
      'port',
      'statusText',
      'requestMime',
      'errorCode',
      'streamId',
      'requestHeaders',
      'responseHeaders',
      'requestTrailers',
      'responseTrailers',
      'requestBody',
      'responseBody',
    ],
    (detail) => validateCaptureSummary(detail.summary, `${name}.summary`) ??
      validateBoundedString(detail.url, `${name}.url`, 4_096) ??
      validateOptionalBoundedString(detail.scheme, `${name}.scheme`, 32) ??
      validateOptionalIntegerRange(detail.port, `${name}.port`, 0, 65_535) ??
      validateOptionalBoundedString(detail.statusText, `${name}.statusText`, 256) ??
      validateOptionalBoundedString(detail.requestMime, `${name}.requestMime`, 256) ??
      validateOptionalBoundedString(detail.errorCode, `${name}.errorCode`, 128) ??
      validateOptionalIntegerRange(detail.streamId, `${name}.streamId`, 0, 2_147_483_647) ??
      validateHeaderArray(detail.requestHeaders, `${name}.requestHeaders`) ??
      validateHeaderArray(detail.responseHeaders, `${name}.responseHeaders`) ??
      validateHeaderArray(detail.requestTrailers, `${name}.requestTrailers`) ??
      validateHeaderArray(detail.responseTrailers, `${name}.responseTrailers`) ??
      validateOptionalBodyRef(detail.requestBody, `${name}.requestBody`) ??
      validateOptionalBodyRef(detail.responseBody, `${name}.responseBody`),
  );
}

function validateHeaderArray(value: unknown, name: string): string | null {
  if (!Array.isArray(value) || value.length > MAX_HEADER_COUNT) {
    return `${name} must contain at most ${MAX_HEADER_COUNT} headers`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateExactObject(
      value[index],
      `${name}[${index}]`,
      ['name', 'value', 'isPseudo'],
      (header) => validateBoundedString(header.name, `${name}[${index}].name`, 256) ??
        validateBoundedString(header.value, `${name}[${index}].value`, MAX_HEADER_VALUE_LENGTH) ??
        (header.isPseudo === undefined
          ? null
          : validateBoolean(header.isPseudo, `${name}[${index}].isPseudo`)),
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function validateOptionalBodyRef(value: unknown, name: string): string | null {
  if (value === undefined) {
    return null;
  }
  return validateExactObject(
    value,
    name,
    ['bodyHash', 'mediaType', 'contentEncoding', 'encodedSize', 'decodedSize', 'truncated', 'decodeStatus'],
    (body) => validateOptionalBoundedString(body.bodyHash, `${name}.bodyHash`, 128) ??
      validateOptionalBoundedString(body.mediaType, `${name}.mediaType`, 256) ??
      validateOptionalBoundedString(body.contentEncoding, `${name}.contentEncoding`, 128) ??
      validateNonNegativeSafeInteger(body.encodedSize, `${name}.encodedSize`) ??
      validateOptionalNonNegativeNumber(body.decodedSize, `${name}.decodedSize`) ??
      validateBoolean(body.truncated, `${name}.truncated`) ??
      validateBoundedString(body.decodeStatus, `${name}.decodeStatus`, 32),
  );
}

function validateBodyRangeResult(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['bodyId', 'offset', 'data', 'end', 'decodeStatus'],
    (payload) => validateId(payload.bodyId, 'result.payload.bodyId') ??
      validateNonNegativeSafeInteger(payload.offset, 'result.payload.offset') ??
      validateByteArray(payload.data, 'result.payload.data') ??
      validateBoolean(payload.end, 'result.payload.end') ??
      validateOptionalBoundedString(
        payload.decodeStatus,
        'result.payload.decodeStatus',
        32,
      ),
  );
}

function validateRuleValidationResult(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['valid', 'diagnostics'],
    (payload) => validateBoolean(payload.valid, 'result.payload.valid') ??
      validateProtocolDiagnostics(payload.diagnostics),
  );
}

function validateRuleRevision(value: unknown): string | null {
  return validateExactObject(value, 'result.payload', ['revision'], (payload) =>
    validatePositiveSafeInteger(
      payload.revision,
      'result.payload.revision',
    ));
}

function validateBreakpointResolutionResult(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['breakpointId', 'state'],
    (payload) => validateId(
      payload.breakpointId,
      'result.payload.breakpointId',
    ) ?? validateEnum(payload.state, 'result.payload.state', [
      'continued',
      'edited',
      'dropped',
      'timed_out',
    ]),
  );
}

function validateDiagnosticsRecords(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['records', 'droppedCount'],
    (payload) => validateLogRecords(payload.records) ??
      validateNonNegativeSafeInteger(
        payload.droppedCount,
        'result.payload.droppedCount',
      ),
  );
}

function validateDiagnosticsPage(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['records', 'nextCursor', 'hasMore', 'droppedCount'],
    (payload) => validateLogRecords(payload.records) ??
      validateOptionalBoundedString(
        payload.nextCursor,
        'result.payload.nextCursor',
        MAX_CURSOR_LENGTH,
      ) ?? validateBoolean(payload.hasMore, 'result.payload.hasMore') ??
      validateNonNegativeSafeInteger(
        payload.droppedCount,
        'result.payload.droppedCount',
      ),
  );
}

function validateProxyStatusResult(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['listening', 'host', 'port', 'sessionId', 'capturedExchanges'],
    (payload) =>
      validateBoolean(payload.listening, 'result.payload.listening') ??
      validateNullableBoundedString(payload.host, 'result.payload.host', 255) ??
      validateNullablePort(payload.port, 'result.payload.port') ??
      validateNullableId(payload.sessionId, 'result.payload.sessionId') ??
      validateNonNegativeSafeInteger(
        payload.capturedExchanges,
        'result.payload.capturedExchanges',
      ),
  );
}

function validateNullableBoundedString(
  value: unknown,
  name: string,
  maxLength: number,
): string | null {
  return value === null ? null : validateBoundedString(value, name, maxLength);
}

function validateNullableId(value: unknown, name: string): string | null {
  return value === null ? null : validateId(value, name);
}

function validateNullablePort(value: unknown, name: string): string | null {
  return value === null ? null : validateIntegerRange(value, name, 1, 65_535);
}

function validateStorageStatusResult(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    [
      'sessionCount',
      'exchangeCount',
      'bodyCount',
      'databaseBytes',
      'blobBytes',
      'totalBytes',
      'quotaBytes',
    ],
    (payload) =>
      validateNonNegativeSafeInteger(
        payload.sessionCount,
        'result.payload.sessionCount',
      ) ?? validateNonNegativeSafeInteger(
        payload.exchangeCount,
        'result.payload.exchangeCount',
      ) ?? validateNonNegativeSafeInteger(
        payload.bodyCount,
        'result.payload.bodyCount',
      ) ?? validateNonNegativeSafeInteger(
        payload.databaseBytes,
        'result.payload.databaseBytes',
      ) ?? validateNonNegativeSafeInteger(
        payload.blobBytes,
        'result.payload.blobBytes',
      ) ?? validateNonNegativeSafeInteger(
        payload.totalBytes,
        'result.payload.totalBytes',
      ) ?? validateNonNegativeSafeInteger(
        payload.quotaBytes,
        'result.payload.quotaBytes',
      ),
  );
}

function validateLogRecords(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > MAX_DIAGNOSTIC_RECORDS) {
    return `result.payload.records must contain at most ${MAX_DIAGNOSTIC_RECORDS} records`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateLogRecord(
      value[index],
      `result.payload.records[${index}]`,
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function validateLogRecord(value: unknown, name: string): string | null {
  return validateExactObject(
    value,
    name,
    [
      'timestamp',
      'sequence',
      'level',
      'process',
      'traceId',
      'requestId',
      'command',
      'phase',
      'action',
      'durationMs',
      'outcome',
      'errorCode',
      'attributes',
    ],
    (record) => validateTimestamp(record.timestamp, `${name}.timestamp`) ??
      validatePositiveSafeInteger(record.sequence, `${name}.sequence`) ??
      validateEnum(record.level, `${name}.level`, [
        'debug',
        'info',
        'warn',
        'error',
      ]) ?? validateEnum(record.process, `${name}.process`, ['proxy-core']) ??
      validateOptionalId(record.traceId, `${name}.traceId`) ??
      validateOptionalId(record.requestId, `${name}.requestId`) ??
      validateOptionalCommandType(record.command, `${name}.command`) ??
      validateId(record.phase, `${name}.phase`) ??
      validateOptionalId(record.action, `${name}.action`) ??
      validateOptionalNonNegativeNumber(record.durationMs, `${name}.durationMs`) ??
      validateOptionalEnum(record.outcome, `${name}.outcome`, [
        'success',
        'failed',
        'cancelled',
        'timed_out',
      ]) ?? validateOptionalId(record.errorCode, `${name}.errorCode`) ??
      validateLogAttributes(record.attributes, `${name}.attributes`),
  );
}

function validateCoreError(value: unknown): string | null {
  return validateExactObject(
    value,
    'message.error',
    ['code', 'message', 'retryable'],
    (error) => validateEnum(error.code, 'message.error.code', [
      'invalid-message',
      'unsupported-command',
      'timeout',
      'cancelled',
      'disconnected',
      'conflict',
      'internal',
    ]) ?? validateBoundedString(
      error.message,
      'message.error.message',
      MAX_MESSAGE_LENGTH,
    ) ?? validateBoolean(error.retryable, 'message.error.retryable'),
  );
}

function validateProtocolDiagnostics(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > 1_000) {
    return 'result.payload.diagnostics must contain at most 1000 records';
  }
  for (let index = 0; index < value.length; index += 1) {
    const name = `result.payload.diagnostics[${index}]`;
    const error = validateExactObject(
      value[index],
      name,
      ['code', 'message', 'path'],
      (diagnostic) => validateId(diagnostic.code, `${name}.code`) ??
        validateBoundedString(
          diagnostic.message,
          `${name}.message`,
          MAX_MESSAGE_LENGTH,
        ) ?? validateOptionalBoundedString(
          diagnostic.path,
          `${name}.path`,
          MAX_FILTER_LENGTH,
        ),
    );
    if (error) {
      return error;
    }
  }
  return null;
}

function validateLogAttributes(value: unknown, name: string): string | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    return `${name} must be an object`;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_LOG_ATTRIBUTE_COUNT) {
    return `${name} must contain at most ${MAX_LOG_ATTRIBUTE_COUNT} entries`;
  }
  for (const [key, attribute] of entries) {
    if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
      return `${name}.${key} has an invalid key`;
    }
    if (
      typeof attribute !== 'string' &&
      typeof attribute !== 'number' &&
      typeof attribute !== 'boolean'
    ) {
      return `${name}.${key} must be a scalar`;
    }
    if (
      typeof attribute === 'string' &&
      attribute.length > MAX_LOG_ATTRIBUTE_STRING_LENGTH
    ) {
      return `${name}.${key} is too long`;
    }
    if (typeof attribute === 'number' && !Number.isFinite(attribute)) {
      return `${name}.${key} must be finite`;
    }
  }
  return null;
}

function validateOptionalCommandType(
  value: unknown,
  name: string,
): string | null {
  if (value === undefined) {
    return null;
  }
  return typeof value === 'string' && COMMAND_TYPES.has(value as CoreCommand['type'])
    ? null
    : `${name} is unknown`;
}

function validateByteArray(value: unknown, name: string): string | null {
  return value instanceof Uint8Array && value.byteLength <= MAX_BODY_CHUNK_BYTES
    ? null
    : `${name} must be a Uint8Array no larger than ${MAX_BODY_CHUNK_BYTES} bytes`;
}

function validateExactObject(
  value: unknown,
  name: string,
  allowedKeys: readonly string[],
  validate: (record: Record<string, unknown>) => string | null,
): string | null {
  if (!isRecord(value)) {
    return `${name} must be an object`;
  }
  return validateRecordKeys(value, name, allowedKeys) ?? validate(value);
}

function validateRecordKeys(
  value: Record<string, unknown>,
  name: string,
  allowedKeys: readonly string[],
): string | null {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  return unknownKey ? `${name}.${unknownKey} is not allowed` : null;
}

function validateVersion(value: unknown): string | null {
  return value === CORE_PROTOCOL_VERSION
    ? null
    : `protocolVersion must be ${CORE_PROTOCOL_VERSION}`;
}

function validateId(value: unknown, name: string): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value)
    ? null
    : `${name} is invalid`;
}

function validateOptionalId(value: unknown, name: string): string | null {
  return value === undefined ? null : validateId(value, name);
}

function validateBoundedString(
  value: unknown,
  name: string,
  maxLength: number,
): string | null {
  return typeof value === 'string' && value.length <= maxLength
    ? null
    : `${name} must be a string no longer than ${maxLength} characters`;
}

function validateOptionalBoundedString(
  value: unknown,
  name: string,
  maxLength: number,
): string | null {
  return value === undefined
    ? null
    : validateBoundedString(value, name, maxLength);
}

function validatePositiveSafeInteger(value: unknown, name: string): string | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? null
    : `${name} must be a positive safe integer`;
}

function validateNonNegativeSafeInteger(
  value: unknown,
  name: string,
): string | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? null
    : `${name} must be a non-negative safe integer`;
}

function validateIntegerRange(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): string | null {
  return Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
    ? null
    : `${name} must be an integer from ${minimum} to ${maximum}`;
}

function validateOptionalIntegerRange(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): string | null {
  return value === undefined
    ? null
    : validateIntegerRange(value, name, minimum, maximum);
}

function validateOptionalNonNegativeNumber(
  value: unknown,
  name: string,
): string | null {
  return value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
    ? null
    : `${name} must be a non-negative finite number`;
}

function validateTimestamp(value: unknown, name: string): string | null {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? null
    : `${name} must be an ISO UTC timestamp`;
}

function validateBoolean(value: unknown, name: string): string | null {
  return typeof value === 'boolean' ? null : `${name} must be a boolean`;
}

function validateLiteral(
  value: unknown,
  name: string,
  expected: string,
): string | null {
  return value === expected ? null : `${name} must be ${expected}`;
}

function validateEnum(
  value: unknown,
  name: string,
  allowed: readonly string[],
): string | null {
  return typeof value === 'string' && allowed.includes(value)
    ? null
    : `${name} is invalid`;
}

function validateOptionalEnum(
  value: unknown,
  name: string,
  allowed: readonly string[],
): string | null {
  return value === undefined ? null : validateEnum(value, name, allowed);
}

function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function invalid<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type { CoreResult, DiagnosticLogRecord };