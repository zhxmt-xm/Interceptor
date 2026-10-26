# Feature: Agent / MCP Tool 能力目录

## 1. 唯一目录

本文描述Agent与MCP共用的业务能力及产品入口。每个Tool descriptor只在
`packages/interceptor-tools/` 定义一次；内置 Agent 与 MCP 复用同一名称、schema、执行函数和结果类型，
不复制两套 Tool。

目录只收录真实产品用户意图：查询、修改配置、控制代理、处理断点、发送请求和文件操作。
Agent 自身 Session/Provider 控制、MCP 接入控制、窗口导航、事件订阅和 Main/Core 内部编排不注册为 Tool，
见第4节。

### 1.1 Feature命名契约

Tool名称固定使用`<feature>_<verb>[_<object>]`，前缀等于拥有该业务能力的feature/capability，而不是当前UI页面。
当前目录使用`capture`、`rules`、`composer`、`breakpoints`、`diagnostics`与`settings`六个前缀。
前缀已经表达对象时不重复，例如使用`breakpoints_continue`而不是
`breakpoints_continue_breakpoint`，使用`rules_get_tree`而不是`rules_get_rules`。

不保留旧Tool alias、旧Capability ID、Settings迁移或双写；持久设置中的未知名称丢弃，历史Transcript只读展示原始调用。Agent discovery、MCP `tools/list`、Settings与Playground使用同一registry名称。

Updates属于产品控制面，不注册为业务Tool。

授权设置的Main归属、双列开关与原子持久化见[进程文档](../platform/processes.md)及[Agent配置](agent/README.md)。落盘record的两个字段为`agentDisabledToolNames`、`mcpDisabledToolNames`；非法schema、重复名称及额外字段拒绝，合法数组中的未知名称只从内存快照丢弃，读取不改文件、不迁移或映射旧名。写入只保留当前registry名称并按registry顺序规范化；搜索不改变开关或持久化。这些校验仍由`ToolCapabilitySettingsService`完成，不让Renderer维护第二套目录。

<a id="shared-main-actions-acceptance"></a>
## 2. 共用业务入口

IPC、Agent和MCP复用同一业务方法；Tool只转换参数、执行授权与投影安全结果，不复制业务流程，也不将全部IPC自动开放为Tool。

| 类别 | Main命令 | 业务入口 |
| --- | --- | --- |
| 只读查询 | `settings.core-process.status`、`settings.system-proxy.status`、`settings.certificate.status`、`settings.app-containers.list` | CoreRuntime或平台只读方法，Tool仅投影公开字段 |
| 系统代理 | `settings.system-proxy.enable`、`settings.system-proxy.restore` | PlatformCapabilitiesService的方法，冲突立即拒绝、不排队 |
| TLS | `settings.tls-insecure-hosts.replace`、`settings.tls-passthrough.replace`、`settings.https-decryption.enable/disable` | 共用配置与启停方法，持久化后同步Core并通知面板 |
| 证书 | `settings.certificate.generate/install/uninstall/delete/reveal/view` | PlatformCapabilitiesService与内部CertificateService |
| 证书管理器 | `settings.certificate-manager.open` | 请求打开系统管理器，不读写证书 |
| AppContainer | `settings.app-container.enable/disable`、`settings.app-containers.enable-all/disable-all` | 平台单项/批量方法、原生helper和全局通知 |
| 导入 | `rules.import`、`composer.collection.import` | 导入Service与Renderer预览确认生命周期 |
| 文件导出 | `diagnostics.export`、`capture.har.export` | 原生Save与Core任务启动 |
| 正文导出 | `capture.body.export` | `startBodyExport`校验正文身份/Core代际，管理Dialog、取消和任务启动 |
| 树导出 | `rules.export`、`composer.collection.export` | `exportSavedRules`/`exportSavedCollection`读取已保存树，再调用共用导出函数；UI导出编辑树，不隐式保存 |
| 集合替换 | `composer.collection.replace` | `replaceCollection`保存Core并通知其他Renderer，发起窗口用返回值确认快照 |
| HAR导入 | `capture.har.import` | 原生Open与任务启动，Core成功后统一通知Renderer查询 |
| Archive | `capture.archive.export`、`capture.archive.import` | `startArchiveExport`/`startArchiveImport`复用快照、追加导入和完成通知 |
| UI偏好 | `settings.language.set`、`settings.theme.set`、`settings.export-privacy-defaults.set` | `UiPreferencesService`管理请求/取消/确认，Renderer应用并持久化后广播 |

