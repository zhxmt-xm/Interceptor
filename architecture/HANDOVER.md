# Interceptor Handover

> Tracked commit: `0beb5c6d`
> Branch: `main`，直接提交，没有额外 PR 边界
> 最后更新：2026-09-13

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
- [ ] **进行中 · 既有 UI parity（当前 item）**：保持用户原先授权的item边界；下面只是同一item的剩余步骤，不是独立提交单位。[本item报告](../commit-changes/202609111558_ui_parity_progress.html)只展示具体改动与带红框的前后图，全部展开；验证、遗留与完成状态在本条和下方Validation维护，详细证据链接所属feature文档。以下此前的最终E2E结果属于全UI整改前版本，不能代替当前改动的回归。未完成部分不冒充已验收。
    - **待设计对齐 · Inspector Header Copy布局**：本轮按用户统一flex规则修正`Kv`：值文字按内容宽度收缩，规则标记和18px Copy留在同一flex行，长值只在文字内部换行，顺序和完整值复制不变；21行headless DOM检查确认控件无越界、正常4px gap，row-format单测14/14。去掉曾把短值撑满的`flex: 1`，未把Copy移到key列。设计Header行仍缺Copy，与产品的文字可用宽度及后续行高不等，不能删产品能力或通过位移消除差异；当前parity随全量复验。旧A/B预览不是已批准的列迁移方案，详见[Capture筛选证据](features/capture.md#capture筛选parity场景)；旧预览保留在TEMP `interceptor-header-copy-preview-20260911/review.html`，最新结构证据为`interceptor-ui-layout-20260912-kv-dom/rows.json`。
    - **待设计对齐 · WebSocket消息正文布局**：产品`FramePayload`与设计`WebSocketMessagePayload`仍有能力和布局差异；产品既有Tree/MIME/Save不能为parity删除。明暗各7 matched、0 missing、2 flagged，标题最大25.6px差、Binary行约22.5px偏移。先明确设计，再实施；已修复的消息标题翻译和断点按钮不重复列为待办，证据见[WebSocket标题](features/capture.md#websocket载荷标题)及[消息断点按钮](features/breakpoints.md#43-websocket-帧断点)。
    - **待确认 · Certificates字体度量**：两个约1px差异已定位为相邻文字字宽：设计实际加载静态Inter，Renderer加载Inter Variable；标题文字90.375/89.40625px，按钮178.359375/177.734375px，两边gap9/7px、padding14px一致。没有字体加载失败，不用偏移补偿，也不擅自替换字体或设计基准；字宽方案与页面其余fixture/图标差异仍待确认，见[Certificates证据](features/settings.md#certificates面板parity场景)。
    - **最终 E2E通过 · 待历史前置证据处理 · HTTPS设置连接示意**：恢复授权后组件/i18n13/13、Desktop类型与真实TLS流程通过，连接示意、前置按钮状态及Cancel可用，后续CA/H1/H2/Root和宿主恢复同跑；Main/Core13768/41652正常销毁。暂停期缺前置E2E Red保留，浅色Cancel约1px字体flag仍独立，不作为整组parity全绿；见[证据](features/capture.md#https设置连接示意)。
    - **最终 E2E通过 · 待历史前置证据处理 · 导出警示**：补回`HarTransferDialog.warning`缺失样式，业务不变；unit4/4、Desktop类型、明暗parity16/16及八个警示状态预览通过。HAR真实1/1（36.9s）及Archive1/1（46.4s）覆盖警示、Save/Open、取消、实际文件及重启；两组共四代Main/Core正常销毁和宿主恢复。Archive说明/敏感警告、Cancel与HTTP/WebSocket完整恢复同跑；暂停期前置E2E缺口保留，见[证据](features/transfer.md#导出弹窗警示样式)。
    - **最终 E2E通过 · 待历史前置证据处理 · Capture文件菜单**：FileCommand和236px菜单宽度已按既有设计还原，四个明暗菜单24/24、三列中心差0px，八组打开/取消预览通过。真实HAR与Archive均已验证菜单、扩展名和实际文件往返；Archive按DPR校验自然行高，150%时39.3333px而非DPR2的40px。暂停期前置缺口保持，见[菜单验证](features/transfer.md#import与export菜单条目)。
    - **待通知专属 E2E · Updates通知按钮**：按用户最新要求，以button和label实际`inline-flex`/`align-items: center`为准，32px compact、图标15px及继承排版保持；不再按字形像素边界、自算矩形中心或独立line-height补偿调整。旧字形实验仅保留历史证据，不作为新的待确认设计或验收目标。此前20/20 unit、类型、八场景100 matched/仅旧Cancel flag及真实正文1/1（21.9s，42516/42800）属于对应旧版本；当前共享控件已纳入423/423 Renderer单测与全量headless复验。通知真实下载/安装仍缺packaged新release及GitHub条件，见[证据](features/settings.md#更新通知按钮)。
    - **待确认 · Updates下载行设计边框**：设计隐藏后续行使可见Download末行多出1px底边框，Renderer末行无边框，后续changelog约1.1px差由此产生。直接测量15 matched/0 missing/2 flagged；不加产品行高、偏移或改基准，详情见[下载行结论](features/settings.md#更新通知按钮)。
    - **待确认 · Compact正文高度**：规则替换Request/Response的正文contentHeight86px、产品外框96px，设计外框86px。10px来自共享CodeViewer的滚动条/边框预留；一次性缩到86px后内部viewport84px，产生2px垂直滚动，额外8px又非短正文必需。保留产品/设计/PNG，不隐藏滚动或直接影响WebSocket/gRPC；[实测结论](features/capture.md#93-renderer-命令)与TEMP `interceptor-compact-body-20260911/evidence.json`记录，不算parity通过。
    - **最终 E2E通过 · 待历史前置证据处理 · 媒体正文占位**：flex分组、MIME/大小行高的unit9/9、类型、明暗12/12与16组宽窄栏检查保持。真实媒体workflow通过，PNG/Hex、WAV/MP4完整保存和新增布局断言同跑，Main/Core3880/18464正常销毁；相邻encoding已与WebSocket/队列同组3/3，19740/5544正常销毁与宿主恢复。暂停期前置缺口保留，见[证据](features/capture.md#媒体正文占位布局)。
    - **最终 E2E通过 · 待历史前置证据处理 · 受限正文提示**：两行提示8.8px差消除，unit9/9、类型、明暗6/6和八组宽窄栏/Hex检查保持。恢复后body-scenarios通过，5MiB UTF-8、提示布局、Raw/Copy及完整Save同跑，Main/Core1952/18392正常销毁；暂停期前置缺口保留，见[证据](features/capture.md#受限正文提示行高)。
    - **最终 E2E通过 · 待字体确认及历史前置证据处理 · AppContainer列表行高**：名称15px、包名14px、推荐标签20px flex框；unit2/2、类型、六场景52 matched/0 missing，四个已定位字体flag保持。真实只读排序/搜索和rowLayouts通过，Main/Core43056/38856正常销毁且不改系统exemption；暂停期前置缺口保留，见[证据](features/settings.md#appcontainer列表行高)。
    - **最终 E2E通过 · 待历史前置证据处理 · TLS列表与兼容性弹窗**：unit18/18、类型、原七场景44/44保持；新增公共ID后弹窗明暗/添加三场景24/24、无flag，像素均值0.62%。Capture导航及列表布局已通过；兼容性新workflow最终1/1（27.6s），六次真实证书拒绝、五host默认选择、wheel/Home/End、全部取消禁用、精确host/wildcard批量保存和Not now通过，Main/Core14788/41168正常销毁及CA/Root/宿主恢复。暂停期行高前置缺口保留，见[证据](features/settings.md#tls列表与兼容性弹窗行高)。
    - **最终 E2E通过 · 待历史前置证据处理 · WebSocket暂停上下文**：phase、126px队首滚动列表及38px消息分隔已修复，暂停期前置缺口保持。Replacement标题以真实38/36px Red和组件xs Red验证后改共享IconButton，32/32 unit及类型通过。最终Close 1/1（11.5s），四条真实历史消息、126px内部滚轮、13px折叠/展开与Off保持通过，origin收到1001；Main/Core6428/19436正常销毁和宿主恢复。八场景58/58、0 missing/flagged，像素均值2.71%不代表整页相同；补6张正确状态PNG，408旧图不变，同一报告64图/62原图保持、1320/390检查通过。Tree/MIME/Save不删除，见[证据](features/breakpoints.md#43-websocket-帧断点)。
    - **阶段进度提交，待剩余验收**：按2026-09-13用户要求停止追加测试和修复，保存本item当前代码、设计、测试及唯一HTML。已保存20条真实E2E、22代进程正常销毁；Renderer 47文件423/423、三个UI workspace类型通过。01:48快照与当前689份UI源码hash一致。HAR/Archive原生Dialog失败、全量parity字体网络和既有设计差异仍未通过；设计PNG尚未全部同步，历史前置Red缺口不补造，整个item不标完成。
    - **提交安排**：本item当前变更合为一次后续commit并立即push，不按小修复拆分，不混入其他item、用户文件或原有AGENTS修改，不改写已推送的`0beb5c6d`。共享组件在同一HTML说明一次，不重复列调用页面。
- [ ] **待验收 · 首个真实 tag release**：仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。
- [ ] **长期任务**：SSE、长上传 / 下载、gRPC streaming、Pause / Resume、Clear、容量与文件任务继续以 [backlog/TODO.md](backlog/TODO.md) 为准，只有代码和验收均完成后才可勾选。

## Constraints

- 提交边界以用户已授权的Handover item为准。一个item只对应一个commit和一份HTML报告；实现与验证中的小问题只是子步骤，不自行拆成新item，也不事后拆Handover来迁就已有commit。确需调整item范围时先取得用户明确确认。
- HTML只展示change：位置、改前改后与UI前后图；对比全部展开，不放折叠控件，红框明确标出修改位置。验证、命令、遗留和任务状态维护在Handover，不在HTML重复。
- 单个item的commit或push失败时，记录原因与恢复命令，继续其他可执行且已授权的item；提交或网络失败本身不是整轮任务的停止条件。用户已开启且Git已配置的代理可以直接使用，不再用空`http.proxy`覆盖它。
- 2026-09-13用户明确恢复真实E2E并要求按item提交；此前暂停已解除。真实Electron及原生Open/Save流程串行运行，保留正式UI、系统代理和证书恢复断言，不改成fake或永久skip。普通parity继续显式`headless: true`和子进程`windowsHide: true`，不主动操作其他应用或刷新共享报告页。此前结果原样保留，日志与exit code不一致如实记录，暂停期前置Red缺口不回滚补造。
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

- 2026-09-13阶段提交：TEMP `interceptor-ui-layout-20260913-e2e-verified.json`汇总20条workflow和22代Main/Core，全部`gracefulDestroyVerified`，metadata及trace文件已核对存在。覆盖`capture.inspector.section-collapse`、`composer.collection.tree-interactions`、`settings.app-containers.ordering`、`breakpoints.websocket-close`、`capture.body.fullscreen`、`capture.clear-facets`、`settings.navigation`、`agent.tools.execution-modes`、`agent.settings.model-configuration`、`agent.panel.navigation-persistence`、`capture.scenarios.body-media`、`capture.scenarios.bodies`、`capture.playground-traffic`、`mcp.browser-playground-cors`、`settings.tls-compatibility`、`capture.scenarios.grpc`、`capture.scenarios.tls`、`capture.scenarios.websocket`、`composer.response.section-collapse`、`rules.hierarchy-menus-status`。
- 明确排除HAR/Archive原生Dialog失败、早期媒体失败尝试及字体fallback parity批次，不计通过。Renderer和类型日志为TEMP `interceptor-ui-layout-20260913-renderer-unit.log`、`interceptor-ui-layout-20260913-types-final.log`；源码hash快照为`interceptor-ui-layout-audit-20260912/final-current.json`。
- HTML曾回退到64张图，缺少的13组/23张组件截图已按原始来源补回；87张图全内嵌、1320/390宽度及展开状态检查通过。后续用户修改保留，不以生成旧稿覆盖。验证未通过项继续留在当前UI item，本次仅为用户明确要求的阶段进度提交。


以下是本item各步骤保存的结果，不相加冒充一次全量测试；HTML不再重复这些内容。已通过的真实workflow均由fixture核验Main/Core/Worker、8888、WinINet和共享journal恢复。

- 2026-09-12全UI整改检查：Renderer 47文件423/423、Desktop/Playground/design-vite typecheck通过，日志TEMP `interceptor-ui-layout-20260912-{renderer-final,types-final}.log`；源码审计`interceptor-ui-layout-audit-20260912/full-run-source.json`记录689份源码及布局规则。Kv 21行headless DOM检查通过，证据`interceptor-ui-layout-20260912-kv-dom/rows.json`。这轮全量parity执行到220:225批次时因菜单未挂载即测量而中断；等待可见弹层后该批次27 matched、仅一个后续已纠正的目标配对flag，不算整套通过。
- 2026-09-13续验：Capture明暗24组宽窄栏/Agent/筛选/滚动检查通过，TEMP `interceptor-ui-layout-20260912-responsive-{light,dark}-interaction/layouts.json`；真实E2E随后已恢复授权。Capture单测43/43；明暗84 matched，仅8个设计缺Copy造成的Header marker高度flag，横向差0，最大58.4px。Agent目标配对与说明选择器修复后五场景39/39、无missing/flagged，TEMP `interceptor-ui-layout-20260913-model-header-green.{json,md}`。当前全量parity输出TEMP `interceptor-ui-layout-20260913-full.{json,md,log}`，JSON每批保存、最终Markdown只在完整结束后生成；真实E2E、设计PNG及报告尚待本轮结果，不能据局部结果标全量通过。

| 范围 | 已保存结果 | 证据入口 |
| --- | --- | --- |
| Capture状态栏 | unit29/29、Desktop类型；端点宽差16→0、明暗三列6/6；真实Pause/Resume 1/1（22.3s），Main/Core 14636/40784退出 | [状态栏证据](features/capture.md#capture状态栏列间距)；TEMP `interceptor-capture-status-20260911-125914*` |
| Capture列表 | unit29/29、Desktop类型；明暗30个列表目标0px、14组218–730px列表对齐；真实Clear 1/1（7.6s），13700/42588退出 | [列表证据](features/capture.md#capture列表列轨道)；TEMP `interceptor-capture-list-20260911-1310*` |
| 清空筛选 | unit29/29、Desktop类型；明暗禁用/启用/hover通过；真实Clear 1/1（15.1s），31884/34744退出，筛选清空保留记录和Inspector | [控件证据](features/capture.md#capture图标控件目标与状态)；TEMP `interceptor-capture-controls-20260911*` |
| WebSocket标题 | 两个文本标题unit Red后7/7，含catalog16/16；真实UI Red后1/1（56.9s），四类消息和5MiB边界同跑；Red 42540/1756、Green 35356/9584退出 | [标题证据](features/capture.md#websocket载荷标题)；TEMP `interceptor-websocket-title-20260911*` |
| WebSocket断点按钮 | unit26/26、Desktop类型；14场景42/42含普通IconButton；真实边框Red后Close 1/1（8.3s），origin收到1001，armed hover保持；31368/37908、26524/29720退出 | [断点按钮证据](features/breakpoints.md#43-websocket-帧断点)；TEMP `interceptor-websocket-toggle-20260911*` |
| gRPC消息行 | unit33/33、Desktop类型；明暗16/16、最大0.6px；真实gRPC 1/1（2.1m），五场景和多消息5MiB边界同跑；36412/33540退出，本轮CA/Root恢复 | [gRPC证据](features/capture.md#grpc消息行高)；TEMP `interceptor-grpc-rows-20260911*` |
| Tunnel元数据与方法标签 | unit33/33、Desktop类型；五个常驻场景33/33、0 missing/flagged、最大0.8px；真实TLS 1/1（25.2s），未解密Tunnel及解密H1/H2同跑，24704/21152退出，CA/Root和宿主恢复。追加4张现有场景PNG，396张旧图hash不变 | [Tunnel证据](features/capture.md#tls-tunnel元数据与方法标签)；TEMP `interceptor-tunnel-item-20260911*` |
| Inspector POST配色 | 前置parity确认蓝色与设计黄色不符；修复后四类协议明暗8个方法目标全匹配，gRPC明暗18/18、无flag。unit33/33、Desktop类型、真实gRPC 1/1（2.2m），23260/34540退出并恢复CA/Root/宿主；GET/CONNECT样式保持 | [配色证据](features/capture.md#inspector-post配色)；TEMP `interceptor-method-colour-20260911*` |
| Settings / Shell验收场景 | Proxy明暗26/26、最大0.9px；Certificates20 matched/4旧flag；Shell10/10、最大0.9px。仅直接场景/语法检查，不冒充真实E2E | [Proxy](features/settings.md#proxy面板parity场景)、[Certificates](features/settings.md#certificates面板parity场景)、[Shell](platform/renderer.md#9-验收要点) |
| parity MITM状态隔离 | 前置同序列出现passthrough missing；每场景重置为设计默认inactive后，明暗两组各49 matched、0 missing，保留每组4个既有Header marker flag。未改产品/设计，未新增工具自身测试 | TEMP `interceptor-parity-mitm-isolation-20260911-{before,after,dark}*`；[测试分层](platform/testing.md#4-执行约束) |
| Composer请求行 | 前置parity去除多余目录选择后只剩字号差；12px还原12.5px后明暗18/18、0 missing/flagged、行几何0px。unit前后12/12、Desktop类型、真实tree-interactions前后1/1（11.5s/17.2s），Main/Core 35828/27528、28932/36364正常退出并通过宿主恢复；30px行高与业务不变 | [Collection证据](features/composer.md#collection请求行parity)；TEMP `interceptor-composer-{targets,rows}-20260911*` |
| Collection目录配色与缩进 | 首层目录30px预期/26px实际取得真实Red；CSS修复后同一workflow 1/1（17.8s），Red 25204/33300、Green 13080/42900均正常销毁并恢复宿主。unit12/12、Desktop类型；目录/请求选中明暗交错4场景30/30、0 missing/flagged。新增2张既有目录选中PNG，400张旧图hash不变；未声称标签内部对齐已通过 | [目录证据](features/composer.md#collection目录选中与缩进)；TEMP `interceptor-composer-folder-20260911*` |
| MethodBadge flex居中 | 组件管理md/sm/xs；GET/POST与窄窗口长标题实测标签内上下2/2px、框与名称中心差0px。unit45/45、Desktop及设计类型；真实Collection/Capture2/2（31.3s），19136/14604、9492/1800正常退出；General方法文字Copy另1/1（13.5s），22464/11152正常退出，全部通过宿主guard。Composer主场景/目录状态与TLS共69/69；Composer四张既有设计图像素差0，未覆盖PNG | [居中证据](features/composer.md#方法标签样式差异)、[普通方法字段](features/capture.md#request-method详情值)；TEMP `interceptor-method-badge-flex-20260911*` |
| 共享标签全量parity | 391 views / 2735 targets / 2732 matched / 3 missing / 115 flagged，其他差异未算通过。首轮执行完340个场景后，340:345因导出overlay残留挡住目录点击而中断；补场景overlay重置后复跑该5个及其余46个，逐ID验证覆盖完整，先前340个无overlay跨场景依赖可复用。不是重跑后的整套Green，也不把场景失败算产品Red | TEMP `interceptor-method-badge-flex-20260911-complete.{md,json}`汇总；`-full.log`保存前340个明细，`-batch-340`至`-batch-390`保存续跑明细；[执行约束](platform/testing.md#4-执行约束) |
| 后续Shell/Rules目标 | 旧Shell Composer/Diagnostics10/10、最大0.9px；Rules Undo/深色Shell状态6/6、最大0.1px，圆点单列核对。只修场景/测量边界，无产品或设计变化；旧Shell Rules PNG缺失仍为n/a | [Renderer证据](platform/renderer.md#9-验收要点)；TEMP `interceptor-parity-{shell-followup,rules-status}-20260911*` |
| SectionHeader计数标签 | 前置真实字距Red为normal/0.575px；修复后计数宽差6.3px归零，unit前后25/25、Desktop类型。正文/Inspector折叠/Composer响应折叠真实3/3（38.9s），Main/Core39052/10868、22468/42288、20096/42056均正常销毁和宿主恢复；空Query/标题行高仍独立验证 | [计数标签证据](features/capture.md#请求正文分组的计数标签)；TEMP `interceptor-section-count-20260911*` |
| Request正文最终字体 | 计数、空Query、标题分别真实Red后最终unit25/25、Desktop类型；正文/两处折叠3/3（36.2s），17844/13592、11620/20908、3812/17672正常销毁和宿主恢复。明暗Request16/16、最大0.5px；十视图148 matched，仅保留8个Header Copy flag。新增2张展开态PNG，402旧图不变；同一HTML34图、1320/390检查通过 | [完整证据](features/capture.md#请求正文分组的计数标签)；TEMP `interceptor-section-typography-20260911*` |
| Timing历史token检查（改动已撤回） | 原row-format8/8、类型及token Red/Green（42888/42628、26812/19300）只证明当时字体值匹配，不代表视觉居中改善。用户反馈后撤回新增行高，保留原Grid center；真实检查改为标签框/数值框/进度条中心，撤回前后1/1（18.3s/20.1s），46032/4400、32356/33148正常销毁和宿主恢复；row-format8/8、类型通过。以上全部在最新暂停E2E指令之前取得 | [复核结论](features/capture.md#timing正文行高)；TEMP `interceptor-timing-alignment-review-20260911-*`与`interceptor-centering-audit-20260911/`；原明暗8/8及深色补图证据另存`interceptor-timing-20260911*`，不能作为当前parity通过 |
| HTTPS连接示意（非E2E） | 渲染Red后组件/i18n13/13、Desktop类型；三场景24 matched/0 missing，浅色Cancel仍1个旧flag。明暗en/zh-CN/ja/fr八组节点/标签/图标居中、Cancel预览与报告38图检查通过；新增真实TLS步骤前置与最终E2E均未执行 | [开发证据与恢复命令](features/capture.md#https设置连接示意)；TEMP `interceptor-https-chain-20260911*` |
| 2026-09-12 Button及HTTPS真实复验 | 直接Button测试2 Red后与通知共17/17、Desktop类型；Download/Open明暗图标/文字/组合中心差0px，组合左右12/12px、上下8.5/8.5px，三档尺寸不变。八场景100 matched/0 missing，仅HTTPS Cancel约1px旧flag；真实正文/HTTPS2/2（45.7s），20144/2344、13768/41652正常销毁并恢复CA/Root/宿主。通知真实下载/打开仍未验证，报告62图且56原图保留 | [按钮证据](features/settings.md#更新通知按钮)；TEMP `interceptor-update-button-centering-20260912*` |
| HAR/Archive警示（非E2E） | 样式前置parity确认警示背景/padding缺失；补齐后明暗16/16、最大0.6px，Transfer单测前后4/4、Desktop类型。8个明暗状态、脱敏开关和Cancel直接预览通过，同一报告42图且38原图保持；真实HAR新增断言未运行 | [开发证据](features/transfer.md#导出弹窗警示样式)；TEMP `interceptor-har-warning-20260911*` |
| 文件菜单（非E2E） | 前置条目/标签/扩展名6个目标均有差异；恢复既有设计后明暗Import/Export24/24、最大0.6px。八组命令打开/Cancel与外点击通过，三列中心差0px；Desktop类型、报告44图/42原图保护通过。真实菜单断言仅预留 | [菜单证据](features/transfer.md#import与export菜单条目)；TEMP `interceptor-file-command-20260911*` |
| Updates通知（非E2E） | compact选择两项Red后unit10/10、Desktop类型；available/downloaded明暗64/64、最大0.9px。四组按钮/图标中心差0px，普通动作34px与Dismiss通过；同一报告48图/44原图保护。下载末行独立15 matched/2 flagged来自设计隐藏后续行的1px边框，未算通过；真实E2E尚无workflow且未运行 | [通知与下载行证据](features/settings.md#更新通知按钮)；TEMP `interceptor-update-notification-20260911*`、`interceptor-updates-row-20260911*` |
| 媒体正文占位（非E2E） | 保存/loading基线与修改后unit9/9、Desktop类型；明暗12/12、最大0.4px，像素2.15%/2.27%。四类正文16组宽窄栏无溢出/中心差小于0.01px，音视频/超限图片零读取；2张缺失设计PNG新增、405旧图hash不变。同一报告50图/48原图保持，真实媒体布局断言未运行 | [媒体布局证据](features/capture.md#媒体正文占位布局)；TEMP `interceptor-media-body-20260911*`、`interceptor-media-body-20260912*` |
| 受限正文提示（非E2E） | 两行提示8.8px差消除；unit9/9、Desktop类型、明暗6/6最大0.4px，实际代码行字号/行高一致。八组提示宽窄栏/Hex检查无溢出、图标中心差0px；缺失深色PNG新增且407旧图保持。报告52图/50原图保持，真实UTF-8场景仅预留新布局断言 | [提示证据](features/capture.md#受限正文提示行高)；TEMP `interceptor-limited-body-20260912*` |
| AppContainer列表（非E2E） | 名称/包名行高与推荐标签框修复后unit2/2、Desktop类型；六场景52 matched/0 missing/4已确认字体flag，四个批量弹窗20/20。明暗搜索与单项/批量Cancel零写入，标签框与名称中心0px、文字与框0.5px；报告54图/52原图保持。原排序workflow新增布局断言未运行 | [列表与字体证据](features/settings.md#appcontainer列表行高)；TEMP `interceptor-app-containers-20260912*` |
| TLS列表与弹窗（非E2E） | unit前后18/18、Desktop类型；连续七场景44/44、最大0.9px，两个目标PNG仍n/a。明暗标签居中、非法输入零保存、fake添加删除、列表wheel、勾选禁用与Not now零保存通过；报告58图/54原图保持。设计DOM污染造成的missing通过parity页隔离修复；Capture布局断言仅预留，弹窗真实workflow尚未实施 | [TLS布局证据](features/settings.md#tls列表与兼容性弹窗行高)；TEMP `interceptor-tls-layout-20260912*` |
| 2026-09-12 HAR/文件菜单真实复验 | Transfer unit4/4；真实1/1（36.9s），警示、40px菜单、原生Save/Open、Agent/MCP授权/取消/脱敏、all/filter/selected和2/4/6记录及重启均通过。Main/Core10744/41872、40052/2720两代正常销毁与宿主恢复；Archive及暂停期前置缺口独立保留 | [Transfer证据](features/transfer.md#导出弹窗警示样式)；TEMP `interceptor-e2e-resumed-20260912-har-paused`及同名log |
| 2026-09-12 Archive/文件菜单真实复验 | 真实1/1（46.4s），说明/敏感警示、产品Cancel、DPR菜单自然高度、原生Save/Open、Agent/MCP权限、HTTP/WebSocket完整恢复及2/4/6/8/10计数和重启零重放通过。Main/Core10756/32024、10568/11492两代正常销毁和宿主恢复；首轮DPR1.5误断40px为测试失败，40828/35836正常销毁，不算产品Red | [Transfer证据](features/transfer.md#导出弹窗警示样式)；TEMP `interceptor-e2e-resumed-20260912-archive-dpi`及同名log；首轮`interceptor-e2e-resumed-20260912-archive` |
| 2026-09-12 正文/设置真实复验 | 相关unit33/33；媒体、正文、TLS导航、AppContainer四条4/4（52.7s），新增布局与原业务断言同跑。Main/Core3880/18464、1952/18392、13656/3184、43056/38856均正常销毁，8888/WinINet/journal恢复，TLS同时恢复CA/Root。不代替兼容性弹窗或历史前置证据 | [Capture](features/capture.md#媒体正文占位布局)、[Settings](features/settings.md#tls列表与兼容性弹窗行高)；TEMP `interceptor-e2e-resumed-20260912-body-settings`及同名log |
| 2026-09-12 WebSocket暂停布局 | xs组件1 Red后32/32，标题真实38/36px Red30236/30268后首轮1/1（20.3s）24084/43976；追加历史消息/滚轮/折叠后的最终1/1（11.5s）6428/19436，全部正常销毁与宿主恢复，origin收到1001。八场景58/58、0 missing/flagged、最大0.8px，像素均值2.71%；最终6张新增设计PNG、408旧图不变，64图报告保护62原图、1320/390通过 | [暂停布局证据](features/breakpoints.md#43-websocket-帧断点)；TEMP `interceptor-ws-heading-20260912-{unit-red,unit-green,e2e-red,e2e-green,e2e-scroll,directions,pixels,review}*`及`interceptor-ws-shots-20260912-*` |
| 2026-09-12 TLS兼容性真实弹窗 | 行为基线18/18与首轮真实1/1（17.3s，13940/39212）；补公共ID后18/18、类型、三场景24/24，真实1/1（23.6s，3600/41668）。显式保存JSON后的最终1/1（27.6s，14788/41168），六次SELF_SIGNED_CERT_IN_CHAIN、origin应用字节0、选择/滚动/保存/Not now通过；三代正常销毁及CA/Root/宿主恢复。暂停期行高前置缺口仍保留 | [TLS证据](features/settings.md#tls列表与兼容性弹窗行高)；TEMP `interceptor-tls-compatibility-20260912-{first,ids,evidence,parity,unit-baseline,unit-green,typecheck}*` |
| 2026-09-12 相邻正文/WebSocket回归 | encoding、普通WebSocket与queue-isolation三条3/3（1.4m），Main/Core19740/5544、36008/17980、23268/7932均正常销毁，trace齐全及8888/WinINet/journal恢复。覆盖损坏/压缩正文、消息/UTF-8、方向筛选与HTTP/WebSocket队首/queued切换；不改HTTP wire | TEMP `interceptor-ui-adjacent-20260912-e2e`及同名log |
| 2026-09-12 Button可见字形复核 | 完整截图DPR1/1.5/2证实原盒子中心0px不能外推可见字形；普通block替代内层flex不改变结果。删除独立normal后Open文字上移0.7–1px，Download整组偏差仍在；20/20 unit、类型、八场景100 matched/0 missing/旧Cancel 1 flag，真实正文1/1（21.9s，42516/42800）与宿主恢复通过。64图报告仅六张相关图更新、58图保持；没有新的视觉完全通过结论 | [按钮复核](features/settings.md#更新通知按钮)；TEMP `interceptor-button-visible-center-20260912{,-inherited,-report,-parity,-unit-baseline,-unit-green,-typecheck,-e2e}*` |

- 失败记录保留：Clear首轮系统CONNECT使Method计数2，36604/26256退出，属于测试独占流量假设错误；WebSocket标题单测首次Monaco/Node缺window不算产品Red；消息断点在150%缩放时读取0.666667px边框的误报（13356/6960退出）已改用设备像素断言，不改产品迎合测试。2026-09-12 HAR首轮all范围因背景CONNECT为3条而非2条，24560/13904正常销毁；workflow改为后半段Clear/Import前通过真实Recording按钮暂停，原断言未放宽，最终Green另存，不算产品Red。
- 本次共享标签已执行上述分批全量parity；未运行全workspace或新的package/smoke，构建保留大chunk警告。部分状态无专属PNG时像素结果为n/a，不以几何通过代替像素验收；历史UTF-8前置Red缺口保持。最终8888、5199、5200均无listener，本轮临时脚本与浏览器/服务器已清理，用户的报告审阅页保留。
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
