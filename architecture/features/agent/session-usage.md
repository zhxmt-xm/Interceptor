> 返回 [Agent 索引](README.md)

### 6.3 Session Usage 与 Context Window Usage

Token不自动换算为金额，保留Provider计费所需的hit / miss / output三个Token bucket。
DeepSeek 每次 response 的 `usage` 是 Token 事实来源；Runtime 按 Model Call 持久化：

```ts
interface AgentModelCallUsage {
  modelCallId: string;
  purpose: 'turn' | 'compaction';
  providerId: string;
  modelId: string;
  inputTokens?: number;
  cacheHitInputTokens?: number;
  cacheMissInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextWindowTokens?: number;
  currentContextTokens?: number;
  remainingContextTokens?: number;
  source: 'provider' | 'estimated' | 'unavailable';
}
```

- `Session Usage` 分别累计 Session 中全部 Model Call 的 input、output 和 total tokens；
- `purpose: 'compaction'` 的 Model Call 也是真实 Provider 消耗，进入 Session Usage，并在 Usage detail 单独标记；
- `cacheHitInputTokens` 和 `cacheMissInputTokens` 都是 input tokens 的子集，不能再次加进 total；
- Provider 同时返回两者时，`inputTokens = cacheHitInputTokens + cacheMissInputTokens`；
- `Current Context` 是当前或最近一次 request 实际发送的 input tokens，不是 Session 累计 Usage；
- `Context Window Usage = currentContextTokens / contextWindowTokens`；
- `remainingContextTokens = contextWindowTokens - currentContextTokens` 是生成前理论剩余；Model 输出也会占用它；
- DeepSeek 规定 input 与 generated tokens 总和受 Context Length 限制，所以圆环 tooltip 同时显示请求的
  `max_tokens` / `max_output_tokens`，不把理论 remaining 冒充为保证可输出量；
- 请求发出前可用官方 tokenizer 做 estimated；response 到达后以 Provider Usage 覆盖为 exact；
- Usage 和圆环只用于观察，不触发默认预算或自动停止。

Cache Rate 不单独持久化，由 Provider 返回的 Token 事实派生：

```text
cacheReportedInputTokens = cacheHitInputTokens + cacheMissInputTokens
cacheHitRate = cacheHitInputTokens / cacheReportedInputTokens
cacheMissRate = cacheMissInputTokens / cacheReportedInputTokens
```

- 当前 Model Call 的 hit / miss Rate 使用该调用自己的 Token；
- Session Rate 使用 `sum(cacheHitInputTokens) / sum(cacheReportedInputTokens)` 加权计算，禁止对每次调用的百分比求平均；
- 未提供 hit / miss 拆分的调用不进入 Rate 分母，并显示
  `cacheMetricsCoverage = sum(cacheReportedInputTokens) / Session inputTokens`；
- `cacheReportedInputTokens = 0` 时 Rate 显示 `—`，不显示误导性的 `0%`；
- Token 紧凑显示为 `22k`，tooltip 和 Usage detail 保留 Provider 返回的精确整数；
- Streaming 期间不估算 Cache Rate，只在收到该 Model Call 的最终 Usage 后更新。

DeepSeek 的 [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing) 按 Model、调用时段和三类 Token
给出单价。若未来展示金额，单次调用必须按调用发生时的价格分别计算，不能用 `inputTokens × 一个统一输入价`：

```text
inputCharge = cacheHitInputTokens × cacheHitInputUnitPrice
            + cacheMissInputTokens × cacheMissInputUnitPrice
totalCharge = inputCharge + outputTokens × outputUnitPrice
```

- DeepSeek 计费的是 cache-hit input tokens、cache-miss input tokens 和 output tokens，不是 KV 对象数量或字节数；
- 当前公开价格表没有单列 KV Cache 构建、磁盘占用或保存时长费用；所谓“KV 计费”实际是命中 input 使用更低单价；
- 价格会随Model及peak/off-peak时段变化，Runtime不硬编码长期不变的金额，只展示可核对的Token bucket；
- `Session totalTokens` 继续等于全部 input + output，不因为 hit token 更便宜而减少。

#### 6.3.1 DeepSeek Prompt Cache

