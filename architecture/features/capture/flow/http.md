> 返回 [Capture 索引](../README.md)｜[调用流程](../README.md)

### 5.1 HTTP/HTTPS 常规请求（主路径）

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleService
    participant Storage as CaptureService
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
    Proxy->>Storage: 记录请求 rule effects

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
    Proxy->>Storage: 记录响应 rule effects

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
    Note over Proxy: 普通请求等待请求侧也结束；完整413响应适用提前收尾例外
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
8. **终态**：两侧正文结束后写入`completedAt`与`state: 'completed'`；完整413响应适用4节的提前收尾例外，中断则保留部分正文并进入`aborted`。
