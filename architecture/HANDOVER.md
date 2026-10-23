# Task List

> Tracked commit: `3181a324`
> Homepage guidebook: `20e4d1d`

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

- **14. Android USB 流量接入 · 进行中 · 本地双端E2E已验，待packaged授权、物理USB和正式签名验收**
  - 目标：Android以`VpnService`创建TUN，经USB/`adb reverse`接入PC；Android唯一连接源站，PC复用Rules、Breakpoints和Capture，不接收原始TCP/DNS或重复请求源站。
  - 当前Android：全局TCP/UDP dispatcher、selected Network、双栈TUN、本地DNS、前台Service、Launcher、双端完整指纹、VPN/CA系统入口及断线保留阻断已实现。未知TCP发送RST，非DNS UDP/QUIC关闭；PC control断开后由手机本地停止恢复。
  - 当前Desktop/Core：Main拥有PC mTLS身份、ADB设备状态、APK版本/签名/摘要校验、缺失/升级安装、Core listener和精确reverse；Core写入稳定`android:<sha256>`来源，Renderer设备入口、安装态、筛选和Request row Android图标已接线。拔线/offline时先停Core，不停止共享ADB Server或清理其他映射。
  - 当前交付：Desktop package随包当前平台ADB所需的Platform-Tools 37.0.1文件、NOTICE、已验证APK和manifest；正式发版必须指定私有Android Release asset、APK SHA-256和签名证书SHA-256，拒绝debug证书、换签和降级。具体边界见[发布架构](platform/release.md#21-android-apk-与-adb-runtime)。
  - 当前验证边界：Android JVM/lint、API35相关类、真实系统VPN/TUN、native长等待/关闭、真实ADB与缺失态安装、四主题安装/已安装parity、macOS package与artifact audit已有对应证据；未打包真实Electron已从产品UI完成安装、双端配对、Core/reverse、系统VPN、TUN请求进入Android Capture来源、手机停止、Desktop断开和正常退出，见[测试文档](platform/testing.md#android-usb接入当前验证)和[Android测试](../../Interceptor-Android/architecture/platform/testing.md#系统vpn重复停止与失败流reset)。emulator流程不替代物理USB或真机验收。
  - 当前packaged步骤 · blocked：新ad-hoc App CDHash要求真实管理员授权更新production helper；package和artifact audit通过，packaged smoke按系统授权边界停止，未留下App、8888或journal。用户需正常启动当前包并批准helper更新，再复跑smoke；不能输入、保存或绕过管理员凭据。
  - 剩余环境阻塞：物理USB拔线/重连、ARM64真机与原生16KiB硬件；自定义hosts、真实DHCP搜索域、NAT64及旧平台同步解析延迟停止；正式release key产生的Android APK资产和Windows最终包。缺对应环境时保持`blocked`，不伪造Network、修改第三方或绕过系统授权。
  - 下一步：用户完成当前package的helper管理员授权后复跑packaged smoke；有物理Android设备时执行拔线/重连和ARM64验收。自动可执行范围已完成，接下来逐文件审阅，仅提交item14文件并立即push；不纳入item16 Guidebook、MCP workflow或其他共享修改。
  - 保存边界：用户已授权把本轮Android/PC实现保存为Item 14中间进度，不等于完整Item 14或release-ready；Android实现已提交并推送为[`dfc3f31`](https://github.com/zhxmt-xm/Interceptor-Android/commit/dfc3f31)，PC当前提交只包含item14，不纳入并行Guidebook/MCP修改。

- **15. Cloudflare 受限部署与线上验收 · 待确认**
  - 目标：把已完成本地制作的官网部署到免费Cloudflare静态托管，先限制为本人或明确允许的成员访问，再按用户确认决定公开。源码仓库继续保持private，不要求购买域名或启用付费服务。
  - 当前：本地官网行为、素材来源与验证保留在[官网架构](../../Interceptor-Homepage/docs/architecture.md#真实首页素材)。尚无已验收的线上URL，账号授权和访问保护需要确认，不将先前OAuth失败等同于当前认证状态。
  - 步骤：按[受限部署约定](../../Interceptor-Homepage/docs/deployment.md#待执行受限部署与线上验收)先确认实际账号、保护范围与全部正式/预览地址，再连接本人的GitHub官网仓库或授权Wrangler部署；`Cloudflare account`必须确实限定账号成员，不能只选择项目所属账号。不得创建临时公开部署、擅自影响其他应用或靠网址未公布代替访问控制。
  - 验收：首页与教程深链/刷新、真实404、静态缓存、步骤索引及原图；获准账号能访问，匿名及未授权账号不能绕过保护，包括直接资源和预览地址。保留实际URL与浏览器证据，核对国内外线路和Google Fonts依赖，不承诺免费默认域名在大陆稳定快速。
  - 入口边界：下载、GitHub与feedback仍受私有产品仓库权限限制，需确认目标访客可用的入口；上线不会自动获得匿名下载权限。App iframe、主题语言衔接与登录会话转由item 16跟踪，不由普通网页可嵌入替代；正式公开、域名及任何付费操作另行确认。
  - 产品入口同步：本item验收真实官网URL及目标访客权限后，负责更新[英文README](../README.md)、[中文README](../README.zh-CN.md)的官网入口与GitHub Website，并核对首页、教程、下载和反馈的实际可达性。此前Website保持空白，README使用真实GitHub教程与Release入口；不使用占位网址，也不因接线自动公开仓库。

- **16. Guidebook 跨平台与隔离场景补图、App接入 · 进行中 · 英文Host、双语图文与7条复用workflow已验证，App候选及隔离前提待确认 · 承接原item 9剩余范围**
  - 目标：在已交付的本机Guidebook和阅读器基础上，补齐尚无真实环境的功能步骤图与App入口；不是仅剩Windows，也不重新制作已核对的本机场景。
  - 教程约定：逐功能点保留用途、平台前提、真实操作、预期结果和限制；每个操作步骤对应真实App图，示例名称和值与同一次运行一致。原workflow通过[可选截图模式](../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)输出PNG，素材使用前独立审核，不再维护专用Guidebook制作/导入链路或要求视频；相似测试归纳成用户场景，不把fixture、内部故障注入或验收日志变成操作步骤。
  - 环境缺口：Windows/AppContainer/UAC与对应安装恢复及原生文件面板截图；隔离首次CA/证书生命周期；真实DNS/DHCP WPAD网络；其他实际外部MCP Host、模型凭据与服务授权；更新下载、校验、安装及系统原生流程。当前Copilot SDK Host的代表主线已有真实验证，不代表其他Host、全部Tool或商业模型服务；其余范围仍需对应环境与操作授权。
  - 当前Host入口：桌面正常解锁后，[调用入口](../apps/desktop/tests/e2e-workflow-tests/fixtures/runtime/workflow-mcp-client.ts)已通过12条既有真实workflow的SDK基线与当前Host路径；[汇总证据](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/current-host-workflow-expansion.json)记录14次Host连接代际、26种Tool、109次实际调用，覆盖公开证书Reveal/View、语言/主题/导出隐私、Rules导入/导出、Composer Collection读写与导入/导出、Breakpoint批处理、Diagnostics查询/导出、Capture传输任务、正文导出及HAR导入/导出。与英文代表主线合并后，[69项范围表](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/native-tool-coverage-expanded.json)为39项`passed`、30项`not-run`；本轮新增19项并重验7项。每条均保留App审批、原生文件/证书窗口、真实流量或持久化断言、Main/Core正常退出和8888释放；对应12条SDK路径也Green。
    - Host刷新：VS Code`1.143.0`/AHP`1.1.0`不会因`root/configChanged`让已有session立即采用新top-level MCP Server，AHP连接也不公开runtime的`session.mcp.reload`。fixture写入`configuration-applied`证据并输出无凭据提示后，当前Agent在一次性同Host session执行正式`/mcp reload`；Server随后真实公布`ready`、`mcp://`及`serverTools`。一次性session使用当前目录、不创建worktree，运行后全部删除；不以SDK直连、伪造state action或重启共享Host代替。
    - 协议差异：Tool撤权后SDK直连保持`-32602`，VS Code Host包装层实际返回含`MCP tool not found`的`-32603`；workflow分别断言真实结果，不改写错误码。实际AHP MCP请求仍使用`params.channel`；早先只读外部GitHub调用的SAML拒绝不算Interceptor验收。
    - 诊断清理：最初为定位刷新点在活动主session创建的`interceptor-e2e-turn-refresh-probe`已从root配置、runtime MCP目录及session公开state移除；最终只剩GitHub Server且为`ready`，未重启共享Host。后续正式workflow全部改用可删除的一次性session，验收后逐一删除。
    - 原生输入修正：`rules.tools.import`两次在MCP Client创建前暴露macOS Go To路径稳定截断，实际字段停在`.../interceptor-rul`。Unicode键盘事件由5ms调整为20ms，仍逐字符检查前台App、真实发送并由AX完整回读，不写AX值或共享剪贴板；修正后SDK与当前Host两条完整workflow均Green。前置失败与[恢复核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/rules-import-environment-recovery.json)保留，确认产品journal、App进程和8888无残留。
    - 原生选区修正：HAR未改SDK基线又暴露Save文件名全选后的即时读取和Escape清理不稳定；现轮询完整AX选区，并通过真实鼠标点击本轮`CancelButton`。失败轮次保留App和journal，取消所属面板后产品完成代理恢复及正常退出；修正后的HAR SDK与两代当前Host流程均Green。
    - Archive阻塞：`capture.tools.archive-transfer`原SDK及接线后SDK均Green，但当前Host未取得完整Green；既有静态编排受本进程session消息工具额度阻塞，实验性auto session发现和Host期间原生Cancel焦点均未形成可靠闭环。按有界尝试约定已停止重跑，[阻塞与恢复记录](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/archive-host-blocker.json)确认未验证的Archive适配、auto发现与鼠标时序改动均撤回，root配置、App、8888、journal和一次性sessions已清理；不计入39项通过。
    - 最终检查：11条SDK/Host真实workflow均已编译执行；仓库同一tsconfig显式编译12个item16 TypeScript根文件为0诊断，Swift键盘驱动`swiftc -typecheck`通过。并发item14的Android接线收敛后，完整Desktop typecheck最终通过；其Android parity曾占用5199，本item未停止该PID，完成后端口自行释放。Design typecheck、先前全量既有Renderer parity及本轮workflow结果保持有效。
    - 原代表主线[英文核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/verified-current-host.json)仍保留；新7条workflow扩展不冒充全部69项Tool、其他Host或商业模型通过。
    - 图文状态：原[英文prepare](../apps/desktop/test-results/item16-current-host-english-20261022/prepare/mcp-current-host.workflow.-27b65-a-retained-isolated-profile-macos/current-host-phase.json)与[最终verify](../apps/desktop/test-results/item16-nonwindows-20261023/current-host-english/mcp-current-host.workflow.-e6da6-a-retained-isolated-profile-macos/)保留English App原图、标注及完整来源，实际语言为`en`。采用最终verify图片，同一Client、endpoint和实际调用一致；双语正文、全部旧锚点、编号绑定、实际图片加载及预览见[阅读页核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/reader-verification.json)。旧endpoint的中断图片不采用，尚未推送或部署。
    - 发布约定：用户当前无法选择时，采用不新增Host自动操作的保守边界。[发布器](../scripts/guidebook-publish.mjs)与Start明确区分全部自动来源重拍和独立Host组校验保留；`retainedHostGroups`固定审核清单摘要，逐文件核对原图/标注、字节、尺寸及引用，不用SDK替代、不静默回退。现有自动来源、示例绑定与Host图片不互相覆盖，真实Start取消及代表原workflow生成见[发布核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/publication-generator-verification.json)；未把代表运行记为整批自动场景重跑。
    - 清理状态：中英文Client、profile与对应Host配置均已清理，旧恢复命令不再适用。英文Main/Core正常退出、8888/MCP端口释放和宿主恢复已核对；只移除本轮Host条目，其他Host设置未变，没有停止开发会话或重启共享VS Code。
  - App入口：默认关闭的[Guidebook App候选](../design-vite/src/features/GuidebookAppPreview/)已生成并审阅[四主题48张评审图](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/guidebook-app-final/)，包含32张framed和16张full；复用现有Window Header/Sidebar/状态栏，拟议Settings上方入口、在线工具栏、无外框阅读区及加载/错误/搜索/大图状态，不改产品Renderer或正式设计基准。
    - 弹层修正：补核对发现大图打开时`Cmd+K`会叠加搜索；已按线上阅读页的可见dialog/输入法/Alt修饰键边界修正入口，保留[实际失败画面](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/guidebook-app-overlay-interactions/image-shortcut-before.png)与[修正验证](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/guidebook-app-overlay-verification.json)。完整直接交互和Design typecheck通过，8张受影响的四主题图已重新生成并逐张审阅；原始像素差异保留，不记为严格parity通过。
    - 验证：Design与Desktop typecheck通过；[最新直接交互核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/guidebook-app-overlay-interactions/verification.json)覆盖键盘导航、正文滚轮/键盘滚动、目录跟随、搜索与空态、弹层互斥、快捷键修饰键、图片缩放拖拽/关闭/焦点和阅读位置恢复、重试、四主题背景/宽度、窄容器、返回Settings及原Homepage搜索/目录。图片尺寸与位置在动画结束后测量，不把打开动画当作缩放或拖动。只算设计预览，不算产品E2E或Renderer parity。
    - 默认外壳验收：[既有Renderer全量元素数据parity](../apps/desktop/test-results/item16-nonwindows-20261023/shared-shell-parity/report.md)一次连续运行554/554场景、4297/4297控件，差异、缺失、歧义、不稳定和执行错误均为0，退出码0；[输入与退出核对](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/parity-verification.json)确认957份输入无新增、删除或字节变化，5199与8888空闲。保留Vite未来`configLoader: 'native'`兼容性提示，未屏蔽提示或改构建配置。该结果只覆盖已有Renderer与候选默认关闭时的设计基准，不包含尚未实施的Guidebook产品页面；未启动Electron/Main/Core或操作系统设置，不能替代真实E2E。09:15只读检查桌面仍锁定。
    - 比对：47张最终候选图与已审阅图逐像素一致，dark大图的2个差异像素已复核。默认外壳首次light整图存在151个差异像素，同源复拍与原图完全一致，其他三主题及四处Header图一致；[原始差异和复拍证据](../../../.copilot/session-state/45191cff-dea3-4a02-97b4-515d33bd7ef1/files/item16/guidebook-app-final-verification.json)全部保留，不用容差或重拍结果掩盖首次差异，不计为严格parity通过。
    - 待确认：已提供逐组件位置/内容清单、改前及拟议效果图，用户当前无法确认，候选继续默认关闭。继续授权不替代item 15受限官网地址和访问会话验收，也不替代明确UI确认；候选仅使用本地Homepage例图，不能冒充真实iframe或登录验收。不承诺离线阅读，不向远程页面暴露Preload或业务IPC。
  - 安全与版本：保留当前App语言，翻译只在独立i18n流程验证；只录本次App及其原生面板，先定位自有文件目录，不录桌面、其他应用、个人流量或凭据。保持日常CA和系统配置，不绕过锁屏/UAC/Gatekeeper，不以强杀替代恢复，不新增私有教程npm包或registry依赖。
  - Release限制：空Rules树删除后的Apply入口和受测Upgrade未进入pending等行为已如实说明；产品修复需要独立授权及对应Release，不用备用规则、隐藏API、篡改发布包或截图伪造功能。
  - 30项`not-run`分类：
    - 可继续13项：`capture_start_recording`、WebSocket/gRPC消息查询、`rules_replace_tree`、`composer_probe_connection`、7项Breakpoint启停/处理及`settings_open_certificate_manager`；它们不是环境blocked，只是本进程的Host消息工具额度已耗尽，需要新的可靠Host编排轮次。
    - 条件执行6项：系统代理启用/恢复、TLS insecure/passthrough替换、HTTPS解密启停；产品有恢复保护，但需外部代理快照稳定且独占8888，不能在其他代理工具切换期间执行。
    - 测试编排blocked 2项：Archive导入/导出SDK Green，当前Host因消息编排额度和原生Cancel焦点未取得Green；适配已撤回。
    - 环境blocked 4项：证书生成/安装/卸载/删除需要空共享材料的隔离macOS用户或VM及正常系统授权，不能破坏日常CA。
    - Windows-only 5项：AppContainer查询和单项/全量启停，按用户要求本轮排除。
  - 其他真正外部阻塞：DNS/DHCP WPAD需要授权的隔离网络与恢复保护；其他Host/商业模型缺目标、账号与服务使用授权；固定匿名更新入口仍HTTP404且仓库private；App入口等待item 15受限真实URL/访问会话与明确UI确认。
  - 下一步：Body与HAR已验证同一workflow两代App和两次明确Host刷新；Archive保持SDK范围。新Host编排轮次可先继续上述13项普通Tool，再在代理快照稳定窗口执行6项系统设置Tool。其余外部前提满足后沿[功能映射](../../Interceptor-Homepage/docs/guidebook-coverage.md)与[规格索引](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)续验。
  - 已有基础：[教程目录](../../Interceptor-Homepage/guidebook/README.md)与[读取/媒体/恢复记录](../../Interceptor-Homepage/docs/guidebook.md)保留。当前本地预览为`http://127.0.0.1:4175/guide`；停止后在Homepage运行`npm run dev`恢复。后续修改按影响范围复验，不覆盖旧结果。

## 验证证据

- 教程远端发布工具：[使用与验收边界](development.md#全部教程截图与homepage发布)覆盖`npm start`入口、明确映射、失败停止和GitHub API限定提交；[代表性真实图片提交](https://github.com/zhxmt-xm/Interceptor-Homepage/commit/09c2ded2ecd588d013bf6a92c4f7bc086fce0c8b)及[远端文件核对](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/representative-publication/remote-verification.json)保留完整来源、双语值与精确文件边界。发布器核对远端SHA成功后即结束，不等待既有网站CI。该验收不等于单次60条App全量回归通过，失败/中断及独立CI结果保留；本轮App与测试端口无残留，未强推或改写并发历史。

- Rules标题无框：[前置差异](../../../Users/zhang/.copilot/session-state/12b79f71-ccdb-4a1c-92e1-9fe1541fd0fd/files/rules-title-borderless-red-final/report.md)与[最终数据parity](../../../Users/zhang/.copilot/session-state/12b79f71-ccdb-4a1c-92e1-9fe1541fd0fd/files/rules-title-green-final/report.md)覆盖四主题的默认、hover、focus、长名称和失焦，以及Rules相关场景；Rules Store基线、Desktop/Design typecheck通过。本次产品仅改CSS，未改重命名、键盘事件或保存契约，不新增或重跑真实E2E；原workflow保持不变，不将本轮结果冒充Main/Core退出或宿主恢复证据。用户已有App及8888监听保持原状，parity自有服务已退出。

- README图文：[素材来源](assets/readme-media.json)、[文档与媒体核对](../../../.copilot/session-state/5e6be39b-a22a-4e7d-8a4b-8f5424099e40/files/item11/documentation-verification.json)、[双语主题与尺寸预览](../../../.copilot/session-state/5e6be39b-a22a-4e7d-8a4b-8f5424099e40/files/item11/browser-verification.json)及[GitHub渲染核对](../../../.copilot/session-state/5e6be39b-a22a-4e7d-8a4b-8f5424099e40/files/item11/github-markdown-verification.json)。只验证文档与已有素材，不替代产品E2E或官网访问验收；官网入口同步归item 15，私有仓库访问限制保留。

- 教程编号图文、English App图片与原页预览：[验证说明](../../Interceptor-Homepage/docs/guidebook.md#当前图片调整目标)覆盖中英14章、1136张不同英文图和0张旧图；[最终Browser](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/guidebook-final-browser.json)34项全部通过，build/typecheck与限定Biome通过。[原图/标注核对](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/published-image-verification.json)保留完整字节、自然尺寸、全部原显式锚点及双语图序。
  - [早期布局对照](../../Interceptor-Homepage/commit-changes/202610202002_ui_guidebook_operation-guides.html)保留正文、外壳与目录的变化；维护说明不进入读者正文。最后相关Main/Core正常退出、宿主恢复与8888释放已验证，App窗口已归还Android会话；临时4176已释放，原4175预览保持。Windows、独立环境和App嵌入仍由item 16跟踪，本项不部署。
  - 截图合成器的`sharp@0.35.5`仅作为Desktop开发依赖，清单与对应锁文件已补齐；[依赖闭包核对](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/sharp-followup-index-verification.json)确认只包含该依赖的30项锁记录，排除Android/Core条目。Desktop typecheck与[原生PNG完整像素往返](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/sharp-followup-native-verification.json)通过；受测源码及工作区依赖字节未变，不以本次依赖检查替代此前真实workflow验收。

- Start截图入口：[真实TTY验收](../apps/desktop/test-results/start-screenshots-20261019/verification.json)覆盖`npm start → Test → E2E`的普通/逐步截图、返回与取消；两次均运行原Composer格式化workflow，不手写截图参数。
  - 截图自动进入独立运行目录，7张PNG的尺寸及SHA-256符合清单；普通运行不生成步骤图，保留原trace/final.png，前次截图运行的31个文件逐字节不变。两代均正常Close、Main/Core退出，宿主guard通过，8888实际bind/close可用；没有强杀。
  - 目标为既有签名macOS Release `0.1.1-alpha.1`；本次未重跑默认prepare/build或Windows。原92个workflow文件集合保持，65个Guidebook专用workflow及制作/导入入口已移除；官网图文和PNG保留。当前说明见[截图约定](../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)；此前官网Browser结论保持其原快照范围，未由本次CLI验收覆盖。
  - 提交前Desktop与Homepage typecheck、限定diff及CLI语法检查通过；Homepage lint无错误，两份内嵌原图的HTML超过Biome大小上限而跳过，其中本项说明已直接用Browser检查1360/390宽度、6张原图、全部展开状态与红框位置。该阶段的截图对照保留在[历史记录](../../Interceptor-Homepage/commit-changes/202610192304_ui_guidebook_step-images.html)，不作为报告生成或维护要求。

## 验收约束

- 已发布版本不作为待办保留；发布结果与证据见[当前发行验证边界](platform/release.md#7-当前发行验证边界)。下载产物的各平台实机验收仍未完成，不能将CI、发布或本机包验证替代这些证据；private仓库的匿名读取限制不因Publish消失。
- AppContainer写入与顺序仍依赖Windows及对应的真实运行环境，不能用macOS结果代替。
- AppContainer原生枚举曾在CI超过默认5000ms，同SHA复跑通过但未单独定位原因；没有修改helper或放宽超时，不把该风险记为已修复，证据保留在上述验证边界。
- 空共享CA目录的证书生命周期专项、独立DNS/DHCP WPAD lab及实际MCP Host验收仍需各自前提；Windows WPAD现有范围见[Settings证据](features/settings.md#windows-wpad-research)，后续复验仍需隔离环境。没有执行的范围不能因Release发布而改写为通过，不删除日常CA凑测试条件。
- 原生安装、Gatekeeper、钥匙串与helper授权保留真实系统流程；不删除quarantine、关闭全局安全策略或用强杀代替退出恢复。
- 生产依赖审计与开发工具链告警分别报告，DMG、extract-zip及patch-package的开发依赖公告不能算作已经修复；边界见[发布与依赖约束](platform/release.md#依赖升级约束)。
