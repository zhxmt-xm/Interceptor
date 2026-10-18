# Task List

> Tracked commit: `702f2a3c`
> Homepage guidebook: `b044362`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`，改动说明写入对应`commit-changes/`文件。

- **9. 完整 Guidebook 与逐 feature Guide Video · 进行中 · 中英正文、真实素材与阅读性能进度已保存，待剩余内容及媒体验收**
  - 目标：提供一本面向用户的完整 guidebook 和每个 feature 对应的 guide video，让用户不必阅读大量 workflow，也能按步骤掌握每个功能点。
  - 范围：以[功能设计](features/)、[workflow 规格索引](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)和[workflow 源码](../apps/desktop/tests/e2e-workflow-tests/workflows/)核对完整功能目录，逐 feature、逐功能点建立对应关系；相似测试归纳为用户场景，不照搬测试脚本、fixture 或验收日志。
  - 交付：每个功能点写清使用目的、适用平台与前提、简单直接的操作步骤、预期结果和关键说明；按用户补充要求，每个操作步骤都配对应真实步骤图，不能只截关键节点。变量名、规则/请求/文件名及输入值与实际操作和视频一致，动态端口/ID明确说明。每个feature提供对应视频，按步骤分章节或时间戳，与guidebook相互链接；缺图步骤不能算完成。
  - 当前：用户要求先写完整教程、先完成Homepage，再接入App；唯一[教程目录](../../Interceptor-Homepage/guidebook/README.md)已整理为普通Markdown目录，含快速上手、工作区、Capture、Composer、Rules、Breakpoints、导入导出、Settings、Diagnostics、Agent、MCP、权限、Tool速查与排查中文初稿。[覆盖关系](../../Interceptor-Homepage/docs/guidebook-coverage.md)逐组链接到正文及功能点锚点；已按源码区分Capture快捷断点立即Apply、普通规则草稿、Collection自动保存和Agent当前Chat模型等行为。
  - 已核对范围：[内容检查](../../Interceptor-Homepage/artifacts/guidebook-content-20261014.json)覆盖正文映射与UTF-8；当前阅读器的lint/typecheck、静态构建及[整站Browser](../../Interceptor-Homepage/artifacts/guide-reader-20261014/site-green/)通过，覆盖中英入口、真实正文、同一document切换、前进后退、刷新、手机/主题与404。已修复本章锚点删除`lang=en`导致UI回到中文的问题，[前置Red](../../Interceptor-Homepage/artifacts/guide-reader-20261014/anchor-red/)与[教程Green](../../Interceptor-Homepage/artifacts/guide-reader-20261014/guide-green/)保留；验证使用独立构建目录，避免并行重建`dist/`造成临时资源404。
  - 页面与托管核对：[浅深/手机阅读区对比](../../Interceptor-Homepage/artifacts/guide-reader-20261014/visual/comparison.json)的标题、简介、初稿提示与可见章节选中态几何、字体和像素一致；全文及独立维护的Header不伪装成缩略设计fixture。[Cloudflare本地Browser](../../Interceptor-Homepage/artifacts/guide-reader-20261014/cloudflare-green/)与静态发布dry-run通过，保留现有frame保护、无业务Worker/绑定。以上不证明公开地址、App接入、英文正文或真实产品媒体验收。
  - 页面实现：[官网阅读器](../../Interceptor-Homepage/src/features/guide/)与中英Markdown已接入首页和Header，“使用指南 / User Guide”可进入真实章节；不再把旧的“准备中”卡片描述为当前实现。[早期候选源码](../design-vite/src/features/HomepageGuidePreview/)随本仓库保留，[目录效果](../../../.copilot/session-state/549e8dc8-bccd-40ee-9228-d5895e50551f/files/homepage-guide-proposal/light/homepage-guide/overview.png)与[交互核对](../../../.copilot/session-state/549e8dc8-bccd-40ee-9228-d5895e50551f/files/homepage-guide-interaction/result.json)只说明候选，不能替代官网或App验收。
  - 组织与构建：按用户明确要求保存两个仓库全部当前进度，Homepage首次快照包含共享入口、依赖与lockfile，避免提交无法构建的孤立教程目录；本仓库保存设计候选。仍不发布教程npm包、不向App同步目录或压缩包、不增加私有registry认证，未部署网站或接入App。
  - 本次保存边界：用户授权保存item 9的中间进度，教程正文、公开素材、阅读器、验收工具、改动说明与剩余缺口一起保存。item 10的Header、Ant Design与平滑滚动已有独立提交，保留其`behavior: 'auto'`和生成CSP，不重复收录或回写；item 13只登记后续搜索需求，不提前实现。
  - 已确认方向：Homepage提供对应教程路由，完成后App使用无边框iframe内嵌，并提供浏览器打开按钮；嵌入模式去掉官网外壳、与App主题/语言衔接，保持滚动并明确加载失败。现在暂停App入口和预览实现；官网及App的具体UI仍须截图确认，不承诺离线阅读。官网只用免费Cloudflare，不要求购买域名或启用付费服务。
  - 当前步骤：已核对alpha.1发布ZIP摘要，并使用该下载App完成可执行实录；[录制来源](../apps/desktop/test-results/guidebook-release-20261015/release-source.json)保留。中英正文已接入对应图、视频、字幕与共同锚点，首页有真实视频索引。首页进入指南及大章节切换已改为Vite端编译正文、单一媒体地址清单、保留阅读外壳和按视区加载影片；阅读行为、逐图字幕、主题窄屏及最终Header的静态托管检查已取得适用结果，继续核对剩余图文视频缺口。实现位于[阅读器](../../Interceptor-Homepage/src/features/guide/)与[正文编译](../../Interceptor-Homepage/scripts/guide-content.ts)，验证范围、初稿提示的设计文案差异和剩余缺口集中记录在[阅读约定](../../Interceptor-Homepage/docs/guidebook.md#阅读入口与长章节性能验证)，整项不标完成。[原生录制工具](../apps/desktop/tests/e2e-workflow-tests/fixtures/ui/guidebook-media.ts)仅为验收，不进入产品。
  - 素材边界：已录片段保持App语言和公开示例值；Agent为无Key本地演示模型，MCP为本地SDK调用方，不冒充商业模型或真实Host。原生文件面板已独立取景，选择演示目录后切列表视图，避免显示父目录文件；断点响应/File、队列批量、双向文本帧已取得[实机证据](../apps/desktop/test-results/guidebook-media-20261015/breakpoints-verification.json)。普通窗口灰色遮罩不作为面板素材。
  - 录屏隐私约束：用户明确只允许App窗口及其相关原生面板，不录整个显示器、桌面或其他应用。录制器按本轮Main进程查找唯一窗口ID，使用单窗口过滤；原生Open/Save只取本轮App拥有的面板，选定公开演示目录后才取景。不得改用全屏、显示器或桌面区域录制作为回退。
  - 当前环境与配图范围：锁屏阻塞已解除；Collection的目录边界、目录内请求切换、排序、原生文件预览取消与删除已实录，并接入中英正文。继续逐功能检查剩余明确标注的缺图分支，不重跑已录的Collection流程；[实际Collection与退出证据](../apps/desktop/test-results/guidebook-media-20261015/collection-resumed/)、[正文/全影片字幕核对](../../Interceptor-Homepage/artifacts/item9-20261015/collection-and-captions-green/)保留。Windows、首次CA隔离环境、实际外部Host和真实服务凭据未提供，相关步骤仍待条件具备，不动日常CA。
  - 当前验证风险：[保存核对](../../Interceptor-Homepage/docs/guidebook.md#本次中间进度保存核对)保留本机长章绘制临界值和首页smooth采样的一次失败，以及不改代码、不放宽阈值的后续通过结果；时序波动原因未定位，不能宣称已经消除。当前保存不重跑App录制，也不把typecheck或网站Browser结果替代缺失的真实步骤。
  - 已发布行为限制：alpha.1删除Rules最后一条后保留dirty状态，但空树不提供Apply入口；[实际失败](../apps/desktop/test-results/guidebook-media-20261015/gaps-repaired/)保留，不能把删除持久化或相应步骤配图标完成。产品修复授权尚未取得，本item只如实说明该限制，继续录制其余已存在行为，不增加备用规则、隐藏API或修改发布包来绕过。
  - 下一步：按[内容与页面约定](../../Interceptor-Homepage/docs/guidebook.md)在已验收版本中逐章操作，逐步骤配图并录制feature视频、同步英文与对应关系；官网公开地址就绪后才处理App iframe及浏览器跳转。当前本地阅读页面为`http://127.0.0.1:4175/guide`，停止后在Homepage执行`npm run dev`恢复。涉及item8的未验证场景保留限制；不得全站解除frame保护或把远程页面接入App Preload。
  - 验收：所有 feature 和功能点均可从目录找到图文步骤及对应视频章节；按教程在真实 App 中完成操作，文字、截图、视频和发布版本一致；演示使用可公开的测试数据，不包含凭据、个人流量或其他敏感信息。

