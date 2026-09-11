# Interceptor Handover

> Tracked commit: `93c83abf`（本轮 UI parity item 的起点）
> Branch: `main`，直接提交，没有额外 PR 边界
> 最后更新：2026-09-11

## Task List

- [ ] **blocked · VS Code Copilot MCP互操作**：2026-09-01已使用真实VS Code `1.135.0`（commit `08d4889f9e`）与Copilot读取Interceptor复制的通用Streamable HTTP配置。Host成功识别并启动`interceptor`，但首个HTTP请求返回`400`，随后Host回退legacy SSE并收到预期`405 Method not allowed`，未进入`tools/list`。VS Code bundle固定`LATEST_PROTOCOL_VERSION="2025-11-25"`；Interceptor官方SDK v2端点固定`2026-07-28`并使用`legacy: 'reject'`，协议代际不一致是当前唯一阻塞。产品已决定只支持最新协议，不增加legacy兼容；真实Host canary等待VS Code升级到`2026-07-28`后按[features/mcp.md](features/mcp.md)原矩阵复验。
- [ ] **待验证 · HTTP Execute edited wire correctness**：建立真实 H1 / H2 集成测试，逐项锁定 `Content-Length`、`content-encoding`、transfer-encoding 与 framing。必须先用测试证明问题，再修改转发实现，不能先靠 Renderer 重写 header 猜测修复。该项由另一 session 继续；本次提交不包含 framing / encoding 行为修改或 wire 专属测试。
    - 原“Local E2E 第一条 workflow”归入本项：`breakpoints.execute-edited`已有header-only、body-only、header+body三段，包含gzip解码和继承Content-Length断言；历史文档记录1/1 Green及Main/Core `46424/29380`正常销毁。final Rule state/header effect有对应历史Red，但完整H1/H2 wire矩阵仍未Green，Inventory继续`planned`。首条workflow的trace/metadata复核与最终验收在本项完成，不单独重复跟踪；本轮只核对现有源码和[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)，未重新运行或补造历史证据。
