# 平台架构：进程与通信

> 最后更新：2026-09-04
> 范围：只描述已经实现并验证的代码。本文覆盖跨 feature 的进程边界、两条通道、故障分类与关键数据结构；
> feature 级别的设计见 [../README.md](../README.md) 索引的各 feature 文档。

## 1. 进程拓扑

```mermaid
flowchart LR
  subgraph UI["Renderer · Sandboxed React"]
    UI_APP["1 App.tsx<br/>UI + CoreProcessStatus"]
    UI_API["2 window.interceptor<br/>Intent API"]
  end

  subgraph DESKTOP["Electron Desktop"]
    PRELOAD["3 preload.ts<br/>contextBridge"]
    MAIN["4 DesktopApplication<br/>Window · Security · Renderer IPC"]
    AUTH["GitHubAuthService<br/>Device Flow · Expiry Timer · safeStorage"]
    UPDATE["GitHubReleaseUpdateService<br/>Check · Changelog · Manual Download"]
    AGENT["AgentRuntime<br/>Provider · Session · Streaming · Usage"]
    AGENT_TOOLS["AgentToolService<br/>Capability Index · Discovery · Query execution"]
    AGENT_STORE["providers.enc + agent.sqlite<br/>safeStorage 加密"]
    MCP["McpDesktopService<br/>Loopback HTTP · Auth · Approval"]
    MCP_STORE["mcp-settings.enc<br/>safeStorage 加密"]
    TOOL_SETTINGS["ToolCapabilitySettingsService<br/>Registry projection · Agent/MCP disabled names"]
    TOOL_SETTINGS_STORE["tool-capabilities/settings.json<br/>只保存关闭项"]
    RUNTIME["5 CoreRuntime<br/>CoreProcess · Status · MessageChannel"]
    RPC_CLIENT["6 CoreRpcClient<br/>Request → Promise · Timeout · Cancel"]
  end

  PROTOCOL["7 @interceptor/core-protocol<br/>Typed RPC · Envelope Validation"]
  GITHUB["Private GitHub Releases<br/>OAuth · Metadata · MSI · DMG · ZIP"]
  MODEL_API["DeepSeek / OpenAI-compatible API<br/>Streaming Chat Completions"]
  MCP_HOST["External MCP Host<br/>Native Host · Browser Playground"]

  subgraph CORE["Proxy Core UtilityProcess"]
    ENTRY["8 entry.cts<br/>Minimal Bootstrap · --data-dir"]
    APPLICATION["9 CoreApplication<br/>Lifecycle · Business Ownership · Routing"]
    RPC_SERVER["10 CoreRpcServer<br/>Validate · Correlate · Cancel"]
    DIAGNOSTICS["11 CoreDiagnostics<br/>Trace · Action · Ring Buffer · Redaction"]
    STORAGE["12 CaptureService<br/>Temporary Exchange · Body Spill"]
    ARCHIVE_WORKER["13 Archive Worker（按需）<br/>SQLite Snapshot Read/Write"]
    DIAG_WORKER["14 Diagnostics Worker Thread<br/>diagnostics.sqlite · 批量 · 保留"]
    PROXY["15 ProxyService（Mockttp）<br/>HTTP/1.1+HTTP/2 · CONNECT 直通/MITM · Exchange 捕获"]
  end

  UI_APP --> UI_API --> PRELOAD --> MAIN
  MAIN --> AUTH --> GITHUB
  MAIN --> UPDATE --> GITHUB
  MAIN --> AGENT
  AGENT --> AGENT_STORE
  AGENT --> MODEL_API
  MCP_HOST -->|"127.0.0.1:&lt;port&gt;/mcp<br/>Bearer · MCP 2026-07-28"| MCP
  MAIN --> MCP --> MCP_STORE
  MAIN --> TOOL_SETTINGS --> TOOL_SETTINGS_STORE
  AGENT --> AGENT_TOOLS
  TOOL_SETTINGS --> AGENT_TOOLS
  AGENT_TOOLS -->|"query Tool command + AbortSignal"| RUNTIME
  MCP -->|"enabled shared Tool + AbortSignal"| RUNTIME
  TOOL_SETTINGS --> MCP
  MAIN --> RUNTIME --> ENTRY --> APPLICATION
  RUNTIME -. "parentPort: rpc-port transfer" .-> APPLICATION
  APPLICATION -. "parentPort: ready / heartbeat / stopped" .-> RUNTIME
  RUNTIME --> RPC_CLIENT
  RPC_CLIENT <-->|"MessagePort: request / response / cancel"| RPC_SERVER
  RPC_CLIENT -. "types + envelope" .-> PROTOCOL
  RPC_SERVER -. "types + envelope" .-> PROTOCOL
  APPLICATION --> RPC_SERVER
  RPC_SERVER -->|"executeCommand"| APPLICATION
  RPC_SERVER --> DIAGNOSTICS
  APPLICATION --> DIAGNOSTICS
  APPLICATION --> STORAGE
  STORAGE -. "archive import/export only" .-> ARCHIVE_WORKER
  APPLICATION --> DIAG_WORKER
  DIAGNOSTICS -. "sink" .-> DIAG_WORKER
  APPLICATION --> PROXY
  PROXY --> STORAGE
  RUNTIME -->|"CoreProcessStatus"| MAIN --> PRELOAD --> UI_API --> UI_APP
  AGENT -->|"ordered persisted Session events"| MAIN
```

