# Interceptor Handover

> Tracked commit: `96cf1202`
> Branch: `main`
> 最后更新：2026-09-25

**不允许记录流水账！！！执行任务列表时不允许停下**

## 当前状态

- 第3项按当前版本统一启动检查的功能、性能、生产验证及宿主恢复范围验收关闭；当前产物已独立取得生产E2E 2/2、smoke 1/1。原实现前置E2E记录缺失仍留在证据索引，不宣称历史实施过程已补齐。
- 用户于2026-09-24明确授权先保存全部剩余工作区进度并push，提交后保持改动区为空；未完成的实现、文档审阅、设计确认与验收继续保留在下表。保存暂停草稿不等于恢复执行或确认设计。
- 第2–7项已有各自中间进度提交；用户已授权继续并要求实际提交。本轮按第3项启动专项、第7项smoke/parity收尾分别commit/push，沿用各自报告，不改已推送历史、不再以重写授权作为正常提交的阻塞。
- 平台实现基线为`218295b0`，对应[平台报告](../commit-changes/202609240135_main_shared-ca_startup.html)；后续保存剩余工作区进度的提交对应独立[工作区报告](../commit-changes/202609240150_docs_workspace_progress.html)。两份均为9月24日，每个commit各有自己的报告，不共用、不覆盖。GitHub候选的四张图只放在工作区报告中，不额外生成预览报告。
- 用户现已解锁，并明确允许通过产品卸载、删除当前日常CA后重新生成，愿意确认系统授权；只清理产品管理的精确CA，不处理其他系统根证书。正文、HTTPS弹窗、Bilibili及独立package仍不扩展，第8项留Windows实机。

## Task List

- **4. CA 操作与 E2E · 代码完成 · 待证书专项确认**
	- 当前实现：仅失联写入后查询原ID的结束记录；匹配后仍返回原错误，由原module回读/回滚并释放占用，不重放。未发送、未确认或已有CA不清理。目标23项Red及未发送import的补充Red后，平台312通过/2 Windows native跳过、类型、构建、audit与严格签名通过。
	- 边界：结束记录仅在各自受保护socket所属helper实例中保留最近128个写请求的ID/操作名，无代理配置、证书或信任缓存；重启/淘汰后无记录不能解锁，前台授权进程异常也不借用该证明。现有显式CA生命周期与共享调用方须同组复验，再执行新包验收。
	- 当前产物：新helper已获授权并与包内一致；组件/共享CA/代理恢复3条及Agent/MCP共享入口2条真实E2E、smoke 1/1通过，九代App全退、完整代理和日常CA保持。窗口准备的fixture遗漏已修正，失败与恢复证据保留。
	- 剩余：新包证书写入/取消专用E2E要求空共享CA目录；本轮保留日常CA，尚未获准再次清理/重建，因此未运行。故障帧/失联分支的native及传输集成结果不冒充真实UI触发故障；不进入第5项。
	- 正文子项暂停：只读预览2 MiB、完整且不超过1 MiB自动格式化、1–2 MiB可手动格式化，截断不格式化；图片独立16 MiB。Text完整编辑，File只预览但使用完整文件；初始高度、内滚动和resize不影响完整保存/导出/发送。产品未实现；本次仅保存已有compact正文、resize及自定义gRPC设计候选，不改正式shots、不视为定稿。
- **5. macOS journal 收尾 · blocked（外部环境）**
	- 当前：[journal](../apps/desktop/src/main/platform-capabilities/system-proxy/macos/journal.ts)跨profile恢复复验Green。生产超时已定位并修复：完整资源校验37.4秒超过30秒，同一签名API只读对照为Background26.99秒、普通6.27秒；不反推历史14:09缺失的耗时证据。
	- 当前步骤：实际launchd策略取得Background的Red后，仅将ProcessType改为Interactive并由用户核准部署；实装plist与运行中的spawn type均为Interactive。平台回归262通过、2项Windows native跳过，最新package、artifact audit、严格签名、生产helper workflow 1/1和packaged smoke 1/1均通过；完整鉴权及30秒期限不变。本轮按用户授权与第1–4项合并保存进度，以下外部验收不标为通过。
	- 外部环境缺口：特殊VPN/TUN、动态网络切换及ClashX联调仍需对应环境，不由普通loopback结果代替。
	- 当前步骤：不改产品journal逻辑；补临时home下真实删除默认profile后重建journal实例的文件集成，以及service增加/删除时Restore和跨代Recover零覆盖的状态机检查。原32项与新增5项共37/37通过，Desktop类型通过。锁屏期间不运行真实Electron或修改宿主网络，外部场景仍未验。
