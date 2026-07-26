# Feature: Capture

> 最后更新：2026-07-26
> Core 模块：`apps/proxy-core/src/proxy-core/proxy/`、`apps/proxy-core/src/proxy-core/storage/`
> Renderer 模块：`apps/desktop/src/renderer/features/capture/`

## 1. 职责与边界

Capture 负责**观察并记录**经过代理的全部流量事实，不参与转发决策。

| 归属 | 内容 |
| --- | --- |
| Capture 负责 | Exchange 生命周期、正文落盘、WebSocket 帧、CONNECT 隧道元数据、事件推送 |
| Capture 不负责 | 转发、改写、阻断、断点挂起（属于 Rules） |

**核心原则 [已实现]**

> 收到 request headers 的瞬间就创建 Exchange、写入存储、推送 Renderer。此后的 request body、Rule 效果、response headers、response body、trailer、abort 全部是对**同一个 Exchange** 的增量更新。

Capture 绝不等待请求或响应完成才建立记录。实现位于 `proxy/proxy-exchange-tracker.ts` 的 `ExchangeTracker`。

## 2. 参与者

| 参与者 | 归属 | 职责 |
| --- | --- | --- |
| Client | 外部 | 浏览器或应用，经系统代理指向 `127.0.0.1:8888` |
| Mockttp | Core 内库 | 接入连接、TLS/H2 协商、上游转发、生命周期事件 |
| `ProxyService` | `proxy/entry.ts` | 拥有 Mockttp server，订阅事件，协调规则与存储 |
| `RuleEngine` | `rules/entry.ts` | 计算规则决策（详见 feature-rules） |
| `StorageService` | `storage/entry.ts` | Exchange 记录、正文内容寻址存储 |
| `CaptureEventQueue` | `proxy/proxy-capture-event-queue.ts` | 按 Exchange 合并的非阻塞事件队列 |
| `CoreApplication` | `core-application.ts` | 定时 drain 队列，按背压窗口推送 |
| Main | Desktop | 转发 event batch，不持有正文 |
| Renderer | Desktop | 应用事件到 Zustand，按需拉详情 |
| Origin | 外部 | 真实源站 |

**ProxyService 是每个请求的唯一协调者**，因为只有它同时处在事件订阅和规则执行两条路径上。

## 3. Mockttp 事件语义

这是整个 Capture 设计的事实基础。以下均已通过阅读 `node_modules/mockttp/dist/` 源码确认。

### 3.1 事件清单

| 事件 | 载荷 | 代表 | 已被规则改写 |
| --- | --- | --- | --- |
| `request-initiated` | `InitiatedRequest` | 客户端原始请求头 | 否 |
| `request-body-data` | `BodyData` | 客户端请求体增量 | 否 |
| `request` | `CompletedRequest` | 完整请求 | 否 |
| `response-initiated` | `InitiatedResponse` | 写回客户端的响应头 | **是** |
| `response-information` | `InformationalResponse` | 1xx 中间响应 | — |
| `response-body-data` | `BodyData` | 写回客户端的响应体增量 | **是** |
| `response` | `CompletedResponse` | 完整响应 | 是 |
| `abort` | `AbortedRequest` | 请求中断 | — |
| `request-trailers` / `response-trailers` | `TrailerData` | trailer（**本仓库 patch 新增**） | 响应侧为是 |
| `rule-event` | `RuleEvent<T>` | 转发过程内部细节 | 见下 |
| `websocket-request` / `websocket-accepted` / `websocket-message-received` / `websocket-message-sent` / `websocket-close` | — | WebSocket 生命周期 | — |
| `tls-passthrough-opened` / `tls-passthrough-closed` | `TlsPassthroughEvent` | 未解密 CONNECT 隧道 | — |
| `tls-client-error` / `client-error` | — | 握手与协议错误 | — |

### 3.2 completed 事件会强制全量缓冲 [必须规避]

`mockttp-server.js` 的 `handleRequest`：

```js
const hasResponseListener = emitter.listenerCount('response') > 0;
if (hasResponseListener) {
    // Start buffering response body if there's somebody who might want to hear about it later
    response.body.asBuffer().catch(() => { });
}
```

