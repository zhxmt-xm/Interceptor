# Feature: Agent / MCP Tool 能力目录

> 最后更新：2026-09-04
> 代码所有者：`packages/interceptor-tools/`
> 使用方：内置 `AgentRuntime`、外部 MCP Server
> 当前状态：完整目标目录、首批24项共享registry与MCP adapter、Settings开关持久化已完成；Desktop Agent
> 代码已接入21/24，已验收真实Agent或MCP Tool Call覆盖21/24，owning package正向executor unit覆盖19/24；Playground
> recipe为24/24、Developer人工结论为0/24；Capture Lab integration覆盖39/39，真实Electron覆盖2/39。

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

- **共享 registry + MCP adapter + Agent**：Tool已由`@interceptor/tools`唯一实现，并接入MCP adapter与Desktop Agent；
- **共享 registry + MCP adapter**：Tool已由`@interceptor/tools`唯一实现并由Desktop MCP adapter对外提供；尚未接入内置Agent；
- **产品已具备**：产品已有正式入口，Tool descriptor 与 Agent/MCP 接线待实现；
- **先补 intent**：产品 UI 已有能力，但缺少可供 Tool 复用的语义单一入口；
- **待产品实现**：产品本身尚无该能力，不先为 Tool 新建后门。

## 2. Settings 开关与执行模式

`Settings > Agent > Tool capabilities` 从**已实现的共享 Tool registry**渲染，不维护第二份手写清单。
尚未实现的目标 Tool 只保留在本文档，不在产品 UI 中显示不可用开关。

设计稿已落地首批24项共享registry fixture、四个domain、搜索、Agent/MCP双Switch、会话级`Ask/Auto`与
Transcript内联问询卡；明暗基线见`design-vite/shots/*/agent-models/`。这是产品实现基线，不表示这些
Tool已全部接入Desktop。

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
它从同一可执行registry投影Settings专用的四组只读目录：`Traffic`、`Rules`、`Breakpoints`、
`Requests & diagnostics`；最后一组只合并展示`requests`与`diagnostics`两个Capability，不改变Model discovery的
五个Capability边界。Renderer和Design不得再维护第二份Tool名称、类型或说明清单。

落盘位置为`<userData>/tool-capabilities/settings.json`，只保存关闭项：

```ts
interface ToolCapabilitySettingsRecord {
   agentDisabledToolNames: string[];
   mcpDisabledToolNames: string[];
}
```

- fresh profile或两组关闭项都为空时不保留文件，24项自然全部开启；
- 读取时拒绝非法schema、未知名称、重复名称和额外字段；写入按registry顺序规范化；
- `getToolCapabilitySettings`返回四组目录和两组关闭名称的完整快照；
- `disableAgentTool`、`enableAgentTool`、`disableMcpTool`、`enableMcpTool`是四条语义单一intent；
- mutation在Main串行执行、原子替换文件并返回最新完整快照；未知Tool名称在写入前拒绝；
- Renderer搜索词只属于当前Settings视图内存，不持久化，也不改变开关状态；
- Agent当前通过动态`AgentToolSource`接入七个Traffic query Tool、三个Traffic change Tool、三个Rules Tool与
   八个Breakpoints Tool；关闭项同时过滤Capability
   Index、discovery、schema与执行入口。MCP Desktop已接入同一registry。

## 3. 完整 Tool 清单

### 3.1 Runtime、代理、Capture 与 Traffic

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `get_core_process_status` | query | `getCoreProcessStatus` | 产品已具备 |
| `get_system_proxy_status` | query | `getSystemProxyStatus` | 产品已具备 |
| `enable_system_proxy` | change | `enableSystemProxy` | 产品已具备 |
| `restore_system_proxy` | change | `restoreSystemProxy` | 产品已具备 |
| `get_proxy_status` | query | `getCaptureStatus` / `proxy.status` | 共享 registry + MCP adapter + Agent |
| `get_storage_status` | query | `getCaptureUsage` / `capture.status` | 共享 registry + MCP adapter + Agent |
| `start_recording` | change | `startCapture` | 共享 registry + MCP adapter + Agent；ask/auto纵向流程完成 |
| `stop_recording` | change | `stopCapture` | 共享 registry + MCP adapter + Agent；ask/auto纵向流程完成 |
| `clear_capture` | change | `clearCapture` / `capture.cleanup(scope: 'all')` | 共享 registry + MCP adapter + Agent；旧session scope已删除，ask/auto纵向流程完成 |
| `list_exchanges` | query | `querySessions` / `sessions.query` | 共享 registry + MCP adapter + Agent |
| `get_exchange` | query | `getExchangeDetail` / `sessions.detail` | 共享 registry + MCP adapter + Agent |
| `get_exchange_body` | query | `getExchangeDetail` + `readBody` / `sessions.detail` + `body.read-range` | 共享 registry + MCP adapter + Agent；用`exchangeId + bodyId`回查可信MIME/encoding，真实E2E完成 |
| `list_websocket_messages` | query | `queryWebSocketFrames` / `websocket.frames` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `list_grpc_messages` | query | `queryGrpcMessages` / `grpc.messages` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `export_body` | change | `startBodyExport` / 原生 Save Dialog | 产品已具备 |

