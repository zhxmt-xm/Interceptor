# Interceptor Handover

> 最后更新：2026-07-12
> 用途：只保留下一位开发者或下一 Session 继续工作所需的必要上下文。历史细节请按需读取同目录的 `M*.md` 文件。

## 新 Session / Agent 必读

开始任何实现前，按以下顺序阅读：

1. [PROGRESS.md](PROGRESS.md)：确认当前 Stage、进度和文档索引。
2. **[ARCHITECTURE.md](ARCHITECTURE.md)：理解当前已经落地的进程边界、代码所有权、通信路径、安全策略和打包路径。未经阅读不要调整 Main、Preload、Core 或 Renderer 边界。**
3. 本文件：确认工作树状态、已实现功能、剩余工作和精确恢复步骤。
4. 当前 Stage 文件：[M1.md](M1.md)。
5. **每个 Stage 的产品详细设计都必须参考 [桌面网络调试代理完整方案.md](桌面网络调试代理完整方案.md) 中对应章节和第二十七章任务清单。Stage 文件负责实施记录，不替代产品设计。**
6. 只有需要追溯 M0 决策、排障或验证时再读 [M0.md](M0.md)。

不要只根据聊天摘要开始工作；仓库文档和当前代码是权威来源。

## 当前状态

- **M0 已完成（100%）**，不再继续增加 M0 范围；详细记录见 [M0.md](M0.md)。
- **下一 Stage 是 M1 IPC 通信基座（0%，尚未开始）**；当前必须进入 M1，而不是继续扩展 UI 占位或临时生命周期消息。
- 下一任务是 **M1/T1.1：定义版本化 Protobuf schema、建立协议 workspace 并生成 TypeScript 类型**。
- M0 安全、Renderer、图标、smoke 和文档收尾已纳入 M0 收尾提交。新 Session 必须先运行 `git status --short --branch` 和 `git log -1 --oneline`，以实际 HEAD 和工作树为准；不要 reset、checkout 或覆盖接手时存在的改动。
- 当前没有真实 Traffic Capture；UI 中 Capture、Search、Filter 和详情相关命令保持 disabled。
- 当前工作目录：`C:\code\Interceptor`；默认分支：`main`。
- 当前验证目标平台为 Windows x64；macOS 图标已生成，但 macOS package、签名和运行验证尚未执行。

## M0 已交付

- npm workspaces、严格 TypeScript、Forge/Vite Main/Preload/Renderer 三入口。
- 安全 BrowserWindow、严格 CSP、可信 Renderer reload、窄 Preload API 和 Electron Fuses。
- 独立 UtilityProcess Proxy Core 与 Supervisor 生命周期、health、heartbeat、重启和关闭。
- 模块化 Ant Design v6 Renderer：App shell、Traffic workspace、Inspector、亮暗主题和共享工具控件。
- SVG/PNG/ICO/ICNS 应用图标及可重复生成脚本。
- Vitest 单测、真实 packaged executable 的 Playwright CDP smoke、package 与生产依赖审计流程。
- M0 详细实现、排障和验证历史已迁入 [M0.md](M0.md)。

## 已实现功能与代码位置

### 工程、构建与命令

| 已实现内容 | 代码或配置位置 | 说明 |
| --- | --- | --- |
| npm monorepo 与根命令 | `package.json`、`package-lock.json` | 编排 Desktop/Core build、dev、typecheck、unit、package、smoke |
| 严格 TypeScript 基线 | `tsconfig.base.json` | Desktop/Core 继承，不应为局部错误放宽全局严格性 |
| Node/npm 版本约束 | `.nvmrc`、`.npmrc`、根 `package.json` | Node 24.18.0、npm 11.16.0、精确依赖 |
| Desktop Forge/Vite 构建 | `apps/desktop/forge.config.ts`、`apps/desktop/vite.*.config.ts` | Main/Preload/Renderer 三入口、ASAR、Core extraResource、Fuses、图标 |
| Proxy Core 构建 | `apps/proxy-core-node/package.json`、`apps/proxy-core-node/tsconfig.json` | 独立 CommonJS UtilityProcess 产物 |

