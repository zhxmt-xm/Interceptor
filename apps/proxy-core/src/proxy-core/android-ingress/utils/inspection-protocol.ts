import { validateHeaderName, validateHeaderValue } from 'node:http';
import type {
  InspectionBodyDecision,
  InspectionBodyChunk,
  InspectionBodyReplacement,
  InspectionCommonDecision,
  InspectionEnvelope,
  InspectionHeaders,
  InspectionHttpMessage,
  InspectionRequest,
  InspectionRequestDecision,
  InspectionResponse,
  InspectionResponseDecision,
} from '../interfaces/inspection';
import type { HeaderBag, RequestMatchInput } from '../../rules/interfaces';
import {
  INSPECTION_BODY_HEADER_BYTES,
  MAX_CHUNK_BYTES,
  MAX_INSPECTION_CONTROL_BYTES,
  MAX_INSPECTION_HEADERS,
} from '../internal/constants';
import { InspectionProtocolError } from '../internal/errors';
import { hasFields, isSessionId } from './index';

/** HTTP和WS共用有界JSON、版本及已认证会话校验，不替调用方授予数据权限。 */
export function parseInspectionEnvelope(
  text: string,
  sessionId: string,
): { message: Record<string, unknown>; envelope: InspectionEnvelope } {
  requireValid(Buffer.byteLength(text, 'utf8') <= MAX_INSPECTION_CONTROL_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new InspectionProtocolError();
  }
  const message = record(parsed);
  requireValid(message.protocolVersion === 2 && message.sessionId === sessionId);
  const envelope = {
    protocolVersion: 2 as const,
    sessionId: uuid(message.sessionId),
    exchangeId: uuid(message.exchangeId),
  };
  return { message, envelope };
}

/** 解析并校验新协议的HTTP消息；调用方必须提供已认证会话。 */
export function parseInspectionMessage(
  text: string,
  sessionId: string,
): InspectionHttpMessage {
  const { message, envelope } = parseInspectionEnvelope(text, sessionId);
  const fields = (...names: string[]) =>
    exact(message, ['type', 'protocolVersion', 'sessionId', 'exchangeId', ...names]);
  switch (message.type) {
    case 'http.request':
      fields('stageId', 'request');
      return { ...envelope, type: message.type, stageId: uuid(message.stageId), request: requestHead(message.request) };
    case 'http.response':
      fields('stageId', 'response');
      return { ...envelope, type: message.type, stageId: uuid(message.stageId), response: responseHead(message.response) };
    case 'http.informational':
      fields('statusCode', 'headers');
      requireValid(typeof message.statusCode === 'number' && Number.isInteger(message.statusCode)
        && message.statusCode >= 100 && message.statusCode < 200 && message.statusCode !== 101);
      return { ...envelope, type: message.type, statusCode: message.statusCode, headers: headers(message.headers) };
    case 'http.decision': {
      fields('stageId', 'decisionId', 'phase', 'decision');
      const identity = { ...envelope, stageId: uuid(message.stageId), decisionId: uuid(message.decisionId) };
      if (message.phase === 'request') {
        return { ...identity, type: message.type, phase: 'request', decision: requestDecision(message.decision) };
      }
      requireValid(message.phase === 'response');
      return { ...identity, type: message.type, phase: 'response', decision: responseDecision(message.decision) };
    }
    case 'http.applied':
    case 'http.upgraded':
    case 'http.upgrade-ready':
      fields('stageId', 'decisionId');
      return { ...envelope, type: message.type, stageId: uuid(message.stageId), decisionId: uuid(message.decisionId) };
    case 'exchange.complete':
      fields('requestBytes', 'responseBytes');
      return { ...envelope, type: message.type, requestBytes: count(message.requestBytes), responseBytes: count(message.responseBytes) };
    case 'exchange.completed':
      fields();
      return { ...envelope, type: message.type };
    case 'exchange.cancel':
      fields('cancellationId', 'reason');
      requireValid(message.reason === 'user' || message.reason === 'client-closed'
        || message.reason === 'upstream-failed' || message.reason === 'device-stopped' || message.reason === 'protocol-error');
      return { ...envelope, type: message.type, cancellationId: uuid(message.cancellationId), reason: message.reason };
    case 'exchange.cancelled':
      fields('cancellationId');
      return { ...envelope, type: message.type, cancellationId: uuid(message.cancellationId) };
    case 'body.open':
      fields('bodyId', 'phase', 'role', 'byteLength');
      requireValid(message.phase === 'request' || message.phase === 'response');
      requireValid(message.role === 'original' || message.role === 'applied');
      return {
        ...envelope, type: message.type, bodyId: uuid(message.bodyId), phase: message.phase, role: message.role,
        byteLength: message.byteLength === null ? null : count(message.byteLength),
      };
    case 'body.ack':
      fields('bodyId', 'offset');
      return { ...envelope, type: message.type, bodyId: uuid(message.bodyId), offset: count(message.offset) };
    case 'body.end': {
      fields('bodyId', 'byteLength', 'trailers');
      const trailers = headers(message.trailers);
      requireValid(trailers.every(([name]) =>
        !['content-length', 'transfer-encoding', 'trailer', 'host'].includes(name.toLowerCase())));
      return { ...envelope, type: message.type, bodyId: uuid(message.bodyId),
        byteLength: count(message.byteLength), trailers };
    }
    case 'body.received':
      fields('bodyId', 'byteLength');
      return { ...envelope, type: message.type, bodyId: uuid(message.bodyId), byteLength: count(message.byteLength) };
    case 'body.stopped':
      fields('bodyId', 'byteLength', 'reason');
      requireValid(message.reason === 'early-response' || message.reason === 'synthetic-response');
      return { ...envelope, type: message.type, bodyId: uuid(message.bodyId),
        byteLength: count(message.byteLength), reason: message.reason };
    case 'body.discard':
      fields('bodyId');
      return { ...envelope, type: message.type, bodyId: uuid(message.bodyId) };
    default:
      throw new InspectionProtocolError();
  }
}

