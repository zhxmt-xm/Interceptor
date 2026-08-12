# Interceptor Handover

> Tracked commit: `c2acc13`
> Branch: `main`，直接提交，没有额外 PR 边界
> 最后更新：2026-08-12

## Task List

- [x] **已完成 · 产品基线**：经产品代码复核，上游代理、Rules、Composer、Inspector、AppContainer exemption manager 与 per-host TLS passthrough 均已实现。TLS passthrough 默认列表为空，WVD 只作为 Settings 推荐项；Windows system proxy 不再注入 `*.wvd.microsoft.com` bypass。
- [x] **已完成 · TLS passthrough 热生效**：Mockttp patch 让 `tlsPassthrough` 接受 getter，名单在每次连接时求值，保存后对新连接立即生效；`Restart Interceptor` 提示条及 `app.relaunch`、`CoreRuntime.restart`、相关 IPC 整条重启链路已删除。
- [x] **已完成 · TLS 命令与 listener 生命周期**：`tls.useCertificate` 只记录当前 CA 材料，`tls.startDecryption` / `tls.stopDecryption` 只切换解密，`tls.replaceInsecureHosts` 只替换源站例外名单。只有“开始解密且 listener 仍挂旧证书”会换 listener；卸载信任或删除 CA 后会停止解密，全量 passthrough 下证书不出示，因此无需立即重建 listener。
- [x] **已完成 · Settings 持久化**：TLS passthrough 名单、`tls_insecure_hosts` 与 `tls_decryption_preference` 全部落到 Core `workspace.sqlite`。源站例外和解密意图只有一个编辑入口，使用不比较 revision 的 `overwrite`；Main 启动先读回用户意图，再按“CA 已信任且用户开启”决定运行态，持久化的不是瞬时解密状态。
- [x] **已完成 · TLS compatibility event**：App 壳订阅事件并按规范化 host 累积为全局列表 dialog；每个 host 提供精确 host 与逐级父域 wildcard，最宽到二级域。精确 host 默认勾选、wildcard 默认不选；已覆盖项不重复写，已挂载页面通过 change sequence 立即刷新，旧批次保存完成不会 dismiss 同期到达的新 host。
- [x] **已完成 · 源站证书失败出口**：Capture Inspector 的 Connection / TLS 面板在 `errorCode` 属于证书校验类时显示 callout 与 `Trust this host`，一键写入 per-host 例外；`EPROTO` 等协议协商错误不显示无效入口。
- [x] **已完成 · Private GitHub App Device Flow**：Client ID 是公开配置，App 只需 `Contents: read-only` 并安装到当前仓库；token 与 OAuth 过期时间经 `safeStorage` 加密。启动时使用未过期 refresh token 轮换整组凭据，运行期按最新 access token 到期前 5 分钟刷新并重排唯一 timer；缺失、过期或非退出刷新失败即清空登录，退出取消 timer。仓库转 public 后应删除 auth service / IPC / store / UI，updater 恢复匿名访问。
- [x] **已完成 · Private Release 验证**：聚焦测试 28/28（auth 10、private updater 14、Renderer store 2、15 语言 auth catalog 2）；真实 Device Flow Client ID 请求返回 200、固定 verification URI、约 15 分钟 code 与 5 秒 polling interval。signed-out、authorizing、failed、signed-in 的 light / dark Updates parity 均收敛到 0 flagged，最大几何差小于 1px，Settings 设计截图已重出。
- [x] **已完成 · Private Release 打包边界**：Windows x64 package 成功；该阶段 artifact audit 为 1,294 files / 391,441,664 bytes。ASAR Main 只包含公开 Client ID，不含 `ghu_`、`ghr_`、PAT、`client_secret` 或 private key。旧 `out/Interceptor-win32-x64` 曾因不可读 ACL 阻塞，已完整移到仓库外 `H:\code\Interceptor-build-backups\out-permission-blocked-20260807`，未删除其内容；新 `out/` 可正常 package。
- [x] **已完成 · TLS / GitHub 更新阶段门禁**：该阶段曾通过 Desktop 224、Proxy Core 261、Protocol 15、MCP 45，共 545 项，以及全部 workspace typecheck、Core 构建、Windows package 与 artifact audit。Proxy Core 并行本地网络测试曾偶发瞬时 `ECONNRESET`；对应 H2 文件串行 6/6、Core 全量串行 261/261 通过。多 host compatibility dialog 和已挂载 Settings 批量保存/即时刷新场景均为 0 flagged。
- [x] **已完成 · 设计源迁移**：设计稿统一到 `design-vite/`（Vite + React + CSS Modules），旧静态 `design/` 删除，`design-system.md` 与 `README.md` 已迁入。迁移前交互 71/71 match，像素平均 0.0239%、最大 0.051%，`0 missing / 0 resized / 0 not drawn`；仅旧手写 sprite 的 1.9 描边与 lucide-react 默认 2 有差，按决定不再收敛，产品统一使用 Lucide。
- [x] **已完成 · 设计验收工具迁移**：`compare-shots.mjs` 改为必须显式提供基线；依赖旧稿的 `generate-fixtures.mjs` 与 `interaction-parity.mjs` 已删除，`src/fixtures/generated/*` 是定稿静态 DOM 快照。Visual parity 通过 `design-vite/tools/design-preview.mjs` build + preview 设计稿，基线 PNG 与应用图标来自 `design-vite/`；命令与陷阱见 [../design-vite/README.md](../design-vite/README.md) 和 `ui-design-mockup` skill。
- [x] **已完成 · Windows App 现场验收**：2026-08-11 现场使用暂未发现问题，当前方案按现状收口。此前未单独留存自动化证据的细分矩阵不再阻塞主线；以后触及 Main / Preload / IPC、系统代理、AppContainer、TLS 或打包边界仍须重跑 packaged smoke。
- [x] **已完成 · Breakpoint 感知与关联**：`useBreakpoints` 订阅 Main 的 `breakpointsChange` 信号，不再轮询；Core 重启时清空本地记录，恢复 `running` 后重新拉取。任意 workspace 都能感知，Sidebar Capture 项显示 pending badge。`BreakpointSnapshot` / `PendingBreakpoint` 带 `exchangeId`，`ExchangeTracker.exchangeIdFor` 在规则钩子早于 `request-initiated` 时预留 ID 给 `beginRequest` 复用；未 Recording 的请求不产生 Capture 行，因此不提供 ID。
- [x] **已完成 · Breakpoint 队列保护**：`BREAKPOINT_QUEUE_LIMIT = 10`；队列满时 `BreakpointQueue.suspend` 返回 `null`，调用方原样放行。`autoContinued` 经 `breakpoint.pending` 上报并在 Capture 状态栏展示，Core 记录 `breakpoint.queue-full`。
- [x] **已完成 · 客户端 abort 清理**：`timeoutMs` 只是 Core 最大等待时间。客户端先断开时，Proxy 按 Mockttp request ID 只释放该请求的 HTTP suspension，RuleService 以 `aborted` 短路后续 action；真实代理回归锁定 pending 立即清零且 Capture Exchange 进入 `aborted`。
- [x] **已完成 · Breakpoint Inspector 滚动**：根 flex item 与普通 Inspector 一样设置 `min-height: 0`，长 headers / body 由内部 `.scroll` 接管，不再把 Inspector 撑出分栏。
- [x] **已完成 · Breakpoint 合并进 Capture**：基础提交 `941e40a`。独立 Breakpoints 导航、workspace、Editor、PausedQueue 与 Statusbar 已删除。Capture workbar 提供 Breakpoint 入口、pending badge 和 520px manager（`Break on match`、`Advanced rules`、`View rule`、规则 enable switch）；paused 行原地显示黄色 pause icon，请求阶段 size 显示 `waiting`，Inspector 随 paused 行切换。
- [x] **已完成 · 从历史流量创建 Breakpoint**：右键子菜单提供 This endpoint / This path prefix / This host / Custom…。`addBreakpointRule` 创建后立即启用并 Apply，matcher 全部来自真实请求，不存在半成品字段。
- [x] **已完成 · 创建反馈与 Undo**：Core Apply 成功后显示 Ant Message `Breakpoint created`，5 秒自动关闭，hover 暂停计时；提供主题色实心 Undo 与关闭。Apply 失败不显示虚假成功，Undo 失败保留消息供重试。
- [x] **已完成 · Capture 请求右键菜单**：一级与 Breakpoint 二级统一使用 Ant `Dropdown/Menu` 的 `items[].children`，子菜单 hover 展开；`placement="right" + autoAdjustOverflow` 负责贴边与翻转。菜单包住稳定 RequestList，目标 summary 独立于虚拟行，新增请求、自动滚动和行回收不会关闭菜单；outside click / Escape 由 Ant 原生处理。
- [x] **已完成 · Break once 语义**：采用持续生效方案，不实现不可见且不可恢复的 once 隐藏状态。快速创建生成 request + response 两条 action，停用入口是 manager 开关。
- [x] **已完成 · Breakpoint 正文替换语义**：`BreakpointDraft.replacement` 为 `off | text | file`。只有 Text 模式可能携带 `body`；原文不可见时空输入表示未填写，不会清空真实正文；WebSocket 原文可见时清空是明确编辑意图。File 只经 IPC 传路径，由 Core 直接读盘，与 Map Local 同路径，不受正文大小与二进制限制。
- [x] **已完成 · Original body 三态**：`detail.summary` 已收到字节是有正文的确证；没有字节时才按 `content-length` / `transfer-encoding: chunked` 预判。无正文显示空态，正文尚未收完显示接收中与已收字节，完成后按 detail 正文渲染；不能只用 Capture 是否已有 body ref 判断，否则 GET 会永久停在接收中。
- [x] **已完成 · Breakpoint 区块结构**：headers 与 original 复用 `Section`；replacement 因标题行包含 Segmented，使用非按钮 `SectionHeader` 并自带 chevron。顺序统一为标题 → 计数 → chevron，计数紧跟标题，只有 chevron 靠右；滚动区分组线是向右淡出的渐变线。
- [x] **已完成 · Rules / Composer 双状态与 typography**：Rules 拆成 `selectedId` / `openRuleId`，Composer 拆成 `targetFolderId` / `activeRequestId`。选中目录只改变新建落点，右侧编辑器保持；打开但未选中的行用淡 accent 底和虚线框标记，目录名可点击进入 selection。规则名与目录名使用 400、`--text-2`、UI 字体；选中目录 600、规则 560，并转 accent。
- [x] **已完成 · HTTP Breakpoint parity 基线**：`breakpoints` 场景锚定 `breakpoint-request-body-loaded`。设计稿 `breakpointBody` 默认 `loading` 并在 3 秒后自动转 `ready`，harness 必须锚定稳定 `ready`；`breakpoint-request-paused.png` 是 3 秒内抢拍图，不能作几何基线。设计稿只有断点态列表含 `/checkout` 与 `/v1/token`，fake 将交换与 `pendingBreakpoints` 放在 `pausedSessions` / `pendingItems`，由 `pausedBreakpoints: true` 注入。
- [x] **已完成 · HTTP Breakpoint 阶段验收**：Breakpoint abort 聚焦测试 29/29、Proxy Core 串行 277/277、Desktop 246/246，全部 workspace typecheck 与 design-vite build 通过。Message light / dark 为 `4/4 matched / 0 missing / 0 flagged / geometry 0`，Undo 为 `0 missing / 0 flagged`；一级菜单 `4/4 matched / 0 missing / 0 flagged`，二级菜单 `8/8 matched / 0 missing`，仅标题 1px 字宽差。1280×800 与 1024×600 的 popup viewport、注入 40 条新请求后的稳定性及 outside click 均通过。该阶段完整 parity 为 69 views / 70 missing / 105 flagged，旧独立 Breakpoints 导航场景已删除。
- [x] **已完成 · Original body 完整查看器**：设计稿的精简只读预览已替换为产品 `BodyViewer` 形态（`Pretty / Tree / Raw / Hex`、MIME、复制、全屏）。数值取自产品：容器 `gap: 10px`、工具栏 40px、Monaco compact `lineHeight: 20`、上下 padding 13px、`horizontalScrollbarSize: 8`。
- [x] **已完成 · design-vite 断点区块组件**：HTTP breakpoint、WebSocket upgrade breakpoint 与 WebSocket 消息详情统一使用 `CollapsibleSection`；几何为 `min-height 24 / padding 0 0 8px 10px / margin-bottom 12 / gap 8`，左侧 accent 竖条、向右淡出分组线、计数 badge `padding 1px 6px` 且无 letter-spacing / uppercase，chevron 13px。已修复初版遗漏渐变线、计数拉成 22px，以及 legacy `[aria-label="Header name"]` 误隐藏 portal 的问题；portal 根使用 `data-breakpoint-component`。
- [x] **已完成 · 断点动作按钮**：Drop / Continue / Forward edited 与 WebSocket setup 的 Cancel / Enable breakpoint 统一使用 icon + 文字动作按钮；`ActionFooter` 只负责 58px 底栏布局。
- [x] **已完成 · WebSocket 帧断点**：使用 `websocket.breakpoint.enable`（`exchangeId` / `direction` / `frames` / `timeoutMs`）和 `websocket.breakpoint.disable` 两条语义单一命令，替代旧布尔 configure；`websocket.frames` 返回 `breakpoint: WebSocketBreakpointSettings | null`。作用域锁在当前连接，其他 exchange 原样放行；ping / pong / close 与 message 共用方向内串行链，close 另带可编辑 `closeCode`。WebSocket 开关与 HTTP `breakpointsEnabled` 正交；Renderer setup 配置 Direction / Frames / Timeout，启用必经配置、停用一键。MCP 使用 `enable_websocket_breakpoint` / `disable_websocket_breakpoint`，`configure_breakpoint` 只管 HTTP。
- [x] **已完成 · WebSocket Messages 内嵌 editor 与 parity**：pending 自动切到 Messages，保留历史帧并追加 waiting row；Original 复用 `BodyViewer`，Replacement 默认 Off。setup / enabled / paused 的 light / dark 六个 view 均 `0 missing`，最大几何差 2px，完整套件已稳定跑完 75 views。
- [x] **已完成 · 最新完整门禁**：全 workspace typecheck；Proxy Core 串行 279/279、Desktop 248/248、Protocol 15/15、MCP 45/45，共 587 项。design-vite build 与 Capture 160 张截图通过；完整 parity 为 `75 views / 602 targets / 566 matched / 36 missing / 145 flagged / 平均 2.64%`，新增六个 WebSocket view 全部 0 missing。Windows x64 package 与 artifact audit 通过：1,294 files / 391,548,917 bytes。DOMPurify 从受 GHSA-55q2-fjhq-7xh7 影响的 3.4.12 提升到 3.4.13，`npm audit --omit=dev` 为 0。
- [ ] **待实现 · design-vite detail inspector 组件化**：`captureFixture` / `composerFixture` 中 13 + 4 个 `.sec > .sh` 仍是 legacy HTML，靠 `useDesignFixtureAdapter` 命令式切 `collapsed`，尚未使用 `CollapsibleSection`。迁移 General、Request / Response Headers、Composer 各段后，删除 `DesignApp.module.css` 的 `.sh` / `.sec` / `.esec` 规则与 adapter 对应折叠分支。
- [ ] **待验证 · HTTP Execute edited wire correctness**：建立真实 H1 / H2 集成测试，逐项锁定 `Content-Length`、`content-encoding`、transfer-encoding 与 framing。必须先用测试证明问题，再修改转发实现，不能先靠 Renderer 重写 header 猜测修复。
- [ ] **待验证 · WebSocket binary 与 timeout**：补 binary hex 编辑后的字节还原回归，以及 timeout continue / drop 的真实 wire 结果。当前未编辑 binary 保真已有回归，编辑后还原尚未单独锁定。
- [ ] **待验收 · 其余 Breakpoint parity**：收录 queue、queue-full、created-message、manager、create-menu、file / invalid / replace 等剩余设计变体。
- [ ] **待设计 · rule detail note**：提示移到底栏尚无确认设计；当前 `.vnote` 继续保留在滚动区末尾。
- [ ] **待验证 · 上游认证代理**：公司 SSO / `Proxy-Authorization` 尚未验证；WinINet 不保存凭据，需要设计用户手工提供方式。
- [ ] **待实现 · macOS 上游检测**：多 network service 可能各有代理，合并语义尚未确定。
- [ ] **待验证 · WPAD**：仅 Auto Detect 环境没有可传给 proxy-agent 的 URL，当前按直连处理。
- [ ] **待验收 · statusbar upstream down**：`statusbar-upstream-down` 尚未收录到 visual parity。
- [ ] **待验收 · 既有 UI parity**：Composer / Rules DOM、Inspector 分组与正文工具条变化后尚未整体重出基线；当前仍有 36 missing / 145 flagged，主要属于 Capture、Settings 与旧 Shell 场景，详见 `apps/desktop/tests/visual-parity/parity-report.md`。
- [ ] **待实现 · Local E2E 第一条 workflow**：当前 implemented workflow 为 0。第一条必须从 `application.startup.ready` 开始，只通过公共 automation ID 操作真实 UI，保存 trace / evidence，并验证 destroy 后才能更新 Inventory 状态。
- [ ] **待验收 · 首个真实 tag release**：仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。
- [ ] **待验收 · packaged smoke**：当前切片已通过 package 与 artifact audit，但尚未重跑真实 packaged smoke；开发实例占用 8888 时不能并行执行，必须先安全结束会话。
- [ ] **长期任务**：SSE、长上传 / 下载、gRPC streaming、Pause / Resume、Clear、容量与文件任务继续以 [backlog/TODO.md](backlog/TODO.md) 为准，只有代码和验收均完成后才可勾选。

