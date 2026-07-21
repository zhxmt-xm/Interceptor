# Interceptor Handover

> 最后更新：2026-07-21
> 用途：只保留下一位开发者或下一 Session 继续工作所需的必要上下文。历史细节请按需读取 `archived/`。

## 新 Session / Agent 必读

开始任何实现前，按以下顺序阅读：

1. 本文件：确认工作树状态、已实现功能、剩余工作和精确恢复步骤。
2. **[ARCHITECTURE.md](ARCHITECTURE.md)：理解当前已经落地的进程边界、代码所有权、通信路径、安全策略和打包路径。未经阅读不要调整 Main、Preload、Core 或 Renderer 边界。**
3. 只有需要历史索引时再读 [archived/PROGRESS.md](archived/PROGRESS.md) 与最新完成 Stage [archived/M14.md](archived/M14.md)。
4. 只有需要产品设计或早期决策时再读 [archived/桌面网络调试代理完整方案.md](archived/桌面网络调试代理完整方案.md)、[archived/M1.md](archived/M1.md) 或 [archived/M0.md](archived/M0.md)。

不要只根据聊天摘要开始工作；仓库文档和当前代码是权威来源。

## 当前状态

- **M0–M14 已完成**；生产实签/公证和真实macOS runner证据因外部凭据/平台缺失待首个tag发布时补齐。
- **M14 临时 Capture 架构已完成**：Core 直接拥有内存 Capture + 内存/spill Body；RuleSet 直接持久 `rules.sqlite`；Diagnostics Worker 保留；native archive 使用一次性 Archive Worker。常驻 Storage Worker、运行时 `capture.sqlite` 和持久 blobs 已删除。
- **Transfer 简化边界**：import/export 到达 Core 后直接读取当前 Store；全屏 Loading 阻止正常 UI 操作并只保留 Cancel。无 Body lease/generation/barrier，无 Core action 门禁。
- **Stop 语义**：Stop 只暂停记录（`proxy.setRecording{false}`）——Mockttp/WebSocket listener 与系统代理保持运行、流量继续转发、已有记录保留，暂停期间新连接不落库；Start 恢复 `recording=true` 并继续追加；系统代理只在应用退出与紧急修复时恢复；Clear 才删除记录和 spill；Core 重启释放临时数据。
- **Capture 后续增强已完成**：默认进入 Capture 后等待 Core 并启动 8888 loopback Recording；系统代理由 readiness 弹层要求用户显式 Enable。HTTPS 默认 passthrough，只记录有限 Tunnel metadata，用户从 Tunnel 面板显式执行 CA/Trust/Start decrypting。first-run 代码与设计资产已删除。
- **Proxy readiness 已改为显式授权**：自动 Capture bootstrap、手动 Start 与 Core 重启均先启动 listener，再检查系统代理；未 ready 时 UI 必须是 Paused / Not recording 并弹 `Proxy not ready`，只有用户点击 Enable 且 listener+routing ready 后才显示 Recording，或进入 Settings → Proxy & Listener。失败保留有界错误，不循环静默写系统设置。
- **自有窗口 Chrome**：跨平台 `frame:false`，自有顶栏可拖拽并提供 Minimize / Maximize-or-restore / Close；Close 走窄 IPC → `app.quit()`，继续执行系统代理恢复与 Core shutdown。
- **Header V2 已一对一落地并成为唯一设计**：`design/app` 与 React Renderer 只使用 Shell V2；旧 `layout=current` / `data-layout` 分支、六组 feature `.tv` 顶栏和 Layout 切换器已删除。保留全高侧栏，右侧依次为 46px Window Header、feature 内容工作栏、主体和 30px 状态栏。Capture 使用 54px `CaptureWorkbar`，内容命令行统一 40px、图标按钮统一 30×30px/15px icon/3px gap；Detail 全白且 Request 摘要为 40px 白色均匀阴影 box；所有 workspace 共用 1px splitter + 4×40px 共轴 grip。Window Header 只保留折叠按钮、feature 名称和窗口控制，业务命令与状态分别进入内容工具栏和底栏。
- **Renderer 壳与编辑交互已简化**：`App.tsx` 直接拥有 Sidebar/Header/Main/Footer Grid，原 `AppShell` 转发层已删除；Diagnostics 仍只在当前视图通过条件 `DiagnosticsProvider` 挂载。Capture Omnibox 的 Method/Status/Host/Type/Duration 过滤可选择字段后输入并提交；Rules 可创建全部八种 matcher，并通过 More 菜单或 grip 拖放调整真实执行优先级。
- **Modal 以设计稿为准**：HAR/Archive、HTTPS Setup、Proxy readiness 保持设计内容宽度 `512/560/500px`；Ant v6 只作为交互底座，通过官方 `styles.container/body` 清除默认 content padding、应用设计边框和 `1.23` 行高，不允许反向缩窄设计稿迁就 Ant 默认值。三类 Modal 已移除弃用的 `maskClosable`，改用 `mask.closable`。
- **Renderer 轻重分层**：App 常驻 Zustand 保存当前 Core 全量轻量 summary 和视图状态；完整 header/body/WS/gRPC payload 留在 Core 按需读取。
- **15 种界面语言已完成**：默认英语；`en/zh-CN/zh-TW/ja/ko/de/fr/es/it/pt-BR/ru/nl/pl/tr/uk` 每种均有完整 659-key catalog，切换即时生效并持久化。Ant Design locale、`html lang`、`Intl` 日期/数字/字节/时长和 Main 原生 HAR/archive/Diagnostics 文件对话框同步切换；俄/波/乌 CLDR 多复数已覆盖。设计 SPA 只保留当前 Theme flyout 与 Language list，旧 Theme B/C/D、Language L2/L3 和专用截图脚本已删除。
- **M13 GitHub Releases更新已完成**：`GitHubReleaseUpdateService`只访问固定公开仓库，packaged Windows/macOS启动及每小时检查latest stable Release；Release body作为app内纯文本changelog。用户显式点击后才流式下载当前平台的MSI/DMG，完整后通过`Open installer`交给系统；不自建服务、不做Squirrel、资源热更新、静默下载或自动安装。
- **M13下载安全边界**：Main严格校验SemVer、draft/prerelease、仓库URL/tag/asset basename、平台扩展名、显式架构、1GiB上限、声明size和强制GitHub SHA-256；随机`.part`写入`<userData>/updates/downloads`、sync后原子rename。Renderer永远拿不到URL/path。
- **M13 UI/Contract**：Preload仅新增`getUpdateStatus/checkForUpdates/downloadUpdate/openDownloadedUpdate/onUpdateStatusChange`；Settings与顶部通知覆盖checking/available/downloading/downloaded/up-to-date/failed/unsupported七态，changelog不执行远程markup。
- **M12 发布加固已完成**：Desktop 0.1.0；Windows x64 per-user MSI完整lifecycle已实测；macOS ad-hoc/Developer ID/notarize与DMG+ZIP配置/原生smoke已落地；固定SHA release workflow在tag构建后发布MSI/DMG/ZIP并生成GitHub changelog。
- **Package 安全已收紧**：Renderer 使用固定 `interceptor://app`；file extra privileges 关闭；Electron 43 九项 Fuse strict 锁定；Main/Preload/Core release 0 maps；artifact audit 拒绝 source/env/test 泄漏并校验签名策略。
- **M11 系统代理与恢复已完成**：Windows WinINet 和 macOS SystemConfiguration helper、多服务/多字段精确 ownership、原子 startup journal、启动/Core failure guarded restore、Proxy Settings 与 emergency repair 均已落地。后续已删除 first-run，改由 Capture bootstrap 启动 Recording/接管代理；四项 Renderer API 仍是窄意图，不暴露 helper 路径或 snapshot。
- **M10/T10.5 三进程诊断已完成**：Core/Main/Renderer 记录经同一 Diagnostics Worker 持久化；Main 有界队列覆盖 CoreRuntime、IPC、证书/信任/TLS，Renderer 只有固定未捕获错误上报；查询/UI/JSONL 支持 process 来源并统一脱敏。
  - **Diagnostics 分析/导出（T10.4）**：`diagnostics.query` 支持 trace/command/level/outcome/duration keyset 分页；Renderer `DiagnosticsProvider` 走持久化分页并可加载更旧记录；`diagnostics.export.start` 经共享 transfer job + Main Save Dialog 原子导出 JSONL。入库和导出前双层脱敏，敏感 attributes 与 URL Query 不落盘。
  - **原生 archive（M14 当前实现）**：`ArchiveService` 导出版本化 ZIP（manifest + 兼容 `capture.sqlite` snapshot + Body）；每个导入/导出任务单独启动 `archive/host/entry.ts` + `archive/worker/entry.ts`，按100条批次读写 snapshot，完成/取消/失败即退出。不可信 ZIP 的路径/大小/hash/压缩比/CRC/内容寻址校验保持不变，失败/取消回滚隔离 Session。
  - **HAR Core**：`har/entry.ts` 直接定义 `HarService`，完成标准 HAR 1.2 导出、受限 inert JSON 导入、正文 Blob 读写、失败/取消回滚；压缩 Response 导出前按 gzip/deflate/br 解码，HAR `bodySize`/`content.size`/`compression` 保持标准语义。文件上限 256 MiB、100,000 entries、1,000 headers/entry、64 MiB/body，只接受 http/https/ws/wss。导入不执行脚本、插件或远程内容。
  - **异步 transfer job**：`har.export.start`/`har.import.start`/`transfer.job.get/cancel`；公开快照只含 basename/进度/状态/警告。Main 用系统 save/open dialog 持有真实路径，Renderer 没有文件系统 API。
  - **Capture 文件 UI**：顶栏删除无行为 Info/Settings/More，改为 Import/Export 菜单：`Import HAR` / `Export HAR` 用于跨工具交换，`Open Capture` / `Save Capture` 用于 Interceptor 全保真恢复。四种命令各自进入单一动作弹层；HAR Export 保留 all/filter/selected、Authorization/Cookie 遮罩与 strip bodies。15 种语言已同步；Export 菜单 parity 0 missing/flagged、几何差 0 px。
  - **Core 目录规范化**：业务根所有者直接位于 `entry.ts`；类型进 `interfaces/index.ts`、纯函数进 `utils/index.ts`，一文件一个 class。真实 worker bundles 现为按需 `archive/worker/entry.cjs` 与持续 `diagnostics/worker/entry.cjs`；Storage 无 host/worker 子目录。
  - **T9.1 WebSocket 捕获**：Mockttp HTTP/1.1 Upgrade，text/binary Message 按 direction/opcode/time/payloadRef 有序落 `websocket_frame`，payload 复用 Blob；101 后 Exchange 保持 open，clean close 更新 completed。
  - **T9.2 WebSocket UI/断点**：`WebSocketBridge` 接管双向消息转发并在 send 前 await BreakpointQueue，支持 edit/continue/drop；`websocket.frames` keyset 页 + Body range；Capture Messages 虚拟列表和 Breakpoints text/hex 编辑。仅 H1 Upgrade，H2 Extended CONNECT 未实现。
  - **T9.3 gRPC 基础展示**：原生 gRPC 作为 Mockttp 通用 H2 request/response 捕获；`grpc.messages` 从既有 Blob 每条只读 5B header 跳读分页，UI 显示 request/response、compressed/truncated/malformed、offset、grpc-status trailer 和 raw text/hex。无 descriptor/reflection；完成后扫描，非实时 streaming。
  - **测试架构**：Desktop tests 分为 `tests/packaged-smoke/`（真实 exe/CDP）与 `tests/visual-parity/`（完整 fake Preload + 正常 UI 交互）；业务 Renderer 无 parity fixture/DEV setter。详见 [archived/M9.md](archived/M9.md)。