- **11. README 与 GitHub 仓库介绍优化 · 待实现**
  - 目标：用简单、直接、清楚的图文或视频说明 App 的用途和价值，覆盖每个重要 feature，同时让 GitHub 仓库介绍包含足够准确的产品与搜索信息。
  - 范围：同步优化[英文 README](../README.md)和[中文 README](../README.zh-CN.md)，按重要 feature 配简明介绍及真实截图或视频入口；保留清楚的下载、快速上手、权限与隐私说明，详细操作链接 item 9 的 guidebook，官网入口使用 item 15 验收后的实际地址。
  - 仓库信息：更新 GitHub About/Description、Website 和 Topics；简介在平台长度限制内明确产品类别、适用人群与核心能力，关键词与实际支持的功能一致，不堆砌无关搜索词。
  - 下一步：先梳理重要 feature 和搜索关键词，准备中英文文案及媒体对应表，再更新 README 和仓库元数据；素材、官网与下载信息按对应 item 的实际交付同步，不使用占位链接作为最终结果。
  - 验收：中英文信息一致，重要 feature 无遗漏，GitHub 页面中的图片、视频入口和链接可用；仓库简介、Topics、官网与 Release 的实际能力及平台说明一致。

- **12. 推广方案与逐平台备稿、发布 · 待实现**
  - 目标：明确在哪个平台、面向谁、发布什么内容，并逐个平台准备完整材料后发布，不停留在渠道建议或通用模板。
  - 范围：评估 V2EX、掘金、B 站、Show HN、Reddit、DEV Community、YouTube、Product Hunt 及相关开源周刊等候选渠道，按受众、社区规则和准备成本确定发布顺序，不要求不加筛选地全部发布。
  - 交付：每个选定平台分别准备标题、正文、语言版本、真实截图或视频、官网/下载/GitHub 链接和必要的回复要点；内容针对平台和具体使用场景调整，不机械复制同一篇宣传稿。
  - 下一步：先完成渠道与帖子清单，再按顺序逐项备稿、核对发布规则、确认最终内容与账号授权并发布；正式外发使用 item 9、11 和 15 已就绪的资料与入口，本轮仅登记待办，不操作外部账号或对外发布。
  - 验收：每个选定渠道都有最终稿、素材和实际发布链接，并处理发布后的有效问题与反馈；发布链接及反馈记录保存在对应推广材料中，不把草稿算作已发布。账号、平台规则或人工操作阻塞时说明原因，继续其他可执行渠道。

