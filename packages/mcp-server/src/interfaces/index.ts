import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';

/** MCP 工具的能力级别；决定是否需要用户逐次确认。 */
export type McpToolLevel = 'read' | 'write';

/** 调用方身份。`clientId` 由 token 决定，是唯一可信的标识。 */
export interface McpClientIdentity {
  /** 可信：由 token 解析得出。 */
  clientId: string;
  /** 可信：用户在 Settings 里为该接入起的名字。 */
  label: string;
  /** 不可信：MCP initialize 自报的 clientInfo.name，仅供展示与审计。 */
  reportedName?: string;
}

/** 写工具的审批请求；宿主据此弹出确认 UI。 */
export interface McpApprovalRequest {
  /** 本次审批的唯一 ID。 */
  approvalId: string;
  /** 发起调用的身份。 */
  identity: McpClientIdentity;
  /** 被调用的工具名。 */
  toolName: string;
  /** 工具的人类可读标题。 */
  toolTitle: string;
  /** 该工具是否会造成不可逆后果。 */
  destructive: boolean;
  /** 完整调用参数；审批 UI 必须原样展示，不得只给摘要。 */
  arguments: Readonly<Record<string, unknown>>;
  /** 仅 apply_rules 使用：待写入规则相对当前 RuleSet 的差异说明。 */
  diff?: readonly string[];
}

/** 审批裁决。超时与拒绝在语义上等价，但要分别记入审计。 */
export type McpApprovalVerdict = 'approved' | 'rejected' | 'timeout';

/** 写入 Diagnostics 的审计事件；失败不得阻塞工具调用。 */
export interface McpAuditEvent {
  /** 事件种类。 */
  kind: 'tool-call' | 'approval' | 'auth-failure';
  /** 可信身份；认证失败时为 null。 */
  identity: McpClientIdentity | null;
  /** 涉及的工具名。 */
  toolName?: string;
  /** 审批裁决。 */
  verdict?: McpApprovalVerdict;
  /** 调用是否成功。 */
  ok?: boolean;
  /** 失败原因。 */
  message?: string;
}

/**
 * 宿主（Main 进程）必须提供的能力。MCP package 自身不认识 Electron、
 * 不持有 MessagePort、不接触文件系统。
 */
export interface McpHostBridge {
  /** 把工具调用下沉到 Core；宿主负责 CoreRpcClient 与超时。 */
  invoke<T extends CoreCommand>(command: T, signal: AbortSignal): Promise<CoreResultForCommand<T>>;
  /** 请求用户确认写工具。宿主负责展示、超时与窗口聚焦。 */
  requestApproval(request: McpApprovalRequest): Promise<McpApprovalVerdict>;
  /** 记录审计事件。实现必须吞掉自身错误。 */
  record(event: McpAuditEvent): void;
}

/** 工具输入的 JSON Schema 子集；只覆盖工具参数实际用到的形态。 */
export interface McpJsonSchema {
  type: 'object';
  properties: Readonly<Record<string, McpJsonSchemaProperty>>;
  required?: readonly string[];
  additionalProperties: false;
}

/** 单个参数的 schema。 */
export interface McpJsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: readonly string[];
  items?: McpJsonSchemaProperty;
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
}

/** `tools/list` 中的注解，向 Host 表明工具的副作用形态。 */
export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** 工具执行时可用的上下文。 */
export interface McpToolContext {
  /** 宿主桥接。 */
  host: McpHostBridge;
  /** 发起调用的身份。 */
  identity: McpClientIdentity;
  /** 调用取消信号。 */
  signal: AbortSignal;
}

/** 一个 MCP 工具的完整定义。 */
export interface McpToolDefinition {
  /** 暴露给 Host 的工具名。 */
  name: string;
  /** 人类可读标题。 */
  title: string;
  /** 给模型看的说明。 */
  description: string;
  /** 能力级别；`write` 必须经用户确认。 */
  level: McpToolLevel;
  /** 是否造成不可逆后果，影响审批 UI 的措辞。 */
  destructive: boolean;
  /** 参数 schema。 */
  inputSchema: McpJsonSchema;
  /** 执行工具并返回已脱敏的结果负载。 */
  execute(args: Readonly<Record<string, unknown>>, context: McpToolContext): Promise<unknown>;
  /** 仅写工具实现：为审批 UI 生成差异说明。 */
  describeChange?(
    args: Readonly<Record<string, unknown>>,
    context: McpToolContext,
  ): Promise<readonly string[]>;
}

/** 工具调用结果。 */
export interface McpToolCallOutcome {
  /** 工具是否成功。协议层据此设置 `isError`。 */
  ok: boolean;
  /** 成功时的结构化负载，失败时为错误说明。 */
  payload: unknown;
}

/** JSON-RPC 请求。 */
export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

/** JSON-RPC 通知（无 id，不需要回复）。 */
export interface McpJsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/** JSON-RPC 成功响应。 */
export interface McpJsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number;
  result: unknown;
}

/** JSON-RPC 错误响应。 */
export interface McpJsonRpcFailure {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type McpJsonRpcResponse = McpJsonRpcSuccess | McpJsonRpcFailure;

/** 已注册的接入凭据。token 只存在于内存中。 */
export interface McpClientRegistration {
  /** 可信客户端 ID。 */
  clientId: string;
  /** 用户起的名字。 */
  label: string;
  /** 该接入的 bearer token 明文，仅在创建时返回一次。 */
  token: string;
}

/** 传给协议处理器的一次会话。 */
export interface McpSessionOptions {
  /** 已认证的身份。 */
  identity: McpClientIdentity;
}