- **M6 HTTP/2 已交付**：Proxy Core 在 MITM 时启用 Mockttp `http2:true`，采集 trailer/pseudo-header 并按 kind 落库；`proxy/utils/index.ts` 提供 gzip/deflate/brotli 延迟解码，`body.read-range` 由 Core 解压并回传 `decodeStatus`。**已知限制**：streamId/GOAWAY/RST/settings/背压 Mockttp 未暴露。
- **M5 CA 与 HTTPS MITM 已交付**：Main 用 `@peculiar/x509` 生成 RSA/SHA-256 Root CA、Electron `safeStorage`（DPAPI/Keychain）加密私钥存 `<userData>/certificates/`（**证书库懒加载**避免阻塞 Main/CDP 启动）；`TrustStoreService` 做 **local-machine 信任库**安装/卸载/检测（`@vscode/sudo-prompt` 提权 certutil/security）；CA 经内部 `tls.configure` 单向下发 Core，Core 用 Mockttp `getLocal({https})` 对 CONNECT 做 MITM（**仅信任且 `mitmEnabled` 开启时启用**，信任与 MITM 解耦）解密 HTTPS 复用现有捕获管线；per-host 不安全例外（`ignoreHostHttpsErrors`）；Settings/Certificates 面板接真实数据（含 reveal/view/系统证书管理器/delete 入口）。**私钥绝不进 Renderer/日志/导出。** 详见 [archived/M5.md](archived/M5.md) 后续增强。
- **M3 最小显式代理已交付**：`proxy/entry.ts` 的 `ProxyService` 基于 Mockttp loopback 显式代理，规范 Exchange 写入 `StorageService`；实时事件经 `proxy/proxy-capture-event-queue.ts` 有界合并 + 窗口背压推送。真正零内存流式正文仍是后续优化。
- **M4 会话列表 UI 已交付**：Capture 工作区数据驱动——TanStack Virtual 虚拟化列表 + Zustand 轻量 summary 状态、当前 Session 过滤、实时前插滚动补偿、feature 往返状态保持；按需 `sessions.detail` + `body.read-range` 驱动 Inspector（完整 cookies、真实 Timing、Auto/Text/JSON/Hex）。body/header 不入全局状态。
- **窄 API 已扩展**：M10新增HAR/archive/Diagnostics；M11新增系统代理意图；M13新增GitHub Release状态/检查/下载/打开已下载文件。Preload仍不暴露通用日志、helper、snapshot、URL、path/readFile/writeFile，packaged smoke apiKeys已同步。
- **Mockttp/ws 打包方案已落地并验证**：esbuild `--external:mockttp --external:ws` + `scripts/ship-core-deps.mjs` 随包发布依赖闭包；`ws` 内联会阻塞首代 UtilityProcess entry，external 后最终 package 首代 Core 正常 ready/heartbeat。
- **M13验证全绿**：286 unit tests；全typecheck；package audit；真实packaged smoke；正式MSI；两版x64 MSI lifecycle；生产audit 0；actionlint；Updates 14个parity场景0 missing。完整数字见 [archived/M13.md](archived/M13.md)。
- **多语言增强验证全绿**：293 unit tests；三 workspace typecheck；Windows package audit 1,292 files / 377,348,054 bytes；真实 packaged smoke 逐项验证 15 种语言、持久化、侧栏译文、页面无溢出与 Main language IPC 非法值拒绝；生产 audit 0。
- **Capture 后续增强验证全绿**：311 unit tests；三 workspace typecheck；Windows package；真实 packaged smoke 1/1（活动 Recording Clear 后保留 Session 壳、Exchange/Body 归零）；生产 audit 0。Payload/Cookies/Timing/Tunnel/topbar 目标场景已完成浏览器与视觉检查。
- Git：`main` 已包含 Stage 文档归档、Core/Main/Renderer 模块结构对齐、App/AppShell 合并、Capture 结构化过滤、Rules matcher/菜单/排序交互、Shell V2 唯一设计收敛，以及 packaged smoke readiness 稳定性修正和以 Ant Popover 实现为准的 Capture 文件菜单设计基线。本轮提交并 push 后应与 `origin/main` 对齐且工作树干净；没有 package、`.vite/` 或 `test-results/` 产物。新 Session 先跑 `git status --short --branch` 与 `git log -4 --oneline` 确认实际状态。
- 当前工作目录：`H:\code\Interceptor`；默认分支：`main`。若 `tsc` 报找不到 `@interceptor/core-protocol`，先跑 `npm install` 重建 workspace junction。
- 当前已验证 Windows x64 package/MSI。macOS 配置和 smoke 已实现，但 Swift helper、DMG/ZIP、Gatekeeper/staple 尚未在真实 macOS runner 执行；生产签名凭据不在仓库。

