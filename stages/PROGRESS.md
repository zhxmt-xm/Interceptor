# Interceptor 项目进度

> 最后更新：2026-07-18
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
- 已完成 Stage：M0–M13（生产实签/公证和真实macOS runner为外部发布验收）。
- 当前工作：M13 后续 Capture/HTTPS 交互与 Recording 生命周期增强已完成；详见 [M4.md](M4.md)、[M5.md](M5.md) 和 [M11.md](M11.md) 的 2026-07-18 后续增强。
- 当前结果：应用默认启动 8888 Recording 和系统代理、默认 HTTPS 直通；用户可从 Tunnel 面板显式完成 HTTPS setup。Clear/Stop 真清理、当前 Session 隔离、列表/Inspector 状态保持、Cookies/Timing/Payload 四模式与工具栏布局已落地。
- 下一动作：先提交并推送本次 Capture 增强，再开始临时 Capture Session 与轻重数据分层阶段；首个真实 tag release 仍待仓库外签名/公证凭据。
- 打包方案已落地：Mockttp 与 `ws` 均 external 保留 require，`scripts/ship-core-deps.mjs` 用 `@vercel/nft` + 原生 prebuilds 补拷依赖闭包到 `resources/proxy-core/node_modules`；最终 Windows package/smoke 已验证首代 Core、重启和 Storage。
- Git 状态：M0–M13 与 15 种语言增强已在 `origin/main`；Capture 后续增强在当前边界提交，接手时以 `git status`/`git log` 为准。
- 阻塞：无代码阻塞。生产签名/公证需要仓库外凭据；真实macOS DMG与应用内打开需原生runner留证。

