# grpc

**从已捕获的 HTTP 正文里跳读原生 gRPC envelope。**

## 主类

`GrpcService`（`entry.ts`），注入 `CaptureService`，唯一方法 `query(query)`；在途与已结束正文都通过Capture的Exchange/side读取。

## 只读 header，不读 payload

gRPC 的 length-prefixed envelope 是 5 字节头（1 字节压缩标志 + 4 字节大端长度）+ payload。分页扫描时**只按 range 读那 5 个字节**，用长度直接跳到下一个 envelope，因此翻页成本与正文大小无关。

Renderer需要某条message的实际内容时，走`grpc.read-range { exchangeId, side, offset, length }`；完成后的专用Copy仍可用`body.read-range`。两条路径都读取Capture已有正文，不另存一份stream。

## 在途消息

查询结果独立返回`bodyAvailable`、`bodyComplete`与当前可读`bodySize`；`bodyHash`只在正文提交后出现。在途只列出payload已收齐的message，半个5-byte header或payload等待后续字节，不标为malformed/truncated。未结束时`nextCursor`即使`hasMore=false`仍指向下一条或尚未收齐的envelope，Renderer续读不会从头扫描或重复已有消息。

正文结束后保留原有损坏header和截断payload报告；没有收到的grpc-status/trailers不提前生成。Renderer每350ms续读尚未结束且当前页读尽的body，切换side或Exchange后忽略旧异步结果，完成后停止轮询。

## 游标

不透明游标编码 `grpc:<side>:<offset>:<index>`。side 与请求不符、offset非安全整数或超过当前快照可读长度时抛 `InvalidGrpcCursorError`（`internal/errors.ts`），CoreApplication 映射为不可重试的 `invalid-message`。offset等于当前末尾合法：在途保留续读游标，已结束则不返回下一游标。

## 识别范围

只识别原生 gRPC（`application/grpc*`）。`application/grpc-web*` 的分帧不同，返回 `recognized: false`。

## 依赖

- 依赖：`capture/`（Exchange detail 与 Blob range 读取）