/** 编码一个带明确body身份与offset的有界正文块。 */
export function encodeInspectionChunk(chunk: InspectionBodyChunk): Uint8Array {
  const bodyId = uuid(chunk.bodyId);
  count(chunk.offset);
  const length = chunk.payload.byteLength;
  requireValid(length > 0 && length <= MAX_CHUNK_BYTES);
  count(chunk.offset + length);
  const bytes = Buffer.alloc(INSPECTION_BODY_HEADER_BYTES + length);
  Buffer.from(bodyId.replaceAll('-', ''), 'hex').copy(bytes);
  bytes.writeBigUInt64BE(BigInt(chunk.offset), 16);
  bytes.set(chunk.payload, INSPECTION_BODY_HEADER_BYTES);
  return bytes;
}

/** 解码正文块，不将WSS关闭或空binary当作正文结束。 */
export function decodeInspectionChunk(bytes: Uint8Array): InspectionBodyChunk {
  requireValid(bytes.byteLength > INSPECTION_BODY_HEADER_BYTES
    && bytes.byteLength <= INSPECTION_BODY_HEADER_BYTES + MAX_CHUNK_BYTES);
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bodyId = formatInspectionUuid(buffer.subarray(0, 16));
  const offset = buffer.readBigUInt64BE(16);
  requireValid(offset <= BigInt(Number.MAX_SAFE_INTEGER));
  count(Number(offset) + bytes.byteLength - INSPECTION_BODY_HEADER_BYTES);
  return {
    bodyId,
    offset: Number(offset),
    payload: new Uint8Array(buffer.subarray(INSPECTION_BODY_HEADER_BYTES)),
  };
}

/** 将固定16字节wire ID表示为canonical UUID，不改变其版本或variant。 */
export function formatInspectionUuid(bytes: Uint8Array): string {
  requireValid(bytes.byteLength === 16);
  const id = Buffer.from(bytes).toString('hex');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** 统一字段错误，不把外部输入拼入异常。 */
export function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new InspectionProtocolError();
}

