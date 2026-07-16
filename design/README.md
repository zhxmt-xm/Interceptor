# Interceptor Design

产品 UI 的**设计稿工作区**。所有 feature 合并在单个可交互 SPA(`app/`)里,内含可渲染的设计稿、截图脚本与导出图,作为落地代码的一比一还原依据。

## 目录约定

```
design/
├── design-system.md         # 权威视觉规范(颜色/排版/尺寸/组件/交互)
├── README.md                # 本文件
└── app/                     # 唯一的可交互设计稿 SPA(所有 feature 合并于此)
    ├── index.html           # 外壳 + 所有 feature 视图(tv/mv/sv)+ overlay
    ├── app.css              # 令牌 + 外壳 + 各 feature 样式(按 [data-view]/.v-* 作用域)
    ├── app.js               # 状态控制：侧栏导航/主题/折叠/overlay/向导/页签/弹窗 + window.__setState
    ├── sprite.js            # 注入 SVG 图标 sprite
    ├── shoot.mjs            # Playwright 截图:framed + full(滚动全展开)
    └── shots/               # 导出图:shots/<theme>/<feature>/<variant>.png(light/dark 顶层分开)
```

规则:

- **所有 feature UI 都合并在 `design/app/` 这一个 SPA 里**,不再每个 feature 一个目录。加/改 feature 就改 `index.html` + `app.css`(必要时 `app.js` 的 `NAV`)。
- 状态统一由 `window.__setState({view,theme,sidebar,overlay,step,tab,pop,themeui,langui,lang,pop2})` 驱动（`tab`=Inspector 页签，`pop`=打开筛选/加动作弹窗，`themeui`/`langui`=底部主题/语言切换器变体，`lang`=当前语言，`pop2`=打开底部主题/语言 flyout）：人点击侧栏 / 右下角可收起的控件面板切换，截图脚本用同一接口参数化驱动。
- 所有视觉取值以 [design-system.md](./design-system.md) 为准;设计稿与代码都引用同一套 token。字体走 Google Fonts CDN,渲染时等 `networkidle`。
- 这些是**设计资产**,非产品运行代码;落地到 `apps/desktop` 后可保留供回归比对。

## 生成/更新设计图

```powershell
node design/app/shoot.mjs   # 渲染 SPA 所有状态,输出到 app/shots/<theme>/<feature>/
node design/app/shoot.mjs --feature=import-export  # 只更新一个 feature,保留其他 shots
```

依赖已随仓库存在的 `@playwright/test` + 系统 Edge(`channel: 'msedge'`),无需额外安装浏览器。

## 相关

- 生成/迭代设计稿的完整流程与陷阱见 `ui-design-mockup` skill(`.github/skills/ui-design-mockup/`)。
- SPA 内含的 feature 视图(均有 light/dark,截图存于 `app/shots/`):
  - **capture** — 捕获列表 + Inspector + omni 筛选 + 可折叠活动栏 + 拖拽 splitter
  - **rules** — 统一规则(Matcher + Rewrite / Map Local / Map Remote / Block / Throttle / Breakpoint action)
  - **composer** — 构造 / 重放请求 + 响应面板
  - **breakpoints** — 运行时暂停队列 + 编辑请求 / 响应 + 放行
  - **settings** — Proxy / Certificates / Appearance / Storage / Privacy / Updates
  - **diagnostics** — 命令诊断表格 + action 时间线
  - **first-run**(overlay)— 首次引导向导(欢迎 → 代理 → 信任 CA → 完成)
  - **import-export**(overlay)— HAR / 无损原生归档导出对话框

## 落地 Stage 映射

设计稿一次性维护，产品代码按 Server/Contract 可用性分步落地；未到对应 Stage 的数据和操作必须保持 disabled/unavailable，不能用假数据填满设计稿状态。

| 设计视图/区域 | 产品落地 Stage |
| --- | --- |
| 共享 Shell、导航、主题、Capture 空态、Inspector 占位、真实 CoreProcessStatus | M2/T2.0 |
| Settings / Appearance | M2/T2.0 |
| Settings / Storage | M2/T2.6 |
| Capture 列表、omni 筛选、基础 Inspector | M4 |
| Settings / Certificates、HTTPS 状态 | M5/T5.6 |
| Capture HTTP/2 Inspector 增量 | M6/T6.5 |
| Rules、Composer、Breakpoints、Connection/TLS | M8 |
| Capture WebSocket / gRPC Inspector 增量 | M9 |
| Import-export、Settings / Privacy、Diagnostics | M10 |
| First-run、Settings / Proxy、Emergency Repair | M11/T11.3–T11.5 |
| 全部已实现视图的 packaged 视觉回归 | M12 |
| Settings / Updates、更新通知与进度 | M13/T13.4 |
