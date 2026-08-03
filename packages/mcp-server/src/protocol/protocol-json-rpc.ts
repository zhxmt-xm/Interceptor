import type {
  McpJsonRpcFailure,
  McpJsonRpcNotification,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from '../interfaces';

/** JSON-RPC 2.0 标准错误码。 */
export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;

/** 解析结果：请求、通知，或格式错误。 */
export type McpParsedMessage =
  | { kind: 'request'; request: McpJsonRpcRequest }
  | { kind: 'notification'; notification: McpJsonRpcNotification }
  | { kind: 'invalid'; response: McpJsonRpcFailure };

/** 解析一行 JSON-RPC 文本。 */
export function parseJsonRpcMessage(line: string): McpParsedMessage {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { kind: 'invalid', response: errorResponse(null, JSON_RPC_PARSE_ERROR, 'invalid JSON') };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      kind: 'invalid',
      response: errorResponse(null, JSON_RPC_INVALID_REQUEST, 'message must be an object'),
    };
  }
  const message = value as Record<string, unknown>;
  if (message['jsonrpc'] !== '2.0') {
    return {
      kind: 'invalid',
      response: errorResponse(null, JSON_RPC_INVALID_REQUEST, 'jsonrpc must be "2.0"'),
    };
  }
  const method = message['method'];
  if (typeof method !== 'string') {
    return {
      kind: 'invalid',
      response: errorResponse(null, JSON_RPC_INVALID_REQUEST, 'method must be a string'),
    };
  }
  const id = message['id'];
  if (id === undefined || id === null) {
    return {
      kind: 'notification',
      notification: { jsonrpc: '2.0', method, params: message['params'] },
    };
  }
  if (typeof id !== 'string' && typeof id !== 'number') {
    return {
      kind: 'invalid',
      response: errorResponse(null, JSON_RPC_INVALID_REQUEST, 'id must be a string or number'),
    };
  }
  return {
    kind: 'request',
    request: { jsonrpc: '2.0', id, method, params: message['params'] },
  };
}

/** 构造成功响应。 */
export function successResponse(id: string | number, result: unknown): McpJsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

/** 构造错误响应。 */
export function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): McpJsonRpcFailure {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

/** 读取请求参数对象；缺省视为空对象。 */
export function readParamsObject(params: unknown): Record<string, unknown> | null {
  if (params === undefined || params === null) {
    return {};
  }
  if (typeof params !== 'object' || Array.isArray(params)) {
    return null;
  }
  return params as Record<string, unknown>;
}
