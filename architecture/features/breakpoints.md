# Feature: Breakpoints

> 最后更新：2026-09-09
> Core 模块：`apps/proxy-core/src/proxy-core/rules/internal/breakpoint-queue.ts`
> Renderer 模块：`apps/desktop/src/renderer/features/breakpoints/`（数据层）
>       `apps/desktop/src/renderer/features/capture/BreakpointManager|BreakpointInspector/`（UI）
>
> 当前状态：断点已从独立 workspace 合并进 Capture（提交 `941e40a`）。
> 第 1–6 节描述已实现产品；第 7 节记录本阶段证据与仍未验证的差异。

## 1. 职责与边界

Breakpoints 在真实转发路径上**挂起**请求或响应，等待用户放行、编辑或丢弃。

| 归属 | 内容 |
| --- | --- |
| Breakpoints 负责 | 挂起状态机、逻辑队列、快照构造、用户编辑与批量解决 |
| Breakpoints 不负责 | 匹配判定（属于 Rules）、记录（属于 Capture） |

断点由 `breakpoint` 类型的 Rule Action 触发，因此它是 Rules 的子系统，共享 `RuleService` 的执行上下文。

**正文可见性边界（已实现）**：HTTP 断点在**头部阶段**（`beforeRequestHead` / `beforeResponseHead`）挂起，此时正文尚未到达，所以快照的 `bodyAvailable` 为 `false` 且不带 `body`。UI 因此把正文区域展示为“Replace body / 原文尚未到达”，留空即原样转发。WebSocket 消息断点持有完整 payload，`bodyAvailable` 为 `true`。**当前实现不为断点引入正文缓冲，也不制造第二份无界内存。**

## 2. 参与者

| 参与者 | 职责 |
| --- | --- |
| `RuleService` | 遇到 `breakpoint` action 时调用 `awaitBreakpoint` |
| `BreakpointQueue` | 持有 pending registry，提供 suspend/resolve/三条批量命令/list/closeAll |
| `WebSocketBridge` | WebSocket 帧转发前调用 `pauseWebSocketMessage`，覆盖 message / ping / pong / close |
| `CoreApplication` | 路由 `breakpoint.*` 命令 |
| Renderer `useBreakpoints` | 订阅 `breakpoint.pending` 变更信号，刷新列表并提交解决方案 |

## 3. 状态机

```mermaid
stateDiagram-v2
    [*] --> waiting: suspend
    waiting --> continued: resolve(continue)
    waiting --> edited: resolve(continue + edit)
    waiting --> dropped: resolve(drop)
    waiting --> aborted: 客户端断开
    waiting --> aborted: Core / RPC 生命周期关闭
    continued --> [*]
    edited --> [*]
    dropped --> [*]
    aborted --> [*]
```

**人工等待模式**：产品没有 Breakpoint timeout。pending 只由用户 Continue / Forward edited / Drop、
客户端 abort 或 Core / RPC 生命周期关闭释放。HTTP客户端断开时Proxy按Mockttp request ID只解除对应
suspension；WebSocket异常断开时解除该连接`ws:<exchangeId>`队列的全部pending，已收到的graceful close
frame仍保留给用户编辑。`closeAll()` 将当前进程的全部等待结果结算为 `aborted`。Rules、
WebSocket setup、Protocol、导入校验与MCP工具均不包含 timeout 字段，也不存在旧格式识别或迁移路径。

## 4. 调用流程

### 4.1 请求断点

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Engine as RuleService
    participant Queue as BreakpointQueue
    participant App as CoreApplication
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: 请求
    Note over Mockttp: beforeRequestHead 只有请求头
    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Engine: evaluateRequest

    Engine->>Engine: 命中 breakpoint action
    alt 全局开关关闭
        Engine-->>Engine: 直接 continued，不挂起
    else 开关开启
        Engine->>Queue: suspend('request', 'http', ruleId, snapshot, requestId)
        Queue-->>Engine: { id, outcome: Promise }

        Queue-->>UI: breakpoint.pending 变更信号
        UI->>App: breakpoint.list
        App->>Queue: list()
        Queue-->>App: PendingBreakpointInfo[]
        App-->>UI: 快照 + enabled

        UI->>App: breakpoint.resolve(id, action, edit?)
        App->>Queue: resolve(id, outcome)
        Queue-->>Engine: BreakpointOutcome
    end

    alt edited
        Engine->>Engine: applyRequestEdit(state, edit)
    else dropped
        Engine-->>Proxy: block close
    end

    Engine-->>Proxy: RequestEvaluation
    Proxy->>Origin: 转发或阻断
