# Interceptor Agent Guidelines

## 实现原则

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- **第三方 patch 必须先获批准**：任何新增、修改或扩展 `patches/` 下的第三方补丁，以及任何直接修改 `node_modules` 三方行为的操作，都必须先向用户说明必要性、替代方案和影响范围，并取得用户明确同意；未获批准时只能调研和写验证测试，不得编辑第三方代码或补丁。
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- 不要为不可能发生的场景添加错误处理；只在系统边界做校验。
- **所有业务代码改动都走完整 TDD**：修改业务代码前必须先判断 test impact，确认预期行为/契约是否变化、现有测试是否已经完整表达该行为。若需要新增或修改测试，先完成最小 unit / integration test 并确认因预期缺口失败（Red），再写业务代码；若是行为不变的内部重构且现有测试已经充分覆盖，不机械改测试，先运行最聚焦的现有测试确认基线 Green，再写业务代码。完成后必须复跑同一组测试确认 Green；禁止先写实现、再补测试为既有结果背书。
- **Flow 变更阶段门禁**：任何业务代码改动只要影响用户 flow，首先在 owning `architecture/features/*.md` 与 `apps/desktop/tests/e2e-workflow-tests/docs/*.md` 落地契约、完整 flow、预期效果和证据要求；随后分别判断 unit / integration 与 E2E 的 test impact。需要改测试时，按 unit / integration Red → E2E Red 的顺序完成；现有测试已充分覆盖时，按同一顺序确认基线 Green。只有这些前置测试事实建立后才允许修改业务代码。实现后按 unit / integration Green → E2E Green 的顺序验证；只有 E2E 销毁与证据验证也完成后，才能更新 Inventory、Handover 与完成状态。
- **真实 E2E 定义（不得替代）**：本仓所称 E2E 仅指 `apps/desktop/tests/e2e-workflow-tests/workflows/*.workflow.ts` 启动真实 Electron，并经过真实 Renderer → Preload → Main → Core UtilityProcess → listener / storage / origin 的 workflow。`design-vite` Playwright、visual parity（fake Preload）、Renderer component/store test、Proxy Core integration、packaged smoke 都不是该产品 flow 的 E2E，不能作为 E2E Red/Green 或销毁证据的替代品。
- **E2E TDD 完成判据**：影响用户 flow 时，必须存在可执行 `.workflow.ts`，并在业务实现前于目标测试中观察到由预期行为缺口导致的失败（Red），不是 selector、fixture、UAC、构建或环境失败；实现后同一 workflow 必须 Green，并验证 trace/evidence、Main/Core/Worker 销毁、8888 释放及系统副作用恢复。若是补历史缺口，必须在临时 detached worktree 对修复前提交运行同一测试取得 retrospective Red，再在当前提交取得 Green；禁止用故障注入冒充历史 Red。
- **E2E 与语言无关**：真实 Electron workflow 保持应用当前语言，不为测试自动切换语言。业务交互和断言只使用公共 `data-automation-id`、协议值、DOM 状态属性或测试自产数据；禁止用英文/中文显示文案、翻译后的 `aria-label` 或 CSS class 定位交互或判断 Green。翻译文本本身只允许在独立 i18n workflow 中验证。
- **E2E workflow 双语注释**：可执行 `.workflow.ts` 必须在 setup / arrange、用户操作、业务断言、evidence / teardown 等逻辑分块前写简短的中英文成对注释，说明该分块验证什么、为何存在，方便不同语言的 reader 理解。注释用于解释步骤意图，不逐行复述代码；中英文必须表达同一语义。
- **状态与文档约束**：只有 unit/integration Green 而缺真实 E2E Red/Green 时，只能标记“代码完成 · 待 E2E”，不得勾选“已完成”、更新 Inventory 为 passed，或在 Handover 宣称 flow 验收完成。若 E2E 暂因 UAC/凭据/平台条件阻塞，记录为 blocked，并写明需要的人工步骤与恢复命令。
- **可读性优先于聪明**：命名直白、控制流线性、避免为省几行而牺牲可理解性。宁可多一个语义清晰的名字，不要一个塞满逻辑的表达式。
- **命名用具体动词，不用泛化动词**：`apply` / `handle` / `process` / `manage` 这类词不说明做了什么。方法名要让调用点自解释；布尔参数尤其可疑，`setX(true)` 读者必须回看签名，拆成两个动词方法（`startX()` / `stopX()`）通常更好。
- **相关方法相邻**：同一职责的方法排在一起；成对操作（start/stop、open/close、drain/restore）紧挨着；公开入口紧跟它自己的私有辅助。读者不应为了拼出一条完整流程在文件里来回跳。

