# Task List

> Tracked commit: `e05514e0`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`，改动说明写入对应`commit-changes/`文件。

- **9. 完整 Guidebook 与逐 feature Guide Video · 进行中 · 中文初稿与本地阅读页已保存，待内容及媒体验收**
  - 目标：提供一本面向用户的完整 guidebook 和每个 feature 对应的 guide video，让用户不必阅读大量 workflow，也能按步骤掌握每个功能点。
  - 范围：以[功能设计](features/)、[workflow 规格索引](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)和[workflow 源码](../apps/desktop/tests/e2e-workflow-tests/workflows/)核对完整功能目录，逐 feature、逐功能点建立对应关系；相似测试归纳为用户场景，不照搬测试脚本、fixture 或验收日志。
  - 交付：每个功能点写清使用目的、适用平台与前提、简单直接的操作步骤、预期结果和关键说明，并配关键操作节点的真实产品截图；每个 feature 提供对应操作视频，按功能点分章节或时间戳，与 guidebook 相互链接。
  - 当前：用户要求先写完整教程、先完成Homepage，再接入App；唯一[教程目录](../../Interceptor-Homepage/guidebook/README.md)已整理为普通Markdown目录，含快速上手、工作区、Capture、Composer、Rules、Breakpoints、导入导出、Settings、Diagnostics、Agent、MCP、权限、Tool速查与排查中文初稿。[覆盖关系](../../Interceptor-Homepage/docs/guidebook-coverage.md)逐组链接到正文及功能点锚点；已按源码区分Capture快捷断点立即Apply、普通规则草稿、Collection自动保存和Agent当前Chat模型等行为。
  - 已核对范围：[内容检查](../../Interceptor-Homepage/artifacts/guidebook-content-20261014.json)覆盖章节目录、相对链接/锚点、workflow归属、生产Tool名称/类型与UTF-8；本地阅读页已接入React Router、`/guide`及章节路由，已有浏览器验证覆盖正文、链接、刷新和404，共享Header已定向复核。本次保存前官网与设计workspace的typecheck通过，按用户要求不重跑全套；不将这些结果视为教程实机操作、英文或媒体验收。
  - 页面实现：[官网阅读器](../../Interceptor-Homepage/src/features/guide/)与中文Markdown已接入首页和Header，“使用指南 / User Guide”可进入真实章节；不再把旧的“准备中”卡片描述为当前实现。[早期候选源码](../design-vite/src/features/HomepageGuidePreview/)随本仓库保留，[目录效果](../../../.copilot/session-state/549e8dc8-bccd-40ee-9228-d5895e50551f/files/homepage-guide-proposal/light/homepage-guide/overview.png)与[交互核对](../../../.copilot/session-state/549e8dc8-bccd-40ee-9228-d5895e50551f/files/homepage-guide-interaction/result.json)只说明候选，不能替代官网或App验收。
  - 组织与构建：按用户明确要求保存两个仓库全部当前进度，Homepage首次快照包含共享入口、依赖与lockfile，避免提交无法构建的孤立教程目录；本仓库保存设计候选。仍不发布教程npm包、不向App同步目录或压缩包、不增加私有registry认证，未部署网站或接入App。
  - 已确认方向：Homepage提供对应教程路由，完成后App使用无边框iframe内嵌，并提供浏览器打开按钮；嵌入模式去掉官网外壳、与App主题/语言衔接，保持滚动并明确加载失败。现在暂停App入口和预览实现；官网及App的具体UI仍须截图确认，不承诺离线阅读。官网只用免费Cloudflare，不要求购买域名或启用付费服务。
  - 下一步：按[内容与页面约定](../../Interceptor-Homepage/docs/guidebook.md)复核当前阅读体验，按已验收版本逐章试读并补真实图文视频和英文；官网公开地址就绪后才处理App iframe及浏览器跳转。涉及item8的未验证场景保留限制；不得全站解除frame保护或把远程页面接入App Preload。
  - 验收：所有 feature 和功能点均可从目录找到图文步骤及对应视频章节；按教程在真实 App 中完成操作，文字、截图、视频和发布版本一致；演示使用可公开的测试数据，不包含凭据、个人流量或其他敏感信息。

- **10. 产品官网设计、制作与上线 · 进行中 · 外观与功能展示已更新，待公开上线**
  - 目标：制作酷炫、有辨识度的产品官网，借鉴主流 app 官网的视觉与交互表达，让访客快速理解 Interceptor 并进入下载、GitHub 和反馈入口。
  - 范围：产品定位、重要 feature 介绍、真实产品截图与演示视频、下载链接、GitHub 链接、feedback 入口及 guidebook 导航；复用 item 9 的已核对素材，不把设计预览冒充已发布产品画面。
  - 当前：官网仓库为同账号的私有[Interceptor-Homepage](https://github.com/zhxmt-xm/Interceptor-Homepage)，本地目录`/Users/zhxmt/Desktop/Interceptor-Homepage`。首页、已接入的Guidebook和公共接线已保存并推送至`93fb996`；这是用户明确要求的完整初始进度快照，不标记公开上线或全部验收完成。没有修改桌面App运行实现。
  - 首页实现：用户已确认“首屏总览＋纵向图文功能模块”，并补充独立MCP模块。[src/](../../Interceptor-Homepage/src/)按`app / features/home / components / content / theme / styles`分层，组件使用独立CSS Module；默认跟随系统，右上角提供System/Light/Dark，记住手动选择并同步主题图片。Capture、Rules、Breakpoints、Composer、Agent、MCP分别绑定说明与截图；手机图文上下排列，补充能力使用紧凑卡片。App图片仍标注设计预览，本地页面为`http://127.0.0.1:4175/`，停止后在官网目录执行`npm run dev`恢复。
  - 页面精简：按用户反馈移除重复的三步使用流程、虚构请求/响应卡片、独立下载区和同地址的平台卡片；顶部“如何使用”及首屏重复下载按钮一并移除。功能后直接进入学习资源，保留真实Quick Start链接。
  - 下载入口：Header按左品牌、独立居中的页面导航、右侧操作区布局；右侧顺序为下载、主题、语言，下载保持原来的主色、尺寸和阴影，Star斜条代码与样式未改。普通窗口保持单行，宽度不超过820px时导航独立居中一行，始终可见；手机右侧菜单只放下载，不再包含页面导航。右侧操作区距窗口右缘固定104px，手机角标布局为36px。所有下载入口以`noopener noreferrer`在新标签页打开`https://github.com/zhxmt-xm/Interceptor/releases/latest`，原页面与滚动位置保持。
  - Header定向核对：已验证首页和Guidebook的导航居中、固定安全间距、右侧按钮顺序、手机操作菜单与主题菜单互斥；按钮原样恢复后typecheck和相关浏览器检查通过。实际页面在835px与853px宽度下为单行Header，截图与Star源码哈希保留于[分区与间距证据](../../Interceptor-Homepage/artifacts/header-regions/)。本轮未再执行无关全套流程，未改动其他会话的教程路由实现。
  - GitHub入口：最右上角提供45°“Star on GitHub”，窄屏为星形角标；与固定Header一起保持可见，以新标签页打开产品仓库，不代替访客Star。前置Red、lint/typecheck/build及官网浏览器流程通过；已核对各尺寸的导航点击区域、主题菜单、opener隔离和仅读取仓库的请求，中英/浅深截图无横向溢出，未改动内容像素保持一致。[Star入口证据](../../Interceptor-Homepage/artifacts/github-ribbon/)保留，不代表私有仓库已可匿名访问。
  - 已验证范围：固定Header与新标签页取得前置Red及最终Green，lint、typecheck/build和全部官网浏览器流程通过；真实滚轮、锚点避让、手机菜单、鼠标/键盘创建独立标签页及opener隔离已验证，原官网地址与滚动位置保持不变。中英/浅深/桌面平板手机截图已检查，首屏像素未变。[固定Header证据](../../Interceptor-Homepage/artifacts/sticky-header/)及原[页头下载证据](../../Interceptor-Homepage/artifacts/header-download/)只证明官网导航，外部响应在浏览器测试中隔离，不代替GitHub匿名访问。主题持久化、系统/跨页同步、存储拒绝警告、键盘、文字对比度及Cloudflare静态资源检查保留于[主题与模块证据](../../Interceptor-Homepage/artifacts/theme-features/)；[长期入口证据](../../Interceptor-Homepage/artifacts/evergreen-downloads/)与原[内容证据](../../Interceptor-Homepage/artifacts/content-20261014/)仍保留，不作为桌面App E2E或公开上线证据。
  - 部署准备：[wrangler.jsonc](../../Interceptor-Homepage/wrangler.jsonc)仅托管`dist/`，不需要业务Worker、数据库或服务端凭据；[部署说明](../../Interceptor-Homepage/docs/deployment.md)包含免费Static Assets与Pages备选。CI只检查，不自动发布；托管账号、域名和公开地址尚未操作。
  - 下一步：连接获授权的托管账号并核对匿名下载、GitHub、feedback和guidebook入口。真实产品截图、视频及教程实机验收仍依赖item 9，实际上线、域名及任何付费操作另行确认。
  - 验收：完成桌面和移动端展示、动效与媒体播放检查，所有下载、GitHub、feedback 和 guidebook 链接可用；下载平台与版本以实际 Release 资产为准，通过页面、构建产物与公开访问检查后才算上线。