- **13. 教程全局搜索 · 待实现 · Guidebook完成后启动**
  - 目标：在教程中跨章节搜索内容，按关键词找到相关说明，并定位到对应章节或步骤。
  - 前置：先完成item 9的Guidebook交付，再启动本项；不并入当前阅读性能修复。
  - 下一步：Guidebook完成后确认搜索范围与交互，按设计确认、实现和Browser验收推进；当前只登记待办，不添加搜索入口、索引或依赖。

- **15. Cloudflare 受限部署与线上验收 · 待确认**
  - 目标：把已完成本地制作的官网部署到免费Cloudflare静态托管，先限制为本人或明确允许的成员访问，再按用户确认决定公开。源码仓库继续保持private，不要求购买域名或启用付费服务。
  - 当前：本地官网行为、素材来源与验证保留在[官网架构](../../Interceptor-Homepage/docs/architecture.md#真实首页素材)，[同一item改动说明](../../Interceptor-Homepage/commit-changes/202610141539_ui_homepage_initial-progress.html#homepage-real-media-20261017)保留前后画面。尚无已验收的线上URL，账号授权和访问保护需要确认，不将先前OAuth失败等同于当前认证状态。
  - 步骤：按[受限部署约定](../../Interceptor-Homepage/docs/deployment.md#待执行受限部署与线上验收)先确认实际账号、保护范围与全部正式/预览地址，再连接本人的GitHub官网仓库或授权Wrangler部署；`Cloudflare account`必须确实限定账号成员，不能只选择项目所属账号。不得创建临时公开部署、擅自影响其他应用或靠网址未公布代替访问控制。
  - 验收：首页与教程深链/刷新、真实404、静态缓存、原图、视频播放/拖动与Range响应；获准账号能访问，匿名及未授权账号不能绕过保护，包括直接资源和预览地址。保留实际URL与浏览器证据，核对国内外线路和Google Fonts依赖，不承诺免费默认域名在大陆稳定快速。
  - 入口边界：下载、GitHub与feedback仍受私有产品仓库权限限制，需确认目标访客可用的入口；上线不会自动获得匿名下载权限。App iframe、主题语言衔接与登录会话仍归item 9，不由普通网页可嵌入替代；正式公开、域名及任何付费操作另行确认。

## 验收约束

- 已发布版本不作为待办保留；发布结果与证据见[当前发行验证边界](platform/release.md#7-当前发行验证边界)。下载产物的各平台实机验收仍未完成，不能将CI、发布或本机包验证替代这些证据；private仓库的匿名读取限制不因Publish消失。
- AppContainer写入与顺序仍依赖Windows及对应的真实运行环境，不能用macOS结果代替。
- AppContainer原生枚举曾在CI超过默认5000ms，同SHA复跑通过但未单独定位原因；没有修改helper或放宽超时，不把该风险记为已修复，证据保留在上述验证边界。
- 空共享CA目录的证书生命周期专项、独立DNS/DHCP WPAD lab及实际MCP Host验收仍需各自前提；Windows WPAD现有范围见[Settings证据](features/settings.md#windows-wpad-research)，后续复验仍需隔离环境。没有执行的范围不能因Release发布而改写为通过，不删除日常CA凑测试条件。
- 原生安装、Gatekeeper、钥匙串与helper授权保留真实系统流程；不删除quarantine、关闭全局安全策略或用强杀代替退出恢复。
- 生产依赖审计与开发工具链告警分别报告，DMG、extract-zip及patch-package的开发依赖公告不能算作已经修复；边界见[发布与依赖约束](platform/release.md#依赖升级约束)。
