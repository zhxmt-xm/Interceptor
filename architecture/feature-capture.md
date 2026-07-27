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
| `rule-event` | `RuleEvent<T>` | 转发过程内部细节（Mockttp 原生，**当前未订阅**） | 见 3.3 |
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

**什么是 trailer**：HTTP 允许在 chunked 正文**结束之后**再发一组 header，叫 trailer。它存在的
理由是有些值只有传完正文才知道——校验和、签名、以及最重要的 **gRPC 状态**。

gRPC 的调用结果不在响应头里，而在 trailer：

```text
:status: 200
content-type: application/grpc+proto
<...gRPC 消息帧...>
grpc-status: 0        ← trailer，正文之后才发出
grpc-message: OK
```

也就是说，**没有 trailer 就读不到 gRPC 的成功/失败状态**。请求侧 trailer 在实践中极少使用
（客户端上传完再附校验和），但响应侧 trailer 是 gRPC 的必需品。

**为什么需要 patch**：Mockttp 只在 `CompletedRequest.rawTrailers` / `CompletedResponse.rawTrailers`
暴露 trailer，而拿到 completed 对象就意味着全量缓冲正文（见 3.2）。阶段一退订 completed 事件后，
trailer 会随之丢失，gRPC 面板的状态列会坏掉。

因此仓库维护 patch（`patches/mockttp+4.5.0.patch`）给 Mockttp 增加独立的
`request-trailers` / `response-trailers` 事件，让 trailer 与正文缓冲解耦：

- `request-utils.js` 的 `rawTrailers` setter 与 `addTrailers` override 中回调 `options.onTrailers`
- `mockttp-server.js` 增加 `announceTrailersAsync`，仅在有 listener 时启用
- `mockttp.d.ts` / `types.d.ts` 补齐 `TrailerData` 与事件签名

代理转发上游 trailer 时走的正是 `clientRes.addTrailers()`，而 `trackResponse` 已经 override 了
该方法，因此这个 patch 点能覆盖 H1 与 H2 两条路径。

patch 经 `patch-package` + 根 `postinstall` 自动重放，升级 Mockttp 时若不适用会直接报错。

### 3.3 `rule-event`：Mockttp 原生能力，当前未使用

`rule-event` 是 Mockttp **自带**的公开事件（不是本仓库 patch 新增的），`request-step-impls.js`
在转发过程中发出：

| `eventType` | 内容 | 位置 |
| --- | --- | --- |
| `passthrough-request-head` | 发往 Origin 的**最终** wire 请求头 | L922 |
| `passthrough-request-body` | `{ overridden, rawBody? }` | L931 |
| `passthrough-response-head` | Origin **原始**响应头 | L562 |
| `passthrough-response-body` | `{ overridden, rawBody? }` | L682/762/769 |
| `passthrough-abort` | 上游中断 | L847 |

设计早期曾打算用它采集四组 headers，**因为那时假设规则改写由 Mockttp 内部的
`transformResponse` 执行，我们看不到执行过程**，只能靠对比前后快照反推。

阶段二引入 `beforeRequestHead` / `beforeResponseHead` 后这个前提不成立了：规则改写回到
`RuleEngine` 自己手中，所以**不再需要 `rule-event`**，当前代码也没有订阅它。

仍然只有 `rule-event` 能提供、但当前不需要的两项：

- **wire 级精确的上游请求头**。钩子返回值之后，Mockttp 还会自己调整 host 与 content-length，因此 `passthrough-request-head` 与钩子返回值可能有细微差异。
- **区分上游中断与客户端中断**。`abort` 事件只代表客户端侧。

如果将来需要这两项，再订阅即可；启用成本为零：

```js
emitEventCallback: (emitter.listenerCount('rule-event') !== 0) ? ... : undefined
```

### 3.4 四组 headers 全部零缓冲 [已实现]

| Evidence | 来源 |
| --- | --- |
| 客户端原始请求头 | `request-initiated` |
| 发往 Origin 的最终请求头 | `beforeRequestHead` 返回值（由 RuleEngine 构造） |
| Origin 原始响应头 | `beforeResponseHead` 参数 |
| 回客户端的最终响应头 | `response-initiated` |

四者均不缓冲正文。Rule 效果 marker（生效值、被替代旧值、被删除值）由 `RuleEngine` 在
执行每个 header action 时直接记录 `previousValues` 产出，不需要从前后快照反推。

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