`announceCompletedRequestAsync` 同理调用 `waitForCompletedRequest(request)`。

**结论：只要订阅 `request` 或 `response`，Mockttp 就会无条件把完整正文缓冲进内存。** Mockttp 默认 `maxBodySize = Infinity`，因此 67 MB 视频会完整驻留内存。

Capture 必须**退订这两个事件**，改用 initiated + body-data 组合。

### 3.2.1 trailer 需要 patch [已实现]

退订 completed 事件后产生一个直接后果：Mockttp **没有 trailer 专用事件**，trailer 只存在于
`CompletedRequest.rawTrailers` / `CompletedResponse.rawTrailers`。而 gRPC 的 `grpc-status`
正是一个 response trailer。

因此仓库维护一个最小 patch（`patches/mockttp+4.5.0.patch`，约 138 行），给 Mockttp 增加
`request-trailers` / `response-trailers` 事件：

- `request-utils.js` 的 `rawTrailers` setter 与 `addTrailers` override 中回调 `options.onTrailers`
- `mockttp-server.js` 增加 `announceTrailersAsync`，仅在有 listener 时启用
- `mockttp.d.ts` / `types.d.ts` 补齐 `TrailerData` 与事件签名

patch 经 `patch-package` + 根 `postinstall` 自动重放，升级 Mockttp 时若不适用会直接报错。

### 3.3 `rule-event` 提供保真证据且零缓冲

`request-step-impls.js` 在转发过程中发出：

| `eventType` | 内容 | 位置 |
| --- | --- | --- |
| `passthrough-request-head` | 发往 Origin 的**最终**请求（method/protocol/hostname/port/path/rawHeaders） | L922 |
| `passthrough-request-body` | `{ overridden, rawBody? }` | L931 |
| `passthrough-response-head` | Origin **原始**响应（statusCode/statusMessage/httpVersion/rawHeaders） | L562 |
| `passthrough-response-body` | `{ overridden, rawBody? }` | L682/762/769 |
| `passthrough-abort` | 上游中断 | L847 |

`passthrough-response-head` 的触发点在 `if (this.transformResponse)` 与 `else if (this.beforeResponse)` **之前**，因此无论走哪条规则路径都能拿到源站原始响应头，且不触发缓冲。

启用条件是零成本的：

```js
emitEventCallback: (emitter.listenerCount('rule-event') !== 0) ? ... : undefined
```

### 3.4 四组 headers 全部可零缓冲 [阶段二]

| Evidence | 来源 |
| --- | --- |
| 客户端原始请求头 | `request-initiated` |
| 发往 Origin 的最终请求头 | `rule-event: passthrough-request-head` |
| Origin 原始响应头 | `rule-event: passthrough-response-head` |
| 回客户端的最终响应头 | `response-initiated` |

这使得 Rule 效果 marker（生效值、被替代旧值、被删除值）可以完整保留，无需 `beforeResponse`。
当前已接入前两项中的 `request-initiated` 与 `response-initiated`；`rule-event` 两组在阶段二接入。

### 3.5 顺序不保证

`handleRequest` 内部：

```js
this.announceInitialRequestAsync(emitter, request);          // L527，setImmediate
let nextRulePromise = this.findMatchingRule(...);            // L553，matcher
await nextRule.handle(request, response, {...});             // L566，beforeRequest
```

`announceInitialRequestAsync`、`announceBodyDataAsync`、`announceRuleEventAsync` 全部用 `setImmediate` 延迟 emit，而规则执行走独立 Promise 链。

**因此所有 Capture 逻辑必须按 `request.id` 做幂等 upsert，谁先到谁创建记录，不得假定顺序。**

### 3.6 body-data 是旁路且自带攒批

`trackResponse` 建立独立 `PassThrough` 复制数据，`emitBodyDataEvents` 按 `CHUNK_BUFFER_INTERVAL_MS` 合并 chunk 后回调。

```js
bodyStream.on('data', (d) => {
    pendingContent = pendingContent ? Buffer.concat([pendingContent, d]) : d;
    if (!pendingContentTimer) {
        pendingContentTimer = setTimeout(() => flushPendingContent(false), CHUNK_BUFFER_INTERVAL_MS);
    }
});
```

