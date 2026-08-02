# Interceptor Design

产品 UI 的**设计稿工作区**。所有 feature 合并在单个可交互 SPA(`app/`)里,内含可渲染的设计稿、截图脚本与导出图,作为落地代码的一比一还原依据。

## 目录约定

```
design/
├── design-system.md         # 权威视觉规范(颜色/排版/尺寸/组件/交互)
├── README.md                # 本文件
└── app/                     # 唯一的可交互设计稿 SPA(所有 feature 合并于此)
    ├── index.html           # Shell V2 外壳 + 所有 feature 主视图/状态栏 + overlay
    ├── app.css              # 令牌 + 外壳 + 各 feature 样式(按 [data-view]/.v-* 作用域)
    ├── app.js               # 状态控制：侧栏导航/主题/折叠/overlay/页签/弹窗 + window.__setState
    ├── monaco.js            # 正文查看器底座：给 [data-monaco] 挂载只读 Monaco + 四套主题
    ├── sprite.js            # 注入 SVG 图标 sprite
    ├── shoot.mjs            # Playwright 截图:framed + full(滚动全展开)
    ├── shoot-scenes.mjs     # 当前主题 switcher 的场景截图
    └── shots/               # 当前设计截图:light/dark feature 矩阵 + scenes
```

规则:

- **所有 feature UI 都合并在 `design/app/` 这一个 SPA 里**,不再每个 feature 一个目录。加/改 feature 就改 `index.html` + `app.css`(必要时 `app.js` 的 `NAV`)。
- Header V2 是 SPA 唯一布局与已批准落地基线。Header 左侧承载侧栏折叠按钮、feature 名称与该 feature 的一等命令（Capture = Recording + Import/Export），右侧只保留窗口控制；状态统一放到底部状态栏。**侧栏默认收起**，Capture 的全部筛选与搜索位于 list 左侧的可收起筛选分栏。
- 状态统一由 `window.__setState({view,theme,sidebar,filters,filterGroup,filterActive,overlay,tab,pop,lang,pop2,https,scene,settings,repair,update,transfer,fileMenu})` 驱动（`tab`=Inspector 页签，`filters`=筛选分栏展开/收起，`filterGroup`=展开某个默认折叠的 facet 分组，`filterActive`=多条 facet 生效的场景，`pop`=打开 Rules 的加动作弹窗，`lang`=当前语言，`pop2`=打开底部主题/语言 flyout，其余字段驱动当前细节与 overlay 状态）：人点击侧栏 / 右下角可收起的控件面板切换，截图脚本用同一接口参数化驱动。
- 所有视觉取值以 [design-system.md](./design-system.md) 为准;设计稿与代码都引用同一套 token。字体走 Google Fonts CDN,渲染时等 `networkidle`。
- 这些是**设计资产**,非产品运行代码;落地到 `apps/desktop` 后可保留供回归比对。

## 生成/更新设计图

```powershell
node design/app/shoot.mjs   # 渲染 SPA 所有状态,输出到 app/shots/<theme>/<feature>/
node design/app/shoot.mjs --feature=import-export  # 只更新一个 feature,保留其他 shots
node design/app/shoot.mjs --feature=shell-v2       # 更新 Header V2 的六个 workspace + Capture 折叠态
node design/app/shoot-scenes.mjs                   # 更新当前主题 switcher 场景
```

依赖已随仓库存在的 `@playwright/test` + 系统 Edge(`channel: 'msedge'`),无需额外安装浏览器。

## 相关

- 生成/迭代设计稿的完整流程与陷阱见 `ui-design-mockup` skill(`.github/skills/ui-design-mockup/`)。
- SPA 内含的 feature 视图(均有 light/dark,截图存于 `app/shots/`):
  - **capture** — 左侧筛选分栏(搜索 + Protocol/Application/Host/Method/Status/Content type/Rule facet) + 捕获列表 + Inspector + 两道可拖拽 splitter
  - **rules** — 统一规则(Matcher + Rewrite / Map Local / Map Remote / Block / Breakpoint action)
  - **composer** — 构造 / 重放请求 + 响应面板
  - **breakpoints** — 运行时暂停队列 + 编辑请求 / 响应 + 放行
  - **settings** — Proxy / Certificates / Appearance / Storage / Privacy / Updates
  - **diagnostics** — 命令诊断表格 + action 时间线
  - **shell-v2** — 默认 46px Window Header、全高侧栏、内容工具栏与六个 workspace 的明暗主题基线
  - **https-setup**(overlay)— 用户从 TLS tunnel Detail 主动开启的 CA 生成 → 系统信任 → HTTPS 解密流程
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
| Capture 默认系统代理、HTTPS setup、Settings / Proxy、Emergency Repair | M11/T11.3–T11.5 |
| 全部已实现视图的 packaged 视觉回归 | M12 |
| Settings / Updates、更新通知与进度 | M13/T13.4 |