## 交互与命令契约（全仓适用，不限于 Settings）

- **一个交互对应一个流程**
	- UI 上每个按钮、开关和交互流程，都必须对应后端一条语义单一的命令或方法。
	- 不同的用户意图不得合并进同一入口，即使它们最终改写同一份状态。
	- 命令名直接说明它做什么；调用点读起来就应该等于用户在界面上做的那件事。
- **分层边界：Main 收敛，Core 分派**
	- Main / IPC / Preload 允许一个控件对应一条带 payload 的命令，开关控件本身就是一个交互。
	- Core 的 `entry.ts` 必须按 payload 分派到语义单一的方法；禁止在一个方法里用 `if (enabled)` 兼顾正反两种语义。
	- 分派写在 command handler 里，不写在 entry 方法内部。
- **禁止隐式编码多重语义**
	- 不用 `null`、空数组、可选参数或魔法值同时表达两件正交的事。
	- 配置（configure）与开关（enable / disable）是不同语义，必须用各自的字段或命令表达。
	- 参数命名描述**行为**而非调用场景；读者不应为了理解差异去回溯调用方。
- **正交状态各自独立**
	- 一个字段只表达一个维度；发现某字段需要「同时表示 A 和 B」时，拆成两个字段。
	- 不要为绕开这种编码而引入影子字段去缓存被覆盖的值。
- **只为真实产品能力保留代码路径**
	- 产品不提供的操作不得在后端保留分支，也不得靠测试专用参数维持。
	- 测试需要的能力要么提升为正式命令，要么改测试去用真实产品路径。

## 语言

- 始终使用**中文**进行交流、说明和分析（含思路讲解、方案权衡、代码评审与结论）。
- 代码、标识符、命令、文件路径、API 名称等保持原文，不做翻译。

## 命名（全仓适用：Main / Preload / Renderer / Proxy Core / packages）

- **类实例名与类名同步**
	- 变量、字段、构造函数/方法参数、对象属性使用类名的 camelCase 全名，不用简称。
	- `Core` 前缀不例外：`new CoreApplication()` → `coreApplication`。
	- 测试 fixture、替身和局部变量同样适用：`new FakeRpcPort()` → `fakeRpcPort`。
- **保留有意义的角色名**
	- 名称若表达「哪一个 / 什么角色」而非类型，保留语义名，如 `mainWindow`、`downloadAbortController`。
	- 同作用域的同类实例必须区分角色，如 `exportHost`/`importHost`、`requestWriter`/`responseWriter`。
- **容器与数据字段按内容命名**
	- `Map`/`Set`/`Promise`/`RegExp`/`TypedArray` 使用内容名，如 `zipByName`、`ruleIds`。
	- DTO 和协议字段保持契约语义，如 `entries`、`query`、`options`；不套用实例命名。
- **安全执行改名**
	- 跨文件一律使用语言服务 rename，以同步 import、解构别名和 `{ signal }` 简写。
	- 单文件正则的词边界须排除 `-`、`/`、`.`。
	- 字符串或注释含同名文本时，逐处精确替换并用 grep 复核。
	- 脚本化替换必须显式以 UTF-8 写入并校验；禁止使用会默认写入 ANSI 的 PowerShell `Set-Content`。
- **测试目录与文件命名**
	- 每个 owning 模块的 Vitest 测试统一放在 `tests/unit/` 或 `tests/integration/`；`tests/` 根目录不放可执行测试或测试 helper。
	- `unit/` 只放不跨真实进程、网络、文件系统、数据库或 worker 边界的测试；跨任一真实边界的测试放 `integration/`。
	- fixture、fake 与 helper 跟随使用它的测试层放置，不新增 `tests/shared/`；确有跨层复用时，优先拆成各层语义明确的 helper。
	- 测试文件按行为命名为 `*.test.ts`，不再用 `.unit.test.ts` 或 `.integration.test.ts` 重复目录已经表达的层级。
	- `e2e-workflow-tests/`、`packaged-smoke/`、`installer/`、`visual-parity/` 是独立测试套件，不归入 unit/integration 目录。
	- `apps/desktop/tests/e2e-workflow-tests/workflows/` 下的可执行workflow必须按owning feature分目录，如`workflows/capture/*.workflow.ts`、`workflows/breakpoints/*.workflow.ts`；根目录不放可执行spec，不得把不同feature平铺混在一起。目录已表达feature，文件名只写行为（`capture/detail-body-fill.workflow.ts`），不再重复成`capture/capture-detail-body-fill.workflow.ts`。跨feature流程归主要用户入口的owning feature，公共driver/lab只放`fixtures/`。

