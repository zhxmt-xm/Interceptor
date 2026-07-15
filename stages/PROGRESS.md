# Interceptor 项目进度

> 最后更新：2026-07-15
> 本文件只保存当前状态和 Stage 索引。实施、诊断和验证详情放在 `stages/M*.md`，避免默认上下文持续膨胀。
## 文档导航

- [HANDOVER.md](HANDOVER.md)：新 Session/Agent 的当前接棒入口，包含工作树、代码位置、剩余任务和恢复命令。
- [ARCHITECTURE.md](ARCHITECTURE.md)：当前已实现代码的架构图、进程边界、通信、安全和打包路径。
- [Stage 文档目录](./)：每个 Stage 独立的实施、决策、风险和验证记录。
- [桌面网络调试代理完整方案.md](桌面网络调试代理完整方案.md)：所有 Stage 的产品详细设计和完整任务清单。
- [README.md](../README.md)：环境、开发、调试、测试、打包和审计命令。

新 Session 默认先读本文件、`HANDOVER.md` 和 `ARCHITECTURE.md`，然后只按当前任务读取对应 Stage 文件。每个 Stage 开始前必须阅读完整方案中的对应产品设计章节。

## 当前快照

- 产品：跨平台桌面 HTTP 网络调试代理。
- 总体状态：进行中。
- 已完成 Stage：M0 项目脚手架与工具链、M1 IPC 通信基座、M2 存储层、M3 最小显式代理（HTTP/1.1）、M4 会话列表 UI、M5 CA 与 HTTPS MITM、M6 HTTP/2（均 100%）。
- 当前 Stage：M7 规则引擎（进行中，Contract 规则模型/协议/校验已完成）。
- 当前任务：M6 已收官。Proxy Core 在 MITM 时启用 Mockttp `http2:true`（下游 h2 + 上游按 ALPN 协商 + 四组转换），采集 trailer/pseudo-header 并按 kind 落库；新增 `content-decoder`（gzip/deflate/brotli 延迟解码），`body.read-range` 支持 `decode`/`encoding` 由 Core 解压（浏览器 DecompressionStream 不支持 br 故必须 Core 解），回传 `decodeStatus`；Inspector 展示 Stream ID/pseudo 高亮/trailer，BodyView 解码预览 + 失败提示。streamId/GOAWAY/RST/背压 Mockttp 未暴露，列为后续原生 http2 增强；h1→纯 h2 上游为 Mockttp 边缘（403）已记限制。
- 下一动作：M7 Server——SQLite rule_set 存取 + rules.validate/replace/get handler + matcher 编译 + action 执行 + breakpoint 状态机 + Mockttp beforeRequest/beforeResponse 引擎（原子替换）+ RuleHit 审计。
- 打包方案已落地：Mockttp 含 WASM（brotli-wasm）与原生插件（tls-impersonate 的 .node），esbuild 以 `--external:mockttp` 保留 require，`scripts/ship-core-deps.mjs` 用 `@vercel/nft` + 原生 prebuilds 补拷把依赖闭包随包发（`resources/proxy-core/node_modules`）；packaged smoke 验证 Core 用隔离闭包成功加载 mockttp，`npm audit --omit=dev` 0 漏洞。
- Git 状态：M1 `b923117`、M2–M5 `d364f51`、M6 `caa3bbb`、M7 Contract `3dc3c59` 均已推送 origin/main。本次提交纳入：M5 CA 可用性增强（local-machine 信任库 + sudo-prompt 提权、证书 reveal/view/管理器/delete 入口、MITM 与信任解耦、install 不自动生成）、诊断日志全组件覆盖与 Diagnostics 面板接真实数据，及若干 UI 修复；详见 M5.md/M2.md 后续增强与 M10.md T10.4/T10.5。
- 阻塞：无。

详细接棒说明见 [HANDOVER.md](HANDOVER.md)，当前任务边界见 [M6.md](M6.md)（下一 Stage 见 [M7.md](M7.md)）。

## Stage 总览

| Stage | 名称 | 状态 | 进度 | 详情 |
| --- | --- | --- | ---: | --- |
| M0 | 项目脚手架与工具链 | 已完成 | 100% | [M0.md](M0.md) |
| M1 | IPC 通信基座 | 已完成 | 100% | [M1.md](M1.md) |
| M2 | 存储层 | 已完成 | 100% | [M2.md](M2.md) |
| M3 | 最小显式代理（HTTP/1.1） | 已完成 | 100% | [M3.md](M3.md) |
| M4 | 会话列表 UI | 已完成 | 100% | [M4.md](M4.md) |
| M5 | CA 与 HTTPS MITM | 已完成 | 100% | [M5.md](M5.md) |
| M6 | HTTP/2 | 已完成 | 100% | [M6.md](M6.md) |
| M7 | 规则引擎 | 进行中 | 25% | [M7.md](M7.md) |
| M8 | 规则 UI 与 Composer | 未开始 | 0% | [M8.md](M8.md) |
| M9 | WebSocket 与 gRPC | 未开始 | 0% | [M9.md](M9.md) |
| M10 | 导入导出与隐私 | 未开始 | 0% | [M10.md](M10.md) |
| M11 | 系统代理适配与恢复 | 未开始 | 0% | [M11.md](M11.md) |
| M12 | 打包发布加固 | 未开始 | 0% | [M12.md](M12.md) |
| M13 | 更新机制 | 未开始 | 0% | [M13.md](M13.md) |

