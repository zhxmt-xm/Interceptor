# Feature: Agent / MCP Tool 能力目录

> 最后更新：2026-09-05
> 代码所有者：`packages/interceptor-tools/`
> 使用方：内置 `AgentRuntime`、外部 MCP Server
> 当前状态：完整目标共73项，目前实现并自动验收32/73，剩余41项待实现；首批24项共享registry、MCP adapter、
> Desktop Agent接线、owning executor正向unit与真实Agent/MCP调用均为24/24。Settings中的Tool授权开关已完成，
> Settings只读六项与系统代理启用/恢复两项已完成真实验收，Settings业务Tool当前为8/26。Playground
> recipe为32/32、Developer人工结论为0/32；Capture Lab integration覆盖39/39，真实Electron覆盖2/39。

当前目录共73个目标Tool，名称全部唯一。该数字描述完整产品目标，不代表已有73个实现；每行“当前进度”
才是实现事实。新增、删除或拆分Tool时必须同步更新数量并重新检查重名。

| Feature | 目标 | 已实现并自动验收 | 待实现 |
| --- | ---: | ---: | ---: |
| Capture | 17 | 10 | 7 |
| Rules | 5 | 3 | 2 |
| Composer | 6 | 2 | 4 |
| Breakpoints | 11 | 8 | 3 |
| Diagnostics | 4 | 1 | 3 |
| Settings | 26 | 8 | 18 |
| Updates | 4 | 0 | 4 |
| 合计 | 73 | 32 | 41 |

## 1. 唯一目录

本文件是 Agent 与 MCP 可调用产品能力的唯一完整清单。实现时，每个 Tool descriptor 只在
`packages/interceptor-tools/` 定义一次；内置 Agent 与 MCP 复用同一名称、schema、执行函数和结果类型，
不复制两套 Tool。

目录只收录真实产品用户意图：查询、修改配置、控制代理、处理断点、发送请求和文件操作。
Agent 自身 Session/Provider 控制、MCP 接入控制、窗口导航、事件订阅和 Main/Core 内部编排不注册为 Tool，
见第 5 节。

### 1.1 Feature命名契约

Tool名称固定使用`<feature>_<verb>[_<object>]`，前缀等于拥有该业务能力的feature/capability，而不是当前UI页面。
当前已实现目录使用`capture`、`rules`、`composer`、`breakpoints`、`diagnostics`与`settings`六个前缀；后续产品能力使用
`updates`等同样的所有权前缀。前缀已经表达对象时不重复，例如使用`breakpoints_continue`而不是
`breakpoints_continue_breakpoint`，使用`rules_get_tree`而不是`rules_get_rules`。

本轮把已有24项一次性切换到feature命名，同时把Capability ID的`traffic`改为`capture`、`requests`改为
`composer`。不保留旧Tool alias、旧Capability ID、Settings迁移或双写；持久设置中的未知旧名称按既有边界丢弃，
历史Transcript仍只读展示其原始调用。Agent discovery、MCP `tools/list`、Settings、Playground与所有自动化验收
只使用新名称。

GitHub公开后不再需要GitHub身份Tool，因此完整目标目录删除`get_github_auth_status`、`start_github_sign_in`、
`open_github_authorization`与`sign_out_github`四个候选。产品已有GitHub Auth代码不属于本次Tool目录重构；更新能力
归`updates_*`，不再以GitHub身份建模。

状态含义：

- **共享 registry + MCP adapter + Agent**：Tool已由`@interceptor/tools`唯一实现，并接入MCP adapter与Desktop Agent；
- **共享 registry + MCP adapter**：Tool已由`@interceptor/tools`唯一实现并由Desktop MCP adapter对外提供；尚未接入内置Agent；
- **产品已具备**：产品已有正式入口，Tool descriptor 与 Agent/MCP 接线待实现；
- **先补 intent**：产品 UI 已有能力，但缺少可供 Tool 复用的语义单一入口；
- **待产品实现**：产品本身尚无该能力，不先为 Tool 新建后门。

## 2. Settings 开关与执行模式

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

