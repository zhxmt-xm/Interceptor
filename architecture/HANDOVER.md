# Interceptor Handover

> 最后更新：2026-08-10
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

## 待完成

### Windows App：已验证的现场事实

- 保留冷启动自动接管系统代理的方向，没有改为手动 Enable。
- 本机 WVD gateway 为 `afdfp-rdgateway-r0.wvd.microsoft.com:443`。
- 早期对照中 Clash 7890 对 Windows 365 与该 gateway 均可达，排除了 Clash 核心出站失败；后续未开启 Clash 的 direct 复现又确认当前兼容问题不依赖 Clash。
- `*.wvd.microsoft.com` system bypass 可保护 RDP gateway，但会让该流量完全绕过 8888；它是临时止血，不是目标方案。
- AAD Broker exemption off/on/off 的 A/B/A 已完成：无 exemption 时出现 `0xCAA70004` 与授权页 404；开启后登录成功；再次移除后复现。
- 保留 exemption、移除 WVD system bypass 时，claims token 仍成功，但 WVD / Windows 365 host 在 MITM 握手阶段连续 reset，RDP 以 `0x3000008` 断开。
- `https://ecs.office.com/` 直连与经 8888 均返回相同 Microsoft 503 / 46-byte 响应，不是故障根因。
- Bilibili 登录态重新验证正常，没有证据支持通用 Cookie 转发故障。
- AppContainer exemption manager 已确定采用 Fiddler 同类流程：`NetworkIsolationEnumAppContainers`、`GetAppContainerConfig`、按 SID 选择、提权 read-modify-write、再次读取验证。
- Mockttp 4.5.0 已原生支持 `https.tlsPassthrough`，实现用户维护的不解密名单不需要新增 patch。
- Capture 的 MSIX 来源迁移到 `PackageManager.FindPackagesForUser("")` 仅完成研究；其收益、当前用户范围与 SYSTEM/其他用户代价已记录，尚未实施。
- 临时 WVD system bypass 曾通过 Desktop typecheck、188 项 Desktop 测试、Windows x64 package 与 artifact audit（1,293 files / 391,251,554 bytes）；打包 Main bundle 已确认包含该 bypass。
- 临时 WVD 补丁当时没有无人值守运行真实 packaged smoke，因为 smoke 会接管当前用户 WinINet，现场有活动 `msrdc` 会话；最终方案仍需重新执行真实 smoke。

### 当前工作树与接手顺序

- 分支：`main`。
- 未提交产品改动包含 AppContainer manager、TLS passthrough 持久化/路由/兼容性事件、Settings UI，
   删除临时 WVD system bypass，以及 private GitHub Release 登录/更新链路；不要恢复该 bypass。
- 未提交文档改动：本 HANDOVER、Windows App 研究、Settings / Capture 同步；`backlog/idea.md` 与
   `backlog/image-*.png` 是现有用户改动，不要删除。
- 未提交设计改动：删除整个 `design/`，新增 `design-vite/`，以及 AGENTS.md、两个 skill 与
   visual-parity 对新路径的同步。
- `stash@{0}: wip: Windows App WVD gateway bypass` 与工作树包含重复临时补丁，不要再次 apply。
- AAD Broker loopback exemption 当前已从本机移除；若继续真实 Windows App 登录测试，需要用户重新显式开启。
- 接手时先读本文件，再读 [platform/processes.md](platform/processes.md)；改具体模块前读对应 feature 文档；[README.md](README.md) 是文档索引。
- 接手时执行：

```powershell
git status --short --branch
git log -4 --oneline
git -c core.whitespace=cr-at-eol diff --check
```

- 仓库为 CRLF 工作区，必须使用 `-c core.whitespace=cr-at-eol` 检查；不要提交 `.vite/`、`out/`、`playwright-report/`、`test-results/` 或未跟踪的 `renderer-shots/*.png`。
- `design-vite/shots/` 与 `apps/desktop/tests/visual-parity/parity-report.md` 是验收资产，不得清理。

### Private GitHub Release 更新：实现与验证

