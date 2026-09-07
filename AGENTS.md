# Interceptor 协作规范

适用于全仓。前端与 Core 的专属规则仅约束对应 module。

## 一、协作与授权

### 沟通与暂停

- 对话、文档、计划、评审和工具说明使用连贯中文，保留 worktree、commit、diff、Renderer、Preload 等必要术语，不逐词替换成英文或堆砌名词。
- 代码、命令、路径、API、协议值、配置键和引用日志保持原文；反引号用于代码标识与字面值，不用于强调普通术语。E2E 分块注释按下文要求使用双语。
- 在授权范围内持续推进到实现与验证完成；后台命令须取得结果后继续，不能把等待当作完成。确需人工处理的阻塞，应说明事实、所需动作和恢复方式。

### 开工与权限

- 新会话和子代理在规划或修改代码前，必须先阅读 [architecture/HANDOVER.md](architecture/HANDOVER.md)。
- 保留用户和其他会话的修改，不擅自回滚、覆盖或清理 `worktree`。
- 新增或修改 `patches/` 中的第三方补丁、直接改变 `node_modules` 的第三方行为，必须先说明必要性、替代方案和影响范围，并取得明确批准；批准前仅可调研、编写验证测试。

### 按需阅读

其余文档按下表的任务条件读取相关章节；同一会话内已读且未变化的内容不重复读取。

| 文档 | 何时读取 |
| --- | --- |
| [architecture/README.md](architecture/README.md) | 任务归属不明确，需要定位功能或平台文档时 |
| `architecture/features/*.md` 中的对应功能文档 | 新增、修改或修复功能行为、data contract 或用户流程时；跨功能改动分别读取相关章节 |
| [architecture/platform/processes.md](architecture/platform/processes.md) | 涉及 Main、Preload、Core 的进程职责、通信、lifecycle 或安全边界时 |
| [architecture/platform/renderer.md](architecture/platform/renderer.md) | 涉及 Renderer 外壳、导航、共享组件、主题、语言或公共 automation contract 时 |
| [architecture/platform/storage.md](architecture/platform/storage.md) | 涉及存储归属、SQLite、正文文件，或录制数据的 lifecycle 与清理时 |
| [architecture/platform/testing.md](architecture/platform/testing.md) | 新增或修改测试、选择验证层级、调整测试设施或执行验证任务时 |
| [architecture/platform/release.md](architecture/platform/release.md) | 涉及构建、打包、runtime dependency、原生 helper、Fuses/CSP、安装器或发布时 |
| [design-vite/design-system.md](design-vite/design-system.md) | 创建、修改或评审 UI 的布局、控件、颜色、字体、尺寸及交互状态时 |
| [design-vite/README.md](design-vite/README.md) | 修改设计稿、添加设计场景或生成设计截图时 |
| [apps/desktop/tests/e2e-workflow-tests/README.md](apps/desktop/tests/e2e-workflow-tests/README.md)、[规格索引](apps/desktop/tests/e2e-workflow-tests/docs/README.md)及对应功能规格 | 涉及用户流程的 contract、真实 E2E 前置证据、执行或验收时 |
| [apps/desktop/tests/packaged-smoke/README.md](apps/desktop/tests/packaged-smoke/README.md) | 修改或执行最终打包产物的启动、安全、资源与退出验证时 |
| [apps/desktop/tests/visual-parity/README.md](apps/desktop/tests/visual-parity/README.md) | 验证或修复产品 UI 与设计稿的几何、字体和像素差异时 |
| 所属 module 的 README | 修改 Core 或 package 中的模块职责、entry point、依赖或内部结构时 |
| [apps/playground/README.md](apps/playground/README.md) | 开发 Playground，或进行协议流量与 MCP 人工验收时 |
| [README.md](README.md) | 配置开发环境、安装依赖、运行或调试应用、查找常用命令时 |
| [architecture/backlog/TODO.md](architecture/backlog/TODO.md) | 查询或更新已确认缺陷、实现限制及验收欠账时 |
| [architecture/backlog/idea.md](architecture/backlog/idea.md) | 整理想法、评审待办或更新工作项状态时 |
| [architecture/backlog/research.md](architecture/backlog/research.md) | 进行技术调研、评估长期候选或记录未承诺方案时 |

## 二、实现与命名

### 实现原则

