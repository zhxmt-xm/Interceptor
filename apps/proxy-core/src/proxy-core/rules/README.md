# rules

**规则引擎。** 把已编译的规则集应用到单条 Exchange 的请求/响应阶段，产出可挂到 Mockttp `beforeRequestHead` / `beforeResponseHead` 的评估结果与 RuleHit 审计。

## 主类

`RuleService`（`entry.ts`），串起 matcher 编译、action 执行与断点队列。

## 热更新不丢流量

`setRuleSet` 原子替换 `ruleSet` / `compiled` 两个引用：进行中的评估持有旧引用不受影响，新评估读新引用，**不需要 reset Mockttp server**。

matcher 基于进入时的请求上下文（context 不可变），action 累积改写可变 state。

正文替换只产出一个最终写入者：后执行的普通`body` action覆盖前者，延后执行的Breakpoint
Text/File replacement再覆盖普通Rule。`RuleBodyEffect`只记录`ruleId`、request/response阶段与
`text | file`来源；文件读取失败、Continue unmodified和header-only编辑都不制造effect。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `RuleService`：规则集持有、编译、请求/响应评估 |
| `internal/action-executor.ts` | 执行单条 action 并累积到可变 state |
| `internal/breakpoint-queue.ts` | `BreakpointQueue`：断点挂起状态机，每条独立 timer + Promise |

## 断点

`breakpointsEnabled` 是全局 "break on match" 开关。挂起由 `BreakpointQueue` 用 Map 管理多个 pending，`breakpoint.resolve` command 解挂。HTTP Text/File编辑返回实际成功的正文来源，文件消失时保留原文；WebSocket 消息断点走独立的 `pauseWebSocketMessage`。

## 依赖

无跨模块依赖。规则集的持久化在 [`workspace/`](../workspace/README.md)，本模块只持有内存中的当前规则集。