`trackResponse` 建立独立 `PassThrough` 复制数据，`emitBodyDataEvents` 按 `CHUNK_BUFFER_INTERVAL_MS`（20ms，Mockttp 内置）合并 chunk 后回调。

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
| `aborted` | 客户端中断，或上游连接失败（DNS/TCP/TLS）被镜像为客户端连接错误 |
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

    Note over Queue,App: App 每 50ms 定时 drain 一次，收到 event-ack 后也会立即再 flush。<br/>drain 与下方生命周期阶段无关，同一 Exchange 在一个窗口内的多次<br/>enqueue 会合并成一条，摘要取最新

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Proxy: upsertExchange(request.id)
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: 显示 pending 行
    Main-->>App: event-ack

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头
    Proxy->>Storage: 记录上游请求头与 rule effects

    loop 每个请求体分块
        Client->>Mockttp: 请求体分块
        Mockttp-->>Proxy: request-body-data
        Proxy->>Storage: 写入 body writer
        Proxy->>Queue: enqueue exchange-updated
    end
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: requestBytes 增长

    Mockttp->>Origin: 最终请求
    Origin-->>Mockttp: 原始响应头

    Mockttp->>Proxy: beforeResponseHead
    Note over Proxy: 参数即源站原始响应头
    Proxy->>Rules: evaluateResponse
    Rules-->>Proxy: ResponseEvaluation
    Proxy-->>Mockttp: 改写后的响应头
    Proxy->>Storage: 记录原始响应头与 rule effects

    Mockttp-->>Client: 最终响应头
    Mockttp-->>Proxy: response-initiated
    Proxy->>Storage: 更新 status 与最终响应头
    Proxy->>Queue: enqueue exchange-updated
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: 转 response-streaming 并显示状态码

    loop 每个响应体分块
        Origin-->>Mockttp: 响应体分块
        Mockttp-->>Client: 响应体分块
        Mockttp-->>Proxy: response-body-data
        Proxy->>Storage: 写入 body writer
        Proxy->>Queue: enqueue exchange-updated
    end
    Note over Queue,App: 流式期间定时器持续 drain，<br/>每 50ms 推一条合并后的最新摘要
    App->>Queue: drain
    App->>Main: event-batch
    Main-->>UI: responseBytes 持续增长

    Mockttp-->>Proxy: response-body-data isEnded
    Mockttp-->>Proxy: response-trailers
    Note over Proxy: gRPC 的 grpc-status 在此到达
    Proxy->>Storage: finalize body 得到 hash
    Proxy->>Storage: 绑定 bodyRef 与终态 completed
    Proxy->>Queue: enqueue exchange-updated
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: 更新同一行为 completed
```

**逐步说明：**

1. **请求头到达**：`ProxyService` 在 `request-initiated` 回调内检查 `recording` 与 capture generation，通过后分配 `exchangeId`，写入 `ExchangeInput{ state: 'pending' }`，立即 enqueue `exchange-added`。UI 在一个 flush 周期内看到该行。
2. **请求规则**：`beforeRequestHead` 与步骤 1 并行，不保证先后。`ProxyService` 用同一 `request.id` 找到（或暂存到孤儿表等待）Exchange 记录，附加 `ruleIds` 与 header effects。钩子**不等请求正文**。
3. **请求体**：每个 `request-body-data` 把 `content` 追加进该 Exchange 的 request body writer，更新 `requestBytes`。`isEnded` 时 finalize 得到 hash 并绑定 `requestBodyId`。
4. **源站响应头**：`beforeResponseHead` 的参数就是 Origin 原始响应头，作为 response Rule 效果的对照。钩子**不缓冲响应正文**。
5. **最终响应头**：`response-initiated` 提供实际写回客户端的值，更新 `statusCode`、`responseMime`、`responseStartedAt`，状态转 `response-streaming`。
6. **响应体**：同请求体，写入 response body writer。
7. **trailer**：`response-trailers` 追加记录；gRPC 的 `grpc-status` 由此路径获得。
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

**Rule 对未解密隧道完全不生效**，因此上图没有 RuleEngine 参与。原因在 TLS 层就已决定：

未配置 CA 时 `startServer()` 用 `getLocal({ https: { ...tlsPassthroughIdentity, tlsInterceptOnly: [] } })`。
Mockttp 的 `shouldPassThrough()` 在 `interceptOnlyPatterns` 非 undefined 时返回
`!interceptOnlyPatterns.some(...)`，空数组必然得到 `true`，于是 `analyzeAndMaybePassThroughTls`
读完 ClientHello 就把 socket 交给 passthrough listener 并 `return`，**不再继续 TLS 握手**。

后果是隧道内的字节从未被解密、从未被解析成 HTTP 请求，`forAnyRequest().thenPassThrough()`
这条规则链根本不会被触发，`beforeRequestHead` / `beforeResponseHead` 自然也不会调用。
换言之：**要让 Rule 作用于 HTTPS，必须先安装并信任 CA 且开启 MITM**，此时流量走 5.1 的常规路径，
隧道记录不再产生。

### 5.3 WebSocket [已实现]

101 Exchange 由 `websocket-accepted` 完成。不能依赖 completed `response`，因为订阅它会
触发全量正文缓冲（见 3.2）。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Rules as RuleEngine
    participant Storage as StorageService
    participant Origin

    Client->>Mockttp: TCP/TLS + HTTP/1.1 Upgrade
    Note over Mockttp: Mockttp 拥有 listener，<br/>终止 TLS 并解析 Upgrade 请求
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Note over Proxy: 登记 pendingWebSockets

    Mockttp->>Bridge: 移交 socket 与 head（ListenWebSocketStep.handle）
    Bridge->>Origin: WebSocket Upgrade（转发头 + 子协议）
    Origin-->>Bridge: 101 Switching Protocols
    Note over Bridge: 先连通上游再升级下游，<br/>上游失败则客户端 Upgrade 直接失败

    Bridge-->>Client: 101（ws.handleUpgrade 直接写该 socket）
    Note over Mockttp: 101 字节被 Mockttp 的 socket._write<br/>钩子截获，用于还原响应
    Bridge->>Mockttp: emit ws-upgrade(downstream)
    Note over Mockttp: 卸载 write 钩子退出字节路径，<br/>改为在 downstream 上挂观测
    Mockttp-->>Proxy: websocket-accepted
    Proxy->>Storage: updateExchange 状态 request-complete

    loop 客户端 → 源站
        Client->>Bridge: 应用消息（同一 socket，Bridge 是 WS 端点）
        Bridge->>Proxy: interceptWebSocketMessage
        alt 消息断点开关关闭
            Proxy-->>Bridge: forward（原样）
        else 消息断点开关开启
            Proxy->>Rules: pauseWebSocketMessage
            Note over Rules: 挂起等待用户裁决<br/>continue / edit / drop
            Rules-->>Proxy: outcome
            Proxy-->>Bridge: forward 改写后内容，或 drop
        end
        Bridge->>Origin: 转发或丢弃
        Mockttp-->>Proxy: websocket-message-received
        Note over Mockttp: 由 downstream 的 message 监听器观测
        Proxy->>Storage: appendWebSocketFrames
    end

    loop 源站 → 客户端
        Origin->>Bridge: 应用消息
        Bridge->>Proxy: interceptWebSocketMessage
        Note over Proxy: 同上，断点开启时挂起
        Bridge->>Client: 转发或丢弃
        Mockttp-->>Proxy: websocket-message-sent
        Note over Mockttp: 由包装后的 downstream.send 观测
        Proxy->>Storage: appendWebSocketFrames
    end

    Note over Bridge: ping / pong 走 ws.ping 与 ws.pong，<br/>不经断点，Mockttp 也不观测

    Client->>Bridge: Close
    Bridge->>Origin: Close 透传
    Mockttp-->>Proxy: websocket-close
    Proxy->>Storage: updateExchange completed
    Origin-->>Bridge: 上游 close
    Bridge->>Bridge: cleanup 检测两端都 CLOSED，从 pairs 移除
    Note over Bridge: terminate 内部即 socket.destroy，<br/>回收细节见 5.5.6
```

**客户端连接的归属分层**（容易误解，单独说明）：

| 层 | 归属 |
| --- | --- |
| TCP/TLS 接入、HTTP Upgrade 请求解析、WebSocket 规则匹配 | Mockttp |
| 101 握手响应与之后全部 WebSocket 帧 | Bridge（`ws`）直接读写 Mockttp 移交的同一 socket |
| `websocket-accepted` / `message-received` / `message-sent` / `close` 观测 | Mockttp，但**不在字节路径上** |