## M0、M1 与 M2 已交付

- npm workspaces、严格 TypeScript、Forge/Vite Main/Preload/Renderer 三入口。
- 安全 BrowserWindow、严格 CSP、可信 Renderer reload、窄 Preload API 和 Electron Fuses。
- 独立 UtilityProcess Proxy Core 与 CoreRuntime 生命周期、heartbeat 卡死检测、重启和关闭。
- 模块化 Ant Design v6 Renderer：App shell、六个 feature workspace、Inspector、四套时段主题（light/warm/dark/ember）+ 侧栏主题/语言切换器和扁平共享组件库。
- SVG/PNG/ICO/ICNS 应用图标及可重复生成脚本。
- Vitest 单测、真实 packaged executable 的 Playwright CDP smoke、package 与生产依赖审计流程。
- M0 详细实现、排障和验证历史已迁入 [archived/M0.md](archived/M0.md)。
- Main/Core 专用 MessagePort、TypeScript runtime schema、request correlation、timeout/cancel 和 CoreProcess restart recovery。
- Core 结构化 Command/Action Trace、有界 Ring Buffer、敏感字段脱敏和 stdout/stderr 后备。
- 窄 Renderer API：CoreProcess 状态、M1 echo 和脱敏 Trace 查询；无通用 IPC、MessagePort 或 Node 暴露。
- **M2 存储层**：`node:sqlite` + `worker_threads` 的 Capture/Diagnostics 双库、内容寻址 Blob Store、keyset 分页查询、Storage 状态/清空窄 API 与 Storage 设置面板；代码位于 `apps/proxy-core/src/proxy-core/{storage,diagnostics}/`，协议扩展在 `packages/core-protocol/src/{messages,validation}.ts`，桌面接线在 `shared/desktop-api.ts`、`preload/preload.ts`、`main/main.ts`、`main/utils/renderer-utils.ts`、`features/settings/`。详见 [archived/M2.md](archived/M2.md) 的实施记录。