```

RuleService 先按 priority / action 声明顺序完成全部非-breakpoint action，再以最终 mutable state 构造
暂停快照；`respond` / `block` 已短路的流量不会进入断点。多个 breakpoint 按其原 encounter 顺序执行。
因此用户看到的是准备转发的最终 request / response，Forward edited 后也没有后续 Rule 再覆盖草稿。
最终仍存在且由普通 Rule `set` / `append` 的 header 行随 snapshot 携带 `ruleEffect` / `ruleId`，暂停编辑器
使用与普通 Inspector 相同的 marker 语义；replace / remove 的旧值不放回可编辑表单，避免放行时复活。

`Execute edited` 只为 `BreakpointEdit.editedHeaderNames` 中用户显式改过的字段生成
`RuleHeaderEffect`，并绑定当前 breakpoint rule 的 `ruleId`；完整最终 headers 只是转发结果，不能据此把
未触碰字段误报为 effect。replace / add / remove 沿用 Rules 的 Header effect 语义，body-only 编辑不生成
header marker；重复同名值只标实际变化的实例。

Body replacement使用[Rules Body effect](rules.md#73-body-effect-已实现)的同一最终写入者模型：`edit.body`生成`source:'text'`，`edit.bodyFilePath`生成`source:'file'`，effect绑定承载当前breakpoint action的ruleId。Request保留入站Original并另存Final；Response只保存Final并明确Original unavailable。Off或只编辑header时不制造body effect。

File模式未选文件时按现有设计显示112px最小高度的居中容器和32px高的Upload按钮，按钮不横向拉满；文字11.5px、`--text-2`。未选文件保留带警告图标的Using original状态，分组折叠图标为13px，不撑高标题。选中文件仍使用既有预览卡，不改Open Dialog、正文或转发行为。该样式差异由真实文件替换流程和Request/Response明暗parity验证。

断点面板局部使用设计同样的normal行高；Header行内部间距6px，行组与Add header之间8px，页脚三个按钮均使用9px横向内边距。上述还原不改变空Text语义：当前`replacesBody()`在原文已知时允许空字符串作为显式替换，设计的Using original标签尚未表达此区别；该语义差异需另行确认，不为消除parity missing改业务或基准。

2026-09-10用户确认并完成验收的Header effect布局：保留现有输入框，name/value两列在所有行保持等宽；`Rule set`/`Rule appended`位于对应value输入框下方2px，右边缘对齐，字号9px、行高12px，无标签边框或底色。普通行30px、行间距6px不变，只有带effect的行增加14px。字段、effect语义、增删和放行命令不变；普通Inspector的Header marker和WebSocket握手设计不随本次改变，证据见[Header effect布局](#74-header-effect下置布局)。

2026-08-20 TDD证据：最终`breakpoints.execute-edited`源码在`89d8dda`仅回植后续公开automation ID与driver helper后，暂停快照精确缺失priority更晚的`x-e2e-before-breakpoint`，Execute edited后的Capture也缺少绑定breakpoint ruleId的`set x-edit-stage` marker；当前同一workflow`1/1` Green。Red/Green metadata分别记录Main/Core PID `31404/3812`与`46424/29380`，均`gracefulDestroyVerified=true`且8888释放、系统代理恢复。该证据只闭环final Rule state与header effect；HTTP framing矩阵仍由[HTTP消息编辑](http-message-editing.md)单独验收。

### 4.2 响应断点

流程相同，区别在于：

- 触发点是 `beforeResponseHead`，只持有 statusCode 与 response headers，正文尚不可见。
- 快照来自 `buildResponseSnapshot(ruleName, context.request, state)`，除 status / response headers 外保留同一请求的 method / URL，当前 `bodyAvailable=false`。
- `dropped` 返回 `block close`，客户端收到连接关闭。

### 4.3 WebSocket 帧断点

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Engine as RuleService
    participant Queue as BreakpointQueue
    participant Origin

    Client->>Bridge: 应用消息 / ping / pong / close
    Bridge->>Proxy: interceptWebSocketMessage
    alt 未启用或不在配置内
        Proxy->>Proxy: 异步写入Capture frame
        Proxy-->>Bridge: forward 原样
    else 方向与帧类别都命中
        opt 应用message
            Proxy->>Proxy: 写入Capture并取得frame sequence
        end
        Proxy->>Engine: pauseWebSocketMessage(snapshot)
        Engine->>Queue: suspend('websocket', ws:exchangeId, undefined, snapshot)
        Queue-->>Engine: outcome
        alt dropped
            Proxy-->>Bridge: drop
        else edited
            Note over Proxy: binary 用 hex 解析<br/>text 用 utf8<br/>close 另带 closeCode
            Proxy-->>Bridge: forward 编辑后内容
        else continued
            Proxy-->>Bridge: forward 原内容
        end
    end
    Bridge->>Origin: 转发、丢弃或关闭
```

WebSocket 断点是**当前连接的临时开关**，与 HTTP 的 break-on-match 正交：`pauseWebSocketMessage`
不再检查 `breakpointsEnabled`，开关完全归 `ProxyService.webSocketBreakpointSettings`。
配置里的 `exchangeId` 把断点锁在发起它的那条连接上，UI 说的 “Pause messages on this connection”
就是字面意思；其他连接的帧不受影响，`websocket.frames` 也只在 exchangeId 匹配时才报告该配置。
启用必须给出完整配置（`exchangeId` / `direction` / `frames`），因此不存在“开了但不知道拦什么”的中间态。
ping / pong / close 与应用消息走同一条方向内串行链，断点 await 不会打乱到达顺序。