详细接棒说明见 [HANDOVER.md](HANDOVER.md)，最新完成阶段见 [M13.md](M13.md)。

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
| M7 | 规则引擎 | 已完成 | 100% | [M7.md](M7.md) |
| M8 | 规则 UI 与 Composer | 已完成 | 100% | [M8.md](M8.md) |
| M9 | WebSocket 与 gRPC | 已完成 | 100% | [M9.md](M9.md) |
| M10 | 导入导出与隐私 | 已完成 | 100% | [M10.md](M10.md) |
| M11 | 系统代理适配与恢复 | 已完成 | 100% | [M11.md](M11.md) |
| M12 | 打包发布加固 | 已完成（外部签名/macOS 验收待凭据） | 100% | [M12.md](M12.md) |
| M13 | GitHub Releases 更新通知与手动下载 | 已完成（外部签名/macOS证据待补） | 100% | [M13.md](M13.md) |

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
- Ant Design v6 应用壳、六个 feature 视图（Capture/Rules/Composer/Breakpoints/Diagnostics/Settings）、四套时段主题（light/warm/dark/ember）、15 种完整界面语言与侧栏主题/语言切换器、扁平共享组件库和平台应用图标已落地。默认英语；语言即时切换并持久化，同步 Ant Design locale、文档 `lang`、区域格式与 Main 原生文件对话框。
- 存储层已落地：`node:sqlite` + `worker_threads` 的 Capture（`capture.sqlite`，八张核心实体表 + FTS5 + 只向前迁移）与 Diagnostics（`diagnostics.sqlite`，保留 + 丢弃计数 + 分页）双库、独占连接的 Storage/Diagnostics Worker、内容寻址 Blob Store（流式 + 去重 + 配额 + crash-safe GC）、keyset opaque cursor 分页查询，以及 Storage 状态/清空窄 API 与 Storage 设置面板。数据目录由 Main 经 `--data-dir` 注入 Core。
- HTTP/1.1 显式代理已落地（M3）：基于 Mockttp 的 loopback 显式代理经 `proxy.start/stop/status` 控制，转发 HTTP/1.1、未解密时 CONNECT 直通；规范 Exchange（含请求/响应头与内容寻址正文 Blob）写入 Storage。实时 Capture 事件经 Core 内有界合并队列 + 窗口背压批量推送（`event-batch`/`event-ack`），Main 订阅后经 `capture:events` 广播 Renderer。
- 会话列表 UI 已落地（M4）：Capture 工作区数据驱动——TanStack Virtual 固定行高虚拟化列表 + Zustand 视图状态（实时事件按 id 合并/前插且补偿选中行滚动、keyset 分页、客户端协议分段），Omnibox 过滤下推当前 `sessionId`；选择/滚动/Inspector tab/宽度跨 feature 保留。Inspector 按需拉取 header/body，正文提供 Auto/Text/JSON/Hex 四模式，Cookies 读取全部重复 header，Timing 只显示 Mockttp 可证明的真实阶段。body/header 不进入全局状态。
- HTTPS MITM 与 CA 已落地（M5）：Main 用 `@peculiar/x509` 生成 RSA/SHA-256 Root CA、Electron `safeStorage` 加密私钥（懒加载证书库）；`TrustStoreService` 做 local-machine 信任库安装/卸载/检测（sudo-prompt 提权 certutil/security）；CA 经内部 `tls.configure` 单向下发 Core，Core 用 Mockttp MITM 解密 HTTPS（仅信任且 mitmEnabled 开启时启用，信任与 MITM 解耦）并复用现有捕获管线；per-host 不安全例外、Settings/Certificates 面板接真实数据（含 reveal/view/系统证书管理器/delete 入口）。私钥绝不进 Renderer。详见 M5.md 后续增强。
- Vitest、Forge package、真实 packaged executable 的 Playwright CDP smoke（含存储全链路 + 窄 API 面）和生产依赖审计链已建立。
- HTTP/2 已落地（M6）：MITM 时 Mockttp `http2:true` 下游 h2 + 上游 ALPN 协商 + 四组转换；trailer/pseudo-header 采集落库；`content-decoder`（gzip/deflate/brotli 延迟解码）经 `body.read-range` 的 `decode` 请求由 Core 解压（浏览器不支持 br 故必须 Core 解）；Inspector 展示 Stream ID/pseudo 高亮/trailer，BodyView 解码预览。streamId/GOAWAY/RST/背压 Mockttp 未暴露，列为后续原生 http2 增强。
- 诊断可观测性增强（2026-07）：Core 各组件及 Electron Main/Renderer 的关键生命周期、IPC/证书错误和未捕获 UI 错误，经有界非阻塞窄通道统一写入 Diagnostics Worker；按 core/main/renderer、trace/command/level/outcome/duration 分页查询与双层脱敏 JSONL 导出。
- 规则 UI、Composer、Breakpoint 编辑与 Connection/TLS 详情已落地（M8）：Rules workspace 数据驱动（rulesStore/useRulesData + 全类型 Matcher/Action 编辑器 + 实时 rules.validate 诊断 + rules.replace 乐观并发 + rules.hits 命中计数）；Composer（composerStore/useComposer + ComposerService 经 http/https/http2 出站 + 响应/历史/Auth）；Breakpoints（breakpointsStore/useBreakpoints 轮询 breakpoint.list 暂停队列 + 编辑放行 + break-on-match）；Capture Inspector TLS 标签经 connection.probe 实时探测证书链。
- WebSocket/gRPC 已落地（M9）：Mockttp HTTP/1.1 Upgrade + 自定义 `WebSocketBridge` 捕获/转发/消息断点，`websocket_frame` 有序存储与 keyset 页；native gRPC 作为通用 H2 request/response 捕获，`grpc.messages` 每条只读 5B envelope header 并复用 Blob range。Capture Inspector 提供 WebSocket/gRPC Messages 视图；gRPC-Web、H2 Extended CONNECT、descriptor/reflection 与实时 streaming 增量解析未实现。
- HAR 1.2 已落地（M10/T10.1）：Core 内完成标准 HAR 导出与受限 inert JSON 导入，正文只在 Core/Blob 流转；Main 系统对话框持有路径，Renderer 只经异步 transfer job 查询进度/取消。Capture HAR overlay 支持 all/filter/selected、Authorization/Cookie 遮罩与 strip bodies。
- 原生 archive 已落地（M10/T10.2）：版本化 ZIP（manifest + `VACUUM INTO` 一致 SQLite 快照 + 内容寻址 Blob）。HAR 与 archive 共用单一 `TransferJobManager`；手写零依赖 ZIP writer/reader（Node zlib/crypto）在解压前校验加密位/压缩方法/符号链接/绝对路径/`..`/白名单外条目/单条与总解压上限/压缩比 zip-bomb/重复条目，提取时硬上限 + 逐条 CRC-32 + Blob 内容寻址 hash 三重校验；导入保真（pseudo-header/trailer/正文/WebSocket 帧）重插入隔离 Session，失败/取消回滚。窄 API 新增 `startArchiveExport`/`startArchiveImport`；Capture overlay 启用 “Native archive” 格式切换。
- 系统代理与恢复已落地（M11）：Windows WinINet 与 macOS Swift/SystemConfiguration helper 完成当前值 snapshot、loopback 设置、完整 guarded compare restore；原子 startup journal 支持新进程/Core failure 恢复且不覆盖外部修改。后续已移除 first-run，改为 Capture 启动时自动 Recording/接管系统代理、Stop 时先恢复再清理；HTTPS setup 保持用户显式授权。Proxy Settings 与 emergency repair 仍保留。当前 Windows package/smoke 已验证，macOS helper 编译/授权 round-trip 留真实平台验收。
- 发布加固已落地（M12）：Desktop 0.1.0；Windows x64 per-user WiX MSI 通过双版本 install/launch/upgrade/launch/uninstall；macOS ad-hoc/Developer ID/notarize + DMG/ZIP 与原生 smoke 已配置。Renderer 迁至 `interceptor://app`，file extras 关闭，Electron 43 九项 Fuse strict 锁定，release 0 maps。Artifact audit、真实 packaged 全工作流、42 张视图矩阵、10 万行门槛与固定 SHA GitHub Actions 完成。生产实签/公证和真实 macOS 证据待外部凭据/runner。
- GitHub Releases更新已落地（M13）：packaged Windows/macOS启动及每小时读取固定仓库latest stable Release；app内显示有界纯文本changelog。下载只由用户触发，Main选择当前平台单一MSI/DMG并经仓库URL、tag、路径、架构、size和强制GitHub SHA-256校验后流式原子落盘；Renderer只拿状态/进度并可请求打开已下载安装器。无自建服务、Squirrel、资源热更新或静默安装。

