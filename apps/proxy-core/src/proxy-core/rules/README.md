# rules

**规则引擎。** 把已编译的规则集应用到单条 Exchange 的请求/响应阶段，产出可挂到 Mockttp `beforeRequestHead` / `beforeResponseHead` 的评估结果与 RuleHit 审计。

## 主类

`RuleService`（`entry.ts`），串起 matcher 编译、action 执行与断点队列。
`HttpInterceptionService`也复用同一实例处理协议副本，不依赖Mockttp listener；
它已装配Android v2 HTTP通道和Core命令。请求与响应求值都跟踪取消，在Continue与取消交叉时不创建后续断点。

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
| `internal/breakpoint-queue.ts` | `BreakpointQueue`：断点挂起状态机，每条独立 Promise |

## 断点

`breakpointsEnabled` 是全局 "break on match" 开关。挂起由 `BreakpointQueue` 用 Map 管理多个 pending，`breakpoint.resolve` command 解挂。HTTP Text/File编辑返回实际成功的正文来源，文件消失时保留原文；WebSocket消息走独立的`evaluateWebSocketMessage`，内部使用同一队列，不受HTTP全局开关影响。

WS决定已由`evaluateWebSocketMessage`统一实现，现有Proxy已调用。它接收完整内容副本、现有Capture身份、当前WS配置、
帧保存完成Promise及连接AbortSignal，统一完成匹配、快照和body/close编辑解释。未命中不等待存储；
命中先等frame sequence再挂起，取消立即结束等待并阻止迟到suspension，结果区分bypass、replace、
drop和aborted。hex/UTF-8编辑与快照名称归本模块；Proxy与Android HttpChannel调用同一方法，
分别执行实际转发与发送协议决定，不复制业务步骤。连接仍active时，aborted与drop都只丢弃当前消息；
连接owner的取消另行终止求值和网络，不能把一次suspension释放推断为整条连接取消。

## 依赖

无跨模块依赖。规则集的持久化在 [`workspace/`](../workspace/README.md)，本模块只持有内存中的当前规则集。