`AgentRuntime` 是 Main 内长期存活的 Agent domain 组合根，拥有 Provider registry、Credential、Session、Turn、
History、Context、Usage、Streaming 请求与有序事件。Main 只注册可信 Renderer intent、注入 `userData`、
`safeStorage`、`fetch`与动态`AgentToolSource`，并把已持久化的 Session event 广播给 Renderer。
`AgentToolService`把共享registry、Tool开关与`CoreRuntime`组合成Capability Index、`discover_tools`、七个
Traffic query Tool（`get_proxy_status`、`get_storage_status`、`list_exchanges`、`get_exchange`、
`get_exchange_body`、`list_websocket_messages`、`list_grpc_messages`）和`start_recording`、`stop_recording`、
`clear_capture`三个change Tool。
每次Model Call与每项Tool执行前都重取
快照；产生当前响应时披露的集合继续约束该响应，执行时已关闭的Tool返回`unknown_tool`，不触达Core。
业务Tool的`AbortSignal`原样进入Core RPC取消链路。Session持久化`ask/auto`与审批状态；Main把Agent或产品UI
产生的CaptureStatus统一广播给Renderer，避免Agent修改Core后Capture控件保留旧状态。
产品按钮、Agent或MCP完成`capture.cleanup(all)`后，Main还会广播同一个带`clearedBefore`时间边界的
`capture:reset`事件。Renderer常驻Capture管线据此同步清空rows、selection、facet派生状态与Rules hits，并以
现有`syncRevision`和时间边界拒绝旧分页/事件回填；业务入口不各自维护第二套clear逻辑。
Agent或MCP完成`rules.replace`后，Main广播`rules:changed { revision }`；产品UI保存则只通知其他Renderer窗口。
clean Rules Store按最新revision重载，dirty/saving Store保留草稿并进入conflict；提交快照、最高外部revision与加载序列
分别防止保存期间编辑被误判clean、低revision事件重入和旧异步响应回退。

`ToolCapabilitySettingsService`是Main内全局Agent/MCP Tool开关owner，从`@interceptor/tools`的同一可执行registry
投影四组Settings目录，只把两组关闭名称原子写入`<userData>/tool-capabilities/settings.json`。fresh profile与
全开状态不保留文件；当前快照已驱动Agent Capability Index、discovery、schema与执行前检查，MCP `tools/list`
和`tools/call`也在每次请求前读取同一快照。

`McpDesktopService`是Main内唯一外部MCP入口。用户显式开启后，它只在`127.0.0.1`创建独立高位端口的
Streamable HTTP listener，不复用代理端口`8888`。每个Client的Bearer token、label与`ask` / `auto`经
`safeStorage`整体加密；启停和app重启不轮换Token，只有用户手动重新生成或撤销才失效。Main逐请求认证、
对Browser提供标准CORS；Origin与Host都不参与身份判断。Main只处理`/mcp`路由、无凭据preflight与Bearer，
认证成功后原样交给`@interceptor/mcp-server`官方SDK handler与共享Tool registry；旧MCP协议请求被拒绝，
不保留兼容路径。`apps/playground`是独立Web人工验收工具，不进入Desktop包；Browser直接访问MCP，Node
Traffic Lab使用显式`127.0.0.1:8888`产生可观测H1场景。

