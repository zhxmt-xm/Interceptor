# Interceptor Agent Guidelines

## 语言

- 始终使用**中文**进行交流、说明和分析（含思路讲解、方案权衡、代码评审与结论）。
- 代码、标识符、命令、文件路径、API 名称等保持原文，不做翻译。

## 实现原则

- 避免过度设计：只做被直接要求或明确必要的改动或非常相关的改动，如果有更好的建议可以询问用户。
- 不要为不可能发生的场景添加错误处理；只在系统边界做校验。
- 不要为一次性操作创建辅助函数或抽象。
- **改动必须彻底**：重构或替换一个模块时，旧实现要**整体删除**，不保留兼容层、过渡分支、`legacy*`/`old*` 命名或"以后可能还要用"的死代码。一个能力只留一条代码路径。
- **优先简化而不是叠加**：能删掉的抽象就删掉，能拉平的层级就拉平，能少一个状态就少一个状态。新增代码前先问「有没有办法让现有流程更短」。
- **可读性优先于聪明**：命名直白、控制流线性、避免为省几行而牺牲可理解性。宁可多一个语义清晰的名字，不要一个塞满逻辑的表达式。

## 命名（全仓适用：Main / Preload / Renderer / Proxy Core / packages）

- **指向类实例的名字与类名同步**：变量、字段、构造函数/方法参数、对象属性一律用类名的 camelCase 全名，**不用简称**——`new CaptureService()` → `captureService`，`connection: RpcConnection` → `rpcConnection`，`controller: AbortController` → `abortController`，`db: DatabaseSync` → `databaseSync`。`Core` 前缀不作特例（`new CoreApplication()` → `coreApplication`）。这条约束的目的就是让读者从名字直接跳到类定义。
- **测试同样适用**：fixture、测试替身与局部变量都跟其类型同步（`new RecordingCaptureService()` → `recordingCaptureService`、`new FakeRpcPort()` → `fakeRpcPort`、`new BodyWriterFixture()` → `bodyWriterFixture`）。
- **名字承载类型名没有的信息时保留语义名**：当名字回答的是「哪一个 / 什么角色」而不是「什么类型」，不要机械替换——`mainWindow: BrowserWindow`、`coreProcess: UtilityProcess`、`insertStatement: StatementSync`、`downloadAbortController`。同作用域多个同类实例必须靠名字区分（`first`/`second`、`exportHost`/`importHost`、`requestWriter`/`responseWriter`）。
- **通用容器与数据字段按语义命名**：`Map`/`Set`/`Promise`/`RegExp`/`TypedArray` 的名字表达内容（`zipByName`、`ruleIds`、`referenced`）；DTO 与协议字段是数据契约，不套用实例命名（`entries: ZipCentralEntry[]`、`query: URLSearchParams`、`options: XxxOptions`）。
- **执行改名的工具约束**：跨文件改名一律用编辑器语言服务的 rename（会同步 import、解构别名与 `{ signal }` 简写）；单文件正则的词边界必须排除 `-` `/` `.`，且字符串/注释里出现同词时禁止整词替换，改用精确模式逐条替换后 grep 复核；任何脚本化文本替换必须显式 UTF-8 写入（PowerShell `Set-Content` 默认 ANSI，会不可逆破坏中文注释）并在之后校验。

## Frontend Styling

- The mockups and tokens under `design/` are the **single source of truth** for all UI styling. Once a screen has a view in the single `design/app/` design SPA, its implementation MUST match that view **one-to-one** — layout, spacing, color, typography, radii, and interaction states. An approximate look is not acceptable.
- **Pick the design approach by whether a design already exists:**
  - **Existing feature that already has a `design/app/` view** — reproduce that view one-to-one; the mockup is authoritative and outranks tool convenience.
  - **A new feature, or a screen/interaction with no design yet** — first evaluate whether Ant Design v6 can deliver the interaction and whether ConfigProvider tokens, official props and semantic `classNames`/`styles` slots can restyle it into the app's visual language **without hacking `.ant-*` private DOM**. If they can, **prefer the Ant Design-achievable form and author the `design/app/` mockup to match what Ant Design can actually render**, then implement it. Only fall back to a self-built piece when Ant Design cannot reach the target without hacking private DOM.
