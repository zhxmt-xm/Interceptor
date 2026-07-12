# Interceptor Handover

> 最后更新：2026-07-13
> 用途：只保留下一位开发者或下一 Session 继续工作所需的必要上下文。历史细节请按需读取同目录的 `M*.md` 文件。

## 新 Session / Agent 必读

开始任何实现前，按以下顺序阅读：

1. [PROGRESS.md](PROGRESS.md)：确认当前 Stage、进度和文档索引。
2. **[ARCHITECTURE.md](ARCHITECTURE.md)：理解当前已经落地的进程边界、代码所有权、通信路径、安全策略和打包路径。未经阅读不要调整 Main、Preload、Core 或 Renderer 边界。**
3. 本文件：确认工作树状态、已实现功能、剩余工作和精确恢复步骤。
4. 当前 Stage 文件：[M2.md](M2.md)。
5. **每个 Stage 的产品详细设计都必须参考 [桌面网络调试代理完整方案.md](桌面网络调试代理完整方案.md) 中对应章节和第二十七章任务清单。Stage 文件负责实施记录，不替代产品设计。**
6. 只有需要追溯正式 IPC、结构化日志或 M0 决策时再读 [M1.md](M1.md) 或 [M0.md](M0.md)。

不要只根据聊天摘要开始工作；仓库文档和当前代码是权威来源。

## 当前状态

- **M0、M1 均已完成（100%）**；M1 正式 MessagePort IPC、Typed Command Schema、Trace 和端到端验证详情见 [M1.md](M1.md)。
- **当前 Stage 是 M2 存储层（0%，尚未开始）**；不要继续扩展 M1 echo 或用临时内存结构模拟存储。
- 下一任务是 **M2/T2.1：定义 Capture SQLite schema、只向前 migration 和 fixture 建库**。
- M1 已提交为 `b923117`。当前工作树是其后的对象所有权可读性重构，尚未提交；新 Session 必须先运行 `git status --short --branch` 和 `git log -1 --oneline`，不要 reset、checkout 或覆盖这些改动。
- 当前没有真实 Traffic Capture；UI 中 Capture、Search、Filter 和详情相关命令保持 disabled。
- 当前工作目录：`C:\code\Interceptor`；默认分支：`main`。
- 当前验证目标平台为 Windows x64；macOS 图标已生成，但 macOS package、签名和运行验证尚未执行。

## M0 与 M1 已交付

- npm workspaces、严格 TypeScript、Forge/Vite Main/Preload/Renderer 三入口。
- 安全 BrowserWindow、严格 CSP、可信 Renderer reload、窄 Preload API 和 Electron Fuses。
- 独立 UtilityProcess Proxy Core 与 CoreRuntime 生命周期、heartbeat 卡死检测、重启和关闭。
- 模块化 Ant Design v6 Renderer：App shell、Traffic workspace、Inspector、亮暗主题和共享工具控件。
- SVG/PNG/ICO/ICNS 应用图标及可重复生成脚本。
- Vitest 单测、真实 packaged executable 的 Playwright CDP smoke、package 与生产依赖审计流程。
- M0 详细实现、排障和验证历史已迁入 [M0.md](M0.md)。
- Main/Core 专用 MessagePort、TypeScript runtime schema、request correlation、timeout/cancel 和 CoreProcess restart recovery。
- Core 结构化 Command/Action Trace、有界 Ring Buffer、敏感字段脱敏和 stdout/stderr 后备。
- 窄 Renderer API：CoreProcess 状态、M1 echo 和脱敏 Trace 查询；无通用 IPC、MessagePort 或 Node 暴露。

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
| CoreProcess 生命周期 | `apps/proxy-core/src/proxy-core/core-process.ts` | ready/heartbeat/shutdown/signal 和 RPC port 注入；入口 `core-entry.cts` 只负责启动对象 |
| Core application | `apps/proxy-core/src/proxy-core/core-application.ts` | 业务总入口；拥有 RpcServer、Diagnostics 和后续 Storage/Proxy Service |
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
| App shell | `apps/desktop/src/renderer/app/App.tsx` | Toolbar、唯一 Traffic 搜索、Filter、主题、Sidebar、workspace、Status Bar |
| App shell 布局 | `apps/desktop/src/renderer/app/App.module.css` | 桌面 Grid、Toolbar/Sidebar/Status 布局和状态视觉 |
| Traffic workspace | `apps/desktop/src/renderer/features/traffic/TrafficWorkspace.tsx` | Structure/Sequence、列头、Request/Response Tabs 和空状态 |
| Traffic 样式 | `apps/desktop/src/renderer/features/traffic/TrafficWorkspace.module.css` | Splitter、列表/Inspector 密度和 Tabs 布局 |
| 共享工具控件 | `apps/desktop/src/renderer/components/tool-controls/` | 图标按钮、模式选择和本地使用规范 |
| Ant Design 主题 | `apps/desktop/src/renderer/theme/theme.ts` | 全局及 Button/Segmented/Splitter/Tabs Token |
| 全局样式 | `apps/desktop/src/renderer/styles/global.css` | reset、根颜色变量、字体和 reduced-motion |

### 图标与测试

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| 图标源与产物 | `apps/desktop/assets/interceptor-icon.{svg,png,ico,icns}` | SVG 为源；PNG/ICO/ICNS 供 Renderer/Windows/macOS 使用 |
| 图标生成脚本 | `scripts/generate-icon.ps1` | 可重复生成平台图标，修改后需人工检查所有格式 |
| Packaged smoke | `apps/desktop/tests/packaged-startup.spec.ts` | 真实 exe + CDP；覆盖 UI、安全、Core、主题、窗口尺寸和退出清理 |
| Playwright 配置 | `apps/desktop/playwright.config.ts` | 最终 package smoke 配置 |

