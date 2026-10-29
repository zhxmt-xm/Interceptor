# 组件规范：外壳

> 返回 [设计系统索引](README.md)


- **活动栏（侧栏）**：展开 = 图标 + 文字 + 分组标签（WORKSPACE / SESSION）+ 底部 Settings / Language / Theme；折叠 = 纯图标居中。折叠态的 active 只用 `--accent-soft` 圆角底 + `--accent` 图标表示，**不加角标圆点**（右上角圆点留给未来的事件提示，例如断点命中）；Session 的在线绿点不受此限。展开态 active 用 `--accent-soft` 底 + 左侧 3px 竖条。
- **主题 / 语言切换器**（侧栏底部）：触发行本身是一条 nav——主题展开为「当前时段图标 + Theme + 强调点」、语言为「地球 + Language + 代码」，折叠时主题只留当前时段图标、语言只留代码。点击弹出 **flyout**：以按钮为锚**向右弹出、底边与按钮底边对齐、留一小段水平间隙**，portal 到 `body` 以逃逸侧栏 `overflow`，点击外部 / Esc 关闭。语言项使用各语言自己的名称；超过可用高度时列表在 420px 内滚动，不改变锚点位置。主题 flyout 四项按**一天时序** Warm→Light→Ember→Dark，图标与文字保持中性色；hover 时从右侧浮现该时段的**中式写意山水**（日月循抛物线：晨左低 → 午中高 → 暮右低 → 夜居中；画面内缩留边 + 左侧 `--panel` 渐变保证标签可读），当前主题显示 `--accent` 勾。
- **Method 徽标**:mono `10.5/600`,`color-mix(field 13–16%, transparent)` 底 + 字段色字,圆角 6。组件以`inline-flex`、`align-items:center`、`justify-content:center`在固定高度中居中文字；md高20px、sm高17px/字号9.5px、xs高16px/字号9px。Collection用40x16px的xs徽标，外层请求行继续`flex + align-items:center`，让标签框与名称框居中；DocumentTabs用sm。调用方只选择尺寸或设置外层列宽，不覆盖字号和padding；不用基线、文字裁剪或位移替代居中。
- **Status**:`6px` 圆点 + mono `12`,用状态语义色。
- **Capture 筛选分栏**（list 左侧，`208px`，`--filter` 底）：Capture 的**唯一筛选入口**。
  - 顶部一行 `40px` 与右侧列表工具栏同轨，内放 `30px` 搜索框（`--panel` 底、左内边距放大镜、右侧 clear），只做自由文本过滤。
  - 下方为可滚动的 facet 分组，**顺序严格跟随 list 表头**（App → Method → Path·Host → Status → Proto → Type），最后接不属于列的 `Rule`：`Application / Method / Host / Status / Protocol / Content type / Rule`。分组头 `28px`，左侧 chevron（折叠时 `-90deg`）、大写分组名、右侧 mono 条目数。
  - **间距**：分组头、条目与相邻分组之间统一 3px；展开分组不再在底部叠加额外留白，最后一个条目到下一分组头与条目之间一致。
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
- **启动加载界面（Boot）**：应用启动后、流量能到达代理前，覆盖整个 shell（含侧栏），只保留右上角窗口控制——启动卡住时用户必须还能关窗。外层使用纵向flex，窗口控制行固定`46px`、舞台占剩余高度，圆环叠层保留Grid，**不设底部状态栏**；背景为 `--bg` + 顶部 accent 径向辉光 + 淡网格点，不引入新色板。**它只负责三件必备的事**：`Proxy Core`（`CoreProcessStatus.state`）→ `Local listener`（`CaptureStatus.listening`）→ `System proxy`（`SystemProxyStatus.owned && !ownershipLost`）。**MITM 不属于启动流程**，它是 Capture 里按需开启的能力。
  - **主体是品牌与进度，不是清单**：`96px`、圆角 `26px` 的 app icon（`--accent → --purple` 渐变 + Lucide Zap + 向下的 accent 投影），外圈套一段 `148px` 直径、`3px` 线宽的**渐变圆弧**（`conic-gradient` 从透明渐变到 `--accent` 再到 `--purple`，约 `210°`，配 `radial-gradient` mask 挖成环）绕转，底下压一圈 `--border-2` 静止轨道；下方是 `20px/640` 的 `Interceptor` 字标与一行 **mono `11.5px`** 的当前动作（`Starting Proxy Core` / `Binding 127.0.0.1:8888`）。
  - **圆弧只在真的有事在跑时旋转**：三步进行中一直转，就绪时换成完整彩环并停转，失败时换成 `--red` 实心环；`prefers-reduced-motion` 下一律不转。
  - **进度用三个点，不用百分比**：`7px` 圆点——`pending` 用 `--border-2`、`done` 用 `--accent`、当前步拉长为 `22px` accent 胶囊、失败是红点。
  - **三步全自动，不问用户**：系统代理直接接管，不设授权按钮。底部常驻一行 shield 说明 `Interceptor takes over the Windows system proxy and restores your current settings when it exits.`——它是**告知**而非请求。失败态把 icon 与圆弧转灰/转红，说明改为 `Your system proxy settings were not changed.`，并给出三个出口：`Open diagnostics`（直接进入 Diagnostics 工作区查看失败记录）、`Enter anyway`（不带代理进入应用，仍可看历史/导入 HAR）、`Retry`（primary，重跑三步）。
  - 三步走完淡出进入 Capture。**运行期间**（Core 重启、ownership lost）不再使用本界面，仍走 Proxy readiness 弹层——整屏遮挡只属于冷启动。