DeepSeek 的 [Context Caching](https://api-docs.deepseek.com/guides/kv_cache) 默认启用。它缓存已经处理过的
**完全相同输入前缀**对应的 KV，不缓存语义相似内容，也不缓存最终回答：

1. Runtime 每次仍发送完整的当前 Context；
2. DeepSeek 按 Chat Template 和 Tokenizer 得到 input token sequence；
3. 只有完整匹配某个已持久化 cache prefix unit 的前缀才能命中；
4. 命中的 prefix 复用 KV，未命中的 suffix 重新做 prefill；
5. output 仍逐 token 生成，可能因 sampling 参数产生不同结果。

KV 是 Transformer Attention 在处理 prefix tokens 时产生的内部 Key / Value 状态。这里的 prefix 是
**最终模型输入 Token Sequence 从第一个 Token 开始的连续前段**，不是只比较 `content`，也不是比较 HTTP JSON 原始字节：

- `role` 会被 Chat Template 编码为角色边界或控制 Token，因此 `user` 改成 `assistant` 会改变 prefix；
- Message 顺序、`content` 的文字/空白/标点都会影响后续 Token；
- Tool schema、Tool Call / Result、`reasoning_content` 等只要进入模型输入，也会影响 prefix；
- HTTP envelope 的 JSON 缩进不是模型输入；但 Tool schema、arguments 等结构一旦被 Provider 序列化进 Prompt，
  其数组顺序、字符串内容以及 Provider 的序列化结果就可能改变 Token Sequence，Runtime 因此保持 deterministic serialization；
- Model 和 cache isolation scope 必须兼容；它们约束查找范围，但不属于这段 Token prefix 本身；
- Prefix 必须从输入开头连续匹配，不能跳过中间一条不同的 Message 后继续累计 hit。

DeepSeek 不是对任意相同片段即时命中，而是先持久化完整 `cache prefix unit`：

1. 每次 request 在 user input 结束位置和 model output 结束位置各产生一个候选 prefix unit；
2. 多次请求出现共同 prefix 后，DeepSeek 可把该共同部分持久化为独立 unit；
3. 长 input / output 会按固定 Token 间隔切出 unit；
4. 后续输入必须完整匹配某个已经持久化的 unit 才能命中；只有相同片段但 unit 尚未写入时仍可能 miss。

多轮 Chat 示例：

```text
Call 1 input:  system + user₁
Call 1 output: assistant₁

Call 2 input:  system + user₁ + assistant₁ + user₂
               └──── eligible cache-hit prefix ────┘ └ miss suffix ┘
```

- `assistant₁` 在 Call 1 是 output；Runtime 保存后，它在 Call 2 变成 input；
- Call 2 必须把 `assistant₁` 及其真实 `role` 原样放回 `messages`，DeepSeek 是 stateless，缓存不能代替传输；
- 因 DeepSeek 会在 model output 结束位置形成 prefix unit，`system + user₁ + assistant₁` 可以整体命中；
- 普通文本要保留 `assistant.content`；Thinking / Tool 场景还要保留协议要求的 `reasoning_content`、
  `tool_calls`、`tool_call_id` 和匹配的 Tool Result；
- 把旧消息放回 `messages` 只是必要条件；还要求相同 Model、兼容的 cache isolation scope、unit 已持久化且未过期；
- DeepSeek 自动启用缓存，不需要 Client 发送 cache key；命中是 best-effort，唯一事实来源是 response `usage`；
- cache 构建可能需要数秒，不再使用时通常在数小时到数天内清理，因此连续请求也不保证 100% 命中。

DeepSeek 在 response `usage` 中分别返回：

- `prompt_cache_hit_tokens` → `cacheHitInputTokens`；
- `prompt_cache_miss_tokens` → `cacheMissInputTokens`；
- 二者相加仍是本次完整 `inputTokens`。

| 维度 | Cache hit 是否节省 |
| --- | --- |
| Context Window 占用 | 否；hit tokens 仍在 Model Context 中 |
| Session input Usage | 否；每次 request 的完整 input 仍累计 |
| HTTP 传输 | 否；Client 仍发送完整 Context |
| input 计费 | 是；hit 与 miss 使用不同单价 |
| prefix prefill 计算与延迟 | 通常是；Provider 直接读取已缓存 KV |
| output 生成与计费 | 否；回答仍重新生成 |

示例：

- 第一次调用：`20k input miss + 2k output`；
- 第二次调用在原对话后追加 `1k` 新内容，因此发送 `23k input`；
- 若前 `22k` 已形成并命中 cache unit，则 Usage 是 `22k hit + 1k miss = 23k input`；
- 第二次 Current Context 仍是 `23k`，两次 Session input Usage 仍是 `20k + 23k = 43k`；
- 只有第二次 input 费用按 `22k × cache-hit unit price + 1k × cache-miss unit price` 计算。

若每轮固定新增约 `t` tokens 且始终全量重放，第 `n` 次 input 约为 `n × t`，前 `n` 次累计 input 约为
`t × n × (n + 1) / 2`。Prompt Cache 降低重复 prefix 的计算和单价，但不会改变这个 Context 与 Usage 计数。

Runtime 采用以下策略提高自然命中率，同时不把 cache 当成正确性依赖：

- system instructions、旧 messages 和 Tool schemas 使用 deterministic serialization 与稳定顺序；
- 已发送的旧 messages 只追加、不原地改写，不在稳定 prefix 中注入时间戳或随机 ID；
- Tool schema 集合发生真实变化时接受 cache boundary 改变，不为命中率隐藏 Model 必需能力；
- Compaction 生成 replacement History 后一次性安装并保持稳定；首次可能 miss，后续调用可命中新 prefix；
- 只信 Provider 返回的 hit / miss Usage，不预测命中；DeepSeek cache 是 best-effort，通常数小时到数天后清理；
- Cache 不可用时行为必须完全正确，只允许成本与延迟不同。

Chat 顶栏提供类似 VS Code 的展示：

- 圆环：`Current context 62k / 1M · 6.2%`；
- 圆环 tooltip：current、theoretical remaining、requested max output、source；
- `Session usage`：累计 input / output / total tokens；不单独占用Composer指标位，悬停或键盘聚焦Context入口时显示详情；
- `Cache hit 95.7%`：显示最近完成 Model Call 的 hit Rate；tooltip 显示 `22k hit · 1k miss · 23k reported`；
- 点击后按 Turn / Model Call 展示 Model、Usage、cache 和时间。

Usage detail 同时提供两个层级：

- Model Call：`Hit 22,000 · 95.7%`、`Miss 1,000 · 4.3%`；
- Session：`Hit 120,000 · 80.0%`、`Miss 30,000 · 20.0%`、`Coverage 150,000 / 160,000 · 93.8%`；
- DeepSeek 未返回 cache split 或其他 Provider 不支持时显示 `Cache metrics unavailable`，不把全部 input 推断成 miss。
