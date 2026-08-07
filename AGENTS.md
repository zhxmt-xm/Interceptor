# Interceptor Agent Guidelines

## 实现原则

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- 不要为不可能发生的场景添加错误处理；只在系统边界做校验。
- **可读性优先于聪明**：命名直白、控制流线性、避免为省几行而牺牲可理解性。宁可多一个语义清晰的名字，不要一个塞满逻辑的表达式。

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

## Frontend Styling

- **Design authority**
	- `design/` mockups and tokens are the **single source of truth**.
	- `design/design-system.md` is the authoritative token/component spec.
	- Use `.github/skills/ui-design-mockup/` for every UI creation, change, or review; keep `design/app/` and its `shots/` in sync.
- **Existing designs**
	- Reproduce every existing `design/app/` view one-to-one in layout, spacing, color, typography, radii, and interaction states.
	- The mockup outranks tool convenience; approximations are not acceptable.
- **New designs**
	- First verify whether Ant Design v6 can provide the interaction and exact styling.
	- Customize in this order: official props → ConfigProvider tokens → semantic `classNames`/`styles` slots.
	- If Ant Design can match exactly, design to what it can render and then implement it.
	- Otherwise, self-build with colocated CSS Modules and design tokens; never hack `.ant-*` private DOM or accept visual compromise.
	- Use Ant Design for hard-to-rebuild interactions (`Splitter`, `Popover`/`Dropdown`, `Tooltip`, `Tabs`, `Segmented`) only when exact matching remains possible.
- **Tokens and CSS**
	- Use shared ConfigProvider and `:root[data-theme]` tokens for colors, spacing, and radii; match `design/design-system.md` exactly and do not hardcode drifting values.
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
	- `HANDOVER.md`: current state and session continuity.
	- `platform/`: implemented cross-feature architecture.
	- `features/`: per-feature design.
	- `backlog/`: `TODO.md`, `idea.md`, and `research.md` for known gaps and unpromised long-term candidates.
- **Handover quality**
	- Keep `architecture/HANDOVER.md` sufficient for a context-free new session or agent.
	- Include the current stage, completed work, code locations, working tree, remaining work, risks, validation, and exact next action.
- **Current-state boundaries**
	- Keep `architecture/platform/*.md` limited to implemented code and boundaries.
	- Put unvalidated plans in `architecture/backlog/research.md` or the feature document's 与当前实现的差异 section.
- **Synchronization**
	- At milestone boundaries, or when the user explicitly asks, update `architecture/HANDOVER.md`, affected `architecture/*.md`, and commands in `README.md`.
	- If the stage boundary is unclear, ask before synchronizing these documents.
- **Before committing**
	- Review the staged diff first.
	- Update `architecture/HANDOVER.md`, affected `architecture/*.md`, and `README.md` as applicable.
	- Commit only after the documentation matches the change.