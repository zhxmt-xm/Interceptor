# Interceptor Handover

> Tracked commit: `009f7965`
> Branch: `main`
> 最后更新：2026-09-25

**不允许记录流水账！！！执行任务列表时不允许停下**

## 当前状态

- 用户于2026-09-24明确授权先保存全部剩余工作区进度并push，提交后保持改动区为空；未完成的实现、文档审阅、设计确认与验收继续保留在下表。保存暂停草稿不等于恢复执行或确认设计。
- 本轮按第2–7项顺序继续：第2–6项进度已分别提交为`d1142746`、`67f38668`、`3ef17329`、`16a6e506`、`b5101f5a`，各有独立报告；第7项完成当前包静态验收及锁屏前置保护。仍受锁屏、原生授权/外部网络和协议/设计确认阻塞的item不删除、不标完成。
- 平台实现基线为`218295b0`，对应[平台报告](../commit-changes/202609240135_main_shared-ca_startup.html)；后续保存剩余工作区进度的提交对应独立[工作区报告](../commit-changes/202609240150_docs_workspace_progress.html)。两份均为9月24日，每个commit各有自己的报告，不共用、不覆盖。GitHub候选的四张图只放在工作区报告中，不额外生成预览报告。
- 正文、HTTPS弹窗、Bilibili及独立package仅保存现有草稿，不扩展实现；第8项留Windows实机。日常CA保护和新系统授权专项仍须本机确认；提交不等于全部验收完成。

## Task List

2. **Windows/macOS 共享 CA · blocked（锁屏）**
	- 当前：同一OS用户跨profile共享三份CA材料已实现，已有CA跨fresh profile复用已验；业务配置和凭据仍隔离，私钥仍由safeStorage加密。
	- 剩余：新启动顺序下的首次创建与完整证书生命周期由第3/4项继续；Windows路径、safeStorage及真实系统授权留第8项，不能用macOS结果代替。
	- 当前步骤：CertificateService与平台组合73/73通过，Desktop typecheck及E2E构建通过；补共享启动workflow删除第二代profile后的材料/信任检查。本轮真实E2E在窗口准备阶段失败，CoreGraphics确认`CGSSessionScreenIsLocked=true`，没有进入目标断言，不算产品Red。
	- 恢复：已通过本轮App真实Close正常退出Main/Core等5个进程；完整代理恢复到journal.original，journal删除、8888释放、日常CA保持且受信任。待本机解锁后直接复跑下面命令，不重复删除/初始化日常CA。
3. **统一启动检查 · blocked**
	- 当前：首窗先显示，再调用`PlatformCapabilitiesService.prepare()`；全缺才生成、未信任才授信、已信任不重复写入，ready前拒绝业务IPC。
	- 当前步骤：不改现有产品实现；补Windows/macOS两分支的启动证书授权取消测试，覆盖certificate阶段Quit与重复prepare即时拒绝、取消后释放占用、不自动重试或重生成。与Renderer启动状态共45/45通过，Desktop typecheck通过。真实首窗/授权专项仍缺，测试不代替本机授权。
	- 下一步：用户能处理系统确认后，验证首次授权页面可见、取消及准备期间Quit。对应前置真实E2E仍缺，不能用旧结果补代。
4. **CA 操作与 E2E · 代码完成 · 待证书专项确认**
	- 当前实现：仅失联写入后查询原ID的结束记录；匹配后仍返回原错误，由原module回读/回滚并释放占用，不重放。未发送、未确认或已有CA不清理。目标23项Red及未发送import的补充Red后，平台312通过/2 Windows native跳过、类型、构建、audit与严格签名通过。
	- 边界：结束记录仅在各自受保护socket所属helper实例中保留最近128个写请求的ID/操作名，无代理配置、证书或信任缓存；重启/淘汰后无记录不能解锁，前台授权进程异常也不借用该证明。现有显式CA生命周期与共享调用方须同组复验，再执行新包验收。
	- 当前产物：新helper已获授权并与包内一致；组件/共享CA/代理恢复3条及Agent/MCP共享入口2条真实E2E、smoke 1/1通过，九代App全退、完整代理和日常CA保持。窗口准备的fixture遗漏已修正，失败与恢复证据保留。
	- 剩余：新包证书写入/取消专用E2E要求空共享CA目录；本轮保留日常CA，尚未获准再次清理/重建，因此未运行。故障帧/失联分支的native及传输集成结果不冒充真实UI触发故障；不进入第5项。
	- 正文子项暂停：只读预览2 MiB、完整且不超过1 MiB自动格式化、1–2 MiB可手动格式化，截断不格式化；图片独立16 MiB。Text完整编辑，File只预览但使用完整文件；初始高度、内滚动和resize不影响完整保存/导出/发送。产品未实现；本次仅保存已有compact正文、resize及自定义gRPC设计候选，不改正式shots、不视为定稿。
