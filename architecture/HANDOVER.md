# Interceptor Handover

> Tracked commit: `340fd47c`
> Branch: `main`，直接提交，没有额外 PR 边界
> 最后更新：2026-09-10

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
- [ ] **待验收 · 既有 UI parity**：Composer / Rules DOM、Inspector分组与正文工具条变化后尚未整体收敛；2026-08-25当前完整复跑为`142 views / 992 targets / 958 matched / 34 missing / 306 flagged / 平均2.52%`。Rules action tag overflow高度修正后明暗2 views、18个target全部`0 missing / 0 flagged`、最大0.3px；既有14个逻辑队列/无timeout场景与Original body wrapper证据保持。原有债务仍集中在Capture、Settings、Breakpoint file-empty与旧Shell，详见`apps/desktop/tests/visual-parity/parity-report.md`。
    - 普通Capture当前38 matched、0 missing、22 flagged，Rule筛选3 matched、0 missing、1 flagged。列布局、状态栏端点16px宽差、Breakpoint按钮继承字号、Header区域及其他WebSocket/gRPC/tunnel差异继续保留；`Rule appended`仍向下53px。场景修正不改产品或设计基准，证据见[侧栏场景](features/capture.md#capture侧栏parity场景)、[筛选场景](features/capture.md#capture筛选parity场景)、[默认控件目标](features/capture.md#capture默认控件parity目标)，不把局部修复写成整页通过。
    - 普通Inspector的Copy布局待设计：`Kv`的`cache-control`/`content-type`文字单行，透明18px Copy按钮却独占第二行，行高36px；设计稿仅Request URL与Status Code有Copy，Header各行没有对应设计，不能为parity删掉产品复制能力。两行额外36px只解释部分累积偏移，不等于完整53px原因。TEMP实测`interceptor-header-row-layout-20260910-145312.log`，诊断探针已删除；此项与已验收的断点Header effect下置不是同一组件，`Kv`产品未改。
- [ ] **待验收 · 首个真实 tag release**：仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。
- [ ] **长期任务**：SSE、长上传 / 下载、gRPC streaming、Pause / Resume、Clear、容量与文件任务继续以 [backlog/TODO.md](backlog/TODO.md) 为准，只有代码和验收均完成后才可勾选。

## Constraints

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