- `design/design-system.md` is the authoritative token/component spec. The `ui-design-mockup` skill (`.github/skills/ui-design-mockup/`) is the required workflow for creating, changing, or reviewing any UI: read it before design work and refer to it whenever drawing or updating a feature UI, then keep the `design/app/` SPA (and its `shots/`) in sync.
- **When reproducing an existing design, one-to-one fidelity outranks tool convenience.** Ant Design v6 is the component/interaction base, but it must never force a visual compromise:
  1. Prefer official component props (`size`, `shape`, `variant`, `color`, `icon`, `tooltip`, `orientation`, `disabled`) → ConfigProvider global/component tokens → semantic `classNames`/`styles` slots.
  2. If Ant Design cannot reproduce the design exactly through the above, **self-implement that piece** with colocated CSS Modules + the design tokens until it matches exactly. Do NOT ship an approximation, and do NOT hack `.ant-*` private/internal DOM (dimensions, padding, line-height, transforms, state styles) to force the look — replace the component with a self-built one instead.
  3. Reach for Ant Design where its interaction is genuinely hard to rebuild (`Splitter` drag, `Popover`/`Dropdown` positioning, `Tooltip`, `Tabs`, `Segmented`) **and** the design can be matched via props/tokens/slots.
- Drive colors, spacing, and radii from the shared design tokens (ConfigProvider + `:root[data-theme]`) matching `design/design-system.md` exactly; never hardcode ad-hoc values that drift from the tokens.
- Do not introduce Tailwind, Less, Sass, or a second design system unless the user explicitly approves a demonstrated need. Vite-native CSS Modules plus the design tokens are the default.
- Keep global CSS limited to reset, root design variables, typography, and accessibility media queries. Feature and component styles belong in colocated `*.module.css` files. Name CSS Module classes semantically after the component or element they style (e.g. `.recording`, `.matchRow`, `.methodChip`), never cryptic abbreviations.
- Use the shared UI primitives directly under `apps/desktop/src/renderer/components/` (IconButton, Button, Switch, Select, InputBox, MethodBadge, StatusBadge, SectionHeader, StatItem, Count, MenuItem, Splitter, NavItem) for repeated controls, toggles, selectors and rows. Each primitive lives in its own subfolder (`Component/Component.tsx` + `Component.module.css`); extend the library rather than re-implementing a control inside a feature.
- Use Lucide or the installed Ant Design icon set instead of handwritten inline SVG for controls. Product identity assets may use custom SVG/PNG/ICO/ICNS.

## Renderer Structure

- Organize Renderer code by ownership:
  - `app/` for the application shell and navigation.
  - `features/` for product workspaces such as Traffic.
  - `components/` for reusable UI primitives.
  - `theme/` for Ant Design theme configuration.
  - `styles/` for the minimal global stylesheet.
- Keep Electron/Node access out of Renderer components. Renderer communicates only through the typed `window.interceptor` Preload API.
- **一个 `.tsx` 只导出一个主组件。** 子组件即使只被一个父组件用，也拆成同目录下的独立文件（`ResponsePane/ResponseTimingPane.tsx`），不要把三五个组件塞进一个文件。组件文件里只放 JSX 与它自己的 hooks。
- **纯函数一律放 feature 的 `utils.ts`**（`formatBytes`、`relativeTime`、`maxResponseHeight`），不留在组件文件底部。跨 feature 复用的才上升到 `components/share/`。
- **CSS 与 `.tsx` 一一对应**：每个组件文件配一份同名 `*.module.css`，同目录下的多个组件**不共用**一份 CSS。要么全 feature 共用一份、要么每个组件独立一份，不要两种混着来；本仓选每个组件独立。少量重复的 `.pane`/`.bar` 好过一个谁都在改的大文件。
- **区分「画布尺寸」与「结构尺寸」**：设计稿里受容器影响的区域尺寸（分栏宽度、面板高度）只能当作**初始值**，配 splitter 拖拽 + 窗口缩放时 clamp；行高、控件尺寸、弹层宽度这类结构性尺寸沿用设计稿固定值。**拖拽上限由对侧的最小尺寸推导**（`总宽 - 对侧最小宽 - 轨道宽`），不要拍一个人为的 max 常量。