Mockttp 在 Upgrade 阶段给 socket 装 `_write` / `_writev` 钩子，因此 Bridge 调
`downstreamServer.handleUpgrade()` 写出的 101 字节会被它截获并 `parseRawHttpResponse` 还原成
响应对象。随后 Bridge `socket.emit('ws-upgrade', downstream)`，Mockttp 收到后**立刻卸载钩子**，
转而在 `downstream` 这个 WebSocket 对象上挂 `on('message')` 并包装 `send()`，靠对象级 hook 观测
消息。也就是说：**连接是 Mockttp 接的，WebSocket 协议端点是 Bridge 的，Mockttp 升级完成后退化为观察者。**

约束：

- **Rule 的适用范围与 HTTP 不同**，这是 WebSocket 最容易误解的一点：

  | 对象 | 是否经过 Rule |
  | --- | --- |
  | Upgrade 请求（header 改写、block、map local/remote 等） | **否**。Bridge 经 `addWebSocketRule` 注册独立的 WebSocket 规则链（`WildcardMatcher` + 自定义 step），不走 `forAnyRequest().thenPassThrough()`，因此 `beforeRequestHead` / `beforeResponseHead` 不会触发 |
  | 消息 | **仅全局断点**。`interceptWebSocketMessage` 只检查 `webSocketBreakpointsOn` 并调 `ruleEngine.pauseWebSocketMessage`，`ruleName` 硬编码为 `WebSocket message`，**不做 matcher 匹配，也不执行任何 rule action** |

  即消息断点是一个 `websocket.breakpoint.configure` 控制的全局开关，命中后挂起等待 continue / edit / drop，与 Rules 工作区里配置的规则无关。
- **上游先于下游**：`handle()` 先 `new WebSocket(url)` 并 `waitForOpen(upstream)`，成功后才 `handleUpgrade` 回客户端 101。上游握手失败时 upstream 被 terminate 并抛出，客户端拿不到 101，因此不存在「已升级但无上游」的中间态。子协议以上游 `sec-websocket-protocol` 回填，`sec-websocket-extensions` 被删除（bridge 关闭 permessage-deflate，两侧均传明文帧）。
- **双向都过断点**：`downstream.on('message')` 与 `upstream.on('message')` 都走 `forward()` → `intercept()`，因此 server-to-client 方向同样可挂起、改写、丢弃。两个方向各自维护 `clientTail` / `serverTail` Promise 链，互不阻塞但各自保序。
- **观测依赖 Bridge 走 `send()`**：Mockttp 的 `message-sent` 来自被包装的 `downstream.send()`。`sendControl` 用的是 `ws.ping` / `ws.pong`，因此 ping / pong 与 close 在两侧原样透传，既不进入断点也不落库。
- **两个方向的记录语义不对称**：Mockttp 与 Bridge 各自在**同一个** `downstream` 对象上挂 `on('message')`，一帧到达同步触发两者（`socket.emit('ws-upgrade')` 是同步的，Mockttp 先注册也先执行）。但转发目标不同导致：

  | 方向 | 观测点 | 记录到的内容 |
  | --- | --- | --- |
  | client → server | `downstream.on('message')`，帧一到就捕获 | 断点**前**的原始内容，被 drop 的消息**仍会**记一条 |
  | server → client | 被包装的 `downstream.send()`，断点决策**后**才调用 | 断点**后**的最终内容，被 drop 的消息**不落库** |

  原因是 client→server 转发调 `upstream.send()`，而 upstream 由 Bridge 自行 `new WebSocket()` 创建、未被 Mockttp 包装，不产生事件。因此「断点改写是否体现在 Capture 记录里」两个方向相反。
- 消息按 `streamId` 串行 `writeTail` Promise 链，保证顺序且等待 101 Exchange 先落库。
- payload 复用 `TemporaryBodyStore`，按 hash 去重。
- 仅支持 HTTP/1.1 Upgrade，H2 Extended CONNECT 未实现。



### 5.4 早期响应（HTTP）

**终态场景总览**（5.4 与 5.5 合并对照）：

| 场景 | Mockttp 发出的事件 | Capture 结果 |
| --- | --- | --- |
| HTTP 早期响应（401/413/417） | `response-initiated` → `response-body-data isEnded` | `completed`，已上传正文保留 |
| HTTP 请求中断 | `abort` | `aborted` + `errorCode` |
| HTTP 上游连接失败（DNS/TCP/TLS） | `abort`（`simulateConnectionErrors` 镜像为客户端连接错误） | `aborted` + 真实 `errorCode` |
| WebSocket 升级前连接直接断开 | `abort`（`data` 为空分支） | `aborted` |
| WebSocket 非正常关闭（closeCode 1006） | `abort` | `aborted` |
| WebSocket 上游升级失败 | 无（`response` 未订阅，`announceResponseAsync` 直接 return） | `aborted`，由 Bridge 显式判终态 |
| 未解密 CONNECT 隧道异常断开 | 仅 `tls-passthrough-closed` | 一律 `completed`，**永远不会是 `aborted`** |

本节只针对 HTTP/HTTPS（MITM 后）：Origin 可能在请求体传完前就返回 401/413/417。
WebSocket 没有等价场景（不存在请求体流式上传），未解密隧道也不适用。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleEngine
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Note over Queue,UI: 事件按 5.1 的 50ms 定时 drain 推送，<br/>此处只标出入队时机

    Client->>Mockttp: 请求头（POST，带正文）
    Mockttp-->>Proxy: request-initiated
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头
    Mockttp->>Origin: 转发请求头

    loop 上传进行中
        Client->>Mockttp: 请求体分块
        Mockttp->>Origin: 转发请求体分块
        Mockttp-->>Proxy: request-body-data
        Proxy->>Proxy: 写入 requestWriter
        Proxy->>Storage: patch requestBytes
        Proxy->>Queue: enqueue exchange-updated
        Queue-->>UI: requestBytes 增长
    end

    Note over Origin: 未读完请求体就决定拒绝

    Origin-->>Mockttp: 早期响应头（401 / 413 / 417）
    Mockttp->>Proxy: beforeResponseHead
    Proxy->>Rules: evaluateResponse
    Rules-->>Proxy: ResponseEvaluation
    Proxy-->>Mockttp: 改写后的响应头
    Mockttp-->>Client: 早期响应头
    Note over Client,Mockttp: 响应已回客户端，但上传通道未关闭，<br/>客户端是否继续发送由它自己决定
    Mockttp-->>Proxy: response-initiated
    Proxy->>Storage: 更新 status，状态转 response-streaming
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 显示状态码，行仍在进行中
    Note over Proxy: 请求侧仍停在 body 阶段，<br/>请求与响应两侧独立推进

    Origin-->>Mockttp: 响应体并结束
    Mockttp-->>Client: 响应体并结束
    Mockttp-->>Proxy: response-body-data isEnded
    Proxy->>Proxy: completeExchange
    Note over Proxy: finalize 请求与响应两个 writer，<br/>terminal 置真并从 entries 移除
    Proxy->>Storage: state completed 并绑定两侧 bodyRef
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 completed

    alt 客户端继续上传
        Client->>Mockttp: 后续请求体分块
        Mockttp-->>Proxy: request-body-data
    else 客户端放弃上传
        Client--xMockttp: 断开连接
        Mockttp-->>Proxy: abort
    end
    Note over Proxy: 两种情况都已查不到 entry，<br/>直接丢弃，不再改终态