### Electron Main、安全与生命周期

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| 应用启动/关闭和 BrowserWindow | `apps/desktop/src/main/main.ts` | 创建安全窗口、配置 Session/IPC、启动和停止 CoreSupervisor |
| Core 生命周期监督 | `apps/desktop/src/main/core/core-supervisor.ts` | ready/heartbeat/health、失联检测、退避重启、优雅停止和 kill 兜底 |
| Electron UtilityProcess 适配 | `apps/desktop/src/main/core/electron-core-process.ts` | 开发/生产 Core 路径、日志转发、parentPort 适配 |
| Core 生命周期单测 | `apps/desktop/src/main/core/core-supervisor.test.ts` | fake process/timer 覆盖正常、重启和强制停止路径 |
| Renderer URL 白名单 | `apps/desktop/src/main/security/trusted-renderer-url.ts` | 开发精确同源、生产精确 packaged HTML |
| URL 安全单测 | `apps/desktop/src/main/security/trusted-renderer-url.test.ts` | 可信 reload 与外部/无效 URL 拒绝 |
| M0 Core 进程 | `apps/proxy-core-node/src/proxy-core/index.cts` | 只实现生命周期；不得加入正式业务协议 |

### Preload 与共享契约

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| Renderer 可见 API 类型 | `apps/desktop/src/shared/desktop-api.ts` | `CoreStatus` 和窄 `InterceptorDesktopApi` |
| contextBridge 实现 | `apps/desktop/src/preload/preload.ts` | 仅状态查询与订阅，无通用 IPC |
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

完整的职责关系和 Mermaid 图见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 当前工作树说明

以下是当前 M0 收尾改动类别，均属于应保留内容：

- `stages/PROGRESS.md`、`README.md`：进度索引和命令手册更新。
- `stages/ARCHITECTURE.md`、`stages/HANDOVER.md`、`stages/M*.md`：集中式 Stage 文档分层。
- `AGENTS.md`：Ant Design 优先级、Renderer 所有权、验证/文档节奏。
- `apps/desktop/forge.config.ts`：官方 checksum 下载校验和平台图标接入。
- `apps/desktop/src/main/main.ts`、`src/main/security/`：可信 Renderer reload 和窗口图标。
- 删除旧 `src/renderer/app.tsx`、`styles.css`，以模块化 `app/`、`features/`、`components/`、`theme/`、`styles/` 取代。
- `apps/desktop/assets/`、`scripts/generate-icon.ps1`：图标管线。
- `apps/desktop/tests/packaged-startup.spec.ts`：更新后的亮暗主题与窗口 smoke。

接手后必须以 `git status --short` 和 `git diff` 为准复核；不要假设聊天中列出的文件清单永远完整。

## 下一任务：M1/T1.1

目标：建立产品自有、版本化、可生成的协议模型；本任务不实现 Named Pipe/UDS transport。

建议执行顺序：

1. 运行 `git status --short --branch`，确认并保留当前 M0 收尾改动。
2. Review M0 收尾 diff；如需提交，创建独立 M0 polish/docs 提交，不包含 `.vite`、`dist`、`out`、Playwright 报告或截图。
3. 创建 `packages/protocol` npm workspace，选择与当前 TypeScript/Node 工具链兼容的 Protobuf compiler/runtime，并精确锁定版本。
4. 定义 package/version、handshake、protocol negotiation、command/response correlation、batch event、paged query、body range、rule lifecycle 和 health schema。
5. 建立可重复的生成脚本，生成 TypeScript 类型；生成结果和 schema 的提交策略必须明确。
6. 添加代表性 round-trip、未知字段兼容、无效消息和不兼容版本测试。
7. 让 Desktop 与 Proxy Core 只引用协议 package 的生成类型，不能反向依赖 Renderer 或 Electron 类型。
8. 更新 [M1.md](M1.md) 的进度和验证；T1.1 完成后才进入 T1.2 transport/auth。

## 剩余工作项目

### M1 当前剩余任务

- T1.1 Protobuf schema：未开始。
- T1.2 Windows Named Pipe / macOS UDS + 长度前缀分帧 + 启动随机 token 认证：未开始，依赖 T1.1。
- T1.3 correlation、批量事件、有界队列和背压：未开始，依赖 T1.2。
- T1.4 Renderer → Preload → Main → Core echo command 与 subscription event：未开始，依赖 T1.3。