- fresh profile或两组关闭项都为空时不保留文件，32项自然全部开启；
- 读取时拒绝非法schema、重复名称和额外字段；合法数组中的未知/旧名称从内存快照丢弃，不改写文件、不映射到
   新名称；写入只保留当前registry名称并按registry顺序规范化；
- `getToolCapabilitySettings`返回六组目录和两组关闭名称的完整快照；
- `disableAgentTool`、`enableAgentTool`、`disableMcpTool`、`enableMcpTool`是四条语义单一intent；
- mutation在Main串行执行、原子替换文件并返回最新完整快照；未知Tool名称在写入前拒绝；
- Renderer搜索词只属于当前Settings视图内存，不持久化，也不改变开关状态；
- Agent当前通过动态`AgentToolSource`接入十个Capture Tool、三个Rules Tool、两个Composer Tool、
   八个Breakpoints Tool、一个Diagnostics Tool与八个Settings Tool；关闭项同时过滤Capability
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
| `capture_export_body` | change | `startBodyExport` / 原生 Save Dialog | 产品已具备 |
| `capture_export_har` | change | `startHarExport` / 原生 Save Dialog | 产品已具备 |
| `capture_import_har` | change | `startHarImport` / 原生 Open Dialog | 产品已具备 |
| `capture_export_archive` | change | `startArchiveExport` / 原生 Save Dialog | 产品已具备 |
| `capture_import_archive` | change | `startArchiveImport` / 原生 Open Dialog | 产品已具备 |
| `capture_get_transfer_job` | query | `getTransferJob` | 产品已具备 |
| `capture_cancel_transfer_job` | change | `cancelTransferJob` | 产品已具备 |

### 3.2 Rules

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `rules_get_tree` | query | `getRules` / `rules.get` | 共享 registry + MCP adapter + Agent；Map Local路径脱敏 |
| `rules_get_hits` | query | `getRuleHits` / `rules.hits` | 共享 registry + MCP adapter + Agent |
| `rules_replace_tree` | change | `replaceRules` / `rules.replace` | 共享 registry + MCP adapter + Agent；严格递归schema，Map Local仅随未变Rule保留 |
| `rules_import` | change | 当前由Renderer串联`readImportFile`、解析确认与`replaceRules` | 先补 intent |
| `rules_export` | change | `exportRules` / 原生 Save Dialog | 产品已具备 |

### 3.3 Composer

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `composer_get_collection` | query | `getCollection` / `collection.get` | 产品已具备 |
| `composer_replace_collection` | change | `replaceCollection` / `collection.replace` | 产品已具备 |
| `composer_import_collection` | change | 当前由Renderer串联`readImportFile`、解析确认与`replaceCollection` | 先补 intent |
| `composer_export_collection` | change | `exportCollection` / 原生 Save Dialog | 产品已具备 |
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
| `breakpoints_continue_queue` | change | `continueBreakpointQueue` | 产品已具备 |
| `breakpoints_drop_queue` | change | `dropBreakpointQueue` | 产品已具备 |
| `breakpoints_continue_rule` | change | `continueBreakpointRule` | 产品已具备 |

本阶段只接入前八项Breakpoints Tool。`breakpoints_list`是唯一query；其余七项是change并服从Agent Session或
MCP Client的`ask`/`auto`。pending identity只在当前Core代际内由`breakpointId`标识，没有revision；审批前读取
当前pending生成动态影响，执行仍以Core `breakpoint.resolve`对已消失ID返回的`conflict`为最终并发保护。

`breakpoints_forward_edited`按pending phase收窄：request接受`method`、`url`与文本`body`，response接受
`statusCode`与文本`body`，WebSocket只接受文本`body`；跨phase字段在审批和执行前拒绝。至少一项编辑必须存在；
不开放headers、`bodyFilePath`、`closeCode`或任意本地路径。文件编辑仍只经产品原生Dialog，Map Local占位不适用于Breakpoint。
Agent与MCP E2E必须先用Rules/WebSocket正式UI和真实客户端产生pending，再从公共DOM或Tool query取得动态ID；
禁止直接seed Core queue。