5. **macOS journal 收尾 · blocked（外部环境）**
	- 当前：[journal](../apps/desktop/src/main/platform-capabilities/system-proxy/macos/journal.ts)跨profile恢复复验Green。生产超时已定位并修复：完整资源校验37.4秒超过30秒，同一签名API只读对照为Background26.99秒、普通6.27秒；不反推历史14:09缺失的耗时证据。
	- 当前步骤：实际launchd策略取得Background的Red后，仅将ProcessType改为Interactive并由用户核准部署；实装plist与运行中的spawn type均为Interactive。平台回归262通过、2项Windows native跳过，最新package、artifact audit、严格签名、生产helper workflow 1/1和packaged smoke 1/1均通过；完整鉴权及30秒期限不变。本轮按用户授权与第1–4项合并保存进度，以下外部验收不标为通过。
	- 外部环境缺口：特殊VPN/TUN、动态网络切换及ClashX联调仍需对应环境，不由普通loopback结果代替。
	- 当前步骤：不改产品journal逻辑；补临时home下真实删除默认profile后重建journal实例的文件集成，以及service增加/删除时Restore和跨代Recover零覆盖的状态机检查。原32项与新增5项共37/37通过，Desktop类型通过。锁屏期间不运行真实Electron或修改宿主网络，外部场景仍未验。
6. **删除产品 GitHub 登录 · 待确认**
	- 当前：已从当前设计SPA重新生成`updatesWithoutSignIn`浅/深色前后图，逐字重加载字体，画布1600×900，并实际点击检查/下载到available/downloaded；[本项预览](../commit-changes/202609241039_ui_updates_remove-signin-preview.html)逐处红框说明。已请求用户确认，但当前不可响应；产品OAuth/Token及登录门槛未删，正式shots不改。
	- 下一步：用户确认设计后再实现、验收；保留匿名更新，不碰个人Git/CI凭据或远端仓库可见性。
	- 更新验收缺口：通知的真实下载/打开安装器流程尚缺专属E2E，需可用的新Release与签名包；其他按钮验收不代替。
7. **macOS 最终验收 · blocked（锁屏与生产授权）**
	- 当前：已按`b5101f5a`重建当前包，含最后的只读解析修正；package、artifact audit、严格deep/strict/all-architectures签名及8个workspace类型检查通过。实装helper与包内字节相同且仍为Interactive，但新App生产入口`outdated`、开发入口`ready`，需用户核准新生产身份。
	- 当前步骤：新增测试端共享登录/锁屏检查，真实E2E与smoke在spawn前拒绝锁屏，不创建App/profile或接管代理；两条既有验收命令分别在180ms、48ms报告该阻塞，未进入产品步骤，不算Green。后验完整代理快照不变、无App或测试helper、无journal、8888释放、日常CA保持。
	- 剩余：用户解锁并核准新包后复跑生产workflow/smoke及第3/4项专项。Renderer、design-vite和parity源码从`799cbb1e`以来无改动，复用此前402/406结果；4个暂停弹窗位置差异仍未通过，不放宽阈值或改基准。第6项设计未确认，产品GitHub登录仍存在。
	- 显示环境调整后已通过真实1600×900准备。旧1536×875失败、手动Close恢复及Main85537的trace保存ENOENT均保留为历史失败，不改成Green。
