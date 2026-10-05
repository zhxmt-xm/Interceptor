# Task List

> Tracked commit: `d274c2f8`

- **8. Windows 实机验收 · 待验收**
  - 范围：按[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)验证CA/UAC、系统代理/AppContainer、TLS/H2/gRPC、原生导入导出、平台helper、最终产物与退出恢复；包含已登录Edge的Bilibili流程和纯Auto Detect/WPAD环境。
  - 当前：macOS结果不能替代Windows；只排除Manager管理员MMC原生打开/关闭专项，不排除Manager功能。Windows待验不阻塞其他item已满足自身门禁的提交，也不阻塞不含Windows产物的macOS首发；Windows产物发布前仍须完成本项门禁。
  - 下一步：具备Windows实机及授权后逐组验收，确认进程、8888、代理、journal和证书恢复。

- **10. HTTP编辑正文framing · blocked（无补丁方案未验证）**
  - 目标：覆盖H1/H2、请求/响应、Text/File及header-only、body-only、header+body，遵守[编辑契约](features/http-message-editing.md)。
  - 当前：chunked请求被补Content-Length并删除chunked，响应可能同时出现Content-Length与Transfer-Encoding；完整wire矩阵未齐。
  - 下一步：只验证正式API、配置或无需调整现有补丁的上游方案，不修改用户headers或重放请求规避缺陷。