## 已实现功能与代码位置

### 工程、构建与命令

| 已实现内容 | 代码或配置位置 | 说明 |
| --- | --- | --- |
| npm monorepo 与根命令 | `package.json`、`package-lock.json` | 编排 Desktop/Core build、dev、typecheck、unit、package、smoke |
| 严格 TypeScript 基线 | `tsconfig.base.json` | Desktop/Core 继承，不应为局部错误放宽全局严格性 |
| Node/npm 版本约束 | `.nvmrc`、`.npmrc`、根 `package.json` | Node 24.18.0、npm 11.16.0、精确依赖 |
| Desktop Forge/Vite 构建 | `apps/desktop/forge.config.ts`、`apps/desktop/vite.*.config.ts` | Main/Preload/Renderer 三入口、ASAR、Core extraResource、Fuses、图标 |
| Proxy Core 构建 | `apps/proxy-core/package.json`、`apps/proxy-core/tsconfig.json` | 独立 CommonJS UtilityProcess 产物 |
| Shared Core protocol | `packages/core-protocol/` | 平台中立消息类型、Command/Result mapping、严格 runtime validator 和协议测试 |

### Electron Main、安全与生命周期

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| Main 应用所有者 | `apps/desktop/src/main/main.ts` | `DesktopApplication` 集中管理安全窗口、Session/IPC 和一个 CoreRuntime |
| Main CoreRuntime | `apps/desktop/src/main/core/core-runtime.ts` | 唯一 Core 入口；拥有 CoreProcess、MessageChannel、状态、heartbeat/restart/shutdown 和 RPC client |
| Main Core RPC client | `apps/desktop/src/main/core/core-rpc-client.ts` | CoreRuntime 内部 Promise correlation、timeout/cancel、late/duplicate/disconnect 和 replacement 清理 |
| CoreRuntime 单测 | `apps/desktop/src/main/core/tests/core-runtime.test.ts` | fake CoreProcess/timer 覆盖正常、重启、listener 清理和强制停止路径 |
| Main Renderer utils | `apps/desktop/src/main/utils/renderer-utils.ts` | Renderer IPC 输入校验与 Diagnostics DTO 映射纯函数 |
| Renderer URL 白名单 | `apps/desktop/src/main/security/trusted-renderer-url.ts` | 开发精确同源、生产精确 `interceptor://app/index.html` |
| URL 安全单测 | `apps/desktop/src/main/security/tests/trusted-renderer-url.test.ts` | 可信 reload 与外部/无效 URL 拒绝 |
| GitHub Release更新服务 | `apps/desktop/src/main/updates/github-release-update-service.ts` | stable检查、changelog、平台asset选择、用户触发流式下载与打开安装器 |
| 更新服务测试 | `apps/desktop/src/main/updates/tests/github-release-update-service.test.ts` | Windows MSI/macOS DMG、哈希/截断/外域/tag/架构/目录失败/旧文件清理/开发态/轮询12项 |
| Core application | `apps/proxy-core/src/proxy-core/core-application.ts` | 子进程根对象；拥有 ready/heartbeat/shutdown/signal、RPC、Diagnostics 和后续 Storage/Proxy Service |
| Core executable entry | `apps/proxy-core/src/proxy-core/entry.cts` | 只解析 UtilityProcess parentPort 并启动 CoreApplication；bundle 为 `entry.cjs` |
| Core RPC server | `apps/proxy-core/src/proxy-core/core-rpc-server.ts` | runtime validation、request/cancel、response、connection replacement |
| Core diagnostics | `apps/proxy-core/src/proxy-core/core-diagnostics.ts` | AsyncLocalStorage Trace、Action、三重上限、脱敏和 sink fallback |

