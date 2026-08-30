# Feature: Agent / MCP Tool 能力目录

> 最后更新：2026-08-30
> 代码所有者：`packages/interceptor-tools/`
> 使用方：内置 `AgentRuntime`、外部 MCP Server
> 当前状态：完整目标目录与Settings/问询UI设计已完成；`@interceptor/tools`仅完成Capability Index与discovery，
> `packages/mcp-server`现有20个Tool尚未迁入共享目录，Desktop尚未接入Agent/MCP业务Tool。

当前目录共77个目标Tool，名称全部唯一。该数字描述完整产品目标，不代表已有77个实现；每行“当前进度”
才是实现事实。新增、删除或拆分Tool时必须同步更新数量并重新检查重名。

## 1. 唯一目录

本文件是 Agent 与 MCP 可调用产品能力的唯一完整清单。实现时，每个 Tool descriptor 只在
`packages/interceptor-tools/` 定义一次；内置 Agent 与 MCP 复用同一名称、schema、执行函数和结果类型，
不复制两套 Tool。

目录只收录真实产品用户意图：查询、修改配置、控制代理、处理断点、发送请求和文件操作。
Agent 自身 Session/Provider 控制、MCP 接入控制、窗口导航、事件订阅和 Main/Core 内部编排不注册为 Tool，
见第 5 节。

状态含义：

- **MCP package**：当前 `packages/mcp-server` 已有实现，但尚未接入 Desktop，也尚未迁入共享目录；
- **产品已具备**：产品已有正式入口，Tool descriptor 与 Agent/MCP 接线待实现；
- **先补 intent**：产品 UI 已有能力，但缺少可供 Tool 复用的语义单一入口；
- **待产品实现**：产品本身尚无该能力，不先为 Tool 新建后门。

## 2. Settings 开关与执行模式

`Settings > Agent > Tool capabilities` 从**已实现的共享 Tool registry**渲染，不维护第二份手写清单。
尚未实现的目标 Tool 只保留在本文档，不在产品 UI 中显示不可用开关。

设计稿已落地首批24项共享registry fixture、四个domain、搜索、Agent/MCP双Switch、会话级`Ask/Auto`与
Transcript内联问询卡；明暗基线见`design-vite/shots/*/agent-models/`。这是产品实现基线，不表示这些
Tool已经接入Desktop。

每个已实现 Tool 显示两个独立 Switch：

| 开关 | 开启 | 关闭 |
| --- | --- | --- |
| Agent | 向内置 Agent 的 Capability Index / discovery 注册 | 内置 Agent 不可发现、不可调用 |
| MCP | 向 MCP `tools/list` 注册 | 外部 MCP Client 不可发现、不可调用 |

- 两列默认全部开启；配置只保存关闭项，因此以后新增 Tool 也自然默认开启；
- 关闭 Agent 不影响 MCP，关闭 MCP 不影响 Agent；
- 开关只决定 Tool 是否暴露，不改变产品原有设置或业务状态；
- 查询 Tool 在开启后直接执行；
- 改动 Tool 在开启后按当前 Agent Session 或 MCP Client 的 `ask` / `auto` 模式执行；默认 `ask`；
- `ask` 在执行前展示 Tool、参数与影响，`auto` 不增加应用内逐次确认；
- 两种模式都继续使用正式产品命令，并保留已有参数校验、原生 Open/Save Dialog、UAC 与系统权限；
- Tool 被关闭后，新的 discovery / `tools/list` 立即不再返回它；已经开始的调用按开始时快照完成。

## 3. 完整 Tool 清单

