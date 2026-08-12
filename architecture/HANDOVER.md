# Interceptor Handover

> 最后更新：2026-08-12
> 仓库直接提交到 `main`，没有额外 PR 边界。
> 本文件只设两个一级章节；已实现内容同步到对应架构文档后从本文件删除，未实现项留在“待完成”。未经代码核对不得删除或标记完成。

## 已完成

经当前产品代码逐条复核，上游代理、Rules / Composer / Inspector、AppContainer exemption manager
与 per-host TLS passthrough 均已实现。TLS passthrough 默认列表为空，WVD 仅作为 Settings 推荐项。
Mockttp patch 让 `tlsPassthrough` 接受 getter，名单每连接求值，**保存即对新连接生效**，
`Restart Interceptor` 提示条与整条 restart 链路（IPC、`app.relaunch`、`CoreRuntime.restart`）已删除。
Windows system proxy 不再注入 `*.wvd.microsoft.com` bypass。Breakpoint 目标尚未落地，已移入
“待完成”并逐条标明状态。

TLS 命令按用户交互拆成正交四条：`tls.useCertificate` 只记录当前 CA 材料，
`tls.startDecryption` / `tls.stopDecryption` 只切解密，`tls.replaceInsecureHosts` 只换源站例外名单。
换 listener 的唯一触发点是「开始解密且 listener 上仍挂着旧证书」；卸载信任或删除 CA 后紧跟
stopDecryption，全量 passthrough 下证书永不出示，因此不需要立刻重建。

Settings 配置全部落到 Core `workspace.sqlite`：TLS passthrough 名单、源站证书 per-host 例外
（`tls_insecure_hosts`）、HTTPS 解密意图（`tls_decryption_preference`）。后两者只有一个编辑入口，
走不比对 revision 的 `overwrite`。Main 启动时先读回解密意图，再按「CA 已信任 且 用户开启」决定是否
真的解密——持久化的是用户意图，不是运行态。

TLS compatibility event 由 App 壳订阅，按规范化 host 累积为全局列表 dialog。dialog 为每个 host 列出
多层级候选（精确 host + 逐级父域 wildcard，最宽只到二级域），精确 host 默认勾选、wildcard 默认不选，
由用户自己决定放行范围；已挂载页面通过 change sequence 立即刷新。Settings 页面自身不显示兼容
建议条；wildcard 已覆盖项不重复写，旧批次保存完成不会 dismiss 同期到达的新 host 事件。

源站证书验证失败（TLS②）现在有就地出口：Capture Inspector 的 Connection / TLS 面板在 detail
`errorCode` 属于证书校验类时显示 callout 与 `Trust this host`，一键写入 per-host 例外。协议协商类
失败（`EPROTO` 等）不显示，因为加例外也不解决。

Settings Updates 已增加 private GitHub App Device Flow 临时鉴权。Client ID 为公开配置，App 只需
`Contents: read-only` 并安装到当前仓库；token 与 OAuth 过期时间经 `safeStorage` 加密。每次 App
启动用未过期 refresh token 轮换整组凭据；运行期按最新 access token 过期时间提前 5 分钟刷新，
成功后重排唯一 timer。缺失、过期或非退出刷新失败即清空登录；退出取消 timer，等待下次启动。
仓库转 public 后整块删除 auth service / IPC / store / UI，updater 恢复匿名访问。

设计稿已统一到 `design-vite/`（Vite + React + CSS Modules），静态 `design/` 整个删除，
`design-system.md` 与 `README.md` 随之移入。删除前完成 1:1 验收：交互 71/71 match，像素平均
0.0239%、最大 0.051%，`0 missing / 0 resized / 0 not drawn`，仅图标描边有差——旧 sprite 是手写的
旧版 lucide 几何加 `stroke-width: 1.9`，新稿用 lucide-react 默认 `2`，按用户决定不再收敛，
产品一律用 lucide icon。`compare-shots.mjs` 转为需显式基线的回归工具；`generate-fixtures.mjs`
与 `interaction-parity.mjs` 的输入是旧稿，已一并删除，`src/fixtures/generated/*` 现在是定稿的静态
DOM 快照。`apps/desktop/tests/visual-parity/` 改为经 `design-vite/tools/design-preview.mjs`
build + preview 设计稿，基线 PNG 与应用图标都取自 `design-vite/`，已用 `--view=capture` 验证跑通。
命令与陷阱清单见 [../design-vite/README.md](../design-vite/README.md) 与 `ui-design-mockup` skill。