当前代码架构的权威说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 当前验证摘要

2026-07-18 Capture/HTTPS 后续增强提交前验收：三 workspace typecheck 通过；Desktop 99 / Proxy Core 193 / Protocol 19，共 311 项单测通过；Windows package 成功；真实 packaged smoke 1/1 通过，覆盖启动默认 Recording、窄 API、Core 重启与活动 Session Clear 后 Exchange/Body 归零；生产依赖 audit 0。Payload 四模式、Cookies、Timing、Tunnel setup 与 1280/900 topbar 已完成目标场景浏览器/视觉检查。

2026-07-18 多语言界面增强验收：`i18next` + `react-i18next` 接入 15 个完整 catalog（每种 659 个主 key，俄/波/乌补齐 CLDR `few/many`）；所有 Renderer 用户文案外部化，Main 经受限 `setUiLanguage` 意图同步 HAR/archive/Diagnostics 原生文件对话框。三 workspace typecheck 通过；Desktop 87 / Proxy Core 187 / Protocol 19，共 293 项单测通过；Windows package audit 1,292 files / 377,348,054 bytes；真实 packaged smoke 1/1，逐项切换 15 种语言并验证 `html lang`、持久化、侧栏译文、页面无溢出及非法语言拒绝；生产 audit 0。设计源仅保留当前 Theme flyout 与 Language list，已删除 Theme B/C/D、Language L2/L3 及其专用截图矩阵。

2026-07-18 M13完成后的集中验收：`npm run typecheck`三workspace；`npm run test:unit` Desktop 80 / Proxy Core 187 / Protocol 19，共286项；Windows package audit 1,292 files / 376,709,663 bytes；真实packaged smoke 1/1；正式WiX MSI构建；0.0.1→0.0.2 install/launch/upgrade/launch/uninstall；生产audit 0；actionlint通过。完整parity 35 views，Updates七态light/dark共14场景全部0 missing。详情见 [M13.md](M13.md)。

2026-07-17 M12 完成后的集中验收：`npm run typecheck` 三 workspace；`npm run test:unit` Desktop 68 / Proxy Core 187 / Protocol 19，共 274 项；Core release 0 maps。正式 0.1.0 package audit 1,292 files / 376,666,107 bytes，九项 Fuse匹配；真实 packaged 全工作流 + 42 screenshot matrix 1/1；WiX x64 MSI 0.0.1→0.0.2 install/launch/upgrade/launch/uninstall 通过；正式 MSI 148,381,932 bytes、per-user、x64、稳定 UpgradeCode；生产 audit 0、actionlint 通过。当前无签名凭据，产物如实 NotSigned；macOS 真实验收待 runner。详情见 [M12.md](M12.md)。