### 3.1 Runtime、代理、Capture 与 Traffic

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `get_core_process_status` | query | `getCoreProcessStatus` | 产品已具备 |
| `get_system_proxy_status` | query | `getSystemProxyStatus` | 产品已具备 |
| `enable_system_proxy` | change | `enableSystemProxy` | 产品已具备 |
| `restore_system_proxy` | change | `restoreSystemProxy` | 产品已具备 |
| `get_proxy_status` | query | `getCaptureStatus` / `proxy.status` | MCP package |
| `get_storage_status` | query | `getCaptureUsage` / `capture.status` | MCP package |
| `start_recording` | change | `startCapture` | MCP package 的 `set_recording` 待拆分 |
| `stop_recording` | change | `stopCapture` | MCP package 的 `set_recording` 待拆分 |
| `clear_capture` | change | `clearCapture` / `capture.cleanup(scope: 'all')` | MCP package；迁移时删除产品不存在的session scope |
| `list_exchanges` | query | `querySessions` / `sessions.query` | MCP package |
| `get_exchange` | query | `getExchangeDetail` / `sessions.detail` | MCP package |
| `get_exchange_body` | query | `readBody` / `body.read-range` | MCP package |
| `list_websocket_messages` | query | `queryWebSocketFrames` / `websocket.frames` | MCP package |
| `list_grpc_messages` | query | `queryGrpcMessages` / `grpc.messages` | MCP package |
| `export_body` | change | `startBodyExport` / 原生 Save Dialog | 产品已具备 |

### 3.2 Rules 与 Composer

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `get_rules` | query | `getRules` / `rules.get` | MCP package |
| `get_rule_hits` | query | `getRuleHits` / `rules.hits` | MCP package |
| `apply_rules` | change | `replaceRules` / `rules.replace` | MCP package；移除强制 disabled 的旧限制后迁移 |
| `import_rules` | change | 当前由Renderer串联`readImportFile`、解析确认与`replaceRules` | 先补 intent |
| `export_rules` | change | `exportRules` / 原生 Save Dialog | 产品已具备 |
| `get_collection` | query | `getCollection` / `collection.get` | 产品已具备 |
| `replace_collection` | change | `replaceCollection` / `collection.replace` | 产品已具备 |
| `import_collection` | change | 当前由Renderer串联`readImportFile`、解析确认与`replaceCollection` | 先补 intent |
| `export_collection` | change | `exportCollection` / 原生 Save Dialog | 产品已具备 |
| `send_request` | change | `sendComposerRequest` / `composer.send` | MCP package |

### 3.3 Breakpoints 与连接探测

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `list_breakpoints` | query | `listBreakpoints` / `breakpoint.list` | MCP package |
| `enable_http_breakpoints` | change | `setBreakpointsEnabled(true)` | MCP package 的 `configure_breakpoint` 待拆分 |
| `disable_http_breakpoints` | change | `setBreakpointsEnabled(false)` | MCP package 的 `configure_breakpoint` 待拆分 |
| `enable_websocket_breakpoint` | change | `enableWebSocketBreakpoints` | MCP package |
| `disable_websocket_breakpoint` | change | `disableWebSocketBreakpoints` | MCP package |
| `continue_breakpoint` | change | `resolveBreakpoint(..., 'continue')` | MCP package 的 `resolve_breakpoint` 待拆分 |
| `forward_edited_breakpoint` | change | `resolveBreakpoint(..., 'continue', edit)` | MCP package 的 `resolve_breakpoint` 待拆分 |
| `drop_breakpoint` | change | `resolveBreakpoint(..., 'drop')` | MCP package 的 `resolve_breakpoint` 待拆分 |
| `continue_breakpoint_queue` | change | `continueBreakpointQueue` | 产品已具备 |
| `drop_breakpoint_queue` | change | `dropBreakpointQueue` | 产品已具备 |
| `continue_rule_breakpoints` | change | `continueBreakpointRule` | 产品已具备 |
| `probe_connection` | change | `probeTls` / `tls.probe` | MCP package |

