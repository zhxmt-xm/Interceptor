# 组件规范：Composer 与正文

> 返回 [设计系统索引](README.md)

  - **Collection 分栏**（`216px`，`--filter` 底）：顶部 `40px` 与文档标签条同轨，左侧 `Collection` 标题、右侧 `新建目录 / 新建请求 / 导出` 三个 `30px` 图标按钮，左右留白均为 `8px`（标题不再额外缩进）；**不放搜索框**。下方是**可任意嵌套的命名目录树**，目录头 `28px`、请求行 `26px`（`40px` 等宽 method 徽标 + 用户命名），子级每层缩进 `11px`。
  - **目录行一行两个命中区**（文件树惯例，避免“点一下既选中又折叠”）：左侧 `24px` chevron 按钮**只**展开/折叠，右侧名称区**只**选中。选中的目录是“新建目标”，顶栏按钮 tooltip 写明 `New folder in “…”`；它用 **7% accent 底 + 32% accent 描边**表达，与请求行选中的 `--accent-soft` **实心填充 + accent 字**形成“容器 vs 内容”的区分，且两者之间保留 `2px` 间距，不得糊成一块。目录头 hover 把条目数换成 `⋮` 按钮（Rename / New subfolder / New request / Delete）；新建与重命名**在行内完成**，不开弹层。分栏可整体收起，开关是文档标签条最左的 `30px` 图标按钮（Lucide `panel-left`），展开时为 `--accent-soft` 激活态——与 Capture 筛选分栏开关完全一致。
  - **文档标签条**：每个打开的请求一个 tab（method 徽标 + 请求名 + 关闭 ×），末尾跟 `+` 新建。active 用 `--bg` 底（与下方内容同色）+ `--accent` 下划线，不引入第二套 tab 视觉；关闭按钮只在 active 或 hover 时出现。**有未保存改动时，关闭位显示 `7px` accent 圆点**，hover 才换回 ×。这正是 URL 行 `Save` 存在的理由：tab 可能是「来自 Collection 的已保存请求」也可能是「尚未入库的草稿」，`Save` 把当前 tab 写回 Collection（草稿则存入当前选中目录并进入行内命名）。
  - **URL 行**：`method 下拉(112px) · URL 输入 · Send · Recent sends / Save` 图标组。Send 发送中只把图标换成 spinner，文案不变。`Recent sends` 打开一个 `380px` 弹层，列出最近发送（method + URL + 状态码 + 相对时间），点击即恢复为请求；标题行右侧是清空历史的图标按钮，弹层内不再放整行的 Clear 条目。历史只是重放记录，与 Collection 是两件事，不互相写入。
  - **请求 / 响应共用一种 `40px` tab 条**：左侧 Tabs（带 mono 计数，Body 有内容时用 `5px` accent 圆点），右侧只放该区域的**状态**：请求侧是协议 Segmented，响应侧是 `● 201 Created · 142 ms · 1.2 KB · h2`。**正文的操作（Format / Copy）归 body 工具行**，不混入状态行；请求侧 `None / JSON / Text / Form` + Format / Copy，响应侧 `Pretty / Tree / Raw / Hex` + MIME + Copy，两侧对称。**tab 条不画底线**，只用 active 的 `2px --accent` 下划线。tab 标签用 flex 在**整行内垂直居中**，下划线是 `position:absolute` 的装饰（距行底 `6px`），**不参与布局、不影响文字位置**；未选中时下划线也存在但为透明。**不得用 padding / margin 硬凑垂直位置或补命中区。**
  - **KV 编辑器**（Query / Headers）：表头与 Capture list header 同规格（`34px`、`12px/600`、`--text-3`、**不大写也不加字间距**），数据行 `34px`，左右内边距 `14px`，列为 `34px 启用框 / 0.8fr 名 / 1.2fr 值 / 30px 行操作`。**只在表头下画一条分隔线**，数据行之间与列之间都不画线（与 Capture list 一致，靠 hover 底区分）。已有行的删除按钮 hover 才出现；**末行是占位的空白新增行，右侧不放删除而是常显的对号按钮确认添加**，不用单独的 Add 按钮。
  - **Body 类型**：`None / JSON / Text / Form` Segmented 位于编辑器上方的 `40px` 工具行（该行**不画下边框**，与下方的编辑器卡片靠留白分隔），右侧是字节数/MIME 与 Format / Copy。**Format 只在 `JSON` 下可用**（调 Monaco 自带的格式化），解析失败时**不改动内容**、把右侧的字节数/MIME 换成红色 `Invalid JSON`；`Text` 下 Format 禁用，`Form` 换成 KV 表、`None` 换成占位态，两者都不出现编辑器工具行。
  - **Composer 不经代理数据面**：状态栏必须明说 `Sent directly — not routed through the proxy`；首次发送前与发送中，响应区用居中占位态（图标 + 标题 + 一句说明）取代空 tabs，不展示假状态。
