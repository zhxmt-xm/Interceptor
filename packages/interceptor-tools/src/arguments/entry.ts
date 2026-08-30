import { TOOL_DEFAULT_PAGE_LIMIT, TOOL_MAX_PAGE_LIMIT } from '../constants';

/** Reports invalid Model-generated Tool arguments. */
export class InterceptorToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InterceptorToolArgumentError';
  }
}

/** Reads one required non-empty string argument. */
export function requireString(
  args: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InterceptorToolArgumentError(`"${key}" must be a non-empty string`);
  }
  return value;
}

/** Reads one optional non-empty string, treating an empty value as absent. */
export function optionalString(
  args: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new InterceptorToolArgumentError(`"${key}" must be a string`);
  }
  return value;
}

/** Reads optional text while preserving an explicitly empty string. */
export function optionalText(
  args: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new InterceptorToolArgumentError(`"${key}" must be a string`);
  }
  return value;
}

/** Reads one required integer argument. */
export function requireInteger(
  args: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InterceptorToolArgumentError(`"${key}" must be an integer`);
  }
  return value;
}

/** Reads one required integer constrained to the declared range. */
export function requireIntegerInRange(
  args: Readonly<Record<string, unknown>>,
  key: string,
  range: { readonly minimum?: number; readonly maximum?: number },
): number {
  const value = requireInteger(args, key);
  assertIntegerRange(key, value, range);
  return value;
}

/** Reads one optional non-negative integer argument. */
export function optionalInteger(
  args: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new InterceptorToolArgumentError(`"${key}" must be a non-negative integer`);
  }
  return value;
}

/** Reads one optional integer constrained to the declared range. */
export function optionalIntegerInRange(
  args: Readonly<Record<string, unknown>>,
  key: string,
  range: { readonly minimum?: number; readonly maximum?: number },
): number | undefined {
  const value = optionalInteger(args, key);
  if (value === undefined) return undefined;
  assertIntegerRange(key, value, range);
  return value;
}

/** Reads one optional enum argument. */
export function optionalEnum<T extends string>(
  args: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = optionalString(args, key);
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) {
    throw new InterceptorToolArgumentError(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

/** Reads one required enum argument. */
export function requireEnum<T extends string>(
  args: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
): T {
  const value = requireString(args, key);
  if (!allowed.includes(value as T)) {
    throw new InterceptorToolArgumentError(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

/** Reads a page limit constrained to the published Tool schema. */
export function readPageLimit(args: Readonly<Record<string, unknown>>): number {
  return optionalIntegerInRange(args, 'limit', {
    minimum: 1,
    maximum: TOOL_MAX_PAGE_LIMIT,
  }) ?? TOOL_DEFAULT_PAGE_LIMIT;
}

/** Reads one non-empty array of allowed string values. */
export function requireStringArray<T extends string>(
  args: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
): T[] {
  const value = args[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new InterceptorToolArgumentError(`"${key}" must be a non-empty array`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || !allowed.includes(item as T)) {
      throw new InterceptorToolArgumentError(
        `"${key}[${index}]" must be one of: ${allowed.join(', ')}`,
      );
    }
    return item as T;
  });
}

/** Reads an array whose entries must be plain objects. */
export function requireObjectArray(
  args: Readonly<Record<string, unknown>>,
  key: string,
): readonly Readonly<Record<string, unknown>>[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    throw new InterceptorToolArgumentError(`"${key}" must be an array`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new InterceptorToolArgumentError(`"${key}[${index}]" must be an object`);
    }
    return item as Readonly<Record<string, unknown>>;
  });
}

/** Rejects arguments outside the declared Tool schema. */
export function rejectUnknownKeys(
  args: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new InterceptorToolArgumentError(`unknown argument(s): ${unknown.join(', ')}`);
  }
}

/** Enforces one JSON Schema integer range. */
function assertIntegerRange(
  key: string,
  value: number,
  range: { readonly minimum?: number; readonly maximum?: number },
): void {
  if (range.minimum !== undefined && value < range.minimum) {
    throw new InterceptorToolArgumentError(`"${key}" must be at least ${range.minimum}`);
  }
  if (range.maximum !== undefined && value > range.maximum) {
    throw new InterceptorToolArgumentError(`"${key}" must be at most ${range.maximum}`);
  }
}