Mockttp **不等待**我们处理完成，因此背压责任在 Capture 侧。

## 4. Exchange 状态机

请求侧与响应侧独立推进，因为 Origin 可能在请求体传完前就返回（401/413/417）。

```mermaid
stateDiagram-v2
    direction LR
    state "request" as REQ {
        [*] --> req_headers
        req_headers --> req_body
        req_body --> req_complete
        req_headers --> req_aborted
        req_body --> req_aborted
    }
    state "response" as RES {
        [*] --> res_none
        res_none --> res_informational
        res_none --> res_headers
        res_informational --> res_headers
        res_headers --> res_body
        res_body --> res_complete
        res_headers --> res_aborted
        res_body --> res_aborted
    }
```

对外暴露的聚合状态：

| `state` | 含义 |
| --- | --- |
| `pending` | 已收到请求头，尚无响应头 |
| `request-complete` | 请求已完整，等待响应（WebSocket 101 后也用此值） |
| `response-streaming` | 已收到响应头，正文传输中 |
| `completed` | 双向完成 |
| `aborted` | 客户端或 Origin 中断 |
| `failed` | Capture 持久化失败或协议错误 |

**迁移规则：**

1. 终态（`completed`/`aborted`/`failed`）不可回退。
2. 迟到或重复事件不得重复累加 bytes，使用 observed 计数覆盖而非累加。
3. `abort` 可以从任意非终态直接进入。

## 5. 调用流程

### 5.1 HTTP/HTTPS 常规请求（主路径）

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleEngine
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant App as CoreApplication
    participant Main
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Proxy: upsertExchange(request.id)
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    App->>Queue: drain
    App->>Main: event-batch
    Main-->>UI: 显示 pending 行
    Main-->>App: event-ack

    Mockttp->>Proxy: 规则钩子
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写结果

    Client->>Mockttp: 请求体分块
    Mockttp-->>Proxy: request-body-data
    Proxy->>Storage: 写入 body writer
    Proxy->>Queue: enqueue exchange-updated

    Mockttp->>Origin: 最终请求
    Mockttp-->>Proxy: rule-event passthrough-request-head
    Proxy->>Storage: 记录上游请求头

    Origin-->>Mockttp: 原始响应头
    Mockttp-->>Proxy: rule-event passthrough-response-head
    Proxy->>Storage: 记录源站原始响应头

    Mockttp->>Proxy: 响应规则钩子
    Proxy->>Rules: evaluateResponse
    Rules-->>Proxy: ResponseEvaluation
    Proxy-->>Mockttp: 改写结果

    Mockttp-->>Client: 最终响应头
    Mockttp-->>Proxy: response-initiated
    Proxy->>Storage: 更新 status 与最终响应头
    Proxy->>Queue: enqueue exchange-updated

    Origin-->>Mockttp: 响应体分块
    Mockttp-->>Client: 响应体分块
    Mockttp-->>Proxy: response-body-data
    Proxy->>Storage: 写入 body writer
    Proxy->>Queue: enqueue exchange-updated

    Mockttp-->>Proxy: response-body-data isEnded
    Proxy->>Storage: finalize body 得到 hash
    Proxy->>Storage: 绑定 bodyRef 与终态 completed
    Proxy->>Queue: enqueue exchange-updated
    App->>Queue: drain
    App->>Main: event-batch
    Main-->>UI: 更新同一行