- **12. WPAD · blocked（缺纯Auto Detect环境）**
  - 目标：在没有显式代理地址和PAC URL的真实WPAD网络中，核对接管前后流量路径及退出恢复。
  - 当前：Windows无可用上游URL时按直连处理；macOS仅Auto Detect时在接管前拒绝。本机不具备纯WPAD条件，显式代理/PAC结果不能替代。
  - 下一步：取得macOS真实环境后验收；Windows归第8项。此项不代表已承诺新增WPAD发现实现，边界见[Settings](features/settings.md#macos-effective-upstream)。

- **13. 按commit发版与首个Release · 代码完成 · 待部署CI/实机验收**
  - 范围：自有代码采用Apache-2.0；默认首发macOS x64 DMG/ZIP。按用户2026-10-04追加要求，`npm run release`先显示当前分支最近10个commit，并支持输入短/完整hash查询确认；选定源码SHA后，再选择版本增量及平台/架构/包类型。源码commit必须存在于GitHub，版本和目标作为CI输入，不修改本地版本或配置，不要求干净工作区，不自动commit/push/stash或清理本地文件。
  - 当前步骤：最近10个commit、短/完整hash查询确认和固定SHA的CI请求已接通。删除本地版本/配置写入、自动commit/push、干净工作区门禁及旧配置文件；一次CI完成构建、tag和draft。CI保留4个编排/校验工具后在同一源码目录精确检出产品SHA，不复制产品仓库或另建worktree。2026-10-05用户已授权单独提交并推送本项新版工具/workflow，部署后只读核对输入，不自动启动CI、tag或Release；其他设计稿修改保留。旧准备commit `47a241a6`和同一份[改动说明](../commit-changes/202610032005_docs_release_single-command.html)保留。
  - 部署前故障：用户选择`d274c2f8`后，GitHub返回HTTP 422 `Unexpected inputs provided: ["source_sha", "targets", "version"]`。只读确认远端main仍仅接受`request_id`，没有创建任何Release workflow运行。原因是本地新版与远端旧workflow不同步；本次部署补齐接口，不更换所选产品源码或删除输入规避。
  - 本次提交检查（2026-10-05）：仅暂存本项17个文件和Handover第13项差异，保留其他设计稿；相关28项测试、Desktop typecheck、JS语法、4个dispatch输入、固定SHA引用、14段Bash和最近10条/hash解析检查通过。指南本地链接与同一HTML报告1280/390宽度检查通过；没有重跑全量测试或真实发版，不将此前8项失败改写为通过。
  - 推送状态：此前连接`github.com:443`约75秒超时；2026-10-04已随后续commit `56b90cc1`成功推送至`main`，准备commit `47a241a6`现已在远端。此次推送未调整网络、代理或凭据，不代表CI/tag/发布验收已经完成。
  - 终端摘要：先显示最近10个SHA/日期/说明，hash查询后显示完整提交信息并确认；汇总明确区分产品源码SHA与工作流分支，不再显示本地自动提交文件。hash确认、开始和最终Publish均默认Yes，仍等待用户输入。版本基准读取所选源码及GitHub已有版本tag，不读取本机未提交版本。
  - Intel工具前提（2026-10-04）：本机为macOS 15.8、Intel i9/x86_64。按用户授权，通过macOS管理员授权将官方gh 2.102.0安装到`/usr/local/bin/gh`，所有者root:wheel、权限0755；PATH解析及`gh --version`通过，文件为Mach-O x86_64，安装前后可执行文件SHA-256均为`df615405bcf707c5855f22c8be477c62cd7f7af743de75c4805c2b375b3a479c`。官方ZIP校验通过并保留为会话安装备份，临时解压文件清理。未安装Homebrew、改网络/shell配置或自动登录/发版；指南保留Intel直接安装路线。
  - 提交检查：只暂存本项代码与共享文件中的本项差异，不包含WPAD或`npm start`工作；改动说明已用headless Edge检查1280/390宽度，无页面横向溢出或折叠，窄屏表格保留内部横向滚动。
  - 已验证：修改前Forge配置测试6 passed；最终全workspace typecheck通过，Forge配置及Updater相关测试28 passed，Core构建收集182个依赖许可。Apache正文与官方文件逐字节一致，8份补充声明与上游blob/npm README段落一致。现有Forge/Inquirer/SemVer仅增加直接dev依赖声明，所有依赖路径、版本及integrity保持原值。矩阵/版本/非法输入、workflow YAML和11段Bash语法通过，文档本地链接有效；VS Code未发现测试后改用仓库Vitest命令，未计为产品Red。
  - 按SHA验证：真实PTY验证最近10条默认HEAD `d274c2f8`，以及输入短hash选择列表之外的`677d8c60`；两者都在脏工作区到达总确认并正常取消，文件、版本、index和HEAD不变。GitHub读取确认完整SHA及源码版本；非法hash被拒绝。CI请求/checkout引用及14段Bash语法通过；只复制4个工具进行加载验证，错误源码SHA和脏CI源码目录均在构建前拒绝，未复制产品仓库。全workspace typecheck和相关28项测试通过，指南链接及报告1280/390宽度检查通过；真实CI未执行。
  - 既有本机产物（非本次按SHA的CI证据）：此前共享后端已通过原生CPU、签名完整性和artifact audit。`apps/desktop/out/release/darwin-x64/Interceptor-0.1.0-darwin-x64.dmg`为130389144 bytes，SHA-256 `a879d848ed61ef6ddb20da242bcd2b9bf3dc84a493befb973235075c13703656`；同目录ZIP为132010064 bytes，SHA-256 `2d05b56bc96d90927d7b7bdf906679c7b2f64744b351714569f2d33b3c5ab998`。不拿这些旧包证明新选定SHA、macOS arm64或Windows构建通过。
  - 当前测试阻塞：全workspace Vitest为2321 passed / 8 failed / 2 skipped。Desktop的5项Windows文件面板fixture在macOS报平台限制；Playground的TLS H1场景`afterEach`超时，单独重跑仍失败；Core的2项chunked framing失败与第10项一致。本轮未改这些实现/测试，不删除或跳过它们来放行CI。`actionlint`与Go未安装，下载独立linter遇GitHub连接超时，不能将替代语法检查记为actionlint通过。
  - 剩余验证：gh当前已登录zhxmt-xm，源码可从GitHub读取；须先将新版发版工具/workflow经授权提交并部署到默认分支，再按所选SHA运行真实CI、tag/draft及实机安装/授权/退出恢复。此前8项失败是当时源码结果，不替代所选SHA的CI结果；若所选版本仍有失败，不能跳过放行。发布前还需完成所有所选平台的实机门禁，不因本地查询成功而标完成。
  - 发布条件：2026-10-03只读确认仓库仍为private，尚无Release workflow运行记录；private允许draft/Release，但产品匿名更新仍会404。公开仓库、发布准备commit/push及最终tag按用户授权执行，不自动更改可见性；操作见[开发指南](development.md#正式发布)。

## 验证证据

- **Capture筛选request计数（第16项，2026-10-04）**
  - 同一次facet遍历生成选项及`requestCount`；组头统计该维度覆盖的request，Rule多命中只计一次。All和选项计数、零值Pending、筛选及排序保持原行为；Clear后全部组头归零。[功能契约](features/capture.md#101-结构化筛选分栏)、[改动说明](../commit-changes/202610041121_ui_capture_request-counts.html)、[本机会话证据](/Users/zhxmt/.copilot/session-state/57ea4adc-4bab-4df2-a2fb-1c155cdd2946/files/capture-request-count-evidence/)。
  - 前置：Capture unit为4 failed / 25 passed；[真实E2E Red](../apps/desktop/test-results/capture-request-count-red/)两项按目标失败，分别为4条request显示成3，以及Clear后Application/Status/Type仍为1。VS Code未发现测试后使用仓库Vitest，不将发现失败记为产品Red。
  - 最终：同文件29项unit、Desktop typecheck及[两条真实E2E Green](../apps/desktop/test-results/capture-request-count-green/)通过。验证暂停前后的单项数量、Method与All总数一致、全部组头清空及多规则去重；Main/Core/Worker、8888和宿主代理/证书恢复由既有driver/host guard核对，两条metadata均为`gracefulDestroyVerified=true`。
  - Capture明暗与Rule筛选/空态共4个parity视图：90 targets、0 missing、0 flagged，最大几何差0.5px；明暗主视图的原有设计像素差仍为2.57%/2.56%，没有改设计基准掩盖数据差异。同18条fixture的Dark两版Renderer仅1044个像素变化，全部位于六处组头计数；Rule示例数字1没有变化。
  - 单文件改动说明内嵌同主题、同状态的Renderer局部截图和红框，已核对1280/390排版、图片加载与标注位置；原截图不变。未修改Core、IPC、第三方行为或产品样式；临时报告生成脚本已清理。

- **统一开发命令入口（第14项，2026-10-03）**
  - 入口为`npm start`，一级菜单`Development / Test / Build`；Desktop与Design不再询问启动模式，构建准备自动完成。摘要分栏、提示逐条显示，确认默认Yes但等待Enter；低频工具保留原命令，`release`和`release:build`未接入或修改。[使用说明](development.md#统一命令入口)、[改动说明](../commit-changes/202610031952_docs_commands_interactive-entry.html)、[本轮证据](/Users/zhxmt/.copilot/session-state/57ea4adc-4bab-4df2-a2fb-1c155cdd2946/files/command-wizard-refinement-evidence/)。
  - `node --check scripts/start.mjs`与帮助入口通过；本轮15项真实PTY场景通过，12份执行摘要在80/120列无溢出且中文对齐，长命令换行后可完整还原。Enter实际执行Core Protocol typecheck及Core构建→2个unit文件的25项测试；显式n、返回及Ctrl+C取消通过。
  - Design通过默认Enter启动，HTTP 200；Ctrl+C后本次所属进程及监听均退出。只补充已安装wrap-ansi 6.2.0的直接开发依赖声明，其余1078个lockfile依赖条目不变。文档链接有效；同一份HTML经headless Edge验证1280/390排版，分栏对齐且无页面横向溢出或折叠。
  - 历史：[初版18项PTY证据](/Users/zhxmt/.copilot/session-state/57ea4adc-4bab-4df2-a2fb-1c155cdd2946/files/command-wizard-evidence/)保留，不作为精简版菜单的通过结果。初版临时symlink fixture曾指向不存在目录，修正后复跑通过；集成浏览器句柄/截图异常已改用headless Edge完成检查，原日志保留。本轮报告的等宽字体回退偏差只修正排版示意，不改变实际终端输出。
  - 未运行产品E2E、packaged smoke、Windows实机或系统设置操作；相关入口只验证路由、展示与取消，不计为对应套件通过。未修改设计基准、产品代码或发版实现；临时PTY driver与依赖基线副本已清理。
