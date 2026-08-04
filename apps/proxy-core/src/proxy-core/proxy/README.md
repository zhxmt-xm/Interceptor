# proxy

**Mockttp 显式代理与 Exchange 采集。** 仅绑定 loopback，由 `proxy.start` / `proxy.stop` 显式控制。

## 主类

`ProxyService`（`entry.ts`）。用 Mockttp `getLocal()` 作显式代理：`thenPassThrough()` 转发 HTTP/1.1 absolute-form 请求；未配置 HTTPS 解密时对 CONNECT 做不解密的字节直通。

## 只订阅增量事件

Capture **只订阅 initiated / body-data 类事件，绝不订阅 completed 的 `request` / `response`**。Mockttp 一旦发现 completed listener，就会调用 `waitForCompletedRequest` 与 `body.asBuffer()` 无条件缓冲完整正文——那会让大文件下载吃满内存。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `ProxyService`：Mockttp 生命周期、TLS 配置、上游代理、规则钩子挂载 |
| `internal/exchange-tracker.ts` | `ExchangeTracker`：按 Mockttp request id 聚合单条 Exchange 的完整生命周期 |
| `internal/capture-event-queue.ts` | `CaptureEventQueue`：有界合并队列，摘要经背压窗口推给 Renderer |
| `internal/websocket-bridge.ts` | `WebSocketBridge`：WebSocket 帧转发与断点挂起 |

## ExchangeTracker 的顺序前提

Mockttp 的 `request-initiated`、`*-body-data`、`*-trailers` 都经 `setImmediate` 异步发出，而规则钩子走独立 Promise 链，**两者顺序不保证**。因此所有入口都是幂等 upsert；规则结果若先于 `request-initiated` 到达，先存进孤儿表，待 Exchange 建立后合并。

每条 Exchange 用自己的 `tail` Promise 串行化存储写入，保证顺序且不阻塞事件回调。

## 依赖

- 依赖：`capture/`（写入抓包数据）、`rules/`（请求/响应评估）、`client-app/`（源端口反查应用）、`diagnostics/`
- 被依赖：`har/`（复用正文解码工具）