Windows App 已于 2026-08-11 完成用户现场使用验收，当前方案下暂未发现问题，按现状收口。
此前未单独留存自动化证据的细分矩阵不再阻塞产品主线；以后触及 Main / Preload / IPC、系统代理、
AppContainer、TLS 或打包边界时，仍须按本文完成门禁重新执行 packaged smoke。

## 待完成

### 当前工作树与接手顺序

- 分支：`main`，HEAD `32867ff`；当前未提交切片是 WebSocket 帧断点 parity / 内嵌 Messages editor、
  design-vite 截图状态清理、15 语言消息文案、DOMPurify 3.4.13 安全补丁与本次架构同步。
- `backlog/idea.md`、`backlog/image-13.png`、`backlog/image-14.png` 与当前
  `apps/desktop/tests/visual-parity/parity-report.md` 包含现有用户改动，不要删除、覆盖或纳入无关提交。
- `stash@{0}: wip: Windows App WVD gateway bypass` 是已被当前实现取代的临时补丁，不要再次 apply。
- 接手时先读本文件，再读 [platform/processes.md](platform/processes.md)；改具体模块前读对应 feature 文档；[README.md](README.md) 是文档索引。
- 接手时执行：

```powershell
git status --short --branch
git log -4 --oneline
git -c core.whitespace=cr-at-eol diff --check
```

- 仓库为 CRLF 工作区，必须使用 `-c core.whitespace=cr-at-eol` 检查；不要提交 `.vite/`、`out/`、`playwright-report/`、`test-results/` 或未跟踪的 `renderer-shots/*.png`。
- `design-vite/shots/` 与 `apps/desktop/tests/visual-parity/parity-report.md` 是验收资产，不得清理。

### 精确下一动作

进入 Breakpoint wire correctness：先为 HTTP `Execute edited` 建立真实 H1 / H2 集成测试，逐项锁定
`Content-Length`、`content-encoding` 与 transfer-encoding；测试证明确有问题后再改转发实现，不能先靠
Renderer 重写 header 猜测修复。随后补 WebSocket binary hex 编辑后的字节还原回归。

### Private GitHub Release 更新：实现与验证

- private GitHub App Device Flow、`safeStorage` 加密凭据、私有 Release metadata/Asset API、Main/Preload/Renderer 窄契约与 Updates 四态 UI 已实现。
- token expiration 来自 GitHub OAuth 响应的 `expires_in` / `refresh_token_expires_in`，保存为绝对时间；启动时刷新一次，运行期按最新 access token 过期时间提前 5 分钟刷新，成功后重排唯一 timer，非退出刷新失败清空登录。
- 聚焦测试 28/28：auth 10、private updater 14、Renderer store 2、15 语言 auth catalog 2；真实 Device Flow Client ID 请求返回 200、固定 verification URI、约 15 分钟 code 与 5 秒 polling interval。
- light/dark signed-out、authorizing、failed、signed-in Updates parity 均收敛到 0 flagged，最大几何差小于 1px；Settings 设计截图已重出。
- Windows x64 `npm run package` 已成功；最新 artifact audit 为 1,294 files / 391,441,664 bytes，全部通过。ASAR Main 扫描确认只有公开 Client ID，未包含 `ghu_` / `ghr_` / PAT / `client_secret` / private key。
- 首次 package 被旧 `out/Interceptor-win32-x64` 的不可读 ACL 阻塞；旧产物已整体移到仓库外 `H:\code\Interceptor-build-backups\out-permission-blocked-20260807`，未删除其内容，新 `out/` package 正常。
- packaged smoke 未运行：当前开发实例 PID 18720 的 Core UtilityProcess PID 34928 正监听 8888，不能在不打断用户会话的前提下并行接管系统代理。
- TLS passthrough 与 GitHub 更新切片已合并通过完整门禁：Desktop 224、Proxy Core 261、Core Protocol 15、MCP 45，共 545 项；全部 workspace typecheck、Core 构建、Windows package 与 artifact audit 成功。Proxy Core 全并行本地网络集成测试偶发瞬时 `ECONNRESET`；最新失败的 H2 文件串行 6/6、Core 全量串行 261/261 均通过。多 host TLS compatibility dialog 明暗场景和已挂载 Settings 批量保存/即时刷新场景均为 0 flagged。