Renderer 不把 WebSocket pause 替换成另一套全屏 Inspector。pending 到达后自动切到该连接的 Messages tab，
保留已转发帧并为每个 pending 追加 head / queued row；只有队首下方挂载 Original / Replacement message
编辑器。应用消息在挂起前先写入 Capture 并把 `webSocketFrameSequence` 带入 snapshot，pending row 暂时代替
该 sequence 的历史行；解除后 pending 消失，历史行自然恢复，因此同一帧不会重复显示。Original 直接消费
snapshot 的 text / hex 字节并复用 `BodyViewer`，Replacement 默认 Off，设置摘要来自同一连接的
`WebSocketBreakpointSettings`，不会把 Core 的帧类别 `ruleName` 冒充成方向。

## 5. 当前感知方式

请求在 Core 侧 `await` 挂起；队列集合变化复用既有 event-batch 发出 `breakpoint.pending` 信号，App 级
`useBreakpoints` 收到后调用 `breakpoint.list` 刷新。它不传大快照、不建第二条推送通道，也不依赖
Capture 页面是否挂载。Core 重启时先清空本地 pending，恢复 running 后重新拉取。Pending count只显示在
Capture workbar的Breakpoint入口；所有feature的Sidebar导航均不显示业务badge。

Core 使用一个全局 registry，每项都有逻辑 `queueKey`：HTTP request / response / WebSocket
Upgrade 使用 `http`，每条 WebSocket 连接使用 `ws:<exchangeId>`。registry 的 Map 插入顺序就是
pending / request 到达顺序；每个逻辑队列只按 `queueKey` 过滤并保留该顺序，不按wall clock或ID重排。
队首是默认编辑目标，不是 Core FIFO 锁；非队首按 ID 仍可被批量命令解除。

Capture selection 是唯一可见选择。只有选中项是其逻辑队列队首时才挂载编辑器；非队首显示普通 Detail
与 `Queued`。单项或批量命令完成后，Renderer 只拉取一次最新 snapshot：用户仍停留在已解决队首时才推进到
同一 `queueKey` 的新队首；用户已查看普通流量或其他队列时不抢焦点。草稿由 Renderer 以 `breakpointId`
独立保存在内存中，切换 selection 后可恢复，pending 消失、abort、resolve 或 Core 换代时精确删除。

## 6. 数据契约

```ts
interface BreakpointSnapshot {
  ruleName: string;
  /** 挂起流量所属的 Capture Exchange；未 Recording 时缺省。 */
  exchangeId?: string;
    /** HTTP request / response 快照都保留所属请求身份。 */
  method?: string;
  url?: string;
  statusCode?: number;
  direction?: 'client-to-server' | 'server-to-client';   // WebSocket
  frame?: 'message' | 'ping' | 'pong' | 'close';         // WebSocket
    webSocketFrameSequence?: number;                        // 已写入Capture的应用帧
  opcode?: 1 | 2;                                        // 仅 message 帧
  bodyFormat: 'text' | 'hex';
  headers: readonly RuleHeaderPair[];
  /** 挂起时是否能看到原始正文；HTTP 头部阶段断点为 false。 */
  bodyAvailable: boolean;
  body?: string;
  /** 仅 close 帧：对端给出的 close code。 */
  closeCode?: number;
}

interface WebSocketBreakpointSettings {
  /** 断点只作用于这条连接的 Capture Exchange。 */
  exchangeId: string;
  direction: 'both' | 'client-to-server' | 'server-to-client';
  frames: readonly ('message' | 'ping' | 'pong' | 'close')[];
}

interface RuleBreakpointAction {
    type: 'breakpoint';
    phase: 'request' | 'response';
}

interface BreakpointOutcome {
    state: 'continued' | 'edited' | 'dropped' | 'aborted';
  edit?: BreakpointEdit;
}
```

`exchangeId` 由 `ExchangeTracker.exchangeIdFor` 提供：规则钩子可能先于 `request-initiated` 到达，
因此**首次询问就预留** ID 给 `beginRequest` 复用，保证挂起的断点与随后出现的 Capture 行是同一个。

命令：

| 命令 | 用途 |
| --- | --- |
| `breakpoint.list` | 返回等待中快照与全局开关 |
| `breakpoint.resolve` | continue / drop，可携带编辑 |
| `breakpoint.continueQueue` | 原样放行命令开始时指定 `queueKey` 的全部 pending，返回 `resolvedCount` |
| `breakpoint.dropQueue` | 丢弃命令开始时指定 `queueKey` 的全部 pending，返回 `resolvedCount` |
| `breakpoint.continueRule` | 原样放行命令开始时指定 `ruleId` 的全部 pending，返回 `resolvedCount` |
| `breakpoint.configure` | 设置 HTTP 断点全局开关 |
| `websocket.breakpoint.enable` | 用完整配置启用 WebSocket 帧断点 |
| `websocket.breakpoint.disable` | 停用 WebSocket 帧断点 |

### 6.1 Agent / MCP Tool入口 [已实现]