### 3.5 Diagnostics

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `diagnostics_get_trace` | query | `getCoreTrace` | 产品已具备 |
| `diagnostics_get_recent` | query | `getRecentDiagnostics` | 产品已具备 |
| `diagnostics_query` | query | `queryDiagnostics` / `diagnostics.query` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `diagnostics_export` | change | `startDiagnosticsExport` / 原生 Save Dialog | 产品已具备 |

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
| `settings_replace_tls_insecure_hosts` | change | `setInsecureHosts` / `tls.replaceInsecureHosts` | 产品已具备 |
| `settings_enable_https_decryption` | change | `setHttpsDecryption(true)` | 产品已具备 |
| `settings_disable_https_decryption` | change | `setHttpsDecryption(false)` | 产品已具备 |
| `settings_get_tls_passthrough` | query | `getTlsPassthroughSettings` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `settings_replace_tls_passthrough` | change | `replaceTlsPassthroughSettings` | 产品已具备 |
| `settings_list_app_containers` | query | `listAppContainers` | 共享 registry + MCP adapter + Agent；Windows真实枚举且不改豁免 |
| `settings_enable_app_container` | change | `setAppContainerLoopbackExemption(sid, true)` / UAC | 产品已具备 |
| `settings_disable_app_container` | change | `setAppContainerLoopbackExemption(sid, false)` / UAC | 产品已具备 |
| `settings_enable_all_app_containers` | change | `enableAllAppContainers` / UAC | 产品已具备 |
| `settings_disable_all_app_containers` | change | `disableAllAppContainers` / UAC | 产品已具备 |
| `settings_set_language` | change | 当前仅 Renderer 状态 | 先补 intent |
| `settings_set_theme` | change | 当前仅 Renderer 状态 | 先补 intent |
| `settings_set_export_privacy_defaults` | change | 当前仅 Renderer 状态 | 先补 intent |

### 3.7 Updates

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `updates_get_status` | query | `getUpdateStatus` | 产品已具备 |
| `updates_check` | change | `checkForUpdates` | 产品已具备 |
| `updates_download` | change | `downloadUpdate` | 产品已具备 |
| `updates_open_downloaded` | change | `openDownloadedUpdate` | 产品已具备 |

