# composer

**执行 Renderer 主动构造的 HTTP 请求。** 与 [`proxy/`](../proxy/README.md) 无关——proxy 是被动拦截经过的流量，composer 是用户在 UI 里手工发出的请求。

## 主类

`ComposerService`（`entry.ts`），唯一方法 `send(request)`。

## 能力

支持 HTTP/1.1 与 HTTP/2（含 `auto` 协商），返回完整正文、时序分解和 TLS 摘要。网络错误不抛异常，转换为 `ok: false` 的结果供 UI 展示。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `ComposerService`：协议选择、请求发出、结果组装 |
| `internal/response-body.ts` | 响应正文收集与解码 |

## 依赖

无跨模块依赖。Composer 请求集合的持久化在 [`workspace/`](../workspace/README.md)（`collection_tree` 文档表）。