- **11. README 与 GitHub 仓库介绍优化 · 待实现**
  - 目标：用简单、直接、清楚的图文或视频说明 App 的用途和价值，覆盖每个重要 feature，同时让 GitHub 仓库介绍包含足够准确的产品与搜索信息。
  - 范围：同步优化[英文 README](../README.md)和[中文 README](../README.zh-CN.md)，按重要 feature 配简明介绍及真实截图或视频入口；保留清楚的下载、快速上手、权限与隐私说明，详细操作链接 item 9 的 guidebook，官网入口使用 item 10 的正式地址。
  - 仓库信息：更新 GitHub About/Description、Website 和 Topics；简介在平台长度限制内明确产品类别、适用人群与核心能力，关键词与实际支持的功能一致，不堆砌无关搜索词。
  - 下一步：先梳理重要 feature 和搜索关键词，准备中英文文案及媒体对应表，再更新 README 和仓库元数据；素材、官网与下载信息按对应 item 的实际交付同步，不使用占位链接作为最终结果。
  - 验收：中英文信息一致，重要 feature 无遗漏，GitHub 页面中的图片、视频入口和链接可用；仓库简介、Topics、官网与 Release 的实际能力及平台说明一致。

- **12. 推广方案与逐平台备稿、发布 · 待实现**
  - 目标：明确在哪个平台、面向谁、发布什么内容，并逐个平台准备完整材料后发布，不停留在渠道建议或通用模板。
  - 范围：评估 V2EX、掘金、B 站、Show HN、Reddit、DEV Community、YouTube、Product Hunt 及相关开源周刊等候选渠道，按受众、社区规则和准备成本确定发布顺序，不要求不加筛选地全部发布。
  - 交付：每个选定平台分别准备标题、正文、语言版本、真实截图或视频、官网/下载/GitHub 链接和必要的回复要点；内容针对平台和具体使用场景调整，不机械复制同一篇宣传稿。
  - 下一步：先完成渠道与帖子清单，再按顺序逐项备稿、核对发布规则、确认最终内容与账号授权并发布；正式外发使用 item 9–11 已就绪的资料与入口，本轮仅登记待办，不操作外部账号或对外发布。
  - 验收：每个选定渠道都有最终稿、素材和实际发布链接，并处理发布后的有效问题与反馈；发布链接及反馈记录保存在对应推广材料中，不把草稿算作已发布。账号、平台规则或人工操作阻塞时说明原因，继续其他可执行渠道。

