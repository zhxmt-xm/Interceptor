import type { McpHostBridge } from '../interfaces';
import { McpTokenAuthenticator } from '../auth/entry';
import { McpProtocolHandler } from '../protocol/entry';
import { McpRedactor } from '../redaction/entry';
import { McpToolRegistry } from '../tools/entry';

/** 组装 MCP server 所需的宿主能力。 */
export interface McpServerOptions {
  /** Core 调用、审批与审计。 */
  host: McpHostBridge;
  /** 展示给 Host 的版本号，通常是 app 版本。 */
  version: string;
  /** 自定义脱敏策略；缺省用默认遮罩列表。 */
  redactor?: McpRedactor;
}

/**
 * MCP server 的组合根。它只拥有认证、工具与协议三层；
 * transport（named pipe / unix socket / HTTP）由宿主实现并驱动，
 * 因为对外监听必须发生在 Main —— Core 不得持有任何对外端口。
 */
export class McpServer {
  /** per-client token 认证。 */
  readonly #authenticator = new McpTokenAuthenticator();
  /** 工具注册表，两种 transport 共用。 */
  readonly #tools: McpToolRegistry;
  /** 会话版本号。 */
  readonly #version: string;

  constructor(options: McpServerOptions) {
    this.#version = options.version;
    this.#tools = new McpToolRegistry(options.host, {
      ...(options.redactor === undefined ? {} : { redactor: options.redactor }),
    });
  }

  /** 认证器；宿主用它增删接入。 */
  get authenticator(): McpTokenAuthenticator {
    return this.#authenticator;
  }

  /**
   * 为一条已认证的连接创建协议处理器。token 无效时返回 null，
   * 宿主应据此拒绝连接而不是继续读取字节。
   */
  createSession(token: string, reportedName?: string): McpProtocolHandler | null {
    const identity = this.#authenticator.authenticate(token, reportedName);
    if (identity === null) {
      return null;
    }
    return new McpProtocolHandler(this.#tools, { version: this.#version, identity });
  }

  /** 关闭时撤销全部接入，使在途连接的后续调用立即失效。 */
  shutdown(): void {
    this.#authenticator.clear();
  }
}
