# Interceptor Handover

> Tracked commit: `4e766148`（第4项正文已验收、提交并push；CA阶段为`d6debb2e`，原中间提交为`0033f9ab`）
> Branch: `main`
> 最后更新：2026-09-29

**9月29日第4项已完成最终签名验收并提交push，文档整理按第17项独立交付；其他授权或平台阻塞不冒充通过。**

## 当前状态

- 第4项正文已通过全部所需验收并以`4e766148`提交push，CA阶段保留`d6debb2e`。第16项Mac全量430态parity通过；第17项文档承接及检查通过，纳入独立文档交付。
- CA收尾commit为`d6debb2e`，已push。本轮接手工作区干净；正文改动包含普通消息、Original/File/Text、Main有限预览读取、共享预算、设计稿、语言、测试与对应文档，不改CA产品代码或依赖。
- 接手的[local-electron-driver.ts](../apps/desktop/tests/e2e-workflow-tests/fixtures/runtime/local-electron-driver.ts)与[macos-certificate-authorization.ts](../apps/desktop/tests/e2e-workflow-tests/fixtures/ui/macos-certificate-authorization.ts)已由真实启动、人工授信、取消及relaunch验收。额外尝试的300秒无人确认场景提前完成授权，实际为初始化/复用Green；driver的300秒超时catch未触发，不宣称工具所有分支均已覆盖。
- CA收尾已统一提交[fixture README](../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)、[settings.md](features/settings.md)、[第4项原报告](../commit-changes/202609241020_main_ca_unknown-write-boundary.html)及当时交接。正文沿用同一报告，保留CA内容并补前后图；原方案预览另存session证据，不另拆文档或测试commit。
- 平台实现基线为`218295b0`，对应[平台报告](../commit-changes/202609240135_main_shared-ca_startup.html)；后续保存剩余工作区进度的提交对应独立[工作区报告](../commit-changes/202609240150_docs_workspace_progress.html)。两份均为9月24日，每个commit各有自己的报告，不共用、不覆盖。GitHub候选的四张图只放在工作区报告中，不额外生成预览报告。
- 日常CA继续保留`D74D4BFB3C3708511A755AC6CD905840B464B255`。本轮开发E2E、最终签名两代启动及smoke均正常退出并由宿主guard验证恢复；App全退、8888释放、无journal，常驻helper保留。新包`deployment-status`为`ready`，三份CA材料size/mtime及完整代理保持。

## 第4项验证证据