/** 只接受JSON对象，不把array或null当作metadata。 */
export function record(value: unknown): Record<string, unknown> {
  requireValid(typeof value === 'object' && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

/** 消息及嵌套对象均拒绝多余或缺失字段。 */
export function exact(value: Record<string, unknown>, keys: string[]): void {
  requireValid(hasFields(value, keys));
}

/** 所有wire ID保持canonical UUID表示。 */
export function uuid(value: unknown): string {
  requireValid(isSessionId(value));
  return value;
}

/** 长度、offset、字节数和delay不可丢失整数精度。 */
export function count(value: unknown): number {
  requireValid(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
  return value;
}

/** method保留原始大小写，但必须是有界HTTP token。 */
function method(value: unknown): string {
  requireValid(typeof value === 'string' && value.length > 0 && value.length <= 64
    && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value));
  return value;
}

/** 拒绝会被URL宽松解析吞掉的控制字符及隐式认证。 */
function httpUrl(value: unknown): string {
  requireValid(typeof value === 'string' && value.length <= 8192 && /^https?:\/\//i.test(value)
    && !/[\u0000-\u0020\u007f\\#]/.test(value));
  let target: URL;
  try {
    target = new URL(value);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new InspectionProtocolError();
  }
  requireValid((target.protocol === 'http:' || target.protocol === 'https:')
    && target.hostname !== '' && target.username === '' && target.password === ''
    && !/^https?:\/\/[^/]*@/i.test(value));
  return value;
}

/** 使用Node公开HTTP校验，不自行放宽非法字段值。 */
function headerName(value: unknown): string {
  requireValid(typeof value === 'string');
  try {
    validateHeaderName(value);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new InspectionProtocolError();
  }
  return value;
}

/** 副本headers不合并重复值，不丢弃空值或重排字段。 */
function headers(value: unknown): InspectionHeaders {
  requireValid(Array.isArray(value) && value.length <= MAX_INSPECTION_HEADERS);
  return value.map((pair: unknown) => {
    requireValid(Array.isArray(pair) && pair.length === 2);
    const name = headerName(pair[0]);
    const content: unknown = pair[1];
    requireValid(typeof content === 'string');
    try {
      validateHeaderValue(name, content);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new InspectionProtocolError();
    }
    return [name, content];
  });
}

/** 只有最终响应或WS升级可以进入response决定阶段。 */
function statusCode(value: unknown, allowUpgrade: boolean): number {
  requireValid(typeof value === 'number' && Number.isInteger(value)
    && ((allowUpgrade && value === 101) || (value >= 200 && value <= 599)));
  return value;
}

/** 解码独立的请求头副本，不接受body或任意RPC字段。 */
function requestHead(value: unknown): InspectionRequest {
  const head = record(value);
  exact(head, ['method', 'url', 'httpVersion', 'headers']);
  requireValid(head.httpVersion === '1.0' || head.httpVersion === '1.1' || head.httpVersion === '2');
  return { method: method(head.method), url: httpUrl(head.url), httpVersion: head.httpVersion, headers: headers(head.headers) };
}

/** 响应不重复提交原请求，靠信封关联。 */
function responseHead(value: unknown): InspectionResponse {
  const head = record(value);
  exact(head, ['statusCode', 'headers']);
  return { statusCode: statusCode(head.statusCode, true), headers: headers(head.headers) };
}

/** 空replacement有明确bodyId和长度，不与keep混用。 */
function replacement(value: unknown): InspectionBodyReplacement {
  const body = record(value);
  exact(body, ['action', 'bodyId', 'byteLength']);
  requireValid(body.action === 'replace');
  return { action: 'replace', bodyId: uuid(body.bodyId), byteLength: count(body.byteLength) };
}

/** keep不能偷偷携带replacement字段。 */
function bodyDecision(value: unknown): InspectionBodyDecision {
  const body = record(value);
  if (body.action === 'keep') {
    exact(body, ['action']);
    return { action: 'keep' };
  }
  return replacement(body);
}

/** 明确编辑的字段名保持小写唯一，区别于观察到的headers。 */
function editedHeaderNames(value: unknown): string[] {
  requireValid(Array.isArray(value) && value.length <= MAX_INSPECTION_HEADERS);
  const names = value.map((name: unknown) => headerName(name));
  requireValid(names.every(name => name === name.toLowerCase()) && new Set(names).size === names.length);
  return names;
}

/** bypass与abort的语义在请求和响应阶段一致。 */
function commonDecision(decision: Record<string, unknown>): InspectionCommonDecision | null {
  if (decision.action === 'bypass') {
    exact(decision, ['action']);
    return { action: 'bypass' };
  }
  if (decision.action === 'abort') {
    exact(decision, ['action', 'mode']);
    requireValid(decision.mode === 'close' || decision.mode === 'reset');
    return { action: 'abort', mode: decision.mode };
  }
  return null;
}

/** 只有请求阶段可短路为PC构造的响应。 */
function requestDecision(value: unknown): InspectionRequestDecision {
  const decision = record(value);
  const common = commonDecision(decision);
  if (common) return common;
  if (decision.action === 'respond') {
    exact(decision, ['action', 'statusCode', 'headers', 'body']);
    return {
      action: 'respond', statusCode: statusCode(decision.statusCode, false),
      headers: headers(decision.headers), body: replacement(decision.body),
    };
  }
  exact(decision, ['action', 'method', 'url', 'headers', 'editedHeaderNames', 'body', 'delayMs']);
  requireValid(decision.action === 'intercept');
  return {
    action: 'intercept', method: method(decision.method), url: httpUrl(decision.url),
    headers: headers(decision.headers), editedHeaderNames: editedHeaderNames(decision.editedHeaderNames),
    body: bodyDecision(decision.body), delayMs: count(decision.delayMs),
  };
}

/** 响应修改不允许附带请求method或URL。 */
function responseDecision(value: unknown): InspectionResponseDecision {
  const decision = record(value);
  const common = commonDecision(decision);
  if (common) return common;
  exact(decision, ['action', 'statusCode', 'headers', 'editedHeaderNames', 'body', 'delayMs']);
  requireValid(decision.action === 'intercept');
  return {
    action: 'intercept', statusCode: statusCode(decision.statusCode, true),
    headers: headers(decision.headers), editedHeaderNames: editedHeaderNames(decision.editedHeaderNames),
    body: bodyDecision(decision.body), delayMs: count(decision.delayMs),
  };
}

/** 将已校验副本转换为规则上下文，合并同名字段但保留所有值。 */
export function inspectionRequestContext(request: InspectionRequest): RequestMatchInput {
  const target = new URL(request.url);
  const bag = inspectionHeaderBag(request.headers);
  return {
    method: request.method, url: request.url, host: target.hostname, path: target.pathname,
    query: target.searchParams, headers: bag,
    ...(typeof bag['content-type'] === 'string' ? { mime: bag['content-type'] } : {}),
  };
}

/** 使用无原型header bag，不允许外部字段名改变对象原型。 */
export function inspectionHeaderBag(pairs: InspectionHeaders): HeaderBag {
  const bag: HeaderBag = Object.create(null);
  for (const [name, value] of pairs) {
    const key = name.toLowerCase();
    const existing = bag[key];
    bag[key] = existing === undefined ? value : [...(Array.isArray(existing) ? existing : [existing]), value];
  }
  return bag;
}

/** 仅替换确实变化的字段，其余字段保留原顺序、重复值和大小写。 */
export function inspectionFinalHeaders(original: InspectionHeaders, final: HeaderBag): InspectionHeaders {
  const originalBag = inspectionHeaderBag(original);
  const finalPairs: InspectionHeaders = Object.entries(final).flatMap(([name, value]) =>
    value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(content => [name, content] as [string, string]));
  const finalBag = inspectionHeaderBag(finalPairs);
  const changed = new Set([...Object.keys(originalBag), ...Object.keys(finalBag)].filter(name =>
    JSON.stringify(originalBag[name]) !== JSON.stringify(finalBag[name])));
  const emitted = new Set<string>();
  const result: InspectionHeaders = [];
  for (const [name, value] of original) {
    const normalized = name.toLowerCase();
    if (!changed.has(normalized)) {
      result.push([name, value]);
    } else if (!emitted.has(normalized)) {
      result.push(...finalPairs.filter(([finalName]) => finalName.toLowerCase() === normalized));
      emitted.add(normalized);
    }
  }
  for (const pair of finalPairs) {
    if (!Object.hasOwn(originalBag, pair[0].toLowerCase())) result.push(pair);
  }
  return result;
}
