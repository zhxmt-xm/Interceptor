# Interceptor 当前实现架构与 Workflow

> 最后更新：2026-07-31
> 范围：只描述已经实现并验证的代码；历史产品设计见 [archived/桌面网络调试代理完整方案.md](archived/桌面网络调试代理完整方案.md)。

## 完整 Workflow 架构图

```mermaid
flowchart LR
  subgraph UI["Renderer · Sandboxed React"]
    UI_APP["1 App.tsx<br/>UI + CoreProcessStatus"]
    UI_API["2 window.interceptor<br/>Intent API"]
  end

  subgraph DESKTOP["Electron Desktop"]
    PRELOAD["3 preload.ts<br/>contextBridge"]
    MAIN["4 DesktopApplication<br/>Window · Security · Renderer IPC"]
    UPDATE["GitHubReleaseUpdateService<br/>Check · Changelog · Manual Download"]
    RUNTIME["5 CoreRuntime<br/>CoreProcess · Status · MessageChannel"]
    RPC_CLIENT["6 CoreRpcClient<br/>Request → Promise · Timeout · Cancel"]
  end

  PROTOCOL["7 @interceptor/core-protocol<br/>Typed RPC · Envelope Validation"]
  GITHUB["Public GitHub Releases<br/>Metadata · MSI · DMG · ZIP"]

  subgraph CORE["Proxy Core UtilityProcess"]
    ENTRY["8 entry.cts<br/>Minimal Bootstrap · --data-dir"]
    APPLICATION["9 CoreApplication<br/>Lifecycle · Business Ownership · Routing"]
    RPC_SERVER["10 CoreRpcServer<br/>Validate · Correlate · Cancel"]
    DIAGNOSTICS["11 CoreDiagnostics<br/>Trace · Action · Ring Buffer · Redaction"]
    STORAGE["12 StorageService<br/>Temporary Capture · Body Spill · Rule Store"]
    ARCHIVE_WORKER["13 Archive Worker（按需）<br/>SQLite Snapshot Read/Write"]
    DIAG_WORKER["14 Diagnostics Worker Thread<br/>diagnostics.sqlite · 批量 · 保留"]
    PROXY["15 ProxyService（Mockttp）<br/>HTTP/1.1+HTTP/2 · CONNECT 直通/MITM · Exchange 捕获"]
  end

  subgraph FUTURE["M3/T3.4 后续注入点"]
    EVENTS["Capture Event Flow + Backpressure"]
  end

  UI_APP --> UI_API --> PRELOAD --> MAIN
  MAIN --> UPDATE --> GITHUB
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
  PROXY -. "M3/T3.4" .-> EVENTS
  RUNTIME -->|"CoreProcessStatus"| MAIN --> PRELOAD --> UI_API --> UI_APP
```

## Core 故障分类与重启策略

Main/Core 通信严格区分四类状态，单条业务数据或请求失败不得升级为通道或进程故障：

| 分类 | 定义 | 处理 | 是否重启 Core |
| --- | --- | --- | --- |
| 数据错误 | 单个 `event-batch` 无法消费，或 Core 产出的单条消息信封不可解析 | 丢弃该消息；可关联 batch 仍发送 ack；记录诊断 | 否 |
| 请求错误 | 单个 request 信封可关联，但 command 无法执行；或 response 与 request 的 trace/result type 不匹配 | 只返回/拒绝该 request 的结构化错误；连接继续服务后续请求 | 否 |
| 通道错误 | MessagePort 真实 `remote-close`，或 `postMessage` 发送失败 | Core 以 code 1 退出；Main 从进程退出路径恢复 | 是 |
| 进程错误 | Core 启动失败、异常退出、启动期无 ready | Main 按 startup deadline 与指数退避恢复；fatal 组合根启动失败停止重试并提示 | 是（fatal 启动失败除外） |

`CoreRpcClient` / `CoreRpcServer` 只运行时校验 RPC 信封、协议版本、request/trace/batch 关联字段与 result type；Renderer、Main、Core 同包同版本，command/result/event payload 由 TypeScript 契约负责，不做运行时长度、数量、枚举或内容校验。捕获的 URL、path、headers、MIME、status text 与 Body 在 Core 存储/导出边界不截断。Live Capture Body 小于 3 MiB 驻内存，超过后 spill 到 Core 临时目录（首次跨阀时已缓存内容全量迁移进文件）；没有单正文或总量配额，磁盘 I/O 失败只跳过该正文捕获，不影响流量转发、RPC 或进程状态。Renderer Inspector 是独立展示边界：文本/结构化 Body、WS 与 gRPC 最多读取前 `5 MiB`（`BODY_PREVIEW_MAX_BYTES`），文本/Hex viewport 最大 `320px`，压缩解码输出同样限制为 `5 MiB`；音视频不进入 Renderer，只能经 Main Save Dialog + Core 流式任务保存。

Main 没有 `app.relaunch()` 或自重启路径。TLS ready 初始化失败保持同一 Core PID 为 running 并记录 detail，不 kill/restart；显式应用退出时的 shutdown timeout 强杀属于 operator shutdown，不是故障恢复。

图中的实线是当前已实现路径，虚线 `M3/T3.4` 是明确的后续注入点。存储层（12–14）与显式代理（15，HTTP/1.1+HTTP/2 + CONNECT 直通/MITM + Exchange 捕获）已实现；增量 Capture Event 流与背压（T3.4）、HTTPS 解密（M5）、HTTP/2（M6）均已实现。

## Renderer UI 架构（M2/T2.0，已落地）

> Renderer 仍只通过 `window.interceptor` 意图 API 访问 Main，不触达 Electron/Node/MessagePort；以下为已实现并 typecheck 通过的 UI 结构，视觉取值以 `design/design-system.md` 为准。

- **App shell**：`app/App.tsx` 持有 `themeMode`（light/warm/dark/ember），消费 i18next 当前语言，并直接拥有全高侧栏 + 46px Window Header + `main` + 30px `footer` Grid；按 `ViewId` 注入对应 feature 的 main/statusbar。`app/Sidebar.tsx` 负责导航 + 底部主题/语言切换器，不再保留单独的 `AppShell` 转发层。
- **设计源**：`design/app` 只保留静态 `shell-v2` 根布局；旧 `layout=current` / `data-layout` 状态、六组 feature `.tv` 顶栏和 Layout 设计切换器已删除。其余 Capture/Rules/overlay 截图均由同一 Shell V2 布局生成，是当前细节场景而非旧版设计。
- **自有窗口 Chrome**：Windows/macOS BrowserWindow 均为 `frame:false`；Renderer 46px Window Header 是 drag region，左侧只保留 no-drag 侧栏折叠按钮和 feature 名称，右侧固定 Minimize / Maximize-or-restore / Close 三按钮。Close 经窄 Preload IPC 进入 `app.quit()` 的 guarded 系统代理恢复与 Core shutdown。业务命令不进入 Header；UpdateNotification 是 Header 下方独立 overlay，不占 Header flex。
- **Feature workspaces**：`features/{capture,rules,composer,breakpoints,diagnostics,settings}/` 均为 Main/Statusbar + colocated CSS Module；旧 Feature Topbar 已删除。Capture 由列表上方的 `CaptureListbar` 承载筛选分栏开关 / Recording / Clear / 搜索 / Import / Export，结构化筛选则在左侧可收起的 `CaptureFilterPanel`；Rules、Composer、Breakpoints、Diagnostics 的业务命令分别位于列表、协议、暂停队列和日志内容工具栏。内容工具栏统一为 `--content-toolbar-height`（44px）。状态统一进入 Statusbar。所有左右分栏复用 1px `Splitter`，抓手为同一 flex 中轴上的 4×40px 子项。
- **Filtering / Rules 交互**：Capture 筛选为七个 facet（`application/method/host/status/protocol/type/rule`，顺序跟随列表表头），组内 OR、组间 AND；关键词搜索是独立维度，不计入筛选 badge也不被“清空筛选”清掉。facet 选项从当前行集一次遍历得出并按固定间隔节流快照，避免实时流量下排序抖动。请求行右键菜单按 11 种 Action type 创建当前完整 URL 的 exact matcher 草稿，只打开 Rules editor、不自动 Apply。Rules editor 可一键切回 Capture 并清空旧条件、过滤当前 Rule 的命中请求；Inspector Rule marker 可直达仍存在的 Rule detail。Rules 继续支持八种 matcher、列表菜单及 grip 拖放排序，Renderer 始终同步 `priority`。
- **共享组件库**：`components/` 扁平库，每组件独立子目录（`Component.tsx` + `Component.module.css`）；含 Flyout（portal 锚定弹层）、ThemeSwitcher、LanguageSwitcher（侧栏底部，取代旧 Account）。`Tabs` 在容器放不下时把尾部项收进 `…` Flyout（隐藏测量层 + `ResizeObserver`），保证面板头高度固定。设计源只保留当前 Theme flyout 与 Language list，不保留替代变体。
- **Automation contract**：`apps/desktop/src/shared/automation-ids.ts` 是稳定 `data-automation-id` 的唯一来源，集中定义静态 ID、Core-owned 动态行前缀与 `AutomationIdFactory`。共享 Button/Input/Select/Switch/Tabs/Segmented/Splitter 等组件只透传可选 automation ID，不包含测试状态；Shell 与 Capture 的已接线元素使用同一公共契约。其余 feature 在实现对应 workflow 时继续接线，禁止在 Renderer 增加 E2E-only setter、隐藏 IPC 或直接业务调用入口。
- **主题与语言**：四套时段主题由 `theme/theme.ts` + `styles/global.css` 驱动。`renderer/i18n/` 用 `i18next` + `react-i18next` 注册 15 个本地静态完整 catalog，英语为默认/回退；切换同步 Ant `ConfigProvider.locale`、`html lang`、localStorage 与 `Intl` 格式。Renderer 经受限 `setUiLanguage` Preload 意图把 15 值枚举同步给 Main，Main 只用内存状态本地化自己持有的 HAR/archive/Diagnostics 文件对话框，不把路径或通用 IPC 暴露给 Renderer。
- **验收**：M12 历史验收覆盖六视图双主题、900×600 与四语言状态，共 42 张截图且无页面级溢出。2026-07-18 多语言增强 smoke 在真实 Windows package 中逐项切换 15 种语言，验证持久化、UI 文案与页面无溢出；catalog 契约测试校验完整主 key、插值与 CLDR 多复数。
- **Updates（M13）**：App级`UpdateActions`订阅Main状态；Settings展示当前/最新版本、GitHub changelog、用户触发下载进度、失败/已下载；Header 下方通知仅在available/downloaded显示。Renderer只调用意图API，不接触URL、路径或文件流。

