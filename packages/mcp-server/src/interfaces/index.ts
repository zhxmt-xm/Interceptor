import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import type { InterceptorToolHost } from '@interceptor/tools';

/** 调用方身份。`clientId` 由 token 决定，是唯一可信的标识。 */
export interface McpClientIdentity {
  /** 可信：由 token 解析得出。 */
  clientId: string;
  /** 可信：用户在 Settings 里为该接入起的名字。 */
  label: string;
}

/** 已开启change Tool的Client级执行方式。 */
export type McpToolExecutionMode = 'ask' | 'auto';

/** 一次Tool调用从Main动态读取的授权快照。 */
export interface McpToolCallAccess {
  /** 当前允许该Client调用的共享Tool名称。 */
  readonly enabledToolNames?: readonly string[];
  /** change Tool是否逐次问询。 */
  readonly executionMode?: McpToolExecutionMode;
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
  /** Tool registry声明的真实影响。 */
  effectDescription?: string;
  /** 仅 rules_replace_tree 使用：待写入规则相对当前 RuleSet 的差异说明。 */
  diff?: readonly string[];
}

/** 审批裁决；拒绝、超时与生命周期取消分别进入审计。 */
export type McpApprovalVerdict = 'approved' | 'rejected' | 'timeout' | 'cancelled';

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
  /** change Tool调用时采用的执行模式。 */
  executionMode?: McpToolExecutionMode;
  /** 失败原因。 */
  message?: string;
}

/**
 * 宿主（Main 进程）必须提供的能力。MCP package 自身不认识 Electron、
 * 不持有 MessagePort、不接触文件系统。
 */
export interface McpHostBridge extends InterceptorToolHost {
  /** 把工具调用下沉到 Core；宿主负责 CoreRpcClient 与超时。 */
  invoke<T extends CoreCommand>(command: T, abortSignal: AbortSignal): Promise<CoreResultForCommand<T>>;
  /** 请求用户确认写工具。宿主负责展示、超时、窗口聚焦与调用取消。 */
  requestApproval(
    request: McpApprovalRequest,
    abortSignal: AbortSignal,
  ): Promise<McpApprovalVerdict>;
  /** 记录审计事件。实现必须吞掉自身错误。 */
  record(event: McpAuditEvent): void;
}

/** `tools/list` 中的注解，向 Host 表明工具的副作用形态。 */
export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** 工具调用结果。 */
export interface McpToolCallOutcome {
  /** 工具是否成功。协议层据此设置 `isError`。 */
  ok: boolean;
  /** 成功时的结构化负载，失败时为错误说明。 */
  payload: unknown;
}

/** 已注册的接入凭据；Desktop宿主负责加密持久化。 */
export interface McpClientRegistration {
  /** 可信客户端 ID。 */
  clientId: string;
  /** 用户起的名字。 */
  label: string;
  /** 该接入的 bearer token 明文，仅在创建时返回一次。 */
  token: string;
}
