# E2E Fixtures

本目录只负责真实 workflow 的环境、驱动与安全恢复，不维护 Capture 协议流量的第二套实现。

| 目录 | 职责 | 入口 |
| --- | --- | --- |
| `runtime/` | Electron 与 Browser Playground 的启动、证据、退出和 profile 保留 | [local-electron-driver.ts](runtime/local-electron-driver.ts)、[playground-server.ts](runtime/playground-server.ts) |
| `ui/` | 公共 automation 定位、Capture/Breakpoint/Playground 操作、真实 Windows 文件 Dialog | [automation.ts](ui/automation.ts)、[capture-workflow.ts](ui/capture-workflow.ts)、[breakpoint-workflow.ts](ui/breakpoint-workflow.ts) |
| `safety/` | 宿主进程代际、系统代理与 journal 恢复保护 | [workflow-host-safety-guard.ts](safety/workflow-host-safety-guard.ts) |
| `agent/` | 可控的 OpenAI-compatible 流式回复、Tool Call 与模型请求证据 | [openai-compatible-lab.ts](agent/openai-compatible-lab.ts) |

已有辅助单测随所属目录放在 `tests/unit/`，验证驱动自身的安全和状态判断，不替代真实 Electron workflow。

## 协议流量

唯一协议流量库是 [Playground TrafficLab](../../../../playground/server/scenarios/traffic-lab.ts)。
每条需要流量的 workflow 由 `trafficLab` fixture 创建一份实例并统一关闭；以下 fixture 是该实例的协议服务：

| Fixture | 能力 |
| --- | --- |
| `httpTrafficRunner` | HTTP origin、显式代理请求、自定义 status/headers/body、响应挂起与释放、主动取消、origin 观测 |
| `webSocketTrafficRunner` | WebSocket origin、长连接客户端、双向消息、广播、关闭码与真实断开证据 |
| `tlsTrafficRunner` | HTTPS/H2/gRPC/CONNECT 共用的 TLS origin、ALPN、握手次数和应用字节观测；按需创建 |
| `trafficLab` | 运行 Playground 原有场景目录，统一管理全部协议服务 |

测试可以直接使用这些 Node 流量 API，不必启动 Browser。需要验证 Playground 页面或 Browser MCP 时，
使用 `playgroundServer` 和 [Playground UI 驱动](ui/playground-capture-workflow.ts)。
这些 API 只控制外部流量，不操作 Interceptor Store、Preload 或内部业务 API；产品操作仍通过真实 UI。

协议类分工与原始 WebSocket 控制的限制见 [服务端说明](../../../../playground/server/README.md)。
新增 HTTP、HTTPS、HTTP/2、WebSocket 或 gRPC 流量能力放在 Playground，直接通过实际场景或已有真实 E2E 验证，不为测试设施新增单元或集成测试。
不要在本目录重新添加协议 origin/client lab。OpenAI 模拟不属于 Capture 协议场景，独立保留。