## Desktop 测试架构（2026-07-22，基础设施已落地，Workflow 待实现）

- **Local production driver**：`apps/desktop/tests/e2e-workflow-tests/` 使用 Playwright `_electron.launch()` 启动测试拥有的 Electron，不附着人工 Forge 进程。`prepare-local.mjs` 复用 Forge Vite entry/config 生成 `.vite/build` 与 `.vite/renderer/main_window` 的 production bundle，不执行 Electron Packager；Core、协议包和 native system-proxy helper 仍走真实构建。
- **统一安全 Renderer origin**：Main 只要没有 `MAIN_WINDOW_VITE_DEV_SERVER_URL` 就安装 `PackagedRendererProtocol`，因此 local production bundle 与最终 package 都从 `interceptor://app/index.html` 加载；开发 HMR 仍使用精确 Vite origin。该条件不依赖 `app.isPackaged`，但可信导航与 CSP 边界不放宽。
- **生命周期与证据**：`fixtures/local-electron-driver.ts` 为每个测试创建独立临时 `userData`，启动 BrowserContext trace，等待真实 Renderer/Core/8888 listener，并在 workflow 后保存 `trace.zip`、`final.png`、Main/Renderer 日志和 PID/端口 metadata；产品 Close 后验证 Main/Core 退出与 8888 可重新 bind，强制关闭只作 finally 兜底。
- **零 Mock 输入边界**：测试操作通过公共 automation ID 进入真实 App UI，再走 Preload/Main/Core/Storage/Proxy/Worker；测试侧只拥有 loopback origin/client、输入文件、证据和清理。`fixtures/loopback-lab.ts` 提供随机 origin port，但被测 Proxy listener 保持产品默认 `127.0.0.1:8888`。禁止 `page.evaluate(window.interceptor.*)` 代替业务操作。
- **当前实现状态**：60 条验收规格与 Inventory 位于 `README.md`、`docs/`，但 `workflows/` 已重置为空，全部状态为 planned（`rules.apply-conflict` 另保留真实双实例前置 blocker）；当前没有 local workflow 自动化通过证据。后续每实现一条，才可更新其状态并把同一 contract 接入 packaged driver。
- **测试分层**：`packaged-smoke/startup.spec.ts` 仍是最终 package 的综合 CDP smoke，尚未复用 60 条 workflow contract；`visual-parity/` 继续用测试目录内 fake Preload 做设计一致性检查，业务 Renderer 无 parity fixture/DEV setter。三套测试职责独立，不能互相冒充覆盖。

## 存储层架构（M2，已落地）

> Capture/Body 直接属于当前 Core UtilityProcess；活动抓包不使用 SQLite 或常驻 Storage Worker。Renderer 只持有全量轻量 summary，不接触 SQL、临时文件或完整正文。

- **数据目录注入**：Main `CoreRuntime.launchCoreProcess` fork Core 时传 `--data-dir=<userData>/storage`；`entry.cts` 据此构建 `StorageService` 与 `DiagnosticsService`（内部组合 `DiagnosticsWorkerHost`，缺省则无存储模式）。`entry.cts` 用 try/catch 包住组合根装配与启动，失败时向 Main 发 `fatal` 生命周期消息并置非零退出码。
- **根证书合并**：`entry.cts` 在 `initializeRuntime()` 后调用 `core-ca-certificates.ts` 的 `installDefaultCaCertificates()`，把 `bundled + system + extra` 合并后 `tls.setDefaultCACertificates()`。MITM 下由 Core 校验源站证书，而 Node 默认只信内置 bundle，企业根 CA 不在其中；不能改用 `--use-system-ca`，那是替换而非合并。
- **模块结构**：client-app/composer/connection/diagnostics/grpc/har/proxy/rules/storage 均以真实 `entry.ts` 门面为根，Service/Engine class 直接定义在 entry；显式类型集中 `interfaces/index.ts`，无状态函数集中 `utils/index.ts`，其余实现文件使用模块前缀且一文件一个 class。host/worker 子模块所有者也使用 `entry.ts`，其余文件保持 `host-*`/`worker-*`。
- **常量集中**：模块常量使用 `<module>-constants.ts`（+ `proxy-core/constants.ts`），是数值/策略的唯一来源；生产构造函数不接收仅测试用的注入参数，单元测试用 `vi.mock` 覆盖常量、用真实 Worker 覆盖通道，详见 `apps/proxy-core/CONSTANTS.md`。
- **StorageService**（`storage/entry.ts`）：直接组合 `TemporaryCaptureStore`、`TemporaryBodyStore` 与 `RuleStore`。Capture 用 Map + 惰性 `(startedAt,seq)` 索引；Body 小于 3 MiB 驻内存，较大正文 spill 到 `capture-temp/`；RuleSet 低频直接读写 `rules.sqlite`。
- **Recording 生命周期**：Stop 只经 `proxy.setRecording{recording:false}` 暂停记录——Mockttp listener 与系统代理保持运行、流量继续转发，暂停期间的新连接不再落库/推送，已在途的 Exchange 自然完成；监听器与系统代理不受影响。Start（含首次 bootstrap）经 `proxy.start` 恢复 `recording=true`（若未监听则先启动 listener，显式换端口时在同会话迁移监听端口）；系统代理只在应用退出与紧急修复时由 Main 恢复。Clear 才推进 cutoff、取消 transfer、清 Capture/Body；Core 退出自然释放临时数据。`proxy.status` 同时上报 `listening` 与 `recording`，Renderer 的 `capturing` 取 `recording`。
- **Archive Worker**（`archive/host/entry.ts` + `archive/worker/entry.ts`）：仅 native archive 导入/导出时创建，按100条批次把内存 Capture materialize/读取当前固定 `capture.sqlite`；完整 schema 直接属于 Worker Store，无版本数组、迁移文件或旧格式分支；完成、取消或失败即退出。
- **Transfer 交互**：命令到达 Core 后直接读取当前 Store；Renderer 全屏 Loading 在运行时只提供 Cancel，取消即 Abort 并恢复 UI。Core 不增加特殊 action 门禁。
- **Diagnostics Worker**（`diagnostics/entry.ts` → `diagnostics/host/entry.ts` + `diagnostics/worker/entry.ts`）：`DiagnosticsService` 是根门面，组合 `DiagnosticsWorkerHost`；worker 独占 `diagnostics.sqlite`，批量事务写入 + 条数/时长保留 + 聚合丢弃计数 + keyset 分页。写入失败只计数，绝不阻塞或回滚捕获，也不递归回灌同一 sink。
- **Capture 与 Diagnostics 强隔离**：Capture 无数据库；Diagnostics Worker 独占 `diagnostics.sqlite`，日志失败不影响抓包。
- **构建/打包**：`proxy-core` 输出 `entry.cjs` + 按需 `archive/worker/entry.cjs` + 常驻 `diagnostics/worker/entry.cjs`；Forge 递归复制整个 `dist/proxy-core`。
- **契约**：新增 `storage.status`/`storage.cleanup`/`diagnostics.query` typed command + 运行时校验；Renderer 经 `getStorageStatus`/`clearStorage` 窄 API 访问。

## 代理层与捕获管线架构（M3，已落地）

> Mockttp 显式代理把流量采集为 Core 临时 Exchange，正文进入内存+spill TemporaryBodyStore，实时 summary 经合并队列和背压窗口推送 Renderer。