### 3.4 TLS、证书与 AppContainer

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `get_certificate_status` | query | `getCertificateStatus` | 产品已具备 |
| `generate_certificate` | change | `generateCertificate` | 产品已具备 |
| `install_certificate` | change | `installCertificate` / UAC | 产品已具备 |
| `uninstall_certificate` | change | `uninstallCertificate` / UAC | 产品已具备 |
| `delete_certificate` | change | `deleteCertificate` / 必要时 UAC | 产品已具备 |
| `reveal_certificate` | change | `revealCertificate` | 产品已具备 |
| `view_certificate` | change | `viewCertificate` | 产品已具备 |
| `open_certificate_manager` | change | `openCertificateManager` | 产品已具备 |
| `get_tls_insecure_hosts` | query | `getInsecureHosts` / `tls.getInsecureHosts` | 产品已具备 |
| `replace_tls_insecure_hosts` | change | `setInsecureHosts` / `tls.replaceInsecureHosts` | 产品已具备 |
| `enable_https_decryption` | change | `setHttpsDecryption(true)` | 产品已具备 |
| `disable_https_decryption` | change | `setHttpsDecryption(false)` | 产品已具备 |
| `get_tls_passthrough` | query | `getTlsPassthroughSettings` | 产品已具备 |
| `replace_tls_passthrough` | change | `replaceTlsPassthroughSettings` | 产品已具备 |
| `list_app_containers` | query | `listAppContainers` | 产品已具备 |
| `enable_app_container` | change | `setAppContainerLoopbackExemption(sid, true)` / UAC | 产品已具备 |
| `disable_app_container` | change | `setAppContainerLoopbackExemption(sid, false)` / UAC | 产品已具备 |
| `enable_all_app_containers` | change | `enableAllAppContainers` / UAC | 产品已具备 |
| `disable_all_app_containers` | change | `disableAllAppContainers` / UAC | 产品已具备 |

### 3.5 Transfer 与 Diagnostics

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `export_har` | change | `startHarExport` / 原生 Save Dialog | 产品已具备 |
| `import_har` | change | `startHarImport` / 原生 Open Dialog | 产品已具备 |
| `export_archive` | change | `startArchiveExport` / 原生 Save Dialog | 产品已具备 |
| `import_archive` | change | `startArchiveImport` / 原生 Open Dialog | 产品已具备 |
| `get_transfer_job` | query | `getTransferJob` | 产品已具备 |
| `cancel_transfer_job` | change | `cancelTransferJob` | 产品已具备 |
| `get_diagnostic_trace` | query | `getCoreTrace` | 产品已具备 |
| `get_recent_diagnostics` | query | `getRecentDiagnostics` | 产品已具备 |
| `query_diagnostics` | query | `queryDiagnostics` / `diagnostics.query` | MCP package |
| `export_diagnostics` | change | `startDiagnosticsExport` / 原生 Save Dialog | 产品已具备 |

### 3.6 GitHub 更新

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `get_github_auth_status` | query | `getGitHubAuthStatus` | 产品已具备 |
| `start_github_sign_in` | change | `signInWithGitHub` | 产品已具备 |
| `open_github_authorization` | change | `openGitHubAuthorization` | 产品已具备 |
| `sign_out_github` | change | `signOutFromGitHub` | 产品已具备 |
| `get_update_status` | query | `getUpdateStatus` | 产品已具备 |
| `check_for_updates` | change | `checkForUpdates` | 产品已具备 |
| `download_update` | change | `downloadUpdate` | 产品已具备 |
| `open_downloaded_update` | change | `openDownloadedUpdate` | 产品已具备 |

### 3.7 Renderer 设置

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `set_ui_language` | change | 当前仅 Renderer 状态 | 先补 intent |
| `set_theme` | change | 当前仅 Renderer 状态 | 先补 intent |
| `set_export_privacy_defaults` | change | 当前仅 Renderer 状态 | 先补 intent |

## 4. 逐项交付

Tool 不按“只读产品版”和“完整产品版”切成两套。完整目录先确定，随后从最基础的纵向流程开始逐项完成：

1. 在`design-vite`完成`Settings > Agent`能力列表、Agent/MCP双开关与`ask`问询态设计；
2. 将现有MCP 20个Tool的通用descriptor、schema与执行函数迁入`packages/interceptor-tools/`，
   同时把三个多义入口拆成语义单一名称；MCP transport继续留在`packages/mcp-server/`；
