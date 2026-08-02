# Interceptor Design System

> 本文件是 Interceptor 桌面端 UI 的**权威视觉规范**,供设计稿(`design/app/`)与真实落地代码(`apps/desktop`)共同引用。
> 修改视觉语言时先改这里,再同步设计稿与代码。配套流程见 [design/README.md](./README.md) 与 `ui-design-mockup` skill(`.github/skills/ui-design-mockup/`)。

## 设计语言

- 目标:对标 **Linear / Raycast / Proxyman** 的现代桌面工具——克制、精致、信息密度高但有呼吸感。
- **四套时段主题**(合起来是一天的流转):`warm`(清晨·赤陶)· `light`(中午·靛紫,默认)· `ember`(傍晚·琥珀)· `dark`(夜晚·青绿)。`light`/`warm` 为浅色,`dark`/`ember` 为深色。
- 强调色 `--accent` 每主题不同(靛紫 / 青绿 / 赤陶 / 琥珀);语义色(绿/蓝/黄/红)只用于状态,不参与装饰。
- 图标:统一 **Lucide 线性风格**(stroke 1.9、round cap),`1em` SVG;禁止手绘 inline path 之外的随意图标。
- 字体:`Inter`(界面) + `JetBrains Mono`(URL、header、数值等技术文本);数值列用 `font-variant-numeric: tabular-nums`。

## 颜色 Token

四套主题以 CSS 变量表达(设计稿:`.app[data-theme="…"]`;代码:ConfigProvider + `:root[data-theme]`)。浅色(light/warm)用 Ant `defaultAlgorithm`,深色(dark/ember)用 `darkAlgorithm`。

| Token | light(中午) | dark(夜晚) | warm(清晨) | ember(傍晚) |
| --- | --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0c0d11` | `#faf6ef` | `#1b1815` |
| `--chrome`(顶栏/状态栏) | `#fcfcfb` | `#101116` | `#f5efe6` | `#181410` |
| `--sidebar` | `#f8f8f6` | `#0d0e13` | `#f2ebe0` | `#161310` |
| `--panel`(Inspector) | `#ffffff` | `#0f1116` | `#fdfbf7` | `#1e1a16` |
| `--panel-2`(输入/段) | `#f1f1ef` | `#171922` | `#efe7da` | `#26201a` |
| `--filter`(filter 条) | `#faf9f7` | `#0e0f15` | `#f7f2ea` | `#191510` |
| `--hover` | `rgba(20,20,25,.045)` | `rgba(255,255,255,.045)` | `rgba(90,70,40,.05)` | `rgba(240,230,214,.05)` |
| `--sel`(选中行底) | `rgba(106,91,240,.09)` | `rgba(47,212,184,.13)` | `rgba(194,112,58,.12)` | `rgba(217,154,60,.15)` |
| `--sel-line`(选中条) | `#6a5bf0` | `#2fd4b8` | `#c2703a` | `#d99a3c` |
| `--border` | `rgba(20,20,25,.08)` | `rgba(255,255,255,.06)` | `rgba(90,70,40,.10)` | `rgba(240,230,214,.08)` |
| `--border-2` | `rgba(20,20,25,.13)` | `rgba(255,255,255,.11)` | `rgba(90,70,40,.16)` | `rgba(240,230,214,.14)` |
| `--text` | `#1a1b1e` | `#f3f4f8` | `#2c2620` | `#f4eee3` |
| `--text-2` | `#5b5e65` | `#a4abbb` | `#6d6355` | `#bdb4a4` |
| `--text-3` | `#8b8e96` | `#646b7b` | `#9c917f` | `#8b8273` |
| `--accent` | `#6a5bf0` | `#2fd4b8` | `#c2703a` | `#d99a3c` |
| `--accent-soft` | `rgba(106,91,240,.1)` | `rgba(47,212,184,.15)` | `rgba(194,112,58,.12)` | `rgba(217,154,60,.16)` |
| `--green` | `#12a150` | `#3ecf8e` | `#3f8f4f` | `#93c389` |
| `--blue` | `#2570e0` | `#5b9dff` | `#3f7fb0` | `#84b0cf` |
| `--yellow` | `#b6820a` | `#f5c451` | `#b07a1a` | `#dcb968` |
| `--red` | `#e0483a` | `#f26d6d` | `#cf4b3a` | `#e28470` |
| `--purple` | `#8b3fd9` | `#c07cff` | `#9a5cc0` | `#c6a3d8` |

