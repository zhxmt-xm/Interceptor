# Interceptor Design

产品 UI 的**设计稿工作区**。所有 feature 合并在单个可交互的 Vite + React SPA 里，内含可渲染的设计稿、截图脚本与导出图，作为落地代码的一比一还原依据。

## 目录约定

```text
design-vite/
├── design-system.md         # 权威视觉规范（颜色/排版/尺寸/组件/交互）
├── README.md                # 本文件
├── index.html               # React 挂载点
├── vite.config.ts           # CSS Modules 配置为 generateScopedName: '[local]'，保留语义类名
├── icons/                   # 从系统提取的真实应用图标位图（visual-parity 也直接读它）
├── shoot.mjs                # Playwright 截图：framed + full（滚动全展开）
├── shoot-scenes.mjs         # 当前主题 switcher 的场景截图
├── shots/                   # 当前设计截图：light/dark feature 矩阵 + scenes
├── tools/
│   ├── design-preview.mjs   # build + preview，返回本地 URL，截图与 parity 共用
│   ├── compare-shots.mjs    # 两个 shots 目录的逐像素回归对比
│   └── check-react.mjs      # 打开一个 URL 并报告运行时错误
└── src/
    ├── main.tsx             # 入口：挂载 DesignApp
    ├── DesignApp/           # 应用壳：组合 Shell / Sidebar / OverlayHost / 各 feature
    ├── Shell/               # Header V2 外壳与底部状态栏
    ├── Sidebar/             # 侧栏导航
    ├── OverlayHost/         # 全局 overlay（https-setup、import-export、tls-compatibility…）
    ├── features/            # Capture / Rules / Composer / Settings / Diagnostics / Boot
    ├── components/          # MonacoBody、MonacoFixture 等共享底座
    ├── state/               # typed DesignState、reducer、data-* 属性映射
    ├── fixtures/            # fixture 渲染器、图标注册表与 generated/ 静态 DOM 数据
    └── styles/              # 全局 token 与 reset
```

规则：

- **所有 feature UI 都合并在这一个 SPA 里**，不再每个 feature 一个目录。
- 一个组件一个文件 + 同名 `*.module.css`，避免全局 class 串扰。
- **图标一律用 `lucide-react`**（经 `src/fixtures/FixtureIcon.tsx` 的 `ICON_BY_ID` 映射）；不手写 SVG sprite、不内联自定义 icon。
- Header V2 是 SPA 唯一布局与已批准落地基线。Header 左侧承载侧栏折叠按钮和 feature 名称，右侧保留全局 Agent toggle 与窗口控制；状态统一放到底部状态栏。**唯一产品与 parity 基准画布为 `1600×900`**，不维护第二套主尺寸。侧栏默认收起，Capture 的全部筛选与搜索位于 list 左侧的可收起筛选分栏。
- 状态统一由 typed `DesignStateProvider` / `window.__setState(patch)` 驱动。人点击 UI 与截图脚本必须驱动同一套状态，不允许只为截图加一条假路径。
- `reduceDesignState` 在收到 `view` 时会重置浮层类瞬态字段；`shoot.mjs` 的重置态也必须列全每个瞬态字段，漏一个就会让某场景的浮层泄漏进之后所有截图。
- `src/fixtures/generated/*` 是**定稿的静态 DOM 快照**，描述旧稿抢救下来的结构；改设计时直接改它或改对应组件，已不存在再生成它的脚本。
- 所有视觉取值以 [design-system.md](./design-system.md) 为准；设计稿与代码都引用同一套 token。字体走 Google Fonts CDN。
- 设计稿要完整实现用户可见的状态与交互（展开、选择、菜单、loading、empty、warning、disabled、成功/失败）；网络、Core、IPC、持久化用 fixture/adapter 模拟，不复制业务后端。
- 这些是**设计资产**，非产品运行代码；落地到 `apps/desktop` 后保留供回归比对。

## 命令

```powershell
npm run dev --workspace @interceptor/design-vite       # http://localhost:5173/
npm run typecheck --workspace @interceptor/design-vite

node design-vite/shoot.mjs                             # 渲染所有状态 → shots/<theme>/<feature>/
node design-vite/shoot.mjs --feature=import-export     # 只更新一个 feature，保留其他 shots
node design-vite/shoot-scenes.mjs                      # 更新主题 switcher 场景

node design-vite/shoot.mjs --feature=capture --variant=inspector-sidebar-expanded --theme=dark
node design-vite/shoot.mjs --feature=capture --variant=inspector-sidebar-expanded --theme=light
node design-vite/shoot.mjs --feature=capture --variant=inspector-sidebar-collapsed --theme=light
node design-vite/shoot.mjs --feature=capture --variant=rule-filter-auth --theme=light

node design-vite/tools/compare-shots.mjs <baselineDir> [feature]
```

`inspector-sidebar-*`生成指定主题、侧栏状态的Headers详情图，`rule-filter-auth`生成选中Auth Rule的详情图。`--variant`与`--theme`按完整名称筛选；指定`--variant`时不清理同目录的其他截图，不省略它来补单张基准。

`compare-shots.mjs` 是回归工具：改动前先把 `shots/` 另存一份，改完重出再拿它当基线对比，差异图写到 `shots-diff/`。**百分比会骗人**（侧栏图标全丢时只报约 1%），必须看差异图；**多张图差异值完全相同，说明是同一个公共元素，不是多个独立缺陷**。

截图依赖已随仓库存在的 `@playwright/test` + 系统 Edge（`channel: 'msedge'`），无需额外安装浏览器。不在每次小改后重出全量截图；只在用户明确要求或一个设计里程碑结束时生成并评审。

## 相关

- 生成/迭代设计稿的完整流程与陷阱见 `ui-design-mockup` skill（`.github/skills/ui-design-mockup/`）。
- React 实现与设计稿的几何/像素一致性验证见 `apps/desktop/tests/visual-parity/`，它直接驱动本 SPA 的 preview server。
- SPA 内含的 feature 视图（均有 light/dark，截图存于 `shots/`）：
  - **capture** — 左侧筛选分栏 + 捕获列表 + Inspector + 两道 splitter；Breakpoint 已作为流量状态并入此视图（workbar manager、paused rows、Request/Response editor、future-traffic notice）
  - **rules** — 统一规则（Matcher + Rewrite / Map Local / Map Remote / Block / Breakpoint action）
  - **composer** — 可嵌套命名目录的 Collection 分栏 + 多请求文档标签 + URL/Send 行 + 请求编辑区（Query/Headers/Body/Auth）+ 响应区（Body/Headers/Cookies/Timing）
  - **settings** — Proxy / AppContainer access / TLS passthrough / Certificates / Appearance / Storage / Privacy / Updates
  - **diagnostics** — 命令诊断表格 + action 时间线
  - **playground** — 独立全屏Web人工验收工作台：Capture优先双页面、39项协议场景、在线MCP目录、Raw JSON、完整交换与手工结论
