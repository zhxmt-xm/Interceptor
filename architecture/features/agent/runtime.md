> 返回 [Agent 索引](README.md)

## 7. `AgentRuntime` 契约

`AgentRuntime` 是 package 唯一主类和 Agent domain 组合根：

```ts
interface AgentRuntimeOptions {
  readonly dataDirectory: string;
  readonly secureStore: AgentSecureStore;
  readonly toolSource: AgentToolSource;
  readonly fetcher?: typeof fetch;
  readonly createId?: () => string;
  readonly providerConnectionTestTimeoutMs?: number;
  readonly executionMode?: AgentExecutionMode;
  readonly modelRetryPolicy?: ModelRetryPolicy;
  readonly now?: () => number;
}

class AgentRuntime {
  constructor(options: AgentRuntimeOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  beginShutdown(): Promise<void>;
  resumeAfterShutdownFailure(): void;
  getModels(): AgentModelsSnapshot;
  testProviderConnection(draft: unknown): Promise<AgentProviderVerification>;
  saveVerifiedProvider(verificationId: string): Promise<AgentModelsSnapshot>;
  setDefaultModel(providerId: string): Promise<AgentModelsSnapshot>;
  removeProvider(providerId: string): Promise<AgentModelsSnapshot>;
  listSessions(): Promise<AgentSessionsSnapshot>;
  createSession(): Promise<AgentSessionSnapshot>;
  selectSession(sessionId: string): Promise<AgentSessionSnapshot>;
  getSession(sessionId: string): Promise<AgentSessionSnapshot>;
  renameSession(sessionId: string, title: string): Promise<AgentSessionSnapshot>;
  deleteSession(sessionId: string): Promise<AgentSessionsSnapshot>;
  setSessionModel(sessionId: string, providerId: string): Promise<AgentSessionSnapshot>;
  requireToolApproval(sessionId: string): Promise<AgentSessionSnapshot>;
  automaticallyExecuteTools(sessionId: string): Promise<AgentSessionSnapshot>;
  sendMessage(sessionId: string, content: string): Promise<AgentTurnSnapshot>;
  cancelTurn(turnId: string): Promise<AgentTurnSnapshot>;
  retryTurn(turnId: string): Promise<AgentTurnSnapshot>;
  allowToolCall(approvalId: string): Promise<AgentSessionSnapshot>;
  denyToolCall(approvalId: string): Promise<AgentSessionSnapshot>;
  subscribe(listener: (event: AgentRuntimeEvent) => void): () => void;
}
```

Runtime内部驱动Streaming `ModelAdapter`，把text delta、Usage和状态变化转成Provider-neutral event，
并自行维护Store、Context和Session aggregate。`AgentToolSource.snapshot()`在每次Model Call以及业务Tool执行前
重新求值，Settings关闭项无需重建Runtime即可生效。DeepSeek SSE使用原生`fetch`，不引入完整Agent SDK。

运行不变量：

- 输入 History 与 Runtime event 都是 append-only；
- 初始request只携带已开启能力的索引和常驻`discover_tools`，不携带业务Tool schema；
- `discover_tools({ capabilityId, query? })`复用共享Catalog的deterministic discovery，结果返回匹配descriptor；
- 成功discovery后，匹配且仍启用的业务schema从下一次Model Call开始披露；披露集合由当前Session已持久化的
  `discover_tools` Call/Result轨迹推导，不增加独立影子字段，也不跨Session继承；
- 每次Model Call重新读取source snapshot，关闭的已披露Tool立即从后续request消失；业务Tool执行前再次读取
  snapshot，关闭或未披露的名称统一返回`unknown_tool`且不调用产品入口；已进入executor的调用按开始快照完成；
- Tool arguments 始终按 `unknown` 处理，通过 descriptor 的边界解析后才能执行；
- Model 只能提出 Tool Call；Tool 是否注册由 Settings 开关决定，改动 Tool 是否直接执行由当前 `ask` / `auto` 决定；
- `toolExecutionMode`是Session metadata的必填字段，新Session固定为`ask`且不继承当前Chat；不增加旧schema迁移；
- query Tool不进入审批。change Tool在`ask`下先把Call与`approvalId/status=pending`原子持久化，再等待用户意图；
  Allow和Deny分别使用独立Runtime/Main/Preload方法，切到`auto`不自动批准或拒绝既有pending；
- Allow恢复同一Turn前再次读取Tool source；审批期间被关闭的Tool返回`unknown_tool`且不触达产品入口。Deny写入
  `tool_denied` Result并继续同一Model loop；已完成或已拒绝的`approvalId`不能重复裁决；
- 调用方取消后不再发起新的 Model 或 Tool 调用；
- Usage 只记录 Provider 实际返回的字段，缺失字段保持未知；
- Runtime 不修改调用方数组，也不知道 Electron IPC；但它拥有 Agent 数据持久化和所有 Agent 状态。