- **正文预览档位矩阵**：Body 档位**由 MIME 派生**，不是固定四档；Segmented 的选项本身随类型变化。工具行统一为 `Segmented · 弹性留白 · MIME/尺寸 · Format · Copy`（Capture 与 Composer 同规格），MIME 文案在窄栏下**省略号截断，不折行**。

  **内容类型与查看档位是两个独立维度**：类型由选中的请求决定（决定工具行、MIME 与体积标签），档位由 Segmented 决定（只决定用哪个视图渲染）。**切换档位绝不得改变当前请求或它的 MIME/体积** —— 在 JSON 响应上点 Hex 看到的必须仍是这条 JSON 的字节，标签不能变成别的类型。

  | 类型 | 默认档 | 候选 |
  | --- | --- | --- |
  | JSON / `+json` / ndjson | Pretty | Tree · Raw · Hex |
  | HTML / CSS / JS / XML | Code | Raw · Hex |
  | 图片（非 SVG） | Preview | Hex |
  | `image/svg+xml` | XML 代码 | Hex（可执行 XML，默认不渲染） |
  | Markdown | Preview | Split · Source · Hex |
  | `x-www-form-urlencoded` | Form | Raw · Hex |
  | 二进制（字体 / octet-stream） | Hex | Text · Hex |
  | 未知 | 内容探测决定 | Text · Hex |
  | `video/*` `audio/*` | 元信息 + Save body | —（无工具行） |

  - **Raw 档**是未格式化的原文（压缩成一行的 JSON/HTML、未解析的 urlencoded 串），它存在的理由就是让人看清服务器到底发了什么，**不得拿格式化结果充数**。二进制内容的 Text 档显示 UTF-8 强解后的 replacement 字符串，并一行说明该换 Hex。

  - **Format 按钮**只出现在 Code 档（HTML/CSS/JS/XML）与 Composer 请求侧的 JSON。三态：默认 `<>` 图标；进行中换 spinner 并取 `--accent-soft` 底；正文超上限时按钮置灰，并在正文上方压一条说明条讲清为什么禁用。JSON Pretty 档本身就是格式化结果，不再给 Format 按钮。
  - **提示条**：截断提示与 Format 禁用提示共用同一个组件（`1px --border` + `8px` 圆角 + `--panel-2` 底 + `11.5px` 文案 + `14×14` 图标），截断用 `--accent` 图标，禁用用 `--yellow`。
  - **JSON Tree**：`22px`行高，每层缩进`15px`；每行都有固定`15px`的disclosure槽，只有可展开节点放chevron，叶子和闭合行保留空槽。行与槽使用flex居中，不以负margin悬挂图标。key `--purple`、字符串 `--green`、数值/布尔 `--blue`、`null` 用 `--text-3` 斜体、标点与摘要 `--text-3`。折叠节点显示 `{…}` + 灰色条目数，展开节点显示 `{` / `[` 并在子项末尾单独一行闭合。行 hover 用 `--hover`，右键目标行用 `--accent-soft`。右键菜单宽 `176px`，条目 `Copy value / Copy object / Copy path`，与 Capture 请求行右键菜单同规格（`7px` 内边距、`12px` 圆角、`30px` 行高）。
  - **图片预览**：外框只提供 `1px --border-2` + `10px` 圆角 + `--panel-2` 底与 `14px` 内边距；**棋盘格只铺在图片自身背后**（`16px` 方格、`--hover` 色），不铺满整个面板。图片 `object-fit:contain`、`6px` 圆角。工具行右侧显示 `image/png · 1200 × 630`，动作按钮是 Save body 而不是 Copy；尺寸取自 `<img>` 的 `naturalWidth/Height`，不解析文件头。
  - **不可预览态**（图片超限、音视频）：共用一张**居中占位卡片**，与 Composer 响应占位态同规格——`40px` 圆角图标（`--panel` 底 + `--text-2`，图片用 image、音视频用 video）· mono `13px` 的 MIME · mono `11.5px` 的尺寸/体积 · 一句 `12px/1.6` 的原因说明（`340px` 内换行）· `Save body` 按钮，整体在面板内垂直水平居中，间距 `7px`。**说明必须讲清为什么没有内容可渲染**（"超过上限"或"音视频从不读入预览"），不能只写 `Preview unavailable`。音视频档**不出工具行**，因为没有可切换的视图。
  - **Form 视图**：`34px` 表头 + `34px` 数据行的两列栅格（`0.8fr / 1.2fr`），表头规格与 Capture list header 一致（`12px/600`、`--text-3`、不大写），只在表头下画一条线，值超长省略。
  - **Markdown**：Preview 是渲染后的富文本（正文 `12.5px/1.75`，h1 `17px`、h2 `14.5px`，inline code 用 `--hover` 底 + `--purple`，代码块 `--panel` 底 + `1px --border`，引用左侧 `2px --accent`，表格值用 mono）。Split 走**上下**分栏（Inspector 横向不够宽），两栏共用一个外框、中间只有一条 `1px --border-2`——Capture 唯一的 splitter 已经给了 list↔Inspector，这里不是可拖分隔。Source 档是只读 Monaco 的 markdown 原文，不做格式化。
  - **Hex** 仍是自建等宽 dump（`11.5px/20px`），随容器宽度重排，不进 Monaco。