```

**响应与上传是并行的两条通道。** 早期响应头一到就会被 Mockttp 转发给客户端，Capture 也立刻
`patch` 出 `response-streaming` 并入队推给 Renderer——**不需要等上传结束**。此时客户端的上传通道
仍然开着，继续发还是放弃完全由客户端决定（很多 HTTP 客户端收到 4xx 后仍会把已排队的分块发完）。
两种选择在 Capture 侧结果相同：`completeExchange` 已把 entry 移除，后续事件一律丢弃。

**终态由先到达的一侧决定。** 请求侧与响应侧独立推进，但 `completeExchange` 与 `finishExchange`
都会把 `entry.terminal` 置真并从 `entries` 移除，之后同 `request.id` 的任何事件都查不到 entry
而被丢弃。因此早期响应场景下，响应体先结束就把整条 Exchange 定为 `completed`，客户端后续的
停止上传或 `abort` **不会**再把它改成 `aborted`。

**关键修复点**：早期实现只在 completed `request` 事件建立 `pending` 映射，若 `response` 先到会找不到请求而**直接丢弃整条记录**。改用 `request-initiated` 后，Exchange 在请求头阶段就已存在，早期响应可以正常合并。

**[已修复] 早期响应保留已上传的请求正文**：`completeExchange` 原先只取 `entry.responseWriter`
去 finalize，对仍在写入的 `entry.requestWriter` 既不 `finalize()` 也不 `abort()`，随后
`entries.delete(requestId)` 让它彻底失去引用，导致：

1. 已上传的那部分请求正文不绑定 `requestBodyId`，Inspector 里出现「有字节数但没有正文」。
2. 跳过 `BodyWriter.abort()` 会把 spill 临时文件留到 Core 代际结束（`tracker.reset()` 只遍历 `entries`，此时已删除，也兜不住）。

现已改为与 `finishExchange` 一致地收尾两个 writer。回归用例：
`proxy-service.test.ts` 的 *keeps the uploaded request body when the origin responds early*。

### 5.5 中断（abort）

由全局 `server.on('abort')` 驱动，**覆盖 HTTP 与 WebSocket**，不覆盖未解密隧道。
五种触发场景的前置流程互不相同，各画一张从客户端发起请求开始的完整时序。

无论哪一种，收尾都汇聚到 `finishExchange`：两个 writer 都 finalize（已接收的部分正文保留并绑定
body 引用），写入 `state`、`completedAt`、`errorCode`，`terminal` 置真并从 `entries` 移除，
最后 `resolveExchangeReady`。

#### 5.5.1 HTTP 客户端主动中断

用户取消、请求超时或客户端进程退出，连接在上传或等待响应期间断开。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleEngine
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头
    Mockttp->>Origin: 转发请求头

    loop 上传进行中
        Client->>Mockttp: 请求体分块
        Mockttp->>Origin: 转发请求体分块
        Mockttp-->>Proxy: request-body-data
        Proxy->>Proxy: 写入 requestWriter
        Proxy->>Queue: enqueue exchange-updated
        Queue-->>UI: requestBytes 增长
    end

    Client--xMockttp: 连接断开（用户取消、超时、进程退出）
    Mockttp--xOrigin: 上游连接一并中断
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Note over Proxy: 两个 writer 都 finalize，<br/>已上传的部分正文保留
    Proxy->>Storage: state aborted + completedAt + errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted
```

#### 5.5.2 HTTP 上游连接失败

DNS 解析失败、TCP 被拒或 TLS 握手失败，请求从未到达源站。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleEngine
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头

    Mockttp->>Origin: 建立连接
    Origin--xMockttp: 解析失败、连接被拒或握手失败
    Note over Mockttp: simulateConnectionErrors 把上游故障<br/>镜像为客户端连接错误，不伪造 502
    Mockttp--xClient: reset 或 close
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Proxy->>Storage: state aborted + completedAt + 真实 errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted 并显示失败原因
```

**上游失败语义**：passthrough 固定 `simulateConnectionErrors: true`，因此客户端看到的是与不挂代理时一致的失败形态（连接被重置/关闭），而不是一个伪造的 502 响应。Capture 里也是一条带真实 `errorCode` 的 `aborted` 记录，而不是一条假响应。

#### 5.5.3 WebSocket 升级完成前客户端断开

客户端发出 Upgrade 后、握手完成前就断开，此时还没有任何响应字节写回。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: HTTP/1.1 Upgrade
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行
    Mockttp->>Bridge: 移交 socket 与 head
    Bridge->>Origin: WebSocket Upgrade

    Client--xMockttp: 连接断开
    Note over Mockttp: 一个字节响应都没写出，<br/>socket close 时走 data 为空分支
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Proxy->>Storage: state aborted + completedAt + errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted

    Origin-->>Bridge: 101 Switching Protocols（上游握手仍会完成）
    Bridge->>Bridge: 检测下游 socket 已不可读写
    Note over Bridge: ws 的 completeUpgrade 只会 destroy 下游<br/>并静默跳过回调，connectPair 不会执行
    Bridge--xOrigin: terminate 上游（内部即 socket.destroy），避免孤儿连接
    Note over Bridge: downstream 未创建，pairs 未加入
```

**Bridge 必须自己收尾上游。** 上游握手是异步的：客户端断开时 `await waitForOpen(upstream)` 往往仍在
等待，之后源站照样会回 101，于是出现「下游已死、上游刚活」的错配。此时 `ws` 的 `completeUpgrade`
第一件事就是 `if (!socket.readable || !socket.writable) return socket.destroy()`——**它只销毁下游
socket，并且不调用回调**，因此 `connectPair` 永远不执行、上游既进不了 `pairs` 也无人 `terminate`，
`bridge.close()` 同样兜不住（它只遍历 `pairs`）。