- **CA与正文的分阶段证据**
	- CA产品范围的实现、测试、验收证据和原报告已纳入`d6debb2e`并push；`0033f9ab`保留为原已推送中间commit，不amend。正文方案经9月27日普通消息确认、9月28日精简前后图后继续授权，完成实现、开发验收和9月29日最终签名包验收后，以`4e766148`统一提交push，未混入第14/17项。
	- 当前实现：失联写入仅查询原ID/操作的结束记录，仍返回原错误，由原module回读/回滚并释放占用，不重放；未发送、未确认或已有CA不清理。生产完整资源校验由同一受保护helper的短生命周期只读子进程执行，身份、strict/nested/all-architectures及no-network检查保留。
	- 最终验证：原生新入口2项Red后，平台315通过/2 Windows native跳过、全workspace类型及最终Desktop复查通过；package、artifact audit、严格签名、11条不同真实E2E及共享CA首次初始化的额外1次运行、smoke 1/1均通过。前置失败、3次冲突前提失败和恢复证据保留，不改写为Green。
	- 启动结论：旧常驻进程完整校验31.304/33.617秒；采样定位到Security扫描后的`free_medium → madvise`。新helper约一小时生产运行期间已保存去重60次完整校验837–1714ms，无30秒超时；此数值不是整个App启动耗时，不宣称已查明macOS分配器内部成因。证据前缀`/tmp/interceptor-item4-resume-20260925-`，详细矩阵见[Settings](features/settings.md#item4-resumed-acceptance)。
	- 边界：helper每端点只留最近128个结束请求的ID/操作名；重启/淘汰/缺记录或前台授权异常不能推断结束。不自动重放、不放宽产品期限、不缓存信任。
	- 正文已实现：只读预览2 MiB、完整正文1 MiB内自动格式化、1–2 MiB手动、截断禁止；图片独立16 MiB。Text完整编辑，File只传完整路径并返回独立preview字节/截断标记；Original/File/gRPC/WS按可用空间限高、可拖拽，Composer保留填充。捕获不完整与预览截断分开，格式化失败保留原文并明确提示。
	- 9月27日设计前置：核对content/viewport候选，修正`MonacoFixture.tsx`隐藏初始化时把短正文误压至48px的问题，当时默认content分支不变。四主题32张framed、浅深色16张full及拖拽/滚动2图已生成，字体实际加载；长消息示例2688→441px、短消息仍128px，实际拖到321px、滚轮到末行后外层继续滚动、键盘首尾、完整Copy与窗口收缩恢复均通过。设计typecheck通过，三组原content前后0像素变化。
	- 设计确认：9月27日确认gRPC/WebSocket普通Monaco消息限高、内部滚动及拖拽；长消息按实际容器空间限高、短消息保持自然高度，完整Copy不变。原图与批准依据在session的`body-design-20260927-verified/review.html#grpc-difference`、`evidence.json`和`scroll-comparison.json`。9月28日按用户要求将剩余Original/File/Text及阈值方案精简为前后图，用户12:37要求继续后完成实现；Composer填充布局不变。
	- 当前实现步骤：产品目标8项unit Red、两种协议真实E2E各1项Red后，resizable链路、消息容器及稳定分页回调实现完成；最终58项相关unit与Desktop类型、6/6真实E2E（含205条gRPC分页、原协议、HTTP填充、WS断点隔离）Green。最终合并去重68态555目标无missing/flagged、最大0.672px；四主题普通消息12态的正文pane/toolbar/首行0px差异，原HTTP/WS断点、默认gRPC Hex、Rule正文与消息空态复验。WS排队详情flex回归已修正；没有放宽parity阈值。
	- 剩余正文进度：预览/格式化6项unit Red、错误/图片3项Red、捕获残缺1项Red及原文件读取6项integration Red均保留；Original真实resize Red、File真实大JSON无预览Red、manual/truncated字节Red后实现。2MiB预览/1MiB自动/2MiB手动、独立16MiB图片、完整File路径/预览bytes分离与完整Text已接入，最新相关78项unit/integration、Core解码15项、全workspace类型曾Green。
	- 9月28日暂停前验证：File预览2MiB但完整3MiB文件发送、完整Text超过2MiB发送、Original/手动格式化/截断3条、文本/媒体2条、压缩/gRPC/WS3条真实流程通过；当时package/audit/严格签名、生产两代启动和smoke1/1通过。随后增加精确1/2/16MiB边界测试、图片避免多余拷贝、提示与错误显示调整，15:27暂停时尚未全部复跑；两名代理及所属preview/browser/server当时已停。17:05恢复后的结果以下列最终验证为准，不以旧Green覆盖最后修改。
	- 暂停时parity的6项缺口已修复：CodeViewer观察前置分组尺寸，短File不再沿用旧clamp；Capture提示改为KiB/MiB。前置unit1 Red与原4处高度/2处文案失败保留，原交接为session files的`body-parity-calibration-20260928/handoff.json`。最终85态717目标无missing/flagged，最大0.86px；Original/File/Text相关34态400目标全0px，未修改基准掩盖偏差。
	- 当前最终验证：相关303项tests与全workspace类型通过；真实正文/协议/File/Original/Composer共16个测试通过（15条联合Green＋Composer按新1–2MiB输入单跑Green）。标准Content-Length File完整3MiB发送与Text完整编辑已验；误带仅Content-Type的测试会进入已知chunked缺陷，仍归第10项，不宣称framing矩阵已通过。并行构建时Composer曾有空Renderer error，单独复跑通过，失败不改写。
	- 后续交付复核：Mac全量430态3169目标parity通过；51份验收源码与最终ASAR/helper哈希保持，开发验收结果仍适用。只修parity弹层等待和Endpoint配对，不改产品或设计。
	- 9月28日产物阻塞：package、artifact audit（1487文件/339528858字节）与严格deep/strict/all-architectures签名通过；当时新App首次组件授权未完成，`packaged-startup`失败，后续smoke未运行。该失败保留，不复用15:21旧smoke、不改鉴权或期限。
	- 9月29日最终Green：人工系统组件授权后`deployment-status=ready`，同一最终签名包helper-startup 1/1（两代Main/Core均正常销毁，组件PID/inode/配置复用）、packaged smoke1/1及16张既有截图矩阵通过。再次核对严格签名、51份源码及ASAR/helper哈希不变，App全退、8888释放、无journal、日常CA信任/三份材料及完整代理保持。详细证据见[正文最终验收](features/capture.md#body-preview-final-acceptance)和session files的`item4-final-acceptance-20260929.json`。
	- 最终证据前缀：`/tmp/interceptor-item4-final-20260928-`，含`clamp-red.json`、`unit-green.json`、`related-tests.json`、`workflows.json`（15通过/1旧CSS阈值失败）、`composer-isolated.json`、`file-green.json`、五组`parity-*.json`、`package.log`和`packaged-startup.json`。原生授权失败后App已退出，签名状态仍outdated。
	- 原生窗口：反复GoTo/焦点失败不计产品Red；最终由CoreGraphics真实HID键鼠、精确Main代际与面板焦点完成Save/Open，不改原生返回值。一次遗留journal经正常产品启动/Close恢复，证据`/tmp/interceptor-body-journal-recovery-mZTwAr/evidence.json`；暂停时无测试App、8888空闲。完整前置、失败、Green见`/tmp/interceptor-item4-remainder-20260928-*`，未删除或改写。
	- 原剩余方案入口：session files的`body-remainder-preview/review.html`，按用户要求精简为“改前一句、改后一句＋图”，保留24张浅/深图与红框；Composer不变，不再重复放图。`handoff.json`保存当时默认开关false、未改正式shots的预览状态；确认后临时开关已删除、正式设计与shots已同步。File字号10/15→12/20、Original左间距12→16px等变化保留，MiB提示已有下述真实字节边界验收，不再仅为设计图。
	- 本轮证据：`/tmp/interceptor-item4-messages-20260927-`下`unit-red.json`、`e2e-red.json`及截图/trace、`unit-green.json`、`capture-unit.json`、`pagination-green.json`、`protocol-regression.json`。额外失败如实保留：WS专用Copy是binary Hex，最初误按文本断言；三条消息缩短后可能无外层溢出，改用足够后续消息；第三页分页真实失败由不稳定scroll listener触发，最终205条及末条Copy均通过。未修改产品协议或降低断言期限。
	- 最终证据：同前缀`final-unit.json`、`final-workflows.json`及目录、`parity-final/queue-final/grpc-hex/effects`等JSON与PNG、`final-host.json`；session files的`item4-messages-acceptance-summary.json`记录每代退出、产品源码SHA-256及去重结果，同目录`item4-messages-acceptance-20260927.tar.gz`已校验，SHA-256为`470abcd2795e28d4c5336e0f68f7a22802fef0f342e3e661e15fd3c1b137c559`。Main/Core/Worker全退、8888释放、无journal，日常CA身份与三份文件size/mtime不变，完整代理恢复；没有为了验收重新生成CA。本项原HTML报告保留CA内容并补实际同消息产品前后局部图/红框，1280/390宽度检查通过。
## Task List

- **5. macOS journal 收尾 · blocked（外部环境）**
	- 当前：[journal](../apps/desktop/src/main/platform-capabilities/system-proxy/macos/journal.ts)跨profile恢复复验Green。生产超时已定位并修复：完整资源校验37.4秒超过30秒，同一签名API只读对照为Background26.99秒、普通6.27秒；不反推历史14:09缺失的耗时证据。
	- 当前步骤：实际launchd策略取得Background的Red后，仅将ProcessType改为Interactive并由用户核准部署；实装plist与运行中的spawn type均为Interactive。平台回归262通过、2项Windows native跳过，最新package、artifact audit、严格签名、生产helper workflow 1/1和packaged smoke 1/1均通过；完整鉴权及30秒期限不变。本轮按用户授权与第1–4项合并保存进度，以下外部验收不标为通过。
	- 外部环境缺口：特殊VPN/TUN、动态网络切换及ClashX联调仍需对应环境，不由普通loopback结果代替。
	- 当前步骤：不改产品journal逻辑；补临时home下真实删除默认profile后重建journal实例的文件集成，以及service增加/删除时Restore和跨代Recover零覆盖的状态机检查。原32项与新增5项共37/37通过，Desktop类型通过。锁屏期间不运行真实Electron或修改宿主网络，外部场景仍未验。
- **6. 删除产品 GitHub 登录 · 待确认**
	- 当前：已从当前设计SPA重新生成`updatesWithoutSignIn`浅/深色前后图，逐字重加载字体，画布1600×900，并实际点击检查/下载到available/downloaded；[本项预览](../commit-changes/202609241039_ui_updates_remove-signin-preview.html)逐处红框说明。已请求用户确认，但当前不可响应；产品OAuth/Token及登录门槛未删，正式shots不改。
	- 下一步：用户确认设计后再实现、验收；保留匿名更新，不碰个人Git/CI凭据或远端仓库可见性。
	- 更新验收缺口：通知的真实下载/打开安装器流程尚缺专属E2E，需可用的新Release与签名包；其他按钮验收不代替。
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
- **16. 共享代码全量复验 · blocked（Windows及外部场景）**
	- 当前：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发和导入取消调用方均受影响；macOS仅有可执行子集结果，Windows未验。
	- 历史基线：HTTP snapshot fixture与Tunnel重复标题的selector曾按真实契约修正，406/406无missing/flagged（402项有效结果复用、4项复跑）；未改产品/设计或阈值。当时签名首次授权、取消、证书生命周期和smoke通过，不替代本轮最终签名包。本项是交付检查，不另拆feature commit。
	- 独立暂停/平台范围：HTTPS弹窗的`transitionName=""`及逐帧定位workflow仍保留原暂停，不纳入本轮产品改动或Green；workflow的fresh CA Generate断言与共享CA不符，恢复该专项前须修正。Bilibili依赖Windows UIAutomation及真实已登录Edge，当前macOS环境未复验。gRPC Copy/焦点已在本轮最终真实workflow通过，并核对`workflows.json`内request/response各两份`grpc-keyboard-*.json`证据，不再列为未复跑。
	- 本轮Mac最终：430态3169目标无missing/flagged，所有字体检查一致，最大几何差0.859375px。115:120的弹层可见性等待与测量竞态改为同次采样并等待定位稳定；DeepSeek Endpoint限定dialog内标签后浅/深色复跑通过。只改验收工具配对/等待，不改产品、设计基准或1px阈值。
	- 证据：session files的`item16-parity-final-20260928.json`和`item16-parity-summary-20260928.json`保留最终合并及来源；`item16-parity-evidence-20260928.tar.gz`含1084项、294175737字节，SHA-256为`9b31bc3967170271f41e4189bc1aa855f68bb381b478c0d2cb0751355c3fa8ee`。原弹层失败、Endpoint 40px配对失败及含该失败的全量原始结果一并保留，不改写历史Green。

## 第17项文档验证

- **承接范围与检查**
	- 历史基线：22份`architecture/`压缩与导航改动曾按用户授权保存为中间进度，当时未登记整理完成；本轮已完成事实承接。完整原文仍在平台基线`218295b0`，可用`git show 218295b0:architecture/features/settings.md`等精确回读。
	- 本轮：三份优先承接之后，已完成可由Git证明的22份非Handover文档核对，补回余下40组事实与11个有正文锚点，DeepSeek调研、Agent、MCP三份partial已清零。保留69项Tool/68项真实E2E的历史范围、Manager原生排除及失败/恢复记录；当前契约不回滚，不用链接替代独有事实。
	- 检查：22份原有字节前缀全部保留，第4/14项文字未覆盖；212/212本地路径/锚点、历史hash、JSON、diff及编辑器检查通过。仅恢复文档事实，不宣称重新执行历史产品验收。
	- 历史资料限制：早期Core bundle/截图范围、Windows Client App样本、Manager TEMP短名、DeepSeek研究、Agent query和MCP Host等7类原文未给完整日期或独立归档，已按原文标注，未补造。逐项位置及来源保存在session files的`item17-doc-facts.json`的`carryover`。
	- [本项改动说明](../commit-changes/202609281939_docs_architecture_restore-evidence.html)仅列改前/改后，未混入其他item报告；Edge真实1280/390宽度无页面溢出，窄表格键盘横向滚动通过、全部展开且无外联资源。VS Code内嵌浏览器的宽度和键盘检查受限，未把该次超时算通过，改用独立Edge复验。第4项已先独立提交push，本项仅提交文档、报告及所属交接，不包含第14项Red测试。

## Constraints

- `16CEB8D0990CCC29FA7313B7F85F1167B227C26C`与`3C2E5F2AC71BDB4E82AA47AA49E79276D3EACDD5`是已经按授权处理过的历史CA，不是当前身份。恢复第4项只通过产品处理重新核对后的本轮日常CA及专项自产CA；其他Root、历史CA、ClashX与helper卸载不在范围。
- 历史日常CA `3C2E5F2AC71BDB4E82AA47AA49E79276D3EACDD5`、`B705FBDEF2397E85DAE3605550B916A0EA946ED6`及失败自产`54B224ABC1D2C88BBDB2B43396A5EBC4DC8B023C`均已按精确身份经产品清理。当前日常CA为`D74D4BFB3C3708511A755AC6CD905840B464B255`，普通workflow/smoke保留它；其他Root保持，未复制或注入材料。
- 接手时6个未提交修改已保留、审阅并整合进本次15文件收尾范围，不回滚或覆盖其他工作，不重写已有commit。已有证据不删除，未验证或暂停范围不因提交而标passed。
- 12份原保护文件的内容保持，现按授权纳入checkpoint；7份stash不得重复apply/drop。原保护清单：`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- macOS App/E2E/smoke共用`8888`与系统代理，必须串行，结束核对完整宿主恢复。其余通用规则依[AGENTS.md](../AGENTS.md)，不在这里重复。

## Verification

只保留当前结论；产物身份、前置Red、失败与恢复记录见[Settings证据索引](features/settings.md#platform-verification-evidence)。

| 范围 | 当前结论 | 未覆盖或限制 |
| --- | --- | --- |
| 共享CA（原第2项） | 跨profile与删除profile后保留1/1，材料/信任和退出恢复通过 | Windows实机留第8项 |
| CA阶段历史验收 | 9月26日生命周期、Agent/MCP六项、TLS、取消及冲突Green；11条不同E2E与额外初始化、smoke1/1，60次签名校验837–1714ms | 对应`d6debb2e`阶段，不代替9月28日新包；driver300秒超时catch未触发 |
| 当前macOS产物 | 最终package/audit/严格签名通过，ASAR SHA-256为`68cbaba4738d8deff1ff7d58f47acf7b74f43f9cfb2afb2bd2aaa8aaf2e836b0`；9月29日系统授权ready、签名两代启动1/1、smoke1/1和16张截图矩阵通过，helper与实装字节一致 | 9月28日未授权失败独立保留；不是Developer ID/公证或Windows验收 |
| UI parity | Mac全量430态3169目标无missing/flagged，字体一致、最大0.859375px；正文85态717目标仍有效，其中Original/File/Text34态400目标为0px | fake Preload不替代真实E2E或Windows验收；原竞态/配对失败保留 |
| 类型/回归 | 全workspace类型和相关303 tests通过，Core解码15项有效基线；当前正文真实E2E16条通过，含大小File、2MiB、窗口/滚轮、完整发送和Composer | Windows实机未验；Core两项chunked失败属第10项，新发现NO_ERROR尾段缺失属第14项 |
| 文档承接 | 22份非Handover文档完成核对，余下40组事实/11锚点已补；212/212本地链接、历史hash及diff检查通过，报告1280/390及键盘横向滚动通过 | 7类历史元数据不足如实标注；独立文档交付，不新增产品验收结论 |
| 最后宿主核验 | 9月29日签名启动及smoke后，日常CA指纹/三份材料size/mtime/信任保持，完整代理恢复，无journal、App全退、8888释放；51份源码与ASAR/helper哈希不变 | 当前证据`item4-final-acceptance-20260929.json`；9月28日失败与开发证据仍分别保留，不覆盖历史记录 |

本轮证据已另存持久副本：`/Users/zhxmt/.copilot/session-state/df17625e-cb60-4ece-a735-8d703667fab6/files/item4-acceptance-summary.json`；同目录`item4-acceptance-20260926.tar.gz`保留原始Red、失败、Green与trace，SHA-256为`ba3f9ee81b6aae05a96d6bfdb69fba76fbe2ffff0cf46d87bd8c0e9e0d9937f8`。最终逐项核对12次成功运行、11条不同workflow的trace存在及每代退出metadata，未将失败记录算入。

9月28日最终正文证据位于同一session files的`item4-final-acceptance-20260928.json`，记录303 tests、16条开发E2E、85态parity、源码/产物hash与签名授权阻塞。`item4-final-evidence-20260928.tar.gz`已校验，SHA-256为`a8394689606dd4d397bbef2b0418580bc16ed910d0ab077445f278aa8d237178`；旧包证据独立保留，不把最终未运行的smoke写为通过。

9月29日授权后的新结果独立保存为`item4-final-acceptance-20260929.json`；`item4-signed-final-evidence-20260929.tar.gz`含48项、26520921字节，SHA-256为`c5d17420658b7485741e827266135445953383e1f08a72a7e285e2cba33dcc02`。原始入口为`/tmp/interceptor-item4-20260929-{signed-startup,packaged-smoke}`及同名JSON/log；两代trace、16张截图与最终恢复已核对。

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

## 复验命令

日常CA及当前最终包的production批准已就绪；下面命令仅用于需要重新验证时，按顺序执行，不重复prepare或改写产物。不要删除CA、改授权规则或手改helper配置；详细命令见[测试说明](platform/testing.md)。

```sh
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/helper-startup.workflow.ts --project macos
npm run test:smoke --workspace @interceptor/desktop
```

每个获准item独立commit后立即push，不混入其他工作。直连失败时可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