- 采用满足当前需求的最简单完整实现，逐层交付可用能力；不引入投机性抽象、配置、间接层或注定被替换的临时方案。
- 删除过时路径，不为旧行为保留 compatibility layer、fallback 或 migration。
- 优先复用现有依赖，先检查其文档和类型定义，再判断是否缺少所需能力；确有必要时采用成熟库，不重复实现通用功能。
- 各 module 职责分离，控制流直白；仅在系统边界校验，不为不可能发生的场景添加错误处理。
- 只保留正式产品能力，不用测试专用参数、隐藏分支或后门维持不存在的产品操作。

### 命名与改名

- method 名应说明实际执行的动作，如 `saveRules()`、`deleteRule()`；避免 `handleRules()`、`processData()` 等看不出具体动作的名称，不按单词黑名单机械改名。
- 相反的业务操作分别定义 method，如 `startCapture()`、`stopCapture()`；不用 `setCaptureEnabled(boolean)` 在同一业务方法中兼顾两种操作。
	Main、IPC、Preload 可用一条带 payload 的命令承接同一个控件，由实际业务所属的 command handler 分派到独立业务方法：Main 业务在 Main 分派，Core 业务在 Core 分派。
- 同一功能的 method 连续分组。每个 public method 后紧跟其专属 private helper，共用 helper 放在该功能组末尾；成对的 public method 不必直接相邻。
- instance 引用按所属 class 的完整名称转为 camelCase 命名，如 `CoreApplication` → `coreApplication`；成员、参数、依赖注入和测试中的引用同样适用。
- 名称已表达明确角色时保留；同一 class 有多个 instance 时按角色区分，如 `exportHost`、`importHost`。
- Array、Map、Set 这类 collection 按内容命名，如 `ruleIds`、`requestsById`。
- DTO 和协议字段沿用 contract 定义的名称，不套用 class 的命名规则。
	例如，`RuleService` 的 instance 引用叫 `ruleService`；若 API 约定返回 `{ id, enabled }`，字段仍保留原名，不改成 `ruleServiceId`、`ruleServiceEnabled`。
- 跨文件的代码符号改名使用语言服务 Rename Symbol（VS Code 中通常为 F2），按符号更新定义和引用，避免误改同名但无关的代码。
- 字符串和注释中的名称逐处确认后精确修改，并搜索复核；文本替换不得误改文件路径、协议值或无关名称。
- 脚本读写显式使用 UTF-8，不依赖默认 ANSI 编码；完成后检查 diff，确认没有乱码或非预期修改。

## 三、分层与命令

### 进程边界

- Renderer 不得访问 Electron 或 Node，只能通过 typed `window.interceptor` Preload API 通信。

### 意图与状态

- 每个后端业务交互对应语义单一的命令；不同用户意图即使修改同一份数据，也不得合并到同一个 entry point。命令和参数名直接描述行为。
- 配置与启用、停用分开表达，不同维度的 state 使用独立字段。不得用 `null`、空数组、可选参数或魔法值表达多重语义。
- 不用影子字段弥补一个字段混合多个独立状态的设计；编辑前快照、撤销历史、系统代理恢复所需的 `original` 等具有明确业务用途的历史状态可以保留。

## 四、测试与验收

### 测试驱动开发

- 业务代码修改前先判断行为、contract 和测试影响；禁止先实现，再补测试为结果背书。
- 涉及用户流程时，先在 `architecture/features/*.md` 和 `apps/desktop/tests/e2e-workflow-tests/docs/*.md` 写明 contract、完整流程、预期效果和证据要求。

| 改动类型 | 实现前要求 | 实现后要求 |
| --- | --- | --- |
| 新增行为、修改 contract 或修复故障 | 目标行为缺口导致的 Red | 同一组测试 Green |
| 行为与 contract 不变、现有测试充分覆盖的内部重构 | 基线 Green，并指出对应测试及覆盖的行为 | 同一组测试 Green |
| 行为与 contract 不变、现有测试不足的内部重构 | 先补充覆盖当前行为的测试并确认基线 Green，再重构 | 同一组测试 Green |

- 涉及用户流程时，按 unit test / integration test → 真实 E2E 的顺序建立上述前置证据，再修改业务代码；实现后按同一顺序复跑。不能仅凭测试全绿认定重构已有充分覆盖，也不为行为不变的重构人为制造 Red。
- Red 必须来自预期行为缺口，不能来自 selector、fixture、UAC、构建或环境故障。补录历史 Red 证据须在修复前提交的临时 detached worktree 运行同一测试，禁止故障注入冒充历史 Red。

