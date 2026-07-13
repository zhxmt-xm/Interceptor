# Interceptor Design

产品 UI 的**设计稿工作区**。每个 feature 一个子目录,内含可渲染的静态设计稿、导出图与截图脚本,作为落地代码的一比一还原依据。

## 目录约定

```
design/
├── design-system.md         # 权威视觉规范(颜色/排版/尺寸/组件/交互)
├── README.md                # 本文件
└── <feature>/               # 每个 feature 一个子目录(如 traffic、rules、composer)
    ├── mockup.html          # 自包含静态设计稿(内联 CSS + SVG sprite,可切换主题/状态)
    ├── shoot.mjs            # 用 Playwright 把各状态导出为 PNG
    └── shots/               # 导出的设计图(*.png)
```

规则:

- 新 feature 的设计稿一律放在 `design/<feature>/`,沿用 `mockup.html` + `shoot.mjs` + `shots/` 三件套。
- `mockup.html` 必须**自包含**(不依赖构建/网络,字体可走 Google Fonts CDN),并通过 CSS 变量实现 `design-system.md` 的主题 token。
- 所有视觉取值以 [design-system.md](./design-system.md) 为准;设计稿与代码都引用同一套 token。
- 这些是**设计资产**,非产品运行代码;落地到 `apps/desktop` 后可保留供回归比对。

## 生成/更新设计图

```powershell
node design/<feature>/shoot.mjs   # 渲染 mockup.html,输出到 shots/
```

依赖已随仓库存在的 `@playwright/test` + 系统 Edge(`channel: 'msedge'`),无需额外安装浏览器。

## 相关

- 生成/迭代设计稿的完整流程与陷阱见 `ui-design-mockup` skill(`.github/skills/ui-design-mockup/`)。
- 当前已定稿:[traffic](./traffic/)(捕获列表 + Inspector + omni 筛选 + 可折叠活动栏 + 拖拽 splitter)。