原生Dialog、独立授权、取消与脱敏都由原业务入口保留。导出当前树和已保存树使用明确的独立方法，不通过调用来源暗中切换行为。

## 3. 完整 Tool 清单

### 3.1 Capture

| Tool | 类型 | 复用的产品入口 |
| --- | --- | --- |
| `capture_get_proxy_status` | query | `getCaptureStatus` / `proxy.status` |
| `capture_get_storage_status` | query | `getCaptureUsage` / `capture.status` |
| `capture_start_recording` | change | `startCapture` |
| `capture_stop_recording` | change | `stopCapture` |
| `capture_clear` | change | `clearCapture` / `capture.cleanup(scope: 'all')` |
| `capture_list_exchanges` | query | `querySessions` / `sessions.query` |
| `capture_get_exchange` | query | `getExchangeDetail` / `sessions.detail` |
| `capture_get_exchange_body` | query | `getExchangeDetail` + `readBody` / `sessions.detail` + `body.read-range` |
| `capture_list_websocket_messages` | query | `queryWebSocketFrames` / `websocket.frames` |
| `capture_list_grpc_messages` | query | `queryGrpcMessages` / `grpc.messages` |
| `capture_export_body` | change | `capture.body.export` / `startBodyExport` / 原生Save Dialog |
| `capture_export_har` | change | `capture.har.export` / `startHarExport` / 原生Save Dialog |
| `capture_import_har` | change | `capture.har.import` / `startHarImport` / 原生Open Dialog |
| `capture_export_archive` | change | `capture.archive.export` / `startArchiveExport` / 原生Save Dialog |
| `capture_import_archive` | change | `capture.archive.import` / `startArchiveImport` / 原生Open Dialog |
| `capture_get_transfer_job` | query | `transfer.job.get` |
| `capture_cancel_transfer_job` | change | `transfer.job.cancel` |

正文查询先用`exchangeId + bodyId`回查可信MIME/encoding；导出保留完整编码字节。HAR/Archive导入采用追加语义并统一通知Renderer；任务查询仅返回安全摘要，取消遵守清理与终态幂等规则。

### 3.2 Rules

| Tool | 类型 | 复用的产品入口 |
| --- | --- | --- |
| `rules_get_tree` | query | `getRules` / `rules.get` |
| `rules_get_hits` | query | `getRuleHits` / `rules.hits` |
| `rules_replace_tree` | change | `replaceRules` / `rules.replace` |
| `rules_import` | change | Main请求生命周期 / Renderer预览与原子追加 |
| `rules_export` | change | `exportRules` / 原生Save Dialog |

Rules使用严格递归schema；Map Local路径必须脱敏，替换时只能随未变的Rule原位保留。

### 3.3 Composer

| Tool | 类型 | 复用的产品入口 |
| --- | --- | --- |
| `composer_get_collection` | query | `getCollection` / `collection.get` |
| `composer_replace_collection` | change | `composer.collection.replace` / `replaceCollection` / `collection.replace` |
| `composer_import_collection` | change | `composer.collection.import` / Renderer预览与原子追加 |
| `composer_export_collection` | change | `composer.collection.export` / `exportCollection` / 原生Save Dialog |
| `composer_send_request` | change | `sendComposerRequest` / `composer.send` |
| `composer_probe_connection` | change | `probeTls` / `tls.probe` |

### 3.4 Breakpoints

| Tool | 类型 | 复用的产品入口 |
| --- | --- | --- |
| `breakpoints_list` | query | `listBreakpoints` / `breakpoint.list` |
| `breakpoints_enable_http` | change | `setBreakpointsEnabled(true)` |
| `breakpoints_disable_http` | change | `setBreakpointsEnabled(false)` |
| `breakpoints_enable_websocket` | change | `enableWebSocketBreakpoints` |
| `breakpoints_disable_websocket` | change | `disableWebSocketBreakpoints` |
| `breakpoints_continue` | change | `resolveBreakpoint(..., 'continue')` |
| `breakpoints_forward_edited` | change | `resolveBreakpoint(..., 'continue', edit)` |
| `breakpoints_drop` | change | `resolveBreakpoint(..., 'drop')` |
| `breakpoints_continue_queue` | change | `continueBreakpointQueue` / `breakpoint.continueQueue` |
| `breakpoints_drop_queue` | change | `dropBreakpointQueue` / `breakpoint.dropQueue` |
| `breakpoints_continue_rule` | change | `continueBreakpointRule` / `breakpoint.continueRule` |