### 主任务：Breakpoint 产品实现

WebSocket 帧断点产品与 visual parity 已收口；当前主任务只剩 wire correctness 与容量边界。

阶段 2a 与断点正文交互已完成，剩余收口项如下：

以下状态按当前产品代码逐条核对；完整目标与当前差异见 [features/breakpoints.md](features/breakpoints.md)。
提交：`941e40a`（断点合并进 Capture + design-vite 交互 harness）。

已完成：

- **感知与关联。** `useBreakpoints` 订阅 Main 推送的 `breakpointsChange` 信号刷新，不再轮询；Core 重启时清空本地记录并在 `running` 后重新拉取。任意工作区都能感知；Sidebar 的 Capture 项带 pending badge。`BreakpointSnapshot` / `PendingBreakpoint` 带 `exchangeId`：`ExchangeTracker.exchangeIdFor` 在首次询问时**预留** ID 供 `beginRequest` 复用——规则钩子先于 `request-initiated` 到达，不预留就拿不到行号（已由真实代理集成测试锁定）。未 Recording 时返回 undefined，因为那次请求不会有 Capture 行。
- **队列上限。** `BREAKPOINT_QUEUE_LIMIT = 10`；`BreakpointQueue.suspend` 满时返回 `null`，调用方必须原样放行。`autoContinued` 计数经 `breakpoint.pending` 上报，Capture 状态栏展示，Core 侧 `breakpoint.queue-full` 留痕。
- **客户端 abort 清理。** `timeoutMs` 是 Core 最大等待时间，不保证客户端会等满。客户端先断开时，Proxy 按 Mockttp request ID 只释放该请求的 HTTP suspension，RuleService 以 `aborted` 短路后续 action；真实代理回归已锁定 pending 立即清零且 Capture Exchange 进入 `aborted`。
- **Breakpoint Inspector 滚动。** 根 flex item 与普通 Inspector 一样设置 `min-height: 0`，长 headers / body 由内部 `.scroll` 接管滚动，不再把 Inspector 按内容高度撑出分栏。
- **合并进 Capture。** 独立 Breakpoints 导航、workspace、Editor、PausedQueue、Statusbar 全部删除。workbar 有 Breakpoint 入口 + pending badge + 520px manager（`Break on match`、`Advanced rules`、`View rule`、规则 enable switch）；paused 行原地显示黄色 pause icon，request 阶段 size 显示 `waiting`；Inspector 随 paused 行切换为 `BreakpointInspector`。
- **从历史流量创建。** 右键 Breakpoint 子菜单四档：This endpoint / This path prefix / This host / Custom…。`addBreakpointRule` **创建即启用即 Apply**——断点 matcher 全部来自真实请求，不存在“字段没填完”。
- **创建反馈与 Undo。** Core Apply 成功后显示 Ant Message `Breakpoint created`；5 秒自动关闭，hover 暂停计时，支持主题色实心 Undo 与关闭。Undo 删除刚创建的 rule 并再次 Apply；Apply 失败不显示虚假成功，Undo 失败保留消息供重试。
- **请求右键菜单。** 一级与 Breakpoint 子菜单统一使用 Ant `Dropdown/Menu` 的 `items[].children`，子菜单 hover 展开；`placement="right" + autoAdjustOverflow` 负责贴边与翻转。菜单包住稳定的 RequestList，目标 summary 独立于虚拟行，因此新增请求自动滚动和行回收不会关闭菜单；outside click / Escape 由 Ant 原生关闭。
- **Break once 语义已统一（方案 B）。** 不实现 once：那是一个既看不到也改不回来的隐藏状态。快速创建生成 request + response 两条 action 持续生效，停用入口就是 manager 里的开关。
- **正文替换语义。** `BreakpointDraft.replacement` 为 `off | text | file`。只有选了 Text 才可能带 `body`；看不见原文时空输入意味着“没填”而非“改成空”，看得见原文（WebSocket）时清空才是真实意图。File 档只经 IPC 传路径，由 Core 直接读盘，与 Map Local 同一条路，因此不受正文大小与二进制限制。
- **Original body 三态。** 该侧是否有正文按两个信号判断：`detail.summary` 已收到字节即为确证，没有字节时才用 HTTP 语义（`content-length` / `transfer-encoding: chunked`）预判。无正文显示空态，有正文但 Capture 还没收完显示接收中与已收字节，收完后按 detail 正文渲染。不能只用「Capture 是否给出 body 引用」判断，否则 GET 会永远停在接收中。
- **区块结构。** headers 与 original 复用 `Section`；replacement 因标题行内含 Segmented 不能整行做按钮，改为复用 `SectionHeader` 的非按钮形态并自带 chevron。`SectionHeader` 现在拥有折叠指示器，顺序统一为标题 → 计数 → chevron；计数紧跟标题，只有 chevron 靠右。滚动区内的分组线是向右淡出的渐变线，不是纯色边框。
- **Rules / Composer 双状态。** 「树上选中」与「右侧打开」拆成正交状态：Rules 为 `selectedId` / `openRuleId`，Composer 为 `targetFolderId` / `activeRequestId`。选中目录只改新建落点，右侧编辑器保持不变；此时被打开但未选中的行用淡 accent 底加虚线框标出。目录行的名字成为可点按钮，因此目录也能进入 selection。
- **Rules typography。** 规则树字体层级对齐 Composer collection：规则名与目录名 400 字重、`--text-2`、UI 字体；选中态目录 600、规则 560，均转 accent。