## 验收约束

- 已发布版本不作为待办保留；发布结果与证据见[当前发行验证边界](platform/release.md#7-当前发行验证边界)。下载产物的各平台实机验收仍未完成，不能将CI、发布或本机包验证替代这些证据；private仓库的匿名读取限制不因Publish消失。
- AppContainer写入与顺序仍依赖Windows及对应的真实运行环境，不能用macOS结果代替。
- AppContainer原生枚举曾在CI超过默认5000ms，同SHA复跑通过但未单独定位原因；没有修改helper或放宽超时，不把该风险记为已修复，证据保留在上述验证边界。
- 空共享CA目录的证书生命周期专项、独立DNS/DHCP WPAD lab及实际MCP Host验收仍需各自前提；Windows WPAD现有范围见[Settings证据](features/settings.md#windows-wpad-research)，后续复验仍需隔离环境。没有执行的范围不能因Release发布而改写为通过，不删除日常CA凑测试条件。
- 原生安装、Gatekeeper、钥匙串与helper授权保留真实系统流程；不删除quarantine、关闭全局安全策略或用强杀代替退出恢复。
- 生产依赖审计与开发工具链告警分别报告，DMG、extract-zip及patch-package的开发依赖公告不能算作已经修复；边界见[发布与依赖约束](platform/release.md#依赖升级约束)。
