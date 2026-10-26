# 布局

> 返回 [设计系统索引](README.md)

## 布局(Traffic 为参考基准)

- **唯一产品与 parity 基准画布**：`1600 × 900`。Agent Side Panel 在该尺寸下使用 `440px` 右侧 grid 栏，
  全局侧栏默认收起。Design PNG、Design DOM、Renderer viewport 与产品默认窗口必须使用同一尺寸，禁止维护
  一套 `1280 × 800` 主基线造成几何与像素比较失真。
- 更小窗口只作为响应式运行能力，不拥有第二套设计基线。Agent 打开时始终参与整体 grid 布局，主工作区
  同步缩窄；不得覆盖 Capture / Rules 的任何内容。空间不足时用户可关闭 Agent，后续响应式设计再决定
  是否收起 Filters / Inspector 等次级栏位。
- Header V2 是设计 SPA 唯一且已批准的落地基线。侧栏从顶部到底部保持完整，右侧内容区按自然流依次为窗口 Header、主体和状态栏；业务布局不得依赖浮动、绝对定位或 `z-index` 拼接。
- **侧栏默认收起**（`60px` 图标轨道），由用户点击 Header 折叠按钮展开为 `220px`。默认收起把横向空间让给 Capture 的筛选分栏。
- 主体横向布局为 `filters / splitter / list / splitter / inspector`：
  - 侧栏收起 + 筛选分栏展开：`60px(side) · 232px(filters) · 1px · minmax(0,1fr)(list) · 1px · 500px(inspector)`
  - 侧栏收起 + 筛选分栏收起：`60px(side) · minmax(0,1fr)(list) · 1px · 500px(inspector)`
  - 侧栏展开时只把首列换成 `220px`，其余轨道不变。
- 右侧窗口 Header 高 `46px`，左侧只保留 30px 侧栏折叠按钮和当前 feature 名称，右侧依次为全局 Agent toggle 与窗口控制；不得放 feature 图标、其他业务命令、分隔线或 Core/revision/count 等状态摘要。所有状态统一进入底部 30px 状态栏。左侧原始 Logo/品牌继续属于完整侧栏，不复制到 Header；六个 feature 使用同一骨架、间距和 padding。
- **Capture 不再有独立的 54px feature 工作栏**：文本搜索与全部结构化筛选进入左侧筛选分栏，Recording / Clear / Import / Export 全部归入列表上方的 `40px` 工具栏。多出的垂直空间全部归请求列表。
- 其余 feature 的业务命令仍放在内容区首行或最接近其作用对象的 `40px` 工具栏中。工具栏按纵向自然流排列，行内使用横向 flex；Rules 的 revision/applied/数量状态留在 Header，Search 输入位于内容工具栏左侧，New/Apply/More 位于右侧。
- **所有会被 `nowrap` 文本撑破的 `1fr` 轨道必须写 `minmax(0,1fr)`**,否则整页横向溢出。
- Inspector 默认略宽于 list(内容更多);list 收窄后长 host 省略,由 **splitter 拖拽**与 Inspector 的完整 URL 兜底。
