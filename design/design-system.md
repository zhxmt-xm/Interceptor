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
- 行/条高度:topbar `54`,statusbar `30`,filter/omni `38–40`,list header `34`,**list row `52`**(刻意不紧凑),nav `38`。
- 强调色阴影:`0 4px 12px -3px color-mix(in srgb, var(--accent) 55%, transparent)`(logo 等)。

## 布局(Traffic 为参考基准)

- 基准画布 `1280 × 800`。
- 三区栅格 `side / list / inspector`,顶部 `topbar` 与底部 `statusbar` 横跨:
  - 展开:`220px · minmax(0,1fr) · 7px(splitter) · 500px`
  - 折叠:`60px · minmax(0,1fr) · 7px · 500px`
- **所有会被 `nowrap` 文本撑破的 `1fr` 轨道必须写 `minmax(0,1fr)`**,否则整页横向溢出。
- Inspector 默认略宽于 list(内容更多);list 收窄后长 host 省略,由 **splitter 拖拽**与 Inspector 的完整 URL 兜底。

## 组件规范

- **活动栏（侧栏）**：展开 = 图标 + 文字 + 分组标签（WORKSPACE / SESSION）+ 底部 Settings / Language / Theme；折叠 = 纯图标居中。折叠态的 active/在线状态一律用**右上角 7px 圆点 badge**（`::after` 或绝对定位），**不得**用左侧竖条或挤压图标。展开态 active 用 `--accent-soft` 底 + 左侧 3px 竖条。
- **主题 / 语言切换器**（侧栏底部，取代旧 Account）：触发行本身是一条 nav——主题展开为「当前时段图标 + Theme + 强调点」、语言为「地球 + Language + 代码」，折叠时主题只留当前时段图标、语言只留代码。点击弹出 **flyout**：以按钮为锚**向右弹出、底边与按钮底边对齐、留一小段水平间隙**，portal 到 `body` 以逃逸侧栏 `overflow`，点击外部 / Esc 关闭。语言项使用各语言自己的名称；超过可用高度时列表在 420px 内滚动，不改变锚点位置。主题 flyout 四项按**一天时序** Warm→Light→Ember→Dark，图标与文字保持中性色；hover 时从右侧浮现该时段的**中式写意山水**（日月循抛物线：晨左低 → 午中高 → 暮右低 → 夜居中；画面内缩留边 + 左侧 `--panel` 渐变保证标签可读），当前主题显示 `--accent` 勾。
- **Method 徽标**:mono `10.5/600`,`color-mix(field 13–16%, transparent)` 底 + 字段色字,圆角 6。
- **Status**:`6px` 圆点 + mono `12`,用状态语义色。
- **omni 搜索/筛选**(顶部):Capture 顶栏必须与正文共用 `minmax(0,1fr) · 7px · inspectorWidth` 三列；list 列放折叠钮、Recording、可收缩 omni，Inspector 列右对齐 info/设置/更多，搜索框不得跨过 splitter，顶部 7px 只作对齐占位、不绘制额外竖线。omni 用 `--panel-2` 底;结构 = search icon → 已激活筛选 **pill**(只显示值如 `GET ×`/`2xx ×`,`--accent-soft` 底 + `--accent` 字 + `accent 30%` 边)→ 文本占位 → **末尾 filter 按钮(漏斗)** 弹出"Add filter"字段菜单(Method/Status/Type/Host/Duration…)。
- **filter 条**(list 上方,`--filter` 底):协议快捷段 `All/H1/H2/WS`(Segmented)+ 计数 `18 of 241` + 列设置/清空图标；严格限制在 list 列。list 小于 420px 时隐藏计数与 Columns、收紧 segmented padding，只保留协议切换与 Clear，禁止横向溢出。
- **操作按钮**:enabled 一律 `cursor:pointer`;default 用 `--panel` 底 + `--border-2` 边,hover 在 `--panel` 上混入 6% `--text`,不得替换成透明 `--hover`;primary 用 `--accent` 实底 + 白字,hover 按 88% `--accent` + 12% `--text` 提升当前主题下的对比;danger 用中性实底 + 红字/红边,hover 按 10% `--red` + 90% `--panel` 着色。disabled 不保留 primary/danger 强语义色,统一 `--panel-2` 底 + `--border` 边 + `--text-3` 字,`cursor:not-allowed`,且 hover/filter/阴影均不得变化。图标按钮 enabled 可用透明底 + `--hover`,disabled 同样不响应 hover并使用 `not-allowed`。
- **list**:列 `Method / Host·Path / Status / Proto / Type / Size / Time`;Host 双行(host + path,`gap 4`),path 与 proto/type/size/time 用 mono;选中行 `--sel` 底 + 左 2px `--sel-line`。
- **splitter**(list↔inspector):`col-resize`;默认 1px `--border` 线 + 居中 `4×40` 圆角抓手(`--border-2`);hover/拖拽线与抓手变 `--accent`、抓手拉长到 `52`。
- **Inspector**：头部 method chip + 语法着色 URL（`dom`=text-2 / `path`=text）+ 右侧状态 pill（如 `200 OK` 绿）；Tabs 下划线 `--accent`，页签 `Headers / Request / Response / Timing / Cookies / TLS`。Detail 内小节标题使用高对比 `--text-2`、700 weight、左侧 2px accent 标记与底部分隔线，不能只靠浅灰大写字。Headers 分区 `General / Response Headers / Request Headers`（`kv` 栅格 `168px / minmax(0,1fr)`，key `--text-2` mono、value `--text` mono，特殊值用 `--accent`/`--green`）；`Cookie`/`Set-Cookie` 不在 Headers 重复出现，只归入 Cookies tab。Body 预览提供 `Auto / Text / JSON / Hex`：Auto 按 MIME + 内容探测，Text 强制 UTF-8 replacement 文本，JSON 尝试格式化且失败时保留原文，Hex 显示精确字节并随容器宽度重排；任何模式不得横向撑开 Inspector。Timing 只显示持久化的真实 Waiting(TTFB)/Response body 时间段，不伪造 DNS/TLS 阶段。内容区 `overflow-y:auto` 可滚。
- **默认捕获与 HTTPS**：应用进入 Capture 后自动启动 loopback listener 并尝试接管系统代理，不弹启动向导。默认不生成、不安装 CA，也不解密 HTTPS；CONNECT 以 `TLS / encrypted` tunnel 摘要展示，只保存 host/port/open-close/duration 等连接元数据。选中 tunnel 时 Inspector 只显示 TLS tunnel 页和明确的隐私说明；`Decrypt HTTPS` 打开三步弹层（生成本地 CA → 显式系统信任 → 开启 MITM）。信任成功后第三步显示黄色 `Ready` 提示，但不得自动开启 MITM，必须等待用户点击 `Start decrypting`；未完成前 HTTPS 始终原样透传。禁用或未完成步骤使用统一 disabled 视觉，不以 hover 暗示可操作。
- **状态栏**:录制红点 · 代理地址(mono)· System Proxy 绿点 · 计数 · 右侧速率(mono)。

## 交互状态

- 文本选择:界面中的所有文本都允许选择与复制，包括 button/nav/tab/switch/segmented 标签，以及 Inspector URL/header/body、Cookie、Diagnostics 与技术值；不得使用 `user-select:none`。
- hover:行、导航与透明图标控件使用 `--hover` 底;带实底的操作按钮按「操作按钮」规范从自身底色计算 hover,不得直接替换成透明 `--hover`。可点图标额外 `--text → --text`/`--accent`。
- selected(list 行):`--sel` + 左竖条。
- active(nav):`--accent-soft` + `--accent`。
- focus-visible:`0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent)`。
- 过渡:`120–180ms ease`;尊重 `prefers-reduced-motion`。

## 与落地代码的关系

- 复杂交互(拖拽 Splitter、Popover/Dropdown 浮层、Tooltip、Tabs、Segmented)优先用 **Ant Design** 组件 + ConfigProvider token 承接。
- Ant 无法表达的产品视觉(list 行、method/status 徽标、omni 容器、活动栏、kv)用 **colocated CSS Modules + 上述 token** 一比一还原,不覆盖 `.ant-*` 私有 DOM。
- 详见各阶段文档与 `AGENTS.md` 的样式优先级。
