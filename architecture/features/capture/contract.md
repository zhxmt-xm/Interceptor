> 返回 [Capture 索引](README.md)

## 9. 数据契约

### 9.1 Core 内部接口

`CaptureService`（`capture/entry.ts`）向Proxy暴露的写入方法：

```ts
class CaptureService {
  ensureSession(session: CaptureSessionInput): Promise<void>;
  appendExchanges(exchanges: ExchangeInput[]): Promise<{ id: string; seq: number }[]>;
  updateExchange(patch: ExchangePatch): Promise<void>;
  writeBody(source: AsyncIterable<Uint8Array>): Promise<BlobWriteResult>;
  createBodyWriter(): BodyWriter;
  appendRuleHits(exchangeId: string, hits: readonly RuleHitRecord[]): Promise<void>;
  appendWebSocketFrames(exchangeId: string, frames: readonly WebSocketFrameInput[]): Promise<void>;
}
```

`ProxyService`与`ExchangeTracker`直接持有这个具体类；测试替身
`extends CaptureService` 并只 `override` 被断言的方法。

`ExchangePatch` 除 `id` 外全部可选，未提供的字段保持原值，覆盖：

- 请求侧：`requestBytes`、`requestBodyId`、`requestMime`、`requestSentAt`、`requestBody`
- 响应侧：`statusCode`、`statusText`、`responseMime`、`responseStartedAt`、`responseBytes`、`responseBodyId`、`responseBody`
- 通用：`headers`（追加）、`ruleIds`（去重合并）、`errorCode`、`state`、`completedAt`

`writeBody` 是 pull 式、可背压，用于 WebSocket 单条消息；`createBodyWriter` 是 push 式、
不可阻塞，用于 HTTP 正文的 body-data 事件。两者语义不同，不能互相替代。

### 9.2 事件契约

```ts
interface CaptureEventSink {
  enqueue(kind: CaptureExchangeEventKind, summary: CaptureExchangeSummary): void;
}
```

`CaptureExchangeSummary` 需支持 pending 表达：`statusCode` 与 `durationMs` 可缺省，Renderer 据此渲染进行中状态。`appId` / `appName` 同样可缺省（非 Windows、远程客户端、反查失败）；反查排队期间额外带 `appPending: true`（见 8.4）。

事件批次 `CoreEventBatch` 除 `events` 外带可选 `clientApps: ClientAppIdentity[]`，只携带本批新出现的应用身份（见 8.5）。

队列合并行为：同 id 事件就地合并，**保留首次 sequence、摘要取最新、kind 不更新**。因此 `exchange-added` 尚未 drain 时到来的 `exchange-updated` 会被正确压成一条 added。

推送节奏与背压：`CoreApplication` 用 `EVENT_FLUSH_INTERVAL_MS`（50ms）定时器持续 `drain`，并在收到 `event-ack` 后立即再 flush 一次，**与 Exchange 的生命周期阶段无关**。单批上限 `EVENT_DRAIN_BATCH`（200 条），未 ack 批次上限 `EVENT_INFLIGHT_WINDOW_SIZE`（8 批），窗口满或无 RPC 连接时本轮跳过、事件留在队列里继续合并。

由此产生的可见语义：每次 `patch()`（含每个 body chunk）都会同步 enqueue，但 UI 收到的是**每 50ms 一帧的最新快照**，而不是每个 chunk 一帧。中间值会被跳过（例如 `responseBytes` 不会逐块呈现），这是保护数据面与限制 IPC 频率的有意取舍。

### 9.3 Renderer 命令

| 命令 | 用途 |
| --- | --- |
| `sessions.query` | keyset 分页拉取 summary |
| `sessions.detail` | 单条完整 headers 与 body 引用 |
| `body.read-range` | 按 hash + offset + length 读取正文片段 |
| `body.export.start` | Save body：把完整正文流式写到用户选定文件，不受预览上限限制 |
| `websocket.frames` | WebSocket 帧分页 |
| `websocket.breakpoint.enable` | 为当前 exchange 启用 direction / frames 配置 |
| `websocket.breakpoint.disable` | 停用当前 WebSocket 帧断点 |
| `grpc.messages` | gRPC envelope 分页 |
| `proxy.start` / `proxy.status` / `proxy.setRecording` | 生命周期；Renderer 的 Stop 映射为 `setRecording{false}` |
| `capture.cleanup` | Clear |
| `capture.replay` | 按 `exchangeId` 把已录制的请求经本地代理原样重发（见 9.4） |

`proxy.stop` 不对 Renderer 开放常规入口，仅在 Main 的紧急修复路径中调用。