### 真实 E2E

- 仅指 `apps/desktop/tests/e2e-workflow-tests/workflows/<feature>/*.workflow.ts` 启动真实 Electron，通过真实 UI 覆盖目标流程实际依赖的完整链路。涉及 Preload、Main、Core UtilityProcess、listener、storage 或 origin 时均走真实实现；纯 UI 操作不强行经过无关层。
- 设计稿 Playwright、使用 fake Preload 的视觉一致性验证、Renderer 组件或 Store 测试、Core integration test、packaged smoke 均不能替代真实 E2E 或销毁证据。
- 业务操作必须通过真实 UI；产品弹窗真实点击，Open/Save Dialog、UAC 等原生 UI 使用真实键鼠，不改写返回值，不使用 state injection、直接业务 API 或产品后门。
- 禁止 seed 业务输入。导入文件必须由同一 workflow 先经产品 Export 产生，再 Import；非法结构、越界层级和损坏字节由对应模块的 unit test 覆盖，不在 E2E 中造文件或使用 state injection。
- 保持应用当前语言，不为测试切换语言。业务定位和断言只用公共 `data-automation-id`、协议值、表示状态的 DOM attribute 或测试自产数据，不用显示文案、翻译后的 `aria-label` 或 CSS class；翻译文本仅在独立 i18n workflow 验证。
- 每个 `.workflow.ts` 的准备、用户操作、业务断言、证据与清理分块前，写语义一致的简短中英文成对注释，说明意图而非逐行复述。

### 验证与完成状态

- 实现中按 TDD 运行最小相关检查，不在每次小改后跑全套。纯文档变更只核对条款、引用和格式。
- 产品代码工作项交付前，按影响范围完成 typecheck、unit test / integration test；共享代码变更须覆盖依赖方，正式版本交付执行全 workspace 检查。不以无关测试通过代替目标行为验证。
- 涉及进程、安全、打包、资源或 runtime dependency 的改动，提前执行 package → artifact audit → packaged smoke；正式版本交付前也必须完成这组检查，不要求每个局部逻辑改动都重新打包。
- UI 改动运行受影响视图、主题和交互状态的 parity；共享外壳、全局样式或 design token 改动运行全量 parity。packaged smoke 使用已有截图矩阵，不重复维护另一套截图要求。
- 已有结果仅在仍适用于当前代码、依赖、配置、环境和被测产物时复用；后续修改影响了验证结论，就重跑受影响检查。失败、跳过或环境阻塞须注明原因和未验证范围，不能当作通过。
- 具体命令、截图矩阵和运行约束查阅 [architecture/platform/testing.md](architecture/platform/testing.md) 及对应测试套件的 README，不在本文件重复维护。
- 用户流程的最终 Green 还须验证 trace/evidence、Main/Core/Worker 销毁、8888 释放及系统副作用恢复，之后才能更新 Inventory、Handover 和完成状态。
- 缺少该改动类型要求的真实 E2E 前置证据、最终 Green 或销毁恢复证据时，只能记为“代码完成 · 待 E2E”，不能标记“已完成”或 Inventory `passed`。UAC、凭据或平台阻塞记为 `blocked`，写明人工动作与恢复命令。

### 测试目录

- Vitest 测试放在对应模块的 `tests/unit/` 或 `tests/integration/`，按行为命名为 `*.test.ts`。跨真实进程、网络、文件系统、数据库或 worker 任一边界的测试归入 `integration/`。
- test helper、fixture 和 fake 跟随使用它们的测试层存放；`tests/` 根目录不放测试或辅助代码，不新增 `tests/shared/`。跨层需求优先按层拆分。
- `e2e-workflow-tests/`、`packaged-smoke/`、`installer/`、`visual-parity/` 是独立套件，不放入上述 Vitest 目录。
- 可执行 workflow 按功能放入 `workflows/<feature>/`，文件名只描述行为，不重复功能前缀；跨功能流程归主要用户入口，公共 driver/lab 只放 `fixtures/`，根目录不放可执行 workflow。

## 五、前端规范

### 设计来源与选型