### 3.2 Rules 与 Composer

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `get_rules` | query | `getRules` / `rules.get` | 共享 registry + MCP adapter + Agent；Map Local路径脱敏 |
| `get_rule_hits` | query | `getRuleHits` / `rules.hits` | 共享 registry + MCP adapter + Agent |
| `apply_rules` | change | `replaceRules` / `rules.replace` | 共享 registry + MCP adapter + Agent；严格递归schema，Map Local仅随未变Rule保留 |
| `import_rules` | change | 当前由Renderer串联`readImportFile`、解析确认与`replaceRules` | 先补 intent |
| `export_rules` | change | `exportRules` / 原生 Save Dialog | 产品已具备 |
| `get_collection` | query | `getCollection` / `collection.get` | 产品已具备 |
| `replace_collection` | change | `replaceCollection` / `collection.replace` | 产品已具备 |
| `import_collection` | change | 当前由Renderer串联`readImportFile`、解析确认与`replaceCollection` | 先补 intent |
| `export_collection` | change | `exportCollection` / 原生 Save Dialog | 产品已具备 |
| `send_request` | change | `sendComposerRequest` / `composer.send` | 共享 registry + MCP adapter |

### 3.3 Breakpoints 与连接探测

| Tool | 类型 | 复用的产品入口 | 当前进度 |
| --- | --- | --- | --- |
| `list_breakpoints` | query | `listBreakpoints` / `breakpoint.list` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `enable_http_breakpoints` | change | `setBreakpointsEnabled(true)` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `disable_http_breakpoints` | change | `setBreakpointsEnabled(false)` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `enable_websocket_breakpoint` | change | `enableWebSocketBreakpoints` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `disable_websocket_breakpoint` | change | `disableWebSocketBreakpoints` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `continue_breakpoint` | change | `resolveBreakpoint(..., 'continue')` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `forward_edited_breakpoint` | change | `resolveBreakpoint(..., 'continue', edit)` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `drop_breakpoint` | change | `resolveBreakpoint(..., 'drop')` | 共享 registry + MCP adapter + Agent；真实E2E完成 |
| `continue_breakpoint_queue` | change | `continueBreakpointQueue` | 产品已具备 |
| `drop_breakpoint_queue` | change | `dropBreakpointQueue` | 产品已具备 |
| `continue_rule_breakpoints` | change | `continueBreakpointRule` | 产品已具备 |
| `probe_connection` | change | `probeTls` / `tls.probe` | 共享 registry + MCP adapter |

本阶段只接入前八项Breakpoints Tool。`list_breakpoints`是唯一query；其余七项是change并服从Agent Session或
MCP Client的`ask`/`auto`。pending identity只在当前Core代际内由`breakpointId`标识，没有revision；审批前读取
当前pending生成动态影响，执行仍以Core `breakpoint.resolve`对已消失ID返回的`conflict`为最终并发保护。

`forward_edited_breakpoint`按pending phase收窄：request接受`method`、`url`与文本`body`，response接受
`statusCode`与文本`body`，WebSocket只接受文本`body`；跨phase字段在审批和执行前拒绝。至少一项编辑必须存在；
不开放headers、`bodyFilePath`、`closeCode`或任意本地路径。文件编辑仍只经产品原生Dialog，Map Local占位不适用于Breakpoint。
Agent与MCP E2E必须先用Rules/WebSocket正式UI和真实客户端产生pending，再从公共DOM或Tool query取得动态ID；
禁止直接seed Core queue。

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
| `query_diagnostics` | query | `queryDiagnostics` / `diagnostics.query` | 共享 registry + MCP adapter |
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

## 4. 首批24项交付矩阵

这里的“正向executor unit”只计算`packages/interceptor-tools` owning test真实执行该Tool的成功路径；MCP或Agent
adapter测试不能代替owner测试。“真实调用”必须经过真实Electron中的Agent或MCP入口、共享executor与Core，
`tools/list`枚举或Playground recipe不算执行覆盖。