```

**逐步说明：**

1. **请求头到达**：`ProxyService` 在 `request-initiated` 回调内检查 `recording` 与 `captureCutoff`，通过后分配 `exchangeId`，固定 `captureGeneration`，写入 `ExchangeInput{ state: 'pending' }`，立即 enqueue `exchange-added`。UI 在一个 flush 周期内看到该行。
2. **规则介入**：与步骤 1 并行，不保证先后。`ProxyService` 用同一 `request.id` 找到（或创建）Exchange 记录，附加 `ruleIds` 与 header effects。
3. **请求体**：每个 `request-body-data` 把 `content` 追加进该 Exchange 的 request body writer，更新 `requestBytes`。`isEnded` 时 finalize 得到 hash 并绑定 `requestBodyId`。
4. **上游请求头**：`passthrough-request-head` 提供发往 Origin 的最终值，作为 request Rule 效果的对照。
5. **源站响应头**：`passthrough-response-head` 提供 Origin 原始值，作为 response Rule 效果的对照。
6. **最终响应头**：`response-initiated` 提供实际写回客户端的值，更新 `statusCode`、`responseMime`、`responseStartedAt`，状态转 `response-streaming`。
7. **响应体**：同请求体，写入 response body writer。
8. **终态**：响应体 `isEnded` 后写入 `completedAt` 与 `state: 'completed'`。

### 5.2 CONNECT 隧道（未解密）[已实现]

未配置 CA 或用户未开启解密时，HTTPS 走字节直通，只记录有限元数据。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant Origin

    Client->>Mockttp: CONNECT host:443
    Mockttp-->>Proxy: tls-passthrough-opened
    Proxy->>Storage: appendExchanges CONNECT 元数据
    Proxy->>Queue: enqueue exchange-added
    Note over Proxy: method=CONNECT<br/>protocol=tls<br/>responseMime=application/x-encrypted-tunnel
    Client<<->>Origin: 加密字节直通，不可见
    Mockttp-->>Proxy: tls-passthrough-closed
    Proxy->>Storage: updateExchange completed
    Proxy->>Queue: enqueue exchange-updated
```

`pendingTunnels` 保存 `Promise<PendingTunnelCapture | null>`，确保 closed 事件等待 opened 落库后才更新。隧道内不读取任何 header 或 body。

### 5.3 WebSocket [改造中]

当前实现依赖 completed `response` 事件完成 101 Exchange，退订后必须改用 `websocket-accepted`。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Storage as StorageService
    participant Origin

    Client->>Mockttp: HTTP/1.1 Upgrade
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Note over Proxy: 登记 pendingWebSockets

    Origin-->>Mockttp: 101 Switching Protocols
    Mockttp-->>Proxy: websocket-accepted
    Proxy->>Storage: updateExchange 状态 request-complete
    Note over Proxy: resolveExchange(exchangeId)

    loop 双向消息
        Client->>Bridge: 应用消息
        Bridge->>Proxy: interceptWebSocketMessage
        Note over Proxy: 断点开启时挂起
        Bridge->>Origin: 转发或丢弃
        Mockttp-->>Proxy: websocket-message-received / sent
        Proxy->>Storage: appendWebSocketFrames
    end

    Client->>Mockttp: Close
    Mockttp-->>Proxy: websocket-close
    Proxy->>Storage: updateExchange completed
```

约束：

- 消息按 `streamId` 串行 `writeTail` Promise 链，保证顺序且等待 101 Exchange 先落库。
- payload 复用 `TemporaryBodyStore`，按 hash 去重。
- 仅支持 HTTP/1.1 Upgrade，H2 Extended CONNECT 未实现。

### 5.4 中断与早期响应

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Storage as StorageService
    participant Origin

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Storage: 建 pending Exchange

    alt Origin 早期响应
        Client->>Mockttp: 请求体传输中
        Origin-->>Mockttp: 401 / 413 / 417
        Mockttp-->>Proxy: response-initiated
        Proxy->>Storage: 更新响应，请求侧保持 body 阶段
        Client->>Mockttp: 停止上传
        Mockttp-->>Proxy: abort 或 request-body-data isEnded
        Proxy->>Storage: 合并为同一 Exchange 终态
    else 客户端中断
        Mockttp-->>Proxy: abort
        Proxy->>Storage: state aborted，errorCode 记录原因
    else Origin 中断
        Mockttp-->>Proxy: rule-event passthrough-abort
        Proxy->>Storage: state aborted
    end
```

**关键修复点**：当前实现只在 completed `request` 事件建立 `pending` 映射，若 `response` 先到会找不到请求而**直接丢弃整条记录**。改用 `request-initiated` 后，Exchange 在请求头阶段就已存在，早期响应可以正常合并。

## 6. 正文存储

### 6.1 增量写入 [改造中]

```mermaid
flowchart LR
    A["request-body-data<br/>response-body-data"] --> B["BodyWriter"]
    B --> C{"累计大小"}
    C -->|"低于阈值"| D["内存缓冲"]
    C -->|"超过阈值"| E["spill 到临时文件"]
    B --> F{"isEnded"}
    F -->|"是"| G["finalize 计算 hash"]
    G --> H["绑定 bodyRef 到 Exchange"]
```