- **6. 删除产品 GitHub 登录 · 待确认**
	- 当前：已从当前设计SPA重新生成`updatesWithoutSignIn`浅/深色前后图，逐字重加载字体，画布1600×900，并实际点击检查/下载到available/downloaded；[本项预览](../commit-changes/202609241039_ui_updates_remove-signin-preview.html)逐处红框说明。已请求用户确认，但当前不可响应；产品OAuth/Token及登录门槛未删，正式shots不改。
	- 下一步：用户确认设计后再实现、验收；保留匿名更新，不碰个人Git/CI凭据或远端仓库可见性。
	- 更新验收缺口：通知的真实下载/打开安装器流程尚缺专属E2E，需可用的新Release与签名包；其他按钮验收不代替。
- **7. macOS 最终验收 · 待验证**
	- 当前：用户已核准当前签名包；package、artifact audit、严格签名和workspace类型通过。签名包首次CA、启动取消及显式证书生命周期通过；最终packaged smoke 1/1，正常退出和完整宿主恢复已验。
	- 当前步骤：smoke原Core重启15秒断言超时后，保留App的日志pipe随runner关闭，导致EPIPE。已改macOS私有文件日志、同时保留原始/清理错误，并按原生恢复30秒预算等待新Core35秒；产品期限、鉴权和Windows15秒不变。真实smoke两次复跑通过，原失败及安全强制清理证据保留。
	- 剩余：第4项未知写入解除、第5项外部环境、第6项设计/产品实现；不以本次smoke替代这些范围。parity原4项80px差异实际是Tunnel标题与列表重复文案匹配错位，不是弹窗；仅限定目标selector后4项复跑通过，图片逐字节不变，结合未变402项为406/406。
	- 日常CA已通过正常产品启动重建并保留，指纹`3C2E5F2AC71BDB4E82AA47AA49E79276D3EACDD5`，受信任、普通退出不删除。
	- 显示环境调整后已通过真实1600×900准备。旧1536×875失败、手动Close恢复及Main85537的trace保存ENOENT均保留为历史失败，不改成Green。