- `design-vite/` 是唯一设计稿，组件设计和 design token 以 [design-vite/design-system.md](design-vite/design-system.md) 为准。
- 创建、修改或评审 UI 设计时使用 `.github/skills/ui-design-mockup/`；设计发生变化时同步设计稿与 `shots/`。
- 实现既有设计、检查或修复产品 UI 的还原偏差时，使用 `.github/skills/ui-parity-check/` 核对还原度。设计未变化时不修改设计稿或基准截图，不通过修改基准掩盖实现偏差。
- 已有设计按布局、间距、尺寸、颜色、字体、圆角和交互状态一比一还原，不以工具限制接受近似实现。
- 新设计先检查 Ant Design v6，依次使用官方 props → ConfigProvider tokens → 语义 `classNames`/`styles`。只有能精确匹配时才采用；否则自行实现组件，并使用独立 CSS Modules，不修改 `.ant-*` 私有 DOM 或牺牲视觉一致性。
- 通用按钮、输入、行和分栏复用 `apps/desktop/src/renderer/components/` 中的 shared primitives，不在功能内重新实现。控件图标使用 Lucide 或已安装的 Ant Design 图标；自定义 SVG/PNG/ICO/ICNS 仅用于产品标识。

### 组件与样式

- Renderer 目录：`app/` 管外壳导航，`features/` 管功能工作区，`components/` 管共享控件，`theme/` 管主题，`styles/` 管最小全局样式。
- 每个 `.tsx` 只导出一个主 component，内容限于 JSX 和自身 hooks；即使只供父级使用，子组件也拆到同目录独立文件。
- pure function 放在所属功能的 `utils.ts`；仅跨功能复用时提升到 `components/share/`。
- 每个 component 使用独立、同名的 `*.module.css`，CSS class 按用途命名，不跨组件共享样式文件。默认使用 Vite 原生 CSS Modules；引入 Tailwind、Less、Sass 或其他设计系统须获批准。
- 颜色、间距和圆角沿用共享 design token，通过 ConfigProvider 和 `:root[data-theme]` 下的 CSS custom properties 提供，不硬编码偏离设计的值。全局 CSS 仅包含重置、根级变量、字体和无障碍媒体查询。

### 滚动与尺寸

- 内容面溢出时必须支持滚轮、触控板和键盘滚动；未经用户要求，不隐藏滚动条或关闭滚动。`overflow: hidden` 仅用于外壳裁切、图标、圆角裁切和单行省略，不能吞掉内容滚动。
- 内层滚动到边界后交给外层。Monaco 等编辑器显式关闭边界滚轮吞噬，如 `alwaysConsumeMouseWheel: false`，并用真实滚轮测试内层滚动与外层接续。
- 分栏宽度和面板高度只设初始值，拖拽和窗口缩放时按 container 的可用空间调整；行高、控件和弹层维持设计尺寸。拖拽上限由 `总宽 - 对侧最小宽 - 轨道宽` 推导，不设人为最大值。

## 六、Core module 规范

### 目录与职责

- 每个领域位于 `apps/proxy-core/src/proxy-core/<module>/`；`entry.ts` 直接定义并导出唯一的 `<ModuleName>Service`，不能只 re-export 在别处定义的 service class。
- module 按职责准确命名，避免泛称；内部文件和 class 不重复模块前缀，仅为避免 `Store`、`Host`、`Manager` 等泛称保留必要限定。

| module 与主 class | 职责 |
| --- | --- |
| `capture/` · `CaptureService` | 当前录制的临时 Exchange 和 Body |
| `workspace/` · `WorkspaceService` | `workspace.sqlite` 中的低频应用与功能配置 |
| `tls-probe/` · `TlsProbeService` | TLS 握手探测 |

- module 根目录只放 `entry.ts`、README 和子目录；`host/`、`worker/` 各有自己的 `entry.ts`。
- 实现放在 `internal/`，类型定义放在 `interfaces/index.ts`，无状态函数放在 `utils/index.ts`，测试放在 `tests/`。
- 一个 module 可以定义多个自定义 Error subclass，统一放在该 module 的 `internal/errors.ts`，不分散或内联定义；没有自定义错误就不建文件。错误名在模块外也须能说明含义。
- 模块内使用的 constant 放在 `internal/constants.ts`，跨模块使用的放在 `proxy-core/constants.ts`。

### class 结构与依赖

