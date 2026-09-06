# Interceptor Handover

> Tracked commit: `e9634c46`
> Branch: `main`，直接提交，没有额外 PR 边界
> 最后更新：2026-09-07

## Task List

- [ ] **进度已保存 · Capture文件任务两项 · 待交付验证**：`capture_get_transfer_job`/`capture_cancel_transfer_job`已接入共享registry、Agent/MCP独立授权与Ask/Auto；只返回安全任务状态、进度、警告计数，不返回本地文件信息。目录/recipe为50项、100个开关，Developer人工结论0/50。按2026-09-07用户明确要求停止重复回归，保存当前进度，不标记完整验收完成。
    Archive真实取消曾只改变状态而仍落盘；两个真实文件integration Red后，读取流绑定AbortSignal，并在manifest与rename前检查取消。7项Archive服务集成和23项Archive/Transfer关联测试通过；最终任务workflow1/1（49.7秒），Main/Core `38896/16496`、`42672/10272`均正常销毁、8888/WinINet/journal恢复，证据在TEMP下`interceptor-transfer-summary-e2e-green`。已验证运行中Ask/Auto取消、文件及临时文件清理、终态幂等、独立撤权、重启零重放和安全摘要；首次落盘失败仍保留于`interceptor-transfer-jobs-e2e-first-failure`，不算正常销毁。
    已有检查：全workspace类型、Tools260/260、摘要37/37、Playground67/67、设计交互69/69通过；Desktop全量596通过/2个旧目录断言失败，修正后Agent相关21/21；MCP全量31通过/1个旧目录断言失败，修正后相关20/20。新增六视图parity40/40、0 missing/flagged、最大0.5px，旧Capture视图9/9。完整日志与截图在TEMP下`interceptor-transfer-*`，不因保存进度再次长跑。
    关联真实Capture discovery、Settings双列授权已有Green；Diagnostics原生Cancel焦点两次失败后，驱动补真实输入框点击并保留所有权/焦点保护，6项unit及Diagnostics真实流程Green。最后MCP Browser仍为旧48项预期与实际50项不符，MCP Desktop尚未执行；本次不再修正或重跑。尚未完成当前产物package/artifact audit/smoke和最终交付复核，已有旧产物结果不能替代。Cancel与异步rename提交点竞态仍是已知缺口，本次只证明提交前取消，不声称提交点已完整定义。
    续作先读[features/transfer.md](features/transfer.md#91-capture任务tool契约代码完成待交付验证)及[Capture规格](../apps/desktop/tests/e2e-workflow-tests/docs/capture.md#capture-tools-transfer-jobs)，复用仍适用的结果，只处理剩余检查；未经重新授权不继续下一组Tool。用户随后明确要求全部文件提交，因此本次包含规范、架构入口、研究文件及当前截图改动；不恢复或清理工作树，stash保持不动。
- [ ] **blocked · TLS四项Tool代码完成 · 待真实E2E最终清理验证**：在已推送`89028fdf`后，新增不安全名单替换、passthrough替换与解密启停四项；用户明确要求继续并提交当前代码，按未闭环进度保存，不计入完整自动验收数。TLS阶段保存时为代码36/73、完整验收32/73，另37项尚未实现。真实workflow已验证名单规范化、revision冲突、已挂载面板即时刷新、Ask/Auto、未信任意图与Core实际状态、真实CA安装、撤权和重启零重放；最终一轮清理失败，不能标记flow完成。
    阻塞事实：设置变更触发Certificates面板短暂重载，清理用瞬时`isVisible()`判断，跳过了重载期间不可见的Uninstall/Delete。两代Main/Core `9740/1936`、`23384/33672`均已正常退出、8888及系统代理恢复，但本轮LocalMachine Root CA仍残留，SHA-1为`8F5FD8BF6D49BE746862522F6AC616583ED152BB`，NotBefore为2026-09-05 20:45:32。其他六张Interceptor根证书是此前已有，不得删除。
    `desktopApp.preserveUserDataOnFailure()`此前只判断`await use(driver)`捕获的异常，未结合Playwright实际失败状态，本轮profile已被删除；现已提取并修正判定，实际failed/timedOut/interrupted均触发特权profile保留，3项Red后9/9 Green。清理已按本轮证书指纹与真实信任状态等待Uninstall/Delete，不再因瞬时不可见跳过；新的清理仍待真实复验。TLS审批错误与中途取消补8项Red后executor32/32 Green，底层路径不进入审批结果。
    本轮非特权验证：Desktop485/485、Tools142/142、MCP32/32、Runtime122/122、Protocol25/25、Playground67/67、Core TLS integration12/12、全workspace typecheck、design interaction71/71通过；新增TLS明暗16 views共96/96、0 missing/0 flagged、最大0.5px，原完整parity报告保留未重跑。Windows package、artifact audit（1,294 files / 392,847,733 bytes）、production audit0漏洞、packaged smoke1/1通过；36项registry/recipe和72个开关预期已同步。TLS清理失败的trace与两代metadata已归档至TEMP下`interceptor-tls-cleanup-failure-preserved`，不以smoke或parity替代真实E2E。
    唯一管理员操作仍为`certutil -delstore Root 8F5FD8BF6D49BE746862522F6AC616583ED152BB`，须由Developer在管理员PowerShell执行；当前Agent终端非管理员，不得尝试自动提权。只读确认该指纹不存在后，复跑`npm run test:e2e:workflow --workspace @interceptor/desktop -- --grep "settings.tools.tls"`，验证修复后的清理与profile保留路径和最终验收提交。代码已由`7bc809a1`提交并推送，状态不得提前改为passed。当前无本轮Electron残留，不再次运行涉及CA的测试直到完成上述恢复。
    2026-09-06中断恢复核验：Settings只读、系统代理、全局权限、MCP Browser和MCP Desktop共5条关联真实workflow为5/5；十代Main/Core分别为`25388/8092`、`25492/23872`、`24712/41188`、`34436/18700`、`20492/24624`、`23584/35316`、`37440/43160`、`24472/43296`、`43156/13096`、`11332/23576`，全部`gracefulDestroyVerified=true`。证据归档于TEMP下`interceptor-tls-adjacent-e2e-20260906`。完整parity已完成238 views / 1,664 targets / 1,630 matched / 34 missing / 305 flagged；TLS新增16视图96/96、0 missing/flagged、最大0.5px，既有视觉债务仍保留。输出图片在TEMP下`interceptor-tls-full-parity-20260906`，仓库报告已更新；不要重复长跑。最新只读核对CA仍在、8888无listener、共享journal不存在、分支已同步。
    用户于2026-09-06再次要求“不要停下，一直跑任务”；保留TLS及依赖证书权限的工作项blocked，不把阻塞冒充完成，继续推进原计划内不依赖该权限的独立Tool组。每个后续组仍执行契约、unit/E2E Red/Green、销毁证据、独立commit/push，不放宽验收门禁。
- [ ] **进行中 · Tool代码50/73 · 完整验收44/73**：完整目录共73项；TLS四项待最终清理验证，Capture任务两项按用户授权保存进度、待交付验证，另23项尚未实现。按feature的验收/目标为Capture `10/17`（代码12/17）、Rules `5/5`、Composer `6/6`、Breakpoints `11/11`、Diagnostics `4/4`、Settings `8/26`（代码12/26）、Updates `0/4`。Settings授权开关与Settings业务Tool不同。
    剩余计划见[features/tool-capabilities.md](features/tool-capabilities.md)：Settings尚未完整验收18项（含TLS四项blocked）、Capture七项（含当前两项待交付）、Updates四项。当前按用户要求保存进度并停止扩展；恢复后仍沿用契约 → unit/integration Red → 真实Electron Red → 实现 → 同组Green → 销毁/证据门禁，但复用仍适用的已有结果，不反复全量回归。冷启动自动接管、原生Dialog、UAC和脱敏边界不变。
    已完成阶段从Handover移除，事实和证据保留在[Tool能力目录](features/tool-capabilities.md)、所属feature与E2E规格及Git历史；最新完整交付基线是Diagnostics提交`e9634c46`。
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