### 1.1 系统代理进程边界

| 进程或边界 | 允许的职责 | 禁止的职责 |
| --- | --- | --- |
| Renderer / Preload | 发送 Enable、Restore、Status 意图并显示结果 | 直接访问系统代理、journal 或 native helper |
| Electron Main | 唯一产品编排者；顺序执行代理操作、维护 journal、同步 upstream、决定退出是否继续 | 把完整代理快照发给 Renderer 或日志 |
| Proxy Core UtilityProcess | 监听8888并按 Main 下发的 upstream 转发 | 修改系统代理、读取 journal、决定恢复目标 |
| native helper | 执行一次完整平台快照的 get/set | 保存产品状态、识别 App 或决定何时恢复 |
| E2E runner | 在产品外记录测试进程 PID+启动时间，并在失败后保护宿主 | 把测试进程身份写入产品 journal 或协议 |

Windows 使用 `%LOCALAPPDATA%/Interceptor/system-proxy/journal.json` 的用户级唯一记录，不随 Electron
`userData` 改变；macOS 使用当前 `userData/system-proxy/journal.json`。两平台 journal 都只保存 version、
完整 `original` 和完整 `owned`。产品只考虑同一时间一个 App，不实现跨进程 owner 或 mutex。

Main 内的 `SystemProxyOperationQueue` 只是一条内存 Promise FIFO：启动恢复、用户 Enable/Restore、Core
故障恢复和退出恢复按入队顺序执行。Core 故障只登记一个自动恢复；正常退出先通过 Action Gate 拒绝新 IPC、
排空已接受命令，再排入最终 Restore。完整参与者、当场比较表、正常启动、崩溃重启、正常退出、启动失败与
Core 故障时序见 [../features/settings.md](../features/settings.md) §3.2。

每条真实 Electron workflow 和 packaged smoke 均由外层宿主 guard 保存、恢复并复核完整 WinINet、crash
journal、测试进程树和8888 listener。这个 guard 证明测试没有污染宿主，不代表每个产品分支都已取得真实
E2E；Windows跨profile崩溃恢复、MITM持久化和`application.lifecycle.core-restart`均已取得真实Electron
证据，后者覆盖Core-only故障、新代际请求/RPC恢复及第二次故障与正常退出竞争。macOS实机流程仍待E2E。

## 2. 两条独立通道

Main 与 Core 之间有两条职责不重叠的通道，不能互相代偿。

### 2.1 生命周期通道：`UtilityProcess.parentPort`

只承载：

- `ready`：Core 入口已启动；
- `heartbeat`：Core Event Loop 仍可调度；
- `rpc-port`：Main 向 Core 转交业务 MessagePort；
- `shutdown` / `stopped`：优雅关闭。

heartbeat 只更新最后活跃时间供诊断观察，**不触发状态变化、kill 或重启**，避免长请求、大正文或 GC 被误判为进程死亡。首个 `ready` 前保留 30 秒启动窗口；ready 后只有真实进程退出或 MessagePort remote-close 会进入恢复。`CoreProcessStatus.running` 不代表 HTTP Listener 等业务一定健康。

### 2.2 RPC 通道：专用 `MessagePort`

只承载：

- Request：`protocolVersion + requestId + traceId + command`；
- Response：匹配 ID 的 Success 或结构化 Error；
- Cancel：timeout、AbortSignal 或调用方取消。

Main/Core 同包发布，MessagePort 会暂存 listener 注册前到达的消息，所以没有额外 channel init/ready 握手、Token 或跨版本协商状态机。每条 Request 自带 `protocolVersion`，不兼容消息由 validator 直接拒绝。

## 3. 故障分类与重启策略

Main/Core 通信严格区分四类状态，**单条业务数据或请求失败不得升级为通道或进程故障**：