当前高层 Workflow 图和 20 步流程表见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 当前工作树说明

M1 已提交为 `b923117`。当前工作树包含其后的对象所有权可读性重构，均属于应保留内容：

- `apps/desktop/src/main/core/`：删除 Supervisor/adapter，新增统一拥有 CoreProcess、状态、MessageChannel 和 RPC client 的 `CoreRuntime`。
- `apps/desktop/src/main/utils/`、`src/main/main.ts`：提取 Renderer 输入校验/DTO 映射，DesktopApplication 只持有一个 CoreRuntime。
- `apps/proxy-core/src/proxy-core/`：删除 Backend，新增统一拥有 RpcServer、Diagnostics 和业务路由的 `CoreApplication`。
- `README.md` 与 `stages/`：同步新的对象所有权和高层 Workflow 文档。

接手后必须以 `git status --short` 和 `git diff` 为准复核；不要假设聊天中列出的文件清单永远完整。

## 下一任务：M2/T2.1

目标：建立 Capture 持久化的第一版 SQLite schema 与只向前 migration；本任务不实现真实 HTTP Capture。

建议执行顺序：

1. 运行 `git status --short --branch`，确认并保留当前 M0 收尾改动。
2. 阅读 [M2.md](M2.md)、完整方案第十二章和当前 [ARCHITECTURE.md](ARCHITECTURE.md)，确认 Capture 与 Diagnostics 使用独立数据库/Writer。
3. 评估并精确锁定 Node 24 可用的 SQLite driver；不得在 Core 网络事件循环同步执行数据库 I/O。
4. 定义 CaptureSession、Connection、Exchange、Headers、BodyRef、WebSocketFrame、RuleHit 和 ErrorEvent schema、索引、外键与 schema version。
5. 建立只向前 migration runner 和临时目录 fixture；覆盖新建、逐版本升级、重复执行、失败回滚和未来版本拒绝。
6. T2.1 可先在 storage package/worker 边界内实现；跨进程查询必须复用 M1 protocol，不给 Renderer 暴露 SQL 或数据库路径。
7. 完成后更新 [M2.md](M2.md) 的实现、决策、验证和下一任务，再进入 T2.2 Storage Worker。

## 剩余工作项目

### M2 当前剩余任务

- T2.1 SQLite schema + migration：未开始。
- T2.2 Storage Worker：未开始，依赖 T2.1。
- T2.3 Content-addressed blob store：未开始，依赖 T2.1。
- T2.4 分页查询 API：未开始，依赖 T2.2。
- T2.5 Diagnostics Worker + 独立日志库：未开始，依赖 M1/T1.4 和 T2.1。

详细字段范围和验收标准见 [M2.md](M2.md)。产品设计依据见完整方案第十二章和第二十七章 M2。

### 后续 Stage

| Stage | 状态 | 主要范围 | 产品设计入口 |
| --- | --- | --- | --- |
| M3 | 未开始 | Mockttp 显式 HTTP/1.1 代理、CONNECT tunnel、canonical exchange、增量事件 | 完整方案第八章、第二十七章 M3 |
| M4 | 未开始 | 真实 Session 列表、虚拟化、筛选、选择联动和 Inspector 数据 | 完整方案第十四章、第二十七章 M4 |
| M5–M13 | 未开始 | CA/HTTPS、HTTP/2、规则、Composer、WebSocket/gRPC、导入导出、系统代理、发布、更新 | 完整方案对应章节和第二十七章 |

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
- `npm run test:unit`：通过，8 files / 43 tests（Desktop 21、Proxy Core 16、Core Protocol 6）。
- `npm run package`：通过，生成 Windows x64 `Interceptor` package；Core esbuild 单文件 bundle 为 27.6 KB。
- `npm run test:smoke --workspace @interceptor/desktop`：通过，1 test / 1.9s；真实最终 exe 覆盖 Renderer 隔离、四项窄 API、`running` CoreProcess 状态、echo、完整 Trace、强杀 CoreProcess 后新 PID/MessagePort RPC、主题和退出清理。
- 编辑器诊断：Protocol、Desktop、Proxy Core 源码和测试均为 0 errors。
- `npm audit --omit=dev`：通过，0 vulnerabilities。
- 文档检查：Markdown 本地链接与行锚全部有效，活动文档已同步新的对象所有权。
- `git diff --check`：通过。

M1 可读性复核删除了无生产调用的主动 health-check、业务 Health subscription、占位 EventBatchQueue 和同包场景下多余的 channel handshake；保留 heartbeat 专用于 Event Loop 卡死检测。随后对象所有权进一步收敛为 Main 的 `DesktopApplication + CoreRuntime` 与 Core 的 `CoreProcess + CoreApplication`；RPC client/server 和 Diagnostics 作为内部状态机保留。

workspace 命名与对象所有权重构通过根 typecheck、8 files / 43 tests、Core bundle、Windows package 和真实 packaged smoke；npm/lockfile 只保留 `@interceptor/desktop`、`@interceptor/proxy-core`、`@interceptor/core-protocol`。

如果接手时 [PROGRESS.md](PROGRESS.md)、[M0.md](M0.md) 与本节结果不一致，以最新命令实际输出为准，并先修正文档。

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