- **visual parity 断点场景。** `breakpoints` 场景已重建到 capture view 的 `breakpoint-request-body-loaded`（正文已就绪的稳定态），收敛到 2 flagged、最大 1.1px，字体差异全部归零。两个必须记住的约束：设计稿 `breakpointBody` 默认 `'loading'` 且 3 秒后自动跳到 `'ready'`（`useDesignFixtureAdapter.ts`），harness 驱动期间必然已跳走，场景只能锚定 `'ready'`，`breakpoint-request-paused.png` 是 3 秒内抢拍的不能做几何基线；设计稿只有断点态的列表才含 `/checkout` 与 `/v1/token`，所以 fake 的这两条交换与 `pendingBreakpoints` 放在 `pausedSessions` / `pendingItems`，由 `pausedBreakpoints: true` 注入。
- **本切片验证。** Breakpoint abort 聚焦测试 29/29，Proxy Core 全量串行 277/277，Desktop 246/246；全部 workspace typecheck 与 design-vite build 均通过。Message light/dark 为 `4/4 matched / 0 missing / 0 flagged / geometry 0`；Undo 行为场景 `0 missing / 0 flagged`。一级菜单为 `4/4 matched / 0 missing / 0 flagged`；两级菜单为 `8/8 matched / 0 missing`，仅子菜单标题 1px 字宽差。1280×800 与 1024×600 均通过两级 popup viewport 边界断言，注入 40 条新请求后保持，outside click 关闭通过。隔离完整 parity 跑完 69 views（70 missing / 105 flagged，均为已知债务）；未覆盖仓库中的用户报告。已删除仍点击旧独立 Breakpoints 导航的废弃 `shell-v2-breakpoints-dark` 配置。
- **ORIGINAL BODY 按完整查看器定稿。** 设计稿原本画的精简只读预览已改成产品的 `BodyViewer` 形态（`Pretty / Tree / Raw / Hex` + mime + 复制 / 全屏），数值均取自产品代码：容器 `gap: 10px`、工具栏 40px、Monaco compact 的 `lineHeight: 20` 与 13px 上下内边距，以及 `horizontalScrollbarSize: 8` 的水平滚动条槽。
- **design-vite 断点侧区块头统一到 `CollapsibleSection`。** HTTP breakpoint、WebSocket upgrade breakpoint、WebSocket 消息详情共用同一个组件，几何与旧 `.sh` 逐项对齐：`min-height 24 / padding 0 0 8px 10px / margin-bottom 12 / gap 8`、左侧 accent 竖条 `::before`、向右淡出的渐变分组线 `::after`、计数 badge 走 `.c` 的 `padding 1px 6px` 且 `letter-spacing: 0; text-transform: none`，chevron 13px 靠右。踩过两个坑：`CollapsibleSection` 初版漏了 `::after` 渐变线并把计数 badge 拉成 22px 定高，视觉与旧稿不一致；`HttpBreakpointDesign` 的 legacy 隐藏逻辑按 `[aria-label="Header name"]` 选中了 React 自己 portal 出来的容器，把新内容一起 `display: none`，因此 portal 根必须带 `data-breakpoint-component`。
- **断点按钮收敛为 `ActionButton`。** Drop / Continue / Forward edited 与 WebSocket breakpoint setup 弹框的 Cancel / Enable breakpoint 共用同一个 icon + 文字按钮，`ActionFooter` 只负责 58px 底栏布局。
- **WebSocket 帧断点已落地到产品。** 开关从布尔改成真实配置：`websocket.breakpoint.enable`（`exchangeId` / `direction` / `frames` / `timeoutMs`）与 `websocket.breakpoint.disable` 两条语义单一的命令取代了 `websocket.breakpoint.configure { enabled }`，`websocket.frames` 结果也改返回 `breakpoint: WebSocketBreakpointSettings | null`。**作用域锁在发起它的那条连接**：`exchangeId` 不匹配的帧直接放行，`websocket.frames` 也只在匹配时报告该配置，UI 上“Pause messages on this connection”就是字面意思。`WebSocketBridge` 的 ping / pong / close 不再直通，与应用消息共用方向内串行链后才转发；close 帧另带可编辑的 `closeCode`。`pauseWebSocketMessage` 不再检查 HTTP 的 `breakpointsEnabled`，两个开关正交。Renderer 侧 WS 面板的 Switch 换成 pause 按钮 + setup 面板（Direction / Frames / Timeout），启用必经配置、停用一键；BreakpointInspector 对控制帧显示帧类别 chip 与 close code 编辑。MCP 同步拆为 `enable_websocket_breakpoint` / `disable_websocket_breakpoint`，`configure_breakpoint` 只管 HTTP。
- **WebSocket parity 与内嵌 editor。** setup / enabled / paused 已按 light / dark 六个 view 收录；pending
  自动切到 Messages，历史帧保留，paused snapshot 作为 waiting row，Original 复用 `BodyViewer`，Replacement
  默认 Off。六个 view 均 `0 missing`，最大几何差 2px；完整套件已稳定跑完 75 views。