## Client / Server 轨道规则

- 从 M2 起，每个 Stage 文件分别记录 `Server`、`Contract`、`Client` 状态。`Server` 包含 Proxy Core、Storage、Electron Main 和 Native Helper；`Contract` 包含 Protocol、IPC/Preload、事件及跨进程集成；`Client` 包含 Renderer、交互和 `design/app` 一对一视觉验收。
- 三条轨道各自维护状态和百分比；按归属该轨道的本 Stage 显式任务/验收项计算。标记为“后续 Stage”“依赖前序 Stage”或“不适用”的轨道使用 `—`，不伪造进度。
- Stage 总进度按该 Stage 的显式任务计算；轨道标记为“后续 Stage”或“不适用”时，不计作本 Stage 未完成。
- Client 随可用的 Server/Contract 能力分步落地，不显示伪造数据，不提前启用无后端能力的控件。
- M2/T2.0 先迁移 M0/M1 现有 UI 基线；M4、M5、M6、M8–M11、M13 再增量实现各自功能视图，M12 对全部已实现视图做 packaged 视觉验收。

## 当前已实现边界

- Electron Main、Preload、React Renderer 和独立 Proxy Core UtilityProcess 已建立。
- Renderer sandbox、context isolation、无 Node integration、严格 CSP、可信导航、权限/弹窗/下载/webview 拒绝和安全 Fuses 已落地。
- Preload 仅暴露 CoreProcess 状态、M1 echo 和脱敏 Trace 等意图型 API；Renderer 不直接访问 Electron、Node、MessagePort、文件系统或 Core。
- CoreRuntime 是 Main 唯一的 Core 入口，集中拥有 CoreProcess、RPC client、ready/heartbeat 卡死检测、退避重启、优雅停止和强制清理；`running` 只代表 CoreProcess Event Loop 可响应。
- Main/Core 正式业务通信使用 CoreRuntime 每次启动 CoreProcess 时转交的专用 MessagePort；Typed RPC Schema、运行时校验、correlation、timeout/cancel 和 restart recovery 已实现。
- Core 结构化 Command/Action Trace、`AsyncLocalStorage`、有界 Ring Buffer、脱敏和 stdout/stderr 后备已实现；日志数据库留在 M2。
- Renderer 通过窄 API 可读取 CoreProcess 状态、执行 M1 echo 和查询脱敏 Trace；无通用 IPC 或 MessagePort 暴露。
- Ant Design v6 应用壳、六个 feature 视图（Capture/Rules/Composer/Breakpoints/Diagnostics/Settings）、四套时段主题（light/warm/dark/ember）与侧栏主题/语言切换器、扁平共享组件库和平台应用图标已落地。
- 存储层已落地：`node:sqlite` + `worker_threads` 的 Capture（`capture.sqlite`，八张核心实体表 + FTS5 + 只向前迁移）与 Diagnostics（`diagnostics.sqlite`，保留 + 丢弃计数 + 分页）双库、独占连接的 Storage/Diagnostics Worker、内容寻址 Blob Store（流式 + 去重 + 配额 + crash-safe GC）、keyset opaque cursor 分页查询，以及 Storage 状态/清空窄 API 与 Storage 设置面板。数据目录由 Main 经 `--data-dir` 注入 Core。
- HTTP/1.1 显式代理已落地（M3）：基于 Mockttp 的 loopback 显式代理经 `proxy.start/stop/status` 控制，转发 HTTP/1.1、未解密时 CONNECT 直通；规范 Exchange（含请求/响应头与内容寻址正文 Blob）写入 Storage。实时 Capture 事件经 Core 内有界合并队列 + 窗口背压批量推送（`event-batch`/`event-ack`），Main 订阅后经 `capture:events` 广播 Renderer。
- 会话列表 UI 已落地（M4）：Capture 工作区数据驱动——TanStack Virtual 固定行高虚拟化列表 + Zustand 视图状态（实时事件按 id 合并/前插、keyset 分页查询、客户端协议分段过滤），Omnibox 关键字搜索与 method/status/host 结构化过滤下推 Core `sessions.query`，录制开关经 `proxy.start/stop`；Inspector 选中行按需 `sessions.detail` 拉取头部/正文引用，正文经 `body.read-range` 分块用 CodeMirror（JSON 高亮）或 hex fallback 预览（256KB 上限）。body/header 不进入全局状态。
- HTTPS MITM 与 CA 已落地（M5）：Main 用 `@peculiar/x509` 生成 RSA/SHA-256 Root CA、Electron `safeStorage` 加密私钥（懒加载证书库）；`TrustStoreService` 做 local-machine 信任库安装/卸载/检测（sudo-prompt 提权 certutil/security）；CA 经内部 `tls.configure` 单向下发 Core，Core 用 Mockttp MITM 解密 HTTPS（仅信任且 mitmEnabled 开启时启用，信任与 MITM 解耦）并复用现有捕获管线；per-host 不安全例外、Settings/Certificates 面板接真实数据（含 reveal/view/系统证书管理器/delete 入口）。私钥绝不进 Renderer。详见 M5.md 后续增强。
- Vitest、Forge package、真实 packaged executable 的 Playwright CDP smoke（含存储全链路 + 窄 API 面）和生产依赖审计链已建立。
- HTTP/2 已落地（M6）：MITM 时 Mockttp `http2:true` 下游 h2 + 上游 ALPN 协商 + 四组转换；trailer/pseudo-header 采集落库；`content-decoder`（gzip/deflate/brotli 延迟解码）经 `body.read-range` 的 `decode` 请求由 Core 解压（浏览器不支持 br 故必须 Core 解）；Inspector 展示 Stream ID/pseudo 高亮/trailer，BodyView 解码预览。streamId/GOAWAY/RST/背压 Mockttp 未暴露，列为后续原生 http2 增强。
- 诊断可观测性增强（2026-07）：Core 各组件（rpcServer/application/proxy/storage）经共享 `DiagnosticsRecorder` 记 initialize/生命周期/action/error 关键节点（削去每命令模板 phase 噪音）；Diagnostics 面板经 `getRecentDiagnostics` 轮询接真实命令 trace（按 requestId 聚合 + action 时间线 + records/dropped）。Main/Renderer 日志纳入诊断见 M10 T10.5。
- 规则、系统代理、导入导出均未实现（M7 起接入）。

