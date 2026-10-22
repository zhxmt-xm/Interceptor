# Interceptor Design

产品 UI 的**设计稿工作区**。所有 feature 合并在单个可交互的 Vite + React SPA 里，已确认的源码与design token是落地还原依据。截图脚本保留供手工设计评审，导出图不作为产品parity输入，也不整批提交Git。

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
├── shots/                   # Git忽略的本地评审截图：主题/feature/scene
├── tools/
│   ├── design-preview.mjs   # 独占临时构建 + preview，退出清理；截图与parity共用
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

## 上游代理设计

已确认设计包含Settings的Upstream proxy和Capture右下角快捷浮层，不再使用候选开关。
`shoot.mjs --feature=upstream`生成五种模式的编辑态/应用态；产品还原与实际WPAD能力分别验收。

- 五种模式共用 `upstreamConfig` 和 `upstreamDraft`，Apply 后同步，Cancel/Discard 不改变生效配置。
- `upstreamFixtureOutcome` 仅用于设计演示成功/失败，不访问 DNS、代理或产品 API；`upstreamHealth` 演示生效上游不可达。
- `upstreamOperation` 可展示静态 applying/discovering；实际点击 Apply 才设置 `upstreamApplyRequested` 并演示结果。
- `upstreamPopoverOpen` 控制同一快捷浮层，Open in Settings 保留草稿并定位到对应区域。
- WPAD系统模式、DHCP和产品E2E的实际能力以[Settings](../architecture/features/settings.md#upstream-request-adapter)为准；设计交互不替代真实网络验收。

## Rules 菜单

- `RulesActionPopover`使用既有`pop`状态控制Add action菜单；真实点击和`window.__setState()`驱动同一组件。
- 菜单沿用App的Ant Popover定位与边界避让，挂到`.app`而不是编辑器内；Breakpoint等末项不会被编辑器裁切。触发按钮、Escape和外部点击均可关闭。
- 菜单内容继续来自`rulesFixture`，保留已有动作的静态示意；本次不扩展动作编辑或规则执行。Rule Select保持独立的原有定位与状态。

## 命令

### Android USB 单页候选

`src/features/AndroidPreview/`为独立Android App的首轮连接页拟议效果，不是桌面产品页面；默认关闭，不替换既有设计基准或正式`shots/`。

- 顶部标识、中部VPN/通道状态与电脑身份指纹、底部连接/停止按钮；不把PC的Rules、Breakpoints和Capture搬到手机。
- 未连接、首次配对、接管中和连接中断均由同一typed state驱动；按钮可切换演示状态，不发起网络或系统授权。
- 断线页展示保留VPN阻断与手动停止恢复的候选，仍需与用户确认产品策略。
- 新页面无改前产品截图。正式Android UI、设计定稿和通信简化均未获确认，不据此实施产品界面。

```js
window.__setState({
  view: 'playground',
  androidPreview: true,
  androidConnection: 'pairing', // disconnected / pairing / connected / error
  theme: 'light',
});
```

### Homepage 教程阅读候选

`src/features/HomepageGuidePreview/`保留官网Guidebook入口、目录和Capture样章的早期版式候选，不另建官网设计应用。候选默认关闭，不改变既有App设计或正式`shots/`；当前Homepage已在独立仓库接入Markdown阅读路由，此处不替代官网实现。

- `homepageGuidePreview`开启候选，`homepageGuidePage`选择`resources / overview / capture`；入口、目录与Capture按钮使用同一typed state。
- 预览只用于确认资源卡片和阅读内容区；正式接入时继续复用Homepage现有SiteHeader及其语言、主题菜单、下载和手机导航，不以候选里的简化Header替换它。
- 其余章节只展示目录排版，完整内容仍以Homepage的Markdown为唯一来源，不把样章预览算作全部章节已经可用。
- 此处仍是设计候选，不复制到正式App基准，也不接入App iframe；内容与媒体验收状态见Handover。

```sh
node design-vite/shoot.mjs --feature=homepage-guide --out-dir="<独立候选目录>"
```

以上命令生成浅深主题的入口、目录、正文和完整内容截图。直接交互可在设计SPA设置：

```js
window.__setState({
  view: 'playground',
  theme: 'light',
  homepageGuidePreview: true,
  homepageGuidePage: 'overview',
});
```

### Homepage 教程搜索

`HomepageGuidePreview`内的已确认搜索组件默认关闭，不改变既有App设计。搜索入口放在教程侧栏标题下；手机放在正文导航上方。Ant Design Modal/Input展示跨章结果、摘要高亮、初始提示与无结果状态，支持键盘选择和关闭。

- `homepageGuideSearchPreview / homepageGuideSearchOpen / homepageGuideSearchQuery`与人工点击共用typed state；`lang`选择中英示例。示例结果只用于设计，不是正式全文索引。
- `tools/homepage-search-preview.mjs`把同一设计组件临时装入当前Homepage的Vite响应，复用真实Header、正文和主题；两侧使用同一正式Markdown数据，分别渲染设计与产品组件。默认生成当前实现/设计评审图，原入口增加前后的确认图保留在本地评审目录，不伪造为当前页面。
- `--data-only`只采集声明元素的几何、样式、文本、焦点和滚动状态，原值严格比较并输出JSON/Markdown，不生成或读取截图。两种语言、浅深主题、桌面/窄屏和空态/结果/键盘/关闭分别建立状态；缺失、歧义、不稳定、字体失败与执行错误均失败，不使用容差或整体偏移。
- Homepage是独立网站，不使用Desktop Renderer的fake Preload。此入口使用独占的6198/6199 loopback端口，不修改Homepage源码、不复用或停止既有预览服务，退出关闭自有服务并删除缓存；端口被占用时失败。Browser业务与阅读性能由Homepage测试负责，不以元素对照替代。
- `tools/homepage-element-data.mjs`供搜索与本章导航两个入口共用字体门禁、唯一节点/相邻帧稳定检查及原值采集，包含实际页面滚动位置。只读采集不注入产品状态，不对测量值补偿或裁剪。
- 不包含App iframe、云端搜索、图片OCR或官网部署。

```sh
node design-vite/shoot.mjs --feature=homepage-guide-search --out-dir="<独立候选目录>"
node design-vite/tools/homepage-search-preview.mjs "<独立前后对照目录>"
node design-vite/tools/homepage-search-preview.mjs "<独立元素报告目录>" --data-only
```

```js
window.__setState({
  view: 'playground', theme: 'light', lang: 'zh',
  homepageGuidePreview: true, homepageGuidePage: 'capture',
  homepageGuideSearchPreview: true, homepageGuideSearchOpen: true,
  homepageGuideSearchQuery: '证书',
});
```

### Homepage 本章导航当前位置

`HomepageGuideOutlinePreview`保留已确认的右侧目录当前位置设计，默认关闭，不改变原App设计。当前项从11px调整为12px、600字重与主题强调色，其余目录项、正文和目录宽度保持原样；小于等于1000px仍沿用现有隐藏规则。正式网站通过独立组件实现，不依赖设计代码。

- `homepageGuideOutlinePreview`启用设计演示；`homepageGuideOutlineActive`由实际阅读位置更新。目录点击沿用普通锚点，滚动时只改变当前项，不写浏览器历史；当前项超出目录视区时只滚动目录自身。
- Ant Design Anchor会接管点击滚动和History写入，不直接替换当前React Router与原生平滑滚动。目录使用独立CSS Module和公开`aria-current="location"`，不改Ant Design私有DOM。
- `tools/homepage-outline-preview.mjs`在独立的6195/6196 loopback服务里分别渲染正式目录和设计组件；两侧使用同一当前Markdown与网站外壳，不复制正文。默认生成当前设计/实现评审图，早期无当前位置的改前图保留在本地历史目录，不伪造为当前页面。
- `--data-only`不读取或生成截图，按独立状态严格比较目录、标题和所有链接的原始几何、样式、文本、焦点、当前项及滚动值，包含中英、浅深、hover、点击、页底、短窗口和窄屏恢复。缺失、歧义、不稳定和执行错误均失败，不使用容差或位置补偿；字体和稳定性采集复用`homepage-element-data.mjs`。
- 两侧通过真实点击和按实际剩余距离的滚轮到达同一阅读位置，不能用过大的滚轮余量干扰后续语言导航。不写Homepage源码，退出关闭服务并清理缓存；端口被占用时失败，不停止其他会话服务。
- 正式阅读器的滚动、搜索定位、语言切换与性能由Homepage Browser流程验收，元素对照不代替业务测试。设计SPA原fixture的DOM属性开发告警不属于本目录设计，不为此修改其他组件。

```sh
node design-vite/tools/homepage-outline-preview.mjs "<独立评审目录>"
node design-vite/tools/homepage-outline-preview.mjs "<独立元素报告目录>" --data-only
node design-vite/shoot.mjs --feature=homepage-guide-outline --out-dir="<独立设计图目录>"
```

若Vite自动临时端口分配失败，可在自有终端以`npm run dev --workspace @interceptor/design-vite -- --host 127.0.0.1 --port 6197 --strictPort`启动设计SPA，再给`shoot.mjs`传`--preview-url=http://127.0.0.1:6197/`；结束后关闭该自有服务，不修改Vite或占用已有预览。

```js
window.__setState({
  view: 'playground', theme: 'light', lang: 'zh',
  homepageGuidePreview: true, homepageGuidePage: 'capture',
  homepageGuideOutlinePreview: true,
});
```

### Homepage 真实素材替换预览

`tools/homepage-media-preview.mjs`复用独立Homepage仓库现有SPA的完整布局与交互，只在预览服务内替换图片响应和对应说明；不复制另一套官网、不修改正式首页源码、教程媒体或`shots/`。这是媒体替换方案，不是产品验收，也不向产品增加预览参数或状态setter。

- 输入来自`guidebook-homepage-media.workflow.ts`的实际Release原生窗口录制，必须包含六个功能的light/dark原图及`homepage-steps.json`；不通过调色生成主题图。
- 工具覆盖总览与六功能模块的中英、浅深、1600/390px，保存改前/拟议截图和几何、来源摘要；字体必须真实加载，预览服务结束后关闭。
- 当前App截图保持实际中文语言，英文网页不伪装成英文App；Agent为无Key本地演示，MCP仅展示实际本机配置。接入正式首页前需确认前后效果。

```sh
node design-vite/tools/homepage-media-preview.mjs "<实际workflow输出目录>" "<独立评审目录>"
```

### 既有场景

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
node design-vite/shoot.mjs --feature=agent-models --variant=settings-provider-menu --out-dir="$env:TEMP/interceptor-provider-menu-shots"

node design-vite/shoot.mjs --out-dir="$env:TEMP/interceptor-design-shots"
node design-vite/shoot.mjs --feature=settings --variant=storage --out-dir="$env:TEMP/interceptor-storage-shots"
node design-vite/shoot.mjs --feature=settings --variant=storage-confirm --out-dir="$env:TEMP/interceptor-storage-shots"
node design-vite/shoot.mjs --feature=settings --variant=storage-empty --out-dir="$env:TEMP/interceptor-storage-shots"
node design-vite/shoot.mjs --feature=settings --variant=storage-unavailable --out-dir="$env:TEMP/interceptor-storage-shots"

node design-vite/tools/compare-shots.mjs <baselineDir> [feature]
node design-vite/tools/compare-shots.mjs design-vite/shots --current-dir="$env:TEMP/interceptor-design-shots" --out-dir="$env:TEMP/interceptor-design-diff"
```

`inspector-sidebar-*`生成指定主题、侧栏状态的Headers详情图，`rule-filter-auth`生成选中Auth Rule的详情图。`--variant`按完整名称筛选，多个名称可用逗号分隔；`--theme`按完整名称筛选。指定`--variant`时不清理同目录的其他截图，不省略它来补单张基准。

`settings-provider-menu`通过Add provider打开已有类型菜单，等待真实可见后截取含portal的画面，下一场景重载清理菜单内部状态；不省略弹层来生成“菜单截图”。

尚未确认的设计修正可通过`--preview-url=http://127.0.0.1:<port>/`连接本次拥有的独立候选预览，配合`--variant`和独立`--out-dir`生成前后评审图，不先改正式设计源码。只接受无凭据、查询和片段的HTTP loopback根地址；该服务由调用方关闭，截图命令只关闭自己创建的浏览器。不提供此参数时仍自行构建、启动并关闭设计preview。
候选脚本可向`startDesignPreview(root, plugins)`传入本次构建的Vite源码转换plugin；源码转换只作用于独占临时构建，不写回原文件，也不能覆盖该helper拥有的输出目录与清理流程。正常截图和parity不传入plugin。

`compare-shots.mjs` 是回归工具：改动前先把 `shots/` 另存一份，改完重出再拿它当基线对比，差异图写到 `shots-diff/`。**百分比会骗人**（侧栏图标全丢时只报约 1%），必须看差异图；**多张图差异值完全相同，说明是同一个公共元素，不是多个独立缺陷**。

2026-09-27已确认的gRPC/WebSocket普通展开消息compact Monaco按组件传入`resizable`，全屏禁用，不保留全局候选开关。初始高度为内容高度与所属滚动容器可用空间的较小值，短正文自然高度；右下角使用CSS `resize: vertical`，滚轮到正文边界后继续滚外层。窗口变小会clamp，恢复后还原用户拖高；隐藏初始化、字体加载与换行重排不能误作用户resize。`12px/20px`、上下`13px`padding、实际边框、控件与Copy保持不变。2026-09-28确认的HTTP Original/File样式见下节；Hex、Tree、全屏、普通WebSocket断点及Composer保持各自既有布局。

`grpcMessageSource`继续作为可交互长/短消息fixture，不修改产品协议或正文读取上限。`inspector-grpc-long-text`使用`catalog-stream-4281`文本标题、一个换行及原评审JSON正文（2729 UTF-8字节、134行，无末尾换行），通过真实点击Text切换；整体不是合法JSON，正常内容嗅探后仍使用Text/Hex与plaintext，不为fixture修改产品JSON嗅探。原批准图保留；`inspector-grpc-long-text-full`生成同场景的滚动全展开图。自定义source按UTF-8字节数同步第二条消息大小与第三条payload offset（前一条payload offset + payload长度 + 5字节gRPC帧头），正文沿用正常`+proto`的`raw protobuf`与`application/octet-stream · 大小`展示口径；该长场景为`2.7 KB`、第三条`0x0add`。原消息的压缩标记不变，清除source后恢复原fixture；不把自定义source称为另一种产品格式。现有`inspector-grpc`仍为默认Hex，`inspector-websocket`仍为Pretty。例如：

```sh
node design-vite/shoot.mjs --feature=capture --variant=inspector-websocket --out-dir=design-vite/out/body-compact-shots
node design-vite/shoot.mjs --feature=capture --variant=inspector-grpc --out-dir=design-vite/out/body-compact-shots
node design-vite/shoot.mjs --feature=capture --variant=inspector-grpc-long-text --out-dir=design-vite/out/body-compact-shots
node design-vite/shoot.mjs --feature=capture --variant=inspector-grpc-long-text-full --out-dir=design-vite/out/body-compact-shots
```

比较候选图时可用`--current-dir`指定生成目录、`--out-dir`指定独立差异目录，默认目录和比较算法不变。该工具只比较本地前后评审图；差异时退出码为1，必须查看具体变化，不能算作产品parity通过，也不把产物提交Git。

`request-rule-menu`和`breakpoint-create-menu`保留菜单的真实动画，主菜单与子菜单都进入设计画布且动画结束后再截图；子菜单通过真实hover展开。菜单缺失或仍在离屏初始化位置时明确失败，不能输出一张没有菜单的成功截图。

`--out-dir`将完整目录结构写入指定位置，不触碰默认`shots/`；使用新的独立目录预览和比较，确认后同步设计源码。PNG是本地评审产物，不提交全量图片。未指定`--variant`时仍会清理输出目录中本次选中的feature子目录，不复用历史证据目录。截图使用headless Edge，初始化及页面重载都先核对Inter/JetBrains Mono的FontFace实际加载；字体失败直接退出，浏览器和preview在失败时也关闭。
截图依赖已随仓库存在的 `@playwright/test` + 系统 Edge（`channel: 'msedge'`），无需额外安装浏览器。不在每次小改后重出全量截图；只在用户明确要求或一个设计里程碑结束时生成并评审。

## HTTP正文设计（2026-09-28已确认）

HTTP `PayloadEditor`的Original正文与File预览正式使用内容/可用空间限高、内滚与原生vertical resize，不保留默认关闭的候选开关。File预览无内层边框，采用`12px/20px`和上下`13px`padding，预览上方保留完整文件用途说明。Text说明条强调编辑value不受只读预览上限裁剪，现有受控Ant `Input.TextArea`、`autoSize: { minRows: 4, maxRows: 8 }`及字体不变；不设`maxLength`。`contentKind:'message'`保留WebSocket断点原设计；普通gRPC/WebSocket、Hex/Tree、全屏和Composer填充不变。
截图与parity使用的`design-preview.mjs`为每次预览创建独占临时构建目录，关闭服务后删除，不覆盖共享`dist/`；并行预览不会替换另一个页面正在加载的动态模块。手工`npm run build/preview`仍使用自身命令的正常产物，与这些临时预览分开。


```js
window.__setState({
  view: 'capture', theme: 'light', sidebar: 'collapsed', detail: 'open',
  scene: 'http', breakpointState: 'request', breakpointBody: 'ready',
  bodyRemainderSample: 'long', bodyRemainderNotice: 'none',
});
```

- `bodyRemainderSample: current / long / invalid-json`与`bodyRemainderNotice: none / auto-format / manual-format / truncated / image-limit`只是typed设计输入，导航时重置，不是产品参数。默认`current/none`没有常驻auto-format提示。`invalid-json + manual-format`供真实点击Format检查通用失败提示，保留原文；不显示解析器错误或增加新控件。
- `BodyRemainderPreview`按传入的`PayloadPreviewMetadata.totalBytes / previewBytes / truncated`动态生成大小和提示。完整≤1 MiB自动格式化、1–2 MiB手动、截断禁用、图片独立16 MiB；自动格式化的说明只出现在显式`auto-format`设计态。提示复用既有样式；Format失败在同位置显示`Formatting failed. The original content is unchanged.`。
- Original提示位于现有工具栏下、Monaco上，按真实MIME保留JSON语法高亮；File依次为文件头、完整文件说明、格式化/截断提示、无框plaintext Monaco。`src/fixtures/readonlyBodyData.ts`生成真实UTF-8或图片文件字节，设计和parity共用同一字节描述；总大小来自真实字节数，截断正文确实为前2 MiB，不再用几KiB样例冒充MiB预览。图片超限不挂载正文；仍不代替真实文件IO、网络、保存/发送或Core验收。
- `shoot.mjs`提供六个浅/深场景：`breakpoint-request-original-long / breakpoint-request-file-long / breakpoint-request-text-long / breakpoint-request-file-manual / breakpoint-request-file-truncated / breakpoint-request-file-image-limit`。它们通过实际点击收起Original、选择Text/File、Choose file、填入Text来进入状态；旁边的JSON记录state/source/actions与实际尺寸。用`--out-dir`检查并保留本轮评审产物，不提交PNG或运行记录。

## 相关

- Updates已按2026-09-30确认稿移除GitHub access、Private和账号文案，正式fixture直接保留Version、Delivery和原更新状态，不再使用`updatesWithoutSignIn`候选或`githubAuth`设计态。`updates-checking/available/downloading/downloaded/up-to-date/failed/unsupported`覆盖现有浅深色更新场景。
- 生成/迭代设计稿的完整流程与陷阱见 `ui-design-mockup` skill（`.github/skills/ui-design-mockup/`）。
- React实现与设计稿的元素几何、样式、文本和状态验证见[Data Parity](../apps/desktop/tests/visual-parity/README.md)。它直接驱动本SPA的preview和真实Renderer页面，独立严格比较并生成数据报告，不需要Agent、保存的PNG或预先运行截图脚本。
- SPA 内含的 feature 视图（均有 light/dark，截图存于 `shots/`）：
  - **capture** — 左侧筛选分栏 + 捕获列表 + Inspector + 两道 splitter；Breakpoint 已作为流量状态并入此视图（workbar manager、paused rows、Request/Response editor、future-traffic notice）
  - **rules** — 统一规则（Matcher + Rewrite / Map Local / Map Remote / Block / Breakpoint action）
  - **composer** — 可嵌套命名目录的 Collection 分栏 + 多请求文档标签 + URL/Send 行 + 请求编辑区（Query/Headers/Body/Auth）+ 响应区（Body/Headers/Cookies/Timing）
  - **settings** — Proxy / AppContainer access / TLS passthrough / Certificates / Appearance / Storage / Privacy / Updates
  - **diagnostics** — 命令诊断表格 + action 时间线
  - **playground** — 独立全屏Web人工验收工作台：Capture优先双页面、39项协议场景、在线MCP目录、Raw JSON、完整交换与手工结论