- private GitHub App Device Flow、`safeStorage` 加密凭据、私有 Release metadata/Asset API、Main/Preload/Renderer 窄契约与 Updates 四态 UI 已实现。
- token expiration 来自 GitHub OAuth 响应的 `expires_in` / `refresh_token_expires_in`，保存为绝对时间；启动时刷新一次，运行期按最新 access token 过期时间提前 5 分钟刷新，成功后重排唯一 timer，非退出刷新失败清空登录。
- 聚焦测试 28/28：auth 10、private updater 14、Renderer store 2、15 语言 auth catalog 2；真实 Device Flow Client ID 请求返回 200、固定 verification URI、约 15 分钟 code 与 5 秒 polling interval。
- light/dark signed-out、authorizing、failed、signed-in Updates parity 均收敛到 0 flagged，最大几何差小于 1px；Settings 设计截图已重出。
- Windows x64 `npm run package` 已成功；最新 artifact audit 为 1,294 files / 391,441,664 bytes，全部通过。ASAR Main 扫描确认只有公开 Client ID，未包含 `ghu_` / `ghr_` / PAT / `client_secret` / private key。
- 首次 package 被旧 `out/Interceptor-win32-x64` 的不可读 ACL 阻塞；旧产物已整体移到仓库外 `H:\code\Interceptor-build-backups\out-permission-blocked-20260807`，未删除其内容，新 `out/` package 正常。
- packaged smoke 未运行：当前开发实例 PID 18720 的 Core UtilityProcess PID 34928 正监听 8888，不能在不打断用户会话的前提下并行接管系统代理。
- TLS passthrough 与 GitHub 更新切片已合并通过完整门禁：Desktop 224、Proxy Core 261、Core Protocol 15、MCP 45，共 545 项；全部 workspace typecheck、Core 构建、Windows package 与 artifact audit 成功。Proxy Core 全并行本地网络集成测试偶发瞬时 `ECONNRESET`；最新失败的 H2 文件串行 6/6、Core 全量串行 261/261 均通过。多 host TLS compatibility dialog 明暗场景和已挂载 Settings 批量保存/即时刷新场景均为 0 flagged。

### 主任务：Windows App 真实验收

