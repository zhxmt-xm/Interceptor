# 协议流量服务

这里是 Playground 与 E2E 共用的流量实现，不是另一份 Interceptor，也不读取产品内部状态。
[entry.ts](entry.ts) 是唯一启动文件，提供 Browser 的 Lab API；E2E 可直接使用
[scenarios/traffic-lab.ts](scenarios/traffic-lab.ts)，不会随导入启动网页。

根目录只保留启动文件和说明，代码按职责分为 `api/`、`scenarios/`、`http/`、`tls/`、`websocket/`，
跨协议共用的网络工具放在 `shared/`，不再套一层 `internal/`。

## 协议归属

| 类 | 协议和职责 | 实现 |
| --- | --- | --- |
| `TrafficLab` | 39项场景目录、Draft transport 校验、共享实例与统一关闭 | [scenarios/traffic-lab.ts](scenarios/traffic-lab.ts) |
| `HttpTrafficRunner` | 明文 HTTP/1.1、正文/编码场景、响应控制和 origin 观测 | [http/traffic.ts](http/traffic.ts) |
| `TlsTrafficRunner` | TLS-only、HTTPS/H1、HTTPS/H2、gRPC 与 CONNECT | [tls/traffic.ts](tls/traffic.ts) |
| `WebSocketTrafficRunner` | 唯一 WS origin、普通场景、持续连接及证据 | [websocket/traffic.ts](websocket/traffic.ts) |
| `ProxiedWebSocketClient` | 同文件内的共用代理客户端，不创建 origin | [websocket/traffic.ts](websocket/traffic.ts) |

### TLS 与 HTTP/2

`TlsTrafficRunner` 按传输边界命名，不是 HTTP/2 的别名：

- `runHttp2()`：TLS + ALPN `h2` 上的 HTTP 请求；
- `openHttp2Session()`与`runHttp2()`的可选session/受控response：复用同一TLS origin和CONNECT路径，在同一客户端连接发送多个stream；调用方可观察Node ClientHttp2Stream并只取消其中一条。未传选项的普通H2/TLS/gRPC场景保持原行为，共享session由调用方在全部stream结束后销毁。
- `runGrpc()`：复用同一TLS/H2 origin，发送gRPC envelope与trailers；可分别传入受控的`AsyncIterable<Uint8Array>`响应流、请求流，iterator结束时才结束对应side，用于实际双向streaming验收，不改Browser Draft或产品参数；
- `runTls()`：按 Draft 选择 CONNECT 后只握手，或继续 HTTPS/H1、HTTPS/H2；
- `port`、`handshakeCount()`、`applicationByteCount()`：供外部 TLS 探测使用，区分只握手和发送了应用数据。

一个开启 `allowHTTP1` 的 Node HTTP/2 TLS server 同时承载 H1/H2，避免各功能另造证书和 listener。
TLS stream 的 `bytesRead` 统计解密后入站字节，并累计已关闭连接；不能仅监听 `data`，H2 原生 parser 会直接消费 stream。
本地自签名证书只用于 origin，不写入系统信任库；Interceptor 的 MITM、insecure host 与 passthrough 仍由用户通过产品 UI 设置。

### WebSocket 客户端

WebSocket 实现集中在一个文件。`WebSocketTrafficRunner` 管 origin、场景与证据，`ProxiedWebSocketClient` 管连接与收发；
`run()` 和断点 workflow 都经过 `openThroughProxy()` 创建同一个客户端类，不再单独 `new WebSocket()`。

- `sendText()`、`sendBinary()`：完整消息，长度、mask 和分片重组由 `ws` 的 `Sender/Receiver` 负责；
- `sendPing()`、`sendPong()`：显式控制帧。普通场景在 `ping` 事件中回复，断点不被自动行为抢先处理；
- `sendCloseFrame()`：只发送 Close 帧，不进入关闭状态，代理挂起或丢弃该帧后仍可继续发送；
- `closeGracefully()`：发送 Close，等待对端关闭帧与 TCP 退出；失败或超时会回收连接并报告错误；
- `destroy()`：主动断开，保留客户端取消与 fixture 清理能力。

Node HTTP 负责解析 Upgrade，`HttpProxyAgent` 负责显式代理请求；客户端校验真实 `101` 和 `Sec-WebSocket-Accept`。
手写帧编解码和125字节文本限制已删除。`ws` 导出了底层帧组件，但当前 `@types/ws` 尚未声明，
同文件末尾的 module augmentation 仅补所用 API 的类型，不修改第三方实现，也不另拆类型文件。

## 生命周期与观测

- `TrafficLab.start()` 创建 HTTP 和 WS；`getTlsTrafficRunner()` 按需、并发共享地创建 TLS。
- 场景 run 与细粒度控制使用同一协议实例。HTTP 自定义响应、hold/release、abort 和 WS 广播不会创建另一套 origin。
- `request` 是 origin 实际收到的事实；`attempt` 是客户端尝试，连接失败时不得用 Draft 伪造 origin 记录。
- `close()` 释放 HTTP gate、销毁持续 WS 客户端和服务端 socket、取消 TLS/CONNECT 在途连接，再关闭 listener。
- E2E 的进程和 UI 驱动分类见 [fixture说明](../../desktop/tests/e2e-workflow-tests/fixtures/README.md)。OpenAI 模型模拟不属于该协议库。

已有历史测试保留在 [tests/integration](../tests/integration/)。按仓库规范，后续测试设施改动直接运行实际
Playground 场景或已有真实 E2E，按需 typecheck/build，不再新增或扩充“测试的测试”。