- **引擎**：`proxy/entry.ts` 的 `ProxyService` 用 `mockttp` 的 `getLocal()` 作显式代理（`thenPassThrough` 转发，未配置解密时 CONNECT 字节直通），`request`/`response`/`abort` 事件按 id 关联采集 Exchange，写入结构化 `CaptureSink`（`StorageService`）。仅绑 loopback，由 `proxy.start`/`proxy.stop`/`proxy.status` 命令显式控制；Renderer 的 Capture bootstrap 在 Core running 后自动调用 `proxy.start(8888)`。
- **Recording 暂停/清理**：Stop 只设置 `recording=false`，不停止 Mockttp/WebSocket listener，也不恢复系统代理；流量继续转发但新连接不落 Capture，已有记录与在途 Exchange 保留。Start 在同一 Core 代际恢复记录并继续追加。Clear 是唯一用户删除入口，重置 event queue/cutoff 并删除所有临时 Exchange/Body；系统代理只在应用退出、Core failure guarded recovery、用户显式 Restore 或 emergency repair 时恢复。
- **HTTP/2（M6 + 大媒体修复）**：有 CA（MITM）时继续使用 Mockttp `http2:true`，双协议浏览器与 H2-only/gRPC 均可协商 H2，上游按源站 ALPN 独立协商 h2/h1。Mockttp 4.5 的 `beforeRequest`/`beforeResponse` 会分别等待完整请求与 `streamToBuffer` 完整响应；Proxy 因此改用 patch 提供的 `beforeRequestHead` / `beforeResponseHead`，全部规则在头部阶段执行，正文任何情况下都不缓冲。这样 67 MB Range 视频被取消时不会全量缓冲或污染复用 H2 session，同时保留浏览器 H2 pseudo-header/trailer。真实 BYD MITM 两页各首载+连续两次刷新、双协议/H2-only/gRPC 集成测试均覆盖。streamId/GOAWAY/RST/settings/背压 Mockttp 未暴露，待原生 http2 补齐。
- **上游失败镜像**：passthrough 固定 `simulateConnectionErrors: true`。DNS/TCP/TLS 级上游失败（如 IPv6 不可达导致的 `ETIMEDOUT` AggregateError）按真实网络故障 reset/close 客户端连接，而不是伪造 502 + 错误文本正文；Interceptor 作为透明调试代理必须让客户端看到与不挂代理时一致的失败形态。Mockttp 因此走 `AbortError` 分支，不再把上游错误堆栈打到 Core stdout/stderr；Exchange 记为 `aborted` 并保留真实 `errorCode`，同时记一条带 `errorCode` 的 `exchange.aborted` 诊断。
- **正文存储（M14）**：请求/响应正文经 `ExchangeTracker` 的增量 writer 写入 TemporaryBodyStore，WS/gRPC payload 经 `StorageService.writeBody` 写入，按 hash 去重；小正文驻内存，累计超过 3 MiB 后立即 spill；没有单正文或总量配额，不截断正文。
- **捕获事件管线（T3.4 + 增量重构）**：`ExchangeTracker`（`proxy/proxy-exchange-tracker.ts`）按 Mockttp request id 聚合单条 Exchange 的完整生命周期。Capture 只订阅 `request-initiated` / `request-body-data` / `request-trailers` / `response-initiated` / `response-information` / `response-body-data` / `response-trailers` / `abort`，**绝不订阅 completed 的 `request` / `response`** —— Mockttp 一旦发现这两个 listener 就会调用 `waitForCompletedRequest` 与 `body.asBuffer()` 无条件缓冲完整正文。请求头到达即创建 `pending` Exchange 并推送，body/状态/trailer/规则效果逐步增量更新；所有入口都是按 request id 的幂等 upsert（Mockttp 的 initiated / body-data / rule-event 均经 `setImmediate` 异步发出，与规则钩子顺序不保证）。`CaptureEventQueue` 按 Exchange id 合并并分配单调 sequence，`CoreApplication.flushCaptureEvents` 按窗口背压排空。
- **Mockttp trailer patch**：Mockttp 没有 trailer 专用事件，trailer 只存在于 completed 事件，而 gRPC 的 `grpc-status` 正是 response trailer。仓库维护 `patches/mockttp+4.5.0.patch`（约 138 行）给 Mockttp 增加 `request-trailers` / `response-trailers` 事件，经 `patch-package` + 根 `postinstall` 自动重放；`ship-core-deps.mjs` 从 `node_modules` 拷贝，因此 patch 后的文件会随包发布。
- **正文增量存储**：`TemporaryBodyWriter`（`storage/storage-temporary-body-writer.ts`）提供 push 式写入器，chunk 到达即累计 hash 并按**累计字节**跨过阈值后立即 spill；Mockttp 不等待 Capture 落盘，因此待落盘字节超过 `BODY_WRITER_PENDING_LIMIT_BYTES`（128 MiB，病态兜底）后降级为只计数不保存内容，保证 Core 内存有界。内容寻址决定 hash 只能在写完后确定，因此传输中只记录 observed bytes，body 引用在 `isEnded` 后绑定。
- **Capture generation**：`request-initiated` 时固定 generation，Clear 经 `prepareCaptureReset()` 递增并放弃全部在途写入器，旧 generation 的迟到事件全部丢弃，不会重新创建 row。
- **按需详情（M4 后端 + M6 扩展）**：`sessions.detail` 返回 `CaptureExchangeDetail`，正文经 `body.read-range` 按 hash 分块；`decode` 请求由 `proxy/utils/index.ts` 的 `decodeBody` 按 gzip/deflate/brotli（多层、容错）延迟解压并回传 `decodeStatus`。
- **依赖打包**：Mockttp 依赖含 WASM（`brotli-wasm`）与原生插件（`tls-impersonate` 的 `.node` prebuilds），WebSocket bridge 直接依赖 `ws`。esbuild 用 `--external:mockttp --external:ws` 保留运行时 require（`ws` 内联会阻塞首代 Electron UtilityProcess entry），`scripts/ship-core-deps.mjs` 用 `@vercel/nft` 追踪运行时闭包并补拷原生资产，按 node_modules 结构拷进 `dist/proxy-core/node_modules`；Forge extraResource 递归随包发到 `resources/proxy-core/node_modules`。
- **验证**：packaged 真实 exe 启动即 `require('mockttp')`，从隔离随包 node_modules 成功加载并进入 `running`；`npm audit --omit=dev` 0 漏洞。

## Capture 渲染数据层架构（M4，已落地）

> Capture 工作区把占位 UI 升级为真实数据驱动，仍只经 `window.interceptor` 意图 API 访问 Main；Exchange 摘要进 Zustand 视图状态，header/body 均不进入全局状态，按需从 Core 拉取。

- **视图状态**：Zustand 持有当前 Core 的全部 `CaptureExchangeSummary` + id索引、filter、selection、scrollTop、Inspector tab/width；header/body 不进入 Renderer 全局状态。
- **数据管线**：`useCaptureData` 常驻 App，跨 feature 持续接收事件；bootstrap/重连以500条分页批次同步当前 Core 全量 summary，过滤完全在 Renderer 派生。Stop/Start 保留行，Core generation 变化或 Clear 才清空。
- **渲染**：`RequestList` 用固定 52px TanStack Virtual 行。完整 header/body/WS/gRPC payload 留在 Core；Renderer 的文本/结构化 `BodyView`、WebSocket 行预览和 WS/gRPC Copy 只读取前 `5 MiB`，CodeMirror/Hex 在最大 `320px` viewport 内滚动。BodyView 继续提供 Auto/Text/JSON/Hex、UTF-8 探测、JSON pretty print 与响应式 hex；超限时明确显示预览大小与完整大小。`video/*`/`audio/*` 不预览字节，通过 `body.export.start` 在 Core 流式保存完整编码正文。
- **窄 API**：`shared/desktop-api.ts` 暴露 Capture/body 读取与 HAR transfer 意图；Main 做边界校验后转交 CoreRuntime。文件路径只由 Main 系统对话框产生，Renderer 不获得 path/readFile/writeFile。

## 客户端应用归属架构（2026-07-31，已落地，仅 Windows）

> Capture 列表与 Inspector 显示发起流量的本机应用名称与系统图标。反查与取图标全部在原生 helper 完成，Renderer 只见 `appId` 与 data URL，拿不到可执行文件路径。

