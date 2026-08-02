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
- Header V2 是设计 SPA 唯一且已批准的落地基线。侧栏从顶部到底部保持完整，右侧内容区按自然流依次为窗口 Header、feature 工作栏、主体和状态栏；业务布局不得依赖浮动、绝对定位或 `z-index` 拼接。
- 主体横向布局为 `list / splitter / inspector`:
  - 展开:`220px(side) · minmax(0,1fr)(list) · 1px(splitter) · 500px(inspector)`
  - 折叠:`60px(side) · minmax(0,1fr)(list) · 1px(splitter) · 500px(inspector)`
- 右侧窗口 Header 高 `46px`，左侧只保留 30px 侧栏折叠按钮和当前 feature 名称，右侧只保留窗口控制；不得放 feature 图标、业务命令、Core/revision/count 等状态摘要。所有状态统一进入底部 30px 状态栏。左侧原始 Logo/品牌继续属于完整侧栏，不复制到 Header；六个 feature 使用同一骨架、间距和 padding。46px 与侧栏顶部 `12px + 34px` 品牌区节奏对齐。
- Capture feature 工作栏高 `54px`：Recording 左对齐、omni 在整个右侧内容区视觉居中、Import/Export 图标右对齐；不显示 `Session files` 标签。小窗口可隐藏 pill/占位文字，但三组不得重叠或跨越 Inspector。
- 各 feature 的业务命令放在内容区首行或最接近其作用对象的 `40px` 工具栏中。工具栏按纵向自然流排列，行内使用横向 flex；Rules 的 revision/applied/数量状态留在 Header，Search 输入位于内容工具栏左侧，New/Apply/More 位于右侧。
- **所有会被 `nowrap` 文本撑破的 `1fr` 轨道必须写 `minmax(0,1fr)`**,否则整页横向溢出。
- Inspector 默认略宽于 list(内容更多);list 收窄后长 host 省略,由 **splitter 拖拽**与 Inspector 的完整 URL 兜底。

## 组件规范