## Proxy Core Module Structure

- Organize each domain under `apps/proxy-core/src/proxy-core/<module>/` around a real `entry.ts` facade. The module's owning Service class lives directly in `entry.ts`; do not keep a separate `*-service.ts` and use `entry.ts` as a barrel re-export.
- **A module directory contains only `entry.ts`, `README.md` and subdirectories** — never loose implementation files next to `entry.ts`. Every implementation class the module owns goes in `internal/`; explicit `interface`/`type` declarations in `interfaces/index.ts`; stateless functions in `utils/index.ts`; tests in `tests/`; worker-thread pieces in `host/` and `worker/` (each with its own `entry.ts`).
- **Inside those subdirectories, do NOT prefix filenames or class names with the module name** — the path already says it. `capture/internal/exchange-store.ts` exports `ExchangeStore`, not `capture/capture-exchange-store.ts` exporting `CaptureExchangeStore`. Keep a qualifier only when stripping the prefix would leave a bare generic word (`Store`, `Host`, `Manager`): `diagnostics/worker/record-store.ts` → `RecordStore`.
- **All Error subclasses of a module go in a single `internal/errors.ts`** — never one file per error class and never inline in an implementation file. Error class names stay self-describing across modules (`InvalidHarError`, `RevisionConflictError`) because `error.name` is matched at the CoreApplication boundary. A module with no errors has no errors file.
- Module constants go in `internal/constants.ts`; cross-module constants in `proxy-core/constants.ts`.
- Keep at most one class per TypeScript file. Add a concise responsibility comment to every class property and method, including private members and test helper classes.
- **Depend on the concrete class, not a structural interface that mirrors it.** Every module owns a single long-lived instance, so a collaborator's type must be that owning class (`CaptureService`, `CaptureEventQueue`, `WorkspaceService`) — narrowing interfaces like `CaptureSink` or `GrpcStorageReader` break go-to-definition and hide who actually runs. Test doubles `extends` the real class and `override` only what the test asserts. Keep `interface` for plain data shapes and for the rare capability with genuinely multiple production implementations.
- **A module name must state what the module actually owns, and its `entry.ts` exports exactly one `<ModuleName>Service`.** `capture/` → `CaptureService` holds the volatile in-memory Exchange/Body of the current recording; `workspace/` → `WorkspaceService` is the app-wide store for low-frequency global and per-feature config (settings, Composer collections) in `workspace.sqlite`; `tls-probe/` → `TlsProbeService` only performs a handshake probe. Prefer a longer precise name over a short generic one (`storage`, `connection`, `manager`), and keep instance/field/parameter names in sync with the class name all the way down the injection chain.
- **Every module directory has a `README.md`** stating what it owns, its main class, how the pieces fit, and which modules it depends on. Update it in the same change that alters the module's responsibility.
- A host/worker entry rename must update the Proxy Core build script, runtime resolver, tests, and documented bundle paths together, then run a real worker build/test.

## Validation

- During implementation, run the cheapest focused check that can falsify the current change.
- Run complete typecheck/unit/package/smoke/screenshot validation once at feature or stage completion, not after every small edit.
- Run earlier package/security checks only when Main, Preload, IPC, Fuses, CSP, or packaging boundaries change.

