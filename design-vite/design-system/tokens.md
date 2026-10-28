# 颜色、排版与尺寸

> 返回 [设计系统索引](README.md)

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

- 字体:UI 用 `"Noto Sans SC Variable"`(拉丁来自 Source Sans,与汉字同一设计,数字与汉字共享字面、基线与视觉重心);等宽用 `"JetBrains Mono Variable"`,CJK 回落到同一中文字面。两者都是本地 WOFF2,不引用 Google Fonts 等外部 CDN。
- 字号:base `13`,列表 `12.5`,分组标签 `10.5`(大写 + `letter-spacing .05–.07em` + `--text-3`),mono `11–11.5`,品牌名 `14.5/640`。
- 字重:常规 `450–500`,强调 `550–600`,标签 `650`;可变字体 `wght 100–900` 直接表达这些档位,不做合成加粗。
- 设计主布局与用户确认的原App一致，使用`1.23`行高；Capture列表行、表头、Inspector方法/URL及协议消息行分别保留`normal`局部行高。设计入口复用现有Ant Design reset的控件继承规则，编辑器等固定行高保持各自规范；不以像素位移补偿排版。
- 对比:key/次要文本用 `--text-2`,值/主内容用 `--text`(Inspector 尤其保证对比);host 用 `--text-2`(不用主色,避免过重)。

## 尺寸与间距

- 圆角:app `16`,面板/输入/omni `9–10`,小控件/badge `6–8`,pill/胶囊 `999`。
- 行/条高度:窗口 Header `46`,Capture 工作栏 `54`,内容工具栏 `40`,omni `38`,statusbar `30`,list header `34`,**list row `52`**(刻意不紧凑),nav `38`。
- 强调色阴影:`0 4px 12px -3px color-mix(in srgb, var(--accent) 55%, transparent)`(logo 等)。