`breakpoints_list`是唯一query；其余是change并服从Agent Session或
MCP Client的`ask`/`auto`。pending identity只在当前Core代际内由`breakpointId`标识，没有revision；审批前读取
当前pending生成动态影响，执行仍以Core `breakpoint.resolve`对已消失ID返回的`conflict`为最终并发保护。
三条批量命令按正式queueKey/ruleId作用于命令开始时的匹配集合，返回实际`resolvedCount`；空目标返回0，
不套用单项resolve的stale冲突语义，不采用Renderer未提交草稿。

`breakpoints_forward_edited`按pending phase收窄：request接受`method`、`url`与文本`body`，response接受
`statusCode`与文本`body`，WebSocket只接受文本`body`；跨phase字段在审批和执行前拒绝。至少一项编辑必须存在；
不开放headers、`bodyFilePath`、`closeCode`或任意本地路径。文件编辑仍只经产品原生Dialog，Map Local占位不适用于Breakpoint。

### 3.5 Diagnostics

| Tool | 类型 | 复用的产品入口 |
| --- | --- | --- |
| `diagnostics_get_trace` | query | `getCoreTrace` / `diagnostics.recent`，限定当前Core trace及200条 |
| `diagnostics_get_recent` | query | `getRecentDiagnostics` / `diagnostics.recent`，当前Core内存快照 |
| `diagnostics_query` | query | `queryDiagnostics` / `diagnostics.query` |
| `diagnostics_export` | change | `diagnostics.export` / `startDiagnosticsExport` / 原生Save Dialog |

### 3.6 Settings

| Tool | 类型 | 复用的产品入口 |
| --- | --- | --- |
| `settings_get_core_process_status` | query | `getCoreProcessStatus` |
| `settings_get_system_proxy_status` | query | `getSystemProxyStatus` |
| `settings_enable_system_proxy` | change | `enableSystemProxy` |
| `settings_restore_system_proxy` | change | `restoreSystemProxy` |
| `settings_get_certificate_status` | query | `getCertificateStatus` |
| `settings_generate_certificate` | change | `generateCertificate` |
| `settings_install_certificate` | change | `installCertificate` / 系统授权 |
| `settings_uninstall_certificate` | change | `uninstallCertificate` / 系统授权 |
| `settings_delete_certificate` | change | `deleteCertificate` / 必要时系统授权 |
| `settings_reveal_certificate` | change | `revealCertificate` |
| `settings_view_certificate` | change | `viewCertificate` |
| `settings_open_certificate_manager` | change | `openCertificateManager` |
| `settings_get_tls_insecure_hosts` | query | `getInsecureHosts` / `tls.getInsecureHosts` |
| `settings_replace_tls_insecure_hosts` | change | `setInsecureHosts` / `tls.replaceInsecureHosts` |
| `settings_enable_https_decryption` | change | `setHttpsDecryption(true)` |
| `settings_disable_https_decryption` | change | `setHttpsDecryption(false)` |
| `settings_get_tls_passthrough` | query | `getTlsPassthroughSettings` |
| `settings_replace_tls_passthrough` | change | `replaceTlsPassthroughSettings` |
| `settings_list_app_containers` | query | `listAppContainers` |
| `settings_enable_app_container` | change | `enableAppContainer` / UAC |
| `settings_disable_app_container` | change | `disableAppContainer` / UAC |
| `settings_enable_all_app_containers` | change | `enableAllAppContainers` / UAC |
| `settings_disable_all_app_containers` | change | `disableAllAppContainers` / UAC |
| `settings_set_language` | change | `setUiLanguage` / `UiPreferencesService.setLanguage` |
| `settings_set_theme` | change | `setUiTheme` / `UiPreferencesService.setTheme` |
| `settings_set_export_privacy_defaults` | change | `setExportPrivacyDefaults` / `UiPreferencesService.setExportPrivacyDefaults` |