`handle()` 现在在 `handleUpgrade` 前先检查下游是否仍可读写，并额外注册一次 `socket.once('close')`
守卫：只要配对未完成就 `upstream.terminate()`。回归用例：
*closes the upstream websocket when the client disconnects during the upgrade*。

被移交的下游 socket 不需要 Bridge 额外处理——`completeUpgrade` 已经 `destroy()` 了它。

#### 5.5.4 WebSocket 上游升级失败

上游拒绝升级或连接不通，Bridge 的 `waitForOpen(upstream)` 失败。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: HTTP/1.1 Upgrade
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行
    Mockttp->>Bridge: 移交 socket 与 head

    Bridge->>Origin: WebSocket Upgrade
    Origin--xBridge: 连接被拒或响应非 101
    Note over Bridge: waitForOpen 以 error 拒绝
    Bridge--xOrigin: terminate 上游（内部即 socket.destroy）

    Bridge->>Proxy: onUpgradeFailed
    Proxy->>Proxy: failWebSocketUpgrade 进入 aborted
    Proxy->>Storage: state aborted + completedAt + 真实 errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted

    Bridge--xMockttp: 抛出异常
    Mockttp--xClient: 写回 HTTP/1.1 500 后 socket.destroy(error)
    Note over Bridge: 从未调用 handleUpgrade，<br/>downstream 未创建，pairs 未加入
    Note over Mockttp: 此处本应 announceResponseAsync，<br/>但 listenerCount('response') 为 0 直接 return，<br/>事件根本不会发出，故终态必须由 onUpgradeFailed 给出
```

**这里没有「收不到的事件」，而是压根不发。** `announceResponseAsync` 的第一行就是
`if (emitter.listenerCount('response') === 0) return`，Capture 从不订阅 `response`，因此
Mockttp 连 `waitForCompletedResponse()` 都不会调用——既不会有事件投递，也不会触发 3.2 说的全量正文
缓冲。代价是这条路径**没有任何 Mockttp 事件可用**，终态只能由 Bridge 的 `onUpgradeFailed` 补上。

#### 5.5.5 WebSocket 已建立后非正常关闭

握手成功、消息通道已经工作，之后连接异常中断（`closeCode` 1006，非 clean close）。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Storage as StorageService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: HTTP/1.1 Upgrade
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行
    Mockttp->>Bridge: 移交 socket 与 head

    Bridge->>Origin: WebSocket Upgrade
    Origin-->>Bridge: 101 Switching Protocols
    Bridge-->>Client: 101 Switching Protocols
    Mockttp-->>Proxy: websocket-accepted
    Proxy->>Storage: state request-complete
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 request-complete

    loop 消息往返
        Client->>Bridge: 应用消息
        Bridge->>Origin: 转发
        Mockttp-->>Proxy: websocket-message-received
        Proxy->>Storage: appendWebSocketFrames
    end

    Client--xBridge: 连接异常中断（closeCode 1006）
    Note over Mockttp: 非 clean close，走 announceAbortAsync<br/>而不是 websocket-close
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Proxy->>Storage: state aborted + completedAt + errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted

    Note over Bridge: Capture 侧判终态与 Bridge 侧收尾是两条独立路径，<br/>下面这段不依赖 abort 事件
    Bridge->>Bridge: downstream 的 close 监听触发 closePeer(upstream)
    Bridge--xOrigin: 关闭上游（1006 不是合法出网 code，改发无 code close）
    Origin-->>Bridge: 上游 close
    Bridge->>Bridge: cleanup 检测两端都 CLOSED，从 pairs 移除
```

**Bridge 的收尾与 abort 事件互不依赖。** `abort` 只驱动 Capture 判终态；连接回收由 `connectPair`
注册的监听器完成：任一端 `close` → `closePeer` 把关闭传播给对端 → 两端都 `CLOSED` 时 `cleanup`
把 pair 从 `pairs` 移除。`ws` 的 `close()` 会发关闭帧并挂一个 30s `closeTimer`，对端不回应也会
`socket.destroy()` 兜底，因此不会无限挂起。

**WebSocket 复用同一模型**：`beginWebSocketRequest` 内部就是 `beginRequest`，条目同样落在 `entries` 里，因此 `abortExchange` 能正常命中。正常关闭（clean close）走的是 `websocket-close` → `closeWebSocket` → `completed`，不在本节范围内。

#### 5.5.6 资源回收对照

WebSocket 路径上 Bridge 实际持有的对象只有三类，逐场景的回收责任如下（HTTP 路径见本表末尾）。

| 对象 | 谁创建 | 回收方式 |
| --- | --- | --- |
| `upstream: WebSocket`（到源站） | Bridge `new WebSocket(url)` | 见下表逐场景 |
| `downstream: WebSocket`（到客户端） | `ws` 的 `handleUpgrade`，包装 Mockttp 移交的 socket | 与 upstream 成对，随 pair 一同回收 |
| `pairs: Set<WebSocketPair>` | Bridge | `cleanup` / `failPair` / `close()` 移除 |

| 场景 | upstream 回收 | downstream / socket 回收 | pairs |
| --- | --- | --- | --- |
| 上游升级失败（5.5.4） | `waitForOpen` catch 中 `terminate()` | Mockttp `sendWebSocketErrorResponse` 写 500 后 `socket.destroy(error)` | 从未加入 |
| 升级期间客户端断开（5.5.3） | 预检查或 `socket.once('close')` 守卫 `terminate()` | `ws` 的 `completeUpgrade` 已 `socket.destroy()` | 从未加入 |
| 已建立后任一端关闭（5.5.5 与正常关闭） | `closePeer` 传播关闭，30s `closeTimer` 兜底 `socket.destroy()` | 同左，对称处理 | `cleanup` 在两端 `CLOSED` 后移除 |
| 消息转发或连接报错 | `failPair` 直接 `terminate()` | `failPair` 直接 `terminate()` | `failPair` 立即移除 |
| Proxy 停止 / TLS 重配 | `bridge.close()` 遍历 `pairs` 全部 `terminate()` | 同左 | `pairs.clear()` |

`terminate()` 在 `ws` 内部就是 `this._socket.destroy()`，因此上表的每条路径最终都会销毁底层 TCP/TLS
socket，不存在只丢引用不关连接的情况。`connectPair` 注册的监听器都挂在这两个 WebSocket 对象上，
pair 移除后对象即可回收，监听器随之释放。

