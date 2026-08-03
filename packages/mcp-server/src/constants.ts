/** 本 server 实现并宣告的 MCP 协议修订版。 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** 仍接受的历史协议修订版；客户端请求这些版本时按其版本回应。 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

/** 向 Host 展示的服务器名。 */
export const MCP_SERVER_NAME = 'interceptor';

/** 向 Host 展示的服务器标题。 */
export const MCP_SERVER_TITLE = 'Interceptor';

/** 单次工具结果序列化后的字节上限，超出即截断并标注。 */
export const MCP_TOOL_RESULT_MAX_BYTES = 512 * 1024;

/** 单次正文读取的字节上限，与 Renderer 的 body preview 上限保持同一量级。 */
export const MCP_BODY_PREVIEW_MAX_BYTES = 128 * 1024;

/** 分页类工具的默认返回条数。 */
export const MCP_DEFAULT_PAGE_LIMIT = 50;

/** 分页类工具允许的最大条数。 */
export const MCP_MAX_PAGE_LIMIT = 200;

/** 同时在执行的工具调用上限，超出返回结构化错误而非排队。 */
export const MCP_MAX_CONCURRENT_CALLS = 4;

/** runtime 文件名；宿主写入 `<userData>/mcp/` 下。 */
export const MCP_RUNTIME_FILE_NAME = 'runtime.json';

/** 默认遮罩的请求/响应头，比较时不区分大小写。 */
export const MCP_REDACTED_HEADERS: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
];

/** 默认遮罩的 URL query 参数名，比较时不区分大小写。 */
export const MCP_REDACTED_QUERY_KEYS: readonly string[] = [
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

/** 遮罩后的占位文本。 */
export const MCP_REDACTED_PLACEHOLDER = '<redacted>';

/** 零读取正文的 MIME 前缀；只返回 metadata。 */
export const MCP_OPAQUE_BODY_MIME_PREFIXES: readonly string[] = ['video/', 'audio/'];
