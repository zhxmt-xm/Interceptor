# Feature: 内置 Agent

> Runtime package：`packages/agent-runtime/`
> 主类：`AgentRuntime`
> Model Provider：DeepSeek与OpenAI-compatible endpoint

## 目录

| 文档 | 内容 | 何时读 |
| --- | --- | --- |
| [concepts.md](concepts.md) | 术语与关系：组件、Tool、执行模式、Context 与协议 | 先建立概念或跨术语对照时 |
| [execution.md](execution.md) | 执行模型：ReAct 与 Plan-and-Execute | 改执行循环时 |
| [process.md](process.md) | 进程与所有权：Main、Runtime、Provider | 改进程边界或生命周期时 |
| [session-history.md](session-history.md) | 持久化模型与 DeepSeek 关系 | 改落盘与调用关系时 |
| [session-context.md](session-context.md) | Context 构建与渐进式披露 | 改上下文拼装时 |
| [session-usage.md](session-usage.md) | Session Usage 与 Context Window Usage | 改用量统计时 |
| [runtime.md](runtime.md) | `AgentRuntime` 契约 | 改 Runtime 接口时 |
| [failure.md](failure.md) | 停止、失败、超时、重试与恢复 | 改错误与取消语义时 |
| [chat.md](chat.md) | Chat 产品流程与 Settings > Agent | 改对话框与设置时 |
| [tools.md](tools.md) | Tool、渐进式披露与 MCP | 改 Tool 暴露与审批时 |
| [security.md](security.md) | 凭据、隐私与故障隔离 | 改凭据或脱敏时 |
| [provider.md](provider.md) | Provider 适配 | 接入新模型时 |
| [verification.md](verification.md) | 验证边界与分层证据 | 准备验收时 |

## 1. 产品目标

Interceptor 内置 Agent 是一个跨 Workspace 常驻的右侧 Chat Panel，不是独立 Workspace，也不是一次性演示程序。用户应当能够：

1. 配置自己的 Model Provider 凭据；
2. 创建、恢复、重命名和删除 Chat Session；
3. 进行流式多轮对话；
4. 让 Agent 查询当前代理状态和已捕获流量；
5. 在清楚看到参数和影响后，批准或拒绝写操作；
6. 随时停止当前 Turn，并在受控停止后继续；
7. 关闭并重新打开应用后继续历史 Session。
8. 查看当前 Context Window 已用与剩余 Tokens，以及当前 Session 累计 Token Usage；
9. 按 Model Call 和 Session 查看 cache hit / miss Token、Rate 与统计覆盖率。
10. 在 Capture、Rules、Composer、Settings 与 Diagnostics 之间切换时保持同一个 Chat Panel 和 Session，
  只有显式点击 Agent toggle 或 Panel Close 才关闭。

### 1.1 产品原则

- **用户拥有最终控制权**：本产品面向本机单用户，不设置隐藏的 Model Call、Tool Call、Turn 时长、
  Session数量或数据条数配额。用户可以随时Stop；连续执行检查点只能暂停当前Turn，
  不终结或丢弃状态，并必须提供Continue/切换连续执行。具体阈值必须在产品中可见，不能埋在Agent Loop常量里。
- **完整目录，按入口开关**：Agent 与 MCP 共用一份完整 Capability / Tool Catalog。每个已实现 Tool
  在 `Settings > Agent` 分别提供 Agent 与 MCP 两个开关，默认全部开启；关闭后只是不再向对应入口注册，
  不删除 Tool，也不改变另一入口。Model 起初只看到已开启能力的目录，再按任务需要加载完整 Tool schema
  和数据详情，避免无关信息占满 Context。
- **正确性边界不是产品限制**：Zod 参数验证、`callId` 幂等、API Key 隔离、原生文件 Dialog、UAC 和
  系统权限仍必须保留；这些边界防止错误执行，不剥夺用户已有操作能力。
- **业务能力与副作用分开**：真实产品意图通过共享Tool目录开放。副作用决定Permission
  Mode 和展示方式，不决定该操作永远不可达。已开启的查询 Tool 直接执行；已开启的改动 Tool 按当前
  Agent Session 或 MCP Client 的 `ask` / `auto` 执行策略处理。
## 2. 本项目数据模型

- 一个 Session 包含多个 Turn；一个 Turn 包含多个 Step；每个 Step 按顺序追加 Item。
- Session History 是必须持久化的 Short-term Memory；Long-term Memory 当前不做。
- Context 从 Session History 派生，不等同于完整 History，也不改变本地保存的数据。
- Working Set 是 `AgentRuntime` 为一次调用选择的 Provider-neutral Item 集合；Model Context 是 Provider 再加入
  system instructions、Tool schemas 和协议字段并模板化、Tokenize 后的最终输入。
- 因此从 Runtime 视角看 `Session Memory ≠ Working Set`；从 LLM 单次调用视角看，所谓“记得的 Session”只来自
  Working Set 中进入 Model Context 的 Session 内容。
- 用户可见 Transcript 保存消息和 Tool 轨迹；Provider continuation state 单独加密保存。
- DeepSeek `reasoning_content` 属于 continuation state。它必须按官方协议回传，可在 UI 中折叠展示，
  但不作为可编辑 Plan、Tool Result 或稳定业务证据。
## 3. 能力边界

- 不使用 LangChain、LangGraph 或其他 Agent framework；
- 不实现 Subagent 或 Multi-agent；
- 不实现跨 Session 的 Long-term Memory；
- 不在没有明确知识检索需求前引入 RAG、Embedding 或 Vector Database；
- 不在短任务已经可控前引入显式 Plan；
- 不让内置 Agent 通过本机 MCP transport 绕回自身；
- 不让 Model、Renderer 或 Preload 直接访问 Core、Node、文件系统或 API Key；
- 不把 Provider reasoning 自动提升为 Plan、Memory 或业务证据。

Plan、RAG 和 Long-term Memory 是相互独立的产品能力。以后只有出现可验证需求时才分别设计，
不作为“完整 Agent”套餐一起引入。
