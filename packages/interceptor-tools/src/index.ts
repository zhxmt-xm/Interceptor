// Transport-neutral capability index and Tool discovery API.
// Transport-neutral capability index 与 Tool discovery API。
export {
  InterceptorToolCatalog,
  type ToolCapability,
  type ToolDescriptor,
  type ToolDiscoveryMatch,
  type ToolDiscoveryQuery,
} from './catalog/entry';
export { InterceptorToolRedactor } from './redaction/entry';
export { InterceptorToolArgumentError } from './arguments/entry';
export {
  INTERCEPTOR_TOOL_CAPABILITIES,
  INTERCEPTOR_TOOL_NAMES,
  buildInterceptorToolCatalog,
  buildInterceptorToolRegistry,
} from './registry/entry';
export type {
  InterceptorToolContext,
  InterceptorToolDefinition,
  InterceptorToolHost,
  InterceptorToolJsonSchema,
  InterceptorToolJsonSchemaProperty,
  InterceptorToolKind,
} from './interfaces';
export * from './constants';