- **正文查看器底座 = Monaco**：所有文本/结构化正文（Capture Request Payload、Response Body、WebSocket 消息、Composer 请求 Body 与响应 Body）都由 Monaco 渲染，设计稿 `design-vite/` 使用真实 Monaco 实例，实现必须与之逐项一致。**只有 Composer 的请求 Body 是可编辑实例**（`readOnly:false`），其余全部只读。固定关闭行号、minimap、当前行高亮、indent guides、overview ruler、彩虹括号、右键菜单与校验波浪线，只读实例额外用 `readOnly + domReadOnly` 禁止编辑；保留折叠、sticky scroll、查找与 URL 链接识别。几何：`.bodybox` 字号 `12px` / 行高 `20px` / 上下内边距 `13px`，Composer `.cedit` 与 `.jsonv` 行高 `21px` / 内边距 `16px`；左内边距由折叠槽提供，固定 `16px`（Monaco 无 `padding.left`，且行高只接受整数）。宿主容器负责 1px 边框与 10px 圆角并 `padding:0`；所有 `fill` 型正文查看器（Capture Request Payload / Response Body、Composer 请求 Body 与响应 Body）一律**吃掉面板剩余高度**（`flex:1` + `min-height:0`），**不设固定最低高度**——面板变矮时编辑器跟着变矮，不得撑破容器或触发外层滚动；Composer 的宿主外边距为 `0 14px 14px`；WebSocket / gRPC普通内联消息采用上方的 compact 限高与resize规则。四套主题的 token 颜色必须在 Monaco 主题里以十六进制重复声明（Monaco 不读 CSS 变量）：key=`--purple`、string=`--green`、number/boolean/null=`--blue`、标点与注释=`--text-3`、HTML tag=`--blue`、attribute name=`--purple`、attribute value=`--green`，底色 `--panel-2`、选区 `--sel`，六级 `editorBracketHighlight` 一律压平为 `--text-3`。Hex 模式与 gRPC 原始字节仍使用自建等宽 dump，不进 Monaco。
- **正文预览与保存边界**：Capture/WS/gRPC 正文继续完整保存在 Core，HAR/Native Archive 不截断；Renderer Detail 每个文本/结构化 BodyView 最多读取并渲染前 `2 MiB`，超过时显示“已展示大小 / 完整大小”提示，Copy 只复制当前预览，不提供可能重新卡死界面的“加载全部”。完整且不超过`1 MiB`自动格式化，完整`1–2 MiB`手动格式化，截断不格式化；Text完整编辑与File完整保存/发送不被只读预览裁剪。压缩正文由 Core 流式解码，超过上限时返回有限**明文**前缀，不能把 gzip/br 原始字节按 HTML/Text 展示。图片走**独立字节上限**（默认 `16 MiB`，与 `2 MiB` 的文本上限分开），未超限时读完整字节交给 `<img>`，由浏览器自己异步解码——**不生成缩略图、不解析文件头、不做像素护栏**；超限或 Core 返回的解码输出被截断时一律不渲染，退回元信息 + `Save body`，因为半截字节喂给 `<img>` 得到的半张图比不显示更糟。`image/svg+xml` 是可执行 XML，默认按 XML 代码显示。`video/*`、`audio/*` 不读取、不渲染 Hex，只显示 MIME/完整大小与 `Save body`；保存路径由 Main 系统对话框选择，Core 从临时 Body Store 流式、原子写文件，Renderer 不接触完整字节或绝对路径。