详细字段范围、兼容约束和验收标准见 [M1.md](M1.md)。产品设计依据见完整方案第十三章。

### 后续 Stage

| Stage | 状态 | 主要范围 | 产品设计入口 |
| --- | --- | --- | --- |
| M2 | 未开始 | SQLite WAL、migration、Storage Worker、Blob Store、查询/保留策略 | 完整方案第十二章、第二十七章 M2 |
| M3 | 未开始 | Mockttp 显式 HTTP/1.1 代理、CONNECT tunnel、canonical exchange、增量事件 | 完整方案第八章、第二十七章 M3 |
| M4 | 未开始 | 真实 Session 列表、虚拟化、筛选、选择联动和 Inspector 数据 | 完整方案第十四章、第二十七章 M4 |
| M5–M13 | 未开始 | CA/HTTPS、HTTP/2、规则、Composer、WebSocket/gRPC、导入导出、系统代理、发布、更新 | 完整方案对应章节和第二十七章 |

进入任何后续 Stage 时才扩充对应 `M*.md`；不要在当前上下文预加载全部未来阶段详情。

## 必须保持的边界

- M0 `UtilityProcess.parentPort` 只用于 ready、heartbeat、health、shutdown 和 stopped；不要演化为持久业务协议。
- M1 正式 transport 为 Windows Named Pipe / macOS UDS，不使用普通 localhost TCP。
- 每次启动使用随机认证 token；transport、认证和文件权限属于 T1.2，不提前塞进 T1.1。
- Renderer 继续只通过面向意图的 `window.interceptor` API 访问 Main。
- Main 不搬运未来请求/响应正文；正文数据路径保持在 Core/Storage。
- 协议字段不可直接复用 React state、Ant Design props、Electron event 或 Mockttp 运行时对象。
- Schema 必须显式版本化，枚举零值、字段保留、未知字段和兼容策略需要测试。

## 已知风险

- Forge Vite Plugin 仍是 Experimental；升级 Electron/Forge/Vite/TypeScript/Fuses 后必须重跑 package、ASAR/Fuses、smoke 和 HMR。
- 完整开发依赖 audit 含 Forge 工具链已知漏洞；生产依赖 audit 为零，最终 ASAR 不含相关开发包。不要运行 `npm audit fix --force`。
- `GrantFileProtocolExtraPrivileges` 因 packaged Renderer 使用 `loadFile` 暂时开启；迁移标准自定义协议后再评估。
- Windows/macOS 签名、安装器、系统代理、证书信任和真实捕获尚未实现。
- 快速独立 visual harness 已撤回，不要按旧会话记录恢复；阶段 UI 验收继续以 packaged smoke 截图为准，除非重新形成明确需求。

## 最近验证状态

2026-07-12 M0 最终收尾回归：

- `npm run typecheck`：通过，Desktop 与 Proxy Core 均无错误。
- `npm run test:unit`：通过，2 files / 5 tests。
- `npm run package`：通过，生成 Windows x64 `Interceptor` package；仅有 Forge Vite `inlineDynamicImports` 弃用警告。
- `npm run test:smoke --workspace @interceptor/desktop`：通过，1 test / 1.5s；真实最终 exe 的 UI、安全、Core、主题、截图和清理断言通过。
- 最终截图人工检查：亮色 1280×800、暗色 1280×800、暗色 900×600 均无重叠、截断或水平溢出。
- `npm audit --omit=dev`：通过，0 vulnerabilities。
- 文档检查：四个入口仅存在于 `stages/`；20 份 Markdown 本地链接全部有效。
- M0 原始进度迁移：Local History 快照 490 行，`M0.md` 存档 490 行，规范化逐行文本差异为 0。
- `git diff --check`：通过。

Smoke 首轮曾卡在主题切换：Ant Design Segmented 的 icon-only radio 名称退化为 `sun/moon`，且原生 input 位于可视区域外。共享控件已用官方 option `label` slot 提供 visually-hidden 文本并隐藏 icon 的辅助语义；测试通过语义 radio 定位后点击其可见 label。不要改回匹配图标名或直接点击隐藏 input。

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