- **原生 helper**：`apps/desktop/src/main/client-app/windows-helper.cs` 是归属与图标的唯一来源，编译为单文件 exe 随包发布；Main 在 fork Core 时以 `--client-app-helper=<path>` 注入路径，Main 自己取图标时复用同一个 exe。四个子命令：`<proxyPort>` 输出 TSV `sourcePort/PID/displayName/identity`，`--icon <path>` 输出 base64 PNG，`--resolve <pid>` 与 `--apps` 为排查用途。
- **已安装应用索引**：四个来源合起来正好覆盖“设置 → 应用 → 安装的应用”（实测该机 56 项）——MSIX 包登记表的 `PackageRootFolder`、卸载登记表中 `SystemComponent != 1` 条目的 `InstallLocation`/`DisplayIcon`、`App Paths`、开始菜单快捷方式。索引拆成“主程序完整路径”精确表与“安装目录”前缀表。
- **归属规则**：`GetExtendedTcpTable` 拿到源端口对应 PID，再沿父进程链一路向上，一旦当前进程属于已安装应用就停。**一律按可执行文件路径判定，不能按 AUMID**——MSIX 宿主派生的 `msedgewebview2.exe` 会继承宿主包身份，按 AUMID 判会让上溯停在 WebView2 上。**不设层数上限**，改用父进程创建时间不得晚于子进程来排除 PID 复用造成的假父子与环。不比较发布者（宿主常用别家运行时），系统目录下只有 MSIX 包才算应用，没有任何硬编码进程名。索引覆盖不到的安装方式（MSI 常不登记目录，如 GlobalProtect）由“停在最后一个可信祖先”兜底。
- **显示名**：主程序登记名 → 目录登记名 → exe 的 `FileDescription` → 文件名。登记名优先是因为这一列的语义是“哪个应用发出的请求”，`FileDescription` 描述的是组件；主程序优先于目录是因为 Office 套件在卸载表里只有一个条目。
- **代表标识**：归属结果的 `path` 会被换成应用的代表标识（卸载表 `DisplayIcon` 指向的主程序，或包只有一个应用时的 `shell:AppsFolder\<AUMID>`），让名称、图标、`appId` 三者同源，否则 OneDrive 的 `FileCoAuth.exe`、Outlook 的 `olkexthost.exe` 这类无图标资源的后台组件会拿到通用图标并在 UI 里裂成独立条目。代表标识只取自权威来源：App Paths 与快捷方式只代表单个入口，拿它们代表目录会把 OneNote 显示成 Excel。
- **系统权限进程**：helper 以普通用户权限运行，对 SYSTEM 服务进程 `OpenProcess` 会被拒（实测 89 个 `svchost.exe` 里 80 个打不开）。此时退到 `CreateToolhelp32Snapshot` 的 `ExeFile` 取进程名，路径为空、无图标；Core 仍登记该条目（以显示名代替路径算 `appId`）。
- **图标**：走 `IShellItemImageFactory`（与资源管理器同源），不用 `SHGetFileInfo` / `app.getFileIcon`；MSIX/UWP 应用的 exe 只是 stub，后者只能拿到通用图标。取得的 HBITMAP 手工按 32bpp ARGB 拷贝以保留 alpha。
- **不阻塞捕获**：`ClientAppService`（`proxy-core/src/proxy-core/client-app/entry.ts`）持有端口→应用快照，`beginRequest` 只做同步命中；未命中时经 `setImmediate` 排出捕获栈后再拉 helper，结果以 `exchange-updated` 补齐。`execFile` 的 spawn 是同步系统调用，若在 `beginRequest` 内直接调用会把 `exchange-added` 推迟到子进程创建之后。快照 15 秒过期（防端口复用错认），helper 失败后在同一窗口退避，失败只记 `client-app.lookup-failed` 诊断。
- **传递边界**：Core 只把 `appId`（应用标识 sha256 前 16 位）与 `appName` 放进 summary；完整身份（含 path）随 `event-batch` 的 `clientApps` 字段按应用一次性交给 Main，Main 读图标后经 `client-app:icons` 主动推给 Renderer，Renderer 无拉取 API。Renderer 重新加载时 Main 在 `did-finish-load` 补发已知集合。Renderer 侧 `clientAppIcons.get(appId)` 的 `string` / `undefined` / `null` 天然对应“已取到 / 加载中 / 取不到”三态，无需额外状态字段。
- **平台边界**：非 Windows 上 `ClientAppService.supported` 为 false，列表图标列保留占位但不渲染内容；远程客户端（手机经代理）不做反查。

## 证书与 HTTPS MITM 架构（M5，已落地）

> CA 生成/加密/信任库操作全在 Main（Electron `safeStorage` 与平台信任库命令只在 Main 可用），Core 只接收解密后的 CA 做 Mockttp MITM。私钥只在 Main↔Core 内部通道单向下发，绝不进 Renderer/日志/导出。

- **CertificateService**（`apps/desktop/src/main/certificates/certificate-service.ts`）：用 `@peculiar/x509` 生成 RSA 2048/SHA-256 Root CA（BasicConstraints CA、keyCertSign/cRLSign、随机 serial、3 年有效期）；`safeStorage`（DPAPI/Keychain）加密私钥存 `<userData>/certificates/root-key.enc`，明文 `root-cert.pem` 与 meta（SHA-256 fingerprint + SHA-1 thumbprint）单独存。**证书库懒加载**：模块顶层不 import `@peculiar/x509`（其 tsyringe/reflect-metadata 顶层副作用会阻塞 Main/Chromium/CDP 启动），仅在 `generate()` 内 `await import(...)` 并设 WebCrypto provider。
- **TrustStoreService**（`trust-store-service.ts`）：**local-machine 信任库**——`@vscode/sudo-prompt` 提权执行 `certutil -addstore -f Root`（Windows，去 `-user`）/ `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain`（macOS）安装/卸载，非提权 `certutil -verifystore Root <sha1>` / `security find-certificate` 检测；按 SHA-1 thumbprint 精确定位；`execFile` 不经 shell；注入 `ElevatedRunner`（默认 `sudoPromptRunner`）+ `CommandRunner` 便于 mock 单测。本机全部用户/进程（含浏览器）统一信任。
- **下发通道**：Main 经内部 `tls.configure` 命令（复用 request/response，Renderer 无对应窄 API 拿不到私钥）把 CA material + `insecureHosts` 下发 Core；`CoreRuntime.onCoreProcessReady` 在每代 Core 就绪后触发 `provisionCoreTls`。**仅当 CA 已安装信任（`trustStore.isTrusted`）且 `mitmEnabled` 开关开启时才下发 material 启用 MITM**（信任与 MITM 解耦，窄 API `setHttpsDecryption`），否则下发 null（CONNECT 字节直通不解密）。
- **默认 HTTPS 直通**：Main 每次进程启动都从 `mitmEnabled=false` 开始。Core 无 CA material 时以 `tlsInterceptOnly: []` 保证所有 TLS passthrough，并把 opened/closed 事件记录为有限 `CONNECT` tunnel metadata（目标、时间、duration），不读取隧道 header/body。Capture Tunnel 面板只在用户点击后打开 HTTPS Setup，按需 Generate CA、Install trust、Start decrypting。
- **MITM**（Core）：`ProxyService` 有 CA 时 `getLocal({https:{key,cert}})`，Mockttp 用该 CA 动态签发并缓存 leaf；`thenPassThrough({ignoreHostHttpsErrors})` 默认验证源站证书链/hostname、仅对 per-host 例外忽略。解密的 HTTPS Exchange 复用现有 `request`/`response` 捕获管线（`scheme=https`、`secure=true`）。
- **窄 API**：`getCertificateStatus`/`generate`/`install`/`uninstall`/`delete`/`reveal`/`view`Certificate、`openCertificateManager`、`get`/`setInsecureHosts`、`setHttpsDecryption`（Main 组装 `CertificateInfo` 含 `path`/`mitmEnabled`，私钥不出 Main）；install 不自动生成（要求已 present）；Settings/Certificates 面板呈现真实证书状态、信任、fingerprint、MITM 开关、证书文件入口（reveal/view/系统证书管理器）与不安全例外。

### 公钥/私钥与握手时序

三对密钥各司其职：**CA 密钥对**（本应用生成管理，CA 私钥签发 leaf、CA 公钥/证书装信任库验签）、**leaf 密钥对**（Mockttp 按 host 现造并缓存，用于与客户端的会话①）、**源站真实密钥对**（真站持有，用于代理↔源站的会话②）。CA 私钥经 `safeStorage` 加密后只在 Main↔Core 内部流转，绝不进 Renderer/日志/导出。

```mermaid
sequenceDiagram
    autonumber
    participant C as 客户端
    participant TS as 系统信任库
    participant P as 代理（Mockttp 持 CA私钥）
    participant O as 源站 example.com
    Note over P,TS: 一次性准备
    Note over P: 生成 CA 密钥对，CA私钥 加密存盘（只在 Main/Core 内存）
    P->>TS: 安装 CA公钥（证书）到受信任根
    Note over C,O: 每次 HTTPS 请求
    C->>P: CONNECT example.com 端口443
    Note over P: 现造 叶子密钥对（叶子私钥 与 叶子公钥）
    Note over P: 造 example.com 证书，内嵌 叶子公钥，用 CA私钥 签名
    P-->>C: 出示 叶子证书（含 叶子公钥 与 CA签名）
    C->>TS: 读取 CA公钥
    Note over C: 用 CA公钥 验签 → 链可信、域名匹配 → 通过
    C->>P: 用 叶子公钥 协商会话密钥
    Note over P: 用 叶子私钥 完成握手
    Note over C,P: 派生 对称会话密钥①
    P->>O: 代理作为客户端另开 TLS
    O-->>P: 出示 真实证书（真实公钥 与 公共CA签名）
    Note over P: 用 系统公共CA 验证真实证书
    Note over P,O: 派生 对称会话密钥②
    C->>P: 请求（会话密钥①加密）
    Note over P: 解密成明文，可抓包改包
    P->>O: 用 会话密钥② 重新加密转发
    O-->>P: 响应（会话密钥②加密），解密
    P-->>C: 用 会话密钥① 重新加密回发
```

> 密钥交换细节：TLS 1.2+RSA 时客户端用 leaf 公钥加密预主密钥、代理用 leaf 私钥解密；TLS 1.3/ECDHE 时会话密钥由临时 DH 生成（前向保密），leaf 私钥只用来签握手、客户端用 leaf 公钥验签。两种情况下客户端信任 leaf 都取决于用信任库里的 CA 公钥验签成功。

