# Interceptor Agent Guidelines

## 语言

- 始终使用**中文**进行交流、说明和分析（含思路讲解、方案权衡、代码评审与结论）。
- 代码、标识符、命令、文件路径、API 名称等保持原文，不做翻译。

## 实现原则

- 避免过度设计：只做被直接要求或明确必要的改动或非常相关的改动，如果有更好的建议可以询问用户。
- 不要为不可能发生的场景添加错误处理；只在系统边界做校验。
- 不要为一次性操作创建辅助函数或抽象。
- 改动尽量彻底，不要为了兼容旧代码增加更多的垃圾代码，代码可以彻底优化、简化，提高可读性

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

## Proxy Core Module Structure

- Organize each domain under `apps/proxy-core/src/proxy-core/<module>/` around a real `entry.ts` facade. The module's owning Service/Engine class lives directly in `entry.ts`; do not keep a separate `*-service.ts` and use `entry.ts` as a barrel re-export.
- Except for `entry.ts`, prefix module-owned implementation files with the module name (for example `har-document.ts` and `grpc-invalid-cursor-error.ts`). Apply the same prefix to tests. Module constants use `<module>-constants.ts`. In `host/` and `worker/` subdirectories, the owning entry is also named `entry.ts`; their remaining implementation files keep the `host-*` and `worker-*` prefixes.
- Put all module-local explicit `interface` and `type` declarations in `interfaces/index.ts`. Put all stateless utility functions in `utils/index.ts`; implementation class files must not accumulate free helper functions.
- Keep at most one class per TypeScript file. Add a concise responsibility comment to every class property and method, including private members and test helper classes.
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

- Every new session or agent MUST begin by reading `stages/HANDOVER.md`, then `stages/ARCHITECTURE.md`, before planning or editing code.
- Historical Stage records, the former progress index, and the complete product plan live under `stages/archived/`. Read them only when historical or product-design context is needed; do not resume routine progress tracking there.
- Keep `stages/HANDOVER.md` detailed enough for a context-free new session or agent: current stage, completed work, code locations, working tree, remaining work, risks, validation, and exact next action. The handover must instruct readers to read `stages/ARCHITECTURE.md`.
- Keep `stages/ARCHITECTURE.md` limited to code and boundaries that are currently implemented. Planned architecture remains in the product plan and stage files until validated in code.
- Update `stages/HANDOVER.md`, `stages/ARCHITECTURE.md`, and `README.md` commands at milestone boundaries, or when the user explicitly asks.
- If a stage boundary is unclear, ask before synchronizing those documents.
- Before committing code, first review the staged diff and update `stages/HANDOVER.md`, `stages/ARCHITECTURE.md`, and `README.md` as applicable so they reflect the change; commit only after the docs are in sync.