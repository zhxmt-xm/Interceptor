# Interceptor Handover

> 最后更新：2026-07-15
> 用途：只保留下一位开发者或下一 Session 继续工作所需的必要上下文。历史细节请按需读取同目录的 `M*.md` 文件。

## 新 Session / Agent 必读

开始任何实现前，按以下顺序阅读：

1. [PROGRESS.md](PROGRESS.md)：确认当前 Stage、进度和文档索引。
2. **[ARCHITECTURE.md](ARCHITECTURE.md)：理解当前已经落地的进程边界、代码所有权、通信路径、安全策略和打包路径。未经阅读不要调整 Main、Preload、Core 或 Renderer 边界。**
3. 本文件：确认工作树状态、已实现功能、剩余工作和精确恢复步骤。
4. 当前 Stage 文件：[M6.md](M6.md)（已完成）与下一 Stage [M7.md](M7.md)。
5. **每个 Stage 的产品详细设计都必须参考 [桌面网络调试代理完整方案.md](桌面网络调试代理完整方案.md) 中对应章节和第二十七章任务清单。Stage 文件负责实施记录，不替代产品设计。**
6. 只有需要追溯正式 IPC、结构化日志或 M0 决策时再读 [M1.md](M1.md) 或 [M0.md](M0.md)。

不要只根据聊天摘要开始工作；仓库文档和当前代码是权威来源。

## 当前状态