## 4. 当前32项交付矩阵

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
| `rules_get_tree` | 已完成 | 已完成 | Agent + MCP已完成 |
| `rules_get_hits` | 已完成 | 已完成 | Agent已完成 |
| `rules_replace_tree` | 已完成 | 已完成 | Agent + MCP已完成 |
| `composer_send_request` | 已完成 | 已完成 | Agent已完成 |
| `composer_probe_connection` | 已完成 | 已完成 | Agent已完成 |
| `breakpoints_list` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_enable_http` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_disable_http` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_enable_websocket` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_disable_websocket` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_continue` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_forward_edited` | 已完成 | 已完成 | Agent + MCP已完成 |
| `breakpoints_drop` | 已完成 | 已完成 | Agent + MCP已完成 |
| `diagnostics_query` | 已完成 | 已完成 | Agent已完成 |
| `settings_get_core_process_status` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_system_proxy_status` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_certificate_status` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_tls_insecure_hosts` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_get_tls_passthrough` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_list_app_containers` | 已完成 | 已完成 | Agent + MCP已完成 |
| `settings_enable_system_proxy` | 已完成 | 已完成 | Agent已完成 |
| `settings_restore_system_proxy` | 已完成 | 已完成 | Agent已完成 |

## 5. 实施顺序与阶段门禁

Tool不按“只读产品版”和“完整产品版”切成两套。完整交付目标是73项，首批24项完成只代表一个阶段完成。
2026-09-05用户恢复执行全部计划；Settings只读六项与系统代理两项已完成，当前32/73，继续按工作项逐组交付。

### 5.1 首批24项与独立验收

以下保留首批已完成阶段和独立验收欠账；人工矩阵不是余下49项开发的前置条件，也不代表全量Tool已交付。

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
   目前有32项recipe、0项Developer结论，不把尚未实现的41项计入已验收范围。
9. **[待实现] Capture 39项收敛**：在Tool主线与人工矩阵之后，真实Electron按HTTP、Bodies、Encoding、
   WebSocket、gRPC、TLS六组单向启动并操作正式Playground；复用场景目录、Draft和流量发生器，Capture断言独立，
   从当前2/39收敛到39/39，不建立一个巨型workflow。

每个Tool能力组都必须先更新owning feature与E2E契约，再取得unit/integration Red和真实E2E Red，随后实现并复跑
同组Green；Tool自身的真实E2E是该组完成条件，不能推迟到后续人工矩阵或Capture 39项收敛。没有正式产品入口的Tool先补产品intent，再复用
该入口，不在Tool层实现第二套业务逻辑。VS Code MCP协议升级、双Host一致性、MCP进度SSE和DeepSeek线上兼容
分别保留为外部阻塞或人工验收项。Settings只读与系统代理组已完成，下一个开发工作项是TLS配置与解密开关。

### 5.2 余下49项计划（已完成8项，剩余41项）

按feature逐组交付，每个工作项完成契约、测试、实现、证据和状态同步后再进入下一项；不一次性铺设49项空壳。
同一feature内可按正式用户流程拆分多个工作项，不改变第3节的feature所有权和Tool名称。

| 顺序 | Feature | 剩余数量 | 交付范围与顺序 |
| --- | --- | ---: | --- |
| 1 | Settings | 18 | 只读查询6项与系统代理启用/恢复2项已完成；TLS配置与解密开关4项 → 证书生成/信任/查看7项 → AppContainer豁免4项 → 语言/主题/导出隐私默认值3项；最后3项先补正式产品intent |
| 2 | Rules | 2 | Export后Import；先收敛Import正式intent，真实导入输入必须由同一workflow经UI导出产生 |
| 3 | Composer | 4 | Collection查询/替换2项，再Export/Import 2项；Import先补正式intent，不复制Renderer解析编排 |
| 4 | Breakpoints | 3 | Continue queue、Drop queue、Continue rule；以真实HTTP/WebSocket pending验证作用范围、Ask/Auto和并发失效 |
| 5 | Diagnostics | 3 | Trace与Recent查询2项，再脱敏Export；保持查询静默与日志权限边界 |
| 6 | Capture | 7 | Transfer任务查询/取消2项、Body导出1项、HAR与Archive各自Export/Import共4项；复用正式任务与原生Dialog流程 |
| 7 | Updates | 4 | 状态、检查、下载、打开；保持下载校验和原生安装器边界，不重新引入GitHub Auth Tool |

需要原生Dialog或UAC的工作项仍须真实键鼠交互；若环境或权限确实阻塞，记录具体人工操作和恢复命令，不能
伪造返回值、跳过验收或标记完成。跨平台专属步骤分别记录平台证据，不把Windows结果当成macOS已验收。

### 5.3 恢复执行入口

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

下一工作项为TLS名单替换与解密启停四项：复用Core host校验、revision和Main持久解密意图，先落契约与Red。
不为Tool生成或信任CA，未信任CA时的解密有效状态沿用产品语义；证书与UAC能力仍归下一独立工作项。

## 6. 相关未完成验收

这些事项与Tool交付相关，但不计入全量73项的Agent接线或真实Tool Call完成数，也不替代每个工作项的自动验收：

| 事项 | 当前进度 | 顺序/解除条件 |
| --- | --- | --- |
| Playground人工矩阵 | 当前recipe 32/32；Developer结论0/32 | 逐项Pass/Fail/Blocked并导出脱敏报告；新增Tool同步扩充recipe，不阻塞余下41项开发 |
| Capture 39项真实Electron | Traffic Lab integration 39/39；产品E2E 2/39 | 人工Tool矩阵后按六组消费正式Playground并独立断言Capture |
| VS Code/Copilot MCP互操作 | blocked于Host协议`2025-11-25`，产品固定`2026-07-28` | 等待VS Code升级，不增加legacy兼容 |
| VS Code + Claude双Host一致性 | 待验收 | 当前协议Host可用后验证同时读取同一Capture |
| MCP Streamable HTTP进度SSE | 待真实flow | 只有出现需要中间进度的正式Tool后实现并验收 |
| DeepSeek线上兼容 | 待Developer BYOK人工验收 | 自动开发继续使用本地OpenAI-compatible lab，Key只在产品Settings输入 |

## 7. 不注册为业务 Tool 的控制面

以下入口仍保留在产品中，但不属于 Agent/MCP 业务能力目录：

| 类别 | 入口 | 原因 |
| --- | --- | --- |
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

Tool协议已一次性改为`<feature>_<verb>[_<object>]`，Capability与Settings严格按Capture、Rules、Composer、Breakpoints、Diagnostics五个feature分组；完整目标目录为73项，73个名称唯一且零错组，GitHub Auth四个候选已删除，Updates归`updates_*`。旧名称无alias，旧Settings名称只丢弃不迁移。父提交`97120203`运行同一Settings workflow精确Red于完整旧24项名称；当前Settings三代workflow、Agent Capture/Rules/Composer/Breakpoints四条、MCP Desktop/Browser两条共`7/7` Green。Tools`62/62`、Desktop`457/457`、Runtime`122/122`、Core Protocol`25/25`、MCP`32/32`、Playground`67/67`、design interaction`70/70`与全workspace typecheck Green；Capture/Composer改名后的明暗四个Agent场景合计`38/38 matched / 0 missing / 0 flagged / 0px`，五个Settings feature组明暗`38/38 matched / 0 missing / 0 flagged / 最大0.6px`。稳定独占完整Parity为`208 views / 1,456 targets / 1,422 matched / 34既有missing / 305既有flagged`；Windows package、artifact audit（`1,294 files / 392,824,445 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green。