语义映射:GET=`--blue`,POST=`--yellow`,DELETE=`--red`;2xx=`--green`,3xx/1xx(info)=`--blue`,4xx=`--yellow`,5xx=`--red`;录制=`--red`,健康/在线=`--green`。

## 排版

- 字号:base `13`,列表 `12.5`,分组标签 `10.5`(大写 + `letter-spacing .05–.07em` + `--text-3`),mono `11–11.5`,品牌名 `14.5/640`。
- 字重:常规 `450–500`,强调 `550–600`,标签 `650`。
- 对比:key/次要文本用 `--text-2`,值/主内容用 `--text`(Inspector 尤其保证对比);host 用 `--text-2`(不用主色,避免过重)。

## 尺寸与间距

- 圆角:app `16`,面板/输入/omni `9–10`,小控件/badge `6–8`,pill/胶囊 `999`。
- 行/条高度:窗口 Header `46`,Capture 工作栏 `54`,内容工具栏 `40`,omni `38`,statusbar `30`,list header `34`,**list row `52`**(刻意不紧凑),nav `38`。
- 强调色阴影:`0 4px 12px -3px color-mix(in srgb, var(--accent) 55%, transparent)`(logo 等)。

## 布局(Traffic 为参考基准)

- 基准画布 `1280 × 800`。
- Header V2 是设计 SPA 唯一且已批准的落地基线。侧栏从顶部到底部保持完整，右侧内容区按自然流依次为窗口 Header、主体和状态栏；业务布局不得依赖浮动、绝对定位或 `z-index` 拼接。
- **侧栏默认收起**（`60px` 图标轨道），由用户点击 Header 折叠按钮展开为 `220px`。默认收起把横向空间让给 Capture 的筛选分栏。
- 主体横向布局为 `filters / splitter / list / splitter / inspector`：
  - 侧栏收起 + 筛选分栏展开：`60px(side) · 232px(filters) · 1px · minmax(0,1fr)(list) · 1px · 500px(inspector)`
  - 侧栏收起 + 筛选分栏收起：`60px(side) · minmax(0,1fr)(list) · 1px · 500px(inspector)`
  - 侧栏展开时只把首列换成 `220px`，其余轨道不变。
- 右侧窗口 Header 高 `46px`，左侧只保留 30px 侧栏折叠按钮和当前 feature 名称，右侧只保留窗口控制；不得放 feature 图标、业务命令、分隔线或 Core/revision/count 等状态摘要。所有状态统一进入底部 30px 状态栏。左侧原始 Logo/品牌继续属于完整侧栏，不复制到 Header；六个 feature 使用同一骨架、间距和 padding。
- **Capture 不再有独立的 54px feature 工作栏**：文本搜索与全部结构化筛选进入左侧筛选分栏，Recording / Clear / Import / Export 全部归入列表上方的 `40px` 工具栏。多出的垂直空间全部归请求列表。
- 其余 feature 的业务命令仍放在内容区首行或最接近其作用对象的 `40px` 工具栏中。工具栏按纵向自然流排列，行内使用横向 flex；Rules 的 revision/applied/数量状态留在 Header，Search 输入位于内容工具栏左侧，New/Apply/More 位于右侧。
- **所有会被 `nowrap` 文本撑破的 `1fr` 轨道必须写 `minmax(0,1fr)`**,否则整页横向溢出。
- Inspector 默认略宽于 list(内容更多);list 收窄后长 host 省略,由 **splitter 拖拽**与 Inspector 的完整 URL 兜底。

## 组件规范