Settings查询只返回公开状态和证书身份，不返回OS配置、路径或私钥。证书受信任时拒绝重新生成，Uninstall保留材料，Delete先撤销信任；AppContainer单项/批量变更统一通知已挂载面板。语言限15个正式ID、主题限四个值，导出隐私使用三个显式boolean，不改变已经打开的HAR草稿。

Manager保留Tool、Main/IPC/Agent/MCP接线、逻辑、UI和recipe；仅管理员MMC原生打开、关闭及进程清理专项被排除，不代表该专项通过。其他证书操作及通用授权、取消、重启契约不变，见[验收范围](../../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md#settings-tools-certificate-manager)。

## 4. 不注册为业务 Tool 的控制面

以下入口仍保留在产品中，但不属于 Agent/MCP 业务能力目录：

| 类别 | 入口 | 原因 |
| --- | --- | --- |
| Updates | `getUpdateStatus`、`checkForUpdates`、`downloadUpdate`、`openDownloadedUpdate` | 仅保留产品UI和Main更新流程，不注册为Agent/MCP Tool |
| Agent 自身控制 | `getAgentModels`、`testAgentProviderConnection`、`saveVerifiedAgentProvider`、`removeAgentProvider`、`setDefaultAgentModel`、`listAgentSessions`、`createAgentSession`、`selectAgentSession`、`getAgentSession`、`renameAgentSession`、`deleteAgentSession`、`setAgentSessionModel`、`requireAgentToolApproval`、`automaticallyExecuteAgentTools`、`sendAgentMessage`、`cancelAgentTurn`、`retryAgentTurn`、`allowAgentToolCall`、`denyAgentToolCall` | 由用户直接控制当前Agent；自调用会递归或改写自身会话 |
| Tool 能力设置 | Agent/MCP Tool 开关、`ask` / `auto` 模式 | 这是 Tool 的授权来源，不能由被授权 Tool 自行修改 |
| MCP 接入控制 | MCP Server 开关、Client 新增/撤销、Host 配置 | 这是外部调用方的认证与接入边界 |
| App Shell | `closeApplication`、`minimizeWindow`、`toggleMaximizeWindow`、Workspace/Tab/Settings导航 | 只改变本地UI，不是业务能力 |
| 事件订阅 | `onAgentSessionEvent`、`onBreakpointsChange`、`onCaptureEvents`、`onCaptureStatusChange`、`onClientAppIcons`、`onCoreProcessStatusChange`、`onSystemProxyStatusChange`、`onTlsCompatibilityChange`、`onUpdateStatusChange` | 由Host订阅，不是Model发起的命令 |
| Renderer诊断 | `reportRendererDiagnostic` | 内部错误汇入通道，不是用户查询或操作 |
| 文件选择子步骤 | `pickBreakpointBodyFile` | 只服务`breakpoints_forward_edited`的File模式，不是独立业务意图 |
| 内部编排 | `echoCore`、`diagnostics.ingest`、`proxy.setUpstream`、`tls.useCertificate`、TLS preference同步 | 不是用户意图，只服务进程协作 |

这不是永久能力 denylist。若以后出现“由 AI 管理 Agent Session”或“由 AI 操作 UI”的独立产品需求，
先为该需求设计新的用户流程与正式命令，再加入目录；当前不把宿主控制面伪装成业务 Tool。

## 5. 一致性规则

- Tool 名全局唯一，使用具体动词；正反操作使用两个 Tool，不用布尔值编码；
- Tool层的正反名称可以复用产品已有的Switch intent；Main/Core仍按payload分派到语义单一方法，不为Tool复制命令；
- 一个 Tool 只对应一个用户意图，Agent 与 MCP 不得各自改名或改变参数；
- `packages/interceptor-tools/` registry 是 Settings 列表、Agent discovery 与 MCP `tools/list` 的唯一数据源；
- 文档完整目录可以先于代码，产品 UI 只展示 registry 中已经实现的 Tool；
- 新增、删除或改名 Tool 时，同一改动必须更新本文、registry、Settings、Agent/MCP 测试和对应 E2E Inventory；
- 全部业务Tool必须逐项拥有共享executor测试，并在所属能力workflow中至少执行一次真实Agent或MCP Tool Call；
   不把全部Tool塞入单个巨型workflow，按Capture、Rules、Composer、Breakpoints与Diagnostics feature定位失败；
- Tool 的结果不得比正式产品入口拥有更多权限；文件路径、凭据与私钥继续遵守原有进程边界。
