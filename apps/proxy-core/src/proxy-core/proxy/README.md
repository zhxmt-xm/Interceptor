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

## 上游平台边界

- Windows保持单转发规则与`{ proxyUrl, noProxy }`配置，原CONNECT/WebSocket处理不变。
- macOS按HTTP/HTTPS注册相同头部处理逻辑，接收`httpProxyUrl / httpsProxyUrl / exceptions / excludeSimpleHostnames`。
- macOS WebSocket复用Mockttp的HTTP/SOCKS/PAC agent；选择发生在Core，不改系统代理或读取journal。
- Main负责接管前配置和生命周期下发；Core只按当前配置转发，旧代际缓存随连接关闭清理。

## ExchangeTracker 的顺序前提

Mockttp 的 `request-initiated`、`*-body-data`、`*-trailers` 都经 `setImmediate` 异步发出，而规则钩子走独立 Promise 链，**两者顺序不保证**。因此所有入口都是幂等 upsert；规则结果若先于 `request-initiated` 到达，先存进孤儿表，待 Exchange 建立后合并。

每条 Exchange 用自己的 `tail` Promise 串行化存储写入，保证顺序且不阻塞事件回调。`pendingExchangeWrites`单独跟踪尚未结束的写入，完成后移除；记录进入终态或reset不丢弃排空责任。`settle()`等待调用时已接受的那一批，不依赖活动Exchange数量，也不等待之后的新流量。

请求与响应正文独立finalize，正常提前响应不会丢弃后续上传。413仅在完整响应结束后保存当时已捕获的上传并结束Capture记录，迟到上传不再追加；不关闭真实连接或修改Mockttp。终态保留`completedAt`，应用归属晚到时不得覆盖终态和耗时。

中断等统一收尾中，两侧正文提交和Exchange终态分别排入同一串行队列。任一正文提交失败只记录该次`capture.persist-failed`，另一侧仍完成并保留成功正文，Capture详情仍写入实际终态及已观察字节；不因捕获文件失败改变网络转发。

`ProxyService.stop()`在关闭监听器后排空存储；`prepareCaptureReset()`在推进generation后先排空Exchange写入，再等待WebSocket等Capture操作，最后才允许调用方清理正文。Recording暂停不走此关闭流程，不停止转发。

正文规则结果与`request-body-data`同样可能乱序。`ExchangeTracker`把RuleService的最终replacement
写为主Request/Response Body ref；客户端request stream另作为Original保存到
`requestBodyEffect.originalBody`。Request空原文记`empty`，Response在headers-stage替换时不缓冲
origin正文并固定记`unavailable`。规则结果先到或body-data先到都经同一条`tail`收敛，不从Rule hit
反推证据。

## 依赖

- 依赖：`capture/`（写入抓包数据）、`rules/`（请求/响应评估）、`client-app/`（源端口反查应用）、`diagnostics/`
- 被依赖：`har/`（复用正文解码工具）