- **活动栏（侧栏）**：展开 = 图标 + 文字 + 分组标签（WORKSPACE / SESSION）+ 底部 Settings / Language / Theme；折叠 = 纯图标居中。折叠态的 active 只用 `--accent-soft` 圆角底 + `--accent` 图标表示，**不加角标圆点**（右上角圆点留给未来的事件提示，例如断点命中）；Session 的在线绿点不受此限。展开态 active 用 `--accent-soft` 底 + 左侧 3px 竖条。
- **主题 / 语言切换器**（侧栏底部，取代旧 Account）：触发行本身是一条 nav——主题展开为「当前时段图标 + Theme + 强调点」、语言为「地球 + Language + 代码」，折叠时主题只留当前时段图标、语言只留代码。点击弹出 **flyout**：以按钮为锚**向右弹出、底边与按钮底边对齐、留一小段水平间隙**，portal 到 `body` 以逃逸侧栏 `overflow`，点击外部 / Esc 关闭。语言项使用各语言自己的名称；超过可用高度时列表在 420px 内滚动，不改变锚点位置。主题 flyout 四项按**一天时序** Warm→Light→Ember→Dark，图标与文字保持中性色；hover 时从右侧浮现该时段的**中式写意山水**（日月循抛物线：晨左低 → 午中高 → 暮右低 → 夜居中；画面内缩留边 + 左侧 `--panel` 渐变保证标签可读），当前主题显示 `--accent` 勾。
- **Method 徽标**:mono `10.5/600`,`color-mix(field 13–16%, transparent)` 底 + 字段色字,圆角 6。
- **Status**:`6px` 圆点 + mono `12`,用状态语义色。
- **Capture 筛选分栏**（list 左侧，`208px`，`--filter` 底）：Capture 的**唯一筛选入口**，取代旧的 omni pill + Add filter 级联弹层与 list 上方的协议 Segmented。
  - 顶部一行 `40px` 与右侧列表工具栏同轨，内放 `30px` 搜索框（`--panel` 底、左内边距放大镜、右侧 clear），只做自由文本过滤。
  - 下方为可滚动的 facet 分组，**顺序严格跟随 list 表头**（App → Method → Path·Host → Status → Proto → Type），最后接不属于列的 `Rule`：`Application / Method / Host / Status / Protocol / Content type / Rule`。分组头 `28px`，左侧 chevron（折叠时 `-90deg`）、大写分组名、右侧 mono 条目数。
  - **展开规则**：凡是有非 `All` 值生效的分组自动展开；一个都没有时只展开第一个分组。不预设“常用分组”，也不一次展开多组。
  - 条目 `26px`，左侧语义标记（应用 `15px` 系统图标、host 锁图标、Method 徽标、Status 圆点）+ 名称 + 右对齐 mono 计数，**直接点击即生效**，选中用 `--accent-soft` 底 + `--accent` 字。每组首行固定为 `All`，点它清空该组；**`All` 不加任何前置占位，它的文字左边缘与下方条目的最左侧元素（应用图标 / method 框 / 状态圆点）对齐**。组内多选为 OR，组间为 AND。超过 8 条的分组末尾给 `Show N more`。
  - **协议分组区分 HTTP 小版本**：`HTTP/2` / `HTTP/1.1` / `HTTP/1.0` / `WebSocket` / `TLS tunnel`，不再把所有 1.x 归为 `H1`；名称本身已表达版本，不再额外加 mono 标签。
  - **清除分两级**：分组头 hover 时把右侧计数换成一个 `20px` 的 `×`，点它把该组还原为 `All`（该组没有生效值时不出现）；搜索框右侧的 `×` 是**总清除**，同时清空搜索文本与全部 facet。
  - 分栏滚动条默认透明，**只在 hover 分栏时显现**（`8px` 宽、`2px` 透明内边、`--border-2` thumb），避免常驻的竖线干扰筛选项阅读。
  - 分栏可整体收起（连同搜索框）：开关是列表工具栏最左的 `30px` 图标按钮（Lucide `panel-left`），展开时按钮为 `--accent-soft` 激活态；**只要有任何非默认 facet 生效，按钮右上角显示 `7px` `--accent` 圆点 badge**，使用者即使收起分栏也能知道当前列表被过滤。分栏与 list 之间使用与 list↔Inspector 同一套 `1px + 4×40px` splitter。
  - 无命中规则时 Rule 分组不给空列表，而是显示一行说明文字。
