import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import type { MainToolCommand, MainToolResultForCommand } from './main-commands';

export type { MainToolCommand, MainToolResultForCommand, MainToolResultPayloads } from './main-commands';

/** Classifies whether an enabled Tool reads data or changes product state. */
export type InterceptorToolKind = 'query' | 'change';

/** JSON Schema object accepted by Agent and MCP Tool adapters. */
export interface InterceptorToolJsonSchema {
  readonly [key: string]: unknown;
  readonly type: 'object';
  readonly properties: Readonly<Record<string, InterceptorToolJsonSchemaProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

/** JSON Schema property subset used by the current Tool catalog. */
export interface InterceptorToolJsonSchemaProperty {
  readonly type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  readonly description: string;
  readonly enum?: readonly string[];
  readonly items?: InterceptorToolJsonSchemaProperty;
  readonly properties?: Readonly<Record<string, InterceptorToolJsonSchemaProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: string | number | boolean;
}

/** Invokes a typed product command without exposing transport identity. */
export interface InterceptorToolHost {
  invoke<T extends CoreCommand>(
    command: T,
    abortSignal: AbortSignal,
  ): Promise<CoreResultForCommand<T>>;
  invokeMain<T extends MainToolCommand>(
    command: T,
    abortSignal: AbortSignal,
  ): Promise<MainToolResultForCommand<T>>;
}

/** Execution context shared by internal Agent and MCP callers. */
export interface InterceptorToolContext {
  readonly host: InterceptorToolHost;
  readonly abortSignal: AbortSignal;
}

/** Structured change description shared by approval adapters. */
export interface InterceptorToolChangeDescription {
  readonly lines: readonly string[];
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

/** One transport-neutral Tool definition and executor. */
export interface InterceptorToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly capabilityId: string;
  readonly searchTerms?: readonly string[];
  readonly kind: InterceptorToolKind;
  readonly destructive: boolean;
  readonly openWorld: boolean;
  readonly effectDescription?: string;
  readonly inputSchema: InterceptorToolJsonSchema;
  execute(
    args: Readonly<Record<string, unknown>>,
    context: InterceptorToolContext,
  ): Promise<unknown>;
  describeChange?(
    args: Readonly<Record<string, unknown>>,
    context: InterceptorToolContext,
  ): Promise<InterceptorToolChangeDescription>;
}