import { MCP_DEFAULT_PAGE_LIMIT, MCP_MAX_PAGE_LIMIT } from '../constants';

/** 参数不合法时抛出；协议层把它转成 `isError` 结果而非 JSON-RPC 错误。 */
export class McpArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpArgumentError';
  }
}

/** 读取必填字符串。 */
export function requireString(
  args: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new McpArgumentError(`"${key}" must be a non-empty string`);
  }
  return value;
}

/** 读取可选字符串；空串按未提供处理。 */
export function optionalString(
  args: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new McpArgumentError(`"${key}" must be a string`);
  }
  return value;
}

/** 读取必填整数。 */
export function requireInteger(
  args: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new McpArgumentError(`"${key}" must be an integer`);
  }
  return value;
}

/** 读取可选非负整数。 */
export function optionalInteger(
  args: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new McpArgumentError(`"${key}" must be a non-negative integer`);
  }
  return value;
}

/** 读取必填布尔。 */
export function requireBoolean(
  args: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const value = args[key];
  if (typeof value !== 'boolean') {
    throw new McpArgumentError(`"${key}" must be a boolean`);
  }
  return value;
}

/** 读取取值受限的可选枚举。 */
export function optionalEnum<T extends string>(
  args: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = optionalString(args, key);
  if (value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    throw new McpArgumentError(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

/** 读取取值受限的必填枚举。 */
export function requireEnum<T extends string>(
  args: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
): T {
  const value = requireString(args, key);
  if (!allowed.includes(value as T)) {
    throw new McpArgumentError(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

/** 读取分页条数并夹到允许区间，避免模型请求过大页。 */
export function readPageLimit(args: Readonly<Record<string, unknown>>): number {
  const value = optionalInteger(args, 'limit');
  if (value === undefined || value === 0) {
    return MCP_DEFAULT_PAGE_LIMIT;
  }
  return Math.min(value, MCP_MAX_PAGE_LIMIT);
}

/** 读取对象数组，逐项要求是普通对象。 */
export function requireObjectArray(
  args: Readonly<Record<string, unknown>>,
  key: string,
): readonly Readonly<Record<string, unknown>>[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    throw new McpArgumentError(`"${key}" must be an array`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new McpArgumentError(`"${key}[${index}]" must be an object`);
    }
    return item as Readonly<Record<string, unknown>>;
  });
}

/** 拒绝 schema 未声明的参数，避免模型靠猜测触达未定义行为。 */
export function rejectUnknownKeys(
  args: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new McpArgumentError(`unknown argument(s): ${unknown.join(', ')}`);
  }
}