- **列表工具栏**（list 上方，`--filter` 底，`40px`）：左侧依次为筛选分栏开关、**Recording**、**Clear**；右侧依次为计数 `18 of 241`、Query parameters、`Import`、`Export`。严格限制在 list 列，相邻图标按钮成组，组内间距 `3px`。
- **Recording 控件**：工具栏里**唯一带文字的控件**（它是关键开关，不能只给图标）：`30px` 高、`8px` 圆角。录制中 = 实心红圆 + `Recording`，`--red 12%` 底；暂停 = 空心灰圈 + `Paused`，`--panel-2` 底；loading 时只把圆换成 spinner、文案不变。状态栏同步显示 `Recording` / `Not recording`。
- **内容区命令**：New/Apply/History/Export 等无需显示当前值的明确命令统一使用 `30×30px` IconButton + tooltip，图标 `15×15px`，连续图标按钮组 gap `3px`；该规格以 Capture 的 Columns/Clear 组为基准，全 feature 共用。Process/Level/Outcome、Break on match 等承载当前值或二元状态的控件保留文字。窗口 Header 不放业务命令。
- **窗口控制**：产品窗口跨平台 frameless；右侧 46px 窗口 Header 是拖拽区，所有 button/input/menu 必须 `no-drag`。最右固定 30px Minimize / Maximize-or-restore / Close 三图标按钮，距右 8px、组内 gap 3px；feature 命令不再进入窗口 Header，统一放各自内容工作栏。Close hover 用轻红色，其他窗口按钮用中性 hover。
- **品牌 Logo**：左上角 30px 渐变方块继续由当前主题 `--accent → --purple` 驱动并使用 Lucide Zap；系统 PNG/ICO/ICNS 使用固定 dark 主题 `#2fd4b8 → #c07cff` 与白色 Zap，保证任务栏/安装器识别稳定。Lucide 依 ISC 许可使用。
- **Proxy readiness 弹层**：自动 Recording、手动 Start 或 Core 重启后，如果 listener 或受支持平台的系统代理未 ready，`capturing` 必须为 false，顶栏显示 Paused、状态栏显示 Not recording，并显示阻塞弹层。结构为 warning 标题、readiness 说明、单一状态行、guarded restore 隐私说明和 Cancel / Proxy & Listener / Enable；只有 Enable 是 primary，禁止静默接管系统设置。Enable 成功且 listener+routing 都 ready 后才允许显示 Recording。
- **filter 条**（已废除）：协议快捷段 `All/H1/H2/WS` 已改由筛选分栏的 Protocol 分组承担，不再在 list 上方保留 Segmented。
- **Capture Header 命令**：Header 不放任何 Capture 业务命令。`Import` 菜单提供 `Import HAR` / `Open Capture`，`Export` 菜单提供 `Export HAR` / `Save Capture`；HAR 是跨工具交换，Interceptor Capture 是完整会话保存，两者不得再表现为同一 Format 切换。菜单以各自的触发按钮为锚、右对齐向下弹出。
- **Segmented 开关**（Body `Auto/Text/JSON/Hex`、Composer 协议、导出 Format 共用）：无轨道、透明容器，只有选中项显示为**实心 `--accent` 圆角块 + 白字**（未选中 `--text-3`，hover `--text-2` + `--hover` 底）。容器 `height 28`、`align-self:center`、`width:max-content`、`gap 2`、`radius 9`；选项 `height 22`、`padding 0 9`、`radius 7`、`font-weight 520`（选中 600）。与同行控件（30px 图标按钮）同一垂直中线。Body mode 左对齐于正文预览。
- **操作按钮**:enabled 一律 `cursor:pointer`;default 用 `--panel` 底 + `--border-2` 边,hover 在 `--panel` 上混入 6% `--text`,不得替换成透明 `--hover`;primary 用 `--accent` 实底 + 白字,hover 按 88% `--accent` + 12% `--text` 提升当前主题下的对比;danger 用中性实底 + 红字/红边,hover 按 10% `--red` + 90% `--panel` 着色。disabled 不保留 primary/danger 强语义色,统一 `--panel-2` 底 + `--border` 边 + `--text-3` 字,`cursor:not-allowed`,且 hover/filter/阴影均不得变化。图标按钮 enabled 可用透明底 + `--hover`,disabled 同样不响应 hover并使用 `not-allowed`。异步操作进行中显示 loading:图标替换为旋转 spinner、文字保持不变并临时阻断点击;录制开关的 loading 只把圆点替换为 spinner、不改 `Recording/Paused` 文案,以避免快速往返时的文字闪烁。
- **list**：列 `App / Method / Path·Host / Status / Proto / Type / Size / Time`；App 是宽 `20px` 的首列，只放 `16px` 系统应用图标，无表头文字、无文字标签，未识别到发起应用时留空不放占位符。主列双行（`gap 4`），**上行是 path**（mono `12.5`、`--text`，因为 host 已能在左侧筛选，path 才是区分请求的主体），**下行是 host**（`11.5`、`--text-3`，带 HTTPS 锁图标）；proto/type/size/time 用 mono。CONNECT tunnel 没有 path，因此保持 host 为主行、加密说明为次行。选中行 `--sel` 底 + 左 2px `--sel-line`。list 宽度不足时按 `Proto/Type → Size/Time` 的顺序逐步隐藏列（这些维度左侧筛选分栏都能到达），禁止横向溢出或把 Path·Host 压到 0。
- **客户端应用图标**：list 首列与 Inspector `General` 的 `Client Application` 行展示发起请求应用的**真实系统图标**（`16×16px`）与系统展示名，不用自画图标或首字母占位。图标总是晚于请求行到达，因此 UI 必须能先在无图标状态下渲染（列表留空、Inspector 只显示名称），**不得为等图标推迟请求上屏**。归属只在 Windows 可得，其他平台首列保留轨道但为空、Inspector 不显示该行。
- **splitter**(list↔inspector):在布局中只占 `1px`，自身绘制 `--border` 竖线；`4×40px` 圆角抓手是同一 flex 中轴上的普通子项，不使用绝对定位或 transform。抓手可溢出到线两侧但不得被相邻面板裁切；hover/拖拽时线与抓手变 `--accent`、抓手拉长到 `52px`。所有 feature 共用这一实现，list 与 Detail 都直接贴线，不保留额外 gutter。
- **分隔与层级**：侧栏右边界、窗口 Header 下边界、状态栏上边界、list↔Inspector 可拖 splitter、List Header 下方与数据行使用低对比 `1px --border`，不使用面板级阴影。Capture 工作栏、Detail method 行、Tabs 和 Detail 正文统一使用 `--panel`；只有左侧 All/H1/Clear 内容工具栏使用 `--filter`。色块之间不画额外 splitter。Tabs 只用 active `--accent` 下划线和正文顶部留白。Detail 小节使用左侧 2px accent 与向右消失的短线。输入和独立浮层仍使用自身边框。
- **Inspector**：**默认关闭**，点击任一请求行才开启，摘要 box 右侧的 Close 关闭后 list 占满剩余宽度。整个 Detail 区域从 method 行到 Tabs、正文都使用 `--panel`，不得出现灰色衬底。头部 method chip + 语法着色 URL（`dom`=text-2 / `path`=text）+ 右侧状态 pill（如 `200 OK` 绿）保持原内容结构，并由独立白色 Request 摘要 box 包裹。外层行与 box 都使用 `40px` 高度，顶部距窗口 Header 留 `10px` 呼吸间距（不再与左侧工具栏强行同轨）；box 左右外间距均为 `14px`，横向 padding `8px / 18px`、`gap:10px`，内容垂直居中。box 使用 9px 圆角和两层无方向偏移的均匀浅阴影，不使用 solid border；阴影四周必须完整，不得由工作栏、splitter、Tabs 或 overflow 裁切。box 与 Tabs 之间使用普通文档流 `6px` 间距，Detail 区域不使用定位、浮动或 `z-index` 拼接。页签为 `Headers / Request / Response / Timing / Cookies / TLS`。Detail 内小节标题使用高对比 `--text-2`、700 weight、左侧 2px accent 标记与向右渐隐短线，不能只靠浅灰大写字。Headers 分区 `General / Response Headers / Request Headers`（`kv` 栅格 `168px / minmax(0,1fr)`，key `--text-2` mono、value `--text` mono，特殊值用 `--accent`/`--green`）；KV key/value 使用 `18px` 行高。可复制 value 的 inline action 在行 hover 时显示，使用 `18×18px` 按钮和 `14×14px` 图标，不增加水平或垂直偏移；必须跟随末尾文字自然换行，不能因 Status 圆点/文本容器是原子 flex 而单独掉到下一行。`Cookie`/`Set-Cookie` 不在 Headers 重复出现，只归入 Cookies tab。Body 预览提供 `Auto / Text / JSON / Hex`：Auto 按 MIME + 内容探测，Text 强制 UTF-8 replacement 文本，JSON 尝试格式化且失败时保留原文，Hex 显示精确字节并随容器宽度重排；任何模式不得横向撑开 Inspector。Timing 只显示持久化的真实 Waiting(TTFB)/Response body 时间段，不伪造 DNS/TLS 阶段。内容区 `overflow-y:auto` 可滚。
- **规则 Header 效果**：Inspector 同时展示规则前后的 header 证据。`set` 的生效新值标记绿色 `Rule set`，被替代旧值保留、加删除线并标记黄色 `Rule replaced`；`append` 只标记新增值，使用蓝色 `Rule appended`；`remove` 保留被删除旧值、加删除线并标记红色 `Rule removed`。Request 效果表示代理发给上游的值，Response 效果表示浏览器实际收到的最终响应；marker 使用 18px 高紧凑标签，与 KV 文本共享垂直中线，并固定距前值 `4px`，不新增独立列。标准 HAR 不导出 marker/历史值，Native Archive 保真保存。
- **Capture / Rules 联动**：Capture 请求行右键菜单按 Rules 的 Action 分类（Rewrite / Serve & reroute / Traffic / Control）快速创建规则草稿；新草稿使用当前请求完整 URL 的 exact matcher，只打开 Rules editor，不自动 Apply。Capture 的 Rule 筛选位于筛选分栏的 `Rule` 分组，多个 Rule 按 OR 匹配。Rules editor 顶栏提供漏斗图标，一键切回 Capture 并在筛选分栏里选中该 Rule。Inspector 的 Rule marker 是可点击按钮，点击直达产生该 effect 的 Rule detail；规则已删除时保留历史 marker，但不伪造可达详情。
- **正文查看器底座 = Monaco**：所有文本/结构化正文（Capture Request Payload、Response Body、WebSocket 消息、Composer 响应）都由只读 Monaco 渲染，设计稿 `design/app/` 使用真实 Monaco 实例，实现必须与之逐项一致。固定关闭行号、minimap、当前行高亮、indent guides、overview ruler、彩虹括号、右键菜单与校验波浪线，并用 `readOnly + domReadOnly` 禁止编辑；保留折叠、sticky scroll、查找与 URL 链接识别。几何：`.bodybox` 字号 `12px` / 行高 `20px` / 上下内边距 `13px`，Composer `.jsonv` 行高 `21px` / 内边距 `16px`；左内边距由折叠槽提供，固定 `16px`（Monaco 无 `padding.left`，且行高只接受整数，因此不再使用 `1.7` 折算的 `20.4px`）。宿主容器负责 1px 边框与 10px 圆角并 `padding:0`；Capture Request Payload / Response Body 与 Composer 响应**吃掉面板剩余高度**（`flex:1`）且不低于 `320px`，不够时由外层滚动；WebSocket / gRPC 内联消息正文仍按内容高度贴合。四套主题的 token 颜色必须在 Monaco 主题里以十六进制重复声明（Monaco 不读 CSS 变量）：key=`--purple`、string=`--green`、number/boolean/null=`--blue`、标点与注释=`--text-3`、HTML tag=`--blue`、attribute name=`--purple`、attribute value=`--green`，底色 `--panel-2`、选区 `--sel`，六级 `editorBracketHighlight` 一律压平为 `--text-3`。Hex 模式与 gRPC 原始字节仍使用自建等宽 dump，不进 Monaco。
- **正文预览与保存边界**：Capture/WS/gRPC 正文继续完整保存在 Core，HAR/Native Archive 不截断；Renderer Detail 每个文本/结构化 BodyView 最多读取并渲染前 `5 MiB`，超过时显示“已展示大小 / 完整大小”提示，Copy 只复制当前预览，不提供可能重新卡死界面的“加载全部”。压缩正文由 Core 流式解码，超过上限时返回有限**明文**前缀，不能把 gzip/br 原始字节按 HTML/Text 展示。`video/*`、`audio/*` 不读取、不渲染 Hex，只显示 MIME/完整大小与 `Save body`；保存路径由 Main 系统对话框选择，Core 从临时 Body Store 流式、原子写文件，Renderer 不接触完整字节或绝对路径。
- **默认捕获与 HTTPS**：应用进入 Capture 后自动启动 loopback listener 并尝试接管系统代理，不弹启动向导。默认不生成、不安装 CA，也不解密 HTTPS；CONNECT 以 `TLS / encrypted` tunnel 摘要展示，只保存 host/port/open-close/duration 等连接元数据。选中 tunnel 时 Inspector 只显示 TLS tunnel 页和明确的隐私说明；`Decrypt HTTPS` 打开三步弹层（生成本地 CA → 显式系统信任 → 开启 MITM）。信任成功后第三步显示黄色 `Ready` 提示，但不得自动开启 MITM，必须等待用户点击 `Start decrypting`；未完成前 HTTPS 始终原样透传。禁用或未完成步骤使用统一 disabled 视觉，不以 hover 暗示可操作。
- **状态栏**:录制红点 · 代理地址(mono)· System Proxy 绿点 · 计数 · 右侧速率(mono)。

