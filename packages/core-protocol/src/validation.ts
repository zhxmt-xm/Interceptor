import {
  CORE_PROTOCOL_VERSION,
  type CoreToMainMessage,
  type MainToCoreMessage,
} from './messages';

/** RPC 信封解析结果；失败只影响当前消息，不代表通道或进程故障。 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * 解析 Main → Core 信封。
 *
 * 这里只检查路由、版本和关联所必需的字段。command payload 来自同包、同版本的可信
 * Renderer/Main，不检查长度、数量、枚举或内容，也不拒绝未来新增的信封字段。
 */
export function parseMainToCoreMessage(
  value: unknown,
): ValidationResult<MainToCoreMessage> {
  if (!isRecord(value)) {
    return invalid('message must be an object');
  }

  let error: string | null;
  switch (value.kind) {
    case 'request':
      error = validateVersion(value.protocolVersion) ??
        validateString(value.requestId, 'requestId') ??
        validateString(value.traceId, 'traceId') ??
        validateTypedEnvelope(value.command, 'command');
      break;
    case 'cancel':
      error = validateVersion(value.protocolVersion) ??
        validateString(value.requestId, 'requestId');
      break;
    case 'event-ack':
      error = validateVersion(value.protocolVersion) ??
        validateBatchSequence(value.batchSequence);
      break;
    default:
      return invalid('message.kind is unknown');
  }

  return error
    ? invalid(error)
    : valid(value as unknown as MainToCoreMessage);
}

/**
 * 解析 Core → Main 信封。
 *
 * result 与 event payload 完整透传；这里只保证 Main 能把响应交给正确 Promise，或能对
 * event batch 发送对应 ack。解析失败由调用方隔离为单消息问题，不关闭 MessagePort。
 */
export function parseCoreToMainMessage(
  value: unknown,
): ValidationResult<CoreToMainMessage> {
  if (!isRecord(value)) {
    return invalid('message must be an object');
  }

  let error: string | null;
  switch (value.kind) {
    case 'response':
      error = validateResponseEnvelope(value);
      break;
    case 'event-batch':
      error = validateVersion(value.protocolVersion) ??
        validateBatchSequence(value.batchSequence) ??
        (Array.isArray(value.events) ? null : 'message.events must be an array');
      break;
    default:
      return invalid('message.kind is unknown');
  }

  return error
    ? invalid(error)
    : valid(value as unknown as CoreToMainMessage);
}

/** 检查 response 路由和关联字段；不读取 result payload。 */
function validateResponseEnvelope(value: Record<string, unknown>): string | null {
  const commonError = validateVersion(value.protocolVersion) ??
    validateString(value.requestId, 'requestId') ??
    validateString(value.traceId, 'traceId');
  if (commonError) {
    return commonError;
  }
  if (value.ok === true) {
    return validateTypedEnvelope(value.result, 'result');
  }
  if (value.ok === false) {
    return validateErrorEnvelope(value.error);
  }
  return 'message.ok must be a boolean';
}

/** 检查 command/result 的路由判别字段；payload 保持不透明。 */
function validateTypedEnvelope(value: unknown, name: string): string | null {
  return isRecord(value) && typeof value.type === 'string'
    ? null
    : `${name} must contain a type`;
}

/** 检查构造 CoreRpcError 必需的三个字段；不限制错误码或消息内容。 */
function validateErrorEnvelope(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'message.error must be an object';
  }
  return validateString(value.code, 'message.error.code') ??
    validateString(value.message, 'message.error.message') ??
    (typeof value.retryable === 'boolean'
      ? null
      : 'message.error.retryable must be a boolean');
}

/** 协议版本决定两端是否理解同一信封；版本不匹配时当前消息无法安全路由。 */
function validateVersion(value: unknown): string | null {
  return value === CORE_PROTOCOL_VERSION
    ? null
    : `protocolVersion must be ${CORE_PROTOCOL_VERSION}`;
}

/** requestId/traceId 只要求字符串，以便 Map 关联；不限制字符集、长度或是否为空。 */
function validateString(value: unknown, name: string): string | null {
  return typeof value === 'string' ? null : `${name} must be a string`;
}

/** batchSequence 用于 ack 对账，必须是不会发生浮点精度丢失的非负整数。 */
function validateBatchSequence(value: unknown): string | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? null
    : 'batchSequence must be a non-negative safe integer';
}

/** 将 structured-clone 输入收窄为可读取信封字段的普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 构造成功解析结果。 */
function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

/** 构造失败解析结果。 */
function invalid<T = never>(error: string): ValidationResult<T> {
  return { ok: false, error };
}