| 分类 | 定义 | 处理 | 是否重启 Core |
| --- | --- | --- | --- |
| 数据错误 | 单个 `event-batch` 无法消费，或 Core 产出的单条消息信封不可解析 | 丢弃该消息；可关联 batch 仍发送 ack；记录诊断 | 否 |
| 请求错误 | 单个 request 信封可关联，但 command 无法执行；或 response 与 request 的 trace/result type 不匹配 | 只返回/拒绝该 request 的结构化错误；连接继续服务后续请求 | 否 |
| 通道错误 | MessagePort 真实 `remote-close`，或 `postMessage` 发送失败 | Core 以 code 1 退出；Main 从进程退出路径恢复 | 是 |
| 进程错误 | Core 启动失败、异常退出、启动期无 ready | Main 按 startup deadline 与指数退避恢复；fatal 组合根启动失败停止重试并提示 | 是（fatal 启动失败除外） |

`CoreRpcClient` / `CoreRpcServer` 只运行时校验 RPC 信封、协议版本、request/trace/batch 关联字段与 result type；Renderer、Main、Core 同包同版本，command/result/event payload 由 TypeScript 契约负责，**不做运行时长度、数量、枚举或内容校验**。捕获的 URL、path、headers、MIME、status text 与 Body 在 Core 存储/导出边界不截断。

TLS passthrough 名单保存即对新连接生效：`patches/mockttp+4.5.0.patch` 让 `tlsPassthrough` 接受 getter，
Listener 每连接重新求值那份数组，因此不需要重建 listener，也不再提供“重启应用”入口。已失败的 TLS
连接无法原地倒带，仍需客户端重试。唯一会换 listener 的场景是开始解密且 listener 上仍挂旧证书；
此时在途 Exchange 按 `ERR_LISTENER_REBUILD` 干净终结，代际与计数不重置。TLS ready 初始化失败保持同一
Core PID 为 running 并记录 detail，不 kill/restart；shutdown timeout 强杀属于 operator shutdown，不是故障恢复。
同一patch还在Electron UtilityProcess中避免向不安全源站的TLS cipher配置追加OpenSSL专用`@SECLEVEL=0`；
Electron不支持该命令。Node/OpenSSL路径继续保留原行为，`rejectUnauthorized: false`的源站例外语义不变。

## 4. Workflow 详细表

Main 创建 frameless `BrowserWindow` 时以 `useContentSize: true` 配置 `1600 × 900`，并在隐藏菜单栏后显式
`setContentSize(1600, 900)`，确保 Windows 不可见 resize border 不把 Renderer viewport 扩成 `1600 × 902`。
最小窗口仍为 `880 × 560`；`1600 × 900` 是 fresh profile 与 Design/Parity 的唯一初始基线。

