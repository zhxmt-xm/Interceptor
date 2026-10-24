# Task List

> Tracked commit: `9426dbd9`
> Homepage guidebook: `83999b9`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`。

- **12. 推广方案与逐平台备稿、发布 · 待实现**
  - 目标：明确在哪个平台、面向谁、发布什么内容，并逐个平台准备完整材料后发布，不停留在渠道建议或通用模板。
  - 范围：评估 V2EX、掘金、B 站、Show HN、Reddit、DEV Community、YouTube、Product Hunt 及相关开源周刊等候选渠道，按受众、社区规则和准备成本确定发布顺序，不要求不加筛选地全部发布。
  - 交付：每个选定平台分别准备标题、正文、语言版本、真实截图或视频、官网/下载/GitHub 链接和必要的回复要点；内容针对平台和具体使用场景调整，不机械复制同一篇宣传稿。
  - 下一步：先完成渠道与帖子清单，再按顺序逐项备稿、核对发布规则、确认最终内容与账号授权并发布；正式外发使用已交付教程及 item 11、15 已就绪的资料与入口，未验收场景继续按[Guidebook验证范围](features/guidebook.md#6-与当前验证范围的差异)保留边界，本轮仅登记待办，不操作外部账号或对外发布。
  - 验收：每个选定渠道都有最终稿、素材和实际发布链接，并处理发布后的有效问题与反馈；发布链接及反馈记录保存在对应推广材料中，不把草稿算作已发布。账号、平台规则或人工操作阻塞时说明原因，继续其他可执行渠道。

- **14. Android USB 流量接入 · blocked · 自动可执行范围完成，待物理USB、ARM64、Windows及专用网络环境**
  - 目标：Android以`VpnService`创建TUN，经USB/`adb reverse`接入PC；Android唯一连接源站，PC复用Rules、Breakpoints和Capture，不接收原始TCP/DNS或重复请求源站。
  - 当前Android：全局TCP/UDP dispatcher、selected Network、双栈TUN、本地DNS、前台Service、Launcher、双端完整指纹、VPN/CA系统入口及断线保留阻断已实现。未知TCP发送RST，非DNS UDP/QUIC关闭；PC control断开后由手机本地停止恢复。
  - 当前Desktop/Core：Main拥有PC mTLS身份、ADB设备状态、APK版本/签名/摘要校验、缺失/升级安装、Core listener和精确reverse；Core写入稳定`android:<sha256>`来源，Renderer设备入口、安装态、筛选和Request row Android图标已接线。拔线/offline时先停Core，不停止共享ADB Server或清理其他映射。
  - 当前交付：Desktop package随包当前平台ADB所需的Platform-Tools 37.0.1文件、NOTICE、已验证APK和manifest；正式发版必须指定私有Android Release asset、APK SHA-256和签名证书SHA-256，拒绝debug证书、换签和降级。具体边界见[发布架构](platform/release.md#21-android-apk-与-adb-runtime)。
  - 当前验证边界：Android JVM/lint、API35相关类、真实系统VPN/TUN、native长等待/关闭、真实ADB与缺失态安装、四主题安装/已安装parity、macOS package与artifact audit已有对应证据；未打包真实Electron已从产品UI完成安装、双端配对、Core/reverse、系统VPN、TUN请求进入Android Capture来源、手机停止、Desktop断开和正常退出，见[测试文档](platform/testing.md#android-usb接入当前验证)和[Android测试](../../Interceptor-Android/architecture/platform/testing.md#系统vpn重复停止与失败流reset)。emulator流程不替代物理USB或真机验收。
  - 当前parity缺口：最新全量566场景中，Android toolbar按钮使产品Import/Export触发器各左移33px，但默认Capture设计fixture只在`androidDesktopPreview`场景注入该按钮；`capture-{import,export}-menu{-dark}`共4场景24项位置差异，其余562场景全部零差异。该设计基准修正属于item 14，不纳入item 16提交。
  - 当前packaged步骤：最新正式签名Android `0.1.0` APK已进入macOS production package，manifest固定APK与签名摘要；artifact audit和完整App strict codesign通过。APK变化后已通过真实SecurityAgent管理员确认更新helper授权，当前package完整packaged smoke 1/1 Green；Main/Core/Worker正常退出，8888与39080空闲。
  - Android发布链：Android仓库保留fail-closed的本机正式签名Gradle任务；长期keystore和密码只保存在仓库外的本机安全存储。首个`v0.1.0` draft Release已上传唯一正式签名APK，Desktop私有asset下载路径与APK摘要已核对；两个只允许`workflow_dispatch`的Android workflow及5个签名Secrets已恢复，当前按用户要求不运行CI，draft仍未Publish。
  - ARM64环境：官方API35 x86_64 ps16k环境已完成16384页大小与JNI/HTTP/TLS/WS/DNS目标；仍缺无native bridge的ARM64/真实16KiB硬件，现有环境不能替代。
  - 剩余环境阻塞：物理USB拔线/重连；真实DHCP搜索域、NAT64及旧平台同步解析延迟停止；ARM64硬件和Windows最终包。自定义系统hosts已在专用可写API35 AVD通过真实解析验证并恢复原文件。缺对应环境时保持`blocked`，不伪造Network、修改第三方或绕过系统授权。
  - 恢复条件：连接并授权物理Android USB设备后执行拔线/重连与旧请求不重放；提供ARM64/真实16KiB设备、Windows x64环境及带DHCP搜索域或NAT64的专用网络后分别续验。提交边界不纳入item16 Guidebook、MCP workflow或其他共享修改。
  - 保存边界：用户已授权把本轮Android/PC实现保存为Item 14中间进度，不等于完整Item 14或release-ready；Android实现已提交并推送为[`dfc3f31`](https://github.com/zhxmt-xm/Interceptor-Android/commit/dfc3f31)，PC当前提交只包含item14，不纳入并行Guidebook/MCP修改。

- **17. E2E 契约、workflow 与用户教程对齐 · 进行中 · 待实现、待确认与待验证**
  - 目标：逐项把验收契约对应到可执行workflow的输入、操作、断言和适用证据，再对应用户教程；旧`planned`或文件存在都不能作为实现、运行或通过的结论。稳定契约与源码链接留在E2E README和`docs/`，这里只跟踪未完成部分。
  - 待实现：
    - `application.lifecycle.profile-isolation`：补完整的A/B profile主题、语言、Rules与Capture隔离流程。现有`settings/macos-upstream-proxy.workflow.ts`只核对跨profile上游与代理恢复，不能替代完整隔离契约。
    - `shell.appearance.language`：补15种语言逐项UI、布局与跨重启持久化矩阵。现有`application/guidebook-i18n.workflow.ts`和`settings/tools-preferences.workflow.ts`只有部分语言操作，不能替代完整矩阵；语言切换放独立i18n流程。
    - `capture.list.virtual-scroll`：补超过viewport/overscan的真实请求、有限DOM row、滚动选择、跨workspace保持及实时追加的跟随/不抢滚动断言。
  - 部分代码 · 待补齐契约断言：
    - `shell.navigation.workspaces`：`settings/navigation.workflow.ts`未把Guidebook加入工作区往返矩阵；旧规格仍写五个workspace，需要对齐现有六个入口和Header/Main/Statusbar。
    - `capture.inspector.resize`：`capture/section-collapse.workflow.ts`已有真实拖动和恢复，尚需最小/中间/最大尺寸及切换记录、tab和正文模式的边界断言。
    - `composer.send-failure`：`diagnostics/tools-queries-export.workflow.ts`已有真实连接失败和后续成功请求，尚需非法URL、无伪response、错误清除与History终态断言。
    - `diagnostics.pagination`：`diagnostics/tools-queries-export.workflow.ts`已有自产历史和Load earlier，尚需逐页keys、轮询插入、去重/无跳页和hasMore终态断言。
  - 待确认旧规格：
    - `rules.apply-conflict`：旧规格要求两个App共享RuleStore，与独立profile/listener边界不一致；现有`mcp/streamable-http.workflow.ts`已包含真实MCP第二写入者、Renderer草稿conflict和Reload。先按生产支持的入口对齐契约，再判断是否缺断言，不新增共享存储后门。
    - `composer.resize`：旧规格按左右请求/响应宽度描述，产品契约实际为上下请求/响应区域；`composer/response-section-collapse.workflow.ts`已有真实高度拖动。先对齐高度、最小尺寸和窗口缩放契约，再补极限边界。
    - `breakpoints.execute-edited`：旧Inventory与HTTP framing正文结论冲突；逐项核对当前origin实际headers/body断言和适用原始结果，未核实前保持待验证。
  - 已有相关workflow · 待逐项核对覆盖与有效验收，不能按旧`planned`重复开发：
    - Application/Shell：`application.startup.ready`、`application.lifecycle.graceful-close`对照共享driver；`shell.sidebar.collapse`、`shell.appearance.theme`、`shell.window.controls`对照`settings/navigation.workflow.ts`和`settings/tools-preferences.workflow.ts`，不能用夹带的启动/退出或部分主题操作替代完整契约。
    - Capture：`capture.proxy-readiness.resolve`、`capture.traffic.capture-select`、`capture.filter.keyword`、`capture.filter.structured`、`capture.filter.protocol`、`capture.facets-clear-menu`、`capture.inspector.body-modes`、`capture.protocols.without-mitm`、`capture.protocols.with-mitm`、`capture.clear`、`capture.transfer.har-roundtrip`、`capture.transfer.archive-roundtrip`，分别对照现有readiness、facets、body、TLS/WS/H2/gRPC和transfer流程；Tool往返不能自动算作普通UI契约完整覆盖。
    - Rules：`rules.load-search-select`、`rules.create-edit-delete`、`rules.matcher-variants`、`rules.action-variants`、`rules.reorder`、`rules.validate-apply`、`rules.runtime-hit`，对照`rules/{hierarchy-menus-status,root-toolbar,body-effect-evidence}.workflow.ts`及实际matcher/action正反例；Renderer Reload不能自动代替跨进程持久化。
    - Composer：`composer.request-edit`、`composer.send-success`、`composer.history-new`，对照`composer/{collection-tree-interactions,response-section-collapse,body-formatting,collection-import}.workflow.ts`，核对完整字段、response视图和New/History语义。
    - Breakpoints：`breakpoints.toggle`、`breakpoints.queue-select`、`breakpoints.continue-unmodified`、`breakpoints.drop`、`breakpoints.resize`、`breakpoints.websocket-close`，对照`breakpoints/{queue-commands,queue-isolation,execute-edited,websocket-close,original-body-layout}.workflow.ts`和Capture分栏流程。
    - Diagnostics：`diagnostics.list-detail`、`diagnostics.filters`、`diagnostics.export`、`diagnostics.resize`，对照`diagnostics/tools-queries-export.workflow.ts`，区分普通UI与Tool入口，并逐项核对过滤范围、时间线和脱敏文件。
    - Settings：`settings.proxy.enable-restore`、`settings.certificates.generate-delete`、`settings.certificates.trust`、`settings.certificates.https`、`settings.certificates.external-actions`、`settings.tls-compatibility`、`settings.privacy.defaults`，对照对应proxy、certificate、TLS及preferences流程；共享CA与平台授权前提分别核对，不复用不适用的旧产物结果。
  - 待实现 · 环境`blocked`：`settings.updates.download-open`和`settings.update-notification`缺Available→Download→校验→Open installer的真实workflow；需要可匿名访问的新正式Release和对应平台packaged App。现有`settings/updates-check.workflow.ts`只覆盖真实不可用/失败检查，不覆盖下载或通知。本项不授权发布Release、安装更新或绕过原生授权；具备前提后按E2E契约取消安装器并恢复环境。
  - Guidebook教程 · 待补充：Homepage的`docs/guidebook-coverage.md`尚未映射`shell.guidebook.online`、`shell.guidebook.i18n`，中英文`guidebook/{zh-CN,en}/workspace.md`缺App内Guidebook入口、阅读/搜索、图片、主题/语言同步、刷新/Retry和固定浏览器出口说明。两份真实workflow及E2E详细规格已存在，不重建测试；教程按用户操作归纳，不把i18n验收矩阵写成必做步骤。
  - Android边界：`capture.android.single-device`和`capture.android.disconnect`的物理设备实现、验收与教程素材归item 14；用户尚未明确恢复物理验收，不因本项对齐索引而执行USB、ARM64、Windows或Android CI。
  - 下一步：先解决旧契约歧义，逐项建立准确源码对应；仅补实际缺失的workflow/断言。代码存在但证据未核实标待验证，实际失败记录失败原因，平台/UAC/Release前提缺失标`blocked`。完成适用真实E2E、trace和退出/系统设置恢复后删除对应子项；原始结果保留运行产物，不在其他文档重建进度列。本轮只整理文档与缺口，不执行或宣称通过上述验收。
