# 已知缺口与长期候选

> 最后更新：2026-08-05
> 范围：当前**未实现**的能力。分三档——已知缺口（当前架构的确定性欠账）、长期候选（未承诺、需重新设计）、研究备忘（技术策略，不是产品路线）。
>
> 当前真正在推进的工作看 [../HANDOVER.md](../HANDOVER.md)、[idea.md](idea.md) 与 [TODO.md](TODO.md)；本文只是"还没有做什么"的清单。

## 1. 已知缺口

这些是当前实现明确知道的边界，通常有具体的阻塞原因。

| 缺口 | 阻塞原因 |
| --- | --- |
| Local E2E 的 60 条 feature workflow | driver、fixture、automation contract 与验收规格都已就绪，`workflows/` 为空，尚未实现任何一条 |
| HTTP/2 深度 stream 健壮性（streamId / GOAWAY / RST / settings / 背压） | Mockttp 未暴露，需要原生 http2 数据面 |
| WebSocket over HTTP/2（RFC 8441 Extended CONNECT） | 当前只支持 RFC 6455 的 HTTP/1.1 Upgrade |
| gRPC 实时 streaming 增量 framing、message-level 解压、Protobuf descriptor 与 Server Reflection | 当前是完成后的 raw message 展示 |
| h1 下游 → 纯 h2 上游（源站 `allowHTTP1:false`） | Mockttp 返回 403。真实世界罕见的边缘组合，已移除该失败用例并记为限制——"支持 HTTP/2"不等于支持这个组合 |
| 真正零内存流式正文落盘 | 当前经内存缓冲后写内容寻址 Blob，body-data 增量写盘留后续 |
| 每 exchange 的上游 TLS metadata 落库 | Mockttp 未暴露数据面上游 TLS；当前用按需 `tls.probe` 实时探测替代 |
| CA 导出 | 未实现 |
| 上游认证代理（`Proxy-Authorization`） | `proxyUrl` 支持 `http://user:pass@host:port`，但 WinINet 不保存凭据，需要用户手工提供，未验证 |
| macOS 上游代理检测 | 快照按网络服务分开存，多服务（Wi-Fi / 以太网 / VPN）可能各配不同代理，需先定义合并语义 |
| 生产签名 / 公证 | Windows Authenticode、Apple Developer ID 与 notarization 需要仓库外凭据和原生 runner 留证 |

## 2. 长期候选

来自最初的产品方案，至今未实现。**均未承诺，且需要重新设计**——原始表述写于当前架构成型之前，不能直接照搬实施。

- **Replay**：基于捕获会话重放请求。当前 Composer 可手工发送并有 Recent sends，但 Capture → Composer 的复制仍未实现。要做需要先定义：复制哪个请求版本（wire 还是规则改写后）、认证/Cookie 如何处理、是否再次经过 Rules、重放证据怎么记。
- **Reverse Proxy / Port Forwarding**：独立产品线，当前没有任何对应架构、UI 或排期。
- **带身份验证的局域网远程设备捕获**：技术上合理，但与当前 loopback-only 的安全边界冲突很大，必须重做认证、暴露面和威胁模型。
- **macOS 透明捕获（Network Extension）/ Windows WFP 透明捕获**：平台与安全研究方向，不能与普通 feature backlog 混排。
- **RTL（从右到左）布局**：15 种语言已实现，RTL 未实现。

## 3. 研究备忘

技术策略，不是产品路线图。

### 3.1 用 Node 原生模块自建数据面

- **动机**：吃透 HTTPS 代理的底层——TLS MITM、动态签发站点证书、HTTP/1.1 与 HTTP/2 双向转换、流控与背压。这些是本产品最核心的知识。
- **范围**：用 `node:http`、`node:http2`、`node:tls`、`node:net` 逐步替换 Mockttp 承担的拦截职责，规则/会话/存储/IPC 边界保持不变。
- **现在不做的原因**：学习和实现曲线陡峭，当前阶段优先做出可用产品。而且当前实现已经为 Mockttp 维护了 patch 并围绕其事件模型构建了 Capture/Rules，替换等于重做整个核心数据面。
- **与性能无关**：Mockttp 本身就是纯 TypeScript、构建在同样的 `node:*` 模块之上，自建不会带来数量级性能提升，两者上限都受 Node 运行时限制。自建的价值是掌控与理解。
- **真要做的方法**：以 Mockttp 的实际行为作为「正确性参照物」，一次只用原生实现一个子模块（先 HTTP/1.1，再 HTTP/2），与 Mockttp 对照验证。可用 LLM 辅助生成代码，但必须逐行读懂、自己 debug；MITM 的边界情况（Trailer、GOAWAY、畸形帧、ALPN、证书链、编码组合）需要主动补齐，LLM 默认只给 happy path。

### 3.2 Rust 数据面

- **触发条件**：真实遇到 Node 数据面无法通过的性能门槛，或想借项目系统学习 Rust。**当前没有任何性能基准证明需要它。**
- **技术选型**：Hudsucker 作 MITM 基础，Hyper/Tokio 负责 HTTP 与调度，rustls 负责 TLS，rcgen 负责动态证书。
- **现实成本**：Rust 语言 + Tokio 异步 + 系统级网络编程三重难度叠加；且如 3.1 所述，等于重写整个数据面，不是平滑替换。
- **可复用资产**：持久化格式、Archive 格式、规则模型和传输无关的 Command 语义可作为迁移基础；Electron MessagePort 与 TypeScript Schema 不直接复用，届时按真实约束新增跨语言 Transport 和编码层。