| # | Workflow | 发起方 → 接收方 | 数据/调用 | 代码位置 | 成功结果 | 失败与清理 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Desktop 启动 | Electron → `DesktopApplication` | `app.whenReady()` | `apps/desktop/src/main/main.ts` | 创建SystemProxyService后，按共享journal的`current/original/owned`三态加载异常退出快照或清理失效记录，再初始化Agent/更新/Core、配置IPC并创建窗口 | 外部修改零WinINet写入；app未ready前不创建CoreProcess/窗口；后续初始化失败先恢复当前系统代理接管，再逐项清理并明确退出 |
| 2 | 配置安全边界 | `DesktopApplication` → Electron Session/WebContents | permission、webview、navigation、download + packaged protocol handlers | `main.ts`、`security/{trusted-renderer-url,packaged-renderer-protocol}.ts` | Renderer 只加载可信 Dev origin 或 `interceptor://app/index.html`；permission 仅放开 clipboard 读写供复制 | 非可信 authority/path/navigation/下载与其余权限被拒绝 |
| 3 | 启动 CoreProcess | `DesktopApplication` → `CoreRuntime` | `start()` | `main.ts`、`core-runtime.ts` | CoreRuntime 调用 `startCoreProcess` | fork 抛错时进入退避重启 |
| 4 | fork CoreProcess | `CoreRuntime` → Electron | `utilityProcess.fork(entry.cjs)` | `core-runtime.ts` | CoreRuntime 独占当前 `CoreProcessHandle`、状态和关闭流程 | 初始化失败时 kill CoreProcess 并进入重启 |
| 5 | 创建 RPC 通道 | `CoreRuntime` → Main/CoreProcess | `new MessageChannelMain()`、`coreProcess.postMessage({type:'rpc-port'}, [port2])` | `core-runtime.ts` | `port1` 附加到内部 `CoreRpcClient`，CoreProcess 接收 `port2` | transfer/attach 失败时关闭 port、client 和 CoreProcess |
| 6 | CoreProcess bootstrap | Electron → `entry.cts` | `process.parentPort` | `entry.cts` | `new CoreApplication(parentPort).start()` | 无 parentPort 时输出错误并非零退出 |
| 7 | CoreProcess 生命周期启动 | `CoreApplication` → parentPort | `ready` + 首个 `heartbeat` | `core-application.ts` | Main 状态变为 `running`，随后每秒 heartbeat | parentPort 故障最终表现为 heartbeat timeout/exit |
| 8 | Renderer 获取 CoreProcess 状态 | Renderer → Preload → Main | `getCoreProcessStatus()` | `App.tsx`、`preload.ts`、`main.ts` | 返回只读 `CoreProcessStatus` | IPC 失败时 UI 标记 `unresponsive` |
| 9 | Renderer 订阅 CoreProcess 状态 | Main → Preload → Renderer | `core:process-status` | `core-runtime.ts`、`main.ts`、`preload.ts`、`App.tsx` | UI 显示 running/restarting/unresponsive/stopping | CoreRuntime.stop 清空状态 listeners；Renderer cleanup 移除 ipcRenderer listener |
| 10 | 发起业务命令 | Renderer → Main | `echoCore(value)` / `getCoreTrace(traceId)` | `desktop-api.ts`、`preload.ts`、`main.ts` | Main 只校验可信 sender，payload 原样构造 typed command | 非可信 sender 拒绝；payload 问题只影响该 request |
| 11 | RPC Request→Promise | Main → `CoreRuntime` → `CoreRpcClient` | `request(command, options)` | `core-runtime.ts`、`core-rpc-client.ts` | 生成 requestId/traceId，注册 `PendingRpcRequest` 并发送 | 无连接、duplicate ID 或 postMessage 失败时 Promise reject |
| 12 | RPC 信封解析 | MessagePort → `CoreRpcServer` | `parseMainToCoreMessage(raw)` | `core-rpc-server.ts`、`core-protocol/validation.ts` | 校验 kind/version/requestId/traceId/type | 非法消息丢弃或返回该 request 错误；连接与进程不变 |
| 13 | command 调度 | `CoreRpcServer` → `CoreApplication` | `executeCommand(command, signal)` | `core-rpc-server.ts`、`core-application.ts` | echo/diagnostics 返回 typed result | 未实现 command 返回 `unsupported-command`；异常转为 `internal` |
| 14 | 结构化日志 | RpcServer/Application → `CoreDiagnostics` | command lifecycle + action | `core-diagnostics.ts` | traceId 下记录 received/validated/handler/action/response/completed | sink 同步/异步失败回退 stderr；日志不得使 command 失败 |
| 15 | RPC Response→Promise | Core → Main | Success/Error Response | `core-rpc-server.ts`、`core-rpc-client.ts` | requestId/traceId/result type 匹配后完成 Promise | mismatch 只拒绝该 request；late response 忽略 |
| 16 | explicit timeout/cancel | Caller → Main → Core | `cancel` + AbortController | `PendingRpcRequest`、`CoreRpcServer` | 只有调用方显式 timeout/abort 才取消；无默认业务 timeout | Cancel 发送失败时本地 Promise 仍清理 |
| 17 | CoreProcess heartbeat 观测 | `CoreApplication` → `CoreRuntime` | 每秒 heartbeat；首个 ready 前 30 秒启动期限 | `core-application.ts`、`core-runtime.ts` | ready 后只更新 lastHeartbeatAt | 运行期暂停 heartbeat 不改变状态或重启 |
| 18 | CoreProcess restart | OS/CoreProcess → `CoreRuntime` | `exit(code)` → backoff → new fork/port | `core-runtime.ts` | 新 PID、新 MessagePort，后续 RPC 正常 | 旧 port 上 pending Promise 被内部 `CoreRpcClient` 拒绝 |
| 19 | graceful shutdown | Renderer/Electron → DesktopApplication → CoreRuntime/CoreApplication | `app:quit`、`before-quit`、`shutdown`、`stopped` | `desktop-api.ts`、`preload.ts`、`main.ts`、`lifecycle/application-shutdown.ts`、`core-runtime.ts`、`core-application.ts` | action gate同步拒绝新IPC并排空已接受命令，取消并等待Agent Turn；确认WinINet仍等于owned后恢复首次original、验证并清journal，再逐项停服务/Core并退出 | 重复quit仍被拦截；外部修改保持零WinINet写入并清失效journal；恢复/验证失败保留journal并恢复命令和Agent，若最后窗口已销毁先重建窗口再报错 |
| 20 | build/package/runtime | npm → esbuild → Forge → package/maker | 0-map Core + native helper → ASAR/extraResource → strict Fuses → sign → MSI/DMG/ZIP | root scripts、`proxy-core/build.mjs`、`forge.config.ts`、installer tests | package audit + packaged workflow smoke + platform installer smoke | 缺 tool/凭据、资源泄漏、Fuse 漂移、安装/升级失败均使门禁失败 |
| 21 | GitHub Device Flow 与 token 刷新 | Renderer → Preload → Main → GitHub OAuth | get/signIn/open/signOut + auth status；启动 refresh；access 到期前 5 分钟 refresh | `desktop-api.ts`、`preload.ts`、`main.ts`、`updates/github-auth-service.ts`、Settings Updates | token/过期时间经 safeStorage 加密；每次成功轮换整组 token 并重排单 timer；Renderer 只见公开账号和设备码状态 | refresh token 缺失、过期或非退出刷新失败即删本地登录；退出取消 timer；无 client secret/private key |
| 22 | 检查并手动下载私有更新 | Renderer → Preload → Main → GitHub Releases | get/check/download/openDownloaded + status event | `desktop-api.ts`、`preload.ts`、`main.ts`、`updates/github-release-update-service.ts`、Settings Updates | Bearer 读取固定仓库；app 内 changelog/进度；完整安装包原子落盘后由系统打开 | 非 stable、外域/Asset API/架构/size/hash 错误拒绝；失败清 `.part` 且当前应用不变 |
| 23 | TLS compatibility 全局处理 | Core → Main → App shell → Core | ACK event batch → `tls:compatibility` → global list dialog → get/replace settings | `proxy/entry.ts`、`core-rpc-server.ts`、`main.ts`、`tlsCompatibilityStore.ts`、`TlsCompatibilityDialog.tsx` | 任意工作区按 host 累积去重事件；每个 host 列出精确值与逐级父域 wildcard，选中项一次 revision replace 后导航 TLS Settings，已挂载面板由 change sequence 立即刷新 | wildcard 已覆盖的 host 不重复写；保存失败保留 dialog；保存旧批次期间到达的新事件不被旧完成路径清除；异步旧 load 不覆盖新名单 |
| 24 | Agent Provider 与持久化 Chat | Renderer → Preload → Main → `AgentRuntime` → Model API | Provider Test/Save/Remove/default；Session Create/Select/Rename/Delete；Send/Stop/Retry；Streaming event | `desktop-api.ts`、`preload.ts`、`main.ts`、`packages/agent-runtime/`、Renderer `features/agent/` | Provider 与API Key整体加密，Session/Turn/Item/chunk/Usage写入`agent.sqlite`；Renderer按sequence合并Streaming，重启恢复且不重放请求 | Agent错误只结束目标Turn；退出先拒绝新IPC、排空已接受命令并取消Turn；Provider/Store启动失败走Desktop逐项清理，不跳过系统代理恢复 |
| 25 | Agent Traffic Tool | `AgentRuntime` → `AgentToolService` → `CoreRuntime` | Capability Index、`discover_tools`、七个Traffic query、`start_recording`、`stop_recording`、`clear_capture` | `packages/agent-runtime/src/agent/entry.ts`、`sessions/entry.ts`、`main/agent/entry.ts` | query直接执行；change按Session的`ask/auto`等待裁决或执行，Tool Result按call ID持久化并返回typed Core数据；recording与reset事实广播Renderer | 未披露/已关闭Tool返回`unknown_tool`；Deny返回`tool_denied`；取消沿原`AbortSignal`进入Core RPC并补失败Result；乱序reset维持单调cutoff |
| 26 | 外部MCP Tool | MCP Host → Main loopback HTTP → `McpDesktopService` → `CoreRuntime` | 当前MCP协议、Bearer、CORS、`tools/list`、`tools/call`、Client `ask/auto` | `main/mcp/`、`packages/mcp-server/`、Settings MCP组件、`apps/playground/` | 每次请求重读MCP Tool开关与Client模式；query直达，change按Ask/Auto执行正式命令；Browser与原生Host共用同一入口 | `OPTIONS /mcp`返回204；实际请求缺失/错误Token为401；旧协议由SDK拒绝；停用、撤销、轮换或退出取消归属调用且不影响代理转发 |