## Frontend Styling

- **滚动不得被无故禁用**：除非用户明确要求，BodyViewer、编辑器、列表、树、菜单和详情面板等内容面必须在内容溢出时支持滚轮、触控板与键盘滚动；不得用 `overflow: hidden`、隐藏scrollbar或组件配置关闭其应有滚动。仅外壳裁切、图标、圆角clip和单行ellipsis可使用hidden，且不能吞掉内容面的滚动事件。
- **嵌套滚动必须链式交接**：内层滚动到顶部/底部后，继续同方向滚动必须交给外层容器，不得永久消费wheel。Monaco等第三方编辑器必须显式关闭边界wheel吞噬（例如 `alwaysConsumeMouseWheel: false`），并用真实wheel交互测试验证内层滚动与边界后的外层滚动两段行为。

- **Design authority**
	- `design-vite/` mockups and tokens are the **single source of truth**.
	- `design-vite/design-system.md` is the authoritative token/component spec.
	- Use `.github/skills/ui-design-mockup/` for every UI creation, change, or review; keep `design-vite/` and its `shots/` in sync.
- **Existing designs**
	- Reproduce every existing `design-vite/` view one-to-one in layout, spacing, color, typography, radii, and interaction states.
	- The mockup outranks tool convenience; approximations are not acceptable.
- **New designs**
	- First verify whether Ant Design v6 can provide the interaction and exact styling.
	- Customize in this order: official props → ConfigProvider tokens → semantic `classNames`/`styles` slots.
	- If Ant Design can match exactly, design to what it can render and then implement it.
	- Otherwise, self-build with colocated CSS Modules and design tokens; never hack `.ant-*` private DOM or accept visual compromise.
	- Use Ant Design for hard-to-rebuild interactions (`Splitter`, `Popover`/`Dropdown`, `Tooltip`, `Tabs`, `Segmented`) only when exact matching remains possible.
- **Tokens and CSS**
	- Use shared ConfigProvider and `:root[data-theme]` tokens for colors, spacing, and radii; match `design-vite/design-system.md` exactly and do not hardcode drifting values.
	- Vite-native CSS Modules plus design tokens are the default. Add Tailwind, Less, Sass, or another design system only with explicit user approval of a demonstrated need.
	- Limit global CSS to reset, root design variables, typography, and accessibility media queries.
	- Keep feature/component styles in colocated `*.module.css` files with semantic class names such as `.recording`, `.matchRow`, and `.methodChip`.
- **Shared controls and assets**
	- Reuse and extend primitives under `apps/desktop/src/renderer/components/` for repeated controls and rows: IconButton, Button, Switch, Select, InputBox, MethodBadge, StatusBadge, SectionHeader, StatItem, Count, MenuItem, Splitter, and NavItem.
	- Each primitive uses its own `Component/Component.tsx` and `Component.module.css`; do not reimplement it inside a feature.
	- Use Lucide or installed Ant Design icons for controls, not handwritten inline SVG.
	- Custom SVG/PNG/ICO/ICNS is allowed for product identity.

## Renderer Structure

- **目录所有权**
	- `app/`：应用壳和导航。
	- `features/`：Traffic 等产品工作区。
	- `components/`：共享 UI primitives。
	- `theme/`：Ant Design 主题配置。
	- `styles/`：最小全局样式。
- **进程边界**
	- Renderer 组件不得访问 Electron/Node。
	- 只能通过 typed `window.interceptor` Preload API 通信。
- **组件文件**
	- 一个 `.tsx` 只导出一个主组件。
	- 子组件即使仅供父组件使用，也拆到同目录独立文件。
	- 组件文件只包含 JSX 和自身 hooks。
