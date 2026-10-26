> 返回 [Agent 索引](README.md)

## 8. 停止、失败、超时与继续

本节区分产品执行控制、单次 I/O 故障和业务错误。OpenAI Agents SDK 默认使用可关闭的 `maxTurns` 安全限制，
Anthropic 也将最大迭代数列为常见停止条件；MCP 则要求取消、Tool timeout 和错误结果保持独立。本项目不把
任一框架默认值当成协议标准，而采用可见、可恢复的产品状态。

### 8.1 Turn 状态与结束条件

持久`AgentTurnStatus`包含`running / waiting-for-tool-approval / completed / cancelled / failed`：

| Status | 进入条件 | 是否继续同一 Turn |
| --- | --- | --- |
| `running` | User Item已提交，Model attempt正在执行 | 当前实现只允许Stop，不提供Continue |
| `waiting-for-tool-approval` | `ask`模式的change Tool Call已持久化，executor尚未开始 | Allow或Deny后恢复同一Turn；切换Mode不自动恢复 |
| `completed` | Model返回最终回答 | 否；下一条用户消息创建新Turn |
| `cancelled` | 用户Stop或应用退出完成受控取消 | 否；已完成Item保留，用户可发新消息 |
| `failed` | Provider重试耗尽、明确拒绝或Runtime内部错误 | 否；Retry从持久化安全边界创建新执行尝试 |

底层`AgentRunLoop`的checkpointed `suspended`不同于权限审批。Session Service在同一active Turn内等待change Tool的authorization gate，不结束或重建Turn；Tool Result落账后继续Model loop。持久Chat的Stop创建终态，不能以底层暂停能力推断UI提供Continue。

底层执行模式与Permission Mode正交：

- `checkpointed`：每连续执行10个Step后持久化`suspended: step-checkpoint`，UI显示已完成Step、当前Model Call /
  Tool和Continue / Always continue / Stop；Continue从同一History恢复并开始下一段计数；
- `continuous`：不设置Step检查点，Runtime继续到自然结束、Stop或真实失败；
- 两种模式都不设置Turn墙钟总时长。连续重复的同名Tool与规范化arguments产生可见warning并计入Step；
  Runtime不把warning伪装成错误或静默丢弃调用。

### 8.2 Model attempt timeout 与重试

Model timeout 只约束一次 Provider 网络 attempt，不约束整个 Turn。`ModelAdapter` 必须把 HTTP 状态、
`retryAfterMs`、是否已产生可见 Stream event、Provider replay 建议和底层原因规范化后交给 Runtime：

- `400`、`401`、`402`、`422`、明确 refusal 与请求契约错误不自动重试；
- `429`、`5xx`、网络故障和 attempt timeout 只有在未取消且确认 replay-safe 时才进入有限重试；
- Retry policy 必须有可测试的最大次数，优先遵守 `Retry-After`，否则使用有 jitter 的指数退避；等待期间仍可 Stop；
- Streaming 一旦向 Runtime 或 UI 发出任何可见事件，本 attempt 不自动重放。部分 Item 标记为 `incomplete`，
  保留在 Transcript 但不进入下一次 Working Set；Turn 以可重试失败结束；
- 重试耗尽后持久化具体失败 code 与安全摘要，不把 Provider 原始响应、Prompt 或凭据写入 Diagnostics。

Retry次数与attempt timeout属于Provider policy，不是Agent配额。Runtime默认零重试；显式注入的策略只重试replay-safe错误，遵守`Retry-After`或采用capped exponential backoff与full jitter。普通DeepSeek/Custom调用不默认设置非零retry或attempt timeout；连接测试有独立期限。

### 8.3 Tool 错误、timeout 与副作用

Tool 必须区分 Model 可修正的结果与 Runtime 故障：

- 未知 Tool、Zod arguments 失败、权限拒绝和显式 `ToolExecutionError` 作为 `Tool Error Result` 返回 Model；
- Tool 实现抛出的其他异常视为程序或依赖故障，终止当前 Turn 并记录脱敏诊断，不能由 `defineTool` 一律吞掉；
- timeout 由各 Tool descriptor 选择性声明，并只用于会监听 `AbortSignal` 的操作；没有全局 Tool timeout；
- 只读、明确可恢复的 Tool timeout 可以返回 Tool Error Result；有副作用的 Tool timeout 表示结果可能未知，
  Runtime 必须暂停并先查询真实状态，不能假定未执行或自动重试；
- 有副作用的调用在执行前事务写入 `callId + pending`，完成后写入 result。已完成 `callId` 返回已存结果；
  崩溃后仍为 pending 的调用进入核对流程，绝不直接重放。

MCP transport 可以把未知 Tool / 非法参数表达为 JSON-RPC protocol error，把业务执行失败表达为
`isError: true`；内置 Agent 不经过 MCP transport，但沿用“可修正错误回到 Model、内部错误终止执行”的边界。

### 8.4 Stop、取消竞态与恢复

Stop 通过 Turn 根 `AbortSignal` 传播到当前 Model attempt、退避等待和可取消 Tool。Runtime 随后：

1. 不再启动新的 Model Call 或 Tool Call；
2. 等待当前协作者完成取消清理，保存已经完成的 append-only Item；
3. 将未完成 Item 标记为 `incomplete`，把 Turn 持久化为 `cancelled`；
4. 忽略取消后迟到的 Provider / Tool 结果，但仍释放 listener、timer 和网络资源；
5. 发出最终有序 Session event，Session 本身继续存在。

取消通知可能与自然完成交错；最终 outcome 由先完成的原子状态迁移决定。取消已完成的 request、重复 Stop 和迟到结果
都必须幂等。用户下一条消息可以要求继续，但它创建新 Turn；只有 `suspended` 才恢复原 Turn。

### 8.5 所有权

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| `AgentRuntime` | Turn 状态机、Step 检查点、retry policy、根取消与事件顺序 | Provider wire parsing、具体 Tool 业务 |
| `ModelAdapter` | attempt timeout、Streaming 解析、Provider 错误规范化与 replay-safety 事实 | 自行重试完整 Agent Step |
| `InterceptorToolGateway` | Zod、Permission、Tool timeout、`callId` 幂等与 Core 调用 | 吞掉未知内部异常 |
| `AgentSessionStore` | Item / outcome / pending call 的事务持久化 | 决定下一步 Agent 行为 |