## 诊断可观测性架构（2026-07 增强，已落地）

> 在 M2 Diagnostics 基座（Ring Buffer + Worker 持久化）之上，Core 各组件经共享 `DiagnosticsRecorder` 记结构化关键节点，Renderer Diagnostics 面板通过持久化分页查询展示真实命令 trace。

- **DiagnosticsRecorder 全组件注入**：`core-diagnostics.ts` 导出 `DiagnosticsRecorder`（`info/warn/error(phase,fields)`，`CoreDiagnostics` 唯一实现）；RpcServer 内建、Proxy/Storage host 经 `attachDiagnostics` 注入（`CoreApplication` 装配后转交）。各组件记 initialize/生命周期/action/error 关键节点：RpcServer `rpc.connected`/`connection-failed` + 每命令 1 条 `command.completed`；Application `core.started`/`stopping`/`storage.ready`/`diagnostics.ready`；Proxy `proxy.listening`/`stopped`/`tls.reconfigured`/`tls.client-error` + 异常 exchange；Storage `storage.worker-ready`/`fatal`/`error`/`exit`。命令级精简为单条 completed，`diagnostics.recent`/`query` 静默避免轮询自污染。
- **分页分析数据流（T10.4/T10.5）**：Renderer `DiagnosticsProvider`（2s 轮询）→ `queryDiagnostics` 窄 API → Main `core:query-diagnostics` → Core `diagnostics.query` → Diagnostics Worker。支持 process(core/main/renderer)/trace/command/level/outcome/duration 条件与递减 id keyset cursor；Provider 默认拉 200 条，过滤变化重查首页，按 process+timestamp+sequence 去重并可加载更旧记录；`TraceDetail` 展示来源、标识与 Action 时间线。
- **Main/Renderer 汇入（T10.5）**：Main `MainDiagnostics` 是完整串行队列；Core 断开时保留全部记录并在新代际 running 后续传。Core 内存、待写队列和 SQLite 不按数量、字节或时长淘汰，敏感键、凭据片段与 URL query 仍脱敏。
- **脱敏 JSONL（T10.4/T10.5）**：`diagnostics.export.start` 复用共享 `TransferJobManager`，Main 系统 Save Dialog 独占路径，Core 按可选 process/level/outcome 分页逐行写临时文件、fsync 后原子替换。日志入库由 CoreDiagnostics 脱敏，导出前 `redactRecordForExport` 再次遮罩敏感 attribute 与 URL Query，Renderer 只拿 job snapshot。

## 系统代理与恢复架构（M11，已落地）

> 系统代理归 Electron Main 所有，Renderer 只表达 status/enable/restore/repair 意图；Proxy Core 不读写操作系统设置。所有 native helper、平台 service 与 journal 位于 `apps/desktop/src/main/system-proxy/`。

- **Windows**：`windows-helper.cs` 使用当前用户 WinINet per-connection API 读写 flags、Proxy Server、Bypass、PAC URL、Auto Detect，并广播 settings changed/refresh。`WindowsSystemProxyService` 只允许 loopback listener。
- **上游代理链式转发（已落地，仅 Windows）**：接管前读到的配置经 `system-proxy-upstream.ts` 转成 `UpstreamProxyConfig`（PAC → `pac+<url>`、显式代理 → `http://host:port`、仅 socks → `socks5://`，bypass → curl 风格 `noProxy`），经 `proxy.setUpstream` 下发 Core，再交给 Mockttp 的 `thenPassThrough({ proxyConfig })`。`proxyConfig` 用回调而非固定值，切换上游不重启监听器；PAC 求值由 Mockttp 内置的 `pac-proxy-agent` 完成，不自己解析脚本。上游保存在 Core 进程内，因此 `onCoreProcessReady` 会跟 TLS 材料一同重新下发；接管前读到的地址若就是自己的监听地址（崩溃残留）则视为无上游，避免自环。
- **macOS**：`macos-helper.swift` 通过 Authorization Services + SystemConfiguration 枚举当前 Network Set 的全部活动 service；完整校验后在单个 preferences session 中 set/commit/apply。`MacosSystemProxyService` 把多 service 字典作为一个 ownership 单元。
- **Guarded ownership**：enable 前读取 original 并计算 owned；restore/repair 重新读取 current，只有 `current == owned` 才写回 original。外部修改导致 `ownershipLost`，零写入且不会覆盖用户值。
- **Startup journal**：`SystemProxyJournal` 在 native write 前原子持久化 version/platform/phase/original/owned，临时文件同步后 rename。启动时 `current == owned` 恢复，`current == original` 清 journal，其余保留冲突。Core 从 running 进入 unresponsive/restarting、停止 Capture 和应用退出时复用同一 guarded decision。
- **窄 Desktop API**：`getSystemProxyStatus`、`enableSystemProxy`、`restoreSystemProxy`、`repairSystemProxy`。Emergency repair 先恢复仍 owned 的设置，再尽力停止 listener；Main 日志不包含 snapshot。
- **启动/UI**：first-run 已移除。默认 Capture 视图在 Core ready 后启动 8888 loopback listener，随后只检查系统代理 readiness；未 owned、ownership lost 或 listener 失败时 `capturing=false` 并弹出全局引导，用户显式点击 Enable 后才调用系统代理接管，或进入 Proxy Settings。只有 listener+routing 同时 ready 才显示 Recording；手动 Start 与 Core 重启复用同一检查。CA 生成/信任从启动流程中拆出，只能由用户在 HTTPS Setup 显式授权。Proxy Settings 继续展示 listener、ownership、PAC/bypass、授权结果与 repair 二次确认。
- **构建/打包**：Windows 用系统 .NET Framework `csc.exe`，macOS 用 `xcrun swiftc`；Forge 按平台把 `dist/system-proxy` 放到 packaged `resources/system-proxy`。

## 发布与产物安全架构（M12，已落地）

- **稳定身份/版本**：Desktop `0.1.0`，`com.zhxmt.interceptor` 作为 Bundle ID/AppUserModelId；Windows executable 为 `asInvoker`。MSI 固定 UpgradeCode，x64、per-user，不把 auto-update feature 耦合进安装器。
- **Windows maker**：Forge WiX maker + 固定校验的 portable WiX 3.14.1；`make` 产出 MSI。可选 `WINDOWS_CERTIFICATE_FILE/PASSWORD` 同时签 app 与 MSI。生命周期 smoke 构建两版，验证 install/launch/major-upgrade/launch/uninstall。
- **macOS maker**：无身份 ad-hoc；有 `APPLE_SIGN_IDENTITY` 时 Developer ID；身份和三项 notarize 凭据齐全才提交并自动 staple。DMG + ZIP 同时产出，平台 smoke 验证 helper、deep signature、Gatekeeper/stapler（按凭据）。
- **Renderer origin**：production 从固定 `interceptor://app/index.html` 加载。协议只服务 Renderer root 内 GET 文件，standard/secure/fetch/stream/code-cache，禁止 CSP bypass/Service Worker/CORS；可信导航逐项比较 scheme/authority/path。
- **Fuses**：`@electron/fuses` 2.1.3 在 packageAfterCopy、平台签名前以 strict all-fuses 写入 Electron 43 全九项；RunAsNode/NodeOptions/CLI inspect/file extras 关闭，cookie encryption/ASAR integrity/only-ASAR/WasmTrapHandlers 开启。
- **产物最小化**：Main/Preload production 与 Core release 默认 0 source maps；artifact audit 拒绝 maps/env/tests/source，验证 ASAR、Worker、native helper、Fuses 和签名策略，不设文件数或体积门槛。
- **发布 CI**：GitHub Actions Windows/macOS原生jobs，所有actions固定commit SHA；签名材料只从Secrets进入临时文件/keychain。tag构建验收后发布MSI/DMG/ZIP到同一GitHub Release并用`--generate-notes`生成changelog；测试诊断使用独立artifact，绝不混入Release assets。

## GitHub Releases更新架构（M13，已落地）

> GitHub Releases是唯一远端更新基础设施。应用自动检查与通知，但下载必须由用户显式触发，安装必须由用户打开平台安装器；无自建服务、资源热更新、Squirrel或静默安装。

- **Main所有者**：`main/updates/github-release-update-service.ts`在packaged Windows/macOS启动时检查一次，随后每小时检查。固定调用`api.github.com/repos/zhxmt-xm/Interceptor/releases/latest`，只接受非draft/non-prerelease SemVer tag。
- **Metadata/changelog**：解析字段只取tag、draft/prerelease、body和assets；不限制response或Release body长度，完整纯文本经窄DTO进入Renderer，React不使用HTML渲染。
- **Asset选择**：Windows只接受单一`.msi`，macOS只接受单一`.dmg`。下载URL必须是`https://github.com/zhxmt-xm/Interceptor/releases/download/<validated-tag>/<basename>`，拒绝凭据/query/hash、路径编码逃逸、外域、重复候选和显式架构错配。
- **下载**：用户调用`downloadUpdate`后才开始。Main跟随GitHub CDN redirect，按Release声明size流式写入`<userData>/updates/downloads/.<name>.<uuid>.part`并广播进度；不设安装包体积上限，完成后校验声明size及必需的`sha256:` digest、FileHandle sync并原子rename。
- **打开安装器**：Renderer调用无参数`openDownloadedUpdate`；Main只对当前进程内成功下载并保留的绝对路径调用`shell.openPath`。Renderer无法提交任意URL/path。Windows交给MSI，macOS交给DMG；无自动安装或重启。
- **窄契约**：`UpdateStatus`仅含supported/state/currentVersion/latestVersion/progress/downloadedBytes/totalBytes/releaseNotes/message/lastCheckedAt；状态为unsupported/idle/checking/available/downloading/downloaded/up-to-date/failed。Preload暴露get/check/download/openDownloaded/status event。
- **生命周期**：`DesktopApplication`在创建窗口前构造服务，窗口后启动检查；状态通过`update:status`广播。退出时`stop()`清timer、abort活动下载并移除listeners。packaged Renderer始终从受保护ASAR经`interceptor://app`协议加载，不存在远程代码覆盖层。

