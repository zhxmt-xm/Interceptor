# Feature: Capture

> Core 模块：`apps/proxy-core/src/proxy-core/proxy/`、`apps/proxy-core/src/proxy-core/capture/`、`apps/proxy-core/src/proxy-core/client-app/`
> Renderer 模块：`apps/desktop/src/renderer/features/capture/`；正文查看器内核 `apps/desktop/src/renderer/components/BodyViewer/`

## 目录

| 文档 | 内容 | 何时读 |
| --- | --- | --- |
| [contract.md](contract.md) | Core 内部接口、事件契约与数据格式 | 改命令、事件、字段或状态值时先读 |
| [state-machine.md](state-machine.md) | Exchange 状态机、流式记录边界 | 改完成、失败、中断判定时 |
| [flow/](flow/README.md) | HTTP/HTTPS、CONNECT、WebSocket、早期响应、中断、透明刷新分篇 |
| [events.md](events.md) | Mockttp 事件语义与 wire 事实 | 改事件订阅或 header/body 观察时 |
| [body-storage.md](body-storage.md) | 正文增量写入、阈值、背压、编码 | 改正文保存与读取时 |
| [recording.md](recording.md) | Recording、Pause、Clear 与 generation | 改录制状态时 |
| [client-app.md](client-app.md) | Windows 客户端应用归属与显示名 | 改来源识别时 |
| [renderer-data.md](renderer-data.md) | Renderer 数据层：列表、筛选、Inspector | 改 Capture 界面数据时 |
| [android.md](android.md) | Android 协议副本录制 | 改 ADB/Android 来源接入时 |
| [verification.md](verification.md) | 验证边界与必须覆盖的场景 | 准备验收与选择证据时 |

## 1. 职责与边界

Capture 负责**观察并记录**经过代理的全部流量事实，不参与转发决策。

| 归属 | 内容 |
| --- | --- |
| Capture 负责 | Exchange 生命周期、正文落盘、WebSocket 帧、CONNECT 隧道元数据、事件推送 |
| Capture 不负责 | 转发、改写、阻断、断点挂起（属于 Rules） |

**核心原则**

> 收到 request headers 的瞬间就创建 Exchange、写入存储、推送 Renderer。此后的 request body、Rule 效果、response headers、response body、trailer、abort 全部是对**同一个 Exchange** 的增量更新。

Capture 绝不等待请求或响应完成才建立记录。实现位于 `proxy/internal/exchange-tracker.ts` 的 `ExchangeTracker`。

## 2. 参与者

| 参与者 | 归属 | 职责 |
| --- | --- | --- |
| Client | 外部 | 浏览器或应用，经系统代理指向 `127.0.0.1:8888` |
| Mockttp | Core 内库 | 接入连接、TLS/H2 协商、上游转发、生命周期事件 |
| `ProxyService` | `proxy/entry.ts` | 拥有 Mockttp server，订阅事件，协调规则与存储 |
| `RuleService` | `rules/entry.ts` | 计算规则决策（详见 feature-rules） |
| `CaptureService` | `capture/entry.ts` | Exchange 记录、正文内容寻址存储 |
| `ClientAppService` | `client-app/entry.ts` | 把客户端源端口反查成发起流量的本机应用（见 8） |
| `CaptureEventQueue` | `proxy/internal/capture-event-queue.ts` | 按 Exchange 合并的非阻塞事件队列 |
| `CoreApplication` | `core-application.ts` | 定时 drain 队列，按背压窗口推送 |
| Main | Desktop | 转发 event batch，不持有正文 |
| Renderer | Desktop | 应用事件到 Zustand，按需拉详情 |
| Origin | 外部 | 真实源站 |

**ProxyService 是本机显式代理请求的唯一协调者**，因为它同时处在Mockttp事件订阅和规则执行两条路径上。Android协议副本由HttpChannel协调PC决定、HttpRecording记录实际应用结果；实际网络仍归Android，不能借Capture让PC重复请求源站。

`ProxyService` 用 `mockttp` 的 `getLocal()` 作显式代理，**只绑 loopback**，由 `proxy.start` / `proxy.stop` / `proxy.status` 三个命令显式控制；Renderer 的 Capture bootstrap 在 Core running 后自动调用 `proxy.start(8888)`。未配置解密时 CONNECT 走字节直通（见 5.2）。Core 运行时依赖（Mockttp 的 WASM / 原生插件、`ws`）不内联进 bundle，随包策略见 [../platform/release.md](../../platform/release.md)。