共享registry已定义`breakpoints_list`、HTTP启停、WebSocket启停以及单项Continue、Forward edited、Drop八项。
Tool不拥有第二套queue：所有执行仍进入上表正式Core命令，Renderer与Agent/MCP看到同一pending集合。

- `breakpointId`只标识当前Core pending；客户端abort、其他入口resolve或Core重启后即stale。审批前已知stale返回
    参数错误，描述后才失效的执行竞态返回Core `conflict`；两者都不得按列表位置改动另一个pending。
- Ask摘要先读取目标pending，只展示phase、queue、URL/frame等必要影响，不回传完整敏感正文；Allow/Auto执行时
    Core再次按ID判定。
- `breakpoints_forward_edited`按pending phase收窄字段：request只接受method、URL和文本body；response只接受status和
    文本body；WebSocket只接受文本body。跨phase字段在审批和执行前均拒绝；不接受headers、文件路径或close code。
- HTTP与WebSocket pending都必须由正式UI配置和真实客户端流量产生。Tool测试不得直接构造queue成员。
- Agent/MCP开关只决定Tool是否可发现/调用，不改变产品HTTP全局开关或当前WebSocket连接配置。

### 6.2 Agent / MCP批量Tool契约（已实现）

`breakpoints_continue_queue`、`breakpoints_drop_queue`分别接受严格的`queueKey`，
`breakpoints_continue_rule`只接受`ruleId`，各自复用同名正式Core命令，不合并用户意图。
`queueKey`沿用`http`或`ws:<exchangeId>`，Rule身份来自真实Rules/待处理快照；不接受列表位置、
任意目标数组、编辑正文或文件路径。

- 三项均为change，共用Agent/MCP独立授权及Ask/Auto。Drop明确声明丢弃后果；Deny、预取消或撤权不触达
    mutation命令。取消信号原样进入Core RPC，不新增Tool专用队列。
- 审批前读取`breakpoint.list`并只披露目标键及当前匹配数量，不把URL、Header、正文或Token写入影响摘要。
    审批数量是当时的说明，不锁定成员；执行复用Core在命令开始时取得的成员快照，返回实际`resolvedCount`。
- queue命令只作用于同一逻辑队列；rule命令只作用于相同Rule身份，不解除其他Rule或WebSocket队列。
    目标已清空/客户端中止时返回0，不能按旧列表位置误操作其他目标。重复执行仍遵循同一正式空目标语义。
- Transcript结果复用已有本地化“已放行/已丢弃”并显示实际数量（包括0），不退回原始JSON；公共摘要状态和
    数量属性允许真实workflow在当前语言下验证结果，设计稿与Renderer使用相同紧凑布局。
- Continue原样转发，Drop丢弃原目标，不隐式采用Renderer未提交草稿。新来的pending及其他队列保持自身状态；
    Renderer通过既有`breakpoint.pending`刷新，不为Agent/MCP新增同步通道。
- WebSocket继续只保存一份当前活动配置；验证多队列时先在连接A挂起帧，再通过正式UI切到连接B并挂起帧。
    旧pending保持等待，由目标批量命令解除；不为测试新增多配置能力或后门。
- 先取得最小executor缺失Tool Red和`breakpoints.tools.batch`真实Electron discovery Red，再接入实现并复跑
    同组Green。真实流程用产品UI建立两条HTTP Rule和两条独立WebSocket连接，核实数量、数据面、Ask/Auto、
    空目标、独立撤权、重启零重放、完整进程销毁及WinINet/journal恢复。不能由测试直接seed队列。

2026-09-06：executor23项缺失Tool Red、真实discovery Red→Green；摘要另经unit与真实`value` Red后Green。
六条关联真实流程、11个Main/Core代际均正常销毁并恢复8888/WinINet/journal；批量本身两代
`42592/42636`、`25756/42356`，原始HTTP/body与WebSocket队列隔离、Deny/Allow/Auto、0数量和两列撤权/
重启零重放通过，详细证据与中间测试失败归因见[Breakpoints规格](../../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-tools-batch)。
全workspace类型、Desktop579/579、Tools215/215、MCP32/32、Runtime122/122、Protocol25/25、Playground67/67
与设计交互81/81通过；Core329/331仅两项既有framing债务。新增12视图72/72、0 missing/flagged、最大0.5px；
完整parity280视图/1,920目标/1,888匹配/32缺失/335 flagged保留既有界面波动，不算全绿。离线package、
artifact audit（1,294 files / 392,889,491 bytes）、production audit0漏洞及smoke1/1通过。

真实Electron验收分别由`agent.tools.breakpoints`与复用Streamable HTTP transport的`mcp.tools.breakpoints`承担。
两者均从Rules UI和真实客户端自产pending；Agent覆盖WebSocket连接隔离、Continue/Edit/Drop/Disable与重启零重放，
MCP覆盖官方Client Ask/Auto、URL编辑、即时撤权、Client断开和credential轮换不解队。修复前`32f2889a`分别Red于
Agent discovery为空、MCP stale错误进入审批；当前联合Green并完整释放Main/Core/MCP/8888和系统代理。

