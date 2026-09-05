# Interceptor Handover

> Tracked commit: `b08291e9`
> Branch: `main`，直接提交，没有额外 PR 边界
> 最后更新：2026-09-05

## Task List

- [ ] **进行中 · 完整Tool交付32/73**：完整目录共73项，首批24项、Settings只读6项与系统代理启用/恢复2项已实现并通过真实自动验收，余下41项尚未实现；不要把当前已实现集合写成全部Tool完成。按feature的已完成/目标为Capture `10/17`、Rules `3/5`、Composer `2/6`、Breakpoints `8/11`、Diagnostics `1/4`、Settings `8/26`、Updates `0/4`。Settings授权开关与Settings业务Tool是不同能力。
    后续按[features/tool-capabilities.md](features/tool-capabilities.md#52-余下49项计划已完成8项剩余41项)逐组交付：Settings剩余18项 → Rules 2项 → Composer 4项 → Breakpoints 3项 → Diagnostics 3项 → Capture 7项 → Updates 4项。每组沿用契约文档 → unit/integration Red → 真实Electron E2E Red → 实现 → 同组Green → 销毁/证据 → 状态同步的门禁；原生Dialog、UAC、脱敏、取消与重启恢复均使用正式产品路径，不保留旧Tool alias，不重新增加GitHub Auth Tool。逐项闭环后独立commit并立即push，不混入无关任务。
    恢复基线：此前用户要求“保存进度和计划，我晚点开始”，`07649e79 feat(agent): connect diagnostics tool`已推送且与`origin/main`同步；2026-09-05用户明确“看下一步计划，然后开始所有任务”，暂停已解除。只读6项已完成并以`b08291e9`推送；系统代理启用/恢复两项现已完整验证。下一工作项为TLS名单替换与解密启停四项，具体证据与后续步骤见[features/tool-capabilities.md](features/tool-capabilities.md#53-恢复执行入口)。保持冷启动自动接管，不增加通用后门。
- [x] **已完成 · 系统代理Tool自动验收**：`settings_enable_system_proxy`/`settings_restore_system_proxy`复用Main正式语义方法、FIFO与journal，OS写入前可取消，开始后完成原子编排和upstream同步；冷启动自动接管不变。unit13项缺失Tool Red→Green，真实workflow空发现Red→Green，摘要独立Red→Green；2次Deny、2次Allow、3次Auto、重复Restore `not-owned`、首次original保持、撤权零写入和同profile重启零重放通过。与只读/全局开关联合3/3，MCP Browser/Desktop回归2/2。两代Main/Core `37532/43864`、`41620/2448`均优雅销毁、8888释放、WinINet/journal恢复，证据提前归档。Tools110/110、Desktop470/470、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67、design interaction71/71及全workspace typecheck通过；Proxy Core329/331仅既有两项framing债务。新增明暗8视图48/48、0 missing/0 flagged、最大0.5px；完整Parity222 views / 1,568 targets / 1,534 matched / 34 missing / 306 flagged，旧DeepSeek深色Dialog与HTTPS setup有波动。Windows package、artifact audit（1,294 files / 392,839,696 bytes）、production audit0漏洞、packaged smoke1/1通过。Playground recipe32/32，Developer人工结论仍0/32。
- [x] **已完成 · Settings只读Tool自动验收**：共享registry新增六项query，Main四项经typed `invokeMain`与Action Gate复用owner，Core两项沿原RPC；Agent删除重复接入名单。空参数、白名单脱敏、取消、query无审批、双列撤权、同profile重启零重放和两代销毁已通过；真实Red为空discovery，摘要追加Red为`value`。最终Agent/MCP各6项，Main/Core `12888/21524`、`41644/22360`均`gracefulDestroyVerified=true`、释放8888并恢复完整WinINet/journal。Tools97/97、Desktop467/467、Runtime122/122、Protocol25/25、MCP32/32、Playground67/67、全workspace typecheck通过；Proxy Core329/331仍只有既有两项framing债务。新增明暗四视图44个target均0 missing/0 flagged/0px；完整设计交互69/71的两项旧数量/模糊selector断言已修正，该文件复跑5/5。Windows package、artifact audit（1,294 files / 392,835,349 bytes）、production audit 0漏洞、packaged smoke1/1通过。Playground recipe已扩至30/30，Developer结论仍0/30；最终E2E证据已在package/smoke前归档。完整Parity为214 views / 1,520 targets / 1,486 matched / 34 missing / 304 flagged，未改动的DeepSeek Dialog Endpoint与TLS passthrough深色旧视图相对上次有波动；不把既有视觉债务标为Green。410张既有图保留原基线，仅新增四张Settings设计图。本工作项独立commit/push后继续系统代理组。
- [ ] **blocked · VS Code Copilot MCP互操作**：2026-09-01已使用真实VS Code `1.135.0`（commit `08d4889f9e`）与Copilot读取Interceptor复制的通用Streamable HTTP配置。Host成功识别并启动`interceptor`，但首个HTTP请求返回`400`，随后Host回退legacy SSE并收到预期`405 Method not allowed`，未进入`tools/list`。VS Code bundle固定`LATEST_PROTOCOL_VERSION="2025-11-25"`；Interceptor官方SDK v2端点固定`2026-07-28`并使用`legacy: 'reject'`，协议代际不一致是当前唯一阻塞。产品已决定只支持最新协议，不增加legacy兼容；真实Host canary等待VS Code升级到`2026-07-28`后按[features/mcp.md](features/mcp.md)原矩阵复验。
- [ ] **代码完成 · 待Developer人工验收 · Web Playground**：唯一方案与使用流程见[features/playground.md](features/playground.md)和[../apps/playground/README.md](../apps/playground/README.md)。`apps/playground/`默认进入App式Capture Lab，提供39项HTTP/Body/Encoding/WebSocket/H2/gRPC/TLS真实场景、可编辑/Reset的协议Draft、场景专属Setup/Observe、分页面可拖拽560px Response Detail与窄窗水平访问；MCP独立页继续提供最新协议直连、在线Tool目录、Raw JSON、Call/Abort、脱敏交换、24项recipe、人工结论与报告导出。Main只保留`/mcp`路由、反射式CORS preflight与Bearer，认证后交SDK。Traffic Lab integration覆盖39/39；当前真实Electron + 系统Edge只代表性执行`h1-json`与`ws-text`两项，即2/39，验证H1正文与WebSocket双向frame进入真实Capture并完整销毁，不表示39项均已经过产品E2E。提交前复审再精确Red于WebSocket握手事实重组、Secure首跑竞态、CONNECT停滞无法取消、跨transport Draft错配、Traffic/MCP旧结果回写和两页共享Detail宽度，当前全部Green。最终Playground Vitest`67/67`、Browser`5/5`、设计专项`5/5`、全workspace typecheck、两边build、Windows package、artifact audit（`1,294 files / 392,778,609 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green。完整design长跑为`61/65`，末4项仅`beforeEach page.goto`超时且独立复跑`4/4` Green；全仓unit仅Proxy Core两项既有Mockttp chunked framing债务失败，同一`570c5447`基线精确复现`2 failed / 6 passed`。代码未替Developer勾选任何Tool；Tool自动主线完成后仍需逐项人工点击24项并保存脱敏报告，随后Capture E2E按六组从2/39收敛到39/39。
    首批Tool自动主线已完成：Agent接线、owner正向unit与真实Agent/MCP调用均24/24。Diagnostics最终真实workflow在`401af972`精确Red、当前`1/1` Green，两代Main/Core `11444/35300`、`42312/18808`均优雅销毁、释放8888并恢复系统副作用，重启Model/origin增量0；Tools`66/66`、Desktop`458/458`、Runtime`122/122`、Core Protocol`25/25`、MCP`32/32`、Playground`67/67`、design interaction`71/71`与全workspace typecheck Green。Diagnostics明暗parity`18/18`、0 missing、0 flagged、0px；完整Parity为`210 views / 1,474 targets / 1,442 matched / 32既有missing / 303既有flagged`，Windows package、artifact audit（`1,294 files / 392,826,512 bytes`）、production audit 0漏洞与packaged smoke`1/1` Green；Proxy Core`329/331`仅保留两项既有chunked framing失败。Developer逐项人工矩阵独立待验收，不替用户填写结论，也不作为剩余43项Tool开发的前置条件；Settings只读六项本轮已闭环，接着实施系统代理启用/恢复组。首批自动验收历史证据见[features/tool-capabilities.md](features/tool-capabilities.md#9-历史阶段证据)。
- [ ] **待验证 · HTTP Execute edited wire correctness**：建立真实 H1 / H2 集成测试，逐项锁定 `Content-Length`、`content-encoding`、transfer-encoding 与 framing。必须先用测试证明问题，再修改转发实现，不能先靠 Renderer 重写 header 猜测修复。该项由另一 session 继续；本次提交不包含 framing / encoding 行为修改或 wire 专属测试。
- [ ] **验收进行中 · Breakpoint parity 几何收敛**：HTTP request/response旧场景仍有既有差异：常规状态最大约1.6–3.3px，response text明暗各有1个target missing，file-empty按钮仍有302.1px层级差。本轮已删除不存在的queue-full明暗场景并消除Original body重复外框；HTTP queue head/Queued/menu、WebSocket setup/head/Queued、Rules action明暗14 views全部`0 missing / 0 flagged`，最大0.8px。2026-08-25当前完整报告为`142 views / 992 targets / 958 matched / 34 missing / 306 flagged / 平均2.52%`；Rules overflow高度修正后明暗18个target仍为0 missing / 0 flagged，最大0.3px，详见visual parity report。
- [ ] **待设计 · rule detail note**：提示移到底栏尚无确认设计；当前 `.vnote` 继续保留在滚动区末尾。
- [ ] **待验证 · 上游认证代理**：公司 SSO / `Proxy-Authorization` 尚未验证；WinINet 不保存凭据，需要设计用户手工提供方式。
- [ ] **待验证/待实现 · macOS系统代理**：三字段journal、多network service快照与三态恢复已有unit/integration；仍缺真实macOS Electron crash/relaunch、Authorization与系统副作用恢复证据。多service可能各有上游代理，合并语义尚未确定，upstream检测仍待实现。
- [ ] **待验证 · WPAD**：仅 Auto Detect 环境没有可传给 proxy-agent 的 URL，当前按直连处理。
- [ ] **待验收 · BodyViewer 全屏**：格式化已独立闭环；全屏入口、设计状态与基础代码已接入，仍需真实Electron验证打开/关闭、Copy与内容状态生命周期。
- [ ] **待验收 · 既有 UI parity**：Composer / Rules DOM、Inspector分组与正文工具条变化后尚未整体收敛；2026-08-25当前完整复跑为`142 views / 992 targets / 958 matched / 34 missing / 306 flagged / 平均2.52%`。Rules action tag overflow高度修正后明暗2 views、18个target全部`0 missing / 0 flagged`、最大0.3px；既有14个逻辑队列/无timeout场景与Original body wrapper证据保持。原有债务仍集中在Capture、Settings、Breakpoint file-empty与旧Shell，详见`apps/desktop/tests/visual-parity/parity-report.md`。
- [ ] **待验收 · Local E2E 第一条 workflow**：`breakpoints.execute-edited` 已覆盖 header-only、body-only 与 header + body，并从 `application.startup.ready` 通过公共 automation ID 操作真实 UI；提交后需复核 trace / evidence、destroy 证据与 Inventory 状态。
- [ ] **待验收 · 首个真实 tag release**：仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。
- [ ] **长期任务**：SSE、长上传 / 下载、gRPC streaming、Pause / Resume、Clear、容量与文件任务继续以 [backlog/TODO.md](backlog/TODO.md) 为准，只有代码和验收均完成后才可勾选。

## Constraints

- 本地App、packaged smoke与真实Electron E2E必须经过已实现的宿主guard；不得以“进程已退出/8888无listener”替代完整WinINet、共享crash journal与测试进程代际恢复验证。
- 当前所有tracked代码改动都必须归入明确work item，完成实现、验证、commit和push；禁止任何会丢弃工作树内容的`restore`、`checkout`、`reset --hard`或文件重建。为调整提交顺序允许仅取消暂存或使用临时index，但操作前后必须核对工作树文件hash不变。用户未跟踪的`architecture/backlog/deepseek-harness-agent-analysis.md`不是本轮代码改动，继续排除。
- 系统代理由 Main 所有；开发实例与 packaged smoke 都使用 8888，不能并行。packaged smoke 在有开发实例监听 8888 时不运行，必须先安全结束会话。
- 若进程强杀后遗留 `127.0.0.1:8888`，先恢复 WinINet。残留会让接管前读取到“自己”，`isSelf` 会视为无上游并可能静默丢失真实公司代理。
- Clash 等本机代理若在 Interceptor 已 owned 后改写 WinINet，会触发 ownership-lost 保护，不做反抢。
- `patches/mockttp+4.5.0.patch` 提供 headers 阶段钩子、trailer 事件与 `passthroughProxyConfig`；升级 Mockttp 必须人工 review patch，并重跑真实 Core、package 与相关网络测试。
- Forge Vite Plugin 仍为 Experimental；修改 Main、Preload、IPC、Fuses、CSP、Core 生命周期、native helper 或打包路径后，必须重跑 package、artifact audit 与真实 smoke。
- Renderer 只能通过 `window.interceptor` 窄意图 API 访问 Main，正文留在 Core，通过有限 range / chunk 读取；`UtilityProcess.parentPort` 只承载 lifecycle 与 MessagePort transfer，业务 RPC 只走专用 MessagePort。
- design SPA 尚未完全组件化，仍有全局 CSS / 手写 DOM 串扰风险；小改优先定向 DOM / geometry 检查，不用反复全量截图掩盖状态错误。
- 不要删除或覆盖 `backlog/idea.md`、`backlog/image-13.png`、`backlog/image-14.png` 与 `apps/desktop/tests/visual-parity/parity-report.md`。Agent Runtime stash已恢复并删除；当前唯一`stash@{0}: wip: Windows App WVD gateway bypass`必须保留，不得apply、drop或覆盖。
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
