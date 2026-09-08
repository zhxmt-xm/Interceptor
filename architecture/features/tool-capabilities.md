# Feature: Agent / MCP Tool 能力目录

> 最后更新：2026-09-08
> 代码所有者：`packages/interceptor-tools/`
> 使用方：内置 `AgentRuntime`、外部 MCP Server
> 当前状态：完整目标共69项，代码已实现58/69，完整自动验收58/69；TLS四项已完成最终CA清理、双代销毁与宿主恢复，另11项待实现。Capture17项、Rules五项、Composer六项、Breakpoints十一项、Diagnostics四项与Settings十五项均已完成真实自动验收。首批24项共享registry、MCP adapter、
> Desktop Agent接线、owning executor正向unit与真实Agent/MCP调用均为24/24。Settings中的Tool授权开关已完成，
> Settings代码15/26、完整自动验收15/26；只读六项、系统代理两项、TLS四项及偏好三项已完成真实验收。Playground
> recipe为58/58、Developer人工结论为0/58；Capture Lab integration覆盖39/39，真实Electron覆盖2/39。

当前目录共69个目标Tool，名称全部唯一。该数字描述完整产品目标，不代表已有69个实现；每行“当前进度”
才是实现事实。新增、删除或拆分Tool时必须同步更新数量并重新检查重名。

2026-09-07按用户决定移除Updates四项目标；Updates仅保留产品功能，不注册为Tool。此前验收记录中的73项目标为历史口径。

| Feature | 目标 | 已实现并自动验收 | 代码完成待验收 | 待实现 |
| --- | ---: | ---: | ---: | ---: |
| Capture | 17 | 17 | 0 | 0 |
| Rules | 5 | 5 | 0 | 0 |
| Composer | 6 | 6 | 0 | 0 |
| Breakpoints | 11 | 11 | 0 | 0 |
| Diagnostics | 4 | 4 | 0 | 0 |
| Settings | 26 | 15 | 0 | 11 |
| 合计 | 69 | 58 | 0 | 11 |

## 1. 唯一目录

本文件是 Agent 与 MCP 可调用产品能力的唯一完整清单。实现时，每个 Tool descriptor 只在
`packages/interceptor-tools/` 定义一次；内置 Agent 与 MCP 复用同一名称、schema、执行函数和结果类型，
不复制两套 Tool。

目录只收录真实产品用户意图：查询、修改配置、控制代理、处理断点、发送请求和文件操作。
Agent 自身 Session/Provider 控制、MCP 接入控制、窗口导航、事件订阅和 Main/Core 内部编排不注册为 Tool，
见第 5 节。

### 1.1 Feature命名契约

Tool名称固定使用`<feature>_<verb>[_<object>]`，前缀等于拥有该业务能力的feature/capability，而不是当前UI页面。
当前目录使用`capture`、`rules`、`composer`、`breakpoints`、`diagnostics`与`settings`六个前缀。
前缀已经表达对象时不重复，例如使用`breakpoints_continue`而不是
`breakpoints_continue_breakpoint`，使用`rules_get_tree`而不是`rules_get_rules`。

本轮把已有24项一次性切换到feature命名，同时把Capability ID的`traffic`改为`capture`、`requests`改为
`composer`。不保留旧Tool alias、旧Capability ID、Settings迁移或双写；持久设置中的未知旧名称按既有边界丢弃，
历史Transcript仍只读展示其原始调用。Agent discovery、MCP `tools/list`、Settings、Playground与所有自动化验收
只使用新名称。

GitHub公开后不再需要GitHub身份Tool，因此完整目标目录删除`get_github_auth_status`、`start_github_sign_in`、
`open_github_authorization`与`sign_out_github`四个候选。产品已有GitHub Auth与Updates代码不属于Tool目录，保留原产品流程。

状态含义：

- **共享 registry + MCP adapter + Agent**：Tool已由`@interceptor/tools`唯一实现，并接入MCP adapter与Desktop Agent；
- **共享 registry + MCP adapter**：Tool已由`@interceptor/tools`唯一实现并由Desktop MCP adapter对外提供；尚未接入内置Agent；
- **产品已具备**：产品已有正式入口，Tool descriptor 与 Agent/MCP 接线待实现；
- **先补 intent**：产品 UI 已有能力，但缺少可供 Tool 复用的语义单一入口；
- **待产品实现**：产品本身尚无该能力，不先为 Tool 新建后门。

## 2. Settings 开关与执行模式

### Main共享入口审计（2026-09-07）

- `invokeMainTool`注册24个Main命令，Agent与MCP共用，IPC单独注册handler。
- 原19项已完成共享方法整理；Archive新增2项、Settings偏好新增3项沿同一规则实现，当前代码58/69、完整自动验收58/69。
- HAR与Archive导入/导出已通过完整自动验收，不要求所有IPC都开放为Tool。

| 类别 | Main命令 | 当前业务入口 |
| --- | --- | --- |
| 已共享，4项 | `settings.core-process.status`、`settings.system-proxy.status`、`settings.certificate.status`、`settings.app-containers.list` | 同一CoreRuntime或Main只读方法；Tool侧仅投影允许的返回字段 |
| 已共享，2项 | `settings.system-proxy.enable`、`settings.system-proxy.restore` | 同一系统代理操作队列与启用/恢复方法，冷启动语义不变 |
| 已共享，4项 | `settings.tls-insecure-hosts.replace`、`settings.tls-passthrough.replace`、`settings.https-decryption.enable`、`settings.https-decryption.disable` | 同一Main配置/启停方法；TLS真实清理及宿主恢复已验收 |
| 已共享，2项 | `rules.import`、`composer.collection.import` | 同一导入Service与产品预览确认生命周期；Tool适配安全结果 |
| 已共享，2项 | `diagnostics.export`、`capture.har.export` | 同一原生Save与Core任务启动函数，HAR真实验收已通过 |
| 已共享，1项 | `capture.body.export` | 唯一`startBodyExport`编排Dialog、取消与任务启动；明确区分UI正文引用和Exchange正文身份，后者保留归属与Core代际复核 |
| 已共享，2项 | `rules.export`、`composer.collection.export` | 各功能的`exportSavedRules`/`exportSavedCollection`读取Core已保存树，再调用IPC共用导出函数；UI仍导出当前编辑树，不隐式Apply或Save |
| 已共享，1项 | `composer.collection.replace` | 同一`replaceCollection`负责Core保存和变更通知；IPC排除发起窗口，由返回值确认快照，Tool通知全部Renderer |
| 已共享，1项 | `capture.har.import` | 共用原生Open与任务启动；Core成功导入后统一通知Renderer重新查询，不依赖导入弹窗 |
| 已共享，2项 | `capture.archive.export`、`capture.archive.import` | IPC/Agent/MCP共用`startArchiveExport`/`startArchiveImport`；整库快照与追加导入沿原Core任务，复用完成通知 |
| 已共享，3项 | `settings.language.set`、`settings.theme.set`、`settings.export-privacy-defaults.set` | `UiPreferencesService`管理请求/取消/确认；常驻Renderer串行应用并持久化，Main完成后广播 |

- 后续Settings未实现Tool继续遵守已统一的规则。
   - IPC handler、MCP Tool和Agent Tool调用同一业务方法，Main/Core统一发出状态通知。
   - 保留原生Dialog、独立授权、取消和结果脱敏。
   - Body UI仍须支持HTTP、WebSocket、gRPC和断点原文，不能为了统一而删除能力。
   - 导出当前树和已保存树若是不同操作，使用明确的独立方法，不用调用来源暗中切换。