### Preload 与共享契约

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| Renderer 可见 API 类型 | `apps/desktop/src/shared/desktop-api.ts` | `CoreProcessStatus`、echo、脱敏 Trace 和窄 `InterceptorDesktopApi` |
| contextBridge 实现 | `apps/desktop/src/preload/preload.ts` | 进程状态订阅和两个意图型 RPC；无通用 IPC |
| Renderer Window 类型 | `apps/desktop/src/renderer/global.d.ts` | 声明 `window.interceptor` |
| 更新窄契约 | `apps/desktop/src/shared/desktop-api.ts`、`preload/preload.ts` | get/check/download/openDownloaded/status event；无URL/path |

### Renderer

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| React 入口 | `apps/desktop/src/renderer/main.tsx` | 加载全局样式并挂载 App |
| App shell | `apps/desktop/src/renderer/app/App.tsx`、`Sidebar.tsx` | `App.tsx` 直接拥有 Sidebar/Header/Main/Footer Grid，按 view 渲染六个 feature 的 main/statusbar；Sidebar 提供导航与主题/语言切换器 |
| App shell 布局 | `apps/desktop/src/renderer/app/App.module.css` | 46px Window Header、全高 Sidebar、Main、30px Footer 与窗口控制视觉 |
| Capture workspace | `apps/desktop/src/renderer/features/capture/` | 子组件 CaptureWorkbar/Omnibox/CaptureMain/RequestList/RequestInspector/CaptureStatusbar，各自 colocated CSS Module |
| Rules workspace | `apps/desktop/src/renderer/features/rules/` | RulesMain/RuleList/RuleEditor/RulesStatusbar；搜索/New/Apply/More 位于 RuleList 内容工具栏 |
| 其余 workspace | `apps/desktop/src/renderer/features/{composer,settings,breakpoints,diagnostics}/` | Main/Statusbar + 内容工具栏，colocated CSS Module；一对一还原 `design/app` 对应视图 |
| Updates UI | `features/settings/{updateStore.ts,update-format.ts,SettingsContent/UpdatesPanel.tsx,UpdateNotification/}` | 七态更新面板、进度、纯文本changelog与 Header 下方独立通知 |
| 共享 UI 原子 | `apps/desktop/src/renderer/components/` | 扁平库(每个组件独立子目录含 tsx+module.css)：IconButton/Button/Switch/Select/InputBox/Segmented/Checkbox/Chip/Tabs/FilterChip/Timeline/Splitter/MethodBadge/StatusBadge/SectionHeader/StatItem/Count/MenuItem/NavItem/Flyout + cx/index |
| 主题 / 语言切换器 | `apps/desktop/src/renderer/components/{ThemeSwitcher,LanguageSwitcher}/`、`renderer/i18n/` | 侧栏底部控件（取代旧 Account）；Flyout 以按钮为锚 portal 弹出、底边对齐。语言列表提供 15 种完整本地 catalog；主题四项 hover 浮现时段山水 |
| Ant Design 主题 | `apps/desktop/src/renderer/theme/theme.ts` | 四套时段主题 palette（light/warm=default、dark/ember=dark 算法）+ 全局/Button/Segmented/Splitter/Tabs/Tooltip Token |
| 全局样式 | `apps/desktop/src/renderer/styles/global.css` | reset、四套主题 `:root[data-theme]` tokens、字体和 reduced-motion |