历史 request 右键菜单中，Breakpoint submenu 与 Block 同属于 Control group，并使用同一 icon / label
起点；submenu 箭头与 hover 展开仍由 Ant Menu 原生管理。不能把 Breakpoint 作为 group 外的顶层 item，
否则 Ant 的 group child 与 submenu title 两套 DOM 会产生不同水平缩进。

2026-08-20 TDD证据：专用`capture.breakpoint-menu-hierarchy`最终源码在`89d8dda`仅回植真实Recording与driver helper后，Block/Breakpoint语义label左缘差`7.43621826171875px`取得精确Red；当前同一workflow差值为0并成功hover打开endpoint二级项。Red/Green Main/Core PID分别为`21056/39980`与`21380/20632`，两边`gracefulDestroyVerified=true`且8888释放、系统代理恢复。该证据只验收DOM层级与对齐，不代替独立submenu lifecycle验收。

独立submenu lifecycle契约验证同一Ant Menu树的运行期行为：根菜单与二级菜单必须同时挂载；hover离开二级后只关闭二级；右边界空间不足时二级向左翻转；Escape与outside click销毁整棵菜单。历史边界为`32867ff^`的`menuPage: 'root' | 'breakpoint'`换页实现，hover不能打开Breakpoint页，点击后根菜单会被第二页替换；`32867ff`迁移到Ant `items[].children`后才具备父子菜单共存语义。

2026-08-21 TDD证据：最终`capture.breakpoint-submenu-lifecycle`在`e5ca501`仅回植automation探针后精确Red于hover不产生submenu；当前`1/1` Green。右边界trigger与endpoint横坐标分别为`1030`与`628.126`，二级菜单向左翻转；父子共存、hover close/reopen、Escape与outside click均通过。Red/Green Main/Core PID为`21308/28948`与`46880/33620`，两边`gracefulDestroyVerified=true`且8888、系统代理与profile均恢复。

pending registry不设隐藏上限。每次命中都由`suspend`创建等待项，不会因全局数量自动放行；用户可通过
单项命令、按逻辑队列批量处理或按Rule批量Continue显式解除。大量断点可能占满站点连接，这是用户启用
人工断点后的可见结果，产品不能用静默放行改变规则语义。

## 7. 逻辑队列阶段证据与剩余差异

结构、感知、关联、逻辑队列、批量命令、独立草稿、HTTP Original / Replacement body 与
当前连接临时 WebSocket 断点均已实现。真实未验证项仍为：

- HTTP `Execute edited` 后的 `Content-Length`、`content-encoding`、transfer-encoding 与 H2 framing
    尚未建立 wire-level 回归；产品不能仅凭 UI 状态宣称正确。
- WebSocket 单 frame 仍会整体进入 snapshot；超大帧的预览与内存边界尚未定义。
- Binary 未编辑保真与 hex **编辑后**的字节还原均已有真实 socket 回归。

### 7.1 逻辑队列、连续调试与批量命令（已实现）

本阶段完整替换了单队列选择、单草稿与 timeout 契约，没有保留旧字段、兼容命令或迁移路径。

#### 逻辑队列与展示

- Core 继续以一个 pending registry 保存全部等待项；每个 pending 增加稳定的 `queueKey`。
- HTTP request、HTTP response 与 WebSocket upgrade 使用 `queueKey: 'http'`；WebSocket message、ping、pong、
    close 使用 <code>queueKey: `ws:${exchangeId}`</code>。不同 `queueKey` 互不阻塞；同一 WebSocket 连接的
    双向帧保留registry插入顺序。
- 同一逻辑队列只过滤`queueKey`，不重排Core snapshot。第一项是队首和默认编辑目标，但不是协议锁；Core
    仍允许按 ID Continue 或 Drop 非队首项。
- pending 始终附着在普通 Capture request / connection 行上。filter 只影响行是否可见，不改变队列成员或
    顺序。全局 badge 汇总所有逻辑队列。
- WebSocket应用帧的pending row在同一`webSocketFrameSequence`位置替代历史行，不统一追加到列表尾部；
    Sent / Received筛选同时约束历史帧与pending row，但`data-queue-position`仍表达未筛选逻辑队列的位置。
- 只有选中的 pending 是其逻辑队列当前队首时才显示可编辑 Breakpoint Detail。非队首 pending 使用普通
    Request / connection Detail，并以 `Queued` 表达等待前序断点，而不是复用网络 `loading`。

#### 选择、推进与 abort

- Capture selection 是唯一可见选择；不再维护会与 Capture 行分离的隐藏 breakpoint selection。
- Continue unmodified、Forward edited 或 Drop 完成后，Renderer 必须先取得 Core 最新 pending snapshot，
    再计算原 `queueKey` 的新队首，不得使用旧数组下标。
- 若用户仍选中刚处理的队首 exchange，自动选择同一逻辑队列的新队首；若用户已切换到普通 request、
    非队首 pending 或其他逻辑队列，不得抢焦点。
- HTTP客户端abort只移除对应request pending与草稿；WebSocket异常断开移除该连接的全部pending与草稿。
    Capture行保留并进入普通`aborted` / `failed`终态。中间项消失后，后续推进同样基于最新snapshot。