- **M0、M1、M2、M3、M4、M5、M6 均已完成（100%）**；各 Stage 详情见对应 `M*.md`。
- **当前 Stage 是 M7 规则引擎（进行中，Contract 完成 + Server T7.1 完成）**：规则模型（`packages/core-protocol/src/rules.ts`）+ rules.validate/replace/get 命令 + wire 校验 + 单测已交付；**T7.1 Server 已交付**——schema v2 单行 `rule_set` 表（`storage/worker/worker-schema.ts`）+ `CaptureStore.saveRuleSet/loadRuleSet` 乐观并发（`RuleRevisionConflictError`）+ host↔worker `save/load-rule-set` 链路 + `collectRuleDiagnostics` 语义校验（`validation.ts`）+ `rules.validate/get/replace` handler（`core-application.ts`，冲突→conflict）。Server 剩 T7.2–T7.7（matcher 编译、action 执行、breakpoint 状态机、Mockttp beforeRequest/beforeResponse 原子替换引擎、RuleHit 审计）与 Client(M8) 待续。架构决策见 [M7.md](M7.md)。
- **M6 HTTP/2 已交付**：Proxy Core 在 MITM 时启用 Mockttp `http2:true`（下游 h2 + 上游按 ALPN 协商 + 四组转换），采集 trailer/pseudo-header 并按 kind 落库（schema v1 已含 stream_id/kind/is_pseudo/content_encoding，无需迁移）；新增 `proxy/content-decoder.ts`（gzip/deflate/brotli 延迟解码 + 多层 + 容错），`body.read-range` 加 `decode`/`encoding` 由 Core 用 zlib 解压（浏览器 DecompressionStream 不支持 br 故必须 Core 解）并回传 `decodeStatus`；`RequestInspector` 展示 Stream ID/pseudo 高亮/trailer，`BodyView` 解码预览 + 失败提示。**已知限制**：streamId/GOAWAY/RST/settings/背压 Mockttp 未暴露（`streamId` 字段/UI 已就绪但恒 undefined），后续用原生 http2 补齐；h1→纯 h2 上游 Mockttp 返回 403（边缘罕见）。
- **M5 CA 与 HTTPS MITM 已交付**：Main 用 `@peculiar/x509` 生成 RSA/SHA-256 Root CA、Electron `safeStorage`（DPAPI/Keychain）加密私钥存 `<userData>/certificates/`（**证书库懒加载**避免阻塞 Main/CDP 启动）；`TrustStoreService` 做 **local-machine 信任库**安装/卸载/检测（`@vscode/sudo-prompt` 提权 certutil/security）；CA 经内部 `tls.configure` 单向下发 Core，Core 用 Mockttp `getLocal({https})` 对 CONNECT 做 MITM（**仅信任且 `mitmEnabled` 开启时启用**，信任与 MITM 解耦）解密 HTTPS 复用现有捕获管线；per-host 不安全例外（`ignoreHostHttpsErrors`）；Settings/Certificates 面板接真实数据（含 reveal/view/系统证书管理器/delete 入口）。**私钥绝不进 Renderer/日志/导出。** 详见 [M5.md](M5.md) 后续增强。
- **M3 最小显式代理已交付**：`proxy-service.ts` 基于 Mockttp 的 loopback 显式代理（`proxy.start/stop/status` 控制、转发 HTTP/1.1、未解密时 CONNECT 直通），规范 Exchange（含头与内容寻址正文 Blob）写入 `StorageService`；实时 Capture 事件经有界合并队列 + 窗口背压批量推送（`event-batch`/`event-ack`）。真正零内存流式正文作为 M5+ 优化项。
- **M4 会话列表 UI 已交付**：Capture 工作区数据驱动——TanStack Virtual 虚拟化列表 + Zustand 视图状态（实时事件合并 + keyset 分页查询 + 客户端分段过滤）、Omnibox 搜索/结构化过滤下推 Core、按需 `sessions.detail` + `body.read-range` 驱动的 Inspector（headers/cookies + CodeMirror 正文 + hex fallback）。body/header 不入全局状态。
- **窄 API 已扩展**：`startCapture`/`stopCapture`/`getCaptureStatus`/`querySessions`/`getExchangeDetail`/`readBody`/`onCaptureEvents`（共 13 项 window.interceptor 面）；Main 订阅 `coreRuntime.onCaptureEvents` 经 `capture:events` 广播 Renderer。smoke 的 apiKeys 断言已同步。
- **Mockttp 打包方案已落地并验证**：esbuild `--external:mockttp` + `scripts/ship-core-deps.mjs`（`@vercel/nft` 追踪运行时闭包 + 补拷 `prebuilds/`/`.node`）随包发到 `resources/proxy-core/node_modules`；packaged smoke 验证 Core 用隔离闭包 `require('mockttp')` 并 `running`。
- **验证全绿**（本次提交）：`typecheck` 三 workspace；`test:unit` 121（Desktop 36 / Proxy Core 78 / Core Protocol 7）；`build:core` 成功；`package` + `test:smoke` 真实 exe 通过（`@vscode/sudo-prompt`/`@peculiar/x509` 懒加载后 packaged CDP 正常）。
- M1 基线 `b923117`；M2–M5 `d364f51`、M6 `caa3bbb`、M7 Contract `3dc3c59` 均已推送 origin/main。本次提交纳入：**M5 CA 可用性增强**（local-machine 信任库 + sudo-prompt 提权、证书 reveal/view/管理器/delete 入口、MITM 与信任解耦、install 不自动生成、vite external 修复）、**诊断日志全组件覆盖**（DiagnosticsRecorder + rpcServer/application/proxy/storage 关键节点 + 削噪音）、**Diagnostics 面板接真实数据**，及 TraceList 滚动/升序、Button disabled hover、诊断轮询断连静默等 UI 修复。详见 [M5.md](M5.md)/[M2.md](M2.md) 后续增强、[M10.md](M10.md) T10.4/T10.5。新 Session 先跑 `git status --short --branch` 与 `git log -1 --oneline`，不要 reset/checkout/覆盖现有改动。
- 当前工作目录：`C:\code\Interceptor`；默认分支：`main`。若 `tsc` 报找不到 `@interceptor/core-protocol`，先跑 `npm install` 重建 workspace junction（仓库曾从 `H:\` 迁到 `C:\`，旧 junction 会失效）。
- 当前验证目标平台为 Windows x64；macOS 图标已生成，但 macOS package、签名和运行验证尚未执行。

## M0、M1 与 M2 已交付

- npm workspaces、严格 TypeScript、Forge/Vite Main/Preload/Renderer 三入口。
- 安全 BrowserWindow、严格 CSP、可信 Renderer reload、窄 Preload API 和 Electron Fuses。
- 独立 UtilityProcess Proxy Core 与 CoreRuntime 生命周期、heartbeat 卡死检测、重启和关闭。
- 模块化 Ant Design v6 Renderer：App shell、六个 feature workspace、Inspector、四套时段主题（light/warm/dark/ember）+ 侧栏主题/语言切换器和扁平共享组件库。
- SVG/PNG/ICO/ICNS 应用图标及可重复生成脚本。
- Vitest 单测、真实 packaged executable 的 Playwright CDP smoke、package 与生产依赖审计流程。
- M0 详细实现、排障和验证历史已迁入 [M0.md](M0.md)。
- Main/Core 专用 MessagePort、TypeScript runtime schema、request correlation、timeout/cancel 和 CoreProcess restart recovery。
- Core 结构化 Command/Action Trace、有界 Ring Buffer、敏感字段脱敏和 stdout/stderr 后备。
- 窄 Renderer API：CoreProcess 状态、M1 echo 和脱敏 Trace 查询；无通用 IPC、MessagePort 或 Node 暴露。
- **M2 存储层**：`node:sqlite` + `worker_threads` 的 Capture/Diagnostics 双库、内容寻址 Blob Store、keyset 分页查询、Storage 状态/清空窄 API 与 Storage 设置面板；代码位于 `apps/proxy-core/src/proxy-core/{storage,diagnostics}/`，协议扩展在 `packages/core-protocol/src/{messages,validation}.ts`，桌面接线在 `shared/desktop-api.ts`、`preload/preload.ts`、`main/main.ts`、`main/utils/renderer-utils.ts`、`features/settings/`。详见 [M2.md](M2.md) 的实施记录。

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
| Renderer URL 白名单 | `apps/desktop/src/main/security/trusted-renderer-url.ts` | 开发精确同源、生产精确 packaged HTML |
| URL 安全单测 | `apps/desktop/src/main/security/tests/trusted-renderer-url.test.ts` | 可信 reload 与外部/无效 URL 拒绝 |
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

### Renderer

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| React 入口 | `apps/desktop/src/renderer/main.tsx` | 加载全局样式并挂载 App |
| App shell | `apps/desktop/src/renderer/app/App.tsx`、`AppShell.tsx`、`Sidebar.tsx` | 持有 `themeMode`/`lang` state、按 view 渲染六个 feature 的 topbar/main/statusbar、Sidebar 导航 + 底部主题/语言切换器 |
| App shell 布局 | `apps/desktop/src/renderer/app/App.module.css` | 桌面 Grid、Toolbar/Sidebar/Status 布局和状态视觉 |
| Capture workspace | `apps/desktop/src/renderer/features/capture/` | 子组件 CaptureTopbar/Omnibox/CaptureMain/RequestList/RequestInspector/CaptureStatusbar，各自 colocated CSS Module |
| Rules workspace | `apps/desktop/src/renderer/features/rules/` | 子组件 RulesTopbar/RulesMain/RuleList/RuleEditor/RulesStatusbar，各自 colocated CSS Module |
| 其余 workspace | `apps/desktop/src/renderer/features/{composer,settings,breakpoints,diagnostics}/` | 各含 Topbar/Main/Statusbar，colocated CSS Module；一对一还原 `design/app` 对应视图 |
| 共享 UI 原子 | `apps/desktop/src/renderer/components/` | 扁平库(每个组件独立子目录含 tsx+module.css)：IconButton/Button/Switch/Select/InputBox/Segmented/Checkbox/Chip/Tabs/FilterChip/Timeline/Splitter/MethodBadge/StatusBadge/SectionHeader/StatItem/Count/MenuItem/Title/NavItem/Flyout + cx/index |
| 主题 / 语言切换器 | `apps/desktop/src/renderer/components/{ThemeSwitcher,LanguageSwitcher}/` | 侧栏底部控件（取代旧 Account）；Flyout 以按钮为锚 portal 弹出、底边对齐，主题四项 hover 浮现时段山水 |
| Ant Design 主题 | `apps/desktop/src/renderer/theme/theme.ts` | 四套时段主题 palette（light/warm=default、dark/ember=dark 算法）+ 全局/Button/Segmented/Splitter/Tabs/Tooltip Token |
| 全局样式 | `apps/desktop/src/renderer/styles/global.css` | reset、四套主题 `:root[data-theme]` tokens、字体和 reduced-motion |

### 图标与测试

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| 图标源与产物 | `apps/desktop/assets/interceptor-icon.{svg,png,ico,icns}` | SVG 为源；PNG/ICO/ICNS 供 Renderer/Windows/macOS 使用 |
| 图标生成脚本 | `scripts/generate-icon.ps1` | 可重复生成平台图标，修改后需人工检查所有格式 |
| Packaged smoke | `apps/desktop/tests/packaged-startup.spec.ts` | 真实 exe + CDP；覆盖 UI、安全、Core、主题、窗口尺寸和退出清理 |
| Playwright 配置 | `apps/desktop/playwright.config.ts` | 最终 package smoke 配置 |

当前高层 Workflow 图和 20 步流程表见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 最近 Core 简化

当前分支包含进入 M2 前的 Core 子进程根对象简化：

- `apps/desktop/src/main/core/`：删除 Supervisor/adapter，新增统一拥有 CoreProcess、状态、MessageChannel 和 RPC client 的 `CoreRuntime`。
- `apps/desktop/src/main/utils/`、`src/main/main.ts`：提取 Renderer 输入校验/DTO 映射，DesktopApplication 只持有一个 CoreRuntime。
- `apps/proxy-core/src/proxy-core/`：删除重复的 `CoreProcess` 类，由 `CoreApplication` 统一拥有子进程生命周期、RpcServer、Diagnostics 和业务路由；可执行入口改名为 `entry.cts`。
- `README.md` 与 `stages/`：同步新的对象所有权和高层 Workflow 文档。

接手后必须以 `git status --short` 和 `git diff` 为准复核；不要假设聊天中列出的文件清单永远完整。

## 下一任务：M7 Server T7.2（规则引擎）

M7 Contract（规则模型/命令/校验）已提交 `3dc3c59`；Server T7.1（rule_set 持久化 + rules.validate/get/replace handler）已完成。下一步从 T7.2 起：matcher-compiler（规则→匹配函数）→ action-executor（header/query）→ body/map（路径穿越防护）→ block/status/throttle/delay → breakpoint-queue 状态机 + breakpoint.resolve handler → rule-engine 接入 proxy-service `beforeRequest`/`beforeResponse`（原子替换 `this.ruleSet` 引用热切换）+ RuleHit 审计。

建议执行顺序：

1. 运行 `git status --short --branch` 与 `git log -1 --oneline` 确认工作树；阅读 [ARCHITECTURE.md](ARCHITECTURE.md)、完整方案第十一章（规则引擎）和第二十七章 M7。
2. matcher-compiler：把 RuleMatcher 编译为纯函数（method/host/path/url/query/header/status/mime，AND 语义，host/path/url 支持 exact/wildcard/regex）+ 单测。
3. action-executor + rule-engine 经 Mockttp beforeRequest/beforeResponse 热切换 ruleSet 引用；breakpoint-queue 状态机。
4. 在 [M7.md](M7.md) 按 Server/Contract/Client 记录；涉及 Core/打包边界时阶段收尾重跑 typecheck/unit/package/smoke/audit。

> 已完成：M0–M6 全量交付 + M7 Contract；CA 可用性增强、诊断全组件覆盖与 Diagnostics 面板接线（本次提交）。

## 剩余工作项目

### 已完成 Stage 的后续优化（非阻塞）

- M3 T3.3 真零内存流式正文：改用 Mockttp `request-body-data`/`response-body-data` 事件按 id 增量喂入 `BlobStore.writeStream`，超内存阈值 spill。
- M5 详细源站 TLS metadata（version/cipher/ALPN/证书链）记录 + Inspector TLS/Timing 标签填充；CA 导出（PEM/DER）后续。机器级信任库（sudo-prompt 提权）已完成（见 M5.md 后续增强）。
- Diagnostics 面板过滤（Level/Outcome）、脱敏 JSONL 导出、Main/Renderer 日志纳入诊断（M10 T10.4/T10.5）。

### 后续 Stage

| Stage | 状态 | 主要范围 | 产品设计入口 |
| --- | --- | --- | --- |
| M7 | 进行中（Contract 完成） | 规则引擎 Server：rule_set 存取、matcher/action、breakpoint、Mockttp 引擎热切换、RuleHit | 完整方案第十章、第二十七章 M7 |
| M8–M13 | 未开始 | 规则 UI/Composer、WebSocket/gRPC、导入导出与隐私、系统代理、发布、更新 | 完整方案对应章节和第二十七章 |

进入任何后续 Stage 时才扩充对应 `M*.md`；不要在当前上下文预加载全部未来阶段详情。

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
- `GrantFileProtocolExtraPrivileges` 因 packaged Renderer 使用 `loadFile` 暂时开启；迁移标准自定义协议后再评估。
- Windows/macOS 签名、安装器、系统代理、证书信任和真实捕获尚未实现。
- 快速独立 visual harness 已撤回，不要按旧会话记录恢复；阶段 UI 验收继续以 packaged smoke 截图为准，除非重新形成明确需求。

## 最近验证状态

2026-07-13 M1 对象所有权复核后的最终验收：

- `npm run typecheck`：通过，Desktop、Proxy Core、Protocol 三个 workspace 均无错误。
- `npm run test:unit`：通过，82 tests（Desktop 21、Proxy Core 55、Core Protocol 6）；Proxy Core 覆盖 capture/blob/diagnostics store、Storage/Diagnostics Worker host（假通道）、真实 worker 线程集成和 10 万行 keyset 分页稳定性。
- `npm run package`：通过，生成 Windows x64 `Interceptor` package；`proxy-core` esbuild 多入口输出 `entry.cjs` + `storage/storage-worker.cjs` + `diagnostics/diagnostics-worker.cjs`，Forge `extraResource` 递归复制。
- `npm run test:smoke --workspace @interceptor/desktop`：通过；真实最终 exe 覆盖 Renderer 隔离、6 项窄 API、`running` CoreProcess、echo、完整 Trace、CoreProcess 强杀重启，并端到端验证存储栈——`getStorageStatus` 返回真实计数与 `databaseBytes`/`quotaBytes`（真实 Storage Worker 用 `node:sqlite` 落盘 `capture.sqlite`），`clearStorage` 正常，主题与退出清理正常。
- `npm audit --omit=dev`：通过，0 vulnerabilities（M2 未新增生产依赖，全部用 `node:sqlite`/`worker_threads` 等内置模块）。
- `git diff --check`：通过。

M2 存储层用 `node:sqlite`（Electron 43 内置 Node 24.18.0，已探测 WAL/外键/FTS5/`user_version` 均可用）配合 `worker_threads` 把同步 SQLite 移出网络事件循环；Capture 与 Diagnostics 双库/双 Worker 强隔离，日志写入失败只计数不阻塞或回滚捕获。真实 worker 集成测试 + packaged smoke 已验证 worker spawn、worker 内 `node:sqlite` 与 bundle 路径解析。

如果接手时 [PROGRESS.md](PROGRESS.md)、[M2.md](M2.md) 与本节结果不一致，以最新命令实际输出为准，并先修正文档。

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
- 每个 Stage 都必须提醒接手者参考 [桌面网络调试代理完整方案.md](桌面网络调试代理完整方案.md) 中对应的产品详细设计。
- 一个任务完成后，把实施、决策和验证细节写入对应 `stages/M*.md`，然后更新本文件；不要把历史全部堆入 `PROGRESS.md`。
- 架构已落地的变化同步到 [ARCHITECTURE.md](ARCHITECTURE.md)；只有命令或环境发生变化时更新 README。