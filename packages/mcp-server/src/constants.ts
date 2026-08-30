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

/** runtime 文件名；宿主写入 `<userData>/mcp/` 下。 */
export const MCP_RUNTIME_FILE_NAME = 'runtime.json';

/** 同时在执行的工具调用上限，超出返回结构化错误而非排队。 */
export const MCP_MAX_CONCURRENT_CALLS = 4;