- **活动栏（侧栏）**：展开 = 图标 + 文字 + 分组标签（WORKSPACE / SESSION）+ 底部 Settings / Language / Theme；折叠 = 纯图标居中。折叠态的 active/在线状态一律用**右上角 7px 圆点 badge**（`::after` 或绝对定位），**不得**用左侧竖条或挤压图标。展开态 active 用 `--accent-soft` 底 + 左侧 3px 竖条。
- **主题 / 语言切换器**（侧栏底部，取代旧 Account）：触发行本身是一条 nav——主题展开为「当前时段图标 + Theme + 强调点」、语言为「地球 + Language + 代码」，折叠时主题只留当前时段图标、语言只留代码。点击弹出 **flyout**：以按钮为锚**向右弹出、底边与按钮底边对齐、留一小段水平间隙**，portal 到 `body` 以逃逸侧栏 `overflow`，点击外部 / Esc 关闭。语言项使用各语言自己的名称；超过可用高度时列表在 420px 内滚动，不改变锚点位置。主题 flyout 四项按**一天时序** Warm→Light→Ember→Dark，图标与文字保持中性色；hover 时从右侧浮现该时段的**中式写意山水**（日月循抛物线：晨左低 → 午中高 → 暮右低 → 夜居中；画面内缩留边 + 左侧 `--panel` 渐变保证标签可读），当前主题显示 `--accent` 勾。
- **Method 徽标**:mono `10.5/600`,`color-mix(field 13–16%, transparent)` 底 + 字段色字,圆角 6。
- **Status**:`6px` 圆点 + mono `12`,用状态语义色。
- **omni 搜索/筛选**(Capture 工作栏):Recording 左对齐、可收缩 omni 在整个右侧内容区视觉居中，右侧只放 `Import` / `Export` 两个 30px 图标按钮（Upload/Download，hover tooltip 命名）;三组之间不用竖分隔线。omni 高 `38px`、整体使用 `--panel` 白底;最左 Search 区域用紧凑左内边距（约 `10px`）+ 右侧 `gap`（约 `10px`）承载放大镜图标，左右视觉间距一致，与 omni 同 `--panel` 白底，不再撛成 `1:1` 正方形大留白。结构 = 左内边距 Search 图标 → 已激活筛选 **pill**(多选值逗号分隔、最多显示 2 个，超出用 `…` 并留空隙 + hover tooltip 展示全部;`22px` 高、`--accent-soft` 底 + `--accent` 字 + `accent 30%` 边)→ 文本占位 → **末尾 filter 按钮(漏斗)** 弹出"Add filter"字段菜单（只留 Method/Status，点字段向右浮出多选子面板，可选值来自当前列表）。Import 菜单提供 `Import HAR` / `Open Capture`，Export 菜单提供 `Export HAR` / `Save Capture`;HAR 是跨工具交换，Interceptor Capture 是完整会话保存，两者不得再表现为同一 Format 切换。
- **内容区命令**：New/Apply/History/Export 等无需显示当前值的明确命令统一使用 `30×30px` IconButton + tooltip，图标 `15×15px`，连续图标按钮组 gap `3px`；该规格以 Capture 的 Columns/Clear 组为基准，全 feature 共用。Process/Level/Outcome、Break on match 等承载当前值或二元状态的控件保留文字。窗口 Header 不放业务命令。
- **窗口控制**：产品窗口跨平台 frameless；右侧 46px 窗口 Header 是拖拽区，所有 button/input/menu 必须 `no-drag`。最右固定 30px Minimize / Maximize-or-restore / Close 三图标按钮，距右 8px、组内 gap 3px；feature 命令不再进入窗口 Header，统一放各自内容工作栏。Close hover 用轻红色，其他窗口按钮用中性 hover。
- **品牌 Logo**：左上角 30px 渐变方块继续由当前主题 `--accent → --purple` 驱动并使用 Lucide Zap；系统 PNG/ICO/ICNS 使用固定 dark 主题 `#2fd4b8 → #c07cff` 与白色 Zap，保证任务栏/安装器识别稳定。Lucide 依 ISC 许可使用。
- **Proxy readiness 弹层**：自动 Recording、手动 Start 或 Core 重启后，如果 listener 或受支持平台的系统代理未 ready，`capturing` 必须为 false，顶栏显示 Paused、状态栏显示 Not recording，并显示阻塞弹层。结构为 warning 标题、readiness 说明、单一状态行、guarded restore 隐私说明和 Cancel / Proxy & Listener / Enable；只有 Enable 是 primary，禁止静默接管系统设置。Enable 成功且 listener+routing 都 ready 后才允许显示 Recording。
- **filter 条**(list 上方,`--filter` 底):协议快捷段 `All/H1/H2/WS`(Segmented)+ 计数 `18 of 241` + 列设置/清空图标；严格限制在 list 列。list 小于 420px 时隐藏计数与 Columns、收紧 segmented padding，只保留协议切换与 Clear，禁止横向溢出。相邻图标按钮成组，组内间距 `3px`（不沿用 filter 条的 `10px`）。
- **Segmented 开关**（协议 `All/H1/H2/WS`、Body `Auto/Text/JSON/Hex`、Composer 协议、导出 Format 共用）：无轨道、透明容器，只有选中项显示为**实心 `--accent` 圆角块 + 白字**（未选中 `--text-3`，hover `--text-2` + `--hover` 底）。容器 `height 28`、`align-self:center`、`width:max-content`、`gap 2`、`radius 9`；选项 `height 22`、`padding 0 9`、`radius 7`、`font-weight 520`（选中 600）。与同行控件（30px 图标按钮）同一垂直中线；协议段用 mono `10.5`、大写、`min-width 30`。Body mode 左对齐于正文预览。
- **操作按钮**:enabled 一律 `cursor:pointer`;default 用 `--panel` 底 + `--border-2` 边,hover 在 `--panel` 上混入 6% `--text`,不得替换成透明 `--hover`;primary 用 `--accent` 实底 + 白字,hover 按 88% `--accent` + 12% `--text` 提升当前主题下的对比;danger 用中性实底 + 红字/红边,hover 按 10% `--red` + 90% `--panel` 着色。disabled 不保留 primary/danger 强语义色,统一 `--panel-2` 底 + `--border` 边 + `--text-3` 字,`cursor:not-allowed`,且 hover/filter/阴影均不得变化。图标按钮 enabled 可用透明底 + `--hover`,disabled 同样不响应 hover并使用 `not-allowed`。异步操作进行中显示 loading:图标替换为旋转 spinner、文字保持不变并临时阻断点击;录制开关的 loading 只把圆点替换为 spinner、不改 `Recording/Paused` 文案,以避免快速往返时的文字闪烁。
- **list**:列 `Method / Host·Path / Status / Proto / Type / Size / Time`;Host 双行(host + path,`gap 4`),path 与 proto/type/size/time 用 mono;选中行 `--sel` 底 + 左 2px `--sel-line`。
- **splitter**(list↔inspector):在布局中只占 `1px`，自身绘制 `--border` 竖线；`4×40px` 圆角抓手是同一 flex 中轴上的普通子项，不使用绝对定位或 transform。抓手可溢出到线两侧但不得被相邻面板裁切；hover/拖拽时线与抓手变 `--accent`、抓手拉长到 `52px`。所有 feature 共用这一实现，list 与 Detail 都直接贴线，不保留额外 gutter。
- **分隔与层级**：侧栏右边界、窗口 Header 下边界、状态栏上边界、list↔Inspector 可拖 splitter、List Header 下方与数据行使用低对比 `1px --border`，不使用面板级阴影。Capture 工作栏、Detail method 行、Tabs 和 Detail 正文统一使用 `--panel`；只有左侧 All/H1/Clear 内容工具栏使用 `--filter`。色块之间不画额外 splitter。Tabs 只用 active `--accent` 下划线和正文顶部留白。Detail 小节使用左侧 2px accent 与向右消失的短线。输入和独立浮层仍使用自身边框。
- **Inspector**：整个 Detail 区域从 method 行到 Tabs、正文都使用 `--panel`，不得出现灰色衬底。头部 method chip + 语法着色 URL（`dom`=text-2 / `path`=text）+ 右侧状态 pill（如 `200 OK` 绿）保持原内容结构，并由独立白色 Request 摘要 box 包裹。外层行与 box 都使用 `40px` 高度，与左侧 All/H1/Clear 行同轨对齐；box 左右外间距均为 `14px`，横向 padding `8px / 18px`、`gap:10px`，内容垂直居中。box 使用 9px 圆角和两层无方向偏移的均匀浅阴影，不使用 solid border；阴影四周必须完整，不得由工作栏、splitter、Tabs 或 overflow 裁切。box 与 Tabs 之间使用普通文档流 `6px` 间距，Detail 区域不使用定位、浮动或 `z-index` 拼接。页签为 `Headers / Request / Response / Timing / Cookies / TLS`。Detail 内小节标题使用高对比 `--text-2`、700 weight、左侧 2px accent 标记与向右渐隐短线，不能只靠浅灰大写字。Headers 分区 `General / Response Headers / Request Headers`（`kv` 栅格 `168px / minmax(0,1fr)`，key `--text-2` mono、value `--text` mono，特殊值用 `--accent`/`--green`）；KV key/value 使用 `18px` 行高。可复制 value 的 inline action 在行 hover 时显示，使用 `18×18px` 按钮和 `14×14px` 图标，不增加水平或垂直偏移；必须跟随末尾文字自然换行，不能因 Status 圆点/文本容器是原子 flex 而单独掉到下一行。`Cookie`/`Set-Cookie` 不在 Headers 重复出现，只归入 Cookies tab。Body 预览提供 `Auto / Text / JSON / Hex`：Auto 按 MIME + 内容探测，Text 强制 UTF-8 replacement 文本，JSON 尝试格式化且失败时保留原文，Hex 显示精确字节并随容器宽度重排；任何模式不得横向撑开 Inspector。Timing 只显示持久化的真实 Waiting(TTFB)/Response body 时间段，不伪造 DNS/TLS 阶段。内容区 `overflow-y:auto` 可滚。
- **规则 Header 效果**：Inspector 同时展示规则前后的 header 证据。`set` 的生效新值标记绿色 `Rule set`，被替代旧值保留、加删除线并标记黄色 `Rule replaced`；`append` 只标记新增值，使用蓝色 `Rule appended`；`remove` 保留被删除旧值、加删除线并标记红色 `Rule removed`。Request 效果表示代理发给上游的值，Response 效果表示浏览器实际收到的最终响应；marker 使用 18px 高紧凑标签，与 KV 文本共享垂直中线，并固定距前值 `4px`，不新增独立列。标准 HAR 不导出 marker/历史值，Native Archive 保真保存。
- **Capture / Rules 联动**：Capture 请求行右键菜单按 Rules 的 Action 分类（Rewrite / Serve & reroute / Traffic / Control）快速创建规则草稿；新草稿使用当前请求完整 URL 的 exact matcher，只打开 Rules editor，不自动 Apply。Capture 的 Add filter 增加 Rule 多选，多个 Rule 按 OR 匹配；Rule filter pill 显示规则名。Rules editor 顶栏提供漏斗图标，一键切回 Capture 并只显示当前 Rule 命中的请求。Inspector 的 Rule marker 是可点击按钮，点击直达产生该 effect 的 Rule detail；规则已删除时保留历史 marker，但不伪造可达详情。
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
