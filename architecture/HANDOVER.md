# Task List

> Tracked commit: `8b61748f`
> Homepage guidebook: `9c104e0`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`。

- **11. README 与 GitHub 仓库介绍优化 · 待实现**
  - 目标：用简单、直接、清楚的图文或视频说明 App 的用途和价值，覆盖每个重要 feature，同时让 GitHub 仓库介绍包含足够准确的产品与搜索信息。
  - 范围：同步优化[英文 README](../README.md)和[中文 README](../README.zh-CN.md)，按重要 feature 配简明介绍及真实截图或视频入口；保留清楚的下载、快速上手、权限与隐私说明，详细操作链接已交付的 guidebook，剩余验收由 item 16 跟踪，官网入口使用 item 15 验收后的实际地址。
  - 仓库信息：更新 GitHub About/Description、Website 和 Topics；简介在平台长度限制内明确产品类别、适用人群与核心能力，关键词与实际支持的功能一致，不堆砌无关搜索词。
  - 下一步：先梳理重要 feature 和搜索关键词，准备中英文文案及媒体对应表，再更新 README 和仓库元数据；素材、官网与下载信息按对应 item 的实际交付同步，不使用占位链接作为最终结果。
  - 验收：中英文信息一致，重要 feature 无遗漏，GitHub 页面中的图片、视频入口和链接可用；仓库简介、Topics、官网与 Release 的实际能力及平台说明一致。

- **12. 推广方案与逐平台备稿、发布 · 待实现**
  - 目标：明确在哪个平台、面向谁、发布什么内容，并逐个平台准备完整材料后发布，不停留在渠道建议或通用模板。
  - 范围：评估 V2EX、掘金、B 站、Show HN、Reddit、DEV Community、YouTube、Product Hunt 及相关开源周刊等候选渠道，按受众、社区规则和准备成本确定发布顺序，不要求不加筛选地全部发布。
  - 交付：每个选定平台分别准备标题、正文、语言版本、真实截图或视频、官网/下载/GitHub 链接和必要的回复要点；内容针对平台和具体使用场景调整，不机械复制同一篇宣传稿。
  - 下一步：先完成渠道与帖子清单，再按顺序逐项备稿、核对发布规则、确认最终内容与账号授权并发布；正式外发使用已交付教程及 item 11、15 已就绪的资料与入口，未验收场景继续按 item 16 保留边界，本轮仅登记待办，不操作外部账号或对外发布。
  - 验收：每个选定渠道都有最终稿、素材和实际发布链接，并处理发布后的有效问题与反馈；发布链接及反馈记录保存在对应推广材料中，不把草稿算作已发布。账号、平台规则或人工操作阻塞时说明原因，继续其他可执行渠道。

- **13. 教程全局搜索 · 待实现 · Guidebook完成后启动**
  - 目标：在教程中跨章节搜索内容，按关键词找到相关说明，并定位到对应章节或步骤。
  - 前置：先完成原Guidebook交付（未验范围转由item 16跟踪），再启动本项；不并入当前阅读性能修复。
  - 下一步：Guidebook完成后确认搜索范围与交互，按设计确认、实现和Browser验收推进；当前只登记待办，不添加搜索入口、索引或依赖。

- **14. Android USB 流量接入 · 待确认 · 本轮仅授权架构文档**
  - 目标：Android 使用`VpnService`创建并读写TUN，经USB/`adb reverse`接入PC；每台手机作为带Android图标的虚拟App，复用PC的Rules、Breakpoints和Capture。
  - 范围：仅USB，不做局域网、无线adb或云中继；不把TUN当作VPN之外的可选补充，不以无VPN显式代理替代系统流量接管。
  - 当前步骤：[架构方案](features/android.md)已记录双端职责、映射隔离、协议、来源、证书、断线与实施验收边界；未引入依赖、修改产品或执行真机验收，不代表功能可用。
  - 下一步：先确认TUN库与Android平台范围、异常断线和非DNS UDP策略、adb交付方式及具体UI；取得实现授权后补workflow规格和所需前置Red，再进入单设备闭环。
  - 验收约束：必须使用真实Android设备与Electron验证规则、断点、协议及退出恢复；USB授权、VPN授权和CA信任分别处理，未验证的分支不得算作支持。

- **15. Cloudflare 受限部署与线上验收 · 待确认**
  - 目标：把已完成本地制作的官网部署到免费Cloudflare静态托管，先限制为本人或明确允许的成员访问，再按用户确认决定公开。源码仓库继续保持private，不要求购买域名或启用付费服务。
  - 当前：本地官网行为、素材来源与验证保留在[官网架构](../../Interceptor-Homepage/docs/architecture.md#真实首页素材)，[同一item改动说明](../../Interceptor-Homepage/commit-changes/202610141539_ui_homepage_initial-progress.html#homepage-real-media-20261017)保留前后画面。尚无已验收的线上URL，账号授权和访问保护需要确认，不将先前OAuth失败等同于当前认证状态。
  - 步骤：按[受限部署约定](../../Interceptor-Homepage/docs/deployment.md#待执行受限部署与线上验收)先确认实际账号、保护范围与全部正式/预览地址，再连接本人的GitHub官网仓库或授权Wrangler部署；`Cloudflare account`必须确实限定账号成员，不能只选择项目所属账号。不得创建临时公开部署、擅自影响其他应用或靠网址未公布代替访问控制。
  - 验收：首页与教程深链/刷新、真实404、静态缓存、步骤索引及原图；获准账号能访问，匿名及未授权账号不能绕过保护，包括直接资源和预览地址。保留实际URL与浏览器证据，核对国内外线路和Google Fonts依赖，不承诺免费默认域名在大陆稳定快速。
  - 入口边界：下载、GitHub与feedback仍受私有产品仓库权限限制，需确认目标访客可用的入口；上线不会自动获得匿名下载权限。App iframe、主题语言衔接与登录会话转由item 16跟踪，不由普通网页可嵌入替代；正式公开、域名及任何付费操作另行确认。

- **16. Guidebook 跨平台与隔离场景补图、App接入 · blocked / 待确认 · 承接原item 9剩余范围**
  - 目标：在已交付的本机Guidebook和阅读器基础上，补齐尚无真实环境的功能步骤图与App入口；不是仅剩Windows，也不重新制作已核对的本机场景。
  - 教程约定：逐功能点保留用途、平台前提、真实操作、预期结果和限制；每个操作步骤对应真实App图，示例名称和值与同一次运行一致。原workflow通过[可选截图模式](../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)输出PNG，素材使用前独立审核，不再维护专用Guidebook制作/导入链路或要求视频；相似测试归纳成用户场景，不把fixture、内部故障注入或验收日志变成操作步骤。
  - 环境缺口：Windows/AppContainer/UAC与对应安装恢复及原生文件面板截图；隔离首次CA/证书生命周期；真实DNS/DHCP WPAD网络；实际外部MCP Host、模型凭据与服务授权；更新下载、校验、安装及系统原生流程。需要用户提供对应环境和操作授权，本机结果不能替代。
  - App入口：此前的暂停继续有效。先完成item 15受限官网地址和访问会话验收，再经用户确认截图方案，实现无边框iframe、浏览器打开、主题/语言衔接、滚动与加载错误；不承诺离线阅读，不向远程页面暴露Preload或业务IPC。
  - 安全与版本：保留当前App语言，翻译只在独立i18n流程验证；只录本次App及其原生面板，先定位自有文件目录，不录桌面、其他应用、个人流量或凭据。保持日常CA和系统配置，不绕过锁屏/UAC/Gatekeeper，不以强杀替代恢复，不新增私有教程npm包或registry依赖。
  - Release限制：空Rules树删除后的Apply入口和受测Upgrade未进入pending等行为已如实说明；产品修复需要独立授权及对应Release，不用备用规则、隐藏API、篡改发布包或截图伪造功能。
  - 下一步：确认并取得一种可用环境，沿[功能映射](../../Interceptor-Homepage/docs/guidebook-coverage.md)与[规格索引](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)逐项操作、补图并验证正常退出、8888释放与宿主恢复；再推进下一个可执行环境。未提供环境或未解除暂停时保持blocked，不自动缩范围。
  - 已有基础：[教程目录](../../Interceptor-Homepage/guidebook/README.md)、[读取/媒体/恢复记录](../../Interceptor-Homepage/docs/guidebook.md)及两个仓库原有改动报告保留。当前本地预览为`http://127.0.0.1:4175/guide`；停止后在Homepage运行`npm run dev`恢复。后续修改按影响范围复验，不覆盖旧结果。