HAR同步故障已有真实证据：`interceptor-har-tools-e2e-green-20260907-162943`精确失败于已导入Exchange的
公共Capture行不可见。已用统一导入通知和Clear后查询修复，同一真实流程Green，见[HAR验收](transfer.md#har-tool-acceptance)。

<a id="shared-main-actions-acceptance"></a>
### Main方法整理验收（2026-09-07）

- 行为不变的重构先取得现有基线Green，不人为制造Red。
   - Collection同步/就绪/导入保存15/15，真实`composer.tools.collection`为1/1；证据`interceptor-collection-shared-save-baseline-20260907-190511`。
   - Body与Capture保护36/36，真实`capture.tools.body-export`为1/1；证据`interceptor-body-shared-save-baseline-20260907-190921`。
   - 两项树导出11/11，真实`rules.tools.export`与`composer.tools.transfer`为2/2；证据`interceptor-tree-export-shared-baseline-20260907-191441`。
- 同一最终构建上，四条真实流程4/4（2.3分钟）；七个受影响业务测试文件70/70，Desktop typecheck通过。
   - 新增八项已保存树读取、Core失败与取消测试通过，不把补充覆盖率当作历史Red。
   - 证据和trace位于TEMP下`interceptor-main-shared-actions-green-20260907-191814`。
   - Body两代Main/Core为`22592/26460`、`41812/3536`；Collection保存为`21292/3120`、`41164/30620`。
   - Collection Transfer为`39056/18028`、`3880/5804`；Rules Export为`14452/10048`、`43604/25040`。
   - 八代均`gracefulDestroyVerified=true`，Main/Core/Worker退出、8888释放、完整WinINet/journal恢复。
- Windows package、artifact audit（1,294 files / 392,912,221 bytes）与packaged smoke1/1（43.2秒）通过。
   - 完整日志为TEMP下`interceptor-main-shared-actions-package-20260907.log`、`interceptor-main-shared-actions-artifact-audit-20260907.log`；smoke证据为`interceptor-main-shared-actions-smoke-20260907-192158`。
   - 本次未改依赖、UI、Preload或Core协议；复用HAR阶段仍适用的production audit零漏洞结果，不新增设计或parity范围。
   - TLS清理、其他既有视觉债务和Developer人工结论仍独立保留，不能由本次重构验收替代。

`Settings > Agent > Tool capabilities` 从**已实现的共享 Tool registry**渲染，不维护第二份手写清单。
尚未实现的目标 Tool 只保留在本文档，不在产品 UI 中显示不可用开关。

设计稿已落地首批24项共享registry fixture、五个feature分组、搜索、Agent/MCP双Switch、会话级`Ask/Auto`与
Transcript内联问询卡；明暗基线见`design-vite/shots/*/agent-models/`。首批24项Tool现已全部接入Desktop，
后续目标Tool仍须逐项通过相同的设计和验收门禁。

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
- Tool 被关闭后，新的 discovery / `tools/list` 立即不再返回它；Agent每次Model Call和每项Tool执行开始前
   重读开关，已经进入executor的调用继续使用该次调用的`AbortSignal`完成。

本阶段由Main中的`ToolCapabilitySettingsService`拥有全局设置，不归某个Workspace、Agent Session或MCP Client。
它从同一可执行registry投影Settings专用的六组只读目录：`Capture`、`Rules`、`Composer`、`Breakpoints`、
`Diagnostics`与`Settings`；分组与Model discovery的六个Capability边界完全一致。Renderer和Design不得再维护第二份Tool名称、
类型或说明清单。

落盘位置为`<userData>/tool-capabilities/settings.json`，只保存关闭项：

```ts
interface ToolCapabilitySettingsRecord {
   agentDisabledToolNames: string[];
   mcpDisabledToolNames: string[];
}
```

- fresh profile或两组关闭项都为空时不保留文件，当前58项自然全部开启；
- 读取时拒绝非法schema、重复名称和额外字段；合法数组中的未知/旧名称从内存快照丢弃，不改写文件、不映射到
   新名称；写入只保留当前registry名称并按registry顺序规范化；
- `getToolCapabilitySettings`返回六组目录和两组关闭名称的完整快照；
- `disableAgentTool`、`enableAgentTool`、`disableMcpTool`、`enableMcpTool`是四条语义单一intent；
- mutation在Main串行执行、原子替换文件并返回最新完整快照；未知Tool名称在写入前拒绝；
- Renderer搜索词只属于当前Settings视图内存，不持久化，也不改变开关状态；
- Agent当前通过动态`AgentToolSource`接入十五个Capture Tool、五个Rules Tool、六个Composer Tool、
   十一个Breakpoints Tool、四个Diagnostics Tool与十二个Settings Tool；关闭项同时过滤Capability
   Index、discovery、schema与执行入口。MCP Desktop已接入同一registry。

## 3. 完整 Tool 清单

### 3.1 Capture

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `capture_get_proxy_status` | query | `getCaptureStatus` / `proxy.status` | 共享 registry + MCP adapter + Agent |
| `capture_get_storage_status` | query | `getCaptureUsage` / `capture.status` | 共享 registry + MCP adapter + Agent |
| `capture_start_recording` | change | `startCapture` | 共享 registry + MCP adapter + Agent；ask/auto纵向流程完成 |
| `capture_stop_recording` | change | `stopCapture` | 共享 registry + MCP adapter + Agent；ask/auto纵向流程完成 |
| `capture_clear` | change | `clearCapture` / `capture.cleanup(scope: 'all')` | 共享 registry + MCP adapter + Agent；旧session scope已删除，ask/auto纵向流程完成 |
| `capture_list_exchanges` | query | `querySessions` / `sessions.query` | 共享 registry + MCP adapter + Agent |
| `capture_get_exchange` | query | `getExchangeDetail` / `sessions.detail` | 共享 registry + MCP adapter + Agent |
| `capture_get_exchange_body` | query | `getExchangeDetail` + `readBody` / `sessions.detail` + `body.read-range` | 共享 registry + MCP adapter + Agent；用`exchangeId + bodyId`回查可信MIME/encoding，真实E2E完成 |
| `capture_list_websocket_messages` | query | `queryWebSocketFrames` / `websocket.frames` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `capture_list_grpc_messages` | query | `queryGrpcMessages` / `grpc.messages` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `capture_export_body` | change | `capture.body.export` / `startBodyExport` / 原生 Save Dialog | 已完成；正文归属、完整编码字节、Ask/Auto、原生取消及交付验证 |
| `capture_export_har` | change | `capture.har.export` / `startHarExport` / 原生 Save Dialog | 已完成；三种范围、显式脱敏、完整正文、取消和共享入口验收 |
| `capture_import_har` | change | `capture.har.import` / `startHarImport` / 原生 Open Dialog | 已完成；同流程导出再导入、追加、统一刷新和取消验收 |
| `capture_export_archive` | change | `capture.archive.export` / `startArchiveExport` / 原生 Save Dialog | 已完成；完整快照、原生取消、Agent/MCP/IPC共用入口 |
| `capture_import_archive` | change | `capture.archive.import` / `startArchiveImport` / 原生 Open Dialog | 已完成；同流程归档往返、追加、正文/WS消息与共享通知 |
| `capture_get_transfer_job` | query | `transfer.job.get` | 已完成；Agent/MCP静默查询、安全摘要与交付验证 |
| `capture_cancel_transfer_job` | change | `transfer.job.cancel` | 已完成；Agent/MCP运行中取消、清理、终态幂等与交付验证 |

### 3.2 Rules

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `rules_get_tree` | query | `getRules` / `rules.get` | 共享 registry + MCP adapter + Agent；Map Local路径脱敏 |
| `rules_get_hits` | query | `getRuleHits` / `rules.hits` | 共享 registry + MCP adapter + Agent |
| `rules_replace_tree` | change | `replaceRules` / `rules.replace` | 共享 registry + MCP adapter + Agent；严格递归schema，Map Local仅随未变Rule保留 |
| `rules_import` | change | `rules.import` / Main请求生命周期 / Renderer共享预览与原子追加 | 共享 registry + MCP adapter + Agent |
| `rules_export` | change | `rules.export` / Main共用`exportRules` / 原生 Save Dialog | 共享 registry + MCP adapter + Agent |

### 3.3 Composer

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `composer_get_collection` | query | `getCollection` / `collection.get` | 共享 registry + MCP adapter + Agent |
| `composer_replace_collection` | change | `composer.collection.replace` / Main共用`replaceCollection` / `collection.replace` | 共享 registry + MCP adapter + Agent |
| `composer_import_collection` | change | `composer.collection.import` / Main请求生命周期 / Renderer共享预览与原子追加 | 共享 registry + MCP adapter + Agent |
| `composer_export_collection` | change | `composer.collection.export` / Main共用`exportCollection` / 原生 Save Dialog | 共享 registry + MCP adapter + Agent |
| `composer_send_request` | change | `sendComposerRequest` / `composer.send` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `composer_probe_connection` | change | `probeTls` / `tls.probe` | 共享 registry + MCP adapter + Agent；真实E2E完成 |

### 3.4 Breakpoints

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `breakpoints_list` | query | `listBreakpoints` / `breakpoint.list` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_enable_http` | change | `setBreakpointsEnabled(true)` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_disable_http` | change | `setBreakpointsEnabled(false)` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_enable_websocket` | change | `enableWebSocketBreakpoints` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_disable_websocket` | change | `disableWebSocketBreakpoints` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_continue` | change | `resolveBreakpoint(..., 'continue')` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_forward_edited` | change | `resolveBreakpoint(..., 'continue', edit)` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_drop` | change | `resolveBreakpoint(..., 'drop')` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_continue_queue` | change | `continueBreakpointQueue` / `breakpoint.continueQueue` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_drop_queue` | change | `dropBreakpointQueue` / `breakpoint.dropQueue` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `breakpoints_continue_rule` | change | `continueBreakpointRule` / `breakpoint.continueRule` | 共享 registry + MCP adapter + Agent；真实E2E完成 |

Breakpoints十一项已全部接入。`breakpoints_list`是唯一query；其余十项是change并服从Agent Session或
MCP Client的`ask`/`auto`。pending identity只在当前Core代际内由`breakpointId`标识，没有revision；审批前读取
当前pending生成动态影响，执行仍以Core `breakpoint.resolve`对已消失ID返回的`conflict`为最终并发保护。
三条批量命令按正式queueKey/ruleId作用于命令开始时的匹配集合，返回实际`resolvedCount`；空目标返回0，
不套用单项resolve的stale冲突语义，不采用Renderer未提交草稿。

`breakpoints_forward_edited`按pending phase收窄：request接受`method`、`url`与文本`body`，response接受
`statusCode`与文本`body`，WebSocket只接受文本`body`；跨phase字段在审批和执行前拒绝。至少一项编辑必须存在；
不开放headers、`bodyFilePath`、`closeCode`或任意本地路径。文件编辑仍只经产品原生Dialog，Map Local占位不适用于Breakpoint。
Agent与MCP E2E必须先用Rules/WebSocket正式UI和真实客户端产生pending，再从公共DOM或Tool query取得动态ID；
禁止直接seed Core queue。

### 3.5 Diagnostics

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `diagnostics_get_trace` | query | `getCoreTrace` / `diagnostics.recent`限定当前Core trace及200条 | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `diagnostics_get_recent` | query | `getRecentDiagnostics` / `diagnostics.recent`当前Core内存快照 | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `diagnostics_query` | query | `queryDiagnostics` / `diagnostics.query` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `diagnostics_export` | change | typed Main `diagnostics.export` / UI共用`startDiagnosticsExport` / 原生 Save Dialog | 共享 registry + MCP adapter + Agent；实际JSONL与双代验收完成 |

### 3.6 Settings

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `settings_get_core_process_status` | query | `getCoreProcessStatus` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `settings_get_system_proxy_status` | query | `getSystemProxyStatus` | 共享 registry + MCP adapter + Agent；仅公开状态，不返回OS配置 |
| `settings_enable_system_proxy` | change | `enableSystemProxy` | 共享 registry + MCP adapter + Agent；Ask/Auto真实E2E完成 |
| `settings_restore_system_proxy` | change | `restoreSystemProxy` | 共享 registry + MCP adapter + Agent；首次original恢复/重复Restore真实E2E完成 |
| `settings_get_certificate_status` | query | `getCertificateStatus` | 共享 registry + MCP adapter + Agent；公开身份白名单，无路径/私钥 |
| `settings_generate_certificate` | change | `generateCertificate` | 产品已具备 |
| `settings_install_certificate` | change | `installCertificate` / UAC | 产品已具备 |
| `settings_uninstall_certificate` | change | `uninstallCertificate` / UAC | 产品已具备 |
| `settings_delete_certificate` | change | `deleteCertificate` / 必要时 UAC | 产品已具备 |
| `settings_reveal_certificate` | change | `revealCertificate` | 产品已具备 |
| `settings_view_certificate` | change | `viewCertificate` | 产品已具备 |
| `settings_open_certificate_manager` | change | `openCertificateManager` | 产品已具备 |
| `settings_get_tls_insecure_hosts` | query | `getInsecureHosts` / `tls.getInsecureHosts` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `settings_replace_tls_insecure_hosts` | change | `setInsecureHosts` / `tls.replaceInsecureHosts` | 真实E2E及最终CA清理已完成 |
| `settings_enable_https_decryption` | change | `setHttpsDecryption(true)` | 真实E2E及最终CA清理已完成 |
| `settings_disable_https_decryption` | change | `setHttpsDecryption(false)` | 真实E2E及最终CA清理已完成 |
| `settings_get_tls_passthrough` | query | `getTlsPassthroughSettings` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `settings_replace_tls_passthrough` | change | `replaceTlsPassthroughSettings` | 真实E2E及最终CA清理已完成 |
| `settings_list_app_containers` | query | `listAppContainers` | 共享 registry + MCP adapter + Agent；Windows真实枚举且不改豁免 |
| `settings_enable_app_container` | change | `setAppContainerLoopbackExemption(sid, true)` / UAC | 产品已具备 |
| `settings_disable_app_container` | change | `setAppContainerLoopbackExemption(sid, false)` / UAC | 产品已具备 |
| `settings_enable_all_app_containers` | change | `enableAllAppContainers` / UAC | 产品已具备 |
| `settings_disable_all_app_containers` | change | `disableAllAppContainers` / UAC | 产品已具备 |
| `settings_set_language` | change | `setUiLanguage` / `UiPreferencesService.setLanguage` | 已完成；15个正式ID、原UI/Agent/MCP及专属语言流程 |
| `settings_set_theme` | change | `setUiTheme` / `UiPreferencesService.setTheme` | 已完成；四主题、原UI/Agent/MCP和重启持久化 |
| `settings_set_export_privacy_defaults` | change | `setExportPrivacyDefaults` / `UiPreferencesService.setExportPrivacyDefaults` | 已完成；三个显式boolean、连续单字段合并与已开HAR草稿隔离 |

## 4. 当前58项实现矩阵

这里的“正向executor unit”只计算`packages/interceptor-tools` owning test真实执行该Tool的成功路径；MCP或Agent
adapter测试不能代替owner测试。“真实调用”必须经过真实Electron中的Agent或MCP入口、共享executor与Core，
`tools/list`枚举或Playground recipe不算执行覆盖。

| Tool | Agent接入 | 正向executor unit | 真实Agent/MCP调用 |
| --- | --- | --- | --- |
| `capture_get_proxy_status` | 已完成 | 已完成 | Agent + MCP已完成 |
| `capture_get_storage_status` | 已完成 | 已完成 | Agent已完成 |
| `capture_start_recording` | 已完成 | 已完成 | Agent已完成 |
| `capture_stop_recording` | 已完成 | 已完成 | Agent + MCP已完成 |
| `capture_clear` | 已完成 | 已完成 | Agent已完成 |
| `capture_list_exchanges` | 已完成 | 已完成 | Agent已完成 |
| `capture_get_exchange` | 已完成 | 已完成 | Agent已完成 |
| `capture_get_exchange_body` | 已完成 | 已完成 | Agent已完成 |
| `capture_list_websocket_messages` | 已完成 | 已完成 | Agent已完成 |
| `capture_list_grpc_messages` | 已完成 | 已完成 | Agent已完成 |
| `capture_get_transfer_job` | 已完成 | 已完成 | Agent + MCP已完成 |
| `capture_cancel_transfer_job` | 已完成 | 已完成 | Agent + MCP已完成 |
| `capture_export_body` | 已完成 | 已完成 | Agent + MCP已完成 |
| `capture_export_har` | 已完成 | 已完成 | Agent + MCP + IPC已完成 |
| `capture_import_har` | 已完成 | 已完成 | Agent + MCP + IPC已完成 |
| `capture_export_archive` | 已完成 | 已完成 | Agent + MCP + IPC已完成 |
| `capture_import_archive` | 已完成 | 已完成 | Agent + MCP + IPC已完成 |
| `rules_get_tree` | 已完成 | 已完成 | Agent + MCP已完成 |
| `rules_get_hits` | 已完成 | 已完成 | Agent已完成 |
| `rules_replace_tree` | 已完成 | 已完成 | Agent + MCP已完成 |
| `rules_export` | 已完成 | 已完成 | Agent + MCP已完成 |
| `rules_import` | 已完成 | 已完成 | Agent + MCP已完成 |
| `composer_send_request` | 已完成 | 已完成 | Agent已完成 |
| `composer_probe_connection` | 已完成 | 已完成 | Agent已完成 |
| `composer_get_collection` | 已完成 | 已完成 | Agent + MCP已完成 |
| `composer_replace_collection` | 已完成 | 已完成 | Agent + MCP已完成 |
| `composer_export_collection` | 已完成 | 已完成 | Agent + MCP已完成 |
| `composer_import_collection` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_list` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_enable_http` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_disable_http` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_enable_websocket` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_disable_websocket` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_continue` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_forward_edited` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_drop` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_continue_queue` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_drop_queue` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_continue_rule` | 已完成 | 已完成 | Agent + MCP已完成 |
| `diagnostics_query` | 已完成 | 已完成 | Agent已完成 |
| `diagnostics_get_trace` | 已完成 | 已完成 | Agent + MCP已完成 |
| `diagnostics_get_recent` | 已完成 | 已完成 | Agent + MCP已完成 |
| `diagnostics_export` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_core_process_status` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_system_proxy_status` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_certificate_status` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_tls_insecure_hosts` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_tls_passthrough` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_list_app_containers` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_enable_system_proxy` | 已完成 | 已完成 | Agent已完成 |
| `settings_restore_system_proxy` | 已完成 | 已完成 | Agent已完成 |
| `settings_replace_tls_insecure_hosts` | 已完成 | 已完成 | Agent已完成，最终CA清理通过 |
| `settings_replace_tls_passthrough` | 已完成 | 已完成 | Agent已完成，最终CA清理通过 |
| `settings_enable_https_decryption` | 已完成 | 已完成 | Agent已完成，最终CA清理通过 |
| `settings_disable_https_decryption` | 已完成 | 已完成 | Agent已完成，最终CA清理通过 |
| `settings_set_language` | 已完成 | 已完成 | Agent + MCP + IPC已完成 |
| `settings_set_theme` | 已完成 | 已完成 | Agent + MCP + IPC已完成 |
| `settings_set_export_privacy_defaults` | 已完成 | 已完成 | Agent + MCP + IPC已完成 |

## 5. 实施顺序与阶段门禁

Tool不按“只读产品版”和“完整产品版”切成两套。完整交付目标是69项，首批24项完成只代表一个阶段完成。
2026-09-05用户恢复执行全部计划；Settings只读六项、系统代理两项、TLS四项、偏好三项、Rules导入/导出、Collection四项、Breakpoints批量三项、Diagnostics三项、Capture任务两项、Body导出及HAR/Archive各两项均已完成，当前58/69。

### 5.1 首批24项与独立验收

以下保留首批已完成阶段和独立验收欠账；人工矩阵不是后续Tool开发的前置条件，也不代表全量Tool已交付。

1. **[已完成] 基础层**：设计能力列表与`ask`问询；建立24项共享registry、MCP adapter、Settings持久化、
   Agent渐进discovery；接入首批Capture query和`capture_stop_recording`，完成首个query/change真实纵向流程。
2. **[已完成] 正文/消息**：`capture_get_exchange_body`、`capture_list_websocket_messages`、`capture_list_grpc_messages`已接入Agent，
   owning executor unit、结构化Transcript摘要、15语言与明暗Parity完成。真实workflow覆盖正文range、WebSocket
   全部/单方向和gRPC request/response；重启请求增量0，关闭三项后均返回`unknown_tool`。E2E曾暴露Electron
   UtilityProcess中的Mockttp对不安全源站追加OpenSSL专用`@SECLEVEL=0`并报`INVALID_COMMAND`；Developer批准后，
   第三方patch只在Electron省略该命令，Node行为保持。补丁Unit 2/2、H2 integration 6/6、真实E2E 1/1、
   Windows package/artifact audit/smoke均Green。
3. **[已完成] Traffic控制补尾**：`capture_start_recording`、`capture_clear`已接入Agent；两项均完成Ask Deny/Allow与Auto。
   `capture_clear`审批前动态读取usage；产品按钮、Agent和MCP成功清理后统一发布带`clearedBefore`的reset，使rows、
   selection、facets、Rules hits与旧分页同步收敛。真实workflow验证清空后继续捕获、typed摘要、关闭项
   `unknown_tool`、重启零重放和系统副作用恢复。
4. **[已完成] Rules**：同一Zod递归schema生成Model JSON Schema并严格解析folder/rule及全部matcher/action联合，
   校验三级目录与ID唯一性；三项已接入Agent。Map Local真实路径不进入Tool上下文且只可原位安全保留；typed摘要、
   动态影响、Ask Deny/Allow、Auto、stale revision、真实Rule effect、外部revision并发同步、关闭项与重启零重放均通过。
   最终Tools`43/43`、Runtime`121/121`、MCP`30/30`、Desktop`450/450`、Proxy Rules Green`95/95`、
   design interaction`68/68`与全workspace typecheck Green；真实Electron Agent Rules、MCP Rules与Rules Import
   联合`3/3` Green，共用Windows Dialog的Composer Import与Rules Body file回归`2/2` Green。Windows package、
   artifact audit（`1,294 files / 392,808,773 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green。
5. **[已完成] Breakpoints**：八项共享Tool已接入Agent并由Agent/MCP真实Electron共同验收。HTTP覆盖query、Ask
   Deny/Allow、Auto、stale、method/URL/body编辑、Drop与启停；WebSocket覆盖真实连接、pending、Continue/Edit/
   Drop/Disable及连接隔离。八项Settings撤权即时生效，Client断开与credential轮换不解队，Agent重启Model与origin
   增量均为0。修复前`32f2889a`分别Red于Agent discovery为空和MCP stale仍请求审批；当前联合`2/2` Green。
   最终Tools`54/54`、Runtime`122/122`、MCP`32/32`、Desktop`454/454`、Core focused`11/11`及全workspace
   typecheck Green；明暗Breakpoints Agent parity合计`22/22`、0 missing、0 flagged、0px，完整Parity为
   `206 views / 1,426 targets / 1,396 matched / 30既有missing / 304既有flagged`。Windows package artifact
   audit为`1,294 files / 392,817,170 bytes`、production audit 0漏洞、packaged smoke`1/1` Green。全仓unit仅保留
   已登记的Proxy Core两项chunked framing债务失败。
6. **[已完成] Composer**：`composer_send_request`与`composer_probe_connection`已接入Agent。真实workflow覆盖Ask Deny/Allow、Auto、
   HTTP method/query/header/body、响应脱敏、Capture隔离、TLS成功/失败、两项撤权与双代零重放；owner integration
   覆盖H1/H2/TLS真实socket取消、连接释放与H2目标完整性`8/8`，TLS预取消零连接unit `1/1`。修复前`ffaf323f`同一workflow精确Red于
   composer discovery为空，当前`1/1` Green。
7. **[已完成] Diagnostics**：`diagnostics_query`复用共享executor，首批Agent接线、owner正向unit与真实调用均达到
   `24/24`。真实Composer UI创建两次请求，Agent按`core + composer.send + success`查询四条action/command记录；
   验证严格递减sequence、配对trace、敏感URL/query不进入结果、Ask无审批、Settings撤权与恢复、重启零重放。
   最终同一workflow在`401af972`精确Red于Diagnostics schema缺失，当前`1/1` Green；Red及Green两代均优雅销毁
   Main/Core、释放8888并由宿主guard恢复副作用。Tools`66/66`、Desktop`458/458`、Runtime`122/122`、Core Protocol
   `25/25`、MCP`32/32`、Playground`67/67`、design interaction`71/71`与全workspace typecheck Green；Proxy Core
   `329/331`仅保留两项已登记chunked framing失败。Diagnostics明暗parity`18/18 matched / 0 missing / 0 flagged / 0px`；
   完整Parity为`210 views / 1,474 targets / 1,442 matched / 32既有missing / 303既有flagged`。本轮同时补齐前一命名重构
   遗留的旧Tool名称设计截图。Windows package、artifact audit（`1,294 files / 392,826,512 bytes`）、production audit
   0漏洞与packaged smoke`1/1` Green。
8. **[待人工验收] Playground Tool矩阵**：自动Tool达到24/24后，Developer通过正式Playground逐项执行24项
   recipe并导出脱敏Pass/Fail/Blocked报告；自动测试不得替代人工结论。新增Tool随各自交付同步增加recipe，
   目前有58项recipe、0项Developer结论；58项已完成自动验收，另11项尚未实现，人工结论独立记录。
9. **[待实现] Capture 39项收敛**：在Tool主线与人工矩阵之后，真实Electron按HTTP、Bodies、Encoding、
   WebSocket、gRPC、TLS六组单向启动并操作正式Playground；复用场景目录、Draft和流量发生器，Capture断言独立，
   从当前2/39收敛到39/39，不建立一个巨型workflow。

每个Tool能力组都必须先更新owning feature与E2E契约，再取得unit/integration Red和真实E2E Red，随后实现并复跑
同组Green；Tool自身的真实E2E是该组完成条件，不能推迟到后续人工矩阵或Capture 39项收敛。没有正式产品入口的Tool先补产品intent，再复用
该入口，不在Tool层实现第二套业务逻辑。VS Code MCP协议升级、双Host一致性、MCP进度SSE和DeepSeek线上兼容
分别保留为外部阻塞或人工验收项。Settings只读、系统代理、TLS、偏好、Rules五项、Composer六项、Breakpoints十一项、Diagnostics四项和Capture17项已完成。Main方法整理已验收，继续Settings证书及AppContainer Tool。

### 5.2 后续45项计划（已完成34项，剩余11项）

按feature逐组交付，每个工作项完成契约、测试、实现、证据和状态同步后再进入下一项；不一次性铺设空壳。
同一feature内可按正式用户流程拆分多个工作项，不改变第3节的feature所有权和Tool名称。

| 顺序 | Feature | 尚未完成验收 | 交付范围与顺序 |
| --- | --- | ---: | --- |
| 1 | Settings | 11 | 只读6项、系统代理2项、TLS4项、语言/主题/隐私3项已完成；证书7项与AppContainer4项待实现及真实原生授权、退出恢复验收 |
| 2 | Rules | 0 | Export/Import均已完成；Import复用UI预览确认与原子追加，真实输入来自同workflow产品Export |
| 3 | Composer | 0 | Collection查询/替换与Export/Import均已完成；Import复用正式确认及自动保存协调，文件输入由同workflow产品Export生成 |
| 4 | Breakpoints | 0 | Continue queue、Drop queue、Continue rule已完成；真实HTTP/WebSocket作用范围、Ask/Auto、空目标与重启验证闭环 |
| 5 | Diagnostics | 0 | Trace/Recent当前Core快照与原生JSONL导出均已完成；查询静默、异步任务状态及文件脱敏已验收 |
| 6 | Capture | 0 | Transfer任务查询/取消、Body、HAR与Archive导入/导出均已完成，复用正式任务、完成通知与原生Dialog流程 |

需要原生Dialog或UAC的工作项仍须真实键鼠交互；若环境或权限确实阻塞，记录具体人工操作和恢复命令，不能
伪造返回值、跳过验收或标记完成。跨平台专属步骤分别记录平台证据，不把Windows结果当成macOS已验收。

### 5.3 恢复执行入口

2026-09-08：TLS四项最终workflow `1/1` Green，两代Main/Core正常销毁、测试CA自动卸载删除、根证书库与WinINet/journal恢复。证据见[TLS验收](settings.md#tls-tool-acceptance)。以下保留各组恢复时的历史记录。

本轮从已推送的`07649e79`恢复，Settings只读查询组已完成以下六项：

- `settings_get_core_process_status`
- `settings_get_system_proxy_status`
- `settings_get_certificate_status`
- `settings_get_tls_insecure_hosts`
- `settings_get_tls_passthrough`
- `settings_list_app_containers`

Main状态使用受类型约束的`invokeMain`，Core TLS查询沿用`invoke`与原始`AbortSignal`；Agent移除重复接入名单，
直接消费唯一registry。六项只接受空对象，白名单排除证书路径、私钥、原始proxy/bypass/PAC、helper输出与错误路径。
owning unit精确Red于缺失六项；真实`settings.tools.readonly`先在8次Model请求后Red于空discovery；
摘要追加unit与真实E2E Red于`value`，最终同一workflow完整Green。Agent/MCP各执行6项，分别撤权，MCP错误
为`-32602`；UI产生TLS配置，查询前后OS代理/exemption不变，同profile重启Model增量0并删除测试配置。
两代Main/Core为`12888/21524`、`41644/22360`，均`gracefulDestroyVerified=true`并释放8888。
Tools`97/97`、Desktop`467/467`、Runtime`122/122`、Protocol`25/25`、MCP`32/32`、Playground`67/67`、
全workspace typecheck通过；新增明暗4 views共44 targets全匹配、0 missing、0 flagged、0px。Windows package、
artifact audit（1,294 files / 392,835,349 bytes）、production audit 0漏洞、packaged smoke`1/1`通过。
完整设计交互曾69/71，修正两项旧目录/模糊selector断言后该文件5/5通过；Proxy Core仍329/331，仅保留既有framing债务。
完整Parity已运行214 views / 1,520 targets / 1,486 matched / 34 missing / 304 flagged；新增四个视图仍为
44/44、0px。相对上一报告的波动来自未改动的DeepSeek Dialog Endpoint与TLS passthrough深色旧视图，
不把完整视觉债务标为Green。410张既有设计截图保留原基线，仅新增Settings查询/分组明暗四张。

系统代理两项现已完成：UI与Tool共用Main的`enableSystemProxy`/`restoreSystemProxy`，FIFO内在OS写入前
检查取消，已开始的原子编排完成upstream同步；冷启动自动接管不变。unit13/13从缺失Tool转Green，真实
`settings.tools.system-proxy`从空发现Red转Green，摘要独立Red/Green；覆盖2次Deny、2次Allow、3次Auto、
重复Restore `not-owned`、撤权零写入、同profile重启零重放与首次original恢复。与只读、全局开关联合3/3
Green；MCP Browser/Desktop回归2/2。两代Main/Core `37532/43864`、`41620/2448`均优雅销毁并释放8888。
Tools110/110、Desktop470/470、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67、design interaction71/71
与全workspace typecheck通过；Proxy Core仍329/331仅两项既有framing债务。新增8个明暗审批/结果视图48/48、
0 missing、0 flagged、最大0.5px；完整Parity222 views / 1,568 targets / 1,534 matched / 34 missing / 306 flagged，
旧DeepSeek深色Dialog和HTTPS setup有既有波动。Windows package、artifact audit（1,294 files / 392,839,696 bytes）、
production audit 0漏洞、packaged smoke1/1通过，真实证据已提前归档。

TLS四项已实现并取得发现/摘要Red及业务断言通过，但最终CA清理E2E未完成，不计入完整验收32项。
TLS阶段保存时registry36项、recipe36项，新增Main typed payload与窄`tls:settings-changed`事件，已挂载面板按序号刷新；
有效解密状态来自正式Core启停返回，不增加`tls.getState`虚构命令。证书与UAC能力仍归下一独立工作项。

2026-09-05用户追问未提交后继续修复并要求保存代码。profile保留判定补入Playwright实际failed/timedOut/
interrupted状态，先3项Red后9/9 Green；CA清理不再因瞬时`isVisible()`跳过卸载/删除，改为按本轮指纹
与真实信任状态等待正式UI操作。TLS审批错误/取消先8项Red后32/32 Green。当前Tools142/142、Desktop485/485、
Runtime122/122、Protocol25/25、MCP32/32、Playground67/67、Core TLS integration12/12、design interaction71/71、
全workspace typecheck通过；TLS新增明暗16视图96/96、0 missing/flagged、最大0.5px。Windows package、artifact
audit（1,294 files / 392,847,733 bytes）、production audit0漏洞、packaged smoke1/1通过，不替代产品E2E。

唯一管理员阻塞仍是LocalMachine Root残留测试CA `8F5FD8BF6D49BE746862522F6AC616583ED152BB`，旧profile已在
修复前被删。Developer须在管理员PowerShell执行`certutil -delstore Root 8F5FD8BF6D49BE746862522F6AC616583ED152BB`，
只读确认移除后再复跑`settings.tools.tls`，验证修复后的实际信任销毁与profile保留路径。当前按用户要求保存
未闭环进度，不将TLS Inventory标为passed；完成该组后再推进证书能力组。

2026-09-06续作确认：`7bc809a1`已推送；Settings只读/系统代理/全局开关及MCP Browser/Desktop关联
workflow共5/5、十代Main/Core全部优雅销毁，归档于TEMP下`interceptor-tls-adjacent-e2e-20260906`。
完整parity238 views / 1,664 targets / 1,630 matched / 34 missing / 305 flagged，TLS专项96/96、最大0.5px，
报告与归档已核对；不用重复这些已完成检查。测试CA仍需管理员移除，最终TLS验收不变。
用户再次要求持续推进，因此权限依赖组单独保留blocked，原计划内无该依赖的独立Tool组继续执行；
后续每组仍取得自己的完整Red/Green与销毁证据，不用其他组结果代替。

### 5.4 Rules Export交付

2026-09-06：`rules_export`已接入共享registry、Agent与MCP，代码总数37/73，完整自动验收33/73。
Tool严格接受空对象，Main从Core读取已保存RuleSet，再与UI复用唯一`exportRules`；UI仍导出当前草稿。
用户经真实Save Dialog选路径，结果仅含`exported`；Deny、原生Cancel和撤权均不写文件，Model看不到路径、
规则正文或Map Local材料。Dialog期间取消会在写文件前拦截迟到的选择；已开始的写入完成正式路径。

- TDD：executor 10项缺失Tool Red→Green；Main导出6项、原生Dialog 4项、摘要21项通过；计数审批不泄露正文。
- 真实Electron：在`0206d12c`产品代码上Red于`export-discovery`缺失，最终同一workflow Agent/MCP `1/1`
   Green（39.6秒），覆盖Deny、真实Cancel/Save、Ask/Auto、ID/enabled/层级、未Apply草稿隔离、双列撤权和重启零重放。
   两代Main/Core `19112/8936`、`37364/40196`均正常销毁、8888释放并恢复完整WinINet/journal；Red/Green分别
   归档于TEMP下`interceptor-rules-export-e2e-red`和`interceptor-rules-export-agent-mcp-green`。
- 关联E2E：全局授权、MCP Browser/Desktop、旧Rules Import `4/4`且七代销毁通过；旧Agent Rules独立`1/1`
   且两代销毁通过。规则目录由3项变为4项，原三项业务调用与数据面语义不变。
- 测试：全workspace typecheck、Tools152/152、Runtime122/122、Protocol25/25、Playground67/67通过。
   全量Desktop492/494与MCP31/32中的旧目录断言修复后分别聚焦27/27、20/20通过；Proxy Core329/331仍仅
   两项既有chunked framing债务，未改动该问题。
- 设计：三状态明暗6视图36/36匹配、0 missing/flagged、最大0.5px；15语言摘要区分已导出与原生取消。
   完整设计交互71/72中唯一旧Playground计数修复后1/1，Rules四项目录展示独立Green。完整parity为
   244 views / 1,700 targets / 1,666 matched / 34既有missing / 304既有flagged，平均2.22%；新增导出仍36/36。
   全部444张重绘输入归档为`interceptor-rules-export-design-generated`，Renderer产物归档为
   `interceptor-rules-export-full-parity`。提交保留六张新图及六张目录内容更新，432张无关旧图保留改动前基准。
- 发布边界：Windows package、artifact audit（1,294 files / 392,851,066 bytes）、production audit0漏洞与
   packaged smoke1/1通过。Playground recipe37/37，不替Developer填写0/37人工结论。

Export完成后进入`rules_import`，下节记录正式intent、TDD与验收证据；不把Import改成只写草稿。

### 5.5 Rules Import交付

2026-09-06：`rules_import`严格空参数，复用Main `RulesImportService`与Renderer `RulesImportActions`的单流程。
UI与Tool使用相同Main入口；App作用域的`RulesImportDialog`保留原确认组件、全部新ID、重复累加和确认即持久化。
原本dirty草稿与导入节点一起保存，不能静默丢弃；Ask/Auto均保留原生Open和预览确认。Main只收发请求ID与
公开结果，运行时严格验证响应/非负安全整数计数，错误不包含路径、文件名或正文。

- TDD：原解析与Store基线42/42，executor10项缺失Tool Red→Green；Main生命周期/响应15/15，Renderer流程/
   桥接13/13，摘要23/23，原生Dialog5/5。真实Red在`4ce5acaa`实现前代码缺少Import discovery，Main/Core
   `20092/17548`正常销毁，归档`interceptor-rules-import-e2e-red`。
- 真实Agent/MCP：原生Open取消、预览取消、确认追加、全新ID、enabled/目录保持、Auto草稿持久化、双列撤权、
   同profile重启零重放均通过。最终与Export联合2/2 Green（1.3分钟），四代Main/Core `17384/14908`、
   `24684/26240`、`12772/38364`、`23956/43500`全部正常销毁、释放8888并恢复WinINet/journal；归档于
   TEMP下`interceptor-rules-import-export-final-e2e`。
- 关联首轮：旧Rules Agent、Settings授权、MCP Browser/Desktop、旧UI Import共5条通过且九代正常销毁。
   Export因原生Cancel焦点失败后超时，失败代`43084/34304`未获graceful；guard紧急恢复了宿主。证据原样
   保留于`interceptor-rules-import-combined-first-run`。Cancel错误分支补关闭本轮Dialog的回归后5/5 Green，
   原生Dialog测试独占前台，复跑Export/Import通过；不把紧急恢复算正常退出。
- 验证：全workspace typecheck、Desktop516/516、Tools162/162、MCP32/32、Runtime122/122、Protocol25/25、
   Playground67/67与设计交互73/73通过，随后Main边界15/15和Dialog5/5独立补测Green；Proxy Core329/331
   仍只有另一个工作项负责的两项framing债务。专项10视图56/56、0 missing/flagged、最大0.5px；读取遮罩
   脱离原内容容器后的行高继承差异已复原为1.23，不用尺寸补偿。完整parity为250 views / 1,736 targets /
   1,704 matched / 32既有missing / 303既有flagged，平均2.24%；Import相关56/56仍无缺失和差异。
   450张设计输入归档于`interceptor-rules-import-design-generated`，Renderer图片归档于
   `interceptor-rules-import-full-parity`；提交保留六张新图、六张内容更新，438张无关旧基准不变。
- 发布：Windows package、artifact audit（1,294 files / 392,861,936 bytes）、production audit0漏洞与正式smoke1/1
   通过。smoke只增加四个新窄Preload API允许项，隔离/CSP/销毁检查不变。recipe38/38，Developer人工结论0/38。

Import闭环后进入Composer Collection查询/替换，下节记录该组交付；权限依赖组仍blocked。

### 5.6 Collection查询与替换

两项共享Tool现已通过真实Agent/MCP验收：query只读Core保存态，change经typed Main命令复用UI的
`replaceCollection`并发布`collection:changed`。严格递归树schema、revision、ID/三级目录校验在Tool边界执行；
Auth/Header/Query/Form/URL凭据在输出中脱敏，遮罩仅能恢复相同request/字段身份的既有值，不能转移秘密到新字段。
编辑态空URL和未完成百分号编码可保存，不把Collection存储等同于网络Send。

TDD由缺失Tool unit与真实discovery Red开始。集合同步九项与就绪两项先Red后Green：仅确认实际保存快照、
忽略旧查询/响应、串行自动保存、首次载入等待现有Boot完成。正文输入切换的`Model is disposed!`经unit和
同一真实workflow精确Red后，删除包装器提前销毁隐式Model的一行，交给Monaco自身detach/释放，不改第三方库。
URL编辑边界追加Red→Green，executor扩充至20/20；摘要24/24，15语言完成。

最终关联七条真实workflow `7/7`，12代Main/Core全部正常销毁、8888释放、WinINet/journal完整恢复。
本workflow两代为`32292/40736`、`44792/3792`，测试自产凭据往返、Ask Deny/Allow/Auto、stale拒绝、已挂载UI同步、
双列撤权及Model/origin重启零重放通过；归档TEMP下`interceptor-composer-collection-related-e2e-green`。
缺失Tool与编辑器Red分别在`interceptor-composer-collection-e2e-red`、`interceptor-composer-editor-e2e-red`。

全workspace typecheck、Desktop538/538、Tools174/174后Collection扩充20/20、MCP32/32、Runtime122/122、
Protocol25/25、Playground67/67与design interaction74/74通过；Core329/331仍仅两项既有framing债务。
完整parity为256 views / 1,776 targets / 1,746 matched / 30既有missing / 304既有flagged，平均2.24%；
Collection六视图40/40、0 missing/flagged、最大0.5px。456张设计输入归档于`interceptor-composer-collection-design-generated`，
Renderer图片归档于`interceptor-composer-collection-full-parity`；仅保留六张新图和四张目录内容更新，446张旧基准不变。Windows package、
artifact audit（1,294 files / 392,872,268 bytes）、production audit0漏洞及smoke1/1通过，公开Preload只新增
`onCollectionChanged`。registry/recipe40项、80个独立开关，Developer人工结论0/40。

随后进入Collection Export/Import，交付证据见下一节。

### 5.7 Collection导出与导入

两项严格空参数change共用typed Main命令；导出读取Core保存态并复用UI的Save/JSON写入，结果只有exported。
导入由Main `CollectionImportService`及App常驻`CollectionImportActions`/Dialog复用现有读取、解析、预览确认
和原子追加，全部node及字段row ID重新生成。等待已发出的自动保存后使用最新revision，保存前取消不写，
正式写入开始后完成原路径。结果只披露成功标记、revision与计数，路径、文件名、正文、Auth和底层错误不进Model。

executor10项缺失Tool Red→Green；真实`composer.tools.transfer`在`7834e648`实现前discovery缺失两项而Red，
不是原生Dialog或selector失败。Main文件/生命周期16/16、Renderer流程14/14、自动保存协调4/4、摘要28/28通过。
最终八条关联真实workflow8/8（3.1分钟），14个Main/Core代际全部正常销毁并恢复8888、WinINet/journal及进程树；
本workflow为`40224/19272`、`24620/11012`。Agent/MCP Ask/Auto、Deny、原生Cancel、预览Cancel、三次追加，
JSON/Form/Query/Auth/Header与URL凭据保真、全新身份、两列撤权和重启零重放均通过。证据归档TEMP下
`interceptor-composer-transfer-related-e2e-green`，Red为`interceptor-composer-transfer-e2e-red`。

全workspace typecheck通过；Tools189/192、Desktop574/576、MCP31/32和Playground66/67中的旧目录断言已修复，
对应聚焦组分别51/51、27/27、20/20、1/1 Green；Runtime122/122、Protocol25/25和design interaction76/76通过。
Core329/331仍只有两项既有framing债务。Windows package、artifact audit（1,294 files / 392,885,889 bytes）、
production audit0漏洞与packaged smoke1/1（44.4秒）通过，Preload允许项只增加四个集合导入API。
完整parity为268 views / 1,848 targets / 1,814 matched / 34 missing / 305 flagged，平均2.27%；新增12视图72目标
及原有导入/导出弹窗六视图20目标全部匹配，0 missing/flagged、最大0.5px。旧TLS passthrough明暗各多2项missing，
旧DeepSeek深色Dialog多1项flagged，均非本工作项界面，不将完整报告称为全绿。
468张完整出图归档于`interceptor-composer-transfer-design-generated`；提交保留12张新图和两张Composer discovery
数量更新，454张非目标图按SHA256保持本轮改动前基线。完整Renderer输出与报告保留于TEMP下
`interceptor-composer-transfer-full-parity`及同名`.md`。registry/recipe42项、84个独立开关，Developer人工结论0/42。
下一独立工作项为Breakpoints批量三项；其契约与23项unit Red单独保留，不纳入集合传输提交。

### 5.8 Breakpoints批量命令

三条change共享正式Core命令与AbortSignal，严格校验`queueKey`/`ruleId`，审批仅披露目标及匹配计数；
执行按命令开始时的集合处理，空目标返回0。Continue保留原始流量，Drop不触达origin，均不采用未提交草稿。
Transcript复用已有15语言“已放行/已丢弃”与实际数量，Ask/Auto公开相同`breakpointBatch`/数量属性。

executor23项缺失Tool Red→Green、Core队列基线17/17；真实discovery Red代际`26832/37224`正常销毁。
摘要另经unit与真实页面`value` Red后28/28 Green。最终本workflow1/1（35.3秒），两代Main/Core为
`42592/42636`、`25756/42356`；旧Agent断点1/1（43.4秒），两代`15836/27864`、`11372/12132`，
原UI queue、Settings授权与MCP Browser/Desktop四条4/4（1.6分钟）。六条流程共11代均正常销毁，8888、
WinINet/journal与进程树恢复，真实数据面6次HTTP与4条WebSocket文本，Model/origin重启增量0。
归档为TEMP下`interceptor-breakpoint-batch-final-e2e-green`、`interceptor-breakpoint-batch-existing-agent-green`
和`interceptor-breakpoint-batch-remaining-e2e-green`。旧Agent首轮整组撤权集中于单Turn失败并触发敏感可见
内容审计，证据在`interceptor-breakpoint-batch-related-first-run`；改为分轮后Green，不提升产品循环上限。

全workspace typecheck、Desktop579/579、Tools215/215、MCP32/32、Runtime122/122、Protocol25/25、
Playground67/67通过；Core329/331仍仅既有framing两项。完整设计交互81/81，discovery旧8项文案追加
Red→11项Green；新增12视图72/72、0 missing/flagged、最大0.5px。完整parity280 views / 1,920 targets /
1,888 matched / 32 missing / 335 flagged、平均2.28%；新增批量72目标仍全匹配，其他既有Capture/TLS、
文件弹窗和Settings视图几何波动未修复，不把完整报告标成全绿。480张出图已归档，提交保留12张新图及
两张discovery更新，466张非目标图按SHA256保持基线；完整报告与Renderer产物在TEMP下
`interceptor-breakpoint-batch-full-parity`及同名`.md`。

本机Electron缓存经SHA256校验后`npm --offline run package`成功，artifact audit为1,294 files /
392,889,491 bytes，production audit0漏洞，packaged smoke1/1（45.1秒）。registry/recipe45项、90开关，
Developer人工结论0/45。下一组Diagnostics三项已取得28项unit Red和真实discovery Red（Main/Core
`30472/44700`正常销毁），契约与测试保留在下一工作项，不纳入本次批量提交。

### 5.9 Diagnostics查询与导出

`diagnostics_get_trace`/`diagnostics_get_recent`只读当前Core内存记录，保留记录顺序与droppedCount，Trace最多200条，
Recent limit为1..200/默认200；持久历史分页仍由`diagnostics_query`负责。`diagnostics_export`经typed Main复用
UI的`startDiagnosticsExport`和原生Save Dialog，正式Transfer/JSONL原子写入未复制。只投影job身份、状态、进度、
时间和警告计数，不返回文件名、路径或可变message/warnings内容。Transcript在长ID前先显示真实任务状态，
不会把started等同于completed；Current快照只显示计数，两条新文案覆盖15语言。

executor28项缺失Tool Red与真实discovery Red（`30472/44700`正常销毁）后Green；Main导出6/6、摘要另7项unit及
真实value Red后35/35通过。暂停前原生Cancel焦点失败代`29852/29444`已正常销毁，证据独立保留于
`interceptor-diagnostics-tools-pre-pause-failure`，不是产品Red；清理设计测试服务后同workflow38.4秒Green。
最终带摘要断言1/1（36.0秒），两代`3244/23680`、`14016/25676`；旧Diagnostics、全局授权及MCP两入口4/4，
八代`28680/6380`、`42760/21408`、`13136/16336`、`42948/44204`、`43068/39472`、`39400/6800`、
`24632/1240`、`43360/8372`。五条流程十代均正常销毁、8888释放和完整WinINet/journal恢复；四个实际JSONL
文件、过滤/脱敏、Ask/Auto/Deny/Cancel、独立撤权和重启零重放通过。证据在TEMP下
`interceptor-diagnostics-summary-e2e-green`、`interceptor-diagnostics-related-e2e-green`，摘要Red单独保留。

全workspace类型、Desktop592/592、Tools243/243、MCP32/32、Runtime122/122、Protocol25/25、Playground67/67，
设计交互82/82通过；Core329/331只有既有两项framing债务。状态顺序另经聚焦Red→Green，最终标准Forge package
与artifact audit为1,294 files / 392,896,554 bytes，production audit0漏洞，最终smoke1/1（41.8秒）。构建曾被
自动安全检查拦截，手写Forge调用错误也未生成包；用户了解运行时ZIP用途并要求继续后，标准构建成功，未改Forge配置。
完整parity286 views / 1,964 targets / 1,934 matched / 30既有missing / 304既有flagged，平均2.30%；本组八视图
62/62匹配、最大0.5px，报告不称为全量Green。486张生成输入已归档，提交六张新图/两张查询更新，478张非目标
基线SHA256不变；TEMP下`interceptor-diagnostics-design-generated`和`interceptor-diagnostics-full-parity`保存输入与输出。
registry/recipe48项、96个开关，Developer人工结论0/48。下一组Capture任务Tool17项、进度组件4项Red已准备，
真实workflow尚待执行，不纳入Diagnostics提交。

### 5.10 Capture任务查询与取消

`capture_get_transfer_job`与`capture_cancel_transfer_job`复用正式任务入口，已完成安全结果、Ask/Auto、
运行中取消及文件清理、终态幂等、独立撤权与重启零重放。目标workflow `1/1`、两代销毁证据与相关Red/Green沿用
`interceptor-transfer-summary-e2e-green`；两项代码随`6a1679e2`保存，本轮完成交付补验。
MCP Browser/Desktop旧48项目录断言更新为50项并显式覆盖两项新Tool，真实回归`2/2`，三代均正常销毁，
8888、WinINet与共享journal恢复；证据在TEMP下`interceptor-transfer-delivery-mcp-20260907-130205`。
Desktop typecheck、当前Windows package、artifact audit（1,294 files / 392,903,421 bytes）与packaged smoke
`1/1`（48.7秒）通过。线上production audit本轮被执行策略拦截，核对依赖/锁文件/npm配置/补丁不变后复用
同日Diagnostics零漏洞结果，不记为重新执行。完整证据见[Transfer](transfer.md#9-验收要点)。
该阶段代码50/73、完整自动验收46/73，registry/recipe50项、100个Agent/MCP开关；Developer人工结论为0/50，
TLS最终清理及Cancel/rename提交点竞态仍各自保留，不因本组闭环而标记完成。

### 5.11 Capture Body导出

`capture_export_body`已完成Agent/MCP接入；Main在原生Save Dialog前后验证正文归属与Core代际，UI与Tool
共用文件名推导和`body.export.start`，只返回安全任务摘要，不把原始正文、文件路径或文件名发送给Model。
前置executor13项和真实discovery Red成立；最终Body owner17/17、Main11/11、摘要42/42，目标真实workflow
`1/1`（33.8秒）并完成双代销毁、WinINet/journal恢复与重启零重放。真实gzip、请求正文和独立响应的四次导出
均经长度/hash核验，原UI保存入口保持可用；MCP模式等待缺失导致的首次fixture失败已修正，不计为产品Red。

关联Capture discovery、Settings授权、MCP Browser/Desktop `4/4`，八代销毁均通过；最终全workspace typecheck、
Tools277/277、Desktop615/615、MCP32/32、Playground84/84、Runtime122/122、Protocol25/25与Core正文导出
integration6/6通过。设计交互70/70，Body/Settings十视图94/94 targets、0 missing/flagged、最大0.6px；
新增六张Body设计图、更新六张目录图，264张旧图SHA-256不变。当前Windows package、artifact audit
（1,294 files / 392,907,153 bytes）、实际production audit0漏洞与packaged smoke1/1（49.2秒）通过。
完整日志、trace、PID及失败保留位置见[Transfer验收](transfer.md#92-capture-body导出验收)。
当前代码51/73、完整自动验收47/73，registry/recipe51项、102个开关，Developer人工结论0/51；
TLS清理、已启动导出与Clear及Cancel/rename提交点债务继续保留，未以本组Green代替。

### 5.12 HAR导入与导出

- IPC、MCP和Agent共用`startHarExport`、`startHarImport`；Core完成导入后统一通知Renderer。
   - 不在Tool中读写文件，不依赖弹窗刷新，不把任务启动当作完成。
   - Clear前发起的旧查询仍作废，当前查询可显示保留历史请求时间的导入记录。
- 前置结果：executor33项Red、真实discovery Red、摘要4项Red、导入信号与历史时间过滤Red。
- 最终真实流程1/1（40.8秒），覆盖三种导出范围、显式脱敏、完整正文、原生取消、追加导入和IPC菜单操作。
   - Main/Core两代`33040/33692`、`40140/24544`正常退出，证据在TEMP下`interceptor-har-shared-entry-green-20260907`。
   - 关联五条E2E为5/5（1.8分钟），九代正常退出，证据在`interceptor-har-adjacent-rerun-20260907-182534`。
- 全workspace类型、Tools310/310、Desktop639/639、MCP32/32、Core相关35/35、设计交互72/72通过。
- HAR和Settings共16个parity视图130/130 targets、0 missing/flagged，最大0.6px。
- 当前package、artifact audit（1,294 files / 392,912,120 bytes）、production audit零漏洞、smoke1/1（44.3秒）通过。
- 当前代码53/73、完整自动验收49/73；recipe53项、106个开关，Developer人工结论仍为0/53。
   - 完整证据与已知限制见[HAR验收](transfer.md#har-tool-acceptance)。

### 5.13 Archive导入与导出

- 两项严格空参数change，共用Main原生Save/Open与Core完整快照、追加导入任务；不接受Model路径或隐藏Clear。
- 前置executor16项Red、真实discovery Red、摘要4项Red均保留；最终真实1/1（49.0秒），两代Main/Core `6960/19908`、`18620/20208`全部正常退出并恢复宿主。
   - HTTP正文与WebSocket消息往返、2→4→6→8→10追加导入、Agent/MCP Ask/Auto、取消、撤权、IPC菜单和重启零重放通过。
   - 关联四条真实流程最终Green；Settings旧106开关断言失败已修正并独立重跑，不把测试计数失败当产品Red。
- Desktop665/665、Tools326/326、MCP32/32、Archive Core integration20/20、全workspace typecheck通过。
- Archive/HAR与Settings共28视图202/202 targets、0 missing/flagged、最大0.6px；生成12张Archive和6张Settings图，未扩充设计工具测试。
- package、artifact audit（1,294 files / 392,914,820 bytes）、packaged smoke1/1（47.0秒）通过；依赖未变，复用HAR阶段production audit零漏洞结果。
- 当前代码55/73、完整自动验收51/73；recipe55项、110个开关，Developer人工结论0/55；详细前置和最终证据见[Archive验收](transfer.md#archive-tool-acceptance)。

### 5.14 语言、主题与导出隐私

- 三项严格参数change共用`UiPreferencesService`，Renderer串行领取、应用、保存后确认，不直接在Tool写Store或配置。
- executor21项缺失Tool Red、真实语言/偏好discovery Red、Privacy原入口Red、摘要3项Red、保存确认5项Red均保留。
- 最终相关真实5/5，保存确认修正后目标两条再跑2/2；原UI、Agent/MCP、HAR遮罩草稿隔离、独立撤权、重启持久化和完整宿主恢复通过。
- Desktop707/707、Tools347/347、MCP32/32、全workspace类型、parity244/244通过；package/artifact audit（1,294 files / 392,925,601 bytes）与smoke1/1通过。
- 当前代码58/73、完整自动验收54/73，Settings完整11/26；recipe58项、116个开关、人工0/58。前置测试缺口和完整证据见[偏好验收](settings.md#ui-preferences-acceptance)。

## 6. 相关未完成验收

这些事项与Tool交付相关，但不计入全量69项的Agent接线或真实Tool Call完成数，也不替代每个工作项的自动验收：

| 事项 | 当前进度 | 顺序/解除条件 |
| --- | --- | --- |
| Playground人工矩阵 | 当前recipe 58/58；Developer结论0/58 | 逐项Pass/Fail/Blocked并导出脱敏报告；新增Tool同步扩充recipe，不替代TLS最终E2E与余下11项开发 |
| Capture 39项真实Electron | Traffic Lab integration 39/39；产品E2E 2/39 | 人工Tool矩阵后按六组消费正式Playground并独立断言Capture |
| VS Code/Copilot MCP互操作 | blocked于Host协议`2025-11-25`，产品固定`2026-07-28` | 等待VS Code升级，不增加legacy兼容 |
| VS Code + Claude双Host一致性 | 待验收 | 当前协议Host可用后验证同时读取同一Capture |
| MCP Streamable HTTP进度SSE | 待真实flow | 只有出现需要中间进度的正式Tool后实现并验收 |
| DeepSeek线上兼容 | 待Developer BYOK人工验收 | 自动开发继续使用本地OpenAI-compatible lab，Key只在产品Settings输入 |

## 7. 不注册为业务 Tool 的控制面

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

## 8. 一致性规则

- Tool 名全局唯一，使用具体动词；正反操作使用两个 Tool，不用布尔值编码；
- Tool层的正反名称可以复用产品已有的Switch intent；Main/Core仍按payload分派到语义单一方法，不为Tool复制命令；
- 一个 Tool 只对应一个用户意图，Agent 与 MCP 不得各自改名或改变参数；
- `packages/interceptor-tools/` registry 是 Settings 列表、Agent discovery 与 MCP `tools/list` 的唯一数据源；
- 文档完整目录可以先于代码，产品 UI 只展示 registry 中已经实现的 Tool；
- 新增、删除或改名 Tool 时，同一改动必须更新本文、registry、Settings、Agent/MCP 测试和对应 E2E Inventory；
- 全部业务Tool必须逐项拥有共享executor测试，并在所属能力workflow中至少执行一次真实Agent或MCP Tool Call；
   不把全部Tool塞入单个巨型workflow，按Capture、Rules、Composer、Breakpoints与Diagnostics feature定位失败；
- Tool 的结果不得比正式产品入口拥有更多权限；文件路径、凭据与私钥继续遵守原有进程边界。

## 9. 历史阶段证据

以下记录从Handover已交付主线条目完整归档，计数与PID描述各阶段当时的验收结果，不覆盖第4节当前矩阵。
前一命名重构的部分设计图未进入提交，本轮Diagnostics阶段已补齐新名称基线；不能以当时截图文件推断当前名称。

### 9.1 Feature命名重构

Tool协议已一次性改为`<feature>_<verb>[_<object>]`，Capability与Settings严格按Capture、Rules、Composer、Breakpoints、Diagnostics五个feature分组；完整目标目录为73项，73个名称唯一且零错组，GitHub Auth四个候选已删除。旧名称无alias，旧Settings名称只丢弃不迁移。父提交`97120203`运行同一Settings workflow精确Red于完整旧24项名称；当前Settings三代workflow、Agent Capture/Rules/Composer/Breakpoints四条、MCP Desktop/Browser两条共`7/7` Green。Tools`62/62`、Desktop`457/457`、Runtime`122/122`、Core Protocol`25/25`、MCP`32/32`、Playground`67/67`、design interaction`70/70`与全workspace typecheck Green；Capture/Composer改名后的明暗四个Agent场景合计`38/38 matched / 0 missing / 0 flagged / 0px`，五个Settings feature组明暗`38/38 matched / 0 missing / 0 flagged / 最大0.6px`。稳定独占完整Parity为`208 views / 1,456 targets / 1,422 matched / 34既有missing / 305既有flagged`；Windows package、artifact audit（`1,294 files / 392,824,445 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green。

### 9.2 Composer

Composer最终Tools`62/62`、Desktop`456/456`、Proxy Composer owner`9/9`（integration `8/8` + unit `1/1`）、design interaction`70/70`及全workspace typecheck Green；修复前`ffaf323f`真实Electron精确Red于composer discovery为空，当前`agent.tools.composer` `1/1` Green。Ask Deny/Allow、真实HTTP request/response与脱敏、Capture隔离、TLS成功/失败、Stop关闭socket、撤权和双代零重放均通过；两代Main/Core为`11120/16796`、`29936/34788`且`gracefulDestroyVerified=true`。明暗新增parity合计`20/20 matched / 0 missing / 0 flagged / 0px`，既有46张Agent设计图逐像素不变；完整Parity为`208 views / 1,446 targets / 1,412 matched / 34既有missing / 305既有flagged`。final screenshot经可见状态审计后attach，Composer/Breakpoints/MCP敏感证据workflow联合`3/3` Green；Windows package、artifact audit（`1,294 files / 392,823,830 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green；Proxy Core全量只保留已登记两项chunked framing债务失败。

### 9.3 Breakpoints

Breakpoints最终Tools`54/54`、Runtime`122/122`、MCP`32/32`、Desktop`454/454`、Core focused`11/11`、design interaction`69/69`及全workspace typecheck Green；Agent/MCP真实Electron联合`2/2`，修复前`32f2889a`分别精确Red于Agent discovery为空与MCP stale错误进入审批。Agent两代Main/Core为`31388/16116`、`29116/20280`，重启Model/HTTP/WebSocket消息增量0；MCP敏感证据强化后两代为`10760/20752`、`36460/9580`，Client断开与credential轮换不解队；四代均`gracefulDestroyVerified=true`。明暗新增parity合计`22/22 matched / 0 missing / 0 flagged / 0px`，既有44张Agent设计图逐像素不变；完整Parity为`206 views / 1,426 targets / 1,396 matched / 30既有missing / 304既有flagged`。Windows package、artifact audit（`1,294 files / 392,817,170 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green；全仓unit只保留已登记的两项chunked framing债务失败。

### 9.4 Rules

Rules milestone最终Tools`43/43`、Runtime`121/121`、MCP`30/30`、Desktop`450/450`、Proxy Rules Green`95/95`、design interaction`68/68`及全workspace typecheck Green；Agent Rules、MCP Rules与Rules Import真实Electron联合`3/3`，共用Dialog回归`2/2`；Windows package、artifact audit（`1,294 files / 392,808,773 bytes`）、production audit 0漏洞与packaged smoke`1/1`（44.6秒）Green。Proxy Core完整Rules集仍只有已登记的两项chunked framing债务失败。完整Parity沿用`204 views / 1,404 targets / 1,370 matched / 34既有missing / 304既有flagged`，Rules新增4 views为`30/30`、0 missing、0 flagged、0px。
