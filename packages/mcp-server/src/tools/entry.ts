import {
  MCP_MAX_CONCURRENT_CALLS,
  MCP_TOOL_RESULT_MAX_BYTES,
} from '../constants';
import type {
  McpApprovalRequest,
  McpClientIdentity,
  McpHostBridge,
  McpToolCallOutcome,
  McpToolDefinition,
} from '../interfaces';
import { McpRedactor } from '../redaction/entry';
import { annotationsFor, buildToolCatalog } from './tools-catalog';
import { McpArgumentError } from './tools-arguments';

/**
 * 工具层：注册表、分级、审批编排与结果裁剪。两种 transport 完全共用。
 *
 * 认证证明"调用方知道秘密"，不证明"调用方是善意的"。合法的 Host 仍可能
 * 被抓包正文里的 prompt injection 操纵，因此写工具的用户确认与 token 校验
 * 是正交的两层，缺一不可。
 */
export class McpToolRegistry {
  /** 按名字索引的工具定义。 */
  readonly #tools: ReadonlyMap<string, McpToolDefinition>;
  /** 宿主桥接。 */
  readonly #host: McpHostBridge;
  /** 生成审批 ID。 */
  readonly #createApprovalId: () => string;
  /** 当前在执行的调用数。 */
  #activeCalls = 0;

  constructor(
    host: McpHostBridge,
    options: {
      mcpRedactor?: McpRedactor;
      createApprovalId?: () => string;
    } = {},
  ) {
    this.#host = host;
    this.#createApprovalId = options.createApprovalId ?? (() => globalThis.crypto.randomUUID());
    const catalog = buildToolCatalog(options.mcpRedactor ?? new McpRedactor());
    this.#tools = new Map(catalog.map((tool) => [tool.name, tool]));
  }

  /** `tools/list` 的负载。 */
  listTools(): readonly {
    name: string;
    title: string;
    description: string;
    inputSchema: unknown;
    annotations: unknown;
  }[] {
    return [...this.#tools.values()].map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: annotationsFor(tool),
    }));
  }

  /** 工具是否存在。 */
  has(name: string): boolean {
    return this.#tools.has(name);
  }

  /**
   * 执行一次工具调用。写工具在获得用户确认前不产生任何 Core command；
   * 超时与拒绝都返回结构化错误，绝不排队自动通过。
   */
  async call(
    name: string,
    args: Readonly<Record<string, unknown>>,
    identity: McpClientIdentity,
    abortSignal: AbortSignal,
  ): Promise<McpToolCallOutcome> {
    const tool = this.#tools.get(name);
    if (tool === undefined) {
      return failure(`unknown tool: ${name}`);
    }
    if (this.#activeCalls >= MCP_MAX_CONCURRENT_CALLS) {
      return failure(`too many concurrent tool calls (limit ${MCP_MAX_CONCURRENT_CALLS})`);
    }

    this.#activeCalls += 1;
    try {
      const context = { host: this.#host, identity, abortSignal };
      if (tool.level === 'write') {
        const verdict = await this.#requestApproval(tool, args, context, identity);
        if (verdict !== 'approved') {
          this.#host.record({ kind: 'approval', identity, toolName: name, verdict });
          return failure(
            verdict === 'timeout'
              ? 'the user did not respond in time; the call was rejected'
              : 'the user rejected this call',
          );
        }
        this.#host.record({ kind: 'approval', identity, toolName: name, verdict });
      }

      const payload = await tool.execute(args, context);
      this.#host.record({ kind: 'tool-call', identity, toolName: name, ok: true });
      return { ok: true, payload: truncatePayload(payload) };
    } catch (error) {
      const message = error instanceof McpArgumentError
        ? error.message
        : describeError(error);
      this.#host.record({ kind: 'tool-call', identity, toolName: name, ok: false, message });
      return failure(message);
    } finally {
      this.#activeCalls -= 1;
    }
  }

  /** 组装审批请求；差异说明失败不阻断审批，只是少一段上下文。 */
  async #requestApproval(
    tool: McpToolDefinition,
    args: Readonly<Record<string, unknown>>,
    context: { host: McpHostBridge; identity: McpClientIdentity; abortSignal: AbortSignal },
    identity: McpClientIdentity,
  ): Promise<'approved' | 'rejected' | 'timeout'> {
    let diff: readonly string[] | undefined;
    if (tool.describeChange !== undefined) {
      try {
        diff = await tool.describeChange(args, context);
      } catch {
        diff = undefined;
      }
    }
    const request: McpApprovalRequest = {
      approvalId: this.#createApprovalId(),
      identity,
      toolName: tool.name,
      toolTitle: tool.title,
      destructive: tool.destructive,
      // 审批 UI 必须能看到 evil.com 这样的目标，因此传完整参数而非摘要。
      arguments: args,
      ...(diff === undefined ? {} : { diff }),
    };
    return this.#host.requestApproval(request);
  }
}

/** 统一的失败结果。 */
function failure(message: string): McpToolCallOutcome {
  return { ok: false, payload: { error: message } };
}

/** 超过上限时替换为说明，避免一次工具结果撑爆模型上下文。 */
function truncatePayload(payload: unknown): unknown {
  const serialized = JSON.stringify(payload) ?? '';
  if (Buffer.byteLength(serialized, 'utf8') <= MCP_TOOL_RESULT_MAX_BYTES) {
    return payload;
  }
  return {
    truncated: true,
    reason: `result exceeded ${MCP_TOOL_RESULT_MAX_BYTES} bytes; narrow the query or paginate`,
  };
}

/** 把未知异常转成可读文本。 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'tool execution failed';
}