## 交互状态

- 文本选择:界面中的所有文本都允许选择与复制，包括 button/nav/tab/switch/segmented 标签，以及 Inspector URL/header/body、Cookie、Diagnostics 与技术值；不得使用 `user-select:none`。
- hover:行、导航与透明图标控件使用 `--hover` 底;带实底的操作按钮按「操作按钮」规范从自身底色计算 hover,不得直接替换成透明 `--hover`。可点图标额外 `--text → --text`/`--accent`。
- selected(list 行):`--sel` + 左竖条。
- active(nav):`--accent-soft` + `--accent`。
- focus-visible:`0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent)`。
- 过渡:`120–180ms ease`;尊重 `prefers-reduced-motion`。
- loading:与 Core 交互的异步操作(录制开关、导入/导出提交、HTTPS 安装、诊断修复等)在进行中显示旋转 spinner 并阻断重复触发;只替换图标、不改按钮文案。
- tooltip:所有图标按钮统一用 **Ant Design Tooltip** 承载名称提示(取代原生 `title`),`0.4s` 延迟;禁用态用 `disabledTooltip` 说明禁用原因(如无流量可导出)。
- dropdown:Rules 的 `Add condition` / `Add action` 使用 Ant Design Popover `placement="right"` + `autoAdjustOverflow`：优先紧贴按钮右侧并垂直居中，右侧不足时自动翻到左侧，垂直不足时只做边界位移。面板自然高度不滚动；仅当内容高于 `100vh - 16px` 时内部滚动。Select 选项行高 `34px`，列表按内容自然增高到 `320px`，超过后才滚动。

## 与落地代码的关系

- 复杂交互(拖拽 Splitter、Popover/Dropdown 浮层、Tooltip、Tabs、Segmented)优先用 **Ant Design** 组件 + ConfigProvider token 承接。
- Ant 无法表达的产品视觉(list 行、method/status 徽标、omni 容器、活动栏、kv)用 **colocated CSS Modules + 上述 token** 一比一还原,不覆盖 `.ant-*` 私有 DOM。
- 详见各阶段文档与 `AGENTS.md` 的样式优先级。
