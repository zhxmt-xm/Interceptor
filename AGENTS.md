# Interceptor Agent Guidelines

## Frontend Styling

- The mockups and tokens under `design/` are the **single source of truth** for all UI styling. Every implemented screen MUST match its view in the single `design/app/` design SPA **one-to-one** — layout, spacing, color, typography, radii, and interaction states. An approximate look is not acceptable.
- `design/design-system.md` is the authoritative token/component spec. The `ui-design-mockup` skill (`.github/skills/ui-design-mockup/`) is the required workflow for creating, changing, or reviewing any UI: read it before design work and refer to it whenever drawing or updating a feature UI, then keep the `design/app/` SPA (and its `shots/`) in sync.
- **One-to-one fidelity to the design outranks tool convenience.** Ant Design v6 is the component/interaction base, but it must never force a visual compromise:
  1. Prefer official component props (`size`, `shape`, `variant`, `color`, `icon`, `tooltip`, `orientation`, `disabled`) → ConfigProvider global/component tokens → semantic `classNames`/`styles` slots.
  2. If Ant Design cannot reproduce the design exactly through the above, **self-implement that piece** with colocated CSS Modules + the design tokens until it matches exactly. Do NOT ship an approximation, and do NOT hack `.ant-*` private/internal DOM (dimensions, padding, line-height, transforms, state styles) to force the look — replace the component with a self-built one instead.
  3. Reach for Ant Design where its interaction is genuinely hard to rebuild (`Splitter` drag, `Popover`/`Dropdown` positioning, `Tooltip`, `Tabs`, `Segmented`) **and** the design can be matched via props/tokens/slots.
- Drive colors, spacing, and radii from the shared design tokens (ConfigProvider + `:root[data-theme]`) matching `design/design-system.md` exactly; never hardcode ad-hoc values that drift from the tokens.
- Do not introduce Tailwind, Less, Sass, or a second design system unless the user explicitly approves a demonstrated need. Vite-native CSS Modules plus the design tokens are the default.
- Keep global CSS limited to reset, root design variables, typography, and accessibility media queries. Feature and component styles belong in colocated `*.module.css` files.
- Use the shared tool-control primitives for icon actions and mode selectors. See `apps/desktop/src/renderer/components/tool-controls/README.md`.
- Use Lucide or the installed Ant Design icon set instead of handwritten inline SVG for controls. Product identity assets may use custom SVG/PNG/ICO/ICNS.

## Renderer Structure

- Organize Renderer code by ownership:
  - `app/` for the application shell and navigation.
  - `features/` for product workspaces such as Traffic.
  - `components/` for reusable UI primitives.
  - `theme/` for Ant Design theme configuration.
  - `styles/` for the minimal global stylesheet.
- Keep Electron/Node access out of Renderer components. Renderer communicates only through the typed `window.interceptor` Preload API.

## Validation

- During implementation, run the cheapest focused check that can falsify the current change.
- Run complete typecheck/unit/package/smoke/screenshot validation once at feature or stage completion, not after every small edit.
- Run earlier package/security checks only when Main, Preload, IPC, Fuses, CSP, or packaging boundaries change.

## Progress And Documentation

- Every new session or agent MUST begin by reading `stages/PROGRESS.md`, then follow its reading order before planning or editing code.
- Keep `stages/PROGRESS.md` as a concise stage index and current snapshot; do not accumulate implementation or debugging history there.
- Record each stage's scope, task status, implementation, decisions, risks, validation, and remaining work in its matching `stages/M*.md` file.
- Treat `stages/桌面网络调试代理完整方案.md` as the authoritative product design for every stage; read the relevant chapters before starting that stage.
- Keep `stages/HANDOVER.md` detailed enough for a context-free new session or agent: current stage, completed work, code locations, working tree, remaining work, risks, validation, and exact next action. The handover must instruct readers to read `stages/ARCHITECTURE.md`.
- Keep `stages/ARCHITECTURE.md` limited to code and boundaries that are currently implemented. Planned architecture remains in the product plan and stage files until validated in code.
- Update `stages/PROGRESS.md`, the active stage file, `stages/HANDOVER.md`, `stages/ARCHITECTURE.md`, and `README.md` commands at stage or milestone boundaries, or when the user explicitly asks.
- If a stage boundary is unclear, ask before synchronizing those documents.