**内容寻址的必然约束**：`TemporaryBodyStore` 按内容 hash 去重，因此 **hash 只有写完才能确定**。传输过程中 Exchange 只能记录 observed bytes，`requestBodyId` / `responseBodyId` 必须在 `isEnded` 后绑定。

UI 表现为：大小实时增长，但预览与保存要等传输完成。

### 6.2 阈值语义变更

| | 当前 | 目标 |
| --- | --- | --- |
| 判断依据 | 完整 buffer 的总大小 | 累计写入字节数 |
| spill 时机 | 拿到完整 buffer 后 | 累计跨过阈值立即 |

否则 67 MB 视频会先在内存里攒满再 spill，失去改造意义。

### 6.3 背压

Mockttp 不等待 Capture，因此需要自行限制：

1. 每个 body writer 维护有界待写队列。
2. 队列超限时降级：停止保存内容，仅累计 observed bytes，标记 `decodeStatus: 'skipped'` 与 `truncated`。
3. 降级必须在 UI 明示，不得让用户误以为正文为空。

磁盘写入失败只跳过该正文，绝不影响转发、RPC 或进程状态。

## 7. Recording、Pause 与 Clear

### 7.1 三种状态

| 操作 | 命令 | 效果 |
| --- | --- | --- |
| Start | `proxy.start` | 启动 listener（若未启动），`recording = true` |
| Stop | `proxy.setRecording{false}` | **只暂停记录**。listener 与系统代理保持运行，流量继续转发 |
| Clear | `storage.cleanup{all}` | 推进 cutoff，删除全部 Exchange 与正文 |

Stop 不停止转发，也不恢复系统代理。系统代理只在应用退出、Core 故障恢复、用户显式 Restore 或紧急修复时恢复。

### 7.2 Capture generation [改造中]

```mermaid
sequenceDiagram
    participant Proxy as ProxyService
    participant Storage as StorageService

    Note over Proxy: request-initiated 时固定<br/>captureGeneration = 当前值
    Proxy->>Proxy: exchange.generation = current

    Note over Proxy: 用户点击 Clear
    Proxy->>Proxy: prepareCaptureReset()<br/>generation += 1<br/>captureCutoff = now
    Proxy->>Storage: cleanup(all)

    Note over Proxy: 旧 generation 的迟到事件
    Proxy->>Proxy: 检查 generation 不匹配则丢弃
```

**判定规则：以请求开始时的状态为准。**

- 录制中开始、暂停后完成的长请求：继续完整记录。
- 暂停期间开始、恢复后完成的请求：始终不记录。
- Clear 后旧 generation 的所有 request/body/response/trailer/rule hit 全部拒绝，不得重新创建行。

## 8. 数据契约

### 8.1 Core 内部接口

`CaptureSink`（`proxy/interfaces/index.ts`）[改造中]：

```ts
interface CaptureSink {
  ensureSession(session: CaptureSessionInput): Promise<void>;
  appendExchanges(exchanges: ExchangeInput[]): Promise<{ id: string; seq: number }[]>;
  updateExchange(patch: ExchangePatch): Promise<void>;      // 需扩宽
  openBodyWriter(exchangeId: string, kind: 'request' | 'response'): BodyWriter;  // 新增
  appendRuleHits(exchangeId: string, hits: readonly RuleHitRecord[]): Promise<void>;
  appendWebSocketFrames(exchangeId: string, frames: readonly WebSocketFrameInput[]): Promise<void>;
}
```

当前 `updateExchange` 只接受 `{ id, completedAt, state }`，比 Storage 侧的 `ExchangeResponsePatch` 还窄。目标需覆盖：

- 请求侧：`requestBytes`、`requestBodyId`、`requestMime`
- 响应侧：`statusCode`、`statusText`、`responseMime`、`responseStartedAt`、`responseBytes`、`responseBodyId`
- 通用：`headers` 追加、`ruleIds`、`errorCode`、`state`

### 8.2 事件契约

```ts
interface CaptureEventSink {
  enqueue(kind: CaptureExchangeEventKind, summary: CaptureExchangeSummary): void;
}
```