| Tool | Agent接入 | 正向executor unit | 真实Agent/MCP调用 |
| --- | --- | --- | --- |
| `get_proxy_status` | 已完成 | 待补 | Agent + MCP已完成 |
| `get_storage_status` | 已完成 | 待补 | Agent已完成 |
| `start_recording` | 已完成 | 已完成 | Agent已完成 |
| `stop_recording` | 已完成 | 已完成 | Agent + MCP已完成 |
| `clear_capture` | 已完成 | 已完成 | Agent已完成 |
| `list_exchanges` | 已完成 | 待补 | Agent已完成 |
| `get_exchange` | 已完成 | 已完成 | Agent已完成 |
| `get_exchange_body` | 已完成 | 已完成 | Agent已完成 |
| `list_websocket_messages` | 已完成 | 已完成 | Agent已完成 |
| `list_grpc_messages` | 已完成 | 已完成 | Agent已完成 |
| `get_rules` | 已完成 | 已完成 | Agent + MCP已完成 |
| `get_rule_hits` | 已完成 | 已完成 | Agent已完成 |
| `apply_rules` | 已完成 | 已完成 | Agent + MCP已完成 |
| `list_breakpoints` | 已完成 | 已完成 | Agent + MCP已完成 |
| `enable_http_breakpoints` | 已完成 | 已完成 | Agent + MCP已完成 |
| `disable_http_breakpoints` | 已完成 | 已完成 | Agent + MCP已完成 |
| `enable_websocket_breakpoint` | 已完成 | 已完成 | Agent + MCP已完成 |
| `disable_websocket_breakpoint` | 已完成 | 已完成 | Agent + MCP已完成 |
| `continue_breakpoint` | 已完成 | 已完成 | Agent + MCP已完成 |
| `forward_edited_breakpoint` | 已完成 | 已完成 | Agent + MCP已完成 |
| `drop_breakpoint` | 已完成 | 已完成 | Agent + MCP已完成 |
| `send_request` | 待接入 | 已完成 | 待完成 |
| `probe_connection` | 待接入 | 待补 | 待完成 |
| `query_diagnostics` | 待接入 | 待补 | 待完成 |

## 5. 实施顺序与阶段门禁

Tool 不按“只读产品版”和“完整产品版”切成两套。当前主线先完成既定Tool能力，再进行Playground人工验收和
Capture 39项真实Electron收敛：

1. **[已完成] 基础层**：设计能力列表与`ask`问询；建立24项共享registry、MCP adapter、Settings持久化、
   Agent渐进discovery；接入四个Traffic query和`stop_recording`，完成首个query/change真实纵向流程。
2. **[已完成] 正文/消息**：`get_exchange_body`、`list_websocket_messages`、`list_grpc_messages`已接入Agent，
   owning executor unit、结构化Transcript摘要、15语言与明暗Parity完成。真实workflow覆盖正文range、WebSocket
   全部/单方向和gRPC request/response；重启请求增量0，关闭三项后均返回`unknown_tool`。E2E曾暴露Electron
   UtilityProcess中的Mockttp对不安全源站追加OpenSSL专用`@SECLEVEL=0`并报`INVALID_COMMAND`；Developer批准后，
   第三方patch只在Electron省略该命令，Node行为保持。补丁Unit 2/2、H2 integration 6/6、真实E2E 1/1、
   Windows package/artifact audit/smoke均Green。
3. **[已完成] Traffic控制补尾**：`start_recording`、`clear_capture`已接入Agent；两项均完成Ask Deny/Allow与Auto。
   `clear_capture`审批前动态读取usage；产品按钮、Agent和MCP成功清理后统一发布带`clearedBefore`的reset，使rows、
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
6. **[待实现] Requests**：接入`send_request`与`probe_connection`，验证真实origin/TLS、取消和网络结果。
7. **[待实现] Diagnostics**：接入`query_diagnostics`，先由真实产品动作产生记录，再验证过滤、脱敏与稳定顺序。
8. **[待人工验收] Playground Tool矩阵**：自动Tool达到24/24后，Developer通过正式Playground逐项执行24项
   recipe并导出脱敏Pass/Fail/Blocked报告；自动测试不得替代人工结论。
9. **[待实现] Capture 39项收敛**：在Tool主线与人工矩阵之后，真实Electron按HTTP、Bodies、Encoding、
   WebSocket、gRPC、TLS六组单向启动并操作正式Playground；复用场景目录、Draft和流量发生器，Capture断言独立，
   从当前2/39收敛到39/39，不建立一个巨型workflow。

每个Tool能力组都必须先更新owning feature与E2E契约，再取得unit/integration Red和真实E2E Red，随后实现并复跑
同组Green；Tool自身的真实E2E是该组完成条件，不能推迟到第9步。没有正式产品入口的Tool先补产品intent，再复用
该入口，不在Tool层实现第二套业务逻辑。VS Code MCP协议升级、双Host一致性、MCP进度SSE和DeepSeek线上兼容
分别保留为外部阻塞或人工验收项，不阻塞内置Agent按上述顺序接线。下一项为Requests两项。

## 6. 相关未完成验收

这些事项与24项Tool主线相关，但不计入Agent接线或真实Tool Call完成数：

| 事项 | 当前进度 | 顺序/解除条件 |
| --- | --- | --- |
| Playground 24项人工矩阵 | recipe 24/24；Developer结论0/24 | Tool自动主线24/24后逐项Pass/Fail/Blocked并导出脱敏报告 |
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
| 文件选择子步骤 | `pickBreakpointBodyFile` | 只服务`forward_edited_breakpoint`的File模式，不是独立业务意图 |
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
- 最终24项业务Tool必须逐项拥有共享executor测试，并在所属能力workflow中至少执行一次真实Agent或MCP Tool Call；
   不把全部Tool塞入单个巨型workflow，按Traffic、正文/消息、Rules、Breakpoints、Requests与Diagnostics分组定位失败；
- Tool 的结果不得比正式产品入口拥有更多权限；文件路径、凭据与私钥继续遵守原有进程边界。