### 图标与测试

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| 图标源与产物 | `apps/desktop/assets/interceptor-icon.{svg,png,ico,icns}` | SVG 为源；PNG/ICO/ICNS 供 Renderer/Windows/macOS 使用 |
| 图标生成脚本 | `scripts/generate-icon.ps1` | 可重复生成平台图标，修改后需人工检查所有格式 |
| Packaged smoke | `apps/desktop/tests/packaged-smoke/startup.spec.ts` | 真实 exe + CDP；覆盖 UI、安全、Core、主题、窗口尺寸和退出清理 |
| Playwright 配置 | `apps/desktop/playwright.config.ts` | 最终 package smoke 配置 |

当前高层 Workflow 图和 20 步流程表见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 最近 Core 简化

当前分支包含进入 M2 前的 Core 子进程根对象简化：

- `apps/desktop/src/main/core/`：删除 Supervisor/adapter，新增统一拥有 CoreProcess、状态、MessageChannel 和 RPC client 的 `CoreRuntime`。
- `apps/desktop/src/main/utils/`、`src/main/main.ts`：提取 Renderer 输入校验/DTO 映射，DesktopApplication 只持有一个 CoreRuntime。
- `apps/proxy-core/src/proxy-core/`：删除重复的 `CoreProcess` 类，由 `CoreApplication` 统一拥有子进程生命周期、RpcServer、Diagnostics 和业务路由；可执行入口改名为 `entry.cts`。
- `README.md` 与 `stages/`：同步新的对象所有权和高层 Workflow 文档。

接手后必须以 `git status --short` 和 `git diff` 为准复核；不要假设聊天中列出的文件清单永远完整。

## 最近验收与下一动作