- **本切片验证。** 全 workspace typecheck 通过；Proxy Core 串行 279/279、Desktop 248/248、Core Protocol
  15/15、MCP 45/45，共 587 项。design-vite build 与 Capture 160 张截图通过；完整 parity 为
  `75 views / 602 targets / 566 matched / 36 missing / 145 flagged / 平均 2.64%`，新增六个 WS view 全部
  0 missing。Windows x64 package 与 artifact audit 通过：1,294 files / 391,548,917 bytes。
  DOMPurify 从受 GHSA-55q2-fjhq-7xh7 影响的 3.4.12 提升到 3.4.13，`npm audit --omit=dev` 为 0。

未做：

- **design-vite detail inspector 仍未组件化。** `captureFixture` / `composerFixture` 里的 13 + 4 个 `.sec > .sh` 仍是 legacy HTML，靠 `useDesignFixtureAdapter` 命令式切 `collapsed`，没有走 `CollapsibleSection`。断点侧已全部收敛，剩下的是把这些区块（General、Request/Response Headers、Composer 各段）迁到同一个组件，迁完后删掉 `DesignApp.module.css` 里的 `.sh` / `.sec` / `.esec` 规则与 adapter 第 449 行的折叠分支。

- **Content-Length / content-encoding / H2 framing** 在 Execute edited 后的正确性未验证。
- **设计稿其余 17 个断点变体**（queue、queue-full、created-message、manager、create-menu、file / invalid / replace 各档）未收录进 parity。

