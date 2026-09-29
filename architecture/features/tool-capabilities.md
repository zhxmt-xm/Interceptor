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

GitHub Auth与Updates属于产品控制面，不注册为业务Tool。

历史69项实现、68项真实E2E及Manager管理员MMC排除范围见[验证记录](#tool-validation-history)，不把历史完成数当作当前构建的回归结果。

授权设置的Main归属、双列开关与原子持久化见[进程文档](../platform/processes.md)及[Agent配置](agent.md)。落盘record的两个字段为`agentDisabledToolNames`、`mcpDisabledToolNames`；非法schema、重复名称及额外字段拒绝，合法数组中的未知名称只从内存快照丢弃，读取不改文件、不迁移或映射旧名。写入只保留当前registry名称并按registry顺序规范化；搜索不改变开关或持久化。这些校验仍由`ToolCapabilitySettingsService`完成，不让Renderer维护第二套目录。

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

行为不变的共用Main方法重构，其前后基线和产物见[2026-09-07验证记录](#main-actions-validation-history)。

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

Manager保留Tool、Main/IPC/Agent/MCP接线、逻辑测试、UI/parity和recipe；用户于2026-09-09明确排除需要管理员权限的MMC原生打开、关闭及进程清理专项。排除不是passed，也不再以该专项阻塞交付；其他六项证书真实E2E及通用授权、取消、重启门禁不变，见[排除约定与历史证据](../../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md#settings-tools-certificate-manager)。

## 4. 不注册为业务 Tool 的控制面

以下入口仍保留在产品中，但不属于 Agent/MCP 业务能力目录：

| 类别 | 入口 | 原因 |
| --- | --- | --- |
| Updates | `getUpdateStatus`、`checkForUpdates`、`downloadUpdate`、`openDownloadedUpdate` | 仅保留产品UI和Main更新流程，不注册为Agent/MCP Tool |
| Agent 自身控制 | `getAgentModels`、`testAgentProviderConnection`、`saveVerifiedAgentProvider`、`removeAgentProvider`、`setDefaultAgentModel`、`listAgentSessions`、`createAgentSession`、`selectAgentSession`、`getAgentSession`、`renameAgentSession`、`deleteAgentSession`、`setAgentSessionModel`、`requireAgentToolApproval`、`automaticallyExecuteAgentTools`、`sendAgentMessage`、`cancelAgentTurn`、`retryAgentTurn`、`allowAgentToolCall`、`denyAgentToolCall` | 由用户直接控制当前Agent；自调用会递归或改写自身会话 |
| Tool 能力设置 | Agent/MCP Tool 开关、`ask` / `auto` 模式 | 这是 Tool 的授权来源，不能由被授权 Tool 自行修改 |
| MCP 接入控制 | MCP Server 开关、Client 新增/撤销、Host 配置 | 这是外部调用方的认证与接入边界 |
| App Shell | `closeApplication`、`minimizeWindow`、`toggleMaximizeWindow`、Workspace/Tab/Settings导航 | 只改变本地UI，不是业务能力 |
| 事件订阅 | `onAgentSessionEvent`、`onBreakpointsChange`、`onCaptureEvents`、`onCaptureStatusChange`、`onClientAppIcons`、`onCoreProcessStatusChange`、`onGitHubAuthStatusChange`、`onSystemProxyStatusChange`、`onTlsCompatibilityChange`、`onUpdateStatusChange` | 由Host订阅，不是Model发起的命令 |
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

<a id="tool-validation-history"></a>
## 6. 历史验证记录

以下承接`218295b0`中的历史事实，不恢复当时的排队实现、旧profile CA或旧阶段待办，也不覆盖后续第4项和当前构建。TEMP名称、时间和产物大小保留原口径；本轮文档核对没有重新运行这些命令或重新校验旧归档。不同阶段的测试数、产物和parity不能相加。

### 6.1 69项的历史范围

2026-09-09记录的69/69是代码及用户约定范围验证：68项有完整真实Agent/MCP E2E，另1项Manager仅排除管理员MMC原生专项。Settings代码26/26、真实E2E25/26；不是69项原生流程全部通过。

| Feature | 当时代码及owner正向executor覆盖 | 有完整真实Tool调用的项数 |
| --- | ---: | ---: |
| Capture | 17 | 17 |
| Rules | 5 | 5 |
| Composer | 6 | 6 |
| Breakpoints | 11 | 11 |
| Diagnostics | 4 | 4 |
| Settings | 26 | 25 |
| 合计 | 69 | 68 |

- 当时首批24项registry、MCP adapter、Agent接线、owner正向测试及真实调用均为24/24；后续45项按上述排除约定交付。owner测试不是adapter测试，`tools/list`和recipe不是实际调用。
- 历史调用渠道有区别：Capture的storage/start/clear/exchange列表与详情/body/WS/gRPC查询、Rules hits、Composer send/probe、Diagnostics query及Settings代理两项/TLS四项记录的是Agent调用；其余已验项记录Agent与MCP，HAR/Archive及偏好还覆盖IPC。不能把68项统一改写为每项双Host实操。
- 2026-09-07删除Updates四项目标后由73项变为69项；更早已移除GitHub Auth四个候选。此前73项、36/58等registry数是阶段口径，不是漏实现或应恢复的Tool。
- 当时recipe69/69不等于人工验收；用户后续自行查看，不另设人工门禁。Capture Lab integration39/39与当时产品真实Capture2/39是另一套矩阵，不计入68项Tool E2E，也不把旧2/39沿用为当前覆盖率。
- 当时自动验证使用本地OpenAI-compatible lab，没有DeepSeek线上兼容Green。VS Code Host `2025-11-25`与产品`2026-07-28`不兼容、双Host同读Capture及正式Tool中间进度SSE的缺口不由Tool计数消除；现行边界见[MCP](mcp.md)。

<a id="main-actions-validation-history"></a>
### 6.2 共用Main方法（2026-09-07）

这是行为不变的重构：基线Green后再重构，不制造Red。当前共用入口见[第2节](#shared-main-actions-acceptance)；Collection业务与对应代际已由[Composer规格](../../apps/desktop/tests/e2e-workflow-tests/docs/composer.md#composer-tools-collection)承接。

- 原基线：Collection同步/就绪/导入保存15/15、真实Collection1/1；Body/Capture保护36/36、真实Body1/1；树导出11/11、Rules/Collection导出真实2/2。
    - TEMP分别为`interceptor-collection-shared-save-baseline-20260907-190511`、`interceptor-body-shared-save-baseline-20260907-190921`、`interceptor-tree-export-shared-baseline-20260907-191441`。
- 最终七个业务测试文件70/70，含新增已保存树读取/Core失败/取消8项；Desktop typecheck通过。四条真实流程4/4（2.3分钟），八代均`gracefulDestroyVerified=true`，Main/Core/Worker、8888及完整WinINet/journal恢复。
    - TEMP `interceptor-main-shared-actions-green-20260907-191814`保存trace；Body两代Main/Core为`22592/26460`、`41812/3536`，Rules Export为`14452/10048`、`43604/25040`。
- Windows package、artifact audit（1,294文件/392,912,221字节）、smoke1/1（43.2秒）；日志为`interceptor-main-shared-actions-{package,artifact-audit}-20260907.log`，smoke为`interceptor-main-shared-actions-smoke-20260907-192158`。
    - 依赖、UI、Preload和Core协议未改；复用HAR阶段production audit零漏洞，不声称重新查询。该组不覆盖TLS清理、既有视觉债务或人工结论。

### 6.3 首批Tool的补充门禁

实际请求、审批、撤权和退出证据仍在[Agent规格](../../apps/desktop/tests/e2e-workflow-tests/docs/agent.md)与[MCP规格](../../apps/desktop/tests/e2e-workflow-tests/docs/mcp.md)。下表只保留这些规格未完整承接的阶段汇总；原文未给各阶段独立日期，不补造运行时间。

| 阶段 | 历史验证事实 | 产物与边界 |
| --- | --- | --- |
| 正文/消息 | UtilityProcess中的Mockttp追加OpenSSL专用`@SECLEVEL=0`曾触发`INVALID_COMMAND`；获准后仅Electron省略该项，Node行为保持。补丁unit2/2、H2 integration6/6、真实E2E1/1 | Windows package/audit/smoke通过；这不是当前正文UI或预览阈值验收 |
| Rules最终里程碑 | Tools43/43、Runtime121/121、MCP30/30、Desktop450/450、Proxy Rules95/95、design interaction68/68、全workspace类型；真实Rules三条3/3、共用Dialog两条2/2 | Windows audit1,294文件/392,808,773字节、production audit0、smoke1/1（44.6秒）；不同于规格中更早的Desktop410/410和392,804,000字节产物 |
| Breakpoints八项 | `32f2889a`上Agent discovery为空、MCP stale仍请求审批的Red；联合2/2 Green。Tools54/54、Runtime122/122、MCP32/32、Desktop454/454、Core focused11/11、design interaction69/69及类型通过 | Windows audit1,294文件/392,817,170字节、production audit0、smoke1/1；既有两项chunked framing失败未修 |
| Composer两项 | `ffaf323f`上discovery Red；Tools62/62、Desktop456/456、owner9/9（真实网络8/8、预取消1/1）、design interaction70/70及类型通过；Composer/Breakpoints/MCP敏感证据联合3/3 | Windows audit1,294文件/392,823,830字节、production audit0、smoke1/1；不外推为Core全绿 |
| Feature命名 | `97120203`上Settings精确Red于旧24项名称；Settings/四组Agent/MCP两入口联合7/7。73目标名称唯一、零错组；Tools62/62、Desktop457/457、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67、design interaction70/70及类型通过 | Capture/Composer38/38为0px、Settings五组38/38最大0.6px；全量208 views/1,456 targets/1,422 matched/34 missing/305 flagged。Windows audit1,294文件/392,824,445字节、production audit0、smoke1/1 |
| Diagnostics首批收尾 | `401af972`上缺schema Red；首批接线/owner/真实调用24/24。Tools66/66、Desktop458/458、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67、design interaction71/71及类型通过；Core329/331，仅两项既有framing失败 | 全量210 views/1,474 targets/1,442 matched/32 missing/303 flagged；专项18/18为0px。Windows audit1,294文件/392,826,512字节、production audit0、smoke1/1；此阶段补齐命名重构遗漏的设计截图 |
| Settings只读六项（2026-09-05） | Tools97/97、Desktop467/467、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67及类型通过；设计交互首跑69/71，修正旧目录/selector后目标文件5/5，不改历史失败 | 新增44/44为0px；全量214 views/1,520 targets/1,486 matched/34 missing/304 flagged。Windows audit1,294文件/392,835,349字节、production audit0、smoke1/1；410张原设计图保持 |
| Settings代理两项（2026-09-05） | Tools110/110、Desktop470/470、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67、design interaction71/71及类型通过；MCP Browser/Desktop另2/2 | 新增48/48最大0.5px；全量222 views/1,568 targets/1,534 matched/34 missing/306 flagged。Windows audit1,294文件/392,839,696字节、production audit0、smoke1/1；旧FIFO是当时实现，不覆盖当前模块互斥 |
| TLS四项保存阶段（2026-09-05） | 业务断言通过但CA清理未闭环；Core TLS integration12/12、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67通过。profile保留9/9、executor32/32及最终9月8日清理已由TLS规格承接 | Windows audit1,294文件/392,847,733字节、production audit0、smoke1/1；该产物不能替代当时缺失的最终CA清理E2E |

这些完整parity中的missing/flagged均未作为Green；截图和几何专项不能替代真实Tool调用。Settings只读/代理/TLS的业务Red、完整恢复及TLS旧CA清理，分别由[Settings规格](../../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md#settings-tools-readonly)、[代理规格](../../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md#settings-tools-system-proxy)、[TLS历史证据](../../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md#settings-tools-tls)承接。

### 6.4 后续能力的证据归属

Rules Import、Collection查询/替换与传输、Diagnostics查询/导出的Red/Green、产物及恢复已由[Rules规格](../../apps/desktop/tests/e2e-workflow-tests/docs/rules.md#rules-tools-import)、[Composer规格](../../apps/desktop/tests/e2e-workflow-tests/docs/composer.md#composer-tools-collection)、[Diagnostics规格](../../apps/desktop/tests/e2e-workflow-tests/docs/diagnostics.md#diagnostics-tools-queries-export)完整承接，不复制各次流程。Capture任务取消和Body导出的产物、失败与恢复在[任务规格](../../apps/desktop/tests/e2e-workflow-tests/docs/capture.md#capture-tools-transfer-jobs)及[Body规格](../../apps/desktop/tests/e2e-workflow-tests/docs/capture.md#capture-tools-body-export)。

| 日期/范围 | 尚需保留的独有补充 | 历史证据位置 |
| --- | --- | --- |
| 2026-09-06 Rules Export | 全workspace类型、Tools152/152、Runtime122/122、Protocol25/25、Playground67/67；Desktop492/494和MCP31/32的旧目录断言修正后目标27/27、20/20。设计交互71/72的旧计数修正后目标1/1。专项36/36最大0.5px；全量244 views/1,700 targets/1,666 matched/34 missing/304 flagged、平均2.22%。Windows audit1,294文件/392,851,066字节、production audit0、smoke1/1 | [真实Red/Green及恢复](../../apps/desktop/tests/e2e-workflow-tests/docs/rules.md#rules-tools-export)；TEMP `interceptor-rules-export-design-generated`（444张输入、432张非目标原基准保持）、`interceptor-rules-export-full-parity` |
| 2026-09-06 Collection传输回归 | 首轮Tools189/192、Desktop574/576、MCP31/32、Playground66/67均因旧目录断言未全绿；修正后的对应聚焦组51/51、27/27、20/20、1/1，不把局部复跑写成新的全量Green。Runtime122/122、Protocol25/25及类型通过 | [真实Red/Green、产物与parity](../../apps/desktop/tests/e2e-workflow-tests/docs/composer.md#composer-tools-transfer)；Core329/331仍有两项framing债务 |
| 2026-09-06 Breakpoints批量 | Desktop579/579、Tools215/215、MCP32/32、Runtime122/122、Protocol25/25、Playground67/67、设计交互81/81及类型通过；Core329/331。专项72/72最大0.5px；全量280 views/1,920 targets/1,888 matched/32 missing/335 flagged、平均2.28%。离线Electron缓存经SHA-256核验后package成功，audit1,294文件/392,889,491字节、production audit0、smoke1/1（45.1秒） | [批量命令真实证据与首轮失败](../../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-tools-batch)；TEMP `interceptor-breakpoint-batch-full-parity`及同名`.md`；480张输入、466张非目标原基准保持 |
| 2026-09-07 HAR | 摘要另4项Red；曾在名称含green的运行中精确失败于导入记录在Capture不可见，后由统一通知及历史时间查询修复。设计交互72/72；专项16视图130/130最大0.6px；audit1,294文件/392,912,120字节、smoke1/1（44.3秒） | 原失败`interceptor-har-tools-e2e-green-20260907-162943`；[同流程最终Green及五条关联恢复](../../apps/desktop/tests/e2e-workflow-tests/docs/capture.md#capture-tools-har-transfer) |
| 2026-09-07 Archive | 摘要4项Red；关联四条最终Green，Settings旧106开关断言失败后独立重跑，不算产品Red。Archive/HAR/Settings共28视图202/202最大0.6px；audit1,294文件/392,914,820字节、smoke1/1（47.0秒）；依赖未变，复用HAR production audit0，不记重新执行 | [Archive真实证据](../../apps/desktop/tests/e2e-workflow-tests/docs/capture.md#capture-tools-archive-transfer)；当时12张Archive、6张Settings图更新，不新增设计工具测试 |

Rules Import的设计交互73/73，以及Body导出的Main11/11、Playground84/84、Runtime122/122、Protocol25/25是原阶段额外门禁；Body新增6张图、更新6张目录图，264张非目标旧图SHA-256保持。业务与其他门禁按上面的规格定位，不重复拷贝。

长期截图输入/输出仍按原名定位：`interceptor-rules-import-{design-generated,full-parity}`（450张输入、438张原基准保持）、`interceptor-composer-collection-{design-generated,full-parity}`（456/446）、`interceptor-composer-transfer-design-generated`（468/454）、`interceptor-diagnostics-{design-generated,full-parity}`（486/478）。这些数量是各阶段保留基准的记录，不是当前截图总数；完整parity未全绿。Diagnostics阶段一次安全策略阻止构建和一次手写Forge调用均未生成包，随后标准构建才通过，未修改Forge配置。

### 6.5 从旧TODO迁出的事实

旧TODO的已解决项不能混回风险进度：真实代理曾将一条三Action Rule的单请求hit计为3，后按`Rule × Exchange`去重；Throttle设为8 KiB/s时128 KiB下载仅17ms（真正限速至少16秒），因此选择删除假功能，而不是宣称头部delay等于带宽限制。原文未附这两次实验的独立日期或trace，不补造；现行Rule计数与候选边界见[Rules](rules.md)和[风险边界](../backlog/TODO.md)。