- 按 ID resolve 非队首只移除目标，不改变当前队首。非队首没有编辑器，因此不能产生 edited payload。

#### 草稿生命周期

- Renderer 以 `breakpointId` 保存独立草稿。同一 HTTP exchange 的 request / response，以及同一 WebSocket
    连接的不同帧不得共享草稿。
- 切换 Capture selection 时保留草稿；重新选中同一 pending 时恢复。只有 Forward edited 应用草稿，
    Continue unmodified 明确忽略草稿。
- Continue、Forward edited、Drop、abort、pending 从最新 snapshot 消失或 Core 换代时删除对应草稿。
    草稿只存在于 Renderer 内存，不写入 Capture 数据、Rules 配置或 workspace storage。

#### 命令契约

保留 `breakpoint.resolve` 处理单项 Continue / Forward edited / Drop；新增三条用户意图单一的命令：

| 命令 | 作用域 | 语义 |
| --- | --- | --- |
| `breakpoint.continueQueue` | 显式 `queueKey` | Continue 调用开始时该逻辑队列中已存在的全部 pending |
| `breakpoint.dropQueue` | 显式 `queueKey` | Drop 调用开始时该逻辑队列中已存在的全部 pending |
| `breakpoint.continueRule` | 显式 `ruleId` | Continue 调用开始时所有逻辑队列中属于该 Rule 的 pending |

- 三条命令必须分别贯穿 Protocol、Core、Main、Preload 与 Renderer；不得以布尔参数、空 ID、可选字段或魔法值
    合并语义。
- Core 在命令开始时固定目标 `breakpointId` 快照。执行期间新进入的 pending 不属于本次操作，避免命令持续
    吸收新命中。
- 目标在执行前已经消失视为未解决，不使整条命令失败。结果返回 `resolvedCount`，Renderer 完成后统一拉取
    最新 snapshot，并分别推进所有受影响逻辑队列。
- 批量 Continue 一律原样放行，不读取或复制任一 Renderer 草稿；批量 Drop 一律丢弃目标。批量命令不提供
    edited 变体。

#### 已删除 timeout

- 删除 HTTP Rule breakpoint 与 WebSocket breakpoint 的 finite / infinite timeout 产品能力，包括协议字段、
    Core timer / `onTimeout`、Rules 与 WebSocket UI、导入专判、i18n、MCP参数和既有 timeout 设计场景。
- pending 只由用户 Continue / Forward edited / Drop、客户端 abort 或 Core / RPC 生命周期
    关闭释放。生命周期关闭返回明确的 `aborted`，不得继续制造 `timed_out` 或 timeout policy。
- pending registry不设数量上限，不存在`autoContinued`协议状态、queue-full诊断或对应UI。逻辑分组不能绕过
    客户端 abort 或`closeAll()`清理。

#### TDD 与验收证据

- Unit：Protocol command/result、`BreakpointQueue` 排序/非队首 resolve/批量调用开始快照、Renderer 多草稿、
    最新 snapshot 推进与精确 WebSocket frame sequence 均先取得目标缺口 Red，再实现 Green。
- Integration：真实 Proxy 锁定 HTTP `queueKey/ruleId`、WebSocket pending sequence 与 Capture sequence 一致；
    Capture/Archive frame 回归保持 Green。
- E2E：`queue-stepping`、`queue-isolation`、`queue-commands` 与 `lifecycle-release` 经过真实
    Renderer → Preload → Main → Core → Proxy → client/origin，覆盖中间 abort、不抢焦点、独立草稿、HTTP/WS
    隔离、三条批量命令、调用开始快照和生命周期关闭。
- Design/Parity：design-vite 先定稿 head / Queued / 批量菜单 / 无 timeout；视觉几何只由 design interaction
    与 visual parity 验证，不混入业务 E2E。

2026-08-25阶段证据：最终四条workflow源码在修复前`d854588`分别取得有效retrospective Red：
`queue-stepping`与`queue-commands`已经通过真实Rules UI形成paused请求，但Capture行没有`data-queue-*`；
`queue-isolation`的HTTP已真实pending但缺`queueKey`；`lifecycle-release`在真实WebSocket setup中仍找到1个
timeout控件。Red Main/Core PID依次为`34028/1940`、`32556/29092`、`31380/12648`、`14964/31472`，
四组`gracefulDestroyVerified=true`。当前同一组workflow合并`4/4` Green；Green Main/Core PID依次为
`24768/21248`、`30096/30308`、`18196/12256`、`36720/2084`，四组同样
`gracefulDestroyVerified=true`且8888释放。

2026-08-25无上限补充TDD：`BreakpointQueue`先以25条连续命中在第11条返回`null`取得精确Red；删除
`BREAKPOINT_QUEUE_LIMIT`、nullable suspension和queue-full状态后，同一测试25条全部pending并保持插入顺序。
MCP无timeout调用先Red于未发出Core命令，删除工具schema、解析和payload字段后Green；MCP全量`46/46`
与typecheck通过。最终全仓门禁与最新parity数字见`architecture/HANDOVER.md`。

### 7.2 文件替换空态视觉修复