## 规则引擎架构（M7，已落地）

> 规则以可序列化模型持久化（不存 callback/运行时对象），捕获启动/热更新时编译为 Mockttp
> passthrough 的 beforeRequest/beforeResponse 改写函数；执行在 Core 数据面，Renderer 经
> rules.get/validate/replace 管理（UI 在 M8）。

- **模型**（`packages/core-protocol/src/rules.ts`）：RuleSet、RuleDefinition、Matcher 与 Action 是纯 TypeScript 数据。RPC 只校验信封关联，不对规则payload做运行时数量、长度或语义校验；规则请求失败只返回当前request错误。
- **持久化**（`storage`，schema v2）：单行 `rule_set` 表（revision + rules_json）；`CaptureStore.saveRuleSet` 单事务乐观并发（expectedRevision 不符抛 RuleRevisionConflictError→conflict）、`loadRuleSet` 空库返回 revision 0；`rule_hit` 表（schema v1）记 RuleHit 审计。
- **编译与执行**（`proxy-core/rules/`）：`matcher-compiler` 把 Matcher 编译为纯判定（host/path/url/query/header 值匹配为 contains 默认/exact/regex，大小写由可选 `caseSensitive` 控制、默认不敏感；**未填写的值与空条件集恒不匹配**）；`action-executor` 产出 ActionOutcome（mutate/respond/block/delay），Map Local 路径规范化 + 允许根校验防穿越；`breakpoint-queue` waiting→continued/edited/dropped/timed_out 状态机（强制 timeout + 断线 closeAll）；`rule-engine` 持有 ruleSet 引用，evaluateRequest/evaluateResponse 按 priority/id 执行、聚合 outcome 与 RuleHit。
- **接入与热切换**（`proxy-service` + `core-application`）：Proxy 只注册**单一** `forAnyRequest().thenPassThrough({ beforeRequestHead, beforeResponseHead })`。不使用 `.matching(callback)`（Mockttp CallbackMatcher 会先 `waitForCompletedRequest` 读完整个上传正文），也不使用 `beforeRequest`/`beforeResponse`（分别等待完整请求与 `streamToBuffer` 完整响应）。所有 matcher 与 action 在头部阶段同一个动态钩子内完成，因此响应侧 matcher（status/response header/response mime）、`header append`、response `delay` 均无需降级缓冲；正文始终流式。Hook 据评估返回改写/短路/阻断/延迟；命中结果经 `ExchangeTracker.recordRuleOutcome` 关联到 Exchange。CoreApplication 组合根创建 RuleEngine+BreakpointQueue 注入 Proxy，存储就绪 `loadRuleSet` 热加载，`rules.replace` 成功后 `setRuleSet` 原子替换（不 reset server，热更新不丢流量）。
- **Mockttp headers 阶段钩子 patch**：`patches/mockttp+4.5.0.patch`（约 390 行）给 `PassThroughStep` 增加 `beforeRequestHead` / `beforeResponseHead`，两者都在头部到达时同步执行且**从不缓冲正文**，支持改写 method/url/status/headers、短路、close/reset，以及不等原文的整体 body 替换（上游流被 `resume()` 倒掉）。同一 patch 还提供 `request-trailers` / `response-trailers` 事件。
- **Header 效果与规则身份**：RuleEngine 在每次真实生效的 header action 后按序产出 `set/append/replace/remove + ruleId`；ProxyService 与 request id 关联后随 Exchange header metadata 保存，并把实际执行过 action 的唯一 `ruleIds` 放入 summary/detail。Request 原始行表示客户端输入，规则效果行表示上游实际值；Response 原始行是浏览器实际收到的最终值，效果行补充被替代/删除历史。Renderer 去重 wire/effect 重复项并用四种语义色标记；HAR materialize 最终 wire headers 且不导出 marker，Native Archive 的 `exchange.rule_ids` / `message_headers.rule_id` 完整保真。
- **命令**：`rules.get`/`rules.replace`（乐观并发）、`breakpoint.resolve`（continue/drop/timeout + 可选 edit）。
- **未实现/限制**：断点命中事件推送 Renderer 与规则 UI 在 M8。带宽限速（throttle）已从协议与 UI 移除：它必须介入正文流，而规则全部在头部阶段执行，浏览器 DevTools 已自带限速。

## 规则 UI / Composer / Breakpoint / Connection 架构（M8，已落地）

> M8 把 M7 规则引擎能力接入 Renderer 并补齐 Composer、Breakpoint 编辑与 Connection/TLS 详情。Renderer payload 原样转交，Core RPC 只检查信封/version/关联字段。

- **Rules workspace（T8.1）**：Renderer `features/rules/` 数据驱动——`rulesStore`（Zustand：`revision` + 可编辑规则草稿 + `hits` + `dirty`/`saving`/`conflict`）、App 常驻 `useRulesData`（首次 `rules.get` 只加载一次，避免跨 feature 新草稿被覆盖；`rules.replace` 乐观并发；4s 轮询 `rules.hits`）；`MatcherRow` 覆盖 8 种 matcher、`ActionEditor` 覆盖 11 种 action 的受控编辑（header/query 名值自由输入）。未填写项由本地纯函数 `ruleIssues` 即时派生，驱动 RuleEditor 问题列表、Statusbar 计数与启用开关可用性；不完整的规则无法启用，新建规则与 Capture 草稿默认 `enabled: false`。Server 的 `countRuleHits` 按 `rule_id` 聚合当前 Capture 命中。窄 API：`getRules`/`replaceRules`（结构化 `RuleReplaceResult` 回传 conflict/invalid）/`getRuleHits`。
- **Composer（T8.2）**：`ComposerService.send` 采集完整响应状态/头/正文/时序、TLS完整证书链与remoteAddress；未显式提供timeout时不设期限，Renderer历史不淘汰。
- **Breakpoint 编辑（T8.3）**：`BreakpointQueue.suspend` 存请求/响应快照（ruleName/method/url/statusCode/headers/body）+ `deadline`，`list()` 返回快照；`RuleEngine` 加全局 break-on-match 开关（关闭时命中 breakpoint action 立即 continue），`awaitBreakpoint` 从可变 state 构建快照。`breakpoint.list`（返回 pending 快照 + enabled）/`breakpoint.configure`（设开关）handler；沿用 M7 `breakpoint.resolve`（continue/drop/edit）。Renderer `features/breakpoints/` 的 `breakpointsStore`（暂停列表 + 编辑草稿，轮询期间不覆盖用户编辑）+ `useBreakpoints`（1s 轮询 `breakpoint.list`、`resolveSelected`、`continueAllBreakpoints`、`setBreakOnMatch`）；UI `PausedQueue`（倒计时 + Continue all）/`BreakpointEditor`（编辑 header/body + Drop/Continue/Execute）。**采用轮询而非 push 事件通道**（请求在 Core 侧 await 挂起，1s 轮询延迟可接受）。窄 API：`listBreakpoints`/`resolveBreakpoint`/`setBreakpointsEnabled`。
- **Connection/TLS 详情（T8.4）**：`ConnectionService.probe` 用 `tls.connect` 读取协议/套件/ALPN/authorized 与完整去重证书链；未显式提供timeout时不设期限。

## WebSocket 与 gRPC 架构（M9，已落地）

> M9 在既有 Mockttp HTTP/1.1+HTTP/2 数据面上增加 WebSocket 应用消息和原生 gRPC framing 展示。payload 完整留在 Core Body Store，Renderer 按需读取有限预览。

