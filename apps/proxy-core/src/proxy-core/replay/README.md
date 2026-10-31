# replay

**把一条已录制的请求经本地代理原样重发。** Renderer 只给 `exchangeId`，原始请求头与正文由 Core 从 Capture 存储读取，再用本地代理客户端发回 `127.0.0.1:8888`；新 Capture 行由 Mockttp 正常管线创建，本模块不写存储。

## 主类

`ReplayService`（`entry.ts`），唯一方法 `replay(exchangeId, abortSignal)`。

## 目录

| 路径 | 内容 |
| --- | --- |
| `entry.ts` | `ReplayService`：读取原请求、前置检查、调用代理客户端 |
| `interfaces/index.ts` | `ReplayRequest` / `ReplayHeader` / `ReplaySendOptions` |
| `utils/index.ts` | 无状态还原：原始头、原始正文引用、h1/h2 header 组装 |
| `internal/proxy-client.ts` | `ProxyClient`：HTTP absolute-form、HTTPS CONNECT+TLS、h2 ALPN |
| `internal/tunnel.ts` | CONNECT 隧道与应答解析 |
| `internal/constants.ts` | CONNECT 超时与应答头上限 |

## 细节

- 原始头取 `requestHeaders` 中未带 `ruleEffect` 的行；正文优先 `requestBodyEffect.originalBody`，否则用 `requestBody`。
- 原样发送：URL、headers（含 hop-by-hop）、正文编码字节都不改；只有 HTTP/1.0→1.1、缺少 `host` 时的 `setHost:false`、Node 自动补的 `Connection: close` 三处非内容差异。
- `agent:false` 会让 Node 忽略 `createConnection` 另开 TCP 连接，HTTPS 必须用专用 agent 复用隧道。
- 返回时只保证请求已写入代理连接；响应与发送后的失败由新 Capture 行承载。

## 依赖

`capture/entry.ts`（读原始请求）、`proxy/entry.ts`（监听端口与按 host 的解密判定）。