### 9.2 Composer

Composer最终Tools`62/62`、Desktop`456/456`、Proxy Composer owner`9/9`（integration `8/8` + unit `1/1`）、design interaction`70/70`及全workspace typecheck Green；修复前`ffaf323f`真实Electron精确Red于composer discovery为空，当前`agent.tools.composer` `1/1` Green。Ask Deny/Allow、真实HTTP request/response与脱敏、Capture隔离、TLS成功/失败、Stop关闭socket、撤权和双代零重放均通过；两代Main/Core为`11120/16796`、`29936/34788`且`gracefulDestroyVerified=true`。明暗新增parity合计`20/20 matched / 0 missing / 0 flagged / 0px`，既有46张Agent设计图逐像素不变；完整Parity为`208 views / 1,446 targets / 1,412 matched / 34既有missing / 305既有flagged`。final screenshot经可见状态审计后attach，Composer/Breakpoints/MCP敏感证据workflow联合`3/3` Green；Windows package、artifact audit（`1,294 files / 392,823,830 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green；Proxy Core全量只保留已登记两项chunked framing债务失败。

### 9.3 Breakpoints

Breakpoints最终Tools`54/54`、Runtime`122/122`、MCP`32/32`、Desktop`454/454`、Core focused`11/11`、design interaction`69/69`及全workspace typecheck Green；Agent/MCP真实Electron联合`2/2`，修复前`32f2889a`分别精确Red于Agent discovery为空与MCP stale错误进入审批。Agent两代Main/Core为`31388/16116`、`29116/20280`，重启Model/HTTP/WebSocket消息增量0；MCP敏感证据强化后两代为`10760/20752`、`36460/9580`，Client断开与credential轮换不解队；四代均`gracefulDestroyVerified=true`。明暗新增parity合计`22/22 matched / 0 missing / 0 flagged / 0px`，既有44张Agent设计图逐像素不变；完整Parity为`206 views / 1,426 targets / 1,396 matched / 30既有missing / 304既有flagged`。Windows package、artifact audit（`1,294 files / 392,817,170 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green；全仓unit只保留已登记的两项chunked framing债务失败。

### 9.4 Rules

Rules milestone最终Tools`43/43`、Runtime`121/121`、MCP`30/30`、Desktop`450/450`、Proxy Rules Green`95/95`、design interaction`68/68`及全workspace typecheck Green；Agent Rules、MCP Rules与Rules Import真实Electron联合`3/3`，共用Dialog回归`2/2`；Windows package、artifact audit（`1,294 files / 392,808,773 bytes`）、production audit 0漏洞与packaged smoke`1/1`（44.6秒）Green。Proxy Core完整Rules集仍只有已登记的两项chunked framing债务失败。完整Parity沿用`204 views / 1,404 targets / 1,370 matched / 34既有missing / 304既有flagged`，Rules新增4 views为`30/30`、0 missing、0 flagged、0px。
