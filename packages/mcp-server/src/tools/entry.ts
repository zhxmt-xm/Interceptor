import {
  MCP_MAX_CONCURRENT_CALLS,
  MCP_TOOL_RESULT_MAX_BYTES,
} from '../constants';
import {
  buildInterceptorToolRegistry,
  InterceptorToolArgumentError,
  InterceptorToolRedactor,
  type InterceptorToolContext,
  type InterceptorToolDefinition,
} from '@interceptor/tools';
import type {
  McpApprovalRequest,
  McpClientIdentity,
  McpHostBridge,
  McpToolCallAccess,
  McpToolCallOutcome,
} from '../interfaces';

/**
 * 工具层：注册表、分级、审批编排与结果裁剪，不依赖Desktop transport。
 *
 * 认证证明"调用方知道秘密"，不证明"调用方是善意的"。合法的 Host 仍可能
 * 被抓包正文里的 prompt injection 操纵，因此写工具的用户确认与 token 校验
 * 是正交的两层，缺一不可。
 */
export class McpToolRegistry {
  /** 按名字索引的工具定义。 */
  readonly #tools: ReadonlyMap<string, InterceptorToolDefinition>;
  /** 宿主桥接。 */
  readonly #host: McpHostBridge;
  /** 生成审批 ID。 */
  readonly #createApprovalId: () => string;
  /** 当前在执行的调用数。 */
  #activeCalls = 0;

  constructor(
    host: McpHostBridge,
    options: {
      interceptorToolRedactor?: InterceptorToolRedactor;
      createApprovalId?: () => string;
    } = {},
  ) {
    this.#host = host;
    this.#createApprovalId = options.createApprovalId ?? (() => globalThis.crypto.randomUUID());
    const catalog = buildInterceptorToolRegistry(
      options.interceptorToolRedactor ?? new InterceptorToolRedactor(),
    );
    this.#tools = new Map(catalog.map((tool) => [tool.name, tool]));
  }

  /** `tools/list` 的负载。 */
  listTools(enabledToolNames?: readonly string[]): readonly {
    name: string;
    title: string;
    description: string;
    inputSchema: unknown;
    annotations: unknown;
  }[] {
    const enabledNames = enabledToolNames === undefined ? null : new Set(enabledToolNames);
    return [...this.#tools.values()].filter((tool) => (
      enabledNames === null || enabledNames.has(tool.name)
    )).map((tool) => ({
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
    access: McpToolCallAccess = {},
  ): Promise<McpToolCallOutcome> {
    const tool = this.#tools.get(name);
    if (
      tool === undefined
      || (access.enabledToolNames !== undefined && !access.enabledToolNames.includes(name))
    ) {
      return failure(`unknown tool: ${name}`);
    }
    if (this.#activeCalls >= MCP_MAX_CONCURRENT_CALLS) {
      return failure(`too many concurrent tool calls (limit ${MCP_MAX_CONCURRENT_CALLS})`);
    }

    this.#activeCalls += 1;
    try {
      const context: InterceptorToolContext = { host: this.#host, abortSignal };
      const executionMode = access.executionMode ?? 'ask';
      if (tool.kind === 'change' && executionMode === 'ask') {
        const verdict = await this.#requestApproval(tool, args, context, identity);
        if (verdict !== 'approved') {
          this.#host.record({
            kind: 'approval',
            identity,
            toolName: name,
            verdict,
            executionMode,
          });
          return failure(
            verdict === 'timeout'
              ? 'the user did not respond in time; the call was rejected'
              : verdict === 'cancelled'
                ? 'the MCP call was cancelled before approval'
                : 'the user rejected this call',
          );
        }
        this.#host.record({
          kind: 'approval',
          identity,
          toolName: name,
          verdict,
          executionMode,
        });
      }

      const payload = await tool.execute(args, context);
      this.#host.record({
        kind: 'tool-call',
        identity,
        toolName: name,
        ok: true,
        ...(tool.kind === 'change' ? { executionMode } : {}),
      });
      return { ok: true, payload: truncatePayload(payload) };
    } catch (error) {
      const message = error instanceof InterceptorToolArgumentError
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
    tool: InterceptorToolDefinition,
    args: Readonly<Record<string, unknown>>,
    context: InterceptorToolContext,
    identity: McpClientIdentity,
  ): Promise<'approved' | 'rejected' | 'timeout' | 'cancelled'> {
    let diff: readonly string[] | undefined;
    if (tool.describeChange !== undefined) {
      try {
        diff = (await tool.describeChange(args, context)).lines;
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
      ...(tool.effectDescription === undefined
        ? {}
        : { effectDescription: tool.effectDescription }),
      ...(diff === undefined ? {} : { diff }),
    };
    return this.#host.requestApproval(request, context.abortSignal);
  }
}

/** Maps shared Tool metadata to MCP protocol annotations. */
function annotationsFor(tool: InterceptorToolDefinition): {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const readOnly = tool.kind === 'query';
  return {
    readOnlyHint: readOnly,
    destructiveHint: tool.destructive,
    idempotentHint: readOnly,
    openWorldHint: tool.openWorld,
  };
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
