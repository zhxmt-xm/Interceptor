# http2-client

**Core 进程的出站 TLS/H2 客户端生命周期。** `CoreApplication` 拥有唯一的
`Http2ClientService`；覆盖 Mockttp 上游和 Composer，不订阅 Main、Renderer 或其他进程的连接。

## 主类与边界

`Http2ClientService`（`entry.ts`）在 Core 启动时订阅 Node 公开的
`http2.client.stream.created`，停止时注销订阅并等待已观察 session 关闭。
明文 H2、TLS 握手探测和入站 server session 不修改。

- 通过公开 `session.socket.allowHalfOpen` 保留 TLS EOF 后尚未被消费者读完的 H2 缓冲。
- TLS EOF 后用 `session.close()` 拒绝新 stream；在途 stream 仍按各自背压排空。
- EOF 与消费者 `resume` 后延迟到 `setImmediate` 检查，避免将待派发的 DATA.END_STREAM
  误判为截断。没有最终响应头，或消费者已排空但仍未收到正常结束时，以
  `ERR_H2_UPSTREAM_INCOMPLETE` 失败；不伪造 `end` 或成功结果。
- 不注册 `data` / `readable` 消费监听，不复制正文、不重放请求、不替换依赖内部方法。
- stream/session 结束或 Core 停止时，移除自身监听和排空检查；不移除调用方的监听。
- 该模块不采集原始 SETTINGS/RST_STREAM/GOAWAY 帧，不猜测 Mockttp request id。

## 目录

| 位置 | 职责 |
| --- | --- |
| `entry.ts` | 唯一 `Http2ClientService`、公开事件订阅与连接收尾 |
| `interfaces/` | Node channel payload 与 session/stream 观察状态 |
| `internal/errors.ts` | 提前 TLS EOF 的显式错误 |
| `tests/integration/` | 真实 TLS/H2、Core 启停与 Composer 回归 |

## 依赖

- Node `diagnostics_channel`、`http2`、`tls` 和 `CoreDiagnostics`。
- 由 `CoreApplication` 装配，不让 Proxy 或 Composer 各自重复注册进程订阅。
- Proxy 的 Capture 与 trailer 完整性回归位于
  [h2.test.ts](../proxy/tests/integration/h2.test.ts)。