- 原空文件按钮被纵向flex拉满，parity宽度差302.1px，按钮高度34px且字号/颜色不符；产品还缺少File为空时的警告图标，Using original文字横向错位14px。Replacement分组的30px折叠按钮另使标题比设计多2px。
- 现仅在`BreakpointInspector`补空文件容器与共享Button的局部样式，图标使用Upload；File和Text为空时按既有设计显示10px警告图标，13px折叠控件不再撑高标题。没有调整位移抵消差异，没有改设计稿、原始PNG、文件API或网络转发。
- 前置真实UI和302px parity Red归档为TEMP下`interceptor-breakpoint-file-presentation-red-20260909-210935.zip`，SHA256 `3440F775BAF9B408DAF9FE6F1C9E1BE6589AFF680C51B0DAC3828EAB42074086`，Main/Core `17452/22284`正常退出。
- 最终Request/Response x light/dark四个空文件视图共12个区域目标（标题、Using original、Choose file）全部matched，最大0.6px、无字号/颜色差；22个HTTP视图为240 matched、2 missing、94 flagged，剩余集中在暂停标题、Headers及页脚，不把局部修复写成整组全绿。
- 断点编辑/Store unit19/19、Desktop typecheck通过；真实`rules.body-effect-evidence`1/1（26.2s）验证112px容器、32px按钮、真实Save/Open、File替换的转发与Capture证据，Main/Core `31924/17444`正常退出，8888、WinINet/journal恢复。
- 最终trace/metadata、完整区域截图和22视图parity归档`interceptor-breakpoint-file-final-green-20260909-211705.zip`，SHA256 `4FCC1E36F4ACED2F34DC6AD6AAEAE599DF55948C7BD658D0DB905FCD10FE5A6B`。未修改原生Dialog驱动或新增测试工具测试。

### 7.3 标题与页脚还原

- 标题、Header行组与页脚排版的本项验收通过。2026-09-09曾暂停E2E，随后用户恢复授权；2026-09-10真实Save/Open文件替换Green，设计字体恢复后相关22视图复核通过。空Text标签语义单列待确认，不作为本项排版变更，也不把本次结果写成整仓parity全绿。
- 产品只改`BreakpointInspector`排版：面板使用局部normal行高；Header行内部6px gap，行组与Add header之间仍为8px；移除主按钮额外横向内边距，页脚三个按钮统一9px，Drop使用设计已有的CircleSlash。Header字段、文件选择、解决命令与Core数据面均不变。
- 暂停前22个HTTP断点视图240 matched、0 flagged，最大几何差0.8px，全部22视图有像素比较；2个missing均为response Text的Using original标签，不是Replacement textarea缺失。设计和产品的textarea均为420x94px；产品原文已知时允许空Text替换，设计未区分这一语义，另行确认，不通过修改产品或配对标签掩盖。
- 未改设计源码。22张HTTP断点PNG原先不存在，本轮使用既有截图脚本补生成；原有362张PNG逐张SHA256保持不变，清单为TEMP下`interceptor-breakpoint-existing-shots-20260909.json`。parity结果为`interceptor-breakpoint-chrome-{237,242,247,252,257}.json`及同名`.md`，日志为`interceptor-breakpoint-chrome-matrix-20260909.log`。
- 断点Store/编辑unit19/19和Desktop typecheck已通过，日志`interceptor-breakpoint-chrome-checks-20260909.log`。最终真实`rules.body-effect-evidence`在原生文件窗口文件名控件获取前台焦点时失败，不是布局或数据断言Red；Main/Core `46384/40556`虽为`gracefulDestroyVerified=true`，仍不能算该workflow通过，日志为`interceptor-breakpoint-chrome-e2e-20260909.log`。
- 用户禁止E2E后，本轮只运行unit19/19及Desktop typecheck，日志`interceptor-breakpoint-no-e2e-checks-20260909-215929.log`；仅读回暂停前的22视图parity与362张原图hash，未运行浏览器或E2E。进度归档`interceptor-breakpoint-chrome-pending-e2e-20260909-220030.zip`，SHA256 `4A619F1D64B0A7A7B56224DDA25501BE7E479FB0EAD35DDBA8DFBE9FC9C7F976`，清单明确标记`code-complete-pending-e2e`并保存4份相关源码hash。
- 恢复后独占前台执行时，两轮原生文件名框在WScript粘贴后仍为空；辅助改为Win32 `SendInput`真实Ctrl+A/Ctrl+V，核对焦点字段HWND、保持置顶至finally、确认字段真实值后恢复剪贴板。不直接设置字段值、改写Dialog返回值或新增设施测试。
- 最终同一`rules.body-effect-evidence`1/1（27.2s总运行）、unit19/19及Desktop typecheck通过，Main/Core `24060/48540`正常退出，host guard确认8888、WinINet/journal及登记进程恢复。TEMP归档`interceptor-breakpoint-chrome-native-green-20260910-001235.zip`，SHA256 `130C9FF733352048E1363069450FC0AD862677D30E3D2431C008997E06708A76`，包含trace、两轮辅助失败、Green/类型日志及四份源码hash。
- 2026-09-10网络恢复后，22个视图逐一确认设计Inter/JetBrains Mono静态FontFace为loaded，再执行parity；240 matched、0 flagged、最大0.8px，2个missing仍仅为Response空Text的Using original标签。已查看明暗代表截图，原有362张PNG逐张hash不变，此前新增22张缺失断点PNG没有重绘；设计源码、配对目标和仓库报告未改。
- 最终字体验证日志、22视图JSON/Markdown、Renderer/diff截图及产品/新增PNG的hash归档为TEMP下`interceptor-breakpoint-chrome-font-verified-20260910-132342.zip`，SHA256 `929F4F85EF2A3BF0BD56DFDF02F8379AEE05DB34112AEFABF2CAF2CE2082A42A`；四份源码hash与上述真实E2E Green一致，复用unit19/19和Desktop typecheck，不重复运行无变化的原生流程。