2026-07-17 M11 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` Desktop 65 / Proxy Core 187 / Core Protocol 19，共 271 项通过；`npm run build:core`、Windows package、真实 packaged smoke 1/1、`npm audit --omit=dev` 0、helper 资源和 `git diff --check` 全通过。完整 parity 21 views，first-run 8 场景与 Proxy Settings 3 场景均 0 missing。详情见 [M11.md](M11.md)。

2026-07-17 M10/T10.5 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` Desktop 47 / Proxy Core 187 / Core Protocol 19 全通过；`npm run build:core`、Windows package、真实 packaged smoke 1/1、`npm audit --omit=dev` 0 全通过。Diagnostics parity 1.70%，本次 6/6 targets、0 missing，Process/Level/Outcome 几何 0 px。详情见 [M10.md](M10.md)。

2026-07-17 T10.4 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` Desktop 44 / Proxy Core 184 / Core Protocol 19 全通过；`npm run build:core`、Windows package、真实 packaged smoke 1/1、`npm audit --omit=dev` 0 全通过。新增五维分页查询、Main 双边界校验、JSONL 分页/原子替换/双层脱敏测试。Diagnostics parity 像素差 1.69%，既有 fixture/几何报告 3 missing / 6 flagged，初始 topbar 结构无变化。详情见 [M10.md](M10.md)。

2026-07-17 T10.3 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` 通过（Desktop 42 / Proxy Core 181 / Core Protocol 19），新增 privacyStore 默认/更新 2 项与 redactUrl/redactQueryString 5 项；真实录制指示、loopback 标注、导出未脱敏警告、URL 令牌遮罩与 Privacy 面板已落地。Privacy 面板由现有设计系统原子搭建，design SPA 专用 mockup 与 PNG 基线随 M12 视觉验收。详情见 [M10.md](M10.md)。

2026-07-17 T10.2 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` 通过（Desktop 40 / Proxy Core 176 / Core Protocol 19），archive 较 T10.1 新增 16 项覆盖 ZIP 解压前安全校验（穿越/绝对路径/白名单外/压缩比 zip-bomb/符号链接/重复/加密条目）、`VACUUM INTO` 快照 + 保真 round-trip、缺 manifest 与不支持版本拒绝、失败回滚，以及共享 `TransferJobManager`；`npm run build:core` 通过（archive 随主 entry 打包，`node:sqlite` external）。未新增生产依赖（Node 内置 zlib/crypto/node:sqlite）。设计源已同步启用 Native archive 段，PNG 基线随 M12 视觉验收重出。详情见 [M10.md](M10.md)。

2026-07-17 T10.1 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` 通过（Desktop 40 / Proxy Core 160 / Core Protocol 19），HAR 7 项覆盖 round-trip、脚本不执行、输入上限、脱敏、失败回滚和任务取消；HAR parity light/dark 各 11/11 targets、0 missing/flagged（0.89%/0.49%）；`npm audit --omit=dev` 0；Windows package + 真实 packaged smoke 1/1 通过。详情见 [M10.md](M10.md)。

2026-07-17 M9 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run test:unit` 通过（Desktop 39 / Proxy Core 151 / Core Protocol 18），含真实 TLS+ALPN h2 gRPC capture、WebSocket bridge 转发前断点、framing/service 与 Storage/Main/Core 边界；8-view visual parity 完整运行（WebSocket 8/8、gRPC 9/9 targets）；`npm audit --omit=dev` 0 vulnerabilities；Windows `npm run package` + 真实 packaged smoke 1/1 通过。详情见 [M9.md](M9.md)。

2026-07-16 M8 规则 UI 与 Composer 完成后的集中验收：`npm run typecheck` 三 workspace 通过；`npm run build:core` + `npm run test:unit` 通过（Desktop 36 / Proxy Core 139 含 countRuleHits 聚合 + 真实 worker 集成 / Core Protocol 16 含 rules.hits/composer/breakpoint/connection 命令与结果校验）；`npm audit --omit=dev` 0 vulnerabilities（M8 未新增生产依赖，Composer/TLS 探测用 Node 内置 http/https/http2/tls）。窄 API 扩展至 rules.get/validate/replace/hits、composer.send、breakpoint.list/resolve/configure、connection.probe。Linux 环境 packaged smoke 需 GUI 未跑、设计 parity 字体差异不作严格门禁，权威 packaged 验收在 Windows/macOS（M12）。详情见 [M8.md](M8.md)。

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