`CaptureExchangeSummary` 需支持 pending 表达：`statusCode` 与 `durationMs` 可缺省，Renderer 据此渲染进行中状态。

队列合并行为：同 id 事件就地合并，**保留首次 sequence、摘要取最新、kind 不更新**。因此 `exchange-added` 尚未 drain 时到来的 `exchange-updated` 会被正确压成一条 added。

### 8.3 Renderer 命令

| 命令 | 用途 |
| --- | --- |
| `sessions.query` | keyset 分页拉取 summary |
| `sessions.detail` | 单条完整 headers 与 body 引用 |
| `body.read-range` | 按 hash + offset + length 读取正文片段 |
| `websocket.frames` | WebSocket 帧分页 |
| `grpc.messages` | gRPC envelope 分页 |
| `proxy.start` / `proxy.stop` / `proxy.status` / `proxy.setRecording` | 生命周期 |
| `storage.cleanup` | Clear |

## 9. Renderer 数据层

```mermaid
flowchart LR
    EVENT["event-batch"] --> HOOK["useCaptureData"]
    HOOK --> STORE["captureStore"]
    STORE --> LIST["RequestList"]
    LIST -->|"选中行"| DETAIL["sessions.detail"]
    DETAIL --> INSPECTOR["RequestInspector"]
    INSPECTOR -->|"按需"| RANGE["body.read-range"]
```

**分层规则：**

- Zustand 只保存全部 `CaptureExchangeSummary` 与视图状态（filter、selection、scrollTop、tab、宽度）。
- 完整 headers、body、WebSocket/gRPC payload **不进入全局状态**，按需拉取。
- `useCaptureData` 常驻 App，跨 feature 持续接收事件。
- 列表用固定 52px 行的 TanStack Virtual 虚拟化。
- 过滤完全在 Renderer 派生。

**预览上限：**

| 内容 | 上限 |
| --- | --- |
| 文本 / HTML / JSON | 1 MiB |
| WebSocket / gRPC payload | 1 MiB |
| CodeMirror / Hex viewport | 320px |
| `video/*` / `audio/*` | 零读取，仅经 Save Dialog 导出 |

## 10. 与当前实现的差异

阶段一已落地：

| 项 | 改造前 | 现在 |
| --- | --- | --- |
| Exchange 创建时机 | completed `request` + `response` 配对后 | `request-initiated` 立即 |
| completed 事件订阅 | 已订阅，触发全量缓冲 | 已退订 |
| 正文写入 | 拿到完整 buffer 后一次写 | body-data 增量写 |
| 早期响应 | `response` 先到会丢弃记录 | 按 request.id 合并 |
| WebSocket 101 | 依赖 completed `response` | 改用 `websocket-accepted` |
| trailer | 来自 completed 事件 | 专用 trailer 事件（patch） |
| `updateExchange` | `{id, completedAt, state}` | 全字段 patch |
| body 阈值 | 按总大小 | 按累计字节 |
| generation | 仅 `captureCutoff` 时间切面 | 显式 generation |

阶段二待做：

| 项 | 当前 | 目标 |
| --- | --- | --- |
| Rule evidence | 仅自有执行记录 | 叠加 `rule-event` 四组 headers |
| 响应规则执行 | 一律 `beforeResponse` 全量缓冲 | 优先 `transformResponse` 流式 |
| 请求规则预筛选 | `.matching(callback)` 等完整 body | 请求头阶段判定 |

## 11. 验收要点

- [ ] 无规则慢上传：Origin 在 body 完成前收到 headers，不出现 `12ms → 507ms` 回归。
- [ ] 67 MB Range 视频：全程流式，Core 内存峰值不随文件大小线性增长。
- [ ] SSE 与无限 chunked 响应：行立即出现，字节持续增长。
- [ ] 早期 401/413/417：Exchange 完整保留。
- [ ] Pause 前开始、Pause 后完成的请求继续记录。
- [ ] Clear 瞬间的 in-flight H1/H2/WebSocket/gRPC 不残留、不复活。
- [ ] WebSocket 捕获在退订 completed 事件后仍完整。
- [ ] 四组 headers 在 Inspector 中可区分展示。
