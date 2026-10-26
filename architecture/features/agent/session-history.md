> 返回 [Agent 索引](README.md)

> 返回 [Agent 索引](README.md)

## 6. Session History

### 6.1 持久化模型

`AgentSessionStore` 保存 Provider-neutral Item，不保存 DeepSeek 原始 response：

```ts
type AgentItem =
  | { kind: 'user-message'; itemId: string; content: string }
  | { kind: 'assistant-message'; itemId: string; content: string; partial: boolean; providerStateId?: string }
  | { kind: 'tool-call'; itemId: string; callId: string; name: string; arguments: unknown; status: ToolCallStatus }
  | { kind: 'tool-result'; itemId: string; callId: string; content: unknown; ok: boolean }
  | { kind: 'notice'; itemId: string; reason: AgentNoticeReason; message: string };
```

- Session metadata包含 `sessionId`、标题、Provider、Model、创建和更新时间；
- 一个 Session 同时只有一个 active Turn，保证该 Session 的消息顺序；这属于会话一致性约束；
- 不同 Session 可以并行运行，不设置产品级全局并发配额；实际吞吐由 Provider 和本机资源决定；
- Item payload 使用现有 SecureStore 抽象加密后写入 SQLite BLOB；API Key 不进入 Session Store；
- 每个加密子行同时绑定`sessionId + rowType + rowId`并在解密后与SQLite主键核对，禁止合法密文被跨行或跨Session静默串换；
- Chat selector列表从启动时已完整验证的Store缓存生成summary，不为读取metadata重复解密和拼接全部Transcript；
- Provider continuation state 作为独立加密记录保存；DeepSeek adapter 用它恢复 `reasoning_content` 等 wire 字段；
- 删除 Session 必须删除其全部 Turn 和 Item，不保留隐藏副本；
- Session删除使用`secure_delete`并截断WAL；确定损坏库隔离，临时解密失败保留原库。
- Streaming delta先持久化为append-only chunk，再发布递增sequence事件；Renderer检测event gap后回读snapshot，并用selection generation阻止旧load覆盖新选择。
- Renderer 重新挂载或事件 sequence 缺口时重新读取 Main 快照，不依赖事件重放恢复状态。

### 6.4 Interceptor Session 与 DeepSeek API 的关系

- DeepSeek 官方明确说明 Chat Completions 与 Responses API 都是 stateless；服务端不保存 Conversation；
- 一个 Interceptor Session 对应零到多次 DeepSeek API request，不对应 DeepSeek Session；
- 每次 request 都由 `AgentRuntime` 从本地 Session History 构建并发送完整当前 Context；
- “完整当前 Context”不保证等于全部原始 History；它可以包含 summary、最近原文和按需披露的数据；
- DeepSeek response `id` 只关联单次调用，不承担本地 Session ID；
- 可选 `user_id` / `user` 只用于 Provider 安全审查、KV cache 和调度隔离，不用于恢复会话或查询账单；
- DeepSeek `/user/balance` 只能查询 API Key 所属账号当前余额，不返回本地 Session Usage；
- 未发现公开的按自定义 Session 查询历史 Usage API，因此每次 response 的 Usage 必须由 Runtime 自己累计；
- DeepSeek 控制台显示的 API Key Usage 可用于总账核对，不能替代本地 Session ledger；
- Prompt Cache 命中只表示重复前缀可能复用缓存，不表示 DeepSeek 持有可恢复的 Chat Session。