- **8. Windows 实机验收 · 待验收**
	- 当前：未执行，由用户回Windows后验收；macOS通过或native skip不能替代。
	- 下一步：按下方[Windows复验表](#windows-复验)执行，并核对真实UAC、原生窗口、系统设置与进程恢复。
	- 排除范围：用户已排除Manager管理员MMC原生专项；保留Manager功能、逻辑及UI检查，不把排除项记为通过。
- **9. VS Code Copilot MCP互操作 · blocked**：Host协议与`2026-07-28`不匹配，待Host支持后按[MCP矩阵](features/mcp.md)复验。
	- 验收缺口：VS Code与Claude双Host同读Capture、正式Tool中间进度SSE仍需对应真实场景；不为旧Host增加legacy兼容，也不制造假进度流。
- **10. HTTP Execute edited wire correctness · 待验证**：由原session继续H1/H2的长度、编码和framing矩阵。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
	- 已确认缺口：H1 request replacement把继承chunked改为Content-Length；response replacement产生Content-Length与Transfer-Encoding共存。H1/H2四类header的request/response矩阵未齐，已有UI/effect结果不能代替wire正确性。
- **11. 平台能力 package 整理 · 待确认**：本次仅保存独立workspace元数据、规划README、目录占位和lockfile，未增加入口、实现或生产引用。实际迁移仍后置；原生runner、证书系统工具及支持边界待整理，macOS连接归属/图标未实现。[职责](../apps/desktop/src/main/platform-capabilities/README.md#业务边界)。
- **12. WPAD · 待验证**：缺纯Auto Detect环境验收，Windows现行无显式代理/PAC时直连。[详情](features/settings.md#34-上游代理链式转发)。
- **13. 首个真实 tag release · 待验收**：签名、公证及Windows/macOS发布产物待验。[发布说明](platform/release.md)。
- **14. H2源站正常GOAWAY · 待验证**：验证源站`NO_ERROR`后的stream收尾、上游新连接与Capture记录。[覆盖](features/capture.md#h2-range与多stream集成)。
- **15. H2事件诊断 · 待实现/待验证**：缺生产原始帧和请求关联，Mockttp/patch采集暂缓；复用Diagnostics，不另建页面。[范围](features/diagnostics.md#h2事件采集范围)。
- **16. 共享代码全量复验 · 待验证**
	- 当前：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发和导入取消调用方均受影响；macOS仅有可执行子集结果，Windows未验。
	- 当前步骤：HTTP snapshot fixture与Tunnel重复标题的selector均已按真实契约修正，当前406/406无missing/flagged（402项有效结果复用、4项复跑）；不改产品/设计或阈值。签名包首次授权、取消、证书生命周期和当前smoke通过；Windows及各item剩余范围仍未验，本项是交付检查，不另拆feature commit。
	- 暂停验收源码已保存：HTTPS弹窗的`transitionName=""`及逐帧定位workflow尚未取得真实定位Green，workflow仍按fresh CA断言Generate，和当前共享CA基线不一致，恢复执行前须修正；Bilibili复用CA与gRPC Copy/焦点诊断未复跑，不以保存代码计passed。
- **17. 文档整理 · 待审阅**
	- 当前：22份`architecture/`压缩与导航改动按用户授权保存为中间进度，不登记文档整理完成；完整原文仍在平台基线`218295b0`，可用`git show 218295b0:architecture/features/settings.md`等精确回读。
	- 剩余：逐项承接被删的独有验证事实和证据，重点为Settings、Capture、Tool capabilities及TODO；保留69项Tool/68项真实E2E的历史范围、Manager原生验收排除、各次Red/Green/trace和明确风险，不把链接替代当前状态判断所需的事实。当前源码和设计契约也须复核，不能因文字更短而当成无害整理。

## Constraints

- 用户已明确授权经产品Uninstall/Delete清理当前CA `16CEB8D0990CCC29FA7313B7F85F1167B227C26C`并重新生成，新指纹会变化；只处理该CA及专项由产品新生成的CA，其他系统Root/admin trust保持。helper卸载/rollback、历史其他CA及ClashX不自动处理。
- 当前日常CA为`3C2E5F2AC71BDB4E82AA47AA49E79276D3EACDD5`，已经正常产品启动生成并授信。普通workflow/smoke保留它；不再以旧指纹作为当前基线，不复制或注入材料。
- 用户已授权本次把剩余文档、暂停UI/设计/workflow、独立package/lockfile及格式差异一并保存；不改写已push历史、不擅自推进暂停功能。未完成项继续跟踪，不因commit而标passed。
- 12份原保护文件的内容保持，现按授权纳入checkpoint；7份stash不得重复apply/drop。原保护清单：`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- macOS App/E2E/smoke共用`8888`与系统代理，必须串行，结束核对完整宿主恢复。其余通用规则依[AGENTS.md](../AGENTS.md)，不在这里重复。

## Verification

本次解锁续验：共享CA删除profile后检查1/1及两代退出见`/tmp/interceptor-item2-20260924-unlocked-{e2e,host}.json`；helper复用与journal跨profile两条2/2见`/tmp/interceptor-item5-20260924-unlocked-e2e.json`。原生签名读取在原15秒期限内复跑通过，完整同组100/100见`/tmp/interceptor-item4-20260924-unlocked-group.json`，不改写此前超时。

首次CA签名包1/1见`/tmp/interceptor-item3-20260924-first-ca-startup.json`；启动取消最终1/1及首代Core为null、次代同CA正常重启见`startup-cancel-final.json`和`startup-cancel-host.json`（同前缀），均有trace。前两次fixture失败分别为System Events窗口索引和原生错误提示未确认，恢复证据在`startup-cancel-recovery.json`、`startup-cancel-fixed-recovery.json`，不算产品Red。普通重启就绪后无operation-conflict提示，拒绝提示只由本用例主动Close触发。

证书完整生命周期签名包2/2见`/tmp/interceptor-item4-20260924-certificate-lifecycle.json`及同名目录；暂停时恢复证据在`/tmp/interceptor-items2-7-20260924-pause.json`。旧CA按用户授权Uninstall/Delete，其他Root保持；日常CA后来由正常签名包启动重建，公开指纹、材料元数据及正常Close恢复在`/tmp/interceptor-daily-ca-20260924-current.json`。

启动耗时只读取已有日志：`/tmp/interceptor-startup-verification-20260924.log`中17次helper完整资源校验中位5335ms、最大13733ms，peer中位1ms。生产deployment-status也调用完整inspectApplication；重复扫描优化尚未实施，没有修改产品校验、安全边界或超时。

| 范围 | 结果 | 缺口 |
| --- | --- | --- |
| CA服务归属（原第1项） | Main仅持有readonly平台对象；材料/Trust Store、模块状态、Core同步、upstream和图标缓存归对应module。相关类型、265项平台回归、四条真实E2E及归属迁移产物的package/audit/smoke通过，完成项已从任务列表删除 | 不包含第3/4项尚缺的授权专项或第8项Windows实机；不迁独立package |
| 共享CA（原第2项） | 解锁后shared-startup真实1/1通过；两代fresh profile复用同一CA，第二代profile真实删除后指纹/size/mtime/信任和Root集合保持，两代Main/Core正常退出，8888及journal恢复 | 首次创建/取消归第3/4项，Windows实机归第8项；不将这些范围计为通过 |
| 类型/单测/集成 | workspace类型通过；相关组73、45、54、37通过，原生签名/占用同组解锁后100/100，范围重叠不相加 | 原超时保留为历史失败；Core仍有2项framing失败、Windows窗口fixture排除和native skip，不算通过 |
| 真实E2E | 73/87条取得最终Green，退出和宿主恢复有证据 | 14条未执行；Body/Archive隔离复验通过，但首跑偶发超时原因未根治 |
| UI parity | **406/406无missing/flagged**：复用未变402项，四个Tunnel场景重新验证；原80px为重复文案错量列表行，正确标题最大差0.8px | selector修正前后8份PNG逐字节一致，不改设计/产品/阈值；暂停的HTTPS弹窗专项是另一范围，不由此替代 |
| 当前macOS产物 | 当前包已获核准，artifact audit、严格签名、签名包授权专项和最终smoke 1/1通过；实装helper仍为Interactive | 特殊VPN/TUN及ClashX未验；总体剩余以第7项为准，不等于正式release验收 |
| 证书/启动专项 | 首次生成/复用1/1、启动取消/Quit1/1、显式取消和完整生命周期2/2均通过；新日常CA保持 | 原启动实现的历史前置E2E缺口保留；真正未知写入的可靠解除仍缺 |

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

当前smoke续验：原运行`/tmp/interceptor-item7-20260924-resume-smoke.json`先在Core新PID/running的15秒断言超时，之后清理失败保留App；runner关闭pipe后Main的console.error触发EPIPE。`epipe-safe-cleanup.json`记录确认完整代理已恢复后清理5个测试进程，明确为强制失败清理，不算正常退出（同前缀）。macOS改为0600文件日志并保留原始错误后`persistent-log-smoke.json`1/1；把macOS Core恢复等待对齐原生30秒预算的35秒后`final-smoke.json`1/1，Windows仍15秒，产品期限和鉴权未改。`persistent-log-host.json`记录新日常CA保持、完整代理、进程、journal、8888恢复。

当前parity续验：`/tmp/interceptor-item7-20260924-tunnel-before.json`重现4项错误配对；`tunnel-after.json`4/4、32目标全匹配、0 missing/flagged，最大差0.8px。`parity-current.json`合并有效402项及复跑4项为406/406，并记录8份前后PNG逐字节一致。原4项失败被误记为HTTPS弹窗偏移，现已纠正为Tunnel详情标题与请求列表重复文案的测量定位错误；没有改任何产品布局、设计稿或基准。

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