## Constraints

- 系统代理由 Main 所有；开发实例与 packaged smoke 都使用 8888，不能并行。packaged smoke 在有开发实例监听 8888 时不运行，必须先安全结束会话。
- 若进程强杀后遗留 `127.0.0.1:8888`，先恢复 WinINet。残留会让接管前读取到“自己”，`isSelf` 会视为无上游并可能静默丢失真实公司代理。
- Clash 等本机代理若在 Interceptor 已 owned 后改写 WinINet，会触发 ownership-lost 保护，不做反抢。
- `patches/mockttp+4.5.0.patch` 提供 headers 阶段钩子、trailer 事件与 `passthroughProxyConfig`；升级 Mockttp 必须人工 review patch，并重跑真实 Core、package 与相关网络测试。
- Forge Vite Plugin 仍为 Experimental；修改 Main、Preload、IPC、Fuses、CSP、Core 生命周期、native helper 或打包路径后，必须重跑 package、artifact audit 与真实 smoke。
- Renderer 只能通过 `window.interceptor` 窄意图 API 访问 Main，正文留在 Core，通过有限 range / chunk 读取；`UtilityProcess.parentPort` 只承载 lifecycle 与 MessagePort transfer，业务 RPC 只走专用 MessagePort。
- design SPA 尚未完全组件化，仍有全局 CSS / 手写 DOM 串扰风险；小改优先定向 DOM / geometry 检查，不用反复全量截图掩盖状态错误。
- 不要删除或覆盖 `backlog/idea.md`、`backlog/image-13.png`、`backlog/image-14.png` 与 `apps/desktop/tests/visual-parity/parity-report.md`。`stash@{0}: wip: Windows App WVD gateway bypass` 已被当前实现取代，不要再次 apply。
- 仓库为 CRLF 工作区，使用 `git -c core.whitespace=cr-at-eol diff --check`；不要提交 `.vite/`、`out/`、`playwright-report/`、`test-results/` 或未跟踪的 `renderer-shots/*.png`。`design-vite/shots/` 与 visual parity report 是保留的验收资产，不得清理。

## Validation

- 常规完成检查：

    ```powershell
    npm run typecheck
    npm run test --workspace @interceptor/desktop
    npm run test --workspace @interceptor/proxy-core -- --no-file-parallelism
    npm run test --workspace @interceptor/core-protocol
    npm run test --workspace @interceptor/mcp-server
    node apps/desktop/tests/visual-parity/parity.mjs
    ```

- Main / Preload / IPC / native helper / 打包边界检查：

    ```powershell
    $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
    npm run package
    npm run test:package-audit --workspace @interceptor/desktop
    npm run test:smoke --workspace @interceptor/desktop
    npm audit --omit=dev
    git -c core.whitespace=cr-at-eol diff --check
    ```

## Maintenance

- 已实现内容同步到对应 `platform/*.md` 或 `features/*.md`；未实现或未验证内容必须留在 Task List，只存在于 `design-vite` 的目标按产品未实现记录并链接唯一详细文档。
- 长期候选放在 [backlog/research.md](backlog/research.md)，确认 BUG 与验收欠账放在 [backlog/TODO.md](backlog/TODO.md)；未经代码与验收确认不得删除或标记完成。