- **纯函数**
	- 放在 feature 的 `utils.ts`，不留在组件文件底部。
	- 只有跨 feature 复用时才提升到 `components/share/`。
- **组件样式**
	- CSS 与 `.tsx` 一一对应，每个组件使用同名 `*.module.css`。
	- 本仓统一采用组件独立 CSS，不在同目录组件间共享样式文件。
	- 少量重复优于多人共改的公共大文件。
- **尺寸规则**
	- 分栏宽度、面板高度等容器相关值只作初始值，并随 splitter 和窗口缩放 clamp。
	- 行高、控件尺寸和弹层宽度等结构尺寸保持设计值。
	- 拖拽上限由 `总宽 - 对侧最小宽 - 轨道宽` 推导，不设人为 max 常量。

## Proxy Core Module Structure

- **Facade**
	- Each domain lives under `apps/proxy-core/src/proxy-core/<module>/` and has a real `entry.ts`.
	- `entry.ts` defines and exports exactly one `<ModuleName>Service` that owns the module.
	- Do not move that class into `*-service.ts` and turn `entry.ts` into a barrel re-export.
- **Ownership and module names**
	- A module name states exactly what it owns; prefer a longer precise name over generic `storage`, `connection`, or `manager`.
	- `capture/` → `CaptureService`: volatile Exchange/Body for the current recording.
	- `workspace/` → `WorkspaceService`: low-frequency app and feature config in `workspace.sqlite`.
	- `tls-probe/` → `TlsProbeService`: handshake probes only.
	- Keep injected instance, field, and parameter names aligned with the class throughout the dependency chain.
- **Module root**
	- Contains only `entry.ts`, `README.md`, and subdirectories; no loose implementation files.
	- `internal/`: owned implementation classes.
	- `interfaces/index.ts`: explicit interface/type declarations.
	- `utils/index.ts`: stateless functions.
	- `tests/`: tests.
	- `host/` and `worker/`: worker-thread code, each with its own `entry.ts`.
- **Internal names**
	- Do not repeat the module name in subdirectory filenames or classes.
	- Use `capture/internal/exchange-store.ts` → `ExchangeStore`, not `CaptureExchangeStore`.
	- Keep a qualifier only to avoid bare generic names such as `Store`, `Host`, or `Manager`; for example, `diagnostics/worker/record-store.ts` → `RecordStore`.
- **Errors and constants**
	- Put all module Error subclasses in one `internal/errors.ts`; never split them by file or define them inline.
	- Keep Error names self-describing across modules because CoreApplication matches `error.name`.
	- Omit `internal/errors.ts` when the module has no errors.
	- Put module constants in `internal/constants.ts`; put cross-module constants in `proxy-core/constants.ts`.
- **Class shape**
	- Keep at most one class per TypeScript file.
	- Add a concise responsibility comment to every property and method, including private members and test helper classes.
- **Dependencies and test doubles**
	- Depend on the concrete owning class, not a structural interface that mirrors it.
	- Each module has one long-lived instance, so collaborators use types such as `CaptureService`, `CaptureEventQueue`, or `WorkspaceService`.
	- Do not add narrowing mirrors such as `CaptureSink` or `GrpcStorageReader`; they break go-to-definition and hide the actual owner.
	- Test doubles extend the real class and override only the behavior under assertion.
	- Reserve interfaces for plain data shapes and capabilities with genuinely multiple production implementations.
- **Documentation and entry renames**
	- Every module has a `README.md` covering ownership, main class, internal structure, and dependencies.
	- Update that README in the same change whenever module responsibility changes.
	- A host/worker entry rename must also update the Proxy Core build script, runtime resolver, tests, and documented bundle paths.
	- Run a real worker build/test after such a rename.

## Validation

- **During implementation**
	- Run the cheapest focused check that can falsify the current change.
- **At feature or stage completion**
	- Run the complete typecheck/unit/package/smoke/screenshot validation once.
	- Do not run the complete suite after every small edit.
- **At high-risk boundaries**
	- Run package/security checks earlier only when Main, Preload, IPC, Fuses, CSP, or packaging boundaries change.

## Progress And Documentation

- **Session start**
	- Every new session or agent MUST read `architecture/HANDOVER.md`, then `architecture/platform/processes.md`, before planning or editing code.
