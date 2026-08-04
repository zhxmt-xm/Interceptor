# grpc

**从已捕获的 HTTP 正文里跳读原生 gRPC envelope。**

## 主类

`GrpcService`（`entry.ts`），注入 `CaptureService`，唯一方法 `query(query)`。

## 只读 header，不读 payload

gRPC 的 length-prefixed envelope 是 5 字节头（1 字节压缩标志 + 4 字节大端长度）+ payload。分页扫描时**只按 range 读那 5 个字节**，用长度直接跳到下一个 envelope，因此翻页成本与正文大小无关。

Renderer 需要某条 message 的实际内容时，再单独走 `body.read-range`。

## 游标

不透明游标编码 `grpc:<side>:<offset>:<index>`。side 与请求不符或 offset 越界时抛 `InvalidGrpcCursorError`（`internal/errors.ts`），CoreApplication 映射为 `invalid-message`。

## 识别范围

只识别原生 gRPC（`application/grpc*`）。`application/grpc-web*` 的分帧不同，返回 `recognized: false`。

## 依赖

- 依赖：`capture/`（Exchange detail 与 Blob range 读取）