- [ ] **待确认 · HTTP空Text替换标签**：产品`replacesBody()`在`bodyAvailable=true`时将空Text视为显式清空，设计`PayloadEditor`却显示Using original，造成response Text明暗各1个parity missing；不是textarea缺失。最新Header下置验收中仍仅这2个标签missing，296个匹配目标无flag，证据见[Header effect布局](features/breakpoints.md#74-header-effect下置布局)。暂不改产品语义或设计基准，不算通过，不阻断无关item。
- [ ] **代码完成 · 待 E2E前置证据核对 · UTF-8预览截断**：当前实现与验证证据已随`b0708672`提交并推送。显式预览截断标记与TextDecoder流式解码保留完整字符，完整正文/真实坏字节/Hex/Save/Core不变。四组unit Red及最终7文件40/40、Desktop typecheck通过；恢复授权后HTTP正文、压缩、WebSocket、gRPC四条真实workflow分别1/1 Green，覆盖5 MiB边界、Raw/Copy、消息offset和完整Save，四代进程/8888/WinINet/journal及gRPC CA恢复。实现前因禁跑E2E未取得真实Red，历史缺口继续保留，不回滚补造、不声明前置门禁齐全。归档与hash见[UTF-8预览](features/capture.md#utf-8预览截断)。
- [ ] **待设计 · rule detail note**：提示移到底栏尚无确认设计；当前 `.vnote` 继续保留在滚动区末尾。
- [ ] **待确认 · 上游认证配置与SSO**：现有HTTP Basic能力已补本地产品集成覆盖，HTTP、HTTPS passthrough/MITM和WebSocket认证成功且源站/Capture不含凭据；HTTP/WS缺失或错误凭据不直连回退，noProxy保持隔离。两份既有测试22/22 Green（新增10例）、Core typecheck通过，未改产品、WinINet或系统证书，E2E/浏览器均0。TEMP证据`interceptor-upstream-basic-local-green-20260909-230438.zip`，SHA256 `61E4AC2244F12FB0ACC50555F9BB78198C160E53EE2E9CB78AAC8AA6FFC29F9E`；该独立验证项不代表公司SSO或用户凭据配置已完成，后者及安全保存方式仍待设计，详见[Settings上游代理](features/settings.md)。
- [ ] **待验证/待实现 · macOS系统代理**：三字段journal、多network service快照与三态恢复已有unit/integration；仍缺真实macOS Electron crash/relaunch、Authorization与系统副作用恢复证据。多service可能各有上游代理，合并语义尚未确定，upstream检测仍待实现。
- [ ] **待验证 · WPAD**：仅 Auto Detect 环境没有可传给 proxy-agent 的 URL，当前按直连处理。
- [ ] **进行中 · 既有 UI parity（当前 item）**：保持用户原先授权的item边界；下面只是同一item的剩余步骤，不是独立提交单位。[本item报告](../commit-changes/202609111558_ui_parity_progress.html)只展示具体改动与带红框的前后图，全部展开；验证、遗留与完成状态在本条和下方Validation维护，详细证据链接所属feature文档。未完成部分不冒充已验收。
    - **当前步骤 · TLS Tunnel元数据行高**：[TlsTunnelPanel.module.css](../apps/desktop/src/renderer/features/capture/RequestInspector/TlsTunnelPanel.module.css)的`.rows`有未提交的`line-height: 18px`，普通Tunnel明暗场景有未提交的collapsed/open状态修正。浅色检查确认元数据值和说明偏移消失（最大0.2px）；仍待深色/相关状态、类型/测试、真实TLS回归及退出恢复。证据为TEMP的`interceptor-tunnel-rows-20260911-fixed.md`，这些未验收改动不纳入本次历史整理。
    - **待定位 · CONNECT标签行高**：Tunnel Inspector的`capture-inspector-method`仍少1.1px；与上述浅色报告同组的8个目标中仅此项flagged。定位实际样式来源后分步修复，不用固定偏移抵消，也不另开一个commit。
    - **待确认 · Inspector Header Copy布局**：普通`Kv`中单行值的18px Copy独占下一行，设计Header行没有对应Copy设计；明暗普通Capture各4个Header marker flag、最大53px，Rule筛选1个marker flag。不能删除复制能力或把全部偏移归因于两行高度，详见[Capture筛选证据](features/capture.md#capture筛选parity场景)。A（value右侧Copy）/B（key列末尾Copy）两版预览尚未获明确选择；常规cache-control行高A36px/B18px，B的长key更早省略。明暗字体、18px按钮、完整值复制及实际320px Inspector/284px内容宽度通过；产品和正式设计未改。预览保留在TEMP的`interceptor-header-copy-preview-20260911/review.html`及本机审阅产物中，早期诊断为`interceptor-header-row-layout-20260910-145312.log`。
    - **待设计对齐 · WebSocket消息正文布局**：产品`FramePayload`与设计`WebSocketMessagePayload`仍有能力和布局差异；产品既有Tree/MIME/Save不能为parity删除。明暗各7 matched、0 missing、2 flagged，标题最大25.6px差、Binary行约22.5px偏移。先明确设计，再实施；已修复的消息标题翻译和断点按钮不重复列为待办，证据见[WebSocket标题](features/capture.md#websocket载荷标题)及[消息断点按钮](features/breakpoints.md#43-websocket-帧断点)。
    - **待定位 · Certificates剩余还原差异**：明暗各10 matched、0 missing、2 flagged，`MITM active`与`Show in file manager`约1px位置差，证书fixture字段、说明和图标也有像素差异。导航和基准路径已修正；继续定位实际控件与fixture，不改证书业务，见[Certificates证据](features/settings.md#certificates面板parity场景)。
    - **待复核 · 其他场景**：Composer/Rules、HTTP断点其他状态及未覆盖的正文/菜单目标仍需按[parity配置](../apps/desktop/tests/visual-parity/parity.config.mjs)核对。先明确具体场景、目标、产品文件和验收范围，局部通过不代表全量通过。
- [ ] **待验收 · 首个真实 tag release**：仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。
- [ ] **长期任务**：SSE、长上传 / 下载、gRPC streaming、Pause / Resume、Clear、容量与文件任务继续以 [backlog/TODO.md](backlog/TODO.md) 为准，只有代码和验收均完成后才可勾选。

## Constraints

- 提交边界以用户已授权的Handover item为准。一个item只对应一个commit和一份HTML报告；实现与验证中的小问题只是子步骤，不自行拆成新item，也不事后拆Handover来迁就已有commit。确需调整item范围时先取得用户明确确认。
- HTML只展示change：位置、改前改后与UI前后图；对比全部展开，不放折叠控件，红框明确标出修改位置。验证、命令、遗留和任务状态维护在Handover，不在HTML重复。
- 单个item的commit或push失败时，记录原因与恢复命令，继续其他可执行且已授权的item；提交或网络失败本身不是整轮任务的停止条件。用户已开启且Git已配置的代理可以直接使用，不再用空`http.proxy`覆盖它。
- 2026-09-09用户已明确恢复E2E授权，继续按item执行真实Electron验证；原生窗口流程独占前台。之前暂停期间E2E/浏览器运行均为0的记录是历史证据，不能改写为通过；需要最终E2E的item在取得Green与完整退出恢复前仍保持“代码完成 · 待 E2E”。
- 本地App、packaged smoke与真实Electron E2E必须经过已实现的宿主guard；不得以“进程已退出/8888无listener”替代完整WinINet、共享crash journal与测试进程代际恢复验证。
- Windows当前token未提权不等于账户不属于Administrators；不得给workflow另加管理员启动门禁。安装/卸载CA仍由产品正式请求Windows授权，不修改UAC策略；出现真实授权提示时由Developer在本机处理。
- 当前所有tracked代码改动都必须归入明确work item，完成实现、验证、commit和push；禁止任何会丢弃工作树内容的`restore`、`checkout`、`reset --hard`或文件重建。为调整提交顺序允许仅取消暂存或使用临时index，但操作前后必须核对工作树文件hash不变。用户未跟踪的`architecture/backlog/deepseek-harness-agent-analysis.md`不是本轮代码改动，继续排除。
- 系统代理由 Main 所有；开发实例与 packaged smoke 都使用 8888，不能并行。packaged smoke 在有开发实例监听 8888 时不运行，必须先安全结束会话。
- 若进程强杀后遗留 `127.0.0.1:8888`，先恢复 WinINet。残留会让接管前读取到“自己”，`isSelf` 会视为无上游并可能静默丢失真实公司代理。
- Clash 等本机代理若在 Interceptor 已 owned 后改写 WinINet，会触发 ownership-lost 保护，不做反抢。
- `patches/mockttp+4.5.0.patch` 提供 headers 阶段钩子、trailer 事件与 `passthroughProxyConfig`；升级 Mockttp 必须人工 review patch，并重跑真实 Core、package 与相关网络测试。
- Forge Vite Plugin 仍为 Experimental；修改 Main、Preload、IPC、Fuses、CSP、Core 生命周期、native helper 或打包路径后，必须重跑 package、artifact audit 与真实 smoke。
- Renderer 只能通过 `window.interceptor` 窄意图 API 访问 Main，正文留在 Core，通过有限 range / chunk 读取；`UtilityProcess.parentPort` 只承载 lifecycle 与 MessagePort transfer，业务 RPC 只走专用 MessagePort。
- design SPA 尚未完全组件化，仍有全局 CSS / 手写 DOM 串扰风险；小改优先定向 DOM / geometry 检查，不用反复全量截图掩盖状态错误。
- 保留 `backlog/idea.md` 中的未完成任务及其引用图片，不覆盖 `apps/desktop/tests/visual-parity/parity-report.md`。Agent Runtime stash已恢复并删除；当前唯一`stash@{0}: wip: Windows App WVD gateway bypass`必须保留，不得apply、drop或覆盖。
- 仓库为 CRLF 工作区，使用 `git -c core.whitespace=cr-at-eol diff --check`；不要提交 `.vite/`、`out/`、`playwright-report/`、`test-results/` 或未跟踪的 `renderer-shots/*.png`。`design-vite/shots/` 与 visual parity report 是保留的验收资产，不得清理。

## Validation

- UI parity历史快照仅用于定位，不表示当前全量状态：2026-08-25记录为`142 views / 992 targets / 958 matched / 34 missing / 306 flagged / 平均2.52%`；仓库[完整报告](../apps/desktop/tests/visual-parity/parity-report.md)生成于2026-09-06，记录`256 views / 1776 targets / 1746 matched / 30 missing / 304 flagged / 平均2.24%`，本轮未覆盖该文件。此前Rules action tag overflow明暗18目标无missing/flagged、最大0.3px，以及14个逻辑队列/无timeout场景和Original body wrapper证据保持；后续局部结果以本文摘要及对应feature文档为准。

### UI parity阶段证据

以下是本item各步骤保存的结果，不相加冒充一次全量测试；HTML不再重复这些内容。已通过的真实workflow均由fixture核验Main/Core/Worker、8888、WinINet和共享journal恢复。

| 范围 | 已保存结果 | 证据入口 |
| --- | --- | --- |
| Capture状态栏 | unit29/29、Desktop类型；端点宽差16→0、明暗三列6/6；真实Pause/Resume 1/1（22.3s），Main/Core 14636/40784退出 | [状态栏证据](features/capture.md#capture状态栏列间距)；TEMP `interceptor-capture-status-20260911-125914*` |
| Capture列表 | unit29/29、Desktop类型；明暗30个列表目标0px、14组218–730px列表对齐；真实Clear 1/1（7.6s），13700/42588退出 | [列表证据](features/capture.md#capture列表列轨道)；TEMP `interceptor-capture-list-20260911-1310*` |
| 清空筛选 | unit29/29、Desktop类型；明暗禁用/启用/hover通过；真实Clear 1/1（15.1s），31884/34744退出，筛选清空保留记录和Inspector | [控件证据](features/capture.md#capture图标控件目标与状态)；TEMP `interceptor-capture-controls-20260911*` |
| WebSocket标题 | 两个文本标题unit Red后7/7，含catalog16/16；真实UI Red后1/1（56.9s），四类消息和5MiB边界同跑；Red 42540/1756、Green 35356/9584退出 | [标题证据](features/capture.md#websocket载荷标题)；TEMP `interceptor-websocket-title-20260911*` |
| WebSocket断点按钮 | unit26/26、Desktop类型；14场景42/42含普通IconButton；真实边框Red后Close 1/1（8.3s），origin收到1001，armed hover保持；31368/37908、26524/29720退出 | [断点按钮证据](features/breakpoints.md#43-websocket-帧断点)；TEMP `interceptor-websocket-toggle-20260911*` |
| gRPC消息行 | unit33/33、Desktop类型；明暗16/16、最大0.6px；真实gRPC 1/1（2.1m），五场景和多消息5MiB边界同跑；36412/33540退出，本轮CA/Root恢复 | [gRPC证据](features/capture.md#grpc消息行高)；TEMP `interceptor-grpc-rows-20260911*` |
| Settings / Shell验收场景 | Proxy明暗26/26、最大0.9px；Certificates20 matched/4旧flag；Shell10/10、最大0.9px。仅直接场景/语法检查，不冒充真实E2E | [Proxy](features/settings.md#proxy面板parity场景)、[Certificates](features/settings.md#certificates面板parity场景)、[Shell](platform/renderer.md#9-验收要点) |

- 失败记录保留：Clear首轮系统CONNECT使Method计数2，36604/26256退出，属于测试独占流量假设错误；WebSocket标题单测首次Monaco/Node缺window不算产品Red；消息断点在150%缩放时读取0.666667px边框的误报（13356/6960退出）已改用设备像素断言，不改产品迎合测试。
- 尚未运行全workspace、全量parity或新的package/smoke；构建保留大chunk警告。部分状态无专属PNG时像素结果为n/a，不以几何通过代替像素验收；历史UTF-8前置Red缺口保持。
- 相关单测位于Capture的`capture-store`、`proxy-readiness`、`row-format`、`websocket-history`，Breakpoints的`breakpoints-store`、`breakpoint-edits`和i18n的`i18n`。运行入口为`npm run test --workspace @interceptor/desktop -- <test paths>`与`npm run typecheck --workspace @interceptor/desktop`。
- 真实流程使用`npm run e2e:prepare-local --workspace @interceptor/desktop`准备，再执行`node node_modules/@playwright/test/cli.js test --config=apps/desktop/tests/e2e-workflow-tests/playwright.config.ts <workflow path>`；对应[录制](../apps/desktop/tests/e2e-workflow-tests/workflows/capture/recording-pause-resume.workflow.ts)、[Clear](../apps/desktop/tests/e2e-workflow-tests/workflows/capture/clear-facets.workflow.ts)、[WebSocket](../apps/desktop/tests/e2e-workflow-tests/workflows/capture/websocket-scenarios.workflow.ts)、[gRPC](../apps/desktop/tests/e2e-workflow-tests/workflows/capture/grpc-scenarios.workflow.ts)和[Close code](../apps/desktop/tests/e2e-workflow-tests/workflows/breakpoints/websocket-close.workflow.ts)。

### 常规验证命令

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
