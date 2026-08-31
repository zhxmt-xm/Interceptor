/** 向 Host 展示的服务器名。 */
export const MCP_SERVER_NAME = 'interceptor';

/** 向 Host 展示的服务器标题。 */
export const MCP_SERVER_TITLE = 'Interceptor';

/** 单次工具结果序列化后的字节上限，超出即截断并标注。 */
export const MCP_TOOL_RESULT_MAX_BYTES = 512 * 1024;

/** 同时在执行的工具调用上限，超出返回结构化错误而非排队。 */
export const MCP_MAX_CONCURRENT_CALLS = 4;