**HTTP 路径没有需要 Bridge 收尾的连接对象**：客户端与上游 socket 全部由 Mockttp 拥有和销毁，
Capture 只订阅事件。Capture 自己持有的可释放资源仅有 `BodyWriter`（可能已 spill 到临时文件），
其回收点是 `completeExchange` / `finishExchange` 的 finalize，以及 `tracker.reset()` 对在途条目的
`abort()`——正是 5.4 那条已修复缺陷所覆盖的范围。

**[已修复] WebSocket 上游升级失败的终态**：Bridge 的 `handle()` 在
`waitForOpen(upstream)` 失败时直接抛出，Mockttp 的 `handleWebSocket` catch 到非 `AbortError`
后调 `sendWebSocketErrorResponse()`，向客户端 socket 写入 `HTTP/1.1 500`。这段字节被
`trackWebSocketEvents` 的 `_write` 钩子收进 `data`，于是 socket close 时走的是
`data.length` 非空分支，即 `announceResponseAsync`——**这条路径唯一可用的终态信号是 completed `response`**。

而 Capture 为避免全量正文缓冲（见 3.2）**刻意退订了 `response`**，`announceResponseAsync` 首行的
`listenerCount('response') === 0` 判断因此直接 return，事件根本不发出。结果是这条 Exchange 拿不到
任何终态信号，会一直停在 `pending`。现已改为 Bridge 在抛出前经 `onUpgradeFailed` 回调
`tracker.failWebSocketUpgrade()` 显式判终态（`aborted` + 真实 `errorCode`），不再依赖
`response` 事件。回归用例：*marks the exchange aborted when the upstream websocket upgrade fails*。

**[已知限制] 未解密隧道没有中断语义**：`completeTunnel` 固定写 `state: 'completed'`。这不是实现疏漏，
而是上游事件契约所限：`TlsPassthroughEvent` 只带 destination / remoteIpAddress / timingEvents /
`tlsMetadata`，**没有任何关闭原因字段**（带 `failureCause` 的是另一个事件
`TlsHandshakeFailure`，只覆盖握手失败）。因此隧道记录无法区分正常关闭与连接重置，永远不会出现 `aborted`。


## 6. 正文存储

### 6.1 增量写入 [已实现]

```mermaid
flowchart LR
    A["request-body-data<br/>response-body-data"] --> B["BodyWriter"]
    B --> C{"累计写入字节"}
    C -->|"未超阀值"| D["留在内存 memoryChunks"]
    C -->|"首次超阀值"| E["建 spill 文件并把<br/>已缓存分片全部写入"]
    E --> E2["清空 memoryChunks，<br/>后续 chunk 直接追写文件"]
    B --> F{"isEnded"}
    F -->|"是"| G["finalize 计算 hash"]
    G --> H["绑定 bodyRef 到 Exchange"]
```

**spill 是全量迁移，不是只写超出部分。** `consume()` 在首次发现
`writtenBytes > memoryThresholdBytes`（即 `BODY_MEMORY_THRESHOLD_BYTES`，3 MiB）时才创建 spill 文件，紧接着把 **已经放在
`memoryChunks` 里的全部分片按顺序写进文件**，然后 `memoryChunks.length = 0` 清空内存，
当前 chunk 也直接追写文件。此后 `output` 非空，所有 chunk 一律走文件。

因此一份正文要么**完全在内存**、要么**完全在文件**，不存在一半内存一半文件的拆分状态。
`finalize()` 里的 `const memory = this.spillPath ? null : Buffer.concat(...)` 也体现了这一点：
一旦 spill 过，内存侧就是 `null`。

**内容寻址的必然约束**：`TemporaryBodyStore` 按内容 hash 去重，因此 **hash 只有写完才能确定**。传输过程中 Exchange 只能记录 observed bytes，`requestBodyId` / `responseBodyId` 必须在 `isEnded` 后绑定。

UI 表现为：大小实时增长，但预览与保存要等传输完成。

### 6.2 阈值语义 [已实现]

两个阈值都定义在 `proxy-core/constants.ts`，作用于**单个正文**（非全局）：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `BODY_MEMORY_THRESHOLD_BYTES` | `3 * 1024 * 1024` = **3 MiB** | 累计写入超过它就建 spill 文件，并把已缓存内容全量迁移进去 |
| `BODY_WRITER_PENDING_LIMIT_BYTES` | `128 * 1024 * 1024` = **128 MiB** | 待落盘积压的**病态兜底**，正常流量不会触及 |

两者职责不同：**3 MiB 决定“存在哪里”**（内存还是文件），**128 MiB 决定“什么时候放弃”**
（只在磁盘持续远慢于接收速度时才触发）。写入是异步串行的，因此即使已经 spill，排队中的
chunk 仍占内存，128 MiB 上限正是给这段队列封顶。

**设计意图是完整保留正文。** 128 MiB 取值远高于真实流量的积压水位，包括大文件下载在内的
常规场景都不会丢弃内容；它只在磁盘异常或极端本地源站这类病态情况下生效，避免 Core 因内存
无界增长而被重启。

**两个阀值都是“每条正文”而非全局上限**，因此峰值内存会乘上并发数。

判断依据也变了：

| | 改造前 | 现在 |
| --- | --- | --- |
| 判断依据 | 完整 buffer 的总大小 | 累计写入字节 `writtenBytes` |
| spill 时机 | 拿到完整 buffer 后 | 累计跨过阈值立即 |

差别关键：增量场景下每个 chunk 都小于阈值，只有累计后才跨过。若仍按完整大小判断，
67 MB 视频会先在内存里攒满再 spill，改造就失去意义。

### 6.3 背压

`write()` 由 Mockttp 的 `body-data` 回调同步调用，而 Mockttp **不等待**消费者（见 3.6，body-data 是
旁路复制流）。因此 `write()` 必须立刻返回，不能 `await` 磁盘——每个 chunk 只能先复制进内存、挂到串行
Promise 链上排队，真正落盘在后台进行。`pendingBytes` 就是「已收下但尚未落盘」的字节数。

**上限约束的是这段积压，而不是正文大小。** 若不设限，当到达速度持续快于磁盘写入速度时队列只进不出，
排队的 Buffer 全部驻留 RAM，Core 内存会无界增长。反过来，60 MB 正文只要任一时刻积压不超过上限就毫无
问题——它限制的是瞬时落差，不是总量。

