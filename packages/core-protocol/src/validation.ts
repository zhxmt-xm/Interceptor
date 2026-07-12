import {
  CORE_PROTOCOL_VERSION,
  MAX_BODY_CHUNK_BYTES,
  MAX_DIAGNOSTIC_RECORDS,
  MAX_QUERY_PAGE_SIZE,
  type CoreCommand,
  type CoreResult,
  type CoreToMainMessage,
  type DiagnosticLogRecord,
  type MainToCoreMessage,
} from './messages';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const COMMAND_TYPES = new Set<CoreCommand['type']>([
  'echo',
  'sessions.query',
  'body.read-range',
  'rules.validate',
  'rules.replace',
  'breakpoint.resolve',
  'diagnostics.recent',
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ATTRIBUTE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const MAX_CURSOR_LENGTH = 1_024;
const MAX_ECHO_LENGTH = 4_096;
const MAX_FILTER_LENGTH = 1_024;
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
    case 'body.read-range':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateBodyRangeRequest(value.payload);
    case 'rules.validate':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateRuleValidationRequest(value.payload);
    case 'rules.replace':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateRuleReplacementRequest(value.payload);
    case 'breakpoint.resolve':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateBreakpointResolutionRequest(value.payload);
    case 'diagnostics.recent':
      return validateRecordKeys(value, 'command', ['type', 'payload']) ??
        validateDiagnosticsRecent(value.payload);
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
    case 'body.range':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateBodyRangeResult(value.payload);
    case 'rules.validation':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateRuleValidationResult(value.payload);
    case 'rules.revision':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateRuleRevision(value.payload);
    case 'breakpoint.resolution':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateBreakpointResolutionResult(value.payload);
    case 'diagnostics.records':
      return validateRecordKeys(value, 'result', ['type', 'payload']) ??
        validateDiagnosticsRecords(value.payload);
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
    ['bodyId', 'offset', 'length'],
    (payload) => validateId(payload.bodyId, 'command.payload.bodyId') ??
      validateNonNegativeSafeInteger(
        payload.offset,
        'command.payload.offset',
      ) ?? validateIntegerRange(
        payload.length,
        'command.payload.length',
        1,
        MAX_BODY_CHUNK_BYTES,
      ),
  );
}

function validateRuleValidationRequest(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['draftId', 'revision', 'ruleCount'],
    (payload) => validateId(payload.draftId, 'command.payload.draftId') ??
      validatePositiveSafeInteger(
        payload.revision,
        'command.payload.revision',
      ) ?? validateIntegerRange(
        payload.ruleCount,
        'command.payload.ruleCount',
        0,
        10_000,
      ),
  );
}

function validateRuleReplacementRequest(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['draftId', 'expectedRevision', 'revision'],
    (payload) => validateId(payload.draftId, 'command.payload.draftId') ??
      validateNonNegativeSafeInteger(
        payload.expectedRevision,
        'command.payload.expectedRevision',
      ) ?? validatePositiveSafeInteger(
        payload.revision,
        'command.payload.revision',
      ),
  );
}

function validateBreakpointResolutionRequest(value: unknown): string | null {
  return validateExactObject(
    value,
    'command.payload',
    ['breakpointId', 'action'],
    (payload) => validateId(
      payload.breakpointId,
      'command.payload.breakpointId',
    ) ?? validateEnum(payload.action, 'command.payload.action', [
      'continue',
      'drop',
      'timeout',
    ]),
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

function validateSessionsPage(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['itemIds', 'nextCursor', 'hasMore'],
    (payload) => validateIdArray(
      payload.itemIds,
      'result.payload.itemIds',
      MAX_QUERY_PAGE_SIZE,
    ) ?? validateOptionalBoundedString(
      payload.nextCursor,
      'result.payload.nextCursor',
      MAX_CURSOR_LENGTH,
    ) ?? validateBoolean(payload.hasMore, 'result.payload.hasMore'),
  );
}

function validateBodyRangeResult(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['bodyId', 'offset', 'data', 'end'],
    (payload) => validateId(payload.bodyId, 'result.payload.bodyId') ??
      validateNonNegativeSafeInteger(payload.offset, 'result.payload.offset') ??
      validateByteArray(payload.data, 'result.payload.data') ??
      validateBoolean(payload.end, 'result.payload.end'),
  );
}

function validateRuleValidationResult(value: unknown): string | null {
  return validateExactObject(
    value,
    'result.payload',
    ['draftId', 'valid', 'diagnostics'],
    (payload) => validateId(payload.draftId, 'result.payload.draftId') ??
      validateBoolean(payload.valid, 'result.payload.valid') ??
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

function validateIdArray(
  value: unknown,
  name: string,
  maxLength: number,
): string | null {
  if (!Array.isArray(value) || value.length > maxLength) {
    return `${name} must contain at most ${maxLength} IDs`;
  }
  for (let index = 0; index < value.length; index += 1) {
    const error = validateId(value[index], `${name}[${index}]`);
    if (error) {
      return error;
    }
  }
  return null;
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