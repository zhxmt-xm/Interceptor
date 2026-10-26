# Interceptor 协作规范

- 通用规则适用于全仓。
- 实现、命名、前端与 Core 结构见 [architecture/platform/coding.md](architecture/platform/coding.md)；测试与验收见 [architecture/platform/testing.md](architecture/platform/testing.md) 和 [E2E README](apps/desktop/tests/e2e-workflow-tests/README.md)。

## 一、协作与授权

### 沟通与暂停

- 用中文沟通，优先用短列表，一条只讲一件事。
	- 独立规则放一级列表，说明、例子和例外放在对应规则的子列表。
- 用项目中的具体名称说明谁做什么，如 Main、Renderer、`CoreRuntime.request()`、`IPC handler`、`MCP Tool`。
	- 不用抽象术语代替具体代码，不堆砌名词，不写大段解释。
- 代码、命令、路径、API、协议值、配置键和日志原文不翻译。
	- 保留 worktree、commit、diff、Renderer、Preload 等项目常用词。
- 持续完成已授权的实现与验证，不自行扩大范围。
	- 后台命令必须取得结果，不能把“正在等待”当作完成。
	- 需要人工处理时，列出失败原因、用户要做的操作和恢复命令。

### 开工与权限

- 新会话和子代理在规划或修改代码前，必须先阅读 [architecture/HANDOVER.md](architecture/HANDOVER.md)。
- 不创建或使用其他 worktree，包括临时 detached worktree。
- 保留用户和其他会话的修改，不回滚、覆盖或擅自清理工作区。
- 改 `patches/` 或 `node_modules` 中的第三方行为前，先说明原因、替代方案和影响，取得用户明确批准。

### 按需阅读

- 按任务读取下表的相关文档；同一会话内已读且未变化的内容不重复读。

| 文档 | 何时读取 |
| --- | --- |
| [architecture/README.md](architecture/README.md) | 任务归属不明确，需要定位功能或平台文档时 |
| [platform/coding.md](architecture/platform/coding.md) | 实现原则、命名、分层、前端结构或 Core module 结构 |
| [platform/testing.md](architecture/platform/testing.md) | 选择验证层级、执行测试或调整测试设施 |
| `architecture/features/*.md` 中的对应功能文档 | 修改功能、命令参数/返回值或用户流程 |
| [platform/processes.md](architecture/platform/processes.md) | 修改 Main、Preload、Core 的职责、通信、启动/退出或安全检查 |
| [platform/renderer.md](architecture/platform/renderer.md) | 修改 Renderer 导航、共享组件、主题、语言或公共自动化属性 |
| [platform/storage.md](architecture/platform/storage.md) | 修改 SQLite、正文文件、录制数据的保存与清理 |
| [platform/release.md](architecture/platform/release.md) | 涉及构建、打包、runtime dependency、原生 helper、Fuses/CSP、安装器或发布 |
| [design-vite/design-system/README.md](design-vite/design-system/README.md) | 创建、修改或评审 UI 的布局、控件、颜色、字体、尺寸及交互状态 |
| [design-vite/README.md](design-vite/README.md) | 修改设计稿、添加设计场景或生成设计截图 |
| [E2E README](apps/desktop/tests/e2e-workflow-tests/README.md) 与 [规格索引](apps/desktop/tests/e2e-workflow-tests/docs/README.md) | 修改用户流程，准备、执行或验收真实 E2E |
| [packaged-smoke README](apps/desktop/tests/packaged-smoke/README.md) | 验证打包产物的启动、安全、资源与退出 |
| [visual-parity README](apps/desktop/tests/visual-parity/README.md) | 验证产品 UI 与设计稿的元素几何、样式和状态差异 |
| 所属 module README | 修改 Core 或 package 的职责、entry point、依赖或内部结构 |
| [apps/playground/README.md](apps/playground/README.md) | 开发 Playground，或进行协议流量与 MCP 人工验收 |
| [README.md](README.md) | 配置开发环境、安装依赖、运行或调试应用 |

## 二、测试与验收

- Playground、E2E、`design-vite`、fixture、driver、lab、截图脚本及测试和设计辅助代码是验收工具，不是正式产品代码。
	- 不为这些工具代码或设计稿新增或扩充 unit、integration、Browser 等测试，也不因精简批量删除已有辅助测试。
- 新增行为、改变数据格式或修复故障：修改前测试因目标行为未实现而 Red，修改后同组 Green。
	- 行为和数据格式不变时，确认现有测试覆盖该行为且基线 Green；覆盖不足先补当前行为的测试，再重构。
	- 不先写实现再补测试证明自己写对了；行为不变的重构不人为制造 Red；测试全绿不代表覆盖充分。
	- selector、fixture、UAC、构建或环境失败不算产品 Red；历史 Red 只引用已保存的真实证据，没有就记录缺口。
