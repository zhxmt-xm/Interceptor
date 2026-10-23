# Task List

> Tracked commit: `bc47fafb`
> Homepage guidebook: `cdee504`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`。

- **12. 推广方案与逐平台备稿、发布 · 待实现**
  - 目标：明确在哪个平台、面向谁、发布什么内容，并逐个平台准备完整材料后发布，不停留在渠道建议或通用模板。
  - 范围：评估 V2EX、掘金、B 站、Show HN、Reddit、DEV Community、YouTube、Product Hunt 及相关开源周刊等候选渠道，按受众、社区规则和准备成本确定发布顺序，不要求不加筛选地全部发布。
  - 交付：每个选定平台分别准备标题、正文、语言版本、真实截图或视频、官网/下载/GitHub 链接和必要的回复要点；内容针对平台和具体使用场景调整，不机械复制同一篇宣传稿。
  - 下一步：先完成渠道与帖子清单，再按顺序逐项备稿、核对发布规则、确认最终内容与账号授权并发布；正式外发使用已交付教程及 item 11、15 已就绪的资料与入口，未验收场景继续按 item 16 保留边界，本轮仅登记待办，不操作外部账号或对外发布。
  - 验收：每个选定渠道都有最终稿、素材和实际发布链接，并处理发布后的有效问题与反馈；发布链接及反馈记录保存在对应推广材料中，不把草稿算作已发布。账号、平台规则或人工操作阻塞时说明原因，继续其他可执行渠道。

- **14. Android USB 流量接入 · blocked · 自动可执行范围完成，待物理USB、ARM64、Windows及专用网络环境**
  - 目标：Android以`VpnService`创建TUN，经USB/`adb reverse`接入PC；Android唯一连接源站，PC复用Rules、Breakpoints和Capture，不接收原始TCP/DNS或重复请求源站。
  - 当前Android：全局TCP/UDP dispatcher、selected Network、双栈TUN、本地DNS、前台Service、Launcher、双端完整指纹、VPN/CA系统入口及断线保留阻断已实现。未知TCP发送RST，非DNS UDP/QUIC关闭；PC control断开后由手机本地停止恢复。
  - 当前Desktop/Core：Main拥有PC mTLS身份、ADB设备状态、APK版本/签名/摘要校验、缺失/升级安装、Core listener和精确reverse；Core写入稳定`android:<sha256>`来源，Renderer设备入口、安装态、筛选和Request row Android图标已接线。拔线/offline时先停Core，不停止共享ADB Server或清理其他映射。
  - 当前交付：Desktop package随包当前平台ADB所需的Platform-Tools 37.0.1文件、NOTICE、已验证APK和manifest；正式发版必须指定私有Android Release asset、APK SHA-256和签名证书SHA-256，拒绝debug证书、换签和降级。具体边界见[发布架构](platform/release.md#21-android-apk-与-adb-runtime)。
  - 当前验证边界：Android JVM/lint、API35相关类、真实系统VPN/TUN、native长等待/关闭、真实ADB与缺失态安装、四主题安装/已安装parity、macOS package与artifact audit已有对应证据；未打包真实Electron已从产品UI完成安装、双端配对、Core/reverse、系统VPN、TUN请求进入Android Capture来源、手机停止、Desktop断开和正常退出，见[测试文档](platform/testing.md#android-usb接入当前验证)和[Android测试](../../Interceptor-Android/architecture/platform/testing.md#系统vpn重复停止与失败流reset)。emulator流程不替代物理USB或真机验收。
  - 当前packaged步骤：已通过真实SecurityAgent管理员授权更新production helper；正式签名Android `0.1.0` APK已进入macOS production package，manifest固定APK与签名摘要。artifact audit、完整App strict codesign及packaged smoke均通过，Main/Core/Worker正常退出，8888与39080空闲。
  - Android发布链：Android仓库保留fail-closed的本机正式签名Gradle任务；长期keystore和密码只保存在仓库外的本机安全存储。首个`v0.1.0` draft Release已上传唯一正式签名APK，Desktop私有asset下载路径与APK摘要已核对；Android CI、GitHub签名Secrets和相关run已按当前要求移除，draft仍未Publish。
  - ARM64环境：官方API35 x86_64 ps16k环境已完成16384页大小与JNI/HTTP/TLS/WS/DNS目标；仍缺无native bridge的ARM64/真实16KiB硬件，现有环境不能替代。
  - 剩余环境阻塞：物理USB拔线/重连；真实DHCP搜索域、NAT64及旧平台同步解析延迟停止；ARM64硬件和Windows最终包。自定义系统hosts已在专用可写API35 AVD通过真实解析验证并恢复原文件。缺对应环境时保持`blocked`，不伪造Network、修改第三方或绕过系统授权。
  - 恢复条件：连接并授权物理Android USB设备后执行拔线/重连与旧请求不重放；提供ARM64/真实16KiB设备、Windows x64环境及带DHCP搜索域或NAT64的专用网络后分别续验。提交边界不纳入item16 Guidebook、MCP workflow或其他共享修改。
  - 保存边界：用户已授权把本轮Android/PC实现保存为Item 14中间进度，不等于完整Item 14或release-ready；Android实现已提交并推送为[`dfc3f31`](https://github.com/zhxmt-xm/Interceptor-Android/commit/dfc3f31)，PC当前提交只包含item14，不纳入并行Guidebook/MCP修改。

- **16. Guidebook 跨平台与隔离场景补图、App接入 · 进行中 · 代码完成，待真实E2E与package smoke · 承接原item 9剩余范围**
  - 目标：在已交付的本机Guidebook和阅读器基础上，补齐尚无真实环境的功能步骤图与App入口；不是仅剩Windows，也不重新制作已核对的本机场景。
  - 教程约定：逐功能点保留用途、平台前提、真实操作、预期结果和限制；每个操作步骤对应真实App图，示例名称和值与同一次运行一致。原workflow通过[可选截图模式](../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)输出PNG，素材使用前独立审核，不再维护专用Guidebook制作/导入链路或要求视频；相似测试归纳成用户场景，不把fixture、内部故障注入或验收日志变成操作步骤。
  - 环境缺口：Windows可见UAC、安装/升级与更新打开仍需对应系统策略和产物；隔离首次CA/证书生命周期；真实DNS/DHCP WPAD网络；其他实际外部MCP Host、模型凭据与服务授权。Windows AppContainer、当前VS Code Host五项Tool与原生Open/Save截图已有真实验证，不代表其他Host、全部Tool、商业模型或发布素材接入完成。
  - 当前Host入口：桌面正常解锁后，[调用入口](../apps/desktop/tests/e2e-workflow-tests/fixtures/runtime/workflow-mcp-client.ts)已通过17条真实workflow的SDK基线与当前Host路径；原[汇总证据](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/current-host-workflow-expansion.json)及[Windows补充证据](../../../.copilot/session-state/cab53ba7-29cc-4a1d-a698-254405325e80/files/item16-windows/verification.json)合计记录20次Host连接代际、41种Tool、189次实际调用。新增Windows AppContainer、Archive、Recording、系统代理与TLS后，69项范围为54项`passed`、15项`not-run`。每条均保留App审批、原生文件/证书窗口、真实流量或持久化断言、Main/Core正常退出和8888释放。
    - Host刷新：VS Code`1.143.0`/AHP`1.1.0`不会因`root/configChanged`让已有session立即采用新top-level MCP Server，AHP连接也不公开runtime的`session.mcp.reload`。fixture写入`configuration-applied`证据并输出无凭据提示后，当前Agent在一次性同Host session执行正式`/mcp reload`；Server随后真实公布`ready`、`mcp://`及`serverTools`。一次性session使用当前目录、不创建worktree，运行后全部删除；不以SDK直连、伪造state action或重启共享Host代替。
    - 协议差异：Tool撤权后SDK直连保持`-32602`，VS Code Host包装层实际返回含`MCP tool not found`的`-32603`；workflow分别断言真实结果，不改写错误码。实际AHP MCP请求仍使用`params.channel`；早先只读外部GitHub调用的SAML拒绝不算Interceptor验收。
    - 诊断清理：最初为定位刷新点在活动主session创建的`interceptor-e2e-turn-refresh-probe`已从root配置、runtime MCP目录及session公开state移除；最终只剩GitHub Server且为`ready`，未重启共享Host。后续正式workflow全部改用可删除的一次性session，验收后逐一删除。
    - 原生输入修正：`rules.tools.import`两次在MCP Client创建前暴露macOS Go To路径稳定截断，实际字段停在`.../interceptor-rul`。Unicode键盘事件由5ms调整为20ms，仍逐字符检查前台App、真实发送并由AX完整回读，不写AX值或共享剪贴板；修正后SDK与当前Host两条完整workflow均Green。前置失败与[恢复核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/rules-import-environment-recovery.json)保留，确认产品journal、App进程和8888无残留。
    - 原生选区修正：HAR未改SDK基线又暴露Save文件名全选后的即时读取和Escape清理不稳定；现轮询完整AX选区，并通过真实鼠标点击本轮`CancelButton`。失败轮次保留App和journal，取消所属面板后产品完成代理恢复及正常退出；修正后的HAR SDK与两代当前Host流程均Green。
    - Archive状态：`capture.tools.archive-transfer`的SDK及两代current-host均Green；Windows原生Save/Open在Host抢前台时通过owner线程关联、焦点与输入/取消/确认重试保持真实操作，结束后root配置、App、8888、journal和一次性session均清理。
    - 最终检查：17条SDK/Host真实workflow均已编译执行；Desktop typecheck通过。Windows补充验证覆盖AppContainer、Archive、Recording、系统代理、TLS、120行排序/筛选/布局及隐私处理原生文件面板PNG；各流程均正常Close、恢复宿主并释放8888。Design typecheck、先前全量既有Renderer parity及本轮workflow结果保持有效。
    - 原代表主线[英文核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/verified-current-host.json)仍保留；新7条workflow扩展不冒充全部69项Tool、其他Host或商业模型通过。
    - 图文状态：中英文各1082个编号步骤均已关联真实图片；69个连续说明明确复用最近的同流程原图，14个整节缺口由公开Release、Windows AppContainer/原生文件面板、Browser Host与现有Certificates实录补齐。[图片完成核对](../../../.copilot/session-state/cab53ba7-29cc-4a1d-a698-254405325e80/files/item16-guidebook-image-completion.json)记录0缺图、Homepage production build及29条Browser图片/导航/标注测试Green；尚未push或部署。
    - 发布约定：用户当前无法选择时，采用不新增Host自动操作的保守边界。[发布器](../scripts/guidebook-publish.mjs)与Start明确区分全部自动来源重拍和独立Host组校验保留；`retainedHostGroups`固定审核清单摘要，逐文件核对原图/标注、字节、尺寸及引用，不用SDK替代、不静默回退。现有自动来源、示例绑定与Host图片不互相覆盖，真实Start取消及代表原workflow生成见[发布核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/publication-generator-verification.json)；未把代表运行记为整批自动场景重跑。
    - 清理状态：中英文Client、profile与对应Host配置均已清理，旧恢复命令不再适用。英文Main/Core正常退出、8888/MCP端口释放和宿主恢复已核对；只移除本轮Host条目，其他Host设置未变，没有停止开发会话或重启共享VS Code。
  - App入口：[Guidebook App设计](../design-vite/src/features/GuidebookAppPreview/)已获用户确认；右侧导航下划线与字体已修正，[四主题24张最终评审图](../../../.copilot/session-state/cab53ba7-29cc-4a1d-a698-254405325e80/files/guidebook-app-design-final/)覆盖ready/loading/error/search/image及ready-full，并统一显示`www.interceptor.cn`。
    - 代码进度：Sidebar入口、在线工具栏、sandboxed iframe、固定官网CSP、主题/语言同步、搜索、错误重试和固定URL浏览器打开已落地；官网`embed=desktop`移除站点Header/Footer并保留目录、正文、搜索和大图。远程页面不获得Preload或业务IPC，不提供离线副本。
    - 自动验证：Desktop与Design typecheck、Guidebook/i18n 28条unit test、四主题Guidebook parity 40/40控件已通过。Homepage commit `9910448`已推送到`item16-guidebook-homepage`，lint/build及全量107条Browser测试在严格origin修正前通过，修正后的2条embed目标测试通过；受保护`main`仍需创建PR并通过`check`。
  - 安全与版本：保留当前App语言，翻译只在独立i18n流程验证；只录本次App及其原生面板，先定位自有文件目录，不录桌面、其他应用、个人流量或凭据。保持日常CA和系统配置，不绕过锁屏/UAC/Gatekeeper，不以强杀替代恢复，不新增私有教程npm包或registry依赖。
  - Release限制：空Rules树删除后的Apply入口和受测Upgrade未进入pending等行为已如实说明；产品修复需要独立授权及对应Release，不用备用规则、隐藏API、篡改发布包或截图伪造功能。
  - 15项`not-run`分类：
    - 可继续11项：gRPC消息查询、`rules_replace_tree`、`composer_probe_connection`、7项Breakpoint启停/处理及用户已排除原生专项的`settings_open_certificate_manager`。
    - 环境blocked 4项：证书生成/安装/卸载/删除需要空共享材料的隔离macOS用户或VM及正常系统授权，不能破坏日常CA。
  - 其他真正外部阻塞：DNS/DHCP WPAD需要授权的隔离网络与恢复保护；其他Host/商业模型缺目标、账号与服务使用授权；当前只有pre-release时稳定版更新REST入口仍按GitHub语义返回404。
  - 下一步：创建并合并Homepage PR、确认`www.interceptor.cn`部署后，执行Desktop全量parity、Guidebook真实Electron E2E、退出/8888恢复与package/security smoke；Green后删除本item。剩余current-host Tool与隔离环境不阻塞已完成的Guidebook图片，但继续保持`not-run/blocked`，不伪造为通过。
  - Windows当前边界：VS Code`1.143.1`/AHP`1.1.0`公开current-host入口已真实调用AppContainer五项Tool共18次，覆盖Ask/Auto、撤权、两代App和exemption精确恢复；Server停止、root配置移除及一次性session删除均核对。`settings.app-containers.ordering`以120行真实枚举完成enabled-first、筛选/恢复及布局验收，无写入/UAC。`composer.collection.import`通过真实Save/Open完成四张1800×1080原生面板PNG；截图只显示测试目录和basename，写盘前遮盖导航侧栏与地址breadcrumb，不记录桌面或个人路径。完整证据见[Windows核对](../../../.copilot/session-state/cab53ba7-29cc-4a1d-a698-254405325e80/files/item16-windows/verification.json)。
    - Windows恢复入口：AppContainer/current-host与原生文件面板无需重复；后续Windows工作只推进可见UAC、安装/升级、更新打开及与正式教程版本/语言的素材映射，各自仍需真实环境和恢复保护。
    - Windows发布边界：现有Homepage截图契约限定`0.1.1-alpha.1`、`darwin/x64`和`en-US`；Windows未打包workflow及本轮本地步骤图不能冒充该Release或直接覆盖macOS素材。版本/平台映射及双语接入未核对前不发布。
  - 已有基础：[教程目录](../../Interceptor-Homepage/guidebook/README.md)与[读取/媒体/恢复记录](../../Interceptor-Homepage/docs/guidebook.md)保留。当前本地预览为`http://127.0.0.1:4175/guide`；停止后在Homepage运行`npm run dev`恢复。后续修改按影响范围复验，不覆盖旧结果。
