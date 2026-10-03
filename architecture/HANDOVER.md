# Task List

> Tracked commit: `4ea8bf65`

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

- **13. 交互发版与首个tag release · 代码完成 · 待CI/实机验收（全量测试blocked）**
  - 范围：自有代码采用Apache-2.0；默认首发macOS x64 DMG/ZIP。按用户追加要求，实现`npm run release`交互选择版本递增方式、macOS x64/arm64或Windows x64及有效安装包类型，配置归`.github/release-config.json`，版本归Desktop package.json；不提供未实现的Linux、Windows arm64或universal。macOS使用ad-hoc，Windows不要求付费签名，保留全部产品安全及对应平台验收门禁。
  - 当前步骤：一次`npm run release`选择配置、总确认后连续执行检查、仅提交生成的版本/配置并push、CI、tag和draft；同一终端等待实机验收，最终确认后Publish。原有业务修改必须先提交，不自动夹带、公开仓库或删除历史。[指南](release-guide.md)为单线流程，默认0.1.0、macOS x64、DMG+ZIP。用户已授权先保存第13项准备提交，不代表发布验收完成；未执行tag或Publish。[改动说明](../commit-changes/202610032005_docs_release_single-command.html)随本项提交。
  - 终端摘要：基本信息与构建目标按显示列宽对齐，提交文件逐行列出，只显示所选平台的签名说明；复用已安装的string-width 5.1.2，不改变依赖路径/版本/integrity。开始和最终Publish两处确认按用户要求均默认Yes，仍等待Enter；真实PTY在80/120列验证中文对齐、无摘要溢出、`(Y/n)`、显式取消及Enter进入前置门禁，未触发版本修改或实际发布。
  - 提交检查：只暂存本项代码与共享文件中的本项差异，不包含WPAD或`npm start`工作；改动说明已用headless Edge检查1280/390宽度，无页面横向溢出或折叠，窄屏表格保留内部横向滚动。
  - 已验证：修改前Forge配置测试6 passed；最终全workspace typecheck通过，Forge配置及Updater相关测试28 passed，Core构建收集182个依赖许可。Apache正文与官方文件逐字节一致，8份补充声明与上游blob/npm README段落一致。现有Forge/Inquirer/SemVer仅增加直接dev依赖声明，所有依赖路径、版本及integrity保持原值。矩阵/版本/非法输入、workflow YAML和11段Bash语法通过，文档本地链接有效；VS Code未发现测试后改用仓库Vitest命令，未计为产品Red。
  - 向导验证：连续入口改造后，真实PTY验证从版本/目标配置直接进入总确认，取消及脏工作区拒绝均不修改文件、HEAD或调用GitHub；阶段菜单已删除，语法、帮助和指南链接通过。版本与构建后端沿用此前已验证的Patch真实更新/恢复、空选择/非法目标拒绝、ZIP-only只归集一个ZIP及默认DMG+ZIP实际构建结果。自动commit/CI/tag/最终Publish的新连续编排尚未实跑，不宣称整条发布通过。
  - 当前本机产物：共享构建后端已通过原生CPU、helper读取、strict/nested签名完整性及artifact audit（1490 files / 340004999 bytes）；本次只改入口编排，未重建产物。`apps/desktop/out/release/darwin-x64/Interceptor-0.1.0-darwin-x64.dmg`为130389144 bytes，SHA-256 `a879d848ed61ef6ddb20da242bcd2b9bf3dc84a493befb973235075c13703656`；同目录`Interceptor-0.1.0-darwin-x64.zip`为132010064 bytes，SHA-256 `2d05b56bc96d90927d7b7bdf906679c7b2f64744b351714569f2d33b3c5ab998`。这是本机ad-hoc结果，不是浏览器下载后的Gatekeeper或真实安装验收；macOS arm64/Windows矩阵尚未执行。
  - 当前测试阻塞：全workspace Vitest为2321 passed / 8 failed / 2 skipped。Desktop的5项Windows文件面板fixture在macOS报平台限制；Playground的TLS H1场景`afterEach`超时，单独重跑仍失败；Core的2项chunked framing失败与第10项一致。本轮未改这些实现/测试，不删除或跳过它们来放行CI。`actionlint`与Go未安装，下载独立linter遇GitHub连接超时，不能将替代语法检查记为actionlint通过。
  - 剩余验证：本机尚未安装/登录gh，未运行真实CI派发/跟踪或tag草稿，也未做packaged smoke、实际下载安装授权及退出恢复。准备提交后仍须处理上述8项测试阻塞，按指南完成gh授权、同commit的CI演练及所选平台实机验收；缺证据时不Publish、不标完成，不以删除Release替代验收。
  - 发布条件：2026-10-03只读确认仓库仍为private，尚无Release workflow运行记录；private允许draft/Release，但产品匿名更新仍会404。公开仓库、发布准备commit/push及最终tag按用户授权执行，不自动更改可见性；操作见[开发指南](development.md#正式发布)。
