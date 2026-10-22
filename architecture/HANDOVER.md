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

- **14. Android USB 流量接入 · 进行中 · 系统DNS续验**
  - 当前步骤：用户已要求继续item 14；从Android `6d5cc18`恢复系统DNS语义与取消验证，先补实际非VPN Network就绪门禁，再核对API26/API29/API35及资源释放。UI、未知流量、VPN断线策略与原生授权仍须明确确认，不把中间commit或组件验收标作完整手机功能。
  - 当前基线：PC协议副本接入及Core/Main装配已在`de46fad8`保存并推送；Android工程基线为`f6dddadb`。HTTP/1、TLS/明文H2、WS及压缩、本地DNS UDP/TCP、源站Network生命周期、Rules/Breakpoints/Capture已有对应组件证据；主流程仍未接系统VpnService/真实USB。
  - 暂停快照：Android新增测试与完整交接已另存并推送为[`6d5cc18`](https://github.com/zhxmt-xm/Interceptor-Android/commit/6d5cc18)，产品代码仍为上述工程基线；后续恢复以该快照和本item为准。
  - 当前DNS修正：Android已补实际Network就绪门禁；OriginDnsQuery正在收尾主Looper迟到回调导致崩溃、API29 Executor终止早于Thread实际退出两个边界。当前实现仍需API26/API29/API35最终复验；Private DNS尚未取得已验证provider地址，不能计为通过。暂停前仅测试编译及网络前提失败的事实见[暂停证据](../../Interceptor-Android/architecture/platform/testing.md#系统dns语义续验与暂停交接)，不混作产品Green。
  - 完整剩余：
    - 系统DNS取消与API26/API29、成功回答/hosts/搜索域/mDNS/NAT64/Private DNS矩阵；旧平台延迟停止，以及无界响应replacement原文取消仍待验证。
    - 全局native分发、Network选择/切换、真实TUN IPv4/IPv6/DNS、VpnService、前台通知和完整退出恢复。
    - 手机Launcher/连接状态/首次配对撤销/VPN与CA授权引导；Main USB/ADB/安装升级/reverse生命周期；Renderer设备入口和带Android图标的虚拟App来源/筛选。
    - 真实手机与Electron E2E、拔线重连、arm64/16KiB系统、最终打包smoke、签名分发及native构建本机路径问题；不以已有lab或旧APK审计替代。
  - 待确认：未知TCP与非DNS UDP/QUIC处理、PC/USB异常断线后的VPN策略、双端UI和系统授权。现有helper部署/原生授权仍是App验收阻塞，不自动批准或绕过；不修改Mockttp，不把手机原始TCP/DNS交PC转发。
  - 恢复入口：先沿[Android交接](../../Interceptor-Android/architecture/HANDOVER.md)收尾当前DNS目标，再以真实单设备VPN闭环为主线；不要重做已验协议或扩大多设备/无线范围。下方早期阶段仅保留历史事实/证据导航，“当前未接线”的旧描述不覆盖本段状态。
  - 保存边界：用户已明确授权将当前Android/PC实现保存为中间进度commit，不等于Item 14完成；Android源码已保存于[`f6dddad`](https://github.com/zhxmt-xm/Interceptor-Android/commit/f6dddadb9d40d5e7e5e7a46169a7396b4d15555e)。本次不纳入其他会话的教程、MCP、启动脚本或item22。最新系统DNS取消接线仍有平台/Private DNS待验项，完整App、真机与原生授权边界不改变。
  - 目标：Android 使用`VpnService`创建并读写TUN，经USB/`adb reverse`接入PC；每台手机作为带Android图标的虚拟App，复用PC的Rules、Breakpoints和Capture。
  - 范围：仅USB，不做局域网、无线adb或云中继；不把TUN当作VPN之外的可选补充，不以无VPN显式代理替代系统流量接管。
  - 当前协议能力：HTTP/WS正式控制、共享RuleService/Capture、握手/压缩、逐stream H2业务及双侧TLS ALPN已通过对应组件与真实native双端lab；H2已核对断点隔离、原始正文/trailers、提前响应、GOAWAY不重放和RST录制。边界见[正式H2联调](../../Interceptor-Android/architecture/platform/testing.md#正式native-h2双端lab)与[WS联调](../../Interceptor-Android/architecture/platform/testing.md#正式native-ws与tls压缩ws双端验收)，不代表VpnService、真实USB或完整App交付。
  - 当前可执行步骤：明文H2、PC改地址及[API26/API35与当前产物复核](../../Interceptor-Android/architecture/platform/testing.md#最低api26与当前h2产物复核)已收束，含API35正常堆完整容量、双APK审计与本轮资源清理；两平台测试源站模式明确区分，不冒充系统VpnService或真实USB，arm64/16KiB系统仍未验。下一步全局native flow接收/协议分发与Network/DNS生命周期；非HTTP/UDP和VPN断线策略仍需明确，UI及原生授权约束不变。Conscrypt保持独立上下文和Android信任策略，原执行器类名因Rename Symbol不可用且替代方式未获确认暂保留，不复制决定业务或添加兼容包装。
    - Android `OriginNetwork`源站socket生命周期已按目标Red接入，共同HTTP执行器可取消失效Network上的HTTP/H2/WS及pending PC决定；synthetic和回环控制不受影响。[调用方回归、实际API26/API35、双端lab、当前产物与清理](../../Interceptor-Android/architecture/platform/testing.md#源站network丢失与业务取消)已核对。下一段为DNS主动取消和全局native接入；非HTTP/UDP、UI与VPN断线策略仍未视为获批，完整App/E2E状态不改变。
    - [Android本地DNS](../../Interceptor-Android/architecture/platform/testing.md#android本地dns与native-udptcp进行中)已验证原目标UDP/TCP、native IPv4/IPv6、客户端TCP FIN/pipelining与取消；相关HTTP/WS、完整容量、API26/API35、双端lab、当前产物及清理已核对。下一步系统getAllByName主动取消、Private DNS与全局native/TUN接线，不默认批准未知TCP/UDP直连或阻断，完整App状态不改变。
    - [系统DNS取消边界](../../Interceptor-Android/architecture/platform/testing.md#系统dns取消边界待决定)已用实际API26/API35核对：PC及时收到取消、迟到解析结果不出站，但同步系统查询可能延迟收尾；不能记主动取消已实现。公开可取消DNS API从29提供，需确认最低版本/旧平台停止体验后再改架构；未擅自改resolver、强停线程或报告虚假停止，当前为待决定。
      - 当前已保存API29+普通域名公开取消接线；IP/hosts、搜索域、mDNS、NAT64及旧平台保留系统语义，API29对IPv6-only Network保守走系统入口。目标Red与API35阶段运行已有，提交前编译/JVM/lint通过；剩余API26/API29、Private DNS与名称解析矩阵仍待验证，见[中间进度边界](../../Interceptor-Android/architecture/platform/testing.md#item-14中间进度提交边界)，不将全部DNS标为可立即取消。
  - 当前步骤：私有[Interceptor-Android](https://github.com/zhxmt-xm/Interceptor-Android)已保存独立工程与唯一[架构方案](../../Interceptor-Android/architecture/features/usb-capture.md)，本地为`/Users/zhxmt/Desktop/Interceptor-Android`；本仓库不再维护方案副本。v2协议副本、HTTP/WS/H2、Android本地DNS及源站生命周期保留各自组件证据，PC仅返回决定；旧TCP/DNS中继与FIN失败保留为历史，不再作为接入方向。native bridge和双端lab不等于实际VpnService、首次配对或Main设备生命周期，Android单页设计仍待确认；首轮须交付真实TUN、USB、PC规则/断点与手机响应，不以lab或局部传输链替代。
  - 下一步：`CoreApplication`显式Android命令、共用录制开关、多Session Clear、Main RPC与退出排空已完成代码和组件验证；协议/Core/Desktop typecheck、本地package/产物审计/签名及真实双端组件回归通过，当前为“Core接线代码完成 · 待App验收”。真实Electron前置停在platform且Close超时；当前开发入口和新包的helper部署只读检查均为outdated，原生更新授权暂不可确认，不能默认批准或绕过检查。待用户可在正常App原生窗口确认授权后，重新协调8888独占窗口，执行相关workflow与packaged smoke；不占用其他会话的App窗口或修改其缓存包。身份参数不进入Renderer或Tool，不自动开启listener。ADB设备生命周期、来源、手机UI与VPN断线策略仍缺，详见Android repo的[Handover](../../Interceptor-Android/architecture/HANDOVER.md)。
    - 用户已明确确认协议副本方案：Android负责实际TCP/TLS/HTTP/WS及源站连接；PC只接收HTTP/WS副本并返回bypass、修改、构造响应或中断决定，不接收原始TCP、不修改Mockttp、不重复请求源站。每阶段决定、应用确认及双向取消见[双端协议](../../Interceptor-Android/architecture/features/inspection-protocol.md)。Core/Main RPC、正式Capture和native HTTP/WS已有对应层级证据；Main设备管理、完整设备生命周期、H2和产品UI仍缺，不能写手机功能完成。双端旧TCP/DNS入口/客户端已删除，保留历史证据，不保留兼容转发。
    - [AndroidIngressService](../apps/proxy-core/src/proxy-core/android-ingress/entry.ts)直接拥有v2 mTLS控制/HTTP协议副本listener，拒绝旧TCP/DNS路径；短期凭据、配额、心跳、取消和录制收尾沿用已验组件，不要求本机ProxyService监听。CoreApplication与Main RPC已接线；请求/响应断点关联真实Capture ID，暂停流量不伪造记录。组件证据及App阻塞见[Core接线验证](../../Interceptor-Android/architecture/platform/testing.md#core命令录制与退出接线)。正式配对、Android来源与设备生命周期仍未完成，不把打包审计或旧十五场景当作完整手机验收。
    - 原TCP入口联调曾发现上传FIN早于响应时返回空响应，独立[原始TCP前置回归](../apps/proxy-core/src/proxy-core/proxy/tests/integration/tcp-ingress.test.ts)与已保存证据保留。禁止以Mockttp patch解决本项；移除旧入口不当作历史FIN已修复。
    - 原始TCP接入方向已停止：旧独立定位的FIN Red保留为历史证据，不以修改Mockttp解决，也不把删除旧适配当作修复。Android新协议层仍须验证半关闭；新方案要求请求与响应生命周期独立，上传结束不取消等待响应。
    - Android本地HTTP/1读取已使用Netty公开codec实现并接入真实双端lab：保留headers顺序/大小写，PC放行后从实际Android socket输入增量发送源站和正文副本。TLS/H2/WS仍在完整引擎接线阶段，Go标准库/Gorilla能力probe不算正式引擎；具体边界见[协议读取验证](../../Interceptor-Android/architecture/platform/testing.md#android-http1增量读取与协议引擎准入)。
    - HTTP副本的`body.end`必须明确携带独立`trailers`，PC消费/记录后才确认；双端lab已验证实际源站trailers经Android原样送到PC，以及replacement不沿用原正文声明。仍待正式MITM/VPN、Capture及Main/Core装配；UI和断线策略尚无明确确认，未视为默认批准，证据边界见[trailers验证](../../Interceptor-Android/architecture/platform/testing.md#http-trailers双端传输)。
    - Android单笔HTTP/1编排已接到产品`Http1ExchangeExecutor`，源站TLS、请求replacement、提前响应部分上传、synthetic、取消和本地连接复用在真实PC lab验证；不再由androidTest重写请求业务。`body.stopped/discard`不放宽正常end完整性，request/response replacement共用窗口并正确处理迟到ACK；网络取消携带close/reset给连接所有者。证据与最低版本限制见[HTTP/1请求执行](../../Interceptor-Android/architecture/platform/testing.md#http1请求执行与提前响应结算)。
    - native读停止和上传中客户端RST已接HTTP executor；TLS/SNI通过产品TlsServerConnection直接处理native字节流，SNI域名触发PC规则及响应断点后，加密返回手机客户端。NativeTcpConnection已拥有主动reset与peer失败通知，PC reset在普通HTTP/TLS产生真实RST，客户端断开可取消尚未读取正文的请求断点；发布状态与启动/关闭交错亦已验证，见[关闭通知](../../Interceptor-Android/architecture/platform/testing.md#native主动reset与断开通知)。仍待生产连接分发、Host/target与原网络目标分离、Network/DNS、H2/WS与VpnService，再替换旧entry并接Main/Core/Capture；首次配对、无界响应replacement原文取消及真实TUN闭环未验收，见[Native输入](../../Interceptor-Android/architecture/platform/testing.md#native输入停止与完整http交互)与[TLS边界](../../Interceptor-Android/architecture/platform/testing.md#native-tlssni字节流与pc联调)。
    - PC HttpRecording已接正式CaptureService/队列，实际应用正文、BodyRuleEffect原文、应用确认后的规则审计、停止前缀、取消及Recording/Clear均已取得真实存储/WSS/Android验证，见[正式录制](../../Interceptor-Android/architecture/platform/testing.md#正式pc-capture录制与android联调)。这仍是组件与lab装配，CoreApplication/Main、Android来源图标和产品UI未接线。
    - Android已分开HTTP URL/Host与原IP/端口/TLS名称；未改scheme/host/port保持原目标，显式改地址才重新解析。Host/request-target恢复与原始路径字节保留已接产品，native TLS场景证明PC按HTTP authority命中规则、源站仍收到原SNI，见[目标恢复](../../Interceptor-Android/architecture/platform/testing.md#http-authority与原始request-target恢复)。当前待接生产native连接分发与Network/DNS，不改未确认的手机UI、系统VPN断线或非HTTP策略。
    - Http1NativeConnection已接管单连接HTTP/HTTPS循环及停止，原native场景不再由lab拼接执行器。HTTP复用、提前响应、断点RST、TLS/SNI/Host和reset已通过产品类及正式Capture验证，见[连接编排](../../Interceptor-Android/architecture/platform/testing.md#native-httphttps连接编排)。当前小步骤已完成验证与清理，整体仍待全局接收/协议分发、Network/DNS、Main/Core/VpnService和UI授权；不扩展新模块来推迟本步骤收尾。
    - Android已补HTTP/1响应writer与独立Keystore MITM CA；本地CA TLS输入经过PC规则/断点后，实际TLS client收到修改后的202和正文。只有CA/协议组件与跨端lab已验证，尚无VPN/native flow装配、系统CA安装或完整MITM listener，见[响应与CA验证](../../Interceptor-Android/architecture/platform/testing.md#android-http1响应与本地mitm-ca)。
    - DNS已实现控制会话鉴权的独立WSS、原始UDP查询及截断后的TCP重查，Android native UDP association复用同一业务客户端；验证边界见[DNS测试说明](../../Interceptor-Android/architecture/platform/testing.md#dns-wss与native-udp验证)。不将DNS lab通过当作VpnService或系统流量接管已完成。
  - 验收约束：必须使用真实Android设备与Electron验证规则、断点、协议及退出恢复；USB授权、VPN授权和CA信任分别处理，未验证的分支不得算作支持。

- **15. Cloudflare 受限部署与线上验收 · 待确认**
  - 目标：把已完成本地制作的官网部署到免费Cloudflare静态托管，先限制为本人或明确允许的成员访问，再按用户确认决定公开。源码仓库继续保持private，不要求购买域名或启用付费服务。
  - 当前：本地官网行为、素材来源与验证保留在[官网架构](../../Interceptor-Homepage/docs/architecture.md#真实首页素材)。尚无已验收的线上URL，账号授权和访问保护需要确认，不将先前OAuth失败等同于当前认证状态。
  - 步骤：按[受限部署约定](../../Interceptor-Homepage/docs/deployment.md#待执行受限部署与线上验收)先确认实际账号、保护范围与全部正式/预览地址，再连接本人的GitHub官网仓库或授权Wrangler部署；`Cloudflare account`必须确实限定账号成员，不能只选择项目所属账号。不得创建临时公开部署、擅自影响其他应用或靠网址未公布代替访问控制。
  - 验收：首页与教程深链/刷新、真实404、静态缓存、步骤索引及原图；获准账号能访问，匿名及未授权账号不能绕过保护，包括直接资源和预览地址。保留实际URL与浏览器证据，核对国内外线路和Google Fonts依赖，不承诺免费默认域名在大陆稳定快速。
  - 入口边界：下载、GitHub与feedback仍受私有产品仓库权限限制，需确认目标访客可用的入口；上线不会自动获得匿名下载权限。App iframe、主题语言衔接与登录会话转由item 16跟踪，不由普通网页可嵌入替代；正式公开、域名及任何付费操作另行确认。
  - 产品入口同步：本item验收真实官网URL及目标访客权限后，负责更新[英文README](../README.md)、[中文README](../README.zh-CN.md)的官网入口与GitHub Website，并核对首页、教程、下载和反馈的实际可达性。此前Website保持空白，README使用真实GitHub教程与Release入口；不使用占位网址，也不因接线自动公开仓库。

- **16. Guidebook 跨平台与隔离场景补图、App接入 · 暂停 / 英文补图待验证、其余环境blocked · 承接原item 9剩余范围**
  - 目标：在已交付的本机Guidebook和阅读器基础上，补齐尚无真实环境的功能步骤图与App入口；不是仅剩Windows，也不重新制作已核对的本机场景。
  - 教程约定：逐功能点保留用途、平台前提、真实操作、预期结果和限制；每个操作步骤对应真实App图，示例名称和值与同一次运行一致。原workflow通过[可选截图模式](../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)输出PNG，素材使用前独立审核，不再维护专用Guidebook制作/导入链路或要求视频；相似测试归纳成用户场景，不把fixture、内部故障注入或验收日志变成操作步骤。
  - 环境缺口：Windows/AppContainer/UAC与对应安装恢复及原生文件面板截图；隔离首次CA/证书生命周期；真实DNS/DHCP WPAD网络；其他实际外部MCP Host、模型凭据与服务授权；更新下载、校验、安装及系统原生流程。当前Copilot SDK Host的代表主线已有真实验证，不代表其他Host、全部Tool或商业模型服务；其余范围仍需对应环境与操作授权。
  - 当前步骤：按用户要求暂停执行并保存中间进度，不标记整项完成。[current-host workflow](../apps/desktop/tests/e2e-workflow-tests/workflows/mcp/current-host.workflow.ts)已补操作截图检查点；原`v0.1.1-alpha.1`签名Release与VS Code Copilot SDK Host的中文App主线已核对真实查询、正文、Deny/Allow/Auto、Composer、Clear及撤销，见[实际调用与恢复核对](../../../.copilot/session-state/110ad12a-fedc-47bb-9369-c786f9527723/files/item16-current-host/verified-current-host.json)。未修改产品代码、日常CA或helper部署，未将中文图发布到教程。
    - 入书缺口：按[English App图片约定](../../Interceptor-Homepage/docs/guidebook.md#当前图片调整目标)以初始`en-US`完成独立prepare，实际App语言为`en`，见[英文准备记录](../apps/desktop/test-results/item16-current-host-english-20261022/prepare/mcp-current-host.workflow.-27b65-a-retained-isolated-profile-macos/current-host-phase.json)。最近一次英文verify中，活跃SDK仍请求旧endpoint，公开start未进入ready；该次仅作为中断记录，不能算通过或采用其中图片。完整英文操作图、双语教程接入与页面检查仍待完成。
    - 续验前提：先取得用户继续授权及item22明确归还的App/8888窗口，核对共享截图契约、保留profile和Host实际连接，再按[英文恢复记录](../../../.copilot/session-state/110ad12a-fedc-47bb-9369-c786f9527723/files/item16-current-host-english/resume-verification.json)复用同一英文profile/Client执行原workflow。不要重复prepare、轮换凭据、停止会话、重启共享VS Code或以SDK Client替代真实Host；通过并审核原图、标注与同次示例后再接入双语教程。
    - 清理状态：中文流程的Client、profile和Host配置已清理，旧中文恢复命令已失效。英文流程Main/Core与8888/MCP端口已退出恢复，待启动的Host连接已取消；只保留英文独立profile与对应Host配置供续验，其他Server未改。英文Client最终撤销、profile及Host配置清理仍由后续成功verify负责。
  - App入口：此前的暂停继续有效。先完成item 15受限官网地址和访问会话验收，再经用户确认截图方案，实现无边框iframe、浏览器打开、主题/语言衔接、滚动与加载错误；不承诺离线阅读，不向远程页面暴露Preload或业务IPC。
  - 安全与版本：保留当前App语言，翻译只在独立i18n流程验证；只录本次App及其原生面板，先定位自有文件目录，不录桌面、其他应用、个人流量或凭据。保持日常CA和系统配置，不绕过锁屏/UAC/Gatekeeper，不以强杀替代恢复，不新增私有教程npm包或registry依赖。
  - Release限制：空Rules树删除后的Apply入口和受测Upgrade未进入pending等行为已如实说明；产品修复需要独立授权及对应Release，不用备用规则、隐藏API、篡改发布包或截图伪造功能。
  - 下一步：确认并取得一种可用环境，沿[功能映射](../../Interceptor-Homepage/docs/guidebook-coverage.md)与[规格索引](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)逐项操作、补图并验证正常退出、8888释放与宿主恢复；再推进下一个可执行环境。未提供环境或未解除暂停时保持blocked，不自动缩范围。
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