8. **Windows 实机验收 · 待验收**
	- 当前：未执行，由用户回Windows后验收；macOS通过或native skip不能替代。
	- 下一步：按下方[Windows复验表](#windows-复验)执行，并核对真实UAC、原生窗口、系统设置与进程恢复。
	- 排除范围：用户已排除Manager管理员MMC原生专项；保留Manager功能、逻辑及UI检查，不把排除项记为通过。
9. **VS Code Copilot MCP互操作 · blocked**：Host协议与`2026-07-28`不匹配，待Host支持后按[MCP矩阵](features/mcp.md)复验。
	- 验收缺口：VS Code与Claude双Host同读Capture、正式Tool中间进度SSE仍需对应真实场景；不为旧Host增加legacy兼容，也不制造假进度流。
10. **HTTP Execute edited wire correctness · 待验证**：由原session继续H1/H2的长度、编码和framing矩阵。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
	- 已确认缺口：H1 request replacement把继承chunked改为Content-Length；response replacement产生Content-Length与Transfer-Encoding共存。H1/H2四类header的request/response矩阵未齐，已有UI/effect结果不能代替wire正确性。
11. **平台能力 package 整理 · 待确认**：本次仅保存独立workspace元数据、规划README、目录占位和lockfile，未增加入口、实现或生产引用。实际迁移仍后置；原生runner、证书系统工具及支持边界待整理，macOS连接归属/图标未实现。[职责](../apps/desktop/src/main/platform-capabilities/README.md#业务边界)。
12. **WPAD · 待验证**：缺纯Auto Detect环境验收，Windows现行无显式代理/PAC时直连。[详情](features/settings.md#34-上游代理链式转发)。
13. **首个真实 tag release · 待验收**：签名、公证及Windows/macOS发布产物待验。[发布说明](platform/release.md)。
14. **H2源站正常GOAWAY · 待验证**：验证源站`NO_ERROR`后的stream收尾、上游新连接与Capture记录。[覆盖](features/capture.md#h2-range与多stream集成)。
15. **H2事件诊断 · 待实现/待验证**：缺生产原始帧和请求关联，Mockttp/patch采集暂缓；复用Diagnostics，不另建页面。[范围](features/diagnostics.md#h2事件采集范围)。
16. **共享代码全量复验 · 待验证**
	- 当前：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发和导入取消调用方均受影响；macOS仅有可执行子集结果，Windows未验。
	- 当前步骤：fake HTTP snapshot的bodyAvailable修正后，406场景全部执行，402通过、4个HTTPS弹窗位置差异约80–80.75px；无遗漏、无缺失配对，设计/产品未为parity改动。smoke改为等待公开Recording状态就绪后经真实Settings UI Restore，复跑1/1通过；Desktop typecheck通过。授权专项与Windows仍未验；本项是交付检查，不另拆feature commit。
	- 暂停验收源码已保存：HTTPS弹窗的`transitionName=""`及逐帧定位workflow尚未取得真实定位Green，workflow仍按fresh CA断言Generate，和当前共享CA基线不一致，恢复执行前须修正；Bilibili复用CA与gRPC Copy/焦点诊断未复跑，不以保存代码计passed。
17. **文档整理 · 待审阅**
	- 当前：22份`architecture/`压缩与导航改动按用户授权保存为中间进度，不登记文档整理完成；完整原文仍在平台基线`218295b0`，可用`git show 218295b0:architecture/features/settings.md`等精确回读。
	- 剩余：逐项承接被删的独有验证事实和证据，重点为Settings、Capture、Tool capabilities及TODO；保留69项Tool/68项真实E2E的历史范围、Manager原生验收排除、各次Red/Green/trace和明确风险，不把链接替代当前状态判断所需的事实。当前源码和设计契约也须复核，不能因文字更短而当成无害整理。

## Constraints

- 当前日常CA为`16CEB8D0990CCC29FA7313B7F85F1167B227C26C`，保留且受信任。未获本机确认不清理CA、不启动新授权专项；历史CA、helper卸载/rollback及ClashX不自动处理。
- 用户已授权本次把剩余文档、暂停UI/设计/workflow、独立package/lockfile及格式差异一并保存；不改写已push历史、不擅自推进暂停功能。未完成项继续跟踪，不因commit而标passed。
- 12份原保护文件的内容保持，现按授权纳入checkpoint；7份stash不得重复apply/drop。原保护清单：`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- macOS App/E2E/smoke共用`8888`与系统代理，必须串行，结束核对完整宿主恢复。其余通用规则依[AGENTS.md](../AGENTS.md)，不在这里重复。

## Verification

| 范围 | 结果 | 缺口 |
| --- | --- | --- |
| CA服务归属（原第1项） | Main仅持有readonly平台对象；材料/Trust Store、模块状态、Core同步、upstream和图标缓存归对应module。相关类型、265项平台回归、四条真实E2E及归属迁移产物的package/audit/smoke通过，完成项已从任务列表删除 | 不包含第3/4项尚缺的授权专项或第8项Windows实机；不迁独立package |
| 类型/单测/集成 | 本轮8个workspace类型通过；第2/3/4/5项相关组分别73、45、54、37通过，范围重叠不相加 | 本轮既有Node签名读取1项持续超时；历史Core仍有2项framing失败、5个Windows文件窗口fixture排除、2项Windows native跳过，均不算通过 |
| 真实E2E | 73/87条取得最终Green，退出和宿主恢复有证据 | 14条未执行；Body/Archive隔离复验通过，但首跑偶发超时原因未根治 |
| UI parity | **未通过**：406/406已执行，402通过；无遗漏及缺失配对，4个TLS位置偏差80–80.75px | 4项属于本次保存的暂停HTTPS弹窗定位；不改产品或基准掩盖差异 |
| 当前macOS产物 | `b5101f5a`源码包已重建，artifact audit和严格签名通过；实装helper为Interactive且与包内一致 | 新生产身份outdated；本轮真实E2E/smoke因锁屏在启动前阻塞，不能复用旧包1/1。特殊VPN/TUN及ClashX未验 |
| 证书/启动专项 | **blocked**：日常CA保留，新的系统授权专项仍需本机确认 | 新启动顺序缺前置真实E2E；真正未知写入的可靠解除、取消与完整生命周期仍缺；生产helper status超时已解决 |

未执行14条：Windows AppContainer 3条；需空共享目录/本机确认的Certificate/TLS 5条；外部上游/ClashX 2条；用户暂停的Bilibili/HTTPS弹窗2条；gRPC长正文/第10项Execute edited 2条。均不计通过。

原始证据保留在`/tmp/interceptor-platform-final-20260923-*`：`workflow-inventory.json`索引逐项E2E；`{desktop,desktop-macos,core,core-paths}.json`记录完整测试；`parity-combined.json`与`parity-batch-300.json`合计305场景；`package.json`记录产物身份。平台前置Red仍在`/tmp/interceptor-platform-{modules,completion,authorization,maintenance,layout}-20260923-*`；生产准备超时证据在`/tmp/interceptor-daily-ca-ready-20260923-MhBXIZ/`。不删除或改写失败报告。

本轮证据在`/tmp/interceptor-platform-resume-20260923-*`：`inspection-red.json`为8项目标Red，`inspection-green.json`为262通过/2 Windows native跳过；`platform-e2e-green/`与同名JSON为共享CA/helper复用、原生View及跨profile journal四条Green，`host-check.json`核验七代退出、8888及日常CA保留。`package.json`是授权前产物身份快照；`approved-startup.*`、`approved-close.json`记录人工生产核准与恢复，不代替workflow。`production-helper-green/`实际为失败重跑，结合`production-timeout.log`确认37.4秒资源校验；`signature-{background,foreground}.jsonl`为相同API的只读调度对照，不算E2E。

最新结果同前缀：`launchd-policy-red.json`记录实际Background的目标Red，`qos-regression.json`为262通过/2 Windows native跳过，`qos-production-helper.json`为生产1/1 Green，`qos-smoke-ui.json`为smoke 1/1 Green；生产workflow两代Main/Core正常退出，smoke结束App进程和8888释放，常驻helper保留。`parity-complete.json`汇总全部406场景，4项失败为`capture-tunnel{,-dark,-mitm-active,-mitm-active-dark}`。最后执行`npm run typecheck --workspace @interceptor/desktop`通过。上述结果不补造历史前置Red，也不覆盖尚未执行的证书专项。

`qos-package.json`保存最新App及helper身份：helper SHA-256为`18590483b88049c8e1298bdc1f3e98418e8dafb9757ba17e2e73797f8035b86d`，与实际安装文件一致，launchd为Interactive。`final-host-check.json`确认日常CA指纹与信任保持、App进程全部退出、8888释放，HTTP/HTTPS/PAC/SOCKS代理均停用；12份保护文件哈希不变，常驻helper按约定保留。产物来自保留工作区，暂停的HTTPS弹窗修改未纳入本次提交。

提交审阅收尾：`effective-read-payload-red.json`为null/array/string三种完整只读回复的3项目标Red；修正后`effective-read-serial-green.json`为265通过/2 Windows native跳过，Desktop typecheck通过。并发首跑`effective-read-green.json`实际为264通过/1失败/2跳过，失败是`UpstreamProbe`的10ms网络期限断言；同组串行复跑通过，保留首跑失败，不放宽期限或改写结果。最后仅改typed client的只读解析收尾，没有重建/重新核准App；终包验证仍由第7项跟踪。报告在1600px和480px宽度下已检查，截图内嵌、红框位置正确、无折叠和横向溢出，结果为`report-preview.json`。

全部工作区进度保存检查：`npm run typecheck`的8个workspace全部通过；HTTPS弹窗与退出单测9/9通过，证据`/tmp/interceptor-workspace-checkpoint-20260924-ui-unit.json`。本次不启动已暂停的真实E2E，不重建产物，不将上述静态/单测结果替代4项parity差异、原生授权或终包验收；未确认设计和22份文档整理均保留相应待办。按用户明确授权重写两条提交，只调整各自报告及Handover引用，产品、测试、设计源码与配置保持原内容；报告分别为`202609240135_main_shared-ca_startup.html`和`202609240150_docs_workspace_progress.html`，没有旧创建时间说明。

第2项续作证据：`/tmp/interceptor-item2-20260924-baseline.json`记录73/73；同前缀`e2e.json`及`e2e/`保存真实窗口准备失败，`host-recovered.json`证明经产品Close恢复完整代理、进程、8888及日常CA，失败profile保留为`/var/folders/h5/jmc6085s1gb9cgqszq8qtc_00000gn/T/interceptor-e2e-workflow/21931-YQyyLi`。编辑器problems请求30分钟无响应，随后用Desktop typecheck通过替代编译检查；不将工具阻塞计入产品结果。当前需解锁桌面，恢复命令：`npm exec --workspace @interceptor/desktop -- playwright test --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/certificate-startup.workflow.ts --project=macos`。删除profile后的新断言未取得Green，item保留。

第3项续作证据：`/tmp/interceptor-item3-20260924-startup-green.json`记录平台准备与BootStore共45/45，Desktop typecheck通过；新增2项仅补已有行为覆盖，不人为制造Red。本机锁屏，首次授信/取消还要求只处理专项自行创建的CA，不能清空现有日常CA；本轮未运行原生授权专项，未取得新的真实首窗/取消/准备期间Quit证据。恢复条件是用户解锁并提供可执行首次CA专项的环境，再按第3/4项规格执行。

第4项续作证据：`/tmp/interceptor-item4-20260924-target-green.json`为54通过、46条名称过滤未运行，覆盖新真实socket断线和证书/代理占用；Desktop typecheck通过。此前较大组`unknown-outcome-green.json`实际99通过/1失败（同前缀），唯一失败为既有Node签名客户端15秒超时；`native-read-retry.json`单独重跑仍超时且afterEach超过10秒，未查明原因，不算Green。后查没有本轮非特权helper残留，不触碰安装的常驻helper。可靠终态协议需确认，证书原生生命周期仍需解锁和专项环境，不以新增防护测试冒充解除路径实现。

第5项续作证据：`/tmp/interceptor-item5-20260924-baseline.json`为32/32，`journal-green.json`为37/37，Desktop类型通过。新增1项真实文件集成、4项service增减的Restore/Recover零覆盖检查，不改产品行为、不制造Red。跨profile真实crash-recovery沿用前轮明确产物范围的证据；本轮锁屏，VPN/TUN、真实切网和ClashX环境未运行，也未修改宿主网络。恢复时需用户解锁并提供对应网络环境，再按Settings代理规格验证实际路由和退出恢复。

第6项续作证据：`/tmp/interceptor-item6-20260924-design/evidence.json`记录4张当前SPA设计截图、实际加载的Inter/JetBrains Mono字重及候选检查/下载状态；正式设计源码和shots均未改。用户不可回应设计确认，故只保存方案预览和当前实现差异，不启动产品实现或声称OAuth已移除。恢复条件为确认本项报告中的页面、组件、具体位置和前后效果；随后按产品TDD、真实E2E与parity顺序实施。

第7项续作证据：`/tmp/interceptor-item7-20260924-artifact.json`保存源码`b5101f5a`、ASAR SHA-256 `78878acc97489b8c9234d7ea6e9173eadb5c43e5133bacb25ca478bd9e97fa2f`、helper SHA-256 `18590483b88049c8e1298bdc1f3e98418e8dafb9757ba17e2e73797f8035b86d`、audit1487文件/339493308字节及生产outdated/开发ready。`e2e-preflight.json`、`smoke-preflight.json`记录两个真实入口的锁屏拒绝，`preflight-host.json`确认完整代理及CA保持、无进程/journal、8888释放。测试设施最后修改后Desktop typecheck通过，不新增“测试的测试”；未解锁，故通过前置后的正常窗口/新包运行分支尚未复跑。

## Windows 复验

仅供第8项执行。下面workflow路径相对[workflows目录](../apps/desktop/tests/e2e-workflow-tests/workflows/)，`{a,b}`表示两份文件；具体步骤依现有[规格](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)。

| 分组 | 用例 | 重点 |
| --- | --- | --- |
| CA/启动/View | `settings/{certificate-startup,tools-certificates,tools-tls}.workflow.ts` | 首窗先于UAC、取消、跨profile/safeStorage复用、坏材料保留、卸载/删除及真实View关窗；就绪120秒、证书操作30秒、普通操作15秒，先终态后清理 |
| 代理/AppContainer | `settings/{tools-system-proxy,system-proxy-crash-recovery,app-container-bulk-access,tools-app-containers,app-container-ordering}.workflow.ts` | 单项/批量UAC、冲突/Quit立即拒绝、无重放、完整WinINet/exemption恢复 |
| 协议/交互 | `capture/{tls-scenarios,http2-scenarios,grpc-scenarios,navigate-tls-passthrough}.workflow.ts`；`settings/{tls-compatibility,proxy-mitm-persistence}.workflow.ts`；`agent/body-messages.workflow.ts` | 首请求源站例外、Edge证书校验、Raw/Copy长度及hash、每代Page；取消背景host默认选择，Capture discovery精确17项 |
| 导入/只读 | `composer/{collection-import,tools-transfer}.workflow.ts`；`rules/{import-tree,tools-import}.workflow.ts`；`settings/tools-readonly.workflow.ts` | 真实signal、原生/预览Cancel与Confirm、退出取消、重启零重放；六项无审批查询及CA不变 |
| 构建/路径 | `build:native`及平台所属测试；[Client App](../apps/proxy-core/src/proxy-core/client-app/tests/unit/service.test.ts)、[Transfer](../apps/proxy-core/src/proxy-core/transfer/tests/unit/job-manager.test.ts)、[Windows文件窗口fixture](../apps/desktop/tests/e2e-workflow-tests/fixtures/ui/tests/unit/windows-file-dialog.test.ts) | 共用runner、8 MiB枚举、certutil/UAC、Windows路径解析；不使用macOS skip替代 |
| 产物/全量 | 全部适用workflow及[packaged smoke](../apps/desktop/tests/packaged-smoke/startup.spec.ts) | ready门禁、精确Preload白名单、Core重启、截图矩阵、系统设置/进程恢复 |

## 恢复命令

用户在场并恢复验收后，先正常启动新包处理必要的系统确认，再关闭App运行smoke。证书生命周期专项要求空共享目录，不能直接对日常CA执行。其他具体命令查[测试说明](platform/testing.md)和[证书规格](../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md)。

```sh
open -n -a "$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" --args --user-data-dir="$(mktemp -d /tmp/interceptor-helper-approval.XXXXXX)"
npm run test:smoke --workspace @interceptor/desktop
```

本轮合并commit后立即push；后续仍按获准item交付。直连失败时可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
