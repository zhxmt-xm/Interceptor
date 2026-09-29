# Interceptor Design

产品 UI 的**设计稿工作区**。所有 feature 合并在单个可交互的 Vite + React SPA 里，内含可渲染的设计稿、截图脚本与导出图，作为落地代码的一比一还原依据。

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
├── shots/                   # 当前设计截图：light/dark feature 矩阵 + scenes
├── tools/
│   ├── design-preview.mjs   # build + preview，返回本地 URL，截图与 parity 共用
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

## 命令

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

`--out-dir`将完整目录结构写入指定位置，不触碰默认`shots/`；使用新的独立目录预览和比较，再同步已确认的设计图。未指定`--variant`时仍会清理输出目录中本次选中的feature子目录，不复用历史证据目录。截图使用headless Edge，初始化及页面重载都先核对Inter/JetBrains Mono的FontFace实际加载；字体失败直接退出，浏览器和preview在失败时也关闭。

`compare-shots.mjs` 是回归工具：改动前先把 `shots/` 另存一份，改完重出再拿它当基线对比，差异图写到 `shots-diff/`。**百分比会骗人**（侧栏图标全丢时只报约 1%），必须看差异图；**多张图差异值完全相同，说明是同一个公共元素，不是多个独立缺陷**。

2026-09-27已确认的gRPC/WebSocket普通展开消息compact Monaco按组件传入`resizable`，全屏禁用，不保留全局候选开关。初始高度为内容高度与所属滚动容器可用空间的较小值，短正文自然高度；右下角使用CSS `resize: vertical`，滚轮到正文边界后继续滚外层。窗口变小会clamp，恢复后还原用户拖高；隐藏初始化、字体加载与换行重排不能误作用户resize。`12px/20px`、上下`13px`padding、实际边框、控件与Copy保持不变。2026-09-28确认的HTTP Original/File样式见下节；Hex、Tree、全屏、普通WebSocket断点及Composer保持各自既有布局。

`grpcMessageSource`继续作为可交互长/短消息fixture，不修改产品协议或正文读取上限。`inspector-grpc-long-text`使用`catalog-stream-4281`文本标题、一个换行及原评审JSON正文（2729 UTF-8字节、134行，无末尾换行），通过真实点击Text切换；整体不是合法JSON，正常内容嗅探后仍使用Text/Hex与plaintext，不为fixture修改产品JSON嗅探。原批准图保留；`inspector-grpc-long-text-full`生成同场景的滚动全展开图。自定义source按UTF-8字节数同步第二条消息大小与第三条payload offset（前一条payload offset + payload长度 + 5字节gRPC帧头），正文沿用正常`+proto`的`raw protobuf`与`application/octet-stream · 大小`展示口径；该长场景为`2.7 KB`、第三条`0x0add`。原消息的压缩标记不变，清除source后恢复原fixture；不把自定义source称为另一种产品格式。现有`inspector-grpc`仍为默认Hex，`inspector-websocket`仍为Pretty。例如：

```sh
node design-vite/shoot.mjs --feature=capture --variant=inspector-websocket --out-dir=design-vite/out/body-compact-shots
node design-vite/shoot.mjs --feature=capture --variant=inspector-grpc --out-dir=design-vite/out/body-compact-shots
node design-vite/shoot.mjs --feature=capture --variant=inspector-grpc-long-text --out-dir=design-vite/out/body-compact-shots
node design-vite/shoot.mjs --feature=capture --variant=inspector-grpc-long-text-full --out-dir=design-vite/out/body-compact-shots
```

比较候选图时可用`--current-dir`指定生成目录、`--out-dir`指定独立差异目录，默认目录和比较算法不变。这样可以在覆盖正式`shots/`前检查新增、尺寸变化和像素差异；比较有差异时退出码为1，必须查看具体变化，不能直接算通过。

截图依赖已随仓库存在的 `@playwright/test` + 系统 Edge（`channel: 'msedge'`），无需额外安装浏览器。不在每次小改后重出全量截图；只在用户明确要求或一个设计里程碑结束时生成并评审。

## HTTP正文设计（2026-09-28已确认）

HTTP `PayloadEditor`的Original正文与File预览正式使用内容/可用空间限高、内滚与原生vertical resize，不保留默认关闭的候选开关。File预览无内层边框，采用`12px/20px`和上下`13px`padding，预览上方保留完整文件用途说明。Text说明条强调编辑value不受只读预览上限裁剪，现有受控Ant `Input.TextArea`、`autoSize: { minRows: 4, maxRows: 8 }`及字体不变；不设`maxLength`。`contentKind:'message'`保留WebSocket断点原设计；普通gRPC/WebSocket、Hex/Tree、全屏和Composer填充不变。

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
- `shoot.mjs`提供六个浅/深场景：`breakpoint-request-original-long / breakpoint-request-file-long / breakpoint-request-text-long / breakpoint-request-file-manual / breakpoint-request-file-truncated / breakpoint-request-file-image-limit`。它们通过实际点击收起Original、选择Text/File、Choose file、填入Text来进入状态；新场景旁的JSON记录state/source/actions与实际尺寸。先用`--out-dir`检查，再只同步这些PNG；`shots/`不需要复制旁边的运行记录。

## 相关

- 生成/迭代设计稿的完整流程与陷阱见 `ui-design-mockup` skill（`.github/skills/ui-design-mockup/`）。
- React 实现与设计稿的几何/像素一致性验证见 `apps/desktop/tests/visual-parity/`，它直接驱动本 SPA 的 preview server。
- SPA 内含的 feature 视图（均有 light/dark，截图存于 `shots/`）：
  - **capture** — 左侧筛选分栏 + 捕获列表 + Inspector + 两道 splitter；Breakpoint 已作为流量状态并入此视图（workbar manager、paused rows、Request/Response editor、future-traffic notice）
  - **rules** — 统一规则（Matcher + Rewrite / Map Local / Map Remote / Block / Breakpoint action）
  - **composer** — 可嵌套命名目录的 Collection 分栏 + 多请求文档标签 + URL/Send 行 + 请求编辑区（Query/Headers/Body/Auth）+ 响应区（Body/Headers/Cookies/Timing）
  - **settings** — Proxy / AppContainer access / TLS passthrough / Certificates / Appearance / Storage / Privacy / Updates
  - **diagnostics** — 命令诊断表格 + action 时间线
  - **playground** — 独立全屏Web人工验收工作台：Capture优先双页面、39项协议场景、在线MCP目录、Raw JSON、完整交换与手工结论