- **Documentation ownership**
	- `architecture/` is the single documentation root; `architecture/README.md` is its index.
	- `HANDOVER.md`: tracked commit, one flat task list for completed and incomplete work, plus separate operational reference sections.
	- `platform/`: implemented cross-feature architecture.
	- `features/`: per-feature design.
	- `backlog/`: `TODO.md`, `idea.md`, and `research.md` for known gaps and unpromised long-term candidates.
- **Handover quality**
	- Start `architecture/HANDOVER.md` with the tracked commit hash.
	- Keep all completed and incomplete work in exactly one flat task list, using status labels such as completed, pending implementation, pending validation, pending acceptance, or blocked.
	- Keep non-task material such as operational constraints, validation commands, and maintenance rules in separate sections; do not represent them as unchecked tasks.
	- Flattening is structural only: preserve the complete existing information. Never shorten, merge away, or omit facts merely to make Handover smaller.
	- A task item may contain multi-line details, evidence, commands, risks, links, and maintenance notes when needed for completeness.
	- Do not add separate sections for completed work, pending work, working tree, handoff order, exact next action, or main task.
	- Links to owning `platform/*.md`, `features/*.md`, or `backlog/*.md` supplement rather than replace required context.
- **Current-state boundaries**
	- Keep `architecture/platform/*.md` limited to implemented code and boundaries.
	- Put unvalidated plans in `architecture/backlog/research.md` or the feature document's 与当前实现的差异 section.
- **TODO table status model**
	- `architecture/backlog/idea.md` 的 `Status` 只允许三种互斥状态与固定图标：`✅ 已完成`、`🔄 进行中`、`⏳ 未开始`；禁止再使用 checkbox、部分完成、代码完成、待验证、待设计等第二套顶层状态。
	- `Description` 必须先描述目标，再以 `Steps:` 列出该 work item 相关阶段及当前状态。基础词汇包括：`待设计`、`设计完成`、`代码待完成`、`代码已完成`、`待自动验证`、`自动验证完成`、`待 Developer 人工验证`、`待 UAC 验证`、`已完成`；这不是封闭枚举，真实 flow 需要时可增加 `待协议设计`、`待安全审查`、`blocked by <reason>` 等具体、可验证的阶段。同一语义必须全表使用同一词汇，不得为了套用基础词汇而歪曲真实状态；不适用阶段不列出。
	- `TDD` 只记录总体测试完成度及 `Code / Unit / Integration / E2E / Design/Parity` 矩阵，不在 `Status` 重复测试细节。`✅` 表示已完成，`🔄` 表示部分完成或待后续验证，`❌` 表示未完成，`➖` 表示当前 work item 不适用。
	- 顶层 `✅ 已完成` 仅在 Description 的必要阶段与 TDD 的必要测试均完成时使用；仍缺真实 E2E、人工验收或 UAC 的条目必须为 `🔄 进行中`。尚未开始设计、实现和验证的条目使用 `⏳ 未开始`。
	- TODO 使用带 `colgroup` 的 HTML table 固定列宽和最小总宽，窄预览允许横向滚动；`Description / TDD / Root cause / Solution` 单元格使用真正的 `<ul><li>`，不使用 `• + <br>` 模拟列表。图片只放在 `Description` 并限制宽度，避免撑坏列布局。
- **Synchronization**
	- At milestone boundaries, or when the user explicitly asks, update the tracked commit and task statuses in `architecture/HANDOVER.md`, affected `architecture/*.md`, and commands in `README.md`.
	- If the stage boundary is unclear, ask before synchronizing these documents.
- **Work item commit boundary**
	- 默认一个完整 work item 对应一个自洽 commit，以提高 PR 可读性和 review 便利性；不同 work item 不混入同一 commit。
	- 同一 work item 的契约文档、TDD Red、实现、Green、evidence 与完成状态在全部闭环后一起提交；不要为中间文档、测试骨架、Red 或 checkpoint 分别创建碎片 commit，除非用户明确要求保存中间进度。
	- 可以在本地按 work item 连续创建多个 commit，但不要每个 commit 后立即 push；当前约定的全部 work item 完成后再统一 push，除非用户明确要求提前 push。
- **Before committing**
	- Review the staged diff first.
	- Update `architecture/HANDOVER.md`, affected `architecture/*.md`, and `README.md` as applicable.
	- Commit only after the documentation matches the change.