无法做真正的背压：Mockttp 的 `emitBodyDataEvents` **忽略回调返回值**，且在 `'data'` 事件里无条件
累积 `pendingContent`，无任何接口可以告知“慢一点”；旁路流也不影响转发管线，唯一能减速的方式是
拖慢真实流量。Interceptor 是透明调试代理，**不能因为记录器跟不上就拖慢用户的流量**，
因此只能给队列封顶。

1. [已实现] 每个 body writer 维护有界待写队列，上限为 `BODY_WRITER_PENDING_LIMIT_BYTES`（128 MiB）。
   该上限是**病态兜底**，不是常规限制：正常流量（含大文件下载）下磁盘远快于网络，积压接近于零，
   正文完整保留。它是**每个 writer** 的，一条 Exchange 有请求/响应两个 writer。
2. [已实现] 只有磁盘持续远慢于接收速度（磁盘异常、极端本地源站）才会超限并降级：停止保存内容，
   仅累计 observed bytes（因此 UI 上的大小仍然准确），`finalize()` 返回 `null` 不绑定 bodyRef。
   降级是 **整条丢弃而非截断**：`discardCollected()` 会清空内存分片并删除已写的 spill 文件。
   原因是 Body Store 按内容 hash 寻址，截断的正文会算出与真实内容对不上的 hash，
   让用户看到一份与实际传输不符的「正文」，比没有更危险。
3. [待做] 降级状态必须在 UI 明示，不得让用户误以为正文为空。
4. [待做] **两个阈值改为 Settings 可配置并持久化**。当前 `BODY_MEMORY_THRESHOLD_BYTES`（3 MiB）与
   `BODY_WRITER_PENDING_LIMIT_BYTES`（128 MiB）是编译期常量，只能靠改代码重新发版调整。
   极端场景（超大响应必须完整保留、或低内存机器需要收紧）应由用户自行权衡：
   - 暴露为「正文内存阈值」与「单条正文最大积压」两项设置，改动后对**新建**的 writer 生效，
     不影响在途正文，避免中途改变阈值导致已收集内容语义不一致。
   - 需要 Renderer → Main → Core 的窄意图传递（形如现有 `tls.configure`），并在 Core 侧做范围校验。
   - **入口引导**：在 Inspector 的 BodyView（预览区）加一个问号按钮，用 Tooltip 说明当前的预览上限
     与正文保留阈值，并引导用户到 Settings 修改。做法可参照 Rules 编辑器顶部已有的
     `HelpCircle` + antd `Tooltip`（多行文本）模式。预览被截断或正文因降级丢弃时尤其需要它，
     否则用户无法区分「正文本来就空」与「被阈值卡掉」（与上面第 3 项合并实现）。
   - UI 上需说明代价：调大积压上限会抬高 Core 峰值内存（该值是**每个 writer** 的，会乘以并发数）。

   与之同类的还有 Proxy Core 心跳/启动超时的可配置化，两者可以合并为一组「高级/性能」设置。

磁盘写入失败只跳过该正文，绝不影响转发、RPC 或进程状态。

## 7. Recording、Pause 与 Clear

### 7.1 三种状态

| 操作 | 命令 | 效果 |
| --- | --- | --- |
| Start | `proxy.start` | 启动 listener（若未启动），`recording = true` |
| Stop | `proxy.setRecording{false}` | **只暂停记录**。listener 与系统代理保持运行，流量继续转发 |
| Clear | `storage.cleanup{all}` | 推进 generation，Exchange 与正文归零；仍在监听时保留当前 Session 壳（见 7.2） |

Stop 不停止转发，也不恢复系统代理。系统代理只在应用退出、Core 故障恢复、用户显式 Restore 或紧急修复时恢复。

### 7.2 Capture generation [已实现]

```mermaid
sequenceDiagram
    autonumber
    participant UI as Renderer
    participant App as CoreApplication
    participant Proxy as ProxyService
    participant Tracker as ExchangeTracker
    participant Queue as CaptureEventQueue
    participant Storage as StorageService

    Note over Tracker: request-initiated 时固定<br/>entry.generation = 当前值

    UI->>App: storage.cleanup 且 scope 为 all
    App->>Proxy: prepareCaptureReset()
    Proxy->>Tracker: reset()
    Note over Tracker: generation += 1<br/>abort 全部在途 body writer<br/>清空 entries 与孤儿表<br/>未决 exchangeReady 一律 resolve(null)
    Note over Proxy: 同时清空 webSocketTails 与 pendingTunnels
    Proxy-->>App: 仍在监听则返回当前 sessionId，否则 null

    App->>Queue: reset()
    Note over Queue: 丢弃尚未 drain 的事件，<br/>避免清空后旧数据仍被推给 UI

    alt 仍有活动 Session
        App->>Storage: cleanup(all-except-session)
        Note over Storage: 保留当前 Session 壳，<br/>Exchange 与 Body 归零
    else 未在监听
        App->>Storage: cleanup(all)
    end
    Storage-->>App: StorageStatusReport
    App-->>UI: storage.status

    Note over Tracker: 旧 generation 的迟到事件
    Tracker->>Tracker: generation 不匹配则丢弃
```

**Clear 由 CoreApplication 编排，不是 ProxyService 自己完成。** 三步顺序不可换：先
`prepareCaptureReset()` 建立切面（推进 generation，让在途事件立即失效），再 `captureEventQueue.reset()`
丢弃已入队但未推送的事件，最后才真正 `storage.cleanup`。否则会出现「库已清空但队列里还有旧行」被推给
Renderer 的窗口。

**活动 Session 会被保留。** `prepareCaptureReset()` 在代理仍在监听时返回当前 `sessionId`，
scope 随之收窄为 `all-except-session`——Exchange 与 Body 全部归零，但 Session 壳保留，
录制得以无缝继续。只有未在监听时才是真正的 `cleanup(all)`。

**判定规则：以请求开始时的状态为准。**

- 录制中开始、暂停后完成的长请求：继续完整记录。
- 暂停期间开始、恢复后完成的请求：始终不记录。
- Clear 后旧 generation 的所有 request/body/response/trailer/rule hit 全部拒绝，不得重新创建行。

## 8. 数据契约

### 8.1 Core 内部接口

`CaptureSink`（`proxy/interfaces/index.ts`）[已实现]：