当前代码架构的权威说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 当前验证摘要

M0 历史验收已覆盖：

- `npm run typecheck`；
- `npm run test:unit`；
- `npm run package`；
- `npm run test:smoke --workspace @interceptor/desktop`；
- `npm audit --omit=dev`；
- `git diff --check`；
- Dev 冷启动、Renderer HMR、ASAR/CSP/Fuses 和进程清理。

2026-07-13 M1 阶段完成后进行了可读性复核：删除重复的主动 health-check、业务 Health subscription、占位 EventBatchQueue 和 channel handshake；Main 收敛为 `DesktopApplication / CoreRuntime`，Core 子进程收敛为单一 `CoreApplication`，RPC client/server 与 Diagnostics 保留为内部状态机。最新简化通过根 typecheck、8 files / 44 tests、Windows package、真实 packaged smoke 和文档检查；生产依赖未变化，详情见 [M1.md](M1.md)。

2026-07-14 M2 存储层完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` 82 passed（Desktop 21、Proxy Core 55、Core Protocol 6），含 capture/blob/diagnostics store、worker host 假通道、真实 worker 线程集成和 10 万行分页稳定性；`npm run package` + `npm run test:smoke` 真实 exe 通过并端到端验证存储栈（真实 Storage Worker 用 `node:sqlite` 落盘 `capture.sqlite`，`getStorageStatus`/`clearStorage` 正常，`window.interceptor` 仅 6 个意图 API）；`npm audit --omit=dev` 0 vulnerabilities（未新增生产依赖）；`git diff --check` 干净。详情见 [M2.md](M2.md)。

M6 HTTP/2 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` 120 passed（Desktop 36、Proxy Core 78、Core Protocol 6），含 content-decoder（gzip/deflate/brotli/多层/容错）、H2 端到端集成（h2↔h2 含 trailer/pseudo、h2→h1）、body.read-range gzip 解码；`npm run build --workspace @interceptor/proxy-core` 通过；`npm run test:smoke` 真实 exe 通过。详情见 [M6.md](M6.md)。

2026-07-16 CA 增强 + 诊断全组件覆盖 + Diagnostics 面板接线后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` 121 passed（Desktop 36 / Proxy Core 78 / Core Protocol 7）；`npm run package` + `npm run test:smoke` 真实 exe 通过——`@vscode/sudo-prompt`/`@peculiar/x509` 懒加载后 packaged CDP 与 Preload 面正常，echo trace 精简为 action.completed/command.completed。详见 [M5.md](M5.md)/[M2.md](M2.md) 后续增强。

## 更新规则

1. 本文件只更新当前快照、Stage 状态/进度、下一动作和详情链接，不写长篇实现历史。
2. 每个 Stage 使用独立 `M*.md`；开始后在对应文件记录范围、任务状态、实施、决策、风险、验证和剩余工作。
3. 每个 Stage 的产品详细设计以 [桌面网络调试代理完整方案.md](桌面网络调试代理完整方案.md) 对应章节为准；Stage 文件不替代方案。
4. 每次 handover 更新 [HANDOVER.md](HANDOVER.md)，必须包含当前状态、已实现功能和代码位置、工作树、剩余工作、验证和下一步。
5. 已落地的进程、模块、通信、安全或打包架构变化更新 [ARCHITECTURE.md](ARCHITECTURE.md)；计划能力未实现前不进入当前架构图。
6. Stage 完成时集中同步本文件、对应 Stage 文件、Handover、Architecture 和 README 命令，然后执行阶段级完整验证。
