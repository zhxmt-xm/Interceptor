> 返回 [Agent 索引](README.md)

## 术语与关系

以下定义是官方文档或原始论文的中文归纳；没有统一行业定义的名称会明确标成“本项目约定”。

### 基础组件

- **Model / LLM**：接收 Context 并生成文本或结构化 Tool Call 的模型。DeepSeek 是首个 Model Provider，
  不是 Agent Runtime。
- **Agent**：Anthropic 将 Agent 与 Workflow 区分为：Agent 由 LLM 动态决定自身过程和 Tool 使用方式，
  并持续从环境反馈中取得 ground truth，直到完成、需要用户判断或被停止。
  来源：[Anthropic · Building effective agents](https://www.anthropic.com/research/building-effective-agents)。
- **Agent Loop**：调用 Model，检查结果；若是最终输出则结束，若有 Tool Call 则执行 Tool、追加结果并再次调用 Model。
  来源：[OpenAI Agents SDK · Agent loop](https://openai.github.io/openai-agents-js/guides/running-agents/#the-agent-loop)。
- **Harness**：Microsoft 将 Agent Harness 定义为协调 Agent 的软件：运行 Agent Loop、管理 Session、
  调用 Tool，并把 Tool Result 返回 Model，直到任务完成或需要用户输入。
  来源：[VS Code · Agent harnesses](https://code.visualstudio.com/docs/agents/concepts/agent-harnesses)。
- **Agent Host / Runtime**：没有统一规范定义。Microsoft 的 Agent Host 是一种生产架构：Host 独立承载
  Session，并通过 Adapter 接入不同 Agent Runtime。本项目的 `AgentRuntime` 是 Agent domain 的唯一组合根。
- **Workflow**：Anthropic 将 Workflow 定义为由预先确定的代码路径编排 LLM 和 Tool 的系统；
  Agent 则动态决定执行过程。来源同上。

### Tool 与执行结果

- **Tool**：让 Model 与外部系统交互的能力，例如查询数据库、调用 API 或执行计算。Tool 定义至少包含名称、
  描述和参数 JSON Schema。来源：[MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)。
- **Tool Call**：Model 生成的结构化调用请求，包含 Tool 名、`callId` 和 arguments；它是请求，不是执行结果。
- **Tool Result**：应用执行 Tool 后产生并回传给 Model 的结果。MCP 允许文本、结构化内容、媒体或 Resource Link。
- **Observation**：ReAct 对 Action 执行后环境反馈的称呼；在本项目里通常对应 Tool Result。
- **Zod**：官方定义为 TypeScript-first schema validation library；用于验证不可信的 Tool arguments，
  并可将同一 schema 转成 JSON Schema 发给 Model。来源：[Zod](https://zod.dev/)。
- **Strict Tool Call**：Provider 按 JSON Schema 约束 Model 输出。DeepSeek 的 strict mode 当前是 Beta；
  Provider 校验不能替代本地 Zod 校验。来源：[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)。

### 执行模式

- **ReAct**：原始论文提出让 Model 交错生成 reasoning traces 与 task-specific actions；Action 从环境取得新信息，
  Observation 再影响后续 reasoning 和 Action。来源：[ReAct paper](https://arxiv.org/abs/2210.03629)。
- **Plan-and-Execute**：行业架构模式，没有协议级标准定义。本项目用它表示 Planner 先把任务拆成子任务，
  Executor 再按 Plan 执行，并可根据结果 Replan；其“先规划、再执行子任务”与 Plan-and-Solve 研究一致。
  来源：[Plan-and-Solve paper](https://arxiv.org/abs/2305.04091)。
- **Progressive Disclosure / 渐进式披露**：不是统一协议名。本项目借用 OpenAI 官方的 Deferred Tool Loading / Tool Search
  思路：运行时只加载当前需要的 Tool 定义，而不是一次发送所有 schema。
  来源：[OpenAI Agents SDK · Deferred tool loading](https://openai.github.io/openai-agents-js/guides/tools/#deferred-tool-loading-with-tool-search)。
- **`discover_tools`**：本项目实现渐进式披露的普通 Function Tool。DeepSeek Chat Completions 没有原生
  `tool_search`，因此由 `AgentRuntime` 在本地搜索 Tool Catalog 并在下一次 Model Call 披露 schema。

### 状态、Context 与知识

- **Session / Thread / Conversation**：官方 SDK 对持久对话容器使用不同名称。本项目统一叫 Session，
  表示可跨应用重启恢复的一段 Chat。
- **Turn**：OpenAI Agents SDK 将一次 `run()` 视为应用会话中的一个 Turn。本项目对应一条用户消息触发的完整执行。
- **Step**：本项目约定为一次 Model Call，加上该响应触发的 Tool Call / Tool Result；不是跨 Provider 标准术语。
- **Item**：本项目持久化顺序中的 user message、assistant message、Tool Call、Tool Result 或 notice。
- **Context**：某次 Model Call 实际收到的输入视图，可由 History、Tool schema、检索结果和当前状态组成。
- **Context Window**：Model 单次调用可处理的有限输入/输出范围；它不是 Session History 的存储上限。
- **Token**：DeepSeek 将 Token 定义为 Model 表示自然语言文本和计费的基本单位；实际数量以 API Usage 为准。
  来源：[DeepSeek · Token & Token Usage](https://api-docs.deepseek.com/quick_start/token_usage)。
- **Tokenizer / Tokenization**：Tokenizer 把文字、数字、标点和协议内容切分并映射为整数 Token ID 序列；
  Model 实际处理的是 Token ID，不是 JavaScript 字符串。不同 Model 的切分结果可能不同。
- **Working Set**：本项目对“本次 Model Call 实际从完整 History 选入 Context 的内容集合”的称呼；
  不是行业协议术语。未进入 Working Set、summary 或检索结果的内容，Model 本次无法知道。
- **Model-visible Session Memory**：本项目用于解释 Model 视角的说法，不是独立存储。它等于当前 Model Call
  中 Working Set 里来自该 Session 的内容；Model 不会直接读取 Runtime 保存的完整 Session History。
- **KV Cache / Prompt Cache**：Provider 对已经计算过的相同输入 Token prefix 复用 Attention Key / Value 状态的
  推理优化。它不替 Runtime 保存 Session，不让 Model 看见未发送的信息，也不扩大 Context Window。
  DeepSeek 将产品能力称为 [Context Caching](https://api-docs.deepseek.com/guides/kv_cache)。
- **Context Compaction**：Anthropic 将其定义为：当 Conversation 接近 Context Window 上限时总结内容，
  再用 Summary 重新开始一个 Context Window。它压缩 Model 可见 History，不等于删除产品的完整 History。
  来源：[Anthropic · Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)。
- **Compaction Checkpoint**：没有跨厂商统一 Schema。OpenAI Codex 用该概念表示一个 History Replacement
  Boundary：记录哪份 live History 被哪份 replacement History 取代。本项目沿用这一含义。
- **Execution Checkpoint**：保存 Agent 执行状态，以便在审批、崩溃或重启后继续；它可以包含当前 Turn、
  active Tool Call 和 continuation state，不等于 Conversation Summary。
- **Workspace Checkpoint**：保存外部工作区状态以支持回滚。例如 VS Code Checkpoint 是请求前的文件快照；
  它与 Context Compaction 无关。
- **Usage**：一次 Model Call 实际处理的 input、output 与 total token 计数；Provider 返回值是事实来源。
- **Session Usage**：本项目指标，累计当前 Session 全部 Model Call 的 input / output tokens；它描述总消耗。
- **Current Context Window Usage**：本项目指标，表示当前或最近一次 Model Call 实际装入的 input tokens
  占该 Model Context Window 的比例；它会因渐进式披露或 compaction 降低，不累计历史调用。
- **Short-term Memory**：本项目采用行业常见含义，指单个 Session 内可恢复的 Message History 与执行状态。
- **Long-term Memory**：跨 Session 保存并可在其他 Session 调用的事实、经验或规则。CoALA 将 Language Agent
  描述为包含模块化 Memory、结构化 Action Space 和 Action Selection 的认知架构。
  来源：[CoALA paper](https://arxiv.org/abs/2309.02427)。
- **RAG**：原始论文定义为将预训练 Model 的 parametric memory 与可检索的 non-parametric memory 结合用于生成。
  来源：[Retrieval-Augmented Generation paper](https://arxiv.org/abs/2005.11401)。
- **`reasoning_content`**：DeepSeek Thinking Mode 返回的 Provider 字段，不是 Plan。请求携带 `tools` 时，
  官方要求在后续请求中完整回传，否则会返回 `400`。
  来源：[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode#tool-calls)。

### 协议、Framework 与多 Agent

- **MCP**：连接 AI 应用与外部系统的开放标准；采用 Host–Client–Server 架构。Host 协调 LLM 与 Context，
  Client 与一个 Server 保持一对一 Session，Server 暴露 Tools、Resources 和 Prompts。
  来源：[MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture)。
- **Agent Framework / Orchestration Framework**：复用 Model、Tool、Loop、持久化或图编排能力的实现库；
  LangChain、LangGraph 等是实现选项，不是本项目术语的权威定义来源，当前也不依赖它们。
- **Subagent**：由另一个 Agent 作为 Tool 调用或通过 Handoff 接管任务的独立 Agent。
- **Multi-agent**：多个 Agent 通过 Tool、Handoff 或 Orchestrator 协作的系统；Plan-and-Execute 不要求 Multi-agent。
- **Model Provider**：本项目对 DeepSeek、Qwen、Ollama 等模型服务来源的称呼。
- **ModelAdapter**：本项目的协议适配边界，把 Provider wire format 转为 `AgentRuntime` 的统一事件。

### 关系速览

- Agent 系统由 Model、Harness / Runtime、Tools、State / Context 和执行策略共同组成；Model 本身不等于 Agent。
- `Agent Loop = Model Call → Tool Call → 应用执行 → Tool Result / Observation → 下一次 Model Call`。
- `ReAct` 决定下一步 Action；`Plan-and-Execute` 先产生 Plan，再让 Executor 执行每一步。
- `Plan-and-Execute` 的 Executor 可以继续使用 ReAct；二者不是互斥实现。
- `Session → Turn → Step → Item`；Session History 是 Short-term Memory，Context 是从 History 派生的调用视图。
- `Session History → Working Set → Provider Chat Template / Tokenizer → Model Context Token Sequence`；
  对 LLM 而言，可感知的 Session Memory 只等于这次 Context 中来自 Session 的部分。
- Prompt Cache 只复用已发送 Token prefix 的计算结果；它不是 Session Memory，也不会把未发送的 History 隐式补回。
- `Session Usage = Σ Model Call Usage`；Current Context Window Usage 只表示当前调用的 Context。
- 渐进式披露影响 Context：Capability → Tool schema → Resource summary → Resource detail。
- Zod schema 一端转换为 JSON Schema供 Model 生成 Tool Call，另一端校验 Model 返回的 arguments。
- MCP 服务外部 Agent；内置 Agent 直接消费同一 Tool Catalog，不经过本机 MCP transport。
- RAG 可以表现为 ReAct 中的检索 Tool，但普通业务查询 Tool 不自动等于 RAG。
- Subagent / Multi-agent 是 Agent 组合方式，与 ReAct、Plan-and-Execute、MCP 都不是同一层概念。
