# Task List

> Tracked commit: `160ec875`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`，改动说明写入对应`commit-changes/`文件。

- **9. 完整 Guidebook 与逐 feature Guide Video · 待实现**
  - 目标：提供一本面向用户的完整 guidebook 和每个 feature 对应的 guide video，让用户不必阅读大量 workflow，也能按步骤掌握每个功能点。
  - 范围：以[功能设计](features/)、[workflow 规格索引](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)和[workflow 源码](../apps/desktop/tests/e2e-workflow-tests/workflows/)核对完整功能目录，逐 feature、逐功能点建立对应关系；相似测试归纳为用户场景，不照搬测试脚本、fixture 或验收日志。
  - 交付：每个功能点写清使用目的、适用平台与前提、简单直接的操作步骤、预期结果和关键说明，并配关键操作节点的真实产品截图；每个 feature 提供对应操作视频，按功能点分章节或时间戳，与 guidebook 相互链接。
  - 下一步：先整理全量目录和覆盖关系，确定 guidebook 与视频素材的存放、阅读和维护方式，再逐 feature 编写、截图、录制和核对；可以先梳理规格，正式教程与媒体只依据已验收的实际版本，涉及 item 8 的未验证场景保留明确限制。
  - 验收：所有 feature 和功能点均可从目录找到图文步骤及对应视频章节；按教程在真实 App 中完成操作，文字、截图、视频和发布版本一致；演示使用可公开的测试数据，不包含凭据、个人流量或其他敏感信息。

- **10. 产品官网设计、制作与上线 · 待实现**
  - 目标：制作酷炫、有辨识度的产品官网，借鉴主流 app 官网的视觉与交互表达，让访客快速理解 Interceptor 并进入下载、GitHub 和反馈入口。
  - 范围：产品定位、重要 feature 介绍、真实产品截图与演示视频、下载链接、GitHub 链接、feedback 入口及 guidebook 导航；复用 item 9 的已核对素材，不把设计预览冒充已发布产品画面。
  - 下一步：先整理参考官网和拟议设计，用页面、组件、具体位置及内容清单配效果截图取得用户明确确认，再实现正式官网；优先评估免费静态托管，最终托管方案、域名及任何付费操作另行确认。
  - 验收：完成桌面和移动端展示、动效与媒体播放检查，所有下载、GitHub、feedback 和 guidebook 链接可用；下载平台与版本以实际 Release 资产为准，完成设计还原验收并通过公开访问检查后才算上线。

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

- **14. v0.1.1-alpha.1 macOS / Windows Release · 进行中 · 修正alpha发布**
  - 目标：继续alpha预发布，为macOS Intel x64和Apple Silicon arm64各提供DMG/ZIP，为Windows x64提供EXE/MSI/ZIP；实际通过`npm run release`选择固定源码、构建并进行最终发布确认，不直接派发workflow或编辑Release代替命令。本地官网及item 10改动不进入安装包。
  - 当前：`v0.1.1`草稿及tag已删除，原`v0.1.1-alpha.0`及其tag保持不变。release脚本已允许Windows预发布，完整SemVer与Windows安装器数字版本明确分开；实际`npm run release`预检已选出`0.1.1-alpha.1`及七个附件，并在启动CI前取消确认。接下来保存本次alpha修正，再由该命令启动构建。
  - 已验证范围：alpha/beta/rc参数契约已有Red/Green，稳定版本行为和Windows数字范围约束保留；Desktop配置测试与typecheck通过。MSI库保留完整`semanticVersion`并生成数字版本，同基础版本允许同版本升级；[alpha参数及真实CLI预检](../apps/desktop/test-results/release-alpha-20261013/)记录实际命令选择结果，不代表新安装包已验收。
  - 验证边界：被删除的`0.1.1`产物不是本次alpha交付，原[打包支持证据](../apps/desktop/test-results/release-tooling-20261013/)不能代替新版本检查。新alpha的NSIS原生编译、实际附件和实机安装仍待验证；改动说明继续维护于[发布格式说明](../commit-changes/202610131328_docs_release_windows-package-formats.html)。
  - 发布门禁：CI通过不代替实际下载、安装、系统授权、packaged smoke和退出恢复。macOS采用ad-hoc且未公证，Windows安装器未签名；macOS arm64和Windows最终产物仍需对应实机验收，未取得证据和最终确认前不Publish。
  - 下一步：推送本次alpha修正，再实际执行`npm run release`生成七个alpha附件；依[发版指南](release-guide.md#6-实机验收和最终确认)完成对应实机验收后，在同一命令的最终提示中确认Publish，保留Pre-release标记。不覆盖本机旧App、不改变仓库可见性、不把“已发布alpha”混同于稳定版。

## 验收约束

- AppContainer写入与顺序仍依赖Windows及对应的真实运行环境，不能用macOS结果代替。
- 空共享CA目录的证书生命周期专项、独立DNS/DHCP WPAD lab及实际MCP Host验收仍需各自前提；Windows WPAD现有范围见[Settings证据](features/settings.md#windows-wpad-research)，后续复验仍需隔离环境。没有执行的范围不能因Release发布而改写为通过，不删除日常CA凑测试条件。
- 原生安装、Gatekeeper、钥匙串与helper授权保留真实系统流程；不删除quarantine、关闭全局安全策略或用强杀代替退出恢复。
- 生产依赖审计与开发工具链告警分别报告，DMG、extract-zip及patch-package的开发依赖公告不能算作已经修复；边界见[发布与依赖约束](platform/release.md#依赖升级约束)。
