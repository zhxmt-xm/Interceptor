# Interceptor Handover

> 最后更新：2026-08-06
> 只记录接手当前工作的必要信息；已实现架构与历史细节不在这里重复。

## 接手顺序

1. 读本文件，确认当前工作、验证状态和下一动作。
2. 读 [platform/processes.md](platform/processes.md)，理解进程边界、两条通道、故障分类与关键数据结构。
3. 改代码前读对应的 [features/*.md](README.md)；涉及跨 feature 边界时读对应的 `platform/*.md`。
4. [README.md](README.md) 是整个文档目录的索引。

## 当前里程碑

**Breakpoint 交互重构处于设计稿阶段，尚未修改产品代码。** 目标是删掉独立 Breakpoints workspace，把断点作为 Capture 流量状态原地呈现；需求与背景见 [backlog/idea.md](backlog/idea.md)。

### Breakpoint 目标设计：进行中

当前只修改 `design/app/`；`apps/`、`packages/` 产品代码保持 `77066d7` 不变。已确认的设计如下：

- **导航与感知**：设计稿删除独立 Breakpoints 侧栏入口。Capture workbar 在 Recording 旁放唯一 Breakpoint 图标；pending 数用 badge，点击打开 520px manager。挂起 exchange 在 Capture 列表原地显示黄色 pause icon；Request/Response 不再用不同颜色，也不显示倒计时。
- **Breakpoint manager**：Header 同行放 `Break on match` 总开关、`SlidersVertical + Advanced rules` 和关闭按钮；规则行只保留名称、matcher 摘要、`View rule` 与 enable switch。已删除不可操作的 `Armed` / `Once` / `Always` / `Request + response` 展示。`View rule` 精确跳到 Rules 对应 rule；switch 会更新 enabled 数。
- **从历史流量创建**：Capture 行右键 `Breakpoint` 子菜单提供 `This endpoint` / `This path prefix` / `This host` / `Custom…`。从已完成 request 创建时当前 exchange 不会 retroactively pause；显示一次 `Breakpoint enabled for future traffic` 通知，含 Undo 和打开 manager 的入口。
- **暂停编辑器**：选择 paused 行后，右侧 Inspector 切到 Request/Response 编辑模式，底部固定 `Drop` / `Continue` / `Forward edited`。所有分区直接复用 `.sh` / `.c` / `.sh-chev` SectionHeader primitive，与 TLS tunnel 的字号、字重、字距、accent 竖线和底部渐变一致，并可独立折叠。
- **Body**：Request/Response 对称拆成只读 `Original body` 与可选 `Replacement body`。设计稿的 Original loading 3 秒后自动完成只为演示；产品必须由 body 到达事件驱动。Replacement 始终显示 `Off | Text | File`：Off 显示 original-forwarded info；Text/File 有效时 tag 为 `Using text/file`；Text 空或 File 未选时显示 Lucide `CircleAlert + Using original` 及 tooltip。File 空态复用 Body Viewer 的居中占位形态，上传后显示文件名、大小与有限预览；删除后仍停在 File 空态。`Content-Type` 只由可编辑 headers 决定，文件格式不匹配只警告、不阻断 raw bytes；`Content-Length` 由实现自动重算。
- **超时与队列**：Core 仍必须保留安全超时，但 UI 不显示倒计时；自动 continue/drop 只在 Statusbar/Diagnostics 留痕。设计包含 queue-full 状态，超上限的新命中自动 continue。
- **WebSocket**：独立 `Pause on message` 开关从目标设计中移除，Inspector 只陈述全局 Breakpoints 状态；真正命中的消息仍在原地编辑。

### Rules / Composer 树设计

- Rules 默认采用 Composer collection 的 typography：目录与 item 使用 UI font，字重更轻；设计控制器保留 `Current | Composer` 对比 option，默认 `Composer`。
- 两棵树都区分两个状态：**selection** 使用现有填充/描边 accent 样式；右侧当前打开的 rule/request 在未被选中时使用更淡的 accent 背景 + 虚线边框，不再显示 Check。
- Rules 与 Composer 都允许目录和 item/rule 互斥单选。点击目录名只改变 selection，不折叠且不改变右侧内容；只有 chevron 展开/折叠。点击 item/rule 后 selection 与右侧当前项重新重合。
- Rules 右侧始终显示 rule editor；选中目录不会清空、切换或替换右侧当前 rule。Composer 同理，选中目录不改变当前 request workspace。

### 设计基础设施决定

- 当前 `design/app` 仍是静态 `index.html + app.js + app.css`，全局 CSS 和手写状态已多次造成中间态暴露与样式串扰。
- Breakpoint 方案确认后，**先把整个设计 SPA 一次性迁移到 Vite + React + CSS Modules**，复用 `lucide-react`、Ant Design、Monaco、tokens 和稳定 UI primitives；旧静态实现整体删除，不保留双路径。
- 设计稿应完整实现 UI 状态与交互；网络、Core、IPC、持久化只通过 fixture/adapter 模拟，不复制业务后端，也不直接依赖产品 feature/store。
- 截图只在用户明确要求或一个设计里程碑结束时生成，不再每次小改都重出。

### 上一里程碑设计稿：已定稿

`design/app/` 已按需求改完并重出 218 张 shots。本轮改动：

- Rules 规则行高修回 42px（`9a52780` 删除 RULES LIST 切换器时漏掉了 `tree-url` 的行高，掉回基础值 30px）。
- Rules 顶栏删 Apply 与 More（保存改由 editor 承担），补导出按钮；左树背景改为 `--filter`，与 Composer 一致。
- Inspector 分组可折叠：chevron 靠右，竖线与标题位置不动。顺带修掉 `.app.shell-v2 .scroll .sh::after` 写死 `left: 10px` 导致分隔线一直比竖线偏右的老问题。
- 正文全屏：13 处工具栏加 ⛶（Capture 请求/响应各档位、WS、gRPC、Composer 请求与响应），1060×660 dialog；MIME 去掉 charset 腾位置。
- Composer 树对齐 Rules：侧栏 216→320、行高 30、字号 12.5、间距 4、缩进移到行内、计数列对齐 `.rhit`。
- Composer 顶栏换成搜索框 + 新建/新建目录/导出，与 Rules 同一组图标。
- 两棵树补右键菜单（目录 4 项、叶子 2–3 项），菜单挂在 `.app` 下避免被侧栏裁剪。
- 拖拽逻辑参数化为 `installTreeDrag`，两棵树共用；顺带修了「不能拖到上级目录」——原判定 `node.contains(dragNode)` 把祖先目录整个禁掉了，应为 `dragNode.contains(node)`。
- 两棵树接上搜索过滤与命中高亮，规则见 [platform/renderer.md](platform/renderer.md) § 6.2。

### 上一里程碑产品代码：14 条需求已全部落地

上一轮已完成：

- `Kv.module.css`：rule effect tag 只有 button 形态才给 `cursor: pointer`。
- `core-protocol/tree.ts`：新增 `parentFolderId`。
- `components/share/treeSearch.ts` + `components/HighlightedName/`：两棵树共用的搜索与命中高亮，规则见 [platform/renderer.md](platform/renderer.md) § 6.2。
- `composerStore`：目录与请求选中互斥；新建落点改为「选目录进目录、选请求跟它平级、都没选放根」；新增 `clearSelection`。
- Composer：顶栏换成搜索框 + 新建/新建目录/导出（图标与 Rules 同一组）；点空白取消选择；目录名与请求名双击原地改名；树接上搜索过滤与高亮；侧栏 216→320，行高 30、字号 12.5、间距 4、缩进移到行内、计数列对齐 `.rhit`。
- Rules：顶栏删 Apply 与 More、补导出；**保存入口移到 editor 头部的 Save 按钮**（顶栏删了 Apply 之后必须有替代入口，否则规则改完无法应用）；搜索由「跨目录拍平 + 匹配 matcher/action JSON」改为「保留树结构 + 只匹配名称」，与 Composer 一致。
- 规则导出链路：`rules:export` 通道 + Main `showSaveDialog` 落盘 + Preload `exportRules`，形态与集合导出一致，不经 Core。

本轮完成：

- `rulesStore`：`addRule` / `addFolder` 的 `parentId` 缺省时按选中项推导落点（选目录进目录、选规则跟它平级、都没选放根），与 Composer 同一套语义；`addFolder` 补上深度上限判断。
- **两棵树的右键菜单**：新增共享 `components/TreeContextMenu`（Ant Design `Dropdown` + `trigger={['contextMenu']}`），行内菜单组件分别是 `CollectionRowMenu`、`RuleRowMenu`、`RuleFolderMenu`。旧的绝对定位实现（`composer/CollectionPanel/FolderMenu`、`rules/RuleFolderMenu/`、`folderMenu` store 状态、`anchorFolderMenu` 与 `FOLDER_MENU_WIDTH` / `FOLDER_ROW_HEIGHT` 常量）**整体删除**。细节见 [platform/renderer.md](platform/renderer.md) § 6.3。
- **Inspector 分组折叠**：`SectionHeader` 支持可选 `onClick`（有则整行渲染成 button），`Section` 自己持折叠态并画右对齐 chevron。
- **正文全屏**：新增共享 `components/BodyFullscreen`（1060×660 Modal），`BodyViewer` 与 Composer `BodyPane` 各自把同一份 content 按 `fullscreen` 放进弹层。入口出现在 Capture 请求/响应正文、WebSocket 帧、gRPC 消息、Composer 请求/响应正文。细节见 [platform/renderer.md](platform/renderer.md) § 6.4。
- Capture 正文区补 `min-height: 320px`，面板压缩时 Monaco 不会缩成一条缝。
- **`Format 按钮点了没反应` 定位并修复**：`monaco-editor/editor/editor.api` 只有 API 表面，不含 editor contributions，所以 `editor.action.formatDocument` 从来没被注册过，`getAction(...)?.run()` 一直静默 no-op。JSON 看起来正常是因为 `formatJsonBody` 在 JS 侧先 pretty-print 过，HTML/CSS 则完全没格式化。修法是在 `monacoSetup.ts` 里补 `import 'monaco-editor/editor/contrib/format/browser/formatActions'`，已用 renderer 构建产物确认 `editor.action.formatDocument` 进包。
- i18n 15 语言补齐 `rules.exportRules` / `rules.searchEmpty` / `rules.save` / `rules.renameRule` / `composer.searchRequests` / `composer.searchEmpty` / `composer.renameRequest` / `composer.deleteRequest` / `composer.requestBody` / `composer.responseBody` / `capture.payload` / `body.fullscreen` / `body.exitFullscreen`。

仍未做（需要先出设计稿并确认）：

- `rule detail 的提示可以放底栏`：设计稿里 `.vnote` 仍是滚动区最后一张卡片，没有底栏形态，产品代码保持现状。

### 上一轮已完成

上游代理链路修复与自愈，详见 [features/settings.md](features/settings.md) § 3.4。三个叠加根因：`<local>` 展开出裸 `::1` 让 `matchesNoProxy` 匹配一切、Mockttp `passthroughSocket` 写死 `net.connect`、写回的 bypass 缺 IP 字面量。

## Git 与工作树

- 分支：`main`。
- 本轮提交只包含 `design/app/{index.html,app.css,app.js,sprite.js,shoot.mjs}`、设计 shots 以及同步文档；产品代码基线仍为 `77066d7 feat(renderer): 两棵树右键菜单 、Inspector 折叠与正文全屏，并修好 Format`。
- Windows App / Dev Box 的 WVD gateway bypass 修复已单独存为 `stash@{0}: wip: Windows App WVD gateway bypass`，不要与 Breakpoint 设计混合。
- `design/app/shots/` 当前共有 267 个文件。Capture、Rules、Composer 均已按最终状态顺序重出；资产复核为 0 个删除、40 个新增文件。
- 接手时用以下命令确认实际状态：

```powershell
git status --short --branch
git log -4 --oneline
git -c core.whitespace=cr-at-eol diff --check
```

- 仓库是 CRLF 工作区，裸 `git diff --check` 会把行尾 CR 报成 trailing whitespace；用 `-c core.whitespace=cr-at-eol` 才是真实结果。
- 不提交 `.vite/`、`out/`、`playwright-report/`、`test-results/` 或未跟踪的 `renderer-shots/*.png`。
- `apps/desktop/tests/visual-parity/parity-report.md` 与 `design/app/shots/` 是保留的验收资产。

## 最近验证

本轮设计稿验证：

- `node --check design/app/app.js`、`node --check design/app/shoot.mjs`、`node --check design/app/sprite.js`：通过。
- 编辑器诊断：`index.html` / `app.css` / `app.js` / `shoot.mjs` 无错误。
- 浏览器 DOM 验证：Breakpoint Request/Response 状态、Original loading→loaded、Off/Text/File、上传/删除、manager switches、future-traffic notice、SectionHeader 折叠均通过。
- SectionHeader computed style 与 TLS tunnel 对比：字体、字重、字距、颜色、2px accent 竖线与 1px 渐变完全一致。
- Rules/Composer 树 DOM 验证：目录/item 互斥、目录点击不折叠、chevron 才折叠、右侧内容不随目录改变、当前项淡背景+虚线、选中项保持现有样式，均通过；行内 Check 数为 0。
- 最终截图重出：Capture 40 张、Rules 16 张、Composer 34 张，均通过；`design/app/shots/` 共 267 个 PNG。
- `git -c core.whitespace=cr-at-eol diff --check`：通过。
- **未运行产品 typecheck/tests/package/smoke**：本轮没有产品代码改动。

上一里程碑验证：

- 四 workspace typecheck：通过。
- Tests：Desktop 188、Proxy Core 248、Protocol 15、MCP 45，共 496 项通过。
- Proxy Core 全套使用 `--no-file-parallelism`。`upstream-probe.test.ts` 用真实 timer（1s 间隔 + 500ms 超时），跟别的套件抢 CPU 时会假失败，单独跑稳定 5/5。
- Windows x64 package：通过。
- Artifact audit：1,293 files / 391,243,058 bytes，通过。
- 真实 packaged smoke：1/1 通过。修了一处上一轮遗留——`onSystemProxyStatusChange` 没加进 smoke 的 Preload API 期望列表。
- `npm audit --omit=dev`：0 vulnerabilities。
- `git -c core.whitespace=cr-at-eol diff --check`：干净。
- **本轮未跑**：Visual parity。Composer 与 Rules 的 DOM/尺寸、Inspector 分组与正文工具条都变了，parity 基线需要整体重出。

## 剩余工作

### 下一动作

1. 继续由用户评审当前 Breakpoint 与 Rules/Composer tree 设计；**不要生成截图，除非用户明确要求**。
2. 解决尚未完全定稿的一处语义：右键 submenu 仍写 `Break request + response once`，但 manager 已删除 Once/Always；实现前必须统一。
3. 用户确认设计后，先迁移 `design/app` 到 Vite + React + CSS Modules，并删除旧静态实现。
4. 在新设计 SPA 中复现并验证全部现有设计场景，再开始产品实现；产品第一步是全局断点感知、`exchangeId` 关联与 queue cap，不直接从 JSX 外观开工。
5. 产品实现完成后再更新 `platform/renderer.md`、重出 visual parity 基线并跑完整 Desktop/Core 验证。

### 独立队列

- 上游代理仍有两块未验证：**认证代理**（公司 SSO / `Proxy-Authorization`，WinINet 不保存凭据）与 **macOS 上游检测**（快照按网络服务分存，多服务合并语义未定）。
- Visual parity 还没收录新的 upstream 状态栏场景（`statusbar-upstream-down`）。
- Local E2E 仍是 0 条 implemented workflow。第一条必须从 `application.startup.ready` 开始，只通过公共 automation ID 操作真实 App UI；保存 trace/evidence 并验证 destroy 后才能改 Inventory 状态。
- Visual parity 仍有 29 missing / 226 flagged，主要属于 Capture、Settings、Updates 的既有场景债务；完整明细见 `parity-report.md`。
- 首个真实 tag release 仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。

## 风险与边界

- **设计不是实现**：当前产品仍有独立 Breakpoints workspace、1s 页面级轮询、独立 WS 开关和无 Capture 行关联；不要把 design SPA 状态描述成已上线能力。
- Original body loading、paused exchange 原地编辑、文件 replacement 都需要新的 Core/Preload 契约；Renderer 不能直接读本机文件或 Core 内部 writer。
- 静态 design SPA 在迁移前仍存在全局 CSS/手写 DOM 串扰风险；小改后优先做定向 DOM/geometry 检查，不要通过反复全量截图掩盖状态错误。

- 系统代理由 Main 所有。开发实例与 smoke 都使用 8888，不能并行运行。
- 若进程被强杀并遗留 `127.0.0.1:8888`，先恢复 WinINet，再继续测试。**残留还会让上游静默丢失**：接管前读到的“原有配置”就是自己，`isSelf` 会把它当作无上游，于是真正的公司代理地址就此丢失。
- `patches/mockttp+4.5.0.patch` 提供 headers 阶段钩子、trailer 事件与 `passthroughProxyConfig`（未解密直通走上游 CONNECT 隧道）；升级 Mockttp 必须人工 review patch 并重跑真实 Core/package 测试。
- Forge Vite Plugin 仍是 Experimental；修改 Main、Preload、IPC、Fuses、CSP、Core 生命周期或打包路径后必须重跑 package、artifact audit 与真实 smoke。
- Renderer 只能通过 `window.interceptor` 窄意图 API 访问 Main；正文留在 Core，按有限 range/chunk 读取。
- `UtilityProcess.parentPort` 只承载 lifecycle 与 MessagePort transfer；业务 RPC 只走专用 MessagePort。

## 常用验证

```powershell
npm run typecheck
npm run test --workspace @interceptor/desktop
npm run test --workspace @interceptor/proxy-core -- --no-file-parallelism
npm run test --workspace @interceptor/core-protocol
npm run test --workspace @interceptor/mcp-server
node apps/desktop/tests/visual-parity/parity.mjs
```

涉及打包边界时：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:package-audit --workspace @interceptor/desktop
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
git diff --check
```

## 更新规则

- 只写当前状态、工作树、验证、风险与下一动作。
- 已完成实现同步到 `platform-*.md` 或对应的 `feature-*.md`，不要复制到这里。
- 未承诺的远期方向放 [backlog/research.md](backlog/research.md)，不要堆在本文件。
