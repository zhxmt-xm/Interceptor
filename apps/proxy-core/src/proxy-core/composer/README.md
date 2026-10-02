# composer

**执行 Renderer 主动构造的 HTTP 请求。** 与 [`proxy/`](../proxy/README.md) 无关——proxy 是被动拦截经过的流量，composer 是用户在 UI 里手工发出的请求。

## 主类

`ComposerService`（`entry.ts`），唯一方法 `send(request, abortSignal?)`。
## 能力

支持 HTTP/1.1 与 HTTP/2（含 `auto` 协商），返回完整正文、时序分解和 TLS 摘要。网络错误不抛异常，转换为 `ok: false` 的结果供 UI 展示。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `ComposerService`：协议选择、请求发出、结果组装 |
| `internal/response-body.ts` | 响应正文收集与解码 |


调用方提供`AbortSignal`时，HTTP/1.1主动销毁`ClientRequest`，HTTP/2主动销毁stream与session，并返回稳定的
`Composer request was cancelled.`失败结果；不能只忽略晚到响应而让网络请求继续运行。

运行于Core时，出站TLS/H2使用`CoreApplication`统一拥有的
[Http2ClientService](../http2-client/README.md)。正常响应排空后收尾；TLS在响应完成前结束时以
`ERR_H2_UPSTREAM_INCOMPLETE`进入既有失败结果，不把缺响应头或缺END_STREAM当成成功。
取消、显式timeout与每次请求独立session的行为不变，Composer不重复注册进程级观察者。

## 依赖

无跨模块依赖。Composer 请求集合的持久化在 [`workspace/`](../workspace/README.md)（`collection_tree` 文档表）。