完整证据、方案、文件级改动、收益与代价见 [backlog/research.md](backlog/research.md#33-windows-appcontainerwam-与-tls-passthrough)。实现与自动化数据面验证已完成，剩余工作是：

1. **完成真实验收**
   - AppContainer exemption off/on/off A/B/A。
   - 从空默认列表开始，确认 WVD 建议后重试；验证删除该项后恢复可诊断的 MITM 失败。
   - MITM off/on、普通浏览器继续解密、TLS 提示去重、失败后重试。
   - direct 与上游 CONNECT 两条 tunnel 路径。
   - 真实 packaged smoke，确认已有与新建 Dev Box 会话行为。

### Breakpoint 产品实现：阶段 2a 已完成，正文能力未做

以下状态按当前产品代码逐条核对；完整目标与当前差异见 [features/breakpoints.md](features/breakpoints.md)。
提交：`941e40a`（断点合并进 Capture + design-vite 交互 harness）。

已完成：

- **感知与关联。** `useBreakpoints` 订阅 Main 推送的 `breakpointsChange` 信号刷新，不再轮询；Core 重启时清空本地记录并在 `running` 后重新拉取。任意工作区都能感知；Sidebar 的 Capture 项带 pending badge。`BreakpointSnapshot` / `PendingBreakpoint` 带 `exchangeId`：`ExchangeTracker.exchangeIdFor` 在首次询问时**预留** ID 供 `beginRequest` 复用——规则钩子先于 `request-initiated` 到达，不预留就拿不到行号（已由真实代理集成测试锁定）。未 Recording 时返回 undefined，因为那次请求不会有 Capture 行。
- **队列上限。** `BREAKPOINT_QUEUE_LIMIT = 10`；`BreakpointQueue.suspend` 满时返回 `null`，调用方必须原样放行。`autoContinued` 计数经 `breakpoint.pending` 上报，Capture 状态栏展示，Core 侧 `breakpoint.queue-full` 留痕。
- **合并进 Capture。** 独立 Breakpoints 导航、workspace、Editor、PausedQueue、Statusbar 全部删除。workbar 有 Breakpoint 入口 + pending badge + 520px manager（`Break on match`、`Advanced rules`、`View rule`、规则 enable switch）；paused 行原地显示黄色 pause icon，request 阶段 size 显示 `waiting`；Inspector 随 paused 行切换为 `BreakpointInspector`。
- **从历史流量创建。** 右键 Breakpoint 子菜单四档：This endpoint / This path prefix / This host / Custom…。`addBreakpointRule` **创建即启用即 Apply**——断点 matcher 全部来自真实请求，不存在“字段没填完”。
- **Break once 语义已统一（方案 B）。** 不实现 once：那是一个既看不到也改不回来的隐藏状态。快速创建生成 request + response 两条 action 持续生效，停用入口就是 manager 里的开关。
- **正文替换语义。** `BreakpointDraft.replacement` 为 `off | text | file`。只有选了 Text 才可能带 `body`；看不见原文时空输入意味着“没填”而非“改成空”，看得见原文（WebSocket）时清空才是真实意图。File 档只经 IPC 传路径，由 Core 直接读盘，与 Map Local 同一条路，因此不受正文大小与二进制限制。
- **Original body 三态。** 该侧是否有正文按两个信号判断：`detail.summary` 已收到字节即为确证，没有字节时才用 HTTP 语义（`content-length` / `transfer-encoding: chunked`）预判。无正文显示空态，有正文但 Capture 还没收完显示接收中与已收字节，收完后按 detail 正文渲染。不能只用「Capture 是否给出 body 引用」判断，否则 GET 会永远停在接收中。
- **区块结构。** headers 与 original 复用 `Section`；replacement 因标题行内含 Segmented 不能整行做按钮，改为复用 `SectionHeader` 的非按钮形态并自带 chevron。`SectionHeader` 现在拥有折叠指示器，顺序统一为标题 → 计数 → chevron；计数紧跟标题，只有 chevron 靠右。滚动区内的分组线是向右淡出的渐变线，不是纯色边框。
- **Rules / Composer 双状态。** 「树上选中」与「右侧打开」拆成正交状态：Rules 为 `selectedId` / `openRuleId`，Composer 为 `targetFolderId` / `activeRequestId`。选中目录只改新建落点，右侧编辑器保持不变；此时被打开但未选中的行用淡 accent 底加虚线框标出。目录行的名字成为可点按钮，因此目录也能进入 selection。
- **Rules typography。** 规则树字体层级对齐 Composer collection：规则名与目录名 400 字重、`--text-2`、UI 字体；选中态目录 600、规则 560，均转 accent。

- **visual parity 断点场景。** `breakpoints` 场景已重建到 capture view 的 `breakpoint-request-body-loaded`（正文已就绪的稳定态），收敛到 2 flagged、最大 1.1px，字体差异全部归零。两个必须记住的约束：设计稿 `breakpointBody` 默认 `'loading'` 且 3 秒后自动跳到 `'ready'`（`useDesignFixtureAdapter.ts`），harness 驱动期间必然已跳走，场景只能锚定 `'ready'`，`breakpoint-request-paused.png` 是 3 秒内抢拍的不能做几何基线；设计稿只有断点态的列表才含 `/checkout` 与 `/v1/token`，所以 fake 的这两条交换与 `pendingBreakpoints` 放在 `pausedSessions` / `pendingItems`，由 `pausedBreakpoints: true` 注入。
- **ORIGINAL BODY 按完整查看器定稿。** 设计稿原本画的精简只读预览已改成产品的 `BodyViewer` 形态（`Pretty / Tree / Raw / Hex` + mime + 复制 / 全屏），数值均取自产品代码：容器 `gap: 10px`、工具栏 40px、Monaco compact 的 `lineHeight: 20` 与 13px 上下内边距，以及 `horizontalScrollbarSize: 8` 的水平滚动条槽。

未做：

- **armed notice。** `Breakpoint enabled for future traffic` + Undo + View manager 尚未实现；Renderer 全局搜不到任何 armed 相关代码。
- **WebSocket 开关收敛。** `websocket.breakpoint.configure` 独立控制面仍在（Main IPC、Preload `setWebSocketBreakpointsEnabled`、`useWebSocketFrames` 与 Proxy 的 `enableWebSocketBreakpoints` / `disableWebSocketBreakpoints` 均健在），未并入全局 Breakpoints 状态。需要先定「谁决定某条 ws 消息该不该停」：给 breakpoint action 加 websocket phase，还是让升级请求命中的规则管住整条连接。
- **Content-Length / content-encoding / H2 framing** 在 Execute edited 后的正确性未验证。
- **设计稿其余 17 个断点变体**（queue、queue-full、armed、manager、create-menu、file / invalid / replace 各档）未收录进 parity。

实现顺序与边界：

- 产品完成后更新 `platform/renderer.md`，重出 visual parity 基线并运行完整 Desktop / Core 验证。
- `rule detail` 提示移到底栏尚无确认设计；当前 `.vnote` 仍在滚动区末尾，产品保持现状。

### 长期债务：继续保留，未完成

- 上游认证代理（公司 SSO / `Proxy-Authorization`）尚未验证；WinINet 不保存凭据，需要用户手工提供。
- macOS 上游检测尚未实现；多网络服务各自配置代理时的合并语义未定。
- 仅 Auto Detect（WPAD）环境没有可传给 proxy-agent 的 URL，当前按直连处理。
- visual parity 尚未收录/验收新的 `statusbar-upstream-down` 状态栏场景。
- Composer / Rules DOM、Inspector 分组与正文工具条变化后，visual parity 基线尚未整体重出。
- Local E2E 仍是 0 条 implemented workflow；第一条必须从 `application.startup.ready` 开始，只通过公共 automation ID 操作真实 UI，保存 trace/evidence，并验证 destroy 后才能更新 Inventory。
- Visual parity 当前仍有 29 missing / 226 flagged，主要是 Capture、Settings、Updates 的既有场景债务；详见 `apps/desktop/tests/visual-parity/parity-report.md`。
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
