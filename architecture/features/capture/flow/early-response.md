> 返回 [Capture 索引](../README.md)｜[调用流程](../README.md)

### 5.4 早期响应（HTTP）

**终态场景总览**（5.4 与 5.5 合并对照）：

| 场景 | Mockttp 发出的事件 | Capture 结果 |
| --- | --- | --- |
| HTTP 413拒绝上传 | `response-initiated` → `response-body-data isEnded` | 完整413响应后`completed`，保留收尾时已捕获上传正文 |
| 其他HTTP早期响应 | 两侧`*-body-data isEnded`，或实际`abort` | 双向结束后`completed`；真实中断则`aborted`并保留已捕获正文 |
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
    participant Rules as RuleService
    participant Storage as CaptureService
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
    Proxy->>Proxy: finalizeResponseBody
    Proxy->>Storage: 绑定responseBody，响应可读
    alt 413响应或上传已经完整结束
        Proxy->>Proxy: 413时finalize仍在写入的requestWriter
        Proxy->>Proxy: completeExchange
        Proxy->>Storage: state completed并保留已捕获正文
        Proxy->>Queue: enqueue终态与耗时
        Queue-->>UI: 更新记录，后续归属更新保持终态
        Note over Proxy: entry已移除，迟到上传/中断不再追加
    else 非413且上传仍在继续
        Client->>Mockttp: 后续请求体分块并结束
        Mockttp-->>Proxy: request-body-data isEnded
        Proxy->>Proxy: finalizeRequestBody + completeExchange
        Proxy->>Storage: 完整上传正文及state completed
    end
```

**响应与上传是并行的两条通道。** 早期响应头一到就会被 Mockttp 转发给客户端，Capture 也立刻
`patch` 出 `response-streaming` 并入队推给 Renderer——**不需要等上传结束**。此时客户端的上传通道
仍然开着，继续发还是放弃完全由客户端决定（很多 HTTP 客户端收到 4xx 后仍会把已排队的分块发完）。
413完整响应后Capture收尾，后续事件不再追加；其他状态码保留仍在上传的entry，直至上传结束或收到真实中断事件。

**终态不会因迟到事件回退。** `completeExchange`与`finishExchange`都会保存收尾时间并移除entry。
普通请求必须等两侧正文结束；413例外只要求完整响应及当时已捕获上传保存完毕。它表示Capture记录已结束，
不表示客户端全部上传都到达origin，也不主动关闭真实连接。后续应用归属摘要仍保留终态和同一耗时。

Exchange在请求头阶段建立，早期响应合并到同一记录。移除entry前，两侧writer必须分别finalize或abort，不能只移除引用而遗留正文或spill临时文件。