```ts
interface CaptureSink {
  ensureSession(session: CaptureSessionInput): Promise<void>;
  appendExchanges(exchanges: ExchangeInput[]): Promise<{ id: string; seq: number }[]>;
  updateExchange(patch: ExchangePatch): Promise<void>;
  writeBody(source: AsyncIterable<Uint8Array>): Promise<BlobWriteResult>;
  createBodyWriter(): BodyWriter;
  appendRuleHits(exchangeId: string, hits: readonly RuleHitRecord[]): Promise<void>;
  appendWebSocketFrames(exchangeId: string, frames: readonly WebSocketFrameInput[]): Promise<void>;
}
```

`ExchangePatch` 除 `id` 外全部可选，未提供的字段保持原值，覆盖：

- 请求侧：`requestBytes`、`requestBodyId`、`requestMime`、`requestSentAt`、`requestBody`
- 响应侧：`statusCode`、`statusText`、`responseMime`、`responseStartedAt`、`responseBytes`、`responseBodyId`、`responseBody`
- 通用：`headers`（追加）、`ruleIds`（去重合并）、`errorCode`、`state`、`completedAt`

`writeBody` 是 pull 式、可背压，用于 WebSocket 单条消息；`createBodyWriter` 是 push 式、
不可阻塞，用于 HTTP 正文的 body-data 事件。两者语义不同，不能互相替代。

### 8.2 事件契约

```ts
interface CaptureEventSink {
  enqueue(kind: CaptureExchangeEventKind, summary: CaptureExchangeSummary): void;
}
```

`CaptureExchangeSummary` 需支持 pending 表达：`statusCode` 与 `durationMs` 可缺省，Renderer 据此渲染进行中状态。

队列合并行为：同 id 事件就地合并，**保留首次 sequence、摘要取最新、kind 不更新**。因此 `exchange-added` 尚未 drain 时到来的 `exchange-updated` 会被正确压成一条 added。

推送节奏与背压：`CoreApplication` 用 `EVENT_FLUSH_INTERVAL_MS`（50ms）定时器持续 `drain`，并在收到 `event-ack` 后立即再 flush 一次，**与 Exchange 的生命周期阶段无关**。单批上限 `EVENT_DRAIN_BATCH`（200 条），未 ack 批次上限 `EVENT_INFLIGHT_WINDOW_SIZE`（8 批），窗口满或无 RPC 连接时本轮跳过、事件留在队列里继续合并。

由此产生的可见语义：每次 `patch()`（含每个 body chunk）都会同步 enqueue，但 UI 收到的是**每 50ms 一帧的最新快照**，而不是每个 chunk 一帧。中间值会被跳过（例如 `responseBytes` 不会逐块呈现），这是保护数据面与限制 IPC 频率的有意取舍。

### 8.3 Renderer 命令

| 命令 | 用途 |
| --- | --- |
| `sessions.query` | keyset 分页拉取 summary |
| `sessions.detail` | 单条完整 headers 与 body 引用 |
| `body.read-range` | 按 hash + offset + length 读取正文片段 |
| `body.export.start` | Save body：把完整正文流式写到用户选定文件，不受预览上限限制 |
| `websocket.frames` | WebSocket 帧分页 |
| `websocket.breakpoint.configure` | 全局 WebSocket 消息断点开关 |
| `grpc.messages` | gRPC envelope 分页 |
| `proxy.start` / `proxy.status` / `proxy.setRecording` | 生命周期；Renderer 的 Stop 映射为 `setRecording{false}` |
| `storage.cleanup` | Clear |

`proxy.stop` 不对 Renderer 开放常规入口，仅在 Main 的紧急修复路径中调用。

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
| 文本 / HTML / JSON | `BODY_PREVIEW_MAX_BYTES` = 5 MiB |
| WebSocket / gRPC payload | 5 MiB |
| CodeMirror / Hex viewport | 320px |
| `video/*` / `audio/*` | 零读取，仅经 Save Dialog 导出 |

**预览截断不等于数据丢失。** 上限只作用于 Inspector 单次拉取的字节数，Core 侧始终保留完整正文。
超出时 UI 显示截断提示，用户可经 **Save body**（`exportBodyToFile`）把完整内容流式写到自选文件，
该路径不受预览上限限制。

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

阶段二已落地：

| 项 | 改造前 | 现在 |
| --- | --- | --- |
| 请求规则预筛选 | `.matching(callback)` 等完整 body | `beforeRequestHead` 头部阶段判定 |
| 响应规则执行 | 一律 `beforeResponse` 全量缓冲 | `beforeResponseHead` 流式 |
| Rule evidence | 需要从前后快照反推 | `RuleEngine` 执行时直接记录 `previousValues` |

仍待完成：

| 项 | 当前 | 目标 |
| --- | --- | --- |
| 正文阈值可配置 | `BODY_MEMORY_THRESHOLD_BYTES`（3 MiB）与 `BODY_WRITER_PENDING_LIMIT_BYTES`（128 MiB）为编译期常量 | 两者均可在 Settings 动态设置并持久化，对新建 writer 生效；BodyView 加问号按钮说明限制并引导跳转（详见 6.3 第 4 项） |
| Breakpoint 正文 | 快照不带正文 | 带入 Capture 已接收的增量片段 |
| Clear 与文件任务 | 无 lease 保护 | snapshot / lease 语义 |
| 进行中状态展示 | Renderer 仅按状态码占位 | 明示 pending / streaming 与已接收字节 |

## 11. 验收要点

- [x] 规则命中时的慢上传：Origin 在第二块正文发出前收到 headers。
- [x] 规则命中时的下载：响应头先于源站正文结束到达客户端。
- [x] 早期 401/413/417：Exchange 完整保留。
- [x] 早期响应时仍在上传的请求正文被 finalize 并绑定 bodyRef（回归用例 *keeps the uploaded request body when the origin responds early*）。
- [x] WebSocket 上游升级失败判为 `aborted` 而非停在 `pending`（回归用例 *marks the exchange aborted when the upstream websocket upgrade fails*）。
- [x] WebSocket 升级期间客户端断开时，已建立的上游连接被关闭（回归用例 *closes the upstream websocket when the client disconnects during the upgrade*）。
- [x] Clear 后旧 generation 的迟到事件被全部丢弃。
- [x] WebSocket 捕获在退订 completed 事件后仍完整。
- [x] gRPC `grpc-status` trailer 在退订 completed 事件后仍可读。
- [ ] 67 MB Range 视频：全程流式，Core 内存峰值不随文件大小线性增长。
- [ ] SSE 与无限 chunked 响应：行立即出现，字节持续增长。
- [ ] Pause 前开始、Pause 后完成的请求继续记录。
- [ ] 四组 headers 在 Inspector 中可区分展示。
