# Interceptor Handover

> Tracked commit: `eee31544`
> Branch: `main`
> 最后更新：2026-09-29

## Task List

- **5. macOS journal：外部网络下的代理恢复 · blocked（缺验收环境）**
  - 目标：切换profile或App异常退出后，SystemProxyService仍能恢复接管前的系统代理；用户或VPN已改过配置时，不覆盖外部修改。
  - 范围：macOS全部活动network service的完整`original/owned/current`快照、用户级journal及原生效上游；不能只比较仍存在的service，或把不同网络服务的代理配置合并。
  - 已有：跨profile恢复、profile删除重建及service增删37/37通过；helper部署与正常退出已验，[已有证据](features/settings.md#item4-resumed-acceptance)仍有效。
  - 剩余/下一步：在VPN/TUN、动态切网和ClashX环境补接管、外部改写、退出及崩溃重启场景，核对完整代理和journal恢复。缺对应环境，普通loopback结果不能代替。

- **6. 删除产品 GitHub 登录 · 待确认**
  - 目标：去掉产品自身的GitHub登录及更新登录门槛，保留匿名检查版本、用户手动下载和打开安装器，不是删除更新功能。
  - 范围：Settings > Updates的GitHub access整组、Private/账号文案，以及Main的OAuth/Token和相关Preload接线；不动个人Git/CI凭据、固定更新来源或远端仓库可见性。
  - 已有：只有[浅深色前后图](../commit-changes/202609241039_ui_updates_remove-signin-preview.html)；产品仍使用GitHubAuthService和`authentication-required`状态，正式设计未变，见[当前契约](features/settings.md#4-更新)。
  - 剩余/下一步：先确认具体设计及匿名可访问的Release条件，再实施并验证检查/下载/打开与错误状态。通知中的真实下载、打开安装器仍缺专属E2E，需要可用Release和签名包。

- **8. Windows 实机验收 · 待验收**
  - 目标：确认已实现的跨平台功能在真实Windows上成立，尤其是UAC、原生窗口、WinINet和AppContainer，不能用macOS通过或native skip替代。
  - 范围：[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)中的CA/启动、系统代理/AppContainer、TLS/H2/gRPC、导入导出/取消、构建路径、最终产物及退出恢复。
  - 已有/缺口：macOS结果已保存，Windows实机部分未执行。用户只排除了Manager管理员MMC原生打开/关闭专项，Manager功能、逻辑及UI没有排除。
  - 下一步：具备Windows环境并恢复验收授权后，按矩阵逐组保存真实UI、协议流量、trace及进程/系统设置恢复证据，再更新对应状态。

- **9. VS Code/Copilot MCP互操作 · blocked（Host协议）**
  - 目标：真实VS Code/Copilot、Claude Desktop能够连接Desktop MCP并查询/调用Tool，不把名称为“VS Code E2E”的测试Client当成真实Host。
  - 范围：Host连接与协议协商、Tool目录/调用和审批、断连/重启；还须验证双Host读取同一Capture，以及实际需要中间消息的Tool通过同一POST返回SSE。
  - 已有/缺口：官方Client与Desktop传输已有验证；现有真实VS Code记录使用的协议是`2025-11-25`，与产品`2026-07-28`不兼容，未到`tools/list`。双Host和正式中间进度仍未验，见[Host证据](features/mcp.md#mcp-host-protocol-history)。
  - 下一步：先核对实际Host版本是否已支持，再按[MCP验收范围](features/mcp.md#9-验收要点)建立真实连接；不加legacy兼容，不把普通JSON响应或伪造进度算SSE通过。

- **10. HTTP编辑正文framing · blocked（第三方补丁待授权）**
  - 目标：HTTP断点Execute edited从UI到Core再到线上字节都遵守用户修改意图；用户显式header优先，只改header时不得改body。
  - 范围：H1/H2、请求/响应、Text/File，以及header-only、body-only、header+body；分别覆盖Content-Type、Content-Encoding、Content-Length、Transfer-Encoding的设置、删除和继承。
  - 已有/缺口：Text/File与UI effect已接入，但两条chunked测试仍Red：请求被补Content-Length并删chunked，响应出现Content-Length与Transfer-Encoding共存；完整wire矩阵未齐。
  - 下一步：取得第三方修改授权后，修复Mockttp补丁两处无条件Content-Length覆盖，再按[编辑契约与缺陷证据](features/http-message-editing.md)补矩阵和真实UI验证。不能靠修改用户headers、重放或UI成功掩盖wire错误。

- **11. 平台能力package整理 · 待确认**
  - 目标：把已验证的平台能力从Main内聚合目录迁入内部`@interceptor/platform-capabilities`，明确原生调用、DTO、错误及支持边界，而不是重写平台业务。
  - 范围：系统代理/journal、证书系统信任、客户端应用查询、Windows AppContainer和同包native资源；Main保留App/审批编排，Core保留Capture关联，Renderer仍只走Preload。
  - 已有/缺口：[Main平台入口](../apps/desktop/src/main/platform-capabilities/README.md#业务边界)已聚合；[独立package](../packages/platform-capabilities/README.md)只有workspace元数据、README、目录和lockfile，无入口或生产引用。规划须按当前实现校准，不能恢复已删除的操作队列。
  - 下一步：先确认迁移范围和顺序，再逐模块搬迁实现、资源构建/定位及调用方，并保留Windows行为和授权边界。macOS连接归属/图标仍未实现，不因拆包默认承诺补齐，也不把内部package变成独立安装或更新器。

- **12. WPAD · 待验证**
  - 目标：弄清系统仅开启Auto Detect（通过WPAD自动发现代理）时，Interceptor接管后实际走哪条上游、是否仍能出网，以及退出能否恢复原配置。
  - 范围：没有显式代理地址、没有PAC URL的真实环境，不用手工填PAC的场景代替；此项是兼容性验收，不代表已决定新增WPAD发现实现。
  - 已有/缺口：Windows当前没有可交给proxy-agent的URL，按直连处理；macOS只有Auto Detect而无PAC时在接管前拒绝。显式代理/PAC支持不证明WPAD支持，见[上游契约](features/settings.md#34-上游代理链式转发)与[macOS边界](features/settings.md#macos-effective-upstream)。
  - 下一步：取得纯Auto Detect环境后，比较接管前后的实际流量路径、错误和恢复结果；若确认能力缺口，再明确方案与授权，不先写成“WPAD已支持”。

- **13. 首个真实tag release · 待验收**
  - 目标：走通真实tag触发的发布流程，让用户拿到可验证的Windows/macOS安装产物，而不只是本机package能启动。
  - 范围：版本/tag、CI构建、Windows签名与MSI、macOS Developer ID/公证与DMG/ZIP、artifact audit/产物smoke及Release assets；诊断文件不进入发布资产。
  - 已有/缺口：Forge makers、签名配置和发布CI已有实现；当前macOS本地包及smoke通过不等于Developer ID、公证或首个真实tag发布通过。
  - 下一步：具备签名/公证凭据并确认发布tag后，按[发布说明](platform/release.md)验收产物与安装/退出，再发布；发布CI凭据与第6项产品GitHub登录删除相互独立。

- **14. H2源站正常GOAWAY · blocked（第三方生命周期修复待授权）**
  - 目标：源站发送`GOAWAY(NO_ERROR)`后，旧session的在途stream完整收尾，新请求改用新上游连接，Capture仍保留正确正文、trailer与终态。
  - 范围：源站正常GOAWAY，不是已验证的客户端GOAWAY或非零错误GOAWAY；新连接成功不能掩盖旧请求丢尾段，也不能重放旧请求。
  - 已有/缺口：Node和Electron内嵌Node均复现旧stream只收到262144/393216字节，无end/trailer；后续新session正常。定向3通过/1失败，诊断指向暂停缓冲未排空就销毁，见[事实与证据](features/capture.md#normal-goaway-gap)。
  - 下一步：保留未提交的[h2.test.ts](../apps/proxy-core/src/proxy-core/proxy/tests/integration/h2.test.ts)，取得第三方生命周期修改授权后修复，再验完整字节、trailer、Capture终态和无重放；不假补EOF或改全量缓冲。

- **15. H2事件诊断 · 待实现/待验证**
  - 目标：在Diagnostics中看到真实H2协议事件并关联到请求，能判断哪一侧、哪个session/stream触发SETTINGS、RST_STREAM或GOAWAY；不是仅增加一条错误文案。
  - 范围：生产采集、方向/session/stream/协议字段和请求关联，复用现有Diagnostics存储、列表、筛选及详情，不另建页面或事件表格。
  - 已有/缺口：已有HTTP增量、trailer、abort及TLS/client-error等业务事件，但不等于原始H2帧；原始帧采集和可靠请求关联尚缺，Mockttp/patch采集暂缓。
  - 下一步：先确定真实采集点并取得必要的第三方修改授权，再验证事件关联、查询和脱敏导出。不能用测试origin回调、会缓冲全正文的completed事件或补0字段冒充生产数据，见[采集边界](features/diagnostics.md#h2事件采集范围)。

- **16. 共享改动全量复验 · blocked（Windows及外部场景）**
  - 目标：确认共享代码和fixture改动没有只修好某个弹窗、却破坏其他调用方；这是跨功能交付检查，不是新feature，也不重新打开已完成的第4项。
  - 范围：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发、导入取消及其调用方；检查真实流程与退出恢复，不能仅靠fake Preload parity。
  - 已有：Mac全量430态parity、最终签名包启动/smoke及gRPC Copy/焦点通过。剩Windows与已登录Edge的Bilibili流程；HTTPS弹窗定位专项仍暂停，其fresh CA Generate断言与当前共享CA基线不符。
  - 下一步：恢复相应验收授权后，按影响清单补未验平台/场景；Windows按第8项矩阵执行，HTTPS专项先修正准备前提。保留各调用方及宿主恢复证据，不另拆feature commit。

## Verification

以下是已保存的验收结果，本次仅整理文档，没有重跑测试。

| 范围 | 当前有效结论 | 详细证据 |
| --- | --- | --- |
| 正文与消息 | `4e766148`已push；全workspace类型、303项相关测试、16条真实E2E通过 | [正文验收](features/capture.md#body-preview-final-acceptance) |
| 最终macOS包 | 授权ready；package/audit/严格签名、两代启动1/1、smoke1/1和16张截图通过 | [产物与退出](features/capture.md#body-preview-final-acceptance) |
| UI parity | 430态3169目标，0 missing/flagged，最大差0.859375px | [分阶段证据](features/capture.md#正文分阶段证据索引) |
| 共享CA与宿主 | 跨profile及删除profile后保留1/1；日常CA、完整代理保持，App全退、8888释放、无journal | [CA验收](features/settings.md#platform-verification-evidence) |
| 文档 | `15c80698`已push；22份核对、40组事实及11锚点承接，244/244链接通过 | [文档验证](README.md#文档整理验证) |

## 运行约束

- 当前仅整理文档；用户要求暂停全部E2E（含packaged smoke）、不启动App，须明确恢复授权后才能执行。
- 保留日常CA `D74D4BFB3C3708511A755AC6CD905840B464B255`、其他Root及获准常驻helper；不凭历史指纹清理，不卸载ClashX或helper。
- Electron/E2E/smoke共用`8888`和系统代理，必须串行；结束核对Main/Core/Worker、端口、journal及系统设置恢复。
- 保留已有7份stash和12份受保护文件，不重复apply/drop；清单为`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- 只有第14项诊断测试保留为未提交代码，不混入其他item；第三方修改仍须明确授权。

## 复验入口（暂停执行）

以下命令仅备查，当前不执行。恢复授权后使用当前最终包串行复验，不重复prepare或改写产物：

```sh
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/helper-startup.workflow.ts --project macos
npm run test:smoke --workspace @interceptor/desktop
```

[测试分层](platform/testing.md) · [功能与平台索引](README.md) · [协作与提交规则](../AGENTS.md)。push直连失败可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。
