# Interceptor Handover

> Tracked commit: `13b22ec7`
> Branch: `main`
> 最后更新：2026-10-01

## Task List

- **8. Windows 实机验收 · 待验收**
  - 目标：确认已实现的跨平台功能在真实Windows上成立，尤其是UAC、原生窗口、WinINet和AppContainer，不能用macOS通过或native skip替代。
  - 范围：[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)中的CA/启动、系统代理/AppContainer、TLS/H2/gRPC、导入导出/取消、构建路径、最终产物及退出恢复。
  - 提交边界：用户于2026-10-01明确要求所有Windows实机验收统一归本项，不再作为其他item的提交blocker；其他item完成自身代码和可执行验收后可提交。Windows未执行、skip或失败仍如实保留，不改写为passed，也不免除发布产物本身的门禁。
  - 平台package迁移补验（原第11项）：在Windows从`@interceptor/platform-capabilities`构建WinINet、AppContainer和client-app helper，验证新开发资源路径与原随包路径、certutil/UAC、journal、互斥拒绝及无重放；执行所属native测试、Main/Core调用方、相关真实workflow及Windows package/audit/smoke。
  - 共享改动补验（原第16项）：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发、Rules/Composer原生导入取消与调用方均按Windows矩阵复验。已登录Edge的Bilibili完整刷新流程使用真实Windows UIA及现有登录状态，禁止注入Cookie或用macOS结果代替。
  - 外部网络与产物：Windows纯Auto Detect/WPAD的流量路径及退出恢复归本项，没有PAC URL或显式代理的真实环境才算有效；第12项继续跟踪macOS兼容性。Windows最终安装产物的启动/签名/资源/安装升级卸载与恢复在实际产物就绪后验收，不以本机macOS包替代。
  - 已有/缺口：macOS结果已保存，Windows实机部分未执行。用户只排除了Manager管理员MMC原生打开/关闭专项，Manager功能、逻辑及UI没有排除。
  - 下一步：具备Windows环境并恢复验收授权后，按矩阵逐组保存真实UI、协议流量、trace及进程/系统设置恢复证据，再更新对应状态。

