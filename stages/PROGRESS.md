# Interceptor 项目进度

> 最后更新：2026-07-14
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
- 已完成 Stage：M0 项目脚手架与工具链、M1 IPC 通信基座（均 100%）。
- 当前 Stage：M2 存储层（0%，尚未开始）。
- 当前任务：T2.0 M0/M1 Renderer design baseline。
- 下一动作：按 `design/app` 一对一重构现有 Shell、Capture 空态、Inspector 占位、Appearance/主题、禁用控制和真实 CoreProcessStatus；只呈现 M0/M1 已有真实能力，完成后进入 T2.1 SQLite schema + migration。
- Git 状态：M1 基线提交为 `b923117`；当前分支已包含进入 M2 前的 Core 子进程根对象简化。
- 阻塞：无。

详细接棒说明见 [HANDOVER.md](HANDOVER.md)，当前任务边界见 [M2.md](M2.md)。

## Stage 总览

| Stage | 名称 | 状态 | 进度 | 详情 |
| --- | --- | --- | ---: | --- |
| M0 | 项目脚手架与工具链 | 已完成 | 100% | [M0.md](M0.md) |
| M1 | IPC 通信基座 | 已完成 | 100% | [M1.md](M1.md) |
| M2 | 存储层 | 未开始 | 0% | [M2.md](M2.md) |
| M3 | 最小显式代理（HTTP/1.1） | 未开始 | 0% | [M3.md](M3.md) |
| M4 | 会话列表 UI | 未开始 | 0% | [M4.md](M4.md) |
| M5 | CA 与 HTTPS MITM | 未开始 | 0% | [M5.md](M5.md) |
| M6 | HTTP/2 | 未开始 | 0% | [M6.md](M6.md) |
| M7 | 规则引擎 | 未开始 | 0% | [M7.md](M7.md) |
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
- Ant Design v6 应用壳、Traffic/Inspector 占位、亮暗主题、共享工具控件和平台应用图标已完成。
- Vitest、Forge package、真实 packaged executable 的 Playwright CDP smoke 和生产依赖审计链已建立。
- HTTP 捕获、持久化存储、CA、规则和真实会话 UI 均未实现。

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

## 更新规则

1. 本文件只更新当前快照、Stage 状态/进度、下一动作和详情链接，不写长篇实现历史。
2. 每个 Stage 使用独立 `M*.md`；开始后在对应文件记录范围、任务状态、实施、决策、风险、验证和剩余工作。
3. 每个 Stage 的产品详细设计以 [桌面网络调试代理完整方案.md](桌面网络调试代理完整方案.md) 对应章节为准；Stage 文件不替代方案。
4. 每次 handover 更新 [HANDOVER.md](HANDOVER.md)，必须包含当前状态、已实现功能和代码位置、工作树、剩余工作、验证和下一步。
5. 已落地的进程、模块、通信、安全或打包架构变化更新 [ARCHITECTURE.md](ARCHITECTURE.md)；计划能力未实现前不进入当前架构图。
6. Stage 完成时集中同步本文件、对应 Stage 文件、Handover、Architecture 和 README 命令，然后执行阶段级完整验证。