## Linux Dev Container / Codespace

The repo targets Windows/macOS desktops but is developed here on a Linux dev container (Ubuntu 24.04, x86_64). Notes below are verified on this environment.

- **Node version**: the project pins Node `24.18.0` (`.nvmrc`) with `engine-strict=true`, so a lower default (e.g. `24.14.0`) makes `npm install` fail with `EBADENGINE`. Fix with `nvm install 24.18.0 && nvm use 24.18.0`; a freshly opened terminal resets to the default Node, so re-run `nvm use 24.18.0` before Node commands.
- **Dependencies**: install from the repo root with `npm install` (npm workspaces). The `esbuild` and `tls-impersonate` install scripts stay unapproved, but the platform-specific optional deps still provide their binaries, so `build`/`test` work regardless.
- **Unit tests** (`npm run test:unit`, Vitest `environment: node`) are platform-agnostic and always runnable — OS-specific code (e.g. `TrustStoreService`, whose `supported()` is `win32`/`darwin` only and returns `false` on Linux) is exercised via injected `platform` + fake runners, so nothing touches the real OS.
- **Integration tests** (real `worker_threads` + `node:sqlite` + HTTP/2) use `describe.skipIf(!existsSync(workerBundle))` and are skipped until the worker bundles exist. Run `npm run build:core` first; then `proxy-core` runs its full suite. These rely on cross-platform Node primitives.
- **Smoke test** (`npm run test:smoke`) packages the app and drives it over CDP, so it needs a display and a packaged Linux build: `sudo apt-get install -y xvfb`, then `npm run package`, then `xvfb-run -a npm run test:smoke --workspace @interceptor/desktop`. If the packaged Electron reports missing shared libraries, run `npx playwright install-deps`. On Linux this validates the **Linux** package only, not the Win/macOS artifacts.
- **Design-parity / visual check** (`node apps/desktop/tests/visual-parity/parity.mjs`) launches `chromium.launch({ channel: 'msedge' })`, so install Edge once with `npx playwright install msedge` (run from `apps/desktop`, needs sudo). All parity-only code and artifacts live under `apps/desktop/tests/visual-parity/`; the harness injects a fake `window.interceptor` before navigation and drives Renderer state through normal UI interactions, so never add parity fixtures or DEV-only state setters to product Renderer code. Playwright auto-adds `--no-sandbox --headless` in the container; SwiftShader software rendering makes a full run take several minutes. Linux font rendering differs from the design baselines (font-weight/size/subpixel), which inflates the pixel diff and per-element deltas — treat parity output here as a diagnostic reference, not a strict gate; authoritative parity is on Windows/macOS.

## Progress And Documentation

- Every new session or agent MUST begin by reading `architecture/HANDOVER.md`, then `architecture/platform/processes.md`, before planning or editing code.
- `architecture/` is the single documentation root, indexed by `architecture/README.md`: `HANDOVER.md` (current state), `platform/` (cross-feature architecture that is already implemented), `features/` (per-feature design), `backlog/` (`TODO.md`, `idea.md`, and `research.md` for known gaps and unpromised long-term candidates).
- Keep `architecture/HANDOVER.md` detailed enough for a context-free new session or agent: current stage, completed work, code locations, working tree, remaining work, risks, validation, and exact next action.
- Keep `architecture/platform/*.md` limited to code and boundaries that are currently implemented. Unvalidated plans belong in `architecture/backlog/research.md` or in the feature doc's 与当前实现的差异 section.
- Update `architecture/HANDOVER.md`, the affected `architecture/*.md`, and `README.md` commands at milestone boundaries, or when the user explicitly asks.
- If a stage boundary is unclear, ask before synchronizing those documents.
- Before committing code, first review the staged diff and update `architecture/HANDOVER.md`, the affected `architecture/*.md`, and `README.md` as applicable so they reflect the change; commit only after the docs are in sync.