本次验证：三 workspace typecheck；Desktop 115 / Proxy Core 180 / Protocol 19，共 314 项 unit tests；设计 SPA 重出 26 张 Capture 明暗主题截图，并以当前 Ant Popover 为基线同步文件菜单的锚点与内容间距。Visual parity 45 views / 330 targets / 0 missing，平均像素差 1.83%、94 个既有 flagged；Capture Export 菜单绝对偏移 `0/0`、2 个目标 0 flagged，真实 `Export → Export HAR` 命令链进入对话框且 7 个目标 0 flagged。Windows x64 package 通过；package audit 1,292 文件 / 377,399,178 bytes 全通过；真实 packaged smoke 1/1 通过；`npm audit --omit=dev` 为 0 vulnerabilities；`git diff --check` 通过。

下一动作：保持 `main` 与 `origin/main` 对齐并等待下一项产品需求。不要加入 `.vite/`、package 产物或 `test-results/`；继续保留 `apps/desktop/tests/visual-parity/parity-report.md` 作为验收资产。

提交后，首个真实 tag release 仍需仓库 Secrets 中的 Windows 签名证书、Apple Developer ID 与公证凭据；无凭据时不要放宽 tag 发布门禁。

## 剩余工作项目

### 已完成 Stage 的后续优化（非阻塞）

- M3 T3.3 真零内存流式正文：改用 Mockttp `request-body-data`/`response-body-data` 事件按 id 增量喂入 `BlobStore.writeStream`，超内存阈值 spill。
- M5 详细源站 TLS metadata（version/cipher/ALPN/证书链）记录 + Inspector TLS/Timing 标签填充；CA 导出（PEM/DER）后续。机器级信任库（sudo-prompt 提权）已完成（见 M5.md 后续增强）。
- Diagnostics 面板过滤（Level/Outcome）、脱敏 JSONL 导出、Main/Renderer 日志纳入诊断（M10 T10.4/T10.5）。

### 后续 Stage

| Stage | 状态 | 主要范围 | 产品设计入口 |
| --- | --- | --- | --- |
| M12 | 已完成（外部签名/macOS 证据待补） | MSI/DMG/ZIP、strict Fuses、artifact/installer/package smoke、release CI | 完整方案第十七/十八章、第二十七章 M12 |
| M13 | 已完成（100%，外部签名/macOS证据待补） | GitHub Release检查、app内changelog、手动下载MSI/DMG、Updates UI | 完整方案第十七章、第二十七章 M13 |
| M14 | 已完成（100%） | 临时 Capture/Body、Renderer 全量 summary、RuleSet 拆分、按需 Archive Worker | 完整方案第十二、十四章、第二十七章 M14 |

归档的 `M*.md` 不再追加日常进度；新工作更新本 Handover 与已落地架构，只有追溯历史设计时才读取对应归档文件。

## 必须保持的边界

- `UtilityProcess.parentPort` 只用于 ready、heartbeat、rpc-port transfer、shutdown 和 stopped；业务消息只能走转交后的专用 MessagePort。
- `CoreProcessStatus.running` 只表示最近收到 heartbeat，不是业务健康结论。
- Core 当前无外部接入且与 Desktop 同包发布；不要引入 Koa/WebSocket、本地监听端口、Named Pipe/UDS、Token 或跨版本协商矩阵。
- Renderer 继续只通过面向意图的 `window.interceptor` API 访问 Main。
- Main 不搬运未来请求/响应正文；正文数据路径保持在 Core/Storage。
- Protocol 字段不可直接复用 React state、Ant Design props、Electron event、Mockttp 运行时对象或数据库 row。
- 分页使用有限 metadata + opaque keyset cursor；Body 使用有限 range/chunk；大列表和完整 Body 不通过单条消息传输。
- 日志必须非阻塞、有界和脱敏；M1 不提前实现日志数据库，M2/T2.5 才引入 Diagnostics Worker 与独立 `diagnostics.sqlite`。
- Capture SQLite 与 `diagnostics.sqlite` 必须使用独立 Worker/Writer；日志失败不得阻塞或回滚 Capture 写入。
- M2 实现真实 `sessions.query`、Body range 等 handler 时，继续遵守协议上限、opaque keyset cursor 和结构化错误，不添加通用 Command 逃生口。

## 已知风险