**按需解码**：`sessions.detail` 返回 `CaptureExchangeDetail`，正文经 `body.read-range` 按 hash 分块。带 `decode` 的请求由 `proxy/utils/index.ts` 按 gzip / deflate / brotli **多层且容错**地流式延迟解压，再按明文字节 `offset + length` 返回range并回传`end`与`decodeStatus`——正文本身始终按线上编码保存（见 6.4）。

**IPC字节范围**：`TypedArray.subarray()`共享底层ArrayBuffer，V8序列化可能携带整个buffer；返回有界range时需要独立字节存储，不能只靠view的`byteLength`判断实际传输量。

**gRPC framing 不读整段正文**：`grpc/entry.ts` 的 `GrpcService` 通过 `grpc/utils/index.ts` 解析 5 字节 envelope——每条只从 Blob 读 5B header，再按 payload length 跳到下一个 offset。payload 继续走既有的 range 读取，不需要新的存储结构。

**BodyViewer嵌套滚动契约**：正文pane内容溢出时由pane自身滚动；到达顶部/底部后继续同方向wheel必须交给Inspector外层scroll，不能由Monaco永久消费。产品`CodeViewer`与design-vite `MonacoFixture`都必须显式使用`alwaysConsumeMouseWheel:false`。外框可用`overflow:hidden`裁切圆角，但不得关闭Monaco内部scrollbar或阻断边界后的scroll chaining。

**BodyViewer填充**：`BodySection`通过grow Section把正文pane贯通到Inspector剩余高度；Compact高度按4.2节的内容高度与实际边框计算。

**Inspector分组折叠契约**：General、headers/trailers、request line、query、body、timing与cookies各自持有独立展开状态。标题是实际接收点击的button，使用`aria-expanded`表达状态、`aria-controls`指向由`useId()`生成的唯一正文id；正文折叠时保持挂载，只切`hidden`，避免BodyViewer等内部状态因收起而销毁。稳定automation ID由调用处按业务语义传给共享`SectionHeader`，共享primitive不硬编码feature ID。

WebSocket 与 gRPC 的意图 API 把 payload 原样转交，Core protocol 只校验 RPC 信封 / version / 关联字段，不对 payload 做运行时语义校验。

### 9.4 请求重放

`capture.replay { exchangeId }` 让 Core 把一条已录制的 HTTP 请求经本地代理原样重发一次。Renderer 只传 `exchangeId`；原始请求本来就在 Capture 存储里，正文不经 IPC 搬运。

**取原始请求**

| 内容 | 来源 |
| --- | --- |
| method / url | `detail.summary.method`、`detail.url` |
| 请求头 | `detail.requestHeaders` 中未带 `ruleEffect` 的行，保持原顺序与大小写 |
| 请求正文 | 有 `requestBodyEffect` 时用 `originalBody`（`originalState === 'available'`），否则用 `requestBody` |
| 完整性 | `getExchangeBodySnapshot(exchangeId, 'request').complete` 且 `truncated !== true` |

**原样发送**

- h1 请求行用捕获的 absolute URL；h2 用捕获的 `:method`/`:path`/`:scheme`/`:authority`。h2 伪首部按 `:method`/`:path`/`:scheme`/`:authority` 的固定顺序重建，值取自捕获，顺序可能与原始请求不同。
- 请求头全部原样，包括 hop-by-hop；`content-length`/`transfer-encoding` 不做二选一；`expect: 100-continue` 原样。
- 正文按线上编码字节流式发送，不解压、不重编码。

只有 3 处非内容差异：HTTP/1.0 升级为 1.1；原请求没有 `host` 时 `setHost:false` 不补；原请求没有 `connection` 时 Node 补 `Connection: close`（hop-by-hop，代理不转发）。

**前置检查与失败原因**

| reason | 条件 |
| --- | --- |
| `not-found` | exchange 已不存在 |
| `unsupported-exchange` | WS / gRPC / Tunnel / 非 HTTP 协议 |
| `proxy-not-listening` | 代理 listener 未监听 |
| `https-not-decrypted` | HTTPS 且该 host 未解密（含 passthrough 名单） |
| `request-body-unavailable` | 正文仍在写入、未捕获或已丢失 |
| `request-body-truncated` | 正文被截断 |
| `send-failed` | 连接代理、CONNECT 或写 socket 失败 |

失败只返回 `ok:false`，不发请求。发送之后的失败（源站 reset、超时）由新行的 `state`/`errorCode` 呈现，不算命令失败。

**新行归属正常管线**：`ReplayService` 不写 Capture、不造 summary、不碰事件队列；新行只能由 `ExchangeTracker.beginRequest()` 创建。