## 验证证据

- 教程编号图文、English App图片与原页预览：[验证说明](../../Interceptor-Homepage/docs/guidebook.md#当前图片调整目标)覆盖中英14章、1136张不同英文图和0张旧图；[最终Browser](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/guidebook-final-browser.json)34项全部通过，build/typecheck与限定Biome通过。[原图/标注核对](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/published-image-verification.json)保留完整字节、自然尺寸、全部原显式锚点及双语图序。
  - [早期布局对照](../../Interceptor-Homepage/commit-changes/202610202002_ui_guidebook_operation-guides.html)保留正文、外壳与目录的变化；维护说明不进入读者正文。最后相关Main/Core正常退出、宿主恢复与8888释放已验证，App窗口已归还Android会话；临时4176已释放，原4175预览保持。Windows、独立环境和App嵌入仍由item 16跟踪，本项不部署。
  - 截图合成器的`sharp@0.35.5`仅作为Desktop开发依赖，清单与对应锁文件已补齐；[依赖闭包核对](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/sharp-followup-index-verification.json)确认只包含该依赖的30项锁记录，排除Android/Core条目。Desktop typecheck与[原生PNG完整像素往返](../../../.copilot/session-state/1d972f24-fe28-435a-8aa3-c05fc62af77f/files/english-guidebook/sharp-followup-native-verification.json)通过；受测源码及工作区依赖字节未变，不以本次依赖检查替代此前真实workflow验收。

- Start截图入口：[真实TTY验收](../apps/desktop/test-results/start-screenshots-20261019/verification.json)覆盖`npm start → Test → E2E`的普通/逐步截图、返回与取消；两次均运行原Composer格式化workflow，不手写截图参数。
  - 截图自动进入独立运行目录，7张PNG的尺寸及SHA-256符合清单；普通运行不生成步骤图，保留原trace/final.png，前次截图运行的31个文件逐字节不变。两代均正常Close、Main/Core退出，宿主guard通过，8888实际bind/close可用；没有强杀。
  - 目标为既有签名macOS Release `0.1.1-alpha.1`；本次未重跑默认prepare/build或Windows。原92个workflow文件集合保持，65个Guidebook专用workflow及制作/导入入口已移除；官网图文和PNG保留。当前说明见[截图约定](../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)；此前官网Browser结论保持其原快照范围，未由本次CLI验收覆盖。
  - 提交前Desktop与Homepage typecheck、限定diff及CLI语法检查通过；Homepage lint无错误，两份内嵌原图的HTML超过Biome大小上限而跳过，其中本项说明已直接用Browser检查1360/390宽度、6张原图、全部展开状态与红框位置。两仓只维护[同一份改动说明](../../Interceptor-Homepage/commit-changes/202610192304_ui_guidebook_step-images.html)，不恢复其他任务已删除的历史报告。

## 验收约束

- 已发布版本不作为待办保留；发布结果与证据见[当前发行验证边界](platform/release.md#7-当前发行验证边界)。下载产物的各平台实机验收仍未完成，不能将CI、发布或本机包验证替代这些证据；private仓库的匿名读取限制不因Publish消失。
- AppContainer写入与顺序仍依赖Windows及对应的真实运行环境，不能用macOS结果代替。
- AppContainer原生枚举曾在CI超过默认5000ms，同SHA复跑通过但未单独定位原因；没有修改helper或放宽超时，不把该风险记为已修复，证据保留在上述验证边界。
- 空共享CA目录的证书生命周期专项、独立DNS/DHCP WPAD lab及实际MCP Host验收仍需各自前提；Windows WPAD现有范围见[Settings证据](features/settings.md#windows-wpad-research)，后续复验仍需隔离环境。没有执行的范围不能因Release发布而改写为通过，不删除日常CA凑测试条件。
- 原生安装、Gatekeeper、钥匙串与helper授权保留真实系统流程；不删除quarantine、关闭全局安全策略或用强杀代替退出恢复。
- 生产依赖审计与开发工具链告警分别报告，DMG、extract-zip及patch-package的开发依赖公告不能算作已经修复；边界见[发布与依赖约束](platform/release.md#依赖升级约束)。