- Forge Vite Plugin 仍是 Experimental；升级 Electron/Forge/Vite/TypeScript/Fuses 后必须重跑 package、ASAR/Fuses、smoke 和 HMR。
- UtilityProcess MessagePort 转交、Core restart 后的 port replacement 和 packaged 资源路径必须通过真实 exe smoke；修改 Main/Core 生命周期或打包路径后必须重跑，不能只依赖单元 Fake。
- 结构化日志的对象分配和 IPC 批次仍有成本；必须限制 attributes、队列记录数/字节数和低优先级采样，不能把完整 Command 或 Body 序列化为日志。
- 完整开发依赖 audit 含 Forge 工具链已知漏洞；生产依赖 audit 为零，最终 ASAR 不含相关开发包。不要运行 `npm audit fix --force`。
- Packaged Renderer使用标准安全`interceptor://app`协议，`GrantFileProtocolExtraPrivileges`已关闭；不得回退到`loadFile`或放宽导航白名单。
- Windows/macOS 生产可信签名、公证和 macOS helper/SystemConfiguration round-trip 需要仓库外凭据及原生 runner；发布 workflow 已提供验收入口。Windows unsigned MSI/package 全生命周期已验证。
- Visual parity 已作为正式测试放在 `apps/desktop/tests/visual-parity/`，通过 fake Preload + 正常 UI 交互运行；禁止把 fixture/DEV setter 放回业务 Renderer。Linux 字体差异只作诊断，Windows/macOS 为权威视觉结果。

## 最近验证状态

2026-07-13 M1 对象所有权复核后的最终验收：

- `npm run typecheck`：通过，Desktop、Proxy Core、Protocol 三个 workspace 均无错误。
- `npm run test:unit`：通过，82 tests（Desktop 21、Proxy Core 55、Core Protocol 6）；Proxy Core 覆盖 capture/blob/diagnostics store、Storage/Diagnostics Worker host（假通道）、真实 worker 线程集成和 10 万行 keyset 分页稳定性。
- `npm run package`：通过，生成 Windows x64 `Interceptor` package；`proxy-core` esbuild 多入口输出 `entry.cjs` + `storage/storage-worker.cjs` + `diagnostics/diagnostics-worker.cjs`，Forge `extraResource` 递归复制。
- `npm run test:smoke --workspace @interceptor/desktop`：通过；真实最终 exe 覆盖 Renderer 隔离、6 项窄 API、`running` CoreProcess、echo、完整 Trace、CoreProcess 强杀重启，并端到端验证存储栈——`getStorageStatus` 返回真实计数与 `databaseBytes`/`quotaBytes`（真实 Storage Worker 用 `node:sqlite` 落盘 `capture.sqlite`），`clearStorage` 正常，主题与退出清理正常。
- `npm audit --omit=dev`：通过，0 vulnerabilities（M2 未新增生产依赖，全部用 `node:sqlite`/`worker_threads` 等内置模块）。
- `git diff --check`：通过。

M2 存储层用 `node:sqlite`（Electron 43 内置 Node 24.18.0，已探测 WAL/外键/FTS5/`user_version` 均可用）配合 `worker_threads` 把同步 SQLite 移出网络事件循环；Capture 与 Diagnostics 双库/双 Worker 强隔离，日志写入失败只计数不阻塞或回滚捕获。真实 worker 集成测试 + packaged smoke 已验证 worker spawn、worker 内 `node:sqlite` 与 bundle 路径解析。

如果接手时 [archived/PROGRESS.md](archived/PROGRESS.md)、[archived/M2.md](archived/M2.md) 与本节结果不一致，以最新命令实际输出为准；归档内容只作历史参考。

## 常用恢复命令

```powershell
git status --short --branch
npm run typecheck
npm run test:unit
```

涉及 Main、Preload、IPC、Fuses、CSP 或打包边界时，在阶段收尾额外运行：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
git diff --check
```

完整命令说明见 [README.md](../README.md)。

## Handover 更新规则

- 本文件必须足够详细，使没有聊天上下文的新 Session/Agent 可以定位代码并继续任务；但诊断流水和完整验证历史放在对应 Stage 文件，避免无限增长。
- 每次 handover 必须写明：当前 Stage 和百分比、已完成任务、已实现功能及代码位置、工作树状态、剩余任务、阻塞/风险、下一条可执行任务和验证状态。
- 如果当前 Stage 已完成，必须明确标记“进入下一 Stage”，并链接下一 Stage 文件；如果未完成，必须逐项列出当前 Stage 的剩余工作。
- 每次都必须提醒接手者先阅读 [ARCHITECTURE.md](ARCHITECTURE.md)。
- 需要追溯产品设计时参考 [archived/桌面网络调试代理完整方案.md](archived/桌面网络调试代理完整方案.md)；归档 Stage 文件不再用于日常进度追加。
- 一个任务完成后更新本文件的当前状态、验证和精确下一动作；历史流水不要持续堆入接棒入口。
- 架构已落地的变化同步到 [ARCHITECTURE.md](ARCHITECTURE.md)；只有命令或环境发生变化时更新 README。