- 修改用户流程前，先更新对应的 `architecture/features/*.md` 和 [E2E 规格](apps/desktop/tests/e2e-workflow-tests/docs/README.md)，写清数据格式、操作步骤、预期结果和所需证据，再按 unit/integration → 真实 E2E 的顺序取得结果。
- 开发时只跑最小相关检查；交付前完成受影响范围的 typecheck 与 unit/integration，命令见 [testing.md](architecture/platform/testing.md)。
	- 改进程、安全、打包、资源或 runtime dependency 时提前跑 package → artifact audit → packaged smoke。
	- UI 改动跑受影响视图、主题和交互状态的 parity；共享外壳、全局样式或 design token 改动跑全量 parity。
- 真实 E2E 只从 `workflows/<feature>/*.workflow.ts` 操作真实 UI，规则见 [E2E README](apps/desktop/tests/e2e-workflow-tests/README.md)。
	- 禁止 fake Preload、状态注入、`page.evaluate(window.interceptor.*)` 和测试专用后门。
	- 不预造业务输入；导入文件由同一 workflow 先经产品 Export 生成。
	- 用 `data-automation-id`、协议值或状态属性定位，不用显示文案、翻译后的 `aria-label` 或 CSS class。
	- 设计稿、fake Preload、Renderer 测试、Core integration、packaged smoke 不能替代真实 E2E 或退出恢复证据。
- 失败、跳过、环境阻塞分别写明原因和未验证范围，不能算通过；结果只在代码、依赖、环境和产物仍适用时复用。
- 用户流程完成须有前置测试、最终 Green、trace 证据、Main/Core/Worker 退出、8888 释放和系统设置恢复。
	- 缺证据只写“代码完成 · 待 E2E”，不写“已完成”或 `passed`；平台或权限阻塞写 `blocked`，列出人工操作和恢复命令。
- Vitest 放所属模块的 `tests/unit/` 或 `tests/integration/`，按行为命名为 `*.test.ts`；用到真实进程、网络、文件、数据库或 worker 的放 `integration/`。
	- `e2e-workflow-tests/`、`packaged-smoke/`、`installer/`、`visual-parity/` 保持独立，不放进 Vitest 目录；workflow 放 `workflows/<feature>/`，公共 driver 放 `fixtures/`。

## 三、文档与状态

- 架构文档从 [architecture/README.md](architecture/README.md) 导航；未完成任务的进度只放 [Handover](architecture/HANDOVER.md)。
- 除 Handover 外，文档只维护职责、契约、操作方法和稳定限制。
	- `architecture/platform/` 只写已实现并验证的设计；`architecture/features/` 写功能契约与数据格式，未验证目标放“与当前实现的差异”。
	- 不写 item 进度、完成状态、逐轮测试数字、Red/Green 结果、失败重试、提交发布过程或临时证据链接。
	- 测试规格和 Inventory 只维护场景、前提、步骤与断言，不维护 `passed/planned/blocked` 进度列。
	- 契约逐项对应可执行 workflow 的输入、操作和断言；文件存在或 Playwright `--list` 不能证明已执行或通过。
	- trace、日志、截图和验证结果留在运行产物目录，不复制成文档流水账。
- Handover 开头写跟踪的 commit hash，所有未完成任务放在一份平铺列表。
	- 只记录目标、当前阻塞、下一步和必要运行约束；不写时间线、尝试次数、测试数字、提交推送过程或完成总结。
	- 开始和推进 item 时及时更新当前步骤、已验证范围、剩余验证和阻塞；item 完成后删除该条，稳定行为写入 feature 或 platform 文档。
	- 运行约束、验证命令和维护说明单独成节，不写成待办。

## 四、提交与交付

- 提交须有用户授权，不擅自创建分支。
- 授权后按 [pr-rebase-submit skill](.github/skills/pr-rebase-submit/SKILL.md) 完成 branch、push、PR 和 rebase merge。
	- PR 禁止 squash merge；合并后立即删除本地与远端分支，执行 `fetch --prune`，切回 `main` 并确认本地 `main`、`origin/main` 与 Git Graph 同一条线。
- 以用户已授权的 Handover item 为提交边界，一个 item 一个 commit，不混入其他工作项。
	- 所需实现、测试和验收完成后再提交；提交前完成文档同步。
	- 提交或合并后不为跟踪 hash、推送状态或完成总结再次写回 Handover，也不另建 commit。
- 不生成或维护 `commit-changes/`、逐 commit HTML 改动报告或配套截图打包流程；变更摘要写入 commit message。
- 审阅 staged diff 时逐个文件展开，不一次展开整仓或大量文件。
