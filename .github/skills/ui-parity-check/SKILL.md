---
name: ui-parity-check
description: "Verify and debug that an implemented React UI matches its design mockup 1:1 (spacing, size, alignment, color, fonts). USE WHEN: after porting or changing a feature UI to check fidelity; when a screen looks off vs the design; when the user reports mismatched spacing/alignment/size/fonts; when adding a new screen to the parity suite. Drives the design SPA through window.__setState and the renderer through a fake Preload API plus normal UI interactions, then reports per-element geometry deltas (auto-subtracting the design card's 1px border) plus a pixel diff. DO NOT use for creating mockups (that's ui-design-mockup) or for runtime/logic debugging."
---

# UI Parity Check（设计稿一比一还原验证）

用一个**配置驱动的 harness**把 React 实现和 `design/app/` 设计稿放进同一状态,**逐元素量化对比**几何(位置/尺寸)与字体样式,精确定位"哪里差了几像素",不靠肉眼猜。

## 何时使用

- 把某个 feature 从设计稿落地成 React 后,核对还原度。
- 用户反馈"和设计稿不一样"——间距、尺寸、对齐、字体、颜色。
- 往验证套件里新增一个已实现的屏幕。

## 方法论(两条,缺一不可)

1. **自实现为主,Ant 只用于交互难点。** 设计稿 `app.css` 95% 是纯 CSS——把每个值 1:1 搬进 colocated `*.module.css`,用语义组件承载。Ant Design 只用于 Splitter 拖拽 / Popover / Dropdown / Tooltip,且经 ConfigProvider tokens/props 控制,**绝不 hack `.ant-*`**。要精确的地方都是自己的 CSS,才不会被 Ant 卡住。
2. **对比闭环(本 harness)。** 实现 → 跑 harness → 看逐元素差值 → 改 CSS → 重跑,直到差值收敛。

## Harness

- 目录:`apps/desktop/tests/visual-parity/`，其中 `parity.mjs` 是 harness、`parity.config.mjs` 是场景配置、`fake-interceptor.mjs` 是完整 fake Preload API、`renderer-shots/` 是输出。Parity 相关代码和数据不得放进业务 Renderer。
- 运行(仓库根):
  ```
  node apps/desktop/tests/visual-parity/parity.mjs            # 全部 view
  node apps/desktop/tests/visual-parity/parity.mjs --view=capture
  ```
- 它做三件事:
  1. **像素 diff**:renderer 截图 vs `design/app/shots/<...>`,输出 `<view>-<theme>-diff.png`(紫色高亮)。
  2. **逐元素几何**:对每个配置的元素取 `getBoundingClientRect`(相对 shell 根),自动求所有元素偏移的中位数作为**系统偏移**(设计稿 1px 卡片边框)并扣除,只报告真实的 `dx/dy/dw/dh`(`|Δ|≥1px` 标 `!`)。
  3. **字体样式**:对比 `fontSize/fontWeight/color`(不比 `lineHeight` 字符串——用盒高 `dh` 判行高,避免 `normal` vs `px` 假阳性)。
- 运行结束会在终端打印并写入 `visual-parity/parity-report.md`：Overall Summary（总体结论/平均像素 diff/缺失与 flagged/最差元素）、View Summary 和 Element Geometry 明细表；`renderer-shots/` 只保存 PNG。
- 依赖:`pixelmatch` + `pngjs`(devDeps)、`playwright-core`(系统 Edge `channel:'msedge'`)、`vite`(programmatic `createServer` 起 renderer)。

## 前提条件(接入一个项目时需满足)

- **Renderer 走真实 Preload 契约**:harness 在 `page.goto()` 前用 `addInitScript` 注入完整 fake `window.interceptor`；业务组件照常调用窄 API，不包含 parity fixture、`import.meta.env.DEV` 数据分支或测试 setter。
- **状态通过真实 UI 建立**:主题在导航前写 localStorage，view/选中行/tab/表单通过 Playwright 点击、选择和输入完成；不要暴露 `window.__setView/__setTheme` 之类业务侧测试后门。
- **设计稿是可编程 SPA**:`design/app/` 暴露 `window.__setState({view,theme,sidebar,…})`。
- **元素靠唯一可见文本配对**(`getByText(exact)`),两边无需共享 class。文本不唯一/无文本时,给两边加相同 `data-parity="key"` 再按属性配对。

## 加一个新 view(零改 harness)

在 `visual-parity/parity.config.mjs` 的 `views` 里追加，数据放 `visual-parity/fake-interceptor.mjs`，交互写 `rendererNav` / `rendererActions`:
```js
{ id: 'rules', theme: 'light',
  designState: { view: 'rules', theme: 'light', sidebar: 'expanded' },
  rendererNav: 'Rules & Map',
  designShot: 'light/rules/framed.png',
  targets: ['Rules', 'Stub /v1/user', 'Apply changes', /* 唯一文本 */] }
```

## 读输出

- `systematic offset x -1 y -1`:设计稿卡片 1px 边框,已扣除,**不是 bug**。
- `dx/dy/dw/dh`:扣除系统偏移后的真实差异;`dw/dh` 反映尺寸(含行高),`dx/dy` 反映对齐。
- `[fontSize a->b]` 等:字体样式差异。
- 像素 diff 的紫色**含那 1px 全局位移**,偏噪;**逐元素数据才是准信号**。

## 已知陷阱(都真实踩过)

1. **line-height 被 Ant 覆盖**:`<AntApp>` 渲染的 `.ant-app` 用 token `lineHeight`(1.5714)**覆盖 body**——改 body 的 line-height 完全无效(现象:改了结果逐字节不变)。→ 在 shell 根 `.app` 上设**显式值**。**不要用 `normal`**:fontsource 的 Inter Variable 的 `normal`≈1.6,与设计稿 CDN "Inter" 的 `normal`≈1.23 不同,依赖字体 metrics 会不准。
2. **高度链断裂**:`.ant-app` 没有 `height:100%` → `.app{height:100%}` 塌缩成内容高 → app 不填满窗口、`flex:1` 的 spring 失效(底部元素浮空)。→ 给 `<AntApp className>` 设 `height:100%`。
3. **1px 画布边框**:设计稿 `.app` 是带边框+圆角+阴影的卡片,内容从 `(1,1)` 起;真实 app 填满窗口从 `(0,0)` 起 → 全元素 x/y 偏 1px。harness 自动检测并扣除。
4. **字体 metrics 微差**:fontsource Inter Variable vs 设计稿 CDN Inter,字宽/位置有 ~2px 级微差,属可接受(非布局 bug)。
5. **不能写死尺寸**:客户端可缩放。除固定宽的 sidebar,其余用 `minmax(0,1fr)` / 可拖 splitter;app 靠高度链填满窗口。

## 参考

- 设计稿工作流(产出基准):`ui-design-mockup` skill。
- 权威 token:`design/design-system.md`。