### 7.4 Header effect下置布局

- 2026-09-10用户已查看并确认下置、靠右、紧贴输入框的小字方案；正式设计与Renderer使用2px间距、9px字号和12px行高。所有行输入框等宽，无effect行不保留说明空行；不改变规则执行、Header数据或Forward edited/Continue行为。
- 前置断点编辑/Store单测19/19 Green。真实`rules.body-effect-evidence keeps breakpoint header effects aligned`先在旧产品CSS取得Red：有effect行的name/value分别窄约21/30px，marker仍在右侧且为9.5px/18px；两阶段编辑、增删和规则结果断言正常。有效Red为TEMP下`interceptor-header-effect-e2e-valid-red-20260910-174123`，Main/Core `35408/15892`正常退出且宿主guard恢复。
- 初次测试误用简化客户端返回值、首次Green尝试严格比较0.00009px浮点偏差、Desktop typecheck缺少draft元数据的记录均保留；修正后重新执行，不将这些测试代码问题当产品Red。最终typecheck（Desktop/design）通过，owner单测19/19 Green。
- 最终同一文件两条真实E2E为2/2 Green（38.0s），覆盖原有Text/File、原生Save/Open与新增request set/response append的下置布局、input编辑与增删。Main/Core两代`5928/30284`、`27632/35448`均正常退出；fixture完成`verifyRestored()`，登记PID全退、8888释放、WinINet恢复`127.0.0.1:7890`，无journal恢复错误。
- 26个相关parity视图为296 matched、0 flagged、最大0.8px；2个missing仍是已登记的Response空Text `Using original`，本项不改变其语义。平均pixel diff 2.5793%，保留列表数据等既有差异，不宣称整页或整仓parity全绿。
- 更新22张受影响HTTP设计PNG，新增4张此前缺失的队首/菜单基准，其余366张PNG逐张hash不变。设计共享Header编辑器的`effectPlacement="below"`只由HTTP调用，WebSocket握手继续inline；直接预览已核对其明暗布局未变。
- TEMP归档`interceptor-header-effect-verified-20260910-1811.zip`，SHA256 `3C5A8AC9FE5FE8406B2AAE34B7B4B5E9F1FDDF9FA75D03A7783024927516E5DF`，保存有效Red、最终E2E/trace/metadata、26视图报告与截图、改前设计图、失败记录、类型/单测日志及6份相关源码hash。

## 8. 验收要点

- [x] 快照如实告知正文是否可见，不把空输入框冒充原文；只改 header 放行不会抹掉真实正文。
- [x] 独立 Breakpoints 导航删除；在任意 workspace 命中时用户立即可感知。
- [x] paused exchange 在 Capture 原行编辑，Continue 后选择节奏明确。
- [x] manager 可查看/启停规则并精确跳到 Rules；历史 request 快捷创建后给出可撤销反馈。
- [x] Original/Replacement 在 Request/Response 对称，Text/File 空态不会误覆盖原文。
- [ ] 大正文断点有明确的预览上限与提示，不 OOM。
- [x] Binary 消息可用 hex 编辑并正确还原。
- [x] HTTP / WebSocket 没有 timeout 产品能力，等待只由用户、客户端或生命周期释放。
- [x] 客户端 abort 时立即释放对应断点，不影响其他等待请求。
- [x] pending registry 无隐藏数量上限，每次命中都保持等待直到显式或生命周期释放。
- [x] RPC 断开时全部等待被释放，不泄漏挂起请求。
- [ ] Execute edited 后 content-length 与 encoding 一致。
- [x] HTTP 与每条 WebSocket 连接按独立 `queueKey` 推进，互不阻塞。
- [x] 仅队首可编辑；非队首显示 `Queued` 普通 Detail，filter 不改变队列。
- [x] 单项处理按最新 snapshot 推进，查看普通 request 或其他队列时不抢焦点。
- [x] 草稿按 `breakpointId` 独立保存，并在 resolve / abort / 消失 / Core 换代后精确清理。
- [x] `Continue all`、`Drop all` 与 `Continue all from this rule` 分别走独立命令并只处理调用开始快照。
- [x] HTTP / WebSocket timeout 产品能力及 `timed_out` 结果全部删除，生命周期释放使用 `aborted`。