- 每个 TypeScript 文件最多定义一个 class，集中定义自定义错误的 `internal/errors.ts` 除外；所有 class 的属性和方法均写简短职责注释，包括私有成员和 test helper 中的 class。
- 每个 module 只有一个长期 instance，协作者直接依赖负责该职责的具体 class。
- 不新建 interface 重复列出同一个 class 的全部或部分成员；interface 仅用于数据结构或确有多个生产实现的能力。
- test double 继承真实 class，只覆盖断言所需的行为。

### 修改联动

- 每个 module 的 README 写明职责归属、主 class、内部结构和依赖；职责变化时同步更新。
- 改名 host 或 worker 的 entry point 时，同步构建脚本、运行时解析、测试和文档中的产物路径，并执行真实 worker 构建与测试。

## 七、文档与状态

### 文档分工

架构和进度统一归入 `architecture/`，入口为 [architecture/README.md](architecture/README.md)。

| 位置 | 内容 |
| --- | --- |
| `architecture/HANDOVER.md` | 跟踪提交、当前任务、阻塞与验证证据 |
| `architecture/platform/` | 已实现并验证的跨功能架构，不写规划 |
| `architecture/features/` | 功能设计与 contract；未验证目标放“与当前实现的差异” |
| `architecture/backlog/` | 已知缺口、待办、想法和未承诺的长期研究 |

### 交接文档

- Handover 以跟踪的 commit hash 开头；所有已完成和未完成工作只放一份平铺任务列表，明确已完成、待实现、待验证、待验收或 `blocked`。
- 运行约束、验证命令和维护规则单独成节，不写成待办；不另拆已完成、`worktree`、主任务或下一动作等任务章节。
- 调整结构不得删除或省略既有事实、证据、命令、风险和维护说明；链接只作补充，不能替代必要上下文。

### 待办表格

- [architecture/backlog/idea.md](architecture/backlog/idea.md) 的 `Status` 仅用 `✅ 已完成`、`🔄 进行中`、`⏳ 未开始`，不混用另一套顶层状态。
- `Description` 先写目标，再用 `Steps:` 列相关阶段与当前状态；同义阶段用词统一，不适用的不列。阶段可包含设计、代码、自动验证、开发者人工验收、UAC 或具体阻塞，不能用模糊状态掩盖缺口。
- `TDD` 单独记录总体完成度及 `Code / Unit / Integration / E2E / Design/Parity` 矩阵：`✅` 已完成、`🔄` 部分完成或待验证、`❌` 未完成、`➖` 不适用。必要阶段与测试全部完成才能标顶层已完成；缺真实 E2E、人工验收或 UAC 时仍为进行中。
- 使用带 `colgroup`、固定列宽和最小总宽的 HTML table，窄预览允许横向滚动。列表用 `<ul><li>`，不用字符与 `<br>` 模拟；图片只放 `Description` 并限制宽度。

## 八、提交与交付

### 文档同步

- 在里程碑或用户要求时，同步 Handover 的跟踪提交与任务状态、相关架构文档；阶段边界不明确时先确认。
- [README.md](README.md) 只保留稳定介绍、使用开发说明和导航，不写进度；命令或稳定说明变化时才更新。提交前确保文档与改动一致。

### 提交边界

- 提交须有用户授权，一个完整工作项对应一个自洽 commit，不混入其他工作项，不擅自创建分支。
- 同一工作项的 contract、测试前置证据、实现、Green、验收证据和完成状态闭环后一起提交；仅用户明确要求时保存中间进度。
- 用户授权执行任务清单后，每个工作项验收闭环即提交并推送，然后继续下一项，无需重复确认。受阻项如实记录，继续其他可执行的已授权任务；仅在用户暂停、需要额外授权或无可执行任务时停止，不以单项完成作为整轮停止条件，不扩大授权范围或跳过验收门禁。
- 每次 commit 成功后立即 push 当前分支，不积攒多个提交；用户明确要求暂缓推送时除外。

### 差异审阅

- `diff` 和代码评审仅限单个文件或少量职责一致的文件，禁止一次展开整仓、整批 `staged changes` 或大量文件，避免 VS Code 卡顿或崩溃。
- 普通改动先逐文件审阅 `staged diff`；规模已影响稳定性时，完成验证与文档后先提交并推送，再逐文件复审，发现问题用聚焦提交修正，不重新展开完整 `diff`。