实现顺序与边界：

- `rule detail` 提示移到底栏尚无确认设计；当前 `.vnote` 仍在滚动区末尾，产品保持现状。

### 长期债务：继续保留，未完成

- 上游认证代理（公司 SSO / `Proxy-Authorization`）尚未验证；WinINet 不保存凭据，需要用户手工提供。
- macOS 上游检测尚未实现；多网络服务各自配置代理时的合并语义未定。
- 仅 Auto Detect（WPAD）环境没有可传给 proxy-agent 的 URL，当前按直连处理。
- visual parity 尚未收录/验收新的 `statusbar-upstream-down` 状态栏场景。
- Composer / Rules DOM、Inspector 分组与正文工具条变化后，visual parity 基线尚未整体重出。
- Local E2E 仍是 0 条 implemented workflow；第一条必须从 `application.startup.ready` 开始，只通过公共 automation ID 操作真实 UI，保存 trace/evidence，并验证 destroy 后才能更新 Inventory。
- Visual parity 当前仍有 36 missing / 145 flagged，主要是 Capture、Settings 与旧 Shell 场景债务；详见
  `apps/desktop/tests/visual-parity/parity-report.md`。
- 首个真实 tag release 仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。
- SSE、长上传/下载、gRPC streaming、Pause/Resume、Clear 与文件任务等长期测试债务继续以 [backlog/TODO.md](backlog/TODO.md) 为准；只有代码和验收均完成后才可勾掉。

### 风险与边界：必须遵守

- 系统代理由 Main 所有；开发实例与 smoke 都使用 8888，不能并行运行。
- 若进程强杀后遗留 `127.0.0.1:8888`，先恢复 WinINet。残留还会让接管前读取到“自己”，`isSelf` 会视为无上游并静默丢失真实公司代理。
- Clash 等本机代理若在 Interceptor 已 owned 后改写 WinINet，会触发 ownership-lost 保护；不做反抢。
- `patches/mockttp+4.5.0.patch` 提供 headers 阶段钩子、trailer 事件与 `passthroughProxyConfig`；升级 Mockttp 必须人工 review 并重跑真实 Core/package 测试。
- Forge Vite Plugin 仍为 Experimental；修改 Main、Preload、IPC、Fuses、CSP、Core 生命周期或打包路径后，必须重跑 package、artifact audit 与真实 smoke。
- Renderer 只能通过 `window.interceptor` 窄意图 API 访问 Main；正文留在 Core，通过有限 range/chunk 读取。
- `UtilityProcess.parentPort` 只承载 lifecycle 与 MessagePort transfer；业务 RPC 只走专用 MessagePort。
- 静态 design SPA 迁移前仍有全局 CSS / 手写 DOM 串扰风险；小改优先做定向 DOM / geometry 检查，不用反复全量截图掩盖状态错误。

### 完成门禁

```powershell
npm run typecheck
npm run test --workspace @interceptor/desktop
npm run test --workspace @interceptor/proxy-core -- --no-file-parallelism
npm run test --workspace @interceptor/core-protocol
npm run test --workspace @interceptor/mcp-server
node apps/desktop/tests/visual-parity/parity.mjs
```

涉及 Main / Preload / IPC / native helper / 打包边界时还必须执行：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:package-audit --workspace @interceptor/desktop
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
git -c core.whitespace=cr-at-eol diff --check
```

### 交接维护规则

- 已实现内容同步到对应 `platform/*.md` 或 `features/*.md` 后从本文件删除，不保留历史完成清单。
- 未实现或未验证的内容必须留在“待完成”；只存在于 `design-vite` 的目标一律按产品未实现记录，并链接到唯一详细文档。
- 长期候选放在 [backlog/research.md](backlog/research.md)，确认 BUG 与验收欠账放在 [backlog/TODO.md](backlog/TODO.md)；未经代码和验收确认不得移除。