- **9. VS Code/Copilot MCP互操作 · blocked（Host协议）**
  - 目标：真实VS Code/Copilot、Claude Desktop能够连接Desktop MCP并查询/调用Tool，不把名称为“VS Code E2E”的测试Client当成真实Host。
  - 范围：Host连接与协议协商、Tool目录/调用和审批、断连/重启；还须验证双Host读取同一Capture，以及实际需要中间消息的Tool通过同一POST返回SSE。
  - 当前阻塞：已安装VS Code `1.139.0`及Copilot Chat `0.67.0`仍使用MCP `2025-11-25`，与产品`2026-07-28`不兼容；Claude Desktop未安装。官方Client结果不能替代真实Host，双Host与中间进度仍未验。
  - 下一步：需要支持产品协议的真实Host，再按[MCP验收范围](features/mcp.md#9-验收要点)建立真实连接；不加legacy兼容，不把普通JSON响应或伪造进度算SSE通过。

- **10. HTTP编辑正文framing · blocked（第三方补丁待授权）**
  - 目标：HTTP断点Execute edited从UI到Core再到线上字节都遵守用户修改意图；用户显式header优先，只改header时不得改body。
  - 范围：H1/H2、请求/响应、Text/File，以及header-only、body-only、header+body；分别覆盖Content-Type、Content-Encoding、Content-Length、Transfer-Encoding的设置、删除和继承。
  - 当前缺陷：Text/File与UI effect已接入，但chunked请求被补Content-Length并删chunked，响应出现Content-Length与Transfer-Encoding共存；完整wire矩阵未齐。
  - 下一步：取得第三方修改授权后，修复Mockttp补丁两处无条件Content-Length覆盖，再按[编辑契约与缺陷证据](features/http-message-editing.md)补矩阵和真实UI验证。不能靠修改用户headers、重放或UI成功掩盖wire错误。

- **12. WPAD · 待验证**
  - 目标：弄清系统仅开启Auto Detect（通过WPAD自动发现代理）时，Interceptor接管后实际走哪条上游、是否仍能出网，以及退出能否恢复原配置。
  - 范围：没有显式代理地址、没有PAC URL的真实环境，不用手工填PAC的场景代替；此项是兼容性验收，不代表已决定新增WPAD发现实现。
  - 已有/缺口：Windows当前没有可交给proxy-agent的URL，按直连处理；macOS只有Auto Detect而无PAC时在接管前拒绝。显式代理/PAC支持不证明WPAD支持，见[上游契约](features/settings.md#34-上游代理链式转发)与[macOS边界](features/settings.md#macos-effective-upstream)。
  - 下一步：取得macOS纯Auto Detect环境后，比较接管前后的实际流量路径、错误和恢复结果；Windows实机部分统一归第8项。若确认能力缺口，再明确方案与授权，不先写成“WPAD已支持”。

- **13. 首个真实tag release · 待验收**
  - 目标：走通真实tag触发的发布流程，让用户拿到可验证的Windows/macOS安装产物，而不只是本机package能启动。
  - 范围：版本/tag、CI构建、Windows签名与MSI、macOS Developer ID/公证与DMG/ZIP、artifact audit/产物smoke及Release assets；诊断文件不进入发布资产。
  - 已有/缺口：Forge makers、签名配置和发布CI已有实现；当前macOS本地包及smoke通过不等于Developer ID、公证或首个真实tag发布通过。
  - 下一步：具备签名/公证凭据并确认发布tag后，按[发布说明](platform/release.md)验收产物与安装/退出，再发布；发布CI凭据与第6项产品GitHub登录删除相互独立。

- **14. H2源站正常GOAWAY · blocked（第三方生命周期修复待授权）**
  - 目标：源站发送`GOAWAY(NO_ERROR)`后，旧session的在途stream完整收尾，新请求改用新上游连接，Capture仍保留正确正文、trailer与终态。
  - 范围：源站正常GOAWAY，不是已验证的客户端GOAWAY或非零错误GOAWAY；新连接成功不能掩盖旧请求丢尾段，也不能重放旧请求。
  - 当前缺陷：旧stream正文被截断且缺少end/trailer，后续新session正常；诊断指向暂停缓冲未排空就销毁，见[已知限制](features/capture.md#normal-goaway-gap)。
  - 下一步：取得第三方修改授权后，在原有[h2.test.ts](../apps/proxy-core/src/proxy-core/proxy/tests/integration/h2.test.ts)补正式回归，并验证完整字节、trailer、Capture终态和无重放；不假补EOF或改全量缓冲。

- **15. H2事件诊断 · 待实现/待验证**
  - 目标：在Diagnostics中看到真实H2协议事件并关联到请求，能判断哪一侧、哪个session/stream触发SETTINGS、RST_STREAM或GOAWAY；不是仅增加一条错误文案。
  - 范围：生产采集、方向/session/stream/协议字段和请求关联，复用现有Diagnostics存储、列表、筛选及详情，不另建页面或事件表格。
  - 已有/缺口：已有HTTP增量、trailer、abort及TLS/client-error等业务事件，但不等于原始H2帧；原始帧采集和可靠请求关联尚缺，Mockttp/patch采集暂缓。
  - 下一步：先确定真实采集点并取得必要的第三方修改授权，再验证事件关联、查询和脱敏导出。不能用测试origin回调、会缓冲全正文的completed事件或补0字段冒充生产数据，见[采集边界](features/diagnostics.md#h2事件采集范围)。

- **16. 共享改动全量复验 · blocked（macOS原生Save）**
  - 目标：确认共享代码和fixture改动没有只修好某个弹窗、却破坏其他调用方；这是跨功能交付检查，不是新feature，也不重新打开已完成的第4项。
  - 范围：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发、导入取消及其调用方；检查真实流程与退出恢复，不能仅靠fake Preload parity。
  - Windows移交：Windows实机、已登录Edge的Bilibili及对应退出恢复统一归第8项，不作为本项提交blocker，也不视为已通过。
  - 当前阻塞：macOS原生Save/GoTo尚未取得完整导出导入Green；本项fixture修正、定位及复验记录仍在工作区，未混入第11项提交。
  - 下一步：完成macOS原生窗口及剩余Rules/Composer调用方验收，保留真实文件、trace与宿主恢复证据，再提交本项。

## 运行约束

- 第5项原生验收和第6项E2E/smoke已获授权；其他暂停项不随之恢复。ClashX菜单必须真实操作，额外系统授权由用户处理，不放宽宿主恢复断言。
- 保留日常CA `D74D4BFB3C3708511A755AC6CD905840B464B255`、其他Root及获准常驻helper；不凭历史指纹清理，不卸载ClashX或helper。
- Electron/E2E/smoke共用`8888`和系统代理，必须串行；结束核对Main/Core/Worker、端口、journal及系统设置恢复。
- 保留已有7份stash和12份受保护文件，不重复apply/drop；清单为`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- 第三方修改仍须明确授权；不恢复临时诊断patch或未完成测试。
- Windows实机验收统一在第8项保留，不阻塞其他已满足自身门禁的item提交；本次据此收尾第11项。其他item的macOS失败、第三方授权、真实网络条件及发布凭据不因这一边界调整而解除。
- 未操作stash；旧的受保护文件清单在当前`/tmp`已不存在，未据此推测、恢复或清理任何文件。

## 第11项验证与恢复

第11项已按调整后的边界完成：[package入口](../packages/platform-capabilities/README.md#业务边界)拥有系统代理/journal、证书、AppContainer、client-app和同包native资源；原Main实现删除，Main保留Electron/审批适配，Core保留缓存和Capture关联，Renderer仍只走Preload。各module继续独占操作状态、冲突立即拒绝，不恢复操作队列；不新增macOS应用归属/图标或独立安装更新器。

证据根目录：[2026-10-01 session files](../../../.copilot/session-state/b55a8e5f-690e-4cbf-b40d-f163d03e4e6e/files/)。私有原始代理快照不进入commit或HTML；Windows实机验收移交第8项，未执行/skip不改写为通过。

| 范围 | 结果与证据 |
| --- | --- |
| 迁移前基线 | 平台315、Core客户端归属12、协议25、Main/诊断20项Green；`item11-{platform,client-app,protocol,main,diagnostics}-baseline.*` |
| 迁移后与共享调用方 | 平台223+Main106项Green，平台原有315项按package/Main的223+92分布保持，另14项Main配置/诊断通过；`item11-{platform,main}-green.*`。最终全workspace typecheck及Tools447/Agent122/MCP43通过，见`workspace-typecheck-final.log`、`shared-callers-tests-final.log` |
| 构建与原生 | 9份native源码及已安装helper身份不变；package与artifact audit通过，见`item11-native-{build.log,identity.json}`、`item11-package.log`、`item11-package-audit-resume.log` |
| 真实开发E2E | helper复用、跨profile代理crash恢复和六项Settings只读Tool共3条Green，包含每代退出与宿主恢复；`item11-e2e/` |
| 生产smoke | 首轮授权等待失败原样保留于`item11-smoke/`；12:36复用同一App，经产品`request-installation`完成准入，生产/开发均ready，packaged smoke Green及16张既有截图见`item11-smoke-resume/`、`item11-production-smoke-status.json`，没有重建或绕过安全校验 |
| 生产真实E2E | 显式生产App执行共享CA跨fresh profile、helper跨代复用、代理crash恢复及Settings只读Tool共4条Green，`item11-production-workflows/`保留8代metadata/trace；crash首代明确abrupt，其余graceful |
| 最终恢复 | `item11-production-final-evidence.json`确认21个观察PID均不存在、8888可bind、journal不存在、完整代理/CA/Root恢复，helper字节未变、开发授权保留 |
| 扩展检查的既有问题 | `item16-shared-tests.log`：proxy-core 440 passed/2 failed，失败是第10项已有chunked framing；desktop 865 passed/5 failed，失败是未改Windows文件窗口fixture在macOS的平台检查。平台另有2项Windows native skip，统一归第8项；不改实现或测试规避结果 |
| 依赖审计 | `runtime-dependency-audit.json`记录dompurify 1 low、hono/ip-address/socks 3 moderate，无high/critical；未升级依赖或修改第三方行为，不宣称audit通过 |
| 改动说明 | [第11项HTML](../commit-changes/202610011120_main_platform-capabilities_package-migration.html)已检查1280/390px，无横向溢出、外链资源或折叠内容 |

当前`apps/desktop/out/Interceptor-darwin-x64/Interceptor.app`已完成生产准入及smoke，无需重复授权；首轮失败profile保留为证据，所属App已退出。复验同一产物直接执行以下命令，不运行prepare覆盖产物；若代码/依赖/环境/产物改变，须重跑受影响验证。

```sh
npm run test:smoke --workspace @interceptor/desktop
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/helper-startup.workflow.ts workflows/settings/certificate-startup.workflow.ts workflows/settings/system-proxy-crash-recovery.workflow.ts workflows/settings/tools-readonly.workflow.ts --project macos
```

## 复验入口

第5项恢复授权有效。先保存完整宿主基线，经ClashX真实菜单开启系统代理；结束后再经ClashX菜单恢复最初状态，核对完整代理/信任、进程、8888和journal。使用当前既有App，不重复prepare或改写产物：

```sh
EVIDENCE_DIR="$(mktemp -d /tmp/interceptor-item5-XXXXXX)"
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" PLAYWRIGHT_JSON_OUTPUT_FILE="$EVIDENCE_DIR/results.json" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/macos-upstream-proxy.workflow.ts workflows/settings/system-proxy-crash-recovery.workflow.ts --project macos --reporter=list,json --output="$EVIDENCE_DIR/traces"
```

[测试分层](platform/testing.md) · [功能与平台索引](README.md) · [协作与提交规则](../AGENTS.md)。push直连失败可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。
