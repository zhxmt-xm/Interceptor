/** Default page size used by paged Tool results. */
export const TOOL_DEFAULT_PAGE_LIMIT = 50;

/** Maximum page size accepted from a Tool call. */
export const TOOL_MAX_PAGE_LIMIT = 200;

/** Maximum text body bytes returned by one Tool call. */
export const TOOL_BODY_PREVIEW_MAX_BYTES = 128 * 1024;

/** Header names whose values are masked before leaving the application. */
export const TOOL_REDACTED_HEADERS: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
];

/** URL query keys whose values are masked before leaving the application. */
export const TOOL_REDACTED_QUERY_KEYS: readonly string[] = [
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'code',
  'id_token',
  'password',
  'refresh_token',
  'secret',
  'session',
  'sig',
  'signature',
  'token',
];

/** Placeholder used for masked values. */
export const TOOL_REDACTED_PLACEHOLDER = '<redacted>';

/** MIME prefixes whose body bytes never enter a Tool result. */
export const TOOL_OPAQUE_BODY_MIME_PREFIXES: readonly string[] = ['video/', 'audio/'];