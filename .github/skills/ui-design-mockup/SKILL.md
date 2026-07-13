---
name: ui-design-mockup
description: 'Create and iterate high-fidelity UI design mockups for the Interceptor desktop app before writing product code. Use when: designing or redesigning a screen/feature UI, exploring visual styles/themes/layouts, producing design images or screenshots for review, drawing a new feature UI, or updating the visual design system. Produces self-contained HTML mockups rendered to PNG via Playwright, organized under design/<feature>/, following the Interceptor design system. DO NOT use for implementing the design in React — this is the design/mockup phase only.'
---

# UI Design Mockup (Interceptor)

在写任何产品代码前,用**自包含 HTML 设计稿 + Playwright 截图**快速产出并迭代高保真 UI,供用户评审。落地到 React 是另一个阶段,不在本 skill 范围。

## 何时使用

- 设计或重做某个界面/feature 的 UI;探索配色/主题/布局风格。
- 需要给用户"看图定方案"(生成几版对比图)。
- 更新设计系统 token 后重新出图。

## 产物组织(必须遵守)

- 设计稿放 `design/<feature>/`,三件套:`mockup.html` + `shoot.mjs` + `shots/*.png`。
- 视觉取值一律引用 `design/design-system.md`(权威 token:颜色/排版/尺寸/组件/交互)。
- 目录约定与生成命令见 `design/README.md`。参考已定稿实现:`design/traffic/`。

## 流程

1. **建 mockup.html(自包含)**:内联 `<style>` + 内联 SVG `<symbol>` sprite;主题用 `.app[data-theme="light|cool|warm"]` 的 CSS 变量,严格对齐 `design-system.md`;用真实感示例数据(真实 host/状态码/大小/耗时),不要 Lorem。顶部放隐藏的切换器(主题/侧栏/状态)便于截图脚本驱动。
2. **状态切换用 class/attr**:如 `.app.expanded/.collapsed`、`data-theme`、`.showpop`;截图脚本通过 `page.evaluate` 切换。
3. **写/复用 shoot.mjs**:参考 `design/traffic/shoot.mjs`——相对路径解析 `mockup.html`、输出到 `./shots/`、每个状态一张 PNG。
4. **生成**:`node design/<feature>/shoot.mjs`。
5. **评审**:用 `view_image` 逐张查看,按用户反馈改 `mockup.html` 后重跑,直到定稿。

## 关键陷阱(务必遵守,均已踩过)

- **集成浏览器视口被固定在 ~853px 宽,`setViewportSize` 对大画布无效**。1280 宽的 app 居中会跑到负坐标、侧栏被切。→ **不要**用 viewport clip 截大画布;改用 Playwright **元素级截图** `locator('.app').screenshot()`。
- 元素级截图会卡"waiting for element to be stable"。→ 截图前注入 `*{transition:none!important;animation:none!important}`、把 `body` 改 `align-items:flex-start`、隐藏切换器(`.controls,.caption{display:none}`),元素即稳定。
- **CSS Grid 的 `1fr` 轨道默认 `min-width:auto`,会被 `nowrap` 文本(host/URL)撑破导致整页横向溢出**。所有可能被撑破的 `1fr` 写成 `minmax(0,1fr)`;容器加 `overflow:hidden` 兜底。
- **VS Code 内置浏览器的 page 句柄频繁失效**(`Page ... not found`)。→ 截图走**终端脚本** `node shoot.mjs`,用 `chromium.launch({ channel: 'msedge' })`(系统 Edge,免下载),比 `open_browser_page` + `run_playwright_code` 稳。
- 图标用内联 Lucide 风格 SVG symbol(`stroke 1.9`、round cap),`use href="#i-…"` 复用;不要用会导致图标不居中的写法(如 Ant Segmented 同时传 icon+label)。
- 字体走 Google Fonts CDN(`Inter` + `JetBrains Mono`),`shoot.mjs` 用 `waitUntil:'networkidle'` + `document.fonts.ready` 等加载完再截。

## 参考

- 设计规范:`design/design-system.md`
- 目录约定:`design/README.md`
- 已定稿范例(含 6 张状态图):`design/traffic/`
