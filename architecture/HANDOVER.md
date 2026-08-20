# Interceptor Handover

> Tracked commit: `18097e5`
> Branch: `main`，直接提交，没有额外 PR 边界
> 最后更新：2026-08-20

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
- [x] **已完成 · Breakpoint 感知与关联**：`useBreakpoints` 订阅 Main 的 `breakpointsChange` 信号，不再轮询；Core 重启时清空本地记录，恢复 `running` 后重新拉取。任意 workspace 都能感知，pending count 只显示在 Capture workbar；所有 feature 的 Sidebar 导航只表达位置与选中态，不显示业务 badge。`BreakpointSnapshot` / `PendingBreakpoint` 带 `exchangeId`，`ExchangeTracker.exchangeIdFor` 在规则钩子早于 `request-initiated` 时预留 ID 给 `beginRequest` 复用；未 Recording 的请求不产生 Capture 行，因此不提供 ID。
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
- [x] **已完成 · Rules 根级 toolbar 恢复**：Collection 顶栏恢复 New rule / New folder / Export 三个图标按钮及冲突态 Reload，根右键菜单保留为辅助入口。`rules.root-toolbar`实现前精确Red于按钮缺失，实现后`1/1` Green并验证销毁；Desktop `263/263`、design build与Rules parity `11/11 matched / 0 missing / 0 flagged`通过。
- [x] **已完成 · HTTP Breakpoint parity 基线**：`breakpoints` 场景锚定 `breakpoint-request-body-loaded`。设计稿 `breakpointBody` 默认 `loading` 并在 3 秒后自动转 `ready`，harness 必须锚定稳定 `ready`；`breakpoint-request-paused.png` 是 3 秒内抢拍图，不能作几何基线。设计稿只有断点态列表含 `/checkout` 与 `/v1/token`，fake 将交换与 `pendingBreakpoints` 放在 `pausedSessions` / `pendingItems`，由 `pausedBreakpoints: true` 注入。
- [x] **已完成 · HTTP Breakpoint 阶段验收**：Breakpoint abort 聚焦测试 29/29、Proxy Core 串行 277/277、Desktop 246/246，全部 workspace typecheck 与 design-vite build 通过。Message light / dark 为 `4/4 matched / 0 missing / 0 flagged / geometry 0`，Undo 为 `0 missing / 0 flagged`；一级菜单 `4/4 matched / 0 missing / 0 flagged`，二级菜单 `8/8 matched / 0 missing`，仅标题 1px 字宽差。1280×800 与 1024×600 的 popup viewport、注入 40 条新请求后的稳定性及 outside click 均通过。该阶段完整 parity 为 69 views / 70 missing / 105 flagged，旧独立 Breakpoints 导航场景已删除。
- [x] **已完成 · Original body 完整查看器**：设计稿的精简只读预览已替换为产品 `BodyViewer` 形态（`Pretty / Tree / Raw / Hex`、MIME、复制、全屏）。数值取自产品：容器 `gap: 10px`、工具栏 40px、Monaco compact `lineHeight: 20`、上下 padding 13px、`horizontalScrollbarSize: 8`。
- [x] **已完成 · compact HexView 内容高度**：WS / gRPC 二进制正文的 compact HexView 显式使用 48px（20px 单行 + 26px 上下 padding + 2px border），不再让 flex 把正文内容区压成 0px；gRPC 设计稿恢复为业务 header + 产品式 BodyViewer，内容区后续说明行 parity 为 `dx 0 / dy 0 / dw 0 / dh -0.5px`。HTTP viewer 与 WS 工具栏/模式视觉未改。
- [x] **已完成 · design-vite 断点区块组件**：HTTP breakpoint、WebSocket upgrade breakpoint 与 WebSocket 消息详情统一使用 `CollapsibleSection`；几何为 `min-height 24 / padding 0 0 8px 10px / margin-bottom 12 / gap 8`，左侧 accent 竖条、向右淡出分组线、计数 badge `padding 1px 6px` 且无 letter-spacing / uppercase，chevron 13px。已修复初版遗漏渐变线、计数拉成 22px，以及 legacy `[aria-label="Header name"]` 误隐藏 portal 的问题；portal 根使用 `data-breakpoint-component`。
- [x] **已完成 · 断点动作按钮**：Drop / Continue / Forward edited 与 WebSocket setup 的 Cancel / Enable breakpoint 统一使用 icon + 文字动作按钮；`ActionFooter` 只负责 58px 底栏布局。
- [x] **已完成 · WebSocket 帧断点**：使用 `websocket.breakpoint.enable`（`exchangeId` / `direction` / `frames` / `timeoutMs`）和 `websocket.breakpoint.disable` 两条语义单一命令，替代旧布尔 configure；`websocket.frames` 返回 `breakpoint: WebSocketBreakpointSettings | null`。作用域锁在当前连接，其他 exchange 原样放行；ping / pong / close 与 message 共用方向内串行链，close 另带可编辑 `closeCode`。WebSocket 开关与 HTTP `breakpointsEnabled` 正交；Renderer setup 配置 Direction / Frames / Timeout，启用必经配置、停用一键。MCP 使用 `enable_websocket_breakpoint` / `disable_websocket_breakpoint`，`configure_breakpoint` 只管 HTTP。
- [x] **已完成 · WebSocket Messages 内嵌 editor 与 parity**：pending 自动切到 Messages，保留历史帧并追加 waiting row；Original 复用 `BodyViewer`，Replacement 默认 Off。setup / enabled / paused 的 light / dark 六个 view 均 `0 missing`，最大几何差 2px，完整套件已稳定跑完 75 views。
- [x] **已完成 · 最新完整门禁**：全 workspace typecheck；Proxy Core 串行 279/279、Desktop 248/248、Protocol 15/15、MCP 45/45，共 587 项。design-vite build 与 Capture 160 张截图通过；完整 parity 已扩展为 77 views，新增六个 WebSocket view、`breakpoints-off` 与 manager 全部 0 missing。Windows x64 package 与 artifact audit 通过：1,294 files / 391,548,917 bytes。DOMPurify 从受 GHSA-55q2-fjhq-7xh7 影响的 3.4.12 提升到 3.4.13，`npm audit --omit=dev` 为 0。
- [x] **已完成 · Response breakpoint 请求身份**：响应阶段快照现在从同一 `MatchContext.request` 保留 `method` / `url`，不再让 Renderer 把真实 POST 响应默认显示成 GET；`RuleService` 聚焦回归锁定 request / response 仍关联同一 exchange。
- [x] **已完成 · Breakpoint parity 场景接入**：request paused / loading / loaded / text / file-empty / file、response 对称状态以及 queue / queue-full 均已接入 light / dark，共把完整套件扩展到 104 views。不存在于产品契约的 `invalid` 文件状态已从 design state、adapter、截图清单与旧基线删除；manager 最大几何差从 37.2px 收敛到 3.5px，queue-full 明暗均为 `0 missing / 0 flagged / 0.5px`。
- [x] **已完成 · design-vite detail inspector 组件化**：`captureFixture` / `composerFixture` 中 13 + 4 个 legacy section 已迁移到 `CollapsibleSection`；旧 `.sh` / `.sec` / `.esec` 样式和 adapter 命令式折叠分支已删除，折叠交互由组件测试覆盖。
- [x] **已完成 · Detail sections 产品折叠闭环**：Capture `Section`补齐`aria-expanded` / `aria-controls`并在折叠时保留正文挂载；Composer `ResponseSection`迁移到同一标题、chevron与独立状态模型，Headers KV布局同步design-vite。真实Electron在实现前分别Red于缺失ARIA，实现后`capture.inspector.section-collapse`与`composer.response.section-collapse`为`2/2` Green且销毁证据完整；design interaction `2/2`、Desktop `263/263`、聚焦parity `2/2 matched / 0 missing / 0 flagged / 最大0.7px`通过。
- [x] **已完成 · BodyViewer formatter真实链路**：trimmed Monaco的HTML/CSS/JavaScript language未注册导致Format静默no-op，`formatActions` contribution又与精简service图不兼容；现改为HTML/CSS/JavaScript language worker直出edits，XML走`xml-formatter`，失败恢复原文且Copy读取当前model。Composer以request/current response拥有内存view cache，切换文档仍恢复各自结果而不改原始body；新response、关闭或删除释放cache。Unit先Red后BodyViewer/formatter `17/17`、Store cache `9/9` Green；真实Electron最终锁定HTML自动`1→5`行、JavaScript空格格式化、2,097,169 B CSS手动`1→4`行且跨文档恢复、malformed XML 7字节原样、0 pageerror及完整销毁，Desktop全量`266/266`通过。
- [x] **已完成 · Capture filter option 保持分组展开**：真实 Renderer 的筛选值与 `expandedFacets` 原本已正交；缺陷来自 design fixture 的 `syncFixture` 在任意 state 更新后重置展开态。展开同步现只依赖 owning scene 字段，option 选择/取消不再收起非 Application 分组。design interaction 精确 Red→Green 后为 2/2，Capture Store 21/21，真实 Electron `capture.filter-group-selection` 1/1 Green；metadata 记录 Main PID `29504`、Core PID `29972`、`gracefulDestroyVerified: true` 与 8888 释放，系统代理保持原有 `127.0.0.1:7890`；Capture 截图同环境复跑 158/158 identical。
- [x] **已完成 · Capture facet 稳定排序**：Application / Method / Host / Type / Rule 保持当前 Capture 中首次出现顺序，计数变化只更新数字。真实Electron在`89d8dda`仅回植公开automation ID探针后精确Red于POST反超后DOM变为POST、GET；当前同一`capture.facet-stable-ordering`为`1/1` Green，Capture unit `21/21`通过。Green metadata记录Main PID `11064`、Core PID `25972`、listener `8888`与`gracefulDestroyVerified: true`，系统代理已恢复。
- [x] **已完成 · Capture Clear 同步 facet**：空rows绕过600ms throttle，让列表、selection与facet snapshot同步归零。专用`capture.clear-facets`最终源码在`89d8dda`仅回植公开facet automation探针和driver helper后精确Red：`rows=0 / inspector=0`但`methodGroupCount=1 / GET option=1`；当前同一workflow`1/1` Green，原始DOM为`0/0/0/0`。owning unit `23/23`通过；Green metadata记录Main PID `20116`、Core PID `35120`、`gracefulDestroyVerified: true`，8888释放且系统代理恢复。Root cause / 方案见 [backlog/idea.md](backlog/idea.md)。
- [x] **已完成 · Breakpoint 最终 Rule state 与 Header effect**：RuleService两阶段执行普通action后再暂停，暂停快照携带最终header与普通Rule marker；Execute edited只为用户显式修改字段生成绑定breakpoint ruleId的effect。最终`breakpoints.execute-edited`源码在`89d8dda`仅回植后续公开automation ID和driver helper后精确Red：priority更晚的`x-e2e-before-breakpoint`缺失，Capture也找不到`set x-edit-stage` marker；当前同一workflow`1/1` Green，origin三段header/body事实同时通过。Owning RuleService/message-editing unit `28/28` Green；Red/Green metadata分别记录Main/Core PID `31404/3812`与`46424/29380`、`gracefulDestroyVerified: true`，8888释放且系统代理恢复。`breakpoints.execute-edited`整体Inventory仍因独立HTTP framing矩阵保持planned，不借本项提前验收。
- [x] **已完成 · Breakpoint 右键菜单层级**：Breakpoint submenu与Block同属Control group，并使用同一icon/label/hint行布局。专用`capture.breakpoint-menu-hierarchy`最终源码在`89d8dda`仅回植`startRecording`与driver helper后精确Red，语义label左缘差`7.43621826171875px`；当前同一workflow`1/1` Green，Block/Breakpoint左缘均为`815.9757690429688px`、差值0，hover后二级endpoint项可见。Red/Green metadata分别记录Main/Core PID `21056/39980`与`21380/20632`、`gracefulDestroyVerified: true`，8888释放且系统代理恢复。既有根菜单4/4、二级8/8 parity证据保持有效；独立submenu lifecycle项不由本项代替。
- [x] **已完成 · Detail BodyViewer撑满与嵌套滚动**：`BodySection`经grow Section占满Inspector剩余高度，Monaco显式`alwaysConsumeMouseWheel: false`让边界wheel交给外层。现行workflow字节级移植到修复前`039dd42`后，几何断言先Green，外层`scrollTop`保持`8.666666984558105`取得精确Red；当前同一真实Electron workflow `1/1` Green，Main PID `31796`、Core PID `3600`均退出，`gracefulDestroyVerified: true`且8888释放、系统代理恢复。
- [x] **已完成 · Bilibili登录态真实回归**：现有Proxy Core业务行为无需修改；Settings证书操作补公开automation ID，并新增真实Edge Default profile workflow。所有Generate / Install / MITM / Recording / cleanup均走产品UI，Edge只用`view_1021` / `view_1003`定位并原生刷新。六次独立workflow共18次完整页面刷新全部保持头像；每轮`www.bilibili.com/`主文档均为H2 / 200并携带`DedeUserID`、`SESSDATA`、`bili_jct`，leaf由本轮UI生成CA签发，无Rule header effect。最终Main PID `12472`、Core PID `28068`完成销毁，`gracefulDestroyVerified: true`，8888、系统代理与本轮CA均恢复。
- [x] **已完成 · Rules 与 Composer JSON 导入导出**：导入为纯新增，节点与Composer字段行id全量重生成，Rule enabled沿用文件值且priority追加重排；Main只经原生Dialog读取最多8MiB的`.json`，Renderer逐项校验并按路径报告跳过原因，确认后复用整树replace原子持久化。最终workflow只用真实UI创建数据，先经真实Save Dialog导出，再经真实Open Dialog导入，不seed文件、不mock dialog。最终测试源码在`884dcc4`分别精确Red于`rules.toolbar.import`与`composer.collection.import`不存在；当前Rules与Composer各`1/1` Green，metadata分别记录Main/Core PID `34724/20512`与`38140/23300`、`gracefulDestroyVerified: true`及8888释放、系统代理恢复。共享parser与两侧parser/store聚焦`51/51`、Desktop`298/298`、Protocol`24/24`、MCP`45/45`、全workspace typecheck通过；12个明暗import/export parity场景全部`0 missing / 0 flagged`，最大几何差0.5px。Windows x64 package、artifact audit（1,294 files / 391,703,630 bytes）、production audit 0漏洞与packaged smoke `1/1`通过。Proxy Core全量串行另有已登记的HTTP framing两项失败（其余`298/298`），不属于本work item。
- [ ] **设计完成 · Body Rule effect 产品待实现**：`CaptureBodyRuleEffect`已定稿为最终写入者、`text/file`来源与Request Original三态模型；Response Original明确unavailable，不缓冲origin response或伪造空正文。design-vite已完成Request/Response × Text/File × light/dark 8张基线，Body effect专属交互`2/2`通过；Inspector使用独立Body version证据栏，标题只保留marker与来源，窄面板无横向裁切。产品Protocol/Core/Capture/Native Archive/Renderer尚未改动，Unit/Integration/E2E Red均未开始；后续必须从Red继续，不能把设计checkpoint视为代码完成。
- [ ] **待验证 · HTTP Execute edited wire correctness**：建立真实 H1 / H2 集成测试，逐项锁定 `Content-Length`、`content-encoding`、transfer-encoding 与 framing。必须先用测试证明问题，再修改转发实现，不能先靠 Renderer 重写 header 猜测修复。该项由另一 session 继续；本次提交不包含 framing / encoding 行为修改或 wire 专属测试。
- [x] **已完成 · WebSocket binary 与 timeout continue**：真实 socket 回归锁定 binary hex 编辑后按精确字节还原，出站与回显帧 opcode / payload 一致；配置 deadline 到期后 pending 自动清零并原样继续转发。WebSocket 产品契约固定 timeout continue，不提供 timeout-drop；drop 只来自用户显式操作。ProxyService 聚焦测试 `29/29` 通过。
- [ ] **待验证 · HTTP Breakpoint timeout policy wire**：HTTP 规则正式提供 `onTimeout: continue | drop`，`BreakpointQueue` 已锁定 policy 传播，但两种策略的真实代理 wire 结果尚未分别验证。不要借 WebSocket 固定 continue 路径伪造这项覆盖。
- [ ] **验收进行中 · Breakpoint parity 几何收敛**：场景已全部接入，剩余是视觉差异而非 missing 场景。request / response 常规 loading / loaded / text / file 状态无 missing，最大多为 1.6–4px；response text 明暗各有 1 个 target missing。file-empty 的按钮目标仍有 302.1px 层级差，queue 有 71.7px 状态栏目标差，待改成同层语义节点。新增 Rule marker 与菜单目标后完整报告为 `104 views / 843 targets / 809 matched / 34 missing / 302 flagged / 平均 2.71%`；新增22个 target 全部 matched，missing 未增加。最终 upstream 文本 selector 修正后聚焦复跑为 `1/1 matched / 0 flagged / 0.5px`。
- [ ] **待设计 · rule detail note**：提示移到底栏尚无确认设计；当前 `.vnote` 继续保留在滚动区末尾。
- [ ] **待验证 · 上游认证代理**：公司 SSO / `Proxy-Authorization` 尚未验证；WinINet 不保存凭据，需要设计用户手工提供方式。
- [ ] **待实现 · macOS 上游检测**：多 network service 可能各有代理，合并语义尚未确定。
- [ ] **待验证 · WPAD**：仅 Auto Detect 环境没有可传给 proxy-agent 的 URL，当前按直连处理。
- [x] **已完成 · statusbar upstream down**：light / dark 已收录到 visual parity，均为 `1/1 matched / 0 missing / 0 flagged`，最大几何差 0.5px。fake Preload 补齐 `upstreamProxy` / `upstreamReachable` 契约；harness 每个 view 前显式重置 `breakpointState`，普通 Capture 场景不再误继承断点状态栏。
- [ ] **待验收 · AppContainer Enable all**：Main / Preload / Renderer、原生 helper、确认流程、15 种语言、fake / smoke 与 design-vite 状态已连通；提交后需复核一次提权、SID 并集、写后校验与 packaged smoke 证据。
- [x] **已完成 · Rules hierarchy / menus / status / effect导航**：真实Electron先Red于status=invalid且2个issue时Apply仍enabled；`isRuleSetComplete`同时守住UI与`applyRules`后同一workflow `1/1` Green。覆盖三级目录、第三层菜单禁用、rule右键rename、folder selection保留editor、invalid→dirty→applied、revision=1、Renderer reload从Core恢复、真实origin header effect、hit count=1、Rules→Capture Rule facet导航与完整销毁；Rules Store `19/19`、Desktop `267/267`、Rules parity `11/11 / 0 missing / 0 flagged / 最大0.7px`通过。
- [x] **已完成 · Composer Collection交互与快速remount持久化**：真实Electron先Red于rename后立即切出/返回时Core旧快照把request清空（`count=0 / name=null / url=null`）；`useCollection`提升到常驻App后同一workflow `1/1` Green，覆盖三级目录、第三层菜单禁用、request右键rename、目录落点/空白取消与打开文档正交、splitter `320→399.5px`、Core回载及完整销毁。
- [ ] **待验收 · BodyViewer 全屏**：格式化已独立闭环；全屏入口、设计状态与基础代码已接入，仍需真实Electron验证打开/关闭、Copy与内容状态生命周期。
- [ ] **待验收 · 既有 UI parity**：Composer / Rules DOM、Inspector 分组与正文工具条变化后尚未整体收敛；2026-08-20完整复跑为117 views / 887 targets / 853 matched / 34 missing / 303 flagged / 平均2.47%，本轮新增的12个Rules/Composer import/export场景全部0 missing / 0 flagged，原有债务仍集中在 Capture、Settings、Breakpoint file-empty / queue 与旧 Shell，详见 `apps/desktop/tests/visual-parity/parity-report.md`。
- [ ] **待验收 · Local E2E 第一条 workflow**：`breakpoints.execute-edited` 已覆盖 header-only、body-only 与 header + body，并从 `application.startup.ready` 通过公共 automation ID 操作真实 UI；提交后需复核 trace / evidence、destroy 证据与 Inventory 状态。
- [ ] **待验收 · 首个真实 tag release**：仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。
- [x] **已完成 · packaged smoke**：2026-08-13 对当前 `apps/desktop/out/Interceptor-win32-x64` 真实运行 `test:smoke`，`1/1` 通过（43.3 秒）。测试安全 allowlist 已同步 WebSocket breakpoint 的 enable / disable Preload 命令，截图矩阵删除已下线的独立 Breakpoints 导航；综合测试总预算调整为 180 秒，关键步骤仍保留各自 5–15 秒超时。运行前后均确认无残留 Interceptor 进程或 8888 listener。
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
