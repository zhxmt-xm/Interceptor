# E2E Workflow 详细文档

本目录保存 Renderer E2E workflow 的完整人工可读验收规格。主 [`../README.md`](../README.md) 只维护职责、原则、Inventory、状态和运行方式；每条 workflow 的完整步骤放在以下分类文件中。

| 分类 | 详细文档 | Workflow 数量 |
| --- | --- | ---: |
| Application 与 Shell | [application-shell.md](application-shell.md) | 9 |
| Capture 与协议 | [capture.md](capture.md) | 38 |
| Rules | [rules.md](rules.md) | 15 |
| Composer | [composer.md](composer.md) | 11 |
| Breakpoints | [breakpoints.md](breakpoints.md) | 12 |
| Diagnostics | [diagnostics.md](diagnostics.md) | 6 |
| Agent | [agent.md](agent.md) | 13 |
| MCP | [mcp.md](mcp.md) | 3 |
| Settings 与 Updates | [settings-updates.md](settings-updates.md) | 27 |

总计：134 条 workflow 契约。管理员MMC原生专项另保留排除说明，不计入workflow数量。

## 文档约定

每条 workflow 必须是自包含的完整验收流程，不引用一个共享的“启动/关闭步骤”来省略生命周期。每条文档都应明确写出：

1. 创建独立临时 profile 和该 workflow 所需的 loopback fixture；
2. 使用平台driver启动一份新的真实Electron和本地production bundle：Windows为`_electron.launch()`，macOS为进程spawn加Renderer CDP；
3. 启动并保存该 workflow 自己的 trace；
4. 等待 App root、Core Running、真实 PID 和 8888 listener；
5. 从 App 初始 UI 开始，按顺序执行该 workflow 的全部点击、输入、菜单、弹窗和原生授权；
6. 写明每个关键步骤后的 UI状态、数据面结果和失败状态；
7. 保存 `trace.zip`、`final.png`、Main/Renderer 日志与 `metadata.json`；
8. 通过 `shell.window.close` 关闭 App；
9. 验证 Main、Renderer、Core、Worker 全退，8888 释放；
10. 删除该 workflow 的 profile 和 fixture。

### 相关前置状态原则

每条 workflow 都从相同的 fresh profile 启动，但**只检查与本流程直接相关的默认态**，不机械重复全 App 状态：

- Shell workflow：检查语言、主题、侧栏、窗口、active workspace、Core/listener；
- Capture workflow：检查 listener、System Proxy/readiness、Recording、Capture rows/filter/selection/Inspector，以及涉及的 CA/MITM 状态；
- Rules workflow：检查 RuleSet revision/rules/dirty/selection；只有真实 rule hit 流程额外检查 Proxy/Capture；
- Composer workflow：检查 Composer method/URL/protocol/default headers/body/auth/response/history；不检查无关的 Rules、Privacy 或 CA；
- Breakpoints workflow：检查 Break on match、queue/selection/draft，并因需要真实代理流量而检查 Proxy/Recording；
- Diagnostics workflow：检查 filters/selection/records；只有其输入动作涉及的子系统才检查相应前置；
- Agent workflow：检查 Panel、Provider、Session、Streaming、Context/Usage 与恢复；不读取或注入 Agent Store；
- Settings workflow：只检查目标 section 及其直接依赖，例如 Certificates 不重复检查 Composer，Updates 不重复检查 Capture。

禁止用“完整默认态”大段覆盖所有 feature。相关默认态仍必须通过真实 App UI 检查，不能通过 API/Store 读取代替。

### Readiness 决策

- 任何需要产生 Capture Exchange、Rule runtime hit 或 Breakpoint queue 的 workflow：必须从 App UI 点击 `capture.readiness.enable`并等待 Recording；普通workflow结束时直接Close，由Main退出流程恢复系统代理，只有专门验证Settings Proxy Restore交互的workflow才点击`settings.proxy.restore`；专门验证Settings Proxy入口的workflow改用同等真实的`settings.proxy.enable`；
- Composer 由 Core 直接出站，Rules 纯编辑、Diagnostics 纯查询、Shell 与无网络 Settings 不需要系统代理路由：验证 readiness 默认态后可点击 `capture.readiness.cancel`，并确认系统设置未修改；
- Import-only workflow 可 Cancel readiness；Export/Storage/Privacy workflow 若先制造真实 Capture，则必须 Enable；
- 不允许 Cancel readiness 后依赖 Core 内部仍 recording 的隐藏状态制造 Capture，这会与 UI 的 Paused/Not recording 语义冲突。

## Automation ID

所有 UI 操作必须引用 [`../../../src/shared/automation-ids.ts`](../../../src/shared/automation-ids.ts) 中的公共 ID，并通过 `getByAutomationId()` 或公共动态 ID factory 定位。文本和 role 只用于非交互断言。

动态数据行使用公共前缀/工厂：

- Capture Exchange：`capture.request-row.<exchangeId>`；
- WebSocket Frame：`capture.websocket.frame.<exchangeId>.<seq>`；
- gRPC Message：`capture.grpc.message.<exchangeId>.<side>.<index>`；
- Rule：`rules.row.<ruleId>`；
- Rule Folder：`rules.folder-row.<folderId>`；
- Composer Request：`composer.collection.request.<requestId>`；
- Composer Folder：`composer.collection.folder.<folderId>`；
- Diagnostics：`diagnostics.row.<traceKey>`。

## 零 Mock

本目录中的 workflow 均遵守零 Mock 原则：

- 不使用 fake Preload、Store 注入、Main/Core service mock 或测试专用 IPC；
- 不直接调用 `window.interceptor` 完成业务 arrange/act；
- 测试侧只允许提供真实 loopback 协议 origin/客户端、输入文件、证据采集与进程清理；
- UAC、macOS Authorization、Open/Save Dialog 等由 App 真实发起并由本机用户处理；
- 不能在零 Mock 条件下完成的流程保持 planned/blocked，不用低保真替代测试冒充通过。