- **WebSocket 握手与生命周期**：Mockttp 独立 WebSocket rule 接收 HTTP/1.1 Upgrade；`websocket-request`/`accepted` 关联成 protocol=`ws` 的 101 Exchange。101 后 state=`request-complete`（open），clean close 经 `StorageService.updateExchange` 更新 completed 并发 `exchange-updated`。仅支持 RFC 6455 H1 Upgrade；RFC 8441 H2 Extended CONNECT 未实现。
- **WebSocket message 数据面**：`proxy/proxy-websocket-bridge.ts` 以 Mockttp 本地 custom step 保留 listener/Upgrade/观测事件，用 `ws` 连接上游并串行桥接双向 text/binary message。独立 `Pause on message` 开关启用后，每条消息在 target `send()` 前 await `RuleEngine.pauseWebSocketMessage`→`BreakpointQueue`；支持 text/hex edit、continue/drop/timeout。
- **WebSocket 存储/查询**：payload 写内容寻址 Blob；`websocket_frame` 存 exchange_id/seq/direction/opcode/payload_body_id/size/time。`websocket.frames` 按 seq opaque keyset 分页、可按方向过滤，只返回 metadata + `CaptureBodyRef`；Renderer 用 `body.read-range` 读取选中 payload。
- **原生 gRPC 捕获**：没有独立 gRPC listener。Mockttp `http2:true` 的通用 `forAnyRequest().thenPassThrough()` 接收 H2 POST，`request/response` 完成事件保存 `application/grpc` / `application/grpc+*` body 与 grpc-status/message trailer。真实 TLS+ALPN h2 集成测试验证双方 envelope bytes 和 trailer。`application/grpc-web*` 明确不按原生 framing 解析。
- **gRPC framing/query**：`grpc/entry.ts` 的 `GrpcService` 通过 `grpc/utils/index.ts` 解析 5-byte envelope；每条只从 Blob 读 5B header，再按 payload length 跳到下一 offset。无需 DB migration/新 Blob；payload 继续走既有 range。
- **Renderer**：Capture Inspector 对 WS 与原生 gRPC 显示前 `5 MiB` payload 预览；compression/truncation/malformed只描述源帧事实。无 descriptor 时 protobuf 显示有限 raw hex，Copy 复制当前有限预览；完整 payload 仍保存在 Core。
- **窄 API**：M9意图API的payload原样转交，Core protocol只校验RPC信封/version/关联字段。
- **已知边界**：gRPC 当前依赖 Mockttp 完成后的 body，Unary 可展示；长时间 server-streaming/bidi-streaming 需等 stream 结束。实时消息需接 `request-body-data`/`response-body-data` 并维护跨 chunk framing；descriptor/reflection、message-level 解压均未实现。

## HAR 1.2 导入导出架构（M10/T10.1，已落地）

> 文件系统与大正文始终留在 Main/Core：Renderer 只提交导入/导出意图与 scope/redaction，Main 用系统文件对话框选择路径，Core 从 Storage/Blob 直接转换并通过公开 job snapshot 回报进度。

- **Core 门面**：`har/entry.ts` 的 `HarService` 直接作为模块入口，组合 `HarJobManager`、`HarDocumentParser`、`interfaces/index.ts` 和 `utils/index.ts`。导出按 `sessions.query` keyset 页枚举 ID，再逐条 detail/body range 转 HAR entry；导入先验证完整不可信 JSON，再建立隔离 Session、分批写 Blob/Exchange，失败/取消按 Session cleanup 回滚。
- **文件任务**：任务全部保留、每任务独立AbortController；公开字段不含绝对路径。Core关闭先cancelAll。
- **结构边界**：HAR不限制文件、entries、headers、URL或body大小/数量；保留HAR结构、base64语法与可映射网络scheme检查，不执行脚本/插件或远程内容。
- **HAR 映射与损失**：HTTP request/response/header/query/content/timings 与 text/base64 body 可互操作；压缩 Response 在导出时先按 gzip/deflate/br 解码，`bodySize` 保持线上编码大小，`content.size`/`compression` 表达解码资源与压缩收益。pseudo-header/trailer、WebSocket message、TLS detail、rule history 无法无损表达，Core/UI 明确警告。导出可遮罩 Authorization/Proxy-Authorization、Cookie/Set-Cookie，并可移除正文；T10.3 仍负责更广的默认隐私/URL query/token/确认策略。
- **Desktop**：`startHarExport/startHarImport/getTransferJob/cancelTransferJob` 是唯一 Renderer API；Main 的 `showSaveDialog/showOpenDialog` 持有路径。Capture 顶栏 Import/Export 菜单分别提供 `Import HAR` / `Export HAR`；HAR Export 单一动作弹层支持 all/current filter/selected、redaction、进度/取消/终态，导入成功重查列表。Parity 用 fake Preload + 正常点击，业务 Renderer 无测试后门。
- **验证**：HAR unit 覆盖round-trip、脚本文本inert、完整字段、脱敏、失败回滚、任务取消与路径隐藏。

## 原生 archive 导入导出架构（M10/T10.2，已落地）

> 原生 archive 是保留 Interceptor 全保真度的固定格式 ZIP 容器；与 HAR 共用同一套异步 transfer job 与 Main 系统对话框边界，文件系统与大正文始终留在 Core，不新增生产依赖。当前阶段不兼容旧 Archive schema。

- **共享任务基础设施**：`transfer/entry.ts` 的 `TransferJobManager`（通用 `start(jobId, kind, filePath, operation)` + get/cancel/cancelAll）由 `CoreApplication` 独占一个实例，`HarService` 与 `ArchiveService` 共用；`transfer.job.get/cancel` 直接查询该实例。`TransferJobKind` 扩展为 `har-export`/`har-import`/`archive-export`/`archive-import`。
- **依赖零新增的 ZIP**：`archive/archive-zip-writer.ts` 手写流式 ZIP（占位本地头 → 流式 `deflateRaw` → 回填 crc/大小 → central directory/EOCD，FileHandle 定位回填避免数据描述符），`archive/archive-zip-reader.ts` 只信任 central directory；CRC-32、条目名安全、manifest 解析集中在 `archive/utils/index.ts`。全部用 Node `zlib`/`crypto`。
- **一致快照**：`storage` 新增 worker 请求 `snapshot` → `CaptureStore.snapshotInto` 用 `PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM INTO ?` 生成紧凑一致快照（不复制活动库文件）；`StorageService` 暴露 `snapshot`/`referencedBlobHashes`/`openBlobStream`（`BlobStore.openReadStream`）。
- **导出**：`ArchiveService.exportToFile` 按当前唯一 schema 生成 `capture.sqlite` 快照 → 逐个流式写入引用 Blob（`blobs/<sha256>`）→ 最后写 `manifest.json`（format/appVersion/createdAt + 每文件 path/size/sha256）→ finalize → 原子 rename。Archive、Rules 与 Diagnostics SQLite 均直接创建当前表结构，不保留 `user_version`、迁移步骤或旧数据库搬运路径。
- **导入**：解析EOCD/central directory并校验格式、路径、重复条目、声明size、CRC与SHA-256；不设文件、entry、解压总量或压缩比上限。当前ZIP实现不支持ZIP64，这是格式能力边界。
- **Desktop**：`startArchiveExport/startArchiveImport` 是唯一 Renderer API；Main `showSaveDialog/showOpenDialog` 持有 `.iarchive` 路径。Capture 顶栏把 archive 呈现为独立的 `Open Capture` / `Save Capture` 命令（整库无损，不与 HAR 共用 Format），进度/取消/终态复用 transfer job 轮询。

## 两条独立通道
### 生命周期通道：`UtilityProcess.parentPort`

只承载：

- `ready`：Core 入口已启动；
- `heartbeat`：Core Event Loop 仍可调度；
- `rpc-port`：Main 向 Core 转交业务 MessagePort；
- `shutdown` / `stopped`：优雅关闭。

heartbeat 只更新最后活跃时间供诊断观察，不触发状态变化、kill或重启，避免长请求/大正文/GC被误判为进程死亡。首个`ready`前保留30秒启动窗口；ready后只有真实进程退出或MessagePort remote-close会进入恢复。`CoreProcessStatus.running`不代表HTTP Listener等业务一定健康。

### RPC 通道：专用 `MessagePort`

只承载：

- Request：`protocolVersion + requestId + traceId + command`；
- Response：匹配 ID 的 Success 或结构化 Error；
- Cancel：timeout、AbortSignal 或调用方取消。

Main/Core 同包发布，MessagePort 会暂存 listener 注册前到达的消息，所以没有额外 channel init/ready 握手、Token 或跨版本协商状态机。每条 Request 自带 `protocolVersion`，不兼容消息由 validator 直接拒绝。

## Workflow 详细表

