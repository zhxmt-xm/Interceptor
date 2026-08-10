---
name: ui-design-mockup
description: 'Create and iterate high-fidelity UI design mockups for the Interceptor desktop app before writing product code. Use when: designing or redesigning a screen/feature UI, exploring visual styles/themes/layouts, producing design images or screenshots for review, drawing a new feature UI, or updating the visual design system. Produces a single interactive design SPA (design-vite/) rendered to PNG via Playwright, following the Interceptor design system. DO NOT use for implementing the design in React product code — this is the design/mockup phase only.'
---

# UI Design Mockup (Interceptor)

在写任何产品代码前，用**一个可交互的设计稿 SPA + Playwright 截图**快速产出并迭代高保真 UI，供用户评审。所有 feature 合并在单个 `design-vite/` 应用里（侧栏点击切换 feature，顶部切主题/折叠），既能手点也能被截图脚本参数化驱动。落地到 `apps/desktop` 是另一个阶段，不在本 skill 范围。

## 何时使用

- 设计或重做某个界面/feature 的 UI；探索配色/主题/布局风格。
- 需要给用户「看图定方案」（生成几版对比图）。
- 更新设计系统 token 后重新出图。

## 产物组织（必须遵守）

- **唯一设计稿是 `design-vite/`**：Vite + React 19 + TypeScript + CSS Modules。
  - `src/DesignApp/` 应用壳，`src/Shell/`、`src/Sidebar/`、`src/OverlayHost/` 是共享外壳。
  - `src/features/<Feature>/` 每个 feature 一个目录，一个组件一个文件 + 同名 `*.module.css`。
  - `src/state/` 是 typed `DesignState` + reducer + `data-*` 映射。
  - `src/fixtures/` 是 fixture 渲染器、`ICON_BY_ID` 图标注册表与 `generated/` 静态 DOM 快照。
- 新增/修改任何 feature UI 都在这里改，不再新建 per-feature 目录，也不再有第二套设计路径。
- 视觉取值一律引用 `design-vite/design-system.md`（权威 token：颜色/排版/尺寸/组件/交互）。
- 目录约定与命令见 `design-vite/README.md`。

## 流程

1. **加/改 feature 组件**：应用只有一套共享 Window Header；feature 主区域与状态栏由 `DesignApp` 按 `view` 装配，侧栏条目在 `src/Sidebar/` 里定义。用真实感示例数据（真实 host/状态码/大小/耗时），不要 Lorem。overlay（向导/对话框）加到 `src/OverlayHost/`。
2. **样式写在同名 `*.module.css`**：`vite.config.ts` 配了 `generateScopedName: '[local]'` 以保留语义类名，所以**全局 class 仍可能串扰**——新增类名前先 grep 是否撞名。令牌与 reset 在 `src/styles/`。
3. **状态全部经 typed `DesignState`**：人点击 UI 与 `window.__setState(patch)` 驱动同一套状态，不允许只为截图加一条假路径。新增场景就往 `DesignState` 加字段，并在 `state/utils.ts` 的 `INITIAL_DESIGN_STATE` 给默认值。
4. **图标一律用 `lucide-react`**：经 `src/fixtures/FixtureIcon.tsx` 的 `ICON_BY_ID` 映射。不手写 SVG sprite、不内联自定义 icon。lucide 没有完全对应的图形时，选语义最近的 lucide 图标，不要自己画。
5. **生成**：`node design-vite/shoot.mjs`。两趟——framed（1280×800 应用态）+ full（注入 CSS 展开所有滚动区，把隐藏内容也截全）。截图覆盖每个 feature × 浅/深 + 关键折叠 + 当前 overlay。主题/语言 switcher 场景另由 `node design-vite/shoot-scenes.mjs` 生成。
6. **评审**：用 `view_image` 逐张查看，按用户反馈改组件后重跑，直到定稿。

## 关键陷阱（务必遵守，均已踩过）

- **`shoot.mjs` 的重置态必须列全每一个瞬态字段**。漏掉一个（踩过 `ctxmenu`）就会让某个场景的浮层泄漏进它之后的所有截图。症状是**几十张图同时出现差异且数值完全相同**——那是同一个公共元素，不是几十个独立缺陷。
- **命令式 DOM 同步与 React state 会打架**。fixture adapter 里按整个 state 重跑的同步函数会把用户点击产生的 class 重置掉（踩过 Capture 的 Edge filter「点了没反应」）。这类同步只能依赖它真正对应的那个 state 字段。
- **Monaco 的 `wordWrap` 会按 webfont 就绪前的 fallback 度量换行**，导致文本顶部对齐、越往下偏移越大。`window.__monacoRelayout()` 必须先 `monaco.editor.remeasureFonts()` 再 `layout()`。
- **`ICON_BY_ID` 里缺一个 id 会直接抛错并让整页崩溃**，表现为 `shoot.mjs` 卡在等 `__monacoReady` 直到超时。加新图标时同步登记。
- **集成浏览器视口被固定在 ~853px 宽，`setViewportSize` 对大画布无效**。1280 宽的 app 居中会跑到负坐标、侧栏被切。→ **不要**用 viewport clip 截大画布；改用 Playwright **元素级截图** `locator('.app').screenshot()`。
- 元素级截图会卡「waiting for element to be stable」。→ 截图前注入 `*{transition:none!important;animation:none!important}`、把 `body` 改 `align-items:flex-start`、隐藏切换器，元素即稳定。
- **CSS Grid 的 `1fr` 轨道默认 `min-width:auto`，会被 `nowrap` 文本（host/URL）撑破导致整页横向溢出**。所有可能被撑破的 `1fr` 写成 `minmax(0,1fr)`；容器加 `overflow:hidden` 兜底。
- **VS Code 内置浏览器的 page 句柄频繁失效**（`Page ... not found`）。→ 截图走**终端脚本**，用 `chromium.launch({ channel: 'msedge' })`（系统 Edge，免下载），比 `open_browser_page` + `run_playwright_code` 稳。
- 字体走 Google Fonts CDN（`Inter` + `JetBrains Mono`）。**不要换成 `@fontsource-variable` 的可变字体**，字重渲染与 CDN 静态字重对不上。
- **改完要验证有没有改坏别的**：改动前把 `design-vite/shots/` 另存一份，改完重出后 `node design-vite/tools/compare-shots.mjs <另存目录>`。百分比会骗人（侧栏图标全丢时只报约 1%），必须看 `shots-diff/` 里的差异图。

## 参考

- 设计规范：`design-vite/design-system.md`
- 目录约定与命令：`design-vite/README.md`
- 落地实现的一致性验证：`.github/skills/ui-parity-check/`