3. 实现registry驱动的Agent/MCP开关及持久化，默认全部开启；
4. Agent首个真实流程接入`get_proxy_status`、`list_exchanges`、`get_exchange`，验证discovery、Transcript
   与真实 UI 产生的 Capture 数据；它们只是最先开发的三项，不是永久只读边界；
5. 接入`ask` / `auto`，再按本目录顺序逐项开发其余Tool；
6. 每完成一个Tool，同一work item更新本表状态并增加最小unit/integration；影响用户flow时增加真实E2E；
7. 没有正式产品入口的Tool先补产品intent，再复用该入口，不在Tool层实现第二套业务逻辑。

## 5. 不注册为业务 Tool 的控制面

以下入口仍保留在产品中，但不属于 Agent/MCP 业务能力目录：

| 类别 | 入口 | 原因 |
| --- | --- | --- |
| Agent 自身控制 | `getAgentModels`、`testAgentProviderConnection`、`saveVerifiedAgentProvider`、`removeAgentProvider`、`setDefaultAgentModel`、`listAgentSessions`、`createAgentSession`、`selectAgentSession`、`getAgentSession`、`renameAgentSession`、`deleteAgentSession`、`setAgentSessionModel`、`sendAgentMessage`、`cancelAgentTurn`、`retryAgentTurn` | 由用户直接控制当前Agent；自调用会递归或改写自身会话 |
| Tool 能力设置 | Agent/MCP Tool 开关、`ask` / `auto` 模式 | 这是 Tool 的授权来源，不能由被授权 Tool 自行修改 |
| MCP 接入控制 | MCP Server 开关、Client 新增/撤销、Host 配置 | 这是外部调用方的认证与接入边界 |
| App Shell | `closeApplication`、`minimizeWindow`、`toggleMaximizeWindow`、Workspace/Tab/Settings导航 | 只改变本地UI，不是业务能力 |
| 事件订阅 | `onAgentSessionEvent`、`onBreakpointsChange`、`onCaptureEvents`、`onClientAppIcons`、`onCoreProcessStatusChange`、`onGitHubAuthStatusChange`、`onSystemProxyStatusChange`、`onTlsCompatibilityChange`、`onUpdateStatusChange` | 由Host订阅，不是Model发起的命令 |
| Renderer诊断 | `reportRendererDiagnostic` | 内部错误汇入通道，不是用户查询或操作 |
| 文件选择子步骤 | `pickBreakpointBodyFile` | 只服务`forward_edited_breakpoint`的File模式，不是独立业务意图 |
| 内部编排 | `echoCore`、`diagnostics.ingest`、`proxy.setUpstream`、`tls.useCertificate`、TLS preference同步 | 不是用户意图，只服务进程协作 |

这不是永久能力 denylist。若以后出现“由 AI 管理 Agent Session”或“由 AI 操作 UI”的独立产品需求，
先为该需求设计新的用户流程与正式命令，再加入目录；当前不把宿主控制面伪装成业务 Tool。

## 6. 一致性规则

- Tool 名全局唯一，使用具体动词；正反操作使用两个 Tool，不用布尔值编码；
- Tool层的正反名称可以复用产品已有的Switch intent；Main/Core仍按payload分派到语义单一方法，不为Tool复制命令；
- 一个 Tool 只对应一个用户意图，Agent 与 MCP 不得各自改名或改变参数；
- `packages/interceptor-tools/` registry 是 Settings 列表、Agent discovery 与 MCP `tools/list` 的唯一数据源；
- 文档完整目录可以先于代码，产品 UI 只展示 registry 中已经实现的 Tool；
- 新增、删除或改名 Tool 时，同一改动必须更新本文、registry、Settings、Agent/MCP 测试和对应 E2E Inventory；
- Tool 的结果不得比正式产品入口拥有更多权限；文件路径、凭据与私钥继续遵守原有进程边界。