| # | Workflow | 发起方 → 接收方 | 数据/调用 | 代码位置 | 成功结果 | 失败与清理 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Desktop 启动 | Electron → `DesktopApplication` | `app.whenReady()` | `apps/desktop/src/main/main.ts` | 配置安全、IPC、CoreRuntime，并创建窗口 | app 未 ready 前不创建 CoreProcess/窗口 |
| 2 | 配置安全边界 | `DesktopApplication` → Electron Session/WebContents | permission、webview、navigation、download + packaged protocol handlers | `main.ts`、`security/{trusted-renderer-url,packaged-renderer-protocol}.ts` | Renderer 只加载可信 Dev origin 或 `interceptor://app/index.html`；permission 仅放开 clipboard 读写供复制 | 非可信 authority/path/navigation/下载与其余权限被拒绝 |
| 3 | 启动 CoreProcess | `DesktopApplication` → `CoreRuntime` | `start()` | `main.ts`、`core-runtime.ts` | CoreRuntime 调用 `startCoreProcess` | fork 抛错时进入退避重启 |
| 4 | fork CoreProcess | `CoreRuntime` → Electron | `utilityProcess.fork(entry.cjs)` | `core-runtime.ts` | CoreRuntime 独占当前 `CoreProcessHandle`、状态和关闭流程 | 初始化失败时 kill CoreProcess 并进入重启 |
| 5 | 创建 RPC 通道 | `CoreRuntime` → Main/CoreProcess | `new MessageChannelMain()`、`coreProcess.postMessage({type:'rpc-port'}, [port2])` | `core-runtime.ts` | `port1` 附加到内部 `CoreRpcClient`，CoreProcess 接收 `port2` | transfer/attach 失败时关闭 port、client 和 CoreProcess |
| 6 | CoreProcess bootstrap | Electron → `entry.cts` | `process.parentPort` | `entry.cts` | `new CoreApplication(parentPort).start()` | 无 parentPort 时输出错误并非零退出 |
| 7 | CoreProcess 生命周期启动 | `CoreApplication` → parentPort | `ready` + 首个 `heartbeat` | `core-application.ts` | Main 状态变为 `running`，随后每秒 heartbeat | parentPort 故障最终表现为 heartbeat timeout/exit |
| 8 | Renderer 获取 CoreProcess 状态 | Renderer → Preload → Main | `getCoreProcessStatus()` | `App.tsx`、`preload.ts`、`main.ts` | 返回只读 `CoreProcessStatus` | IPC 失败时 UI 标记 `unresponsive` |
| 9 | Renderer 订阅 CoreProcess 状态 | Main → Preload → Renderer | `core:process-status` | `core-runtime.ts`、`main.ts`、`preload.ts`、`App.tsx` | UI 显示 running/restarting/unresponsive/stopping | CoreRuntime.stop 清空状态 listeners；Renderer cleanup 移除 ipcRenderer listener |
| 10 | 发起业务命令 | Renderer → Main | `echoCore(value)` / `getCoreTrace(traceId)` | `desktop-api.ts`、`preload.ts`、`main.ts` | Main只校验可信sender，payload原样构造typed command | 非可信sender拒绝；payload问题只影响该request |
| 11 | RPC Request→Promise | Main → `CoreRuntime` → `CoreRpcClient` | `request(command, options)` | `core-runtime.ts`、`core-rpc-client.ts` | 生成 requestId/traceId，注册 `PendingRpcRequest` 并发送 | 无连接、duplicate ID 或 postMessage 失败时 Promise reject |
| 12 | RPC 信封解析 | MessagePort → `CoreRpcServer` | `parseMainToCoreMessage(raw)` | `core-rpc-server.ts`、`core-protocol/validation.ts` | 校验kind/version/requestId/traceId/type | 非法消息丢弃或返回该request错误；连接与进程不变 |
| 13 | command 调度 | `CoreRpcServer` → `CoreApplication` | `executeCommand(command, signal)` | `core-rpc-server.ts`、`core-application.ts` | echo/diagnostics 返回 typed result | 未实现 command 返回 `unsupported-command`；异常转为 `internal` |
| 14 | 结构化日志 | RpcServer/Application → `CoreDiagnostics` | command lifecycle + action | `core-diagnostics.ts` | traceId 下记录 received/validated/handler/action/response/completed | sink 同步/异步失败回退 stderr；日志不得使 command 失败 |
| 15 | RPC Response→Promise | Core → Main | Success/Error Response | `core-rpc-server.ts`、`core-rpc-client.ts` | requestId/traceId/result type匹配后完成Promise | mismatch只拒绝该request；late response忽略 |
| 16 | explicit timeout/cancel | Caller → Main → Core | `cancel` + AbortController | `PendingRpcRequest`、`CoreRpcServer` | 只有调用方显式timeout/abort才取消；无默认业务timeout | Cancel发送失败时本地Promise仍清理 |
| 17 | CoreProcess heartbeat 观测 | `CoreApplication` → `CoreRuntime` | 每秒 heartbeat；首个ready前30秒启动期限 | `core-application.ts`、`core-runtime.ts` | ready后只更新lastHeartbeatAt | 运行期暂停heartbeat不改变状态或重启 |
| 18 | CoreProcess restart | OS/CoreProcess → `CoreRuntime` | `exit(code)` → backoff → new fork/port | `core-runtime.ts` | 新 PID、新 MessagePort，后续 RPC 正常 | 旧 port 上 pending Promise 被内部 `CoreRpcClient` 拒绝 |
| 19 | graceful shutdown | Electron → DesktopApplication → CoreRuntime/CoreApplication | `before-quit`、`shutdown`、`stopped` | `main.ts`、`core-runtime.ts`、`core-application.ts` | CoreApplication 关闭 RPC、停止 heartbeat、退出；CoreRuntime 清空 listeners 后 Main 再 quit | 超过 1.5 秒则 CoreRuntime force kill |
| 20 | build/package/runtime | npm → esbuild → Forge → package/maker | 0-map Core + native helper → ASAR/extraResource → strict Fuses → sign → MSI/DMG/ZIP | root scripts、`proxy-core/build.mjs`、`forge.config.ts`、installer tests | package audit + packaged workflow smoke + platform installer smoke | 缺 tool/凭据、资源泄漏、Fuse 漂移、安装/升级失败均使门禁失败 |
| 21 | 检查并手动下载更新 | Renderer → Preload → Main → GitHub Releases | get/check/download/openDownloaded + status event | `desktop-api.ts`、`preload.ts`、`main.ts`、`updates/github-release-update-service.ts`、Settings Updates | app内changelog/进度；完整安装包原子落盘后由系统打开 | 非stable、外域/路径/架构/size/hash错误拒绝；失败清`.part`且当前应用不变 |

## 关键数据结构

| 数据 | 定义位置 | 用途 |
| --- | --- | --- |
| `CoreProcessStatus` | `apps/desktop/src/shared/desktop-api.ts` | Renderer 可见的 CoreProcess 状态；`running` 仅代表 heartbeat 正常 |
| `CoreCommand` | `packages/core-protocol/src/messages.ts` | Main → Core 的 typed command union |
| `CoreResultForCommand<T>` | `packages/core-protocol/src/messages.ts` | 编译期保证 command/result 配对 |
| `CoreRequest` / Response / Cancel | `packages/core-protocol/src/messages.ts` | MessagePort RPC envelope |
| `CoreError` | `packages/core-protocol/src/messages.ts` | invalid/unsupported/timeout/cancelled/disconnected/conflict/internal |
| `DiagnosticLogRecord` | `packages/core-protocol/src/messages.ts` | core/main/renderer 来源、Trace/Action/Duration/Outcome 的结构化日志 |
| `StorageStatusResult` / `StorageUsage` | `core-protocol/src/messages.ts`、`desktop/src/shared/desktop-api.ts` | 存储用量（会话/Exchange/Body计数、DB/Blob/总量；无配额） |
| `ExchangeInput` / `SessionQuery` | `apps/proxy-core/src/proxy-core/storage/interfaces/index.ts` | Core 内部存储域类型；不跨进程，不复用 core-protocol |
| `TransferJobSnapshot` | `packages/core-protocol/src/messages.ts` | HAR/native 文件任务的有限公开状态；不含绝对路径 |
| `ClientAppIdentity` | `packages/core-protocol/src/messages.ts` | 客户端应用身份（id/name/path）；随 `event-batch` 只到 Main，path 不进 Renderer，系统权限进程的 path 为空 |

## 后续扩展规则

- M2 Storage Service 与 M3 Proxy Service 由 `CoreApplication` 统一拥有，不要把业务逻辑放入 `CoreRpcServer`。
- 真实Capture Event使用无淘汰合并队列、批处理、背压和sequence/ack。
- `CoreRuntime` 是 Main 唯一的 Core 入口；`CoreRpcClient` 只作为其内部 RPC 状态机（含事件批接收 + 回 ack）。
- `CoreProcessStatus.running` 不得描述为“业务健康”。
- Main不搬运Body；Renderer经`body.read-range`按需读取完整正文，header/body不进入Renderer全局状态。
- Renderer API 继续面向意图，不暴露通用 IPC、MessagePort 或 Node 原语。

## 当前未实现

- Local E2E 的 60 条 feature workflow 与 packaged 共享 driver/contract 尚未实现；当前只有 production bundle builder、driver、fixture、automation contract 和验收规格，`workflows/` 为空。
- HTTP/2 深度 stream 健壮性（streamId/GOAWAY/RST/settings/背压）Mockttp 未暴露，待原生 http2 补齐；WebSocket H2 Extended CONNECT 未实现。
- gRPC 实时 streaming 增量 framing、message-level 解压、Protobuf descriptor 与 Server Reflection 未实现；当前为完成后 raw message 展示。
- 真正零内存流式正文落盘（M3/T3.3 优化项；当前经内存缓冲后写内容寻址 Blob，body-data 增量写盘留后续）。
- 每 exchange 上游 TLS metadata 落库（M8 的 Connection/TLS 详情用按需 `connection.probe` 实时探测替代；Mockttp 未暴露数据面上游 TLS，逐 exchange 记录待原生 http 数据面）。
- CA导出未实现。M13 GitHub Release检查/手动下载已落地；生产Authenticode、Developer ID/notarization与真实macOS DMG下载/打开仍需仓库外凭据和原生runner留证。

## 更新规则

- 本文件只记录已经实现并验证的 workflow。
- 计划能力留在完整方案和对应 Stage 文件。
- 里程碑边界同步核对 [HANDOVER.md](HANDOVER.md) 与本文件；历史 Stage 资料只保留在 [archived/](archived/)。