- **代理链路图（MITM 弹窗内）**：`Client apps → Interceptor → Internet` 三节点两段线，位于 `Decrypt HTTPS (MITM)` 弹窗正文顶部。它不是装饰，而是把这个弹窗要改变的那件事画出来——两段线恒为 accent 实线并跑光点（能打开该弹窗说明流量已经过我们），左段徽标是 `i-arrow`，**右段徽标才是重点**：默认划线锁 `--yellow`（内容读不到），`mitmEnabled` 后变锁 `--green`。节点 `36px`（中心 `44px` 品牌渐变块 + 呼吸光环），名称用 `10px` 大写 `--text-3`。图与节点名用两行 grid 对齐，**不得用 margin 硬凑图标与线的中线**。
- **Proxy readiness 弹层**：自动 Recording、手动 Start 或 Core 重启后，如果 listener 或受支持平台的系统代理未 ready，`capturing` 必须为 false，顶栏显示 Paused、状态栏显示 Not recording，并显示阻塞弹层。结构为 warning 标题、readiness 说明、单一状态行、guarded restore 隐私说明和 Cancel / Proxy & Listener / Enable；只有 Enable 是 primary，禁止静默接管系统设置。Enable 成功且 listener+routing 都 ready 后才允许显示 Recording。
- **Capture Header 命令**：Header 不放任何 Capture 业务命令。`Import` 菜单提供 `Import HAR` / `Open Capture`，`Export` 菜单提供 `Export HAR` / `Save Capture`；HAR 是跨工具交换，Interceptor Capture 是完整会话保存，两者不得再表现为同一 Format 切换。菜单以各自的触发按钮为锚、右对齐向下弹出。
- **Segmented 开关**（Body 档位、Composer 协议、导出 Format 共用）：无轨道、透明容器，只有选中项显示为**实心 `--accent` 圆角块 + 白字**（未选中 `--text-3`，hover `--text-2` + `--hover` 底）。容器 `height 28`、`align-self:center`、`width:max-content`、`gap 2`、`radius 9`；选项 `height 22`、`padding 0 9`、`radius 7`、`font-weight 520`（选中 600）。与同行控件（30px 图标按钮）同一垂直中线。Body mode 左对齐于正文预览。
- **操作按钮**:enabled 一律 `cursor:pointer`;default 用 `--panel` 底 + `--border-2` 边,hover 在 `--panel` 上混入 6% `--text`,不得替换成透明 `--hover`;primary 用 `--accent` 实底 + 白字,hover 按 88% `--accent` + 12% `--text` 提升当前主题下的对比;danger 用中性实底 + 红字/红边,hover 按 10% `--red` + 90% `--panel` 着色。disabled 不保留 primary/danger 强语义色,统一 `--panel-2` 底 + `--border` 边 + `--text-3` 字,`cursor:not-allowed`,且 hover/filter/阴影均不得变化。图标按钮 enabled 可用透明底 + `--hover`,disabled 同样不响应 hover并使用 `not-allowed`。异步操作进行中显示 loading:图标替换为旋转 spinner、文字保持不变并临时阻断点击;录制开关的 loading 只把圆点替换为 spinner、不改 `Recording/Paused` 文案,以避免快速往返时的文字闪烁。
- **list**：列 `App / Method / Path·Host / Status / Proto / Type / Size / Time`；App 是宽 `20px` 的首列，只放 `16px` 系统应用图标，无表头文字、无文字标签，未识别到发起应用时留空不放占位符。主列双行（`gap 4`），**上行是 path**（mono `12.5`、`--text`，因为 host 已能在左侧筛选，path 才是区分请求的主体），**下行是 host**（`11.5`、`--text-3`，带 HTTPS 锁图标）；proto/type/size/time 用 mono。CONNECT tunnel 没有 path，因此保持 host 为主行、加密说明为次行。选中行 `--sel` 底 + 左 2px `--sel-line`。list 宽度不足时按 `Proto/Type → Size/Time` 的顺序逐步隐藏列（这些维度左侧筛选分栏都能到达），禁止横向溢出或把 Path·Host 压到 0。
- **客户端应用图标**：list 首列与 Inspector `General` 的 `Client Application` 行展示发起请求应用的**真实系统图标**（`16×16px`）与系统展示名，不用自画图标或首字母占位。图标总是晚于请求行到达，因此 UI 必须能先在无图标状态下渲染（列表留空、Inspector 只显示名称），**不得为等图标推迟请求上屏**。归属只在 Windows 可得，其他平台首列保留轨道但为空、Inspector 不显示该行。
- **splitter**(list↔inspector):在布局中只占 `1px`，自身绘制 `--border` 竖线；`4×40px` 圆角抓手是同一 flex 中轴上的普通子项，不使用绝对定位或 transform。抓手可溢出到线两侧但不得被相邻面板裁切；hover/拖拽时线与抓手变 `--accent`、抓手拉长到 `52px`。所有 feature 共用这一实现，list 与 Detail 都直接贴线，不保留额外 gutter。
- **分隔与层级**：侧栏右边界、窗口 Header 下边界、状态栏上边界、list↔Inspector 可拖 splitter、List Header 下方与数据行使用低对比 `1px --border`，不使用面板级阴影。Capture 工作栏、Detail method 行、Tabs 和 Detail 正文统一使用 `--panel`；只有左侧 All/H1/Clear 内容工具栏使用 `--filter`。色块之间不画额外 splitter。Tabs 只用 active `--accent` 下划线和正文顶部留白。Detail 小节使用左侧 2px accent 与向右消失的短线。输入和独立浮层仍使用自身边框。

- **状态栏**:录制红点 · 代理地址(mono)· System Proxy 绿点 · 计数 · 右侧速率(mono)。