## 5. 关键数据结构

| 数据 | 定义位置 | 用途 |
| --- | --- | --- |
| `CoreProcessStatus` | `apps/desktop/src/shared/desktop-api.ts` | Renderer 可见的 CoreProcess 状态；`running` 仅代表 heartbeat 正常 |
| `GitHubAuthStatus` | `apps/desktop/src/shared/desktop-api.ts` | Renderer 可见的无凭据授权状态；token 与绝对过期时间只在 Main 密文中 |
| `CoreCommand` | `packages/core-protocol/src/messages.ts` | Main → Core 的 typed command union |
| `CoreResultForCommand<T>` | `packages/core-protocol/src/messages.ts` | 编译期保证 command/result 配对 |
| `CoreRequest` / Response / Cancel | `packages/core-protocol/src/messages.ts` | MessagePort RPC envelope |
| `CoreError` | `packages/core-protocol/src/messages.ts` | invalid/unsupported/timeout/cancelled/disconnected/conflict/internal |
| `DiagnosticLogRecord` | `packages/core-protocol/src/messages.ts` | core/main/renderer 来源、Trace/Action/Duration/Outcome 的结构化日志 |
| `CaptureStatusResult` / `CaptureUsage` | `core-protocol/src/messages.ts`、`desktop/src/shared/desktop-api.ts` | 存储用量（会话/Exchange/Body 计数、DB/Blob/总量；无配额） |
| `ExchangeInput` / `SessionQuery` | `apps/proxy-core/src/proxy-core/capture/interfaces/index.ts` | Core 内部抓包域类型；不跨进程，不复用 core-protocol |
| `TransferJobSnapshot` | `packages/core-protocol/src/messages.ts` | HAR/native 文件任务的有限公开状态；不含绝对路径 |
| `ClientAppIdentity` | `packages/core-protocol/src/messages.ts` | 客户端应用身份（id/name/path）；随 `event-batch` 只到 Main，path 不进 Renderer，系统权限进程的 path 为空 |
| `AgentModelsSnapshot` / `AgentSessionSnapshot` / `AgentRuntimeEvent` | `packages/agent-runtime/src/interfaces/index.ts`、`apps/desktop/src/shared/desktop-api.ts` | Renderer可见的脱敏Provider、持久Session快照与有序Streaming事件；API Key和密文不跨Preload |
| `McpDesktopStatus` / `McpApprovalRequest` | `apps/desktop/src/shared/desktop-api.ts`、`packages/mcp-server/src/interfaces/index.ts` | Renderer可见的无凭据endpoint/Client状态与App级change Tool审批；Bearer token不跨Preload |

## 6. 扩展规则

- Capture 与 Proxy 由 `CoreApplication` 统一拥有，不要把业务逻辑放入 `CoreRpcServer`。
- Capture Event 使用无淘汰合并队列、批处理、背压和 sequence/ack。
- `CoreRuntime` 是 Main 唯一的 Core 入口；`CoreRpcClient` 只作为其内部 RPC 状态机（含事件批接收 + 回 ack）。
- `CoreProcessStatus.running` 不得描述为"业务健康"。
- Main 不搬运 Body；Renderer 经 `body.read-range` 按需读取完整正文，header/body 不进入 Renderer 全局状态。
- Renderer API 继续面向意图，不暴露通用 IPC、MessagePort 或 Node 原语。
