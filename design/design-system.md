# Interceptor Design System

> 本文件是 Interceptor 桌面端 UI 的**权威视觉规范**,供设计稿(`design/app/`)与真实落地代码(`apps/desktop`)共同引用。
> 修改视觉语言时先改这里,再同步设计稿与代码。配套流程见 [design/README.md](./README.md) 与 `ui-design-mockup` skill(`.github/skills/ui-design-mockup/`)。

## 设计语言

- 目标:对标 **Linear / Raycast / Proxyman** 的现代桌面工具——克制、精致、信息密度高但有呼吸感。
- 深浅双主题:`light`(默认)与 `dark`;`warm`(Claude 暖调)为可选第三套。
- 主强调色:**靛紫 `--accent`**。语义色(绿/蓝/黄/红)只用于状态,不参与装饰。
- 图标:统一 **Lucide 线性风格**(stroke 1.9、round cap),`1em` SVG;禁止手绘 inline path 之外的随意图标。
- 字体:`Inter`(界面) + `JetBrains Mono`(URL、header、数值等技术文本);数值列用 `font-variant-numeric: tabular-nums`。

## 颜色 Token

三套主题以 CSS 变量表达(设计稿:`.app[data-theme="…"]`;代码:ConfigProvider + `:root[data-theme]`)。

| Token | light | dark (cool) | warm |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0c0d11` | `#1b1815` |
| `--chrome`(顶栏/状态栏) | `#fcfcfb` | `#101116` | `#181410` |
| `--sidebar` | `#f8f8f6` | `#0d0e13` | `#161310` |
| `--panel`(Inspector) | `#ffffff` | `#0f1116` | `#1e1a16` |
| `--panel-2`(输入/段) | `#f1f1ef` | `#171922` | `#26201a` |
| `--filter`(filter 条) | `#faf9f7` | `#0e0f15` | `#191510` |
| `--hover` | `rgba(20,20,25,.045)` | `rgba(255,255,255,.045)` | `rgba(240,230,214,.05)` |
| `--sel`(选中行底) | `rgba(106,91,240,.09)` | `rgba(141,123,255,.14)` | `rgba(224,128,80,.15)` |
| `--sel-line`(选中条) | `#6a5bf0` | `#8d7bff` | `#e08050` |
| `--border` | `rgba(20,20,25,.08)` | `rgba(255,255,255,.06)` | `rgba(240,230,214,.08)` |
| `--border-2` | `rgba(20,20,25,.13)` | `rgba(255,255,255,.11)` | `rgba(240,230,214,.14)` |
| `--text` | `#1a1b1e` | `#f3f4f8` | `#f4eee3` |
| `--text-2` | `#5b5e65` | `#a4abbb` | `#bdb4a4` |
| `--text-3` | `#8b8e96` | `#646b7b` | `#8b8273` |
| `--accent` | `#6a5bf0` | `#8d7bff` | `#e08050` |
| `--accent-soft` | `rgba(106,91,240,.1)` | `rgba(141,123,255,.15)` | `rgba(224,128,80,.16)` |
| `--green` | `#12a150` | `#3ecf8e` | `#93c389` |
| `--blue` | `#2570e0` | `#5b9dff` | `#84b0cf` |
| `--yellow` | `#b6820a` | `#f5c451` | `#dcb968` |
| `--red` | `#e0483a` | `#f26d6d` | `#e28470` |
| `--purple` | `#8b3fd9` | `#c07cff` | `#c6a3d8` |

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

- **活动栏(侧栏)**:展开 = 图标 + 文字 + 分组标签(WORKSPACE / SESSION)+ 底部 Settings/Account;折叠 = 纯图标居中。折叠态的 active/在线状态一律用**右上角 7px 圆点 badge**(`::after` 或绝对定位),**不得**用左侧竖条或挤压图标。展开态 active 用 `--accent-soft` 底 + 左侧 3px 竖条。
- **Method 徽标**:mono `10.5/600`,`color-mix(field 13–16%, transparent)` 底 + 字段色字,圆角 6。
- **Status**:`6px` 圆点 + mono `12`,用状态语义色。
- **omni 搜索/筛选**(顶部,居中 `max 500`):`--panel-2` 底;结构 = search icon → 已激活筛选 **pill**(只显示值如 `GET ×`/`2xx ×`,`--accent-soft` 底 + `--accent` 字 + `accent 30%` 边)→ 文本占位 → **末尾 filter 按钮(漏斗)** 弹出"Add filter"字段菜单(Method/Status/Type/Host/Duration…)。顶栏其余只放全局操作(折叠钮、Recording、info/设置/更多),留足间距。
- **filter 条**(list 上方,`--filter` 底):协议快捷段 `All/H1/H2/WS`(Segmented)+ 计数 `18 of 241` + 列设置/清空图标。
- **list**:列 `Method / Host·Path / Status / Proto / Type / Size / Time`;Host 双行(host + path,`gap 4`),path 与 proto/type/size/time 用 mono;选中行 `--sel` 底 + 左 2px `--sel-line`。
- **splitter**(list↔inspector):`col-resize`;默认 1px `--border` 线 + 居中 `4×40` 圆角抓手(`--border-2`);hover/拖拽线与抓手变 `--accent`、抓手拉长到 `52`。
- **Inspector**：头部 method chip + 语法着色 URL（`dom`=text-2 / `path`=text）+ 右侧状态 pill（如 `200 OK` 绿）；Tabs 下划线 `--accent`，页签 `Headers / Request / Response / Timing / Cookies / TLS`——Headers 分区 `General / Response Headers / Request Headers`（`kv` 栅格 `168px / minmax(0,1fr)`，key `--text-2` mono、value `--text` mono，特殊值用 `--accent`/`--green`）；Response = 语法着色 body 卡片；Timing = 阶梯瀑布（阶段名 + ms + 偏移条）；Cookies = 请求/响应 cookie 的 kv；TLS = 连接参数 + 证书链卡片（leaf/CA/root）。内容区 `overflow-y:auto` 可滚。
- **状态栏**:录制红点 · 代理地址(mono)· System Proxy 绿点 · 计数 · 右侧速率(mono)。

## 交互状态

- hover:`--hover` 底;可点图标额外 `--text → --text`/`--accent`。
- selected(list 行):`--sel` + 左竖条。
- active(nav):`--accent-soft` + `--accent`。
- focus-visible:`0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent)`。
- 过渡:`120–180ms ease`;尊重 `prefers-reduced-motion`。

## 与落地代码的关系

- 复杂交互(拖拽 Splitter、Popover/Dropdown 浮层、Tooltip、Tabs、Segmented)优先用 **Ant Design** 组件 + ConfigProvider token 承接。
- Ant 无法表达的产品视觉(list 行、method/status 徽标、omni 容器、活动栏、kv)用 **colocated CSS Modules + 上述 token** 一比一还原,不覆盖 `.ant-*` 私有 DOM。
- 详见各阶段文档与 `AGENTS.md` 的样式优先级。
