> 返回 [Capture 索引](README.md)

## 11. 验证边界

- 规则命中时的慢上传：Origin 在第二块正文发出前收到 headers。
- 规则命中时的下载：响应头先于源站正文结束到达客户端。
- 早期 401/413/417：Exchange 完整保留。
- 早期响应分别提交两侧正文；非413等待双向结束，完整413响应保存当时已捕获的上传片段。
- WebSocket 上游升级失败判为 `aborted` 而非停在 `pending`（回归用例 *marks the exchange aborted when the upstream websocket upgrade fails*）。
- WebSocket 升级期间客户端断开时，已建立的上游连接被关闭（回归用例 *closes the upstream websocket when the client disconnects during the upgrade*）。
- Clear 后旧 generation 的迟到事件被全部丢弃。
- WebSocket 捕获在退订 completed 事件后仍完整。
- gRPC `grpc-status` trailer 在退订 completed 事件后仍可读。
- H1 / H2 / HTTPS MITM 三条链路上压缩正文双向逐字节保真，且 bodyRef 记录了还原所需的 `mediaType` 与 `contentEncoding`（回归用例 *forwards compressed bodies byte-for-byte …*）。
- WebSocket 文本（多字节 UTF-8）与二进制（全 256 字节值）消息回显与落库逐字节一致，未编辑的断点不做 hex/utf8 回转（回归用例 *forwards and stores websocket text and binary payloads byte-for-byte*、*keeps binary websocket payloads intact through an unedited breakpoint*）。
- 67 MB Range 视频：全程流式，Core 内存峰值不随文件大小线性增长。
- SSE 与无限 chunked 响应：行立即出现，字节持续增长。
- Pause 前开始、Pause 后完成的请求继续记录。
- Header规则效果与四组wire headers分别核对，不能用effect marker代替真实传输证据。
