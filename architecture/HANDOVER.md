# Interceptor Handover

> Tracked commit: `a8115845`
> Branch: `main`
> 最后更新：2026-10-02

## Task List

- **8. Windows 实机验收 · 待验收**
  - 目标：确认已实现的跨平台功能在真实Windows上成立，尤其是UAC、原生窗口、WinINet和AppContainer，不能用macOS通过或native skip替代。
  - 范围：[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)中的CA/启动、系统代理/AppContainer、TLS/H2/gRPC、导入导出/取消、构建路径、最终产物及退出恢复。
  - 提交边界：用户于2026-10-01明确要求所有Windows实机验收统一归本项，不再作为其他item的提交blocker；其他item完成自身代码和可执行验收后可提交。Windows未执行、skip或失败仍如实保留，不改写为passed，也不免除发布产物本身的门禁。
  - 平台package迁移补验（原第11项）：在Windows从`@interceptor/platform-capabilities`构建WinINet、AppContainer和client-app helper，验证新开发资源路径与原随包路径、certutil/UAC、journal、互斥拒绝及无重放；执行所属native测试、Main/Core调用方、相关真实workflow及Windows package/audit/smoke。
  - 共享改动补验（原第16项）：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发、Rules/Composer原生导入取消与调用方均按Windows矩阵复验。已登录Edge的Bilibili完整刷新流程使用真实Windows UIA及现有登录状态，禁止注入Cookie或用macOS结果代替。
  - H2补验（原第14项）：在Windows执行源站正常GOAWAY响应断点、4 MiB正文/hash/trailer、新上游session与无重放，以及H2/gRPC/TLS、Core退出和最终产物恢复；macOS的公开API修复与验收已完成，不代替Windows实机结果。
  - 外部网络与产物：Windows纯Auto Detect/WPAD的流量路径及退出恢复归本项，没有PAC URL或显式代理的真实环境才算有效；第12项继续跟踪macOS兼容性。Windows最终安装产物的启动/签名/资源/安装升级卸载与恢复在实际产物就绪后验收，不以本机macOS包替代。
  - 已有/缺口：macOS结果已保存，Windows实机部分未执行。用户只排除了Manager管理员MMC原生打开/关闭专项，Manager功能、逻辑及UI没有排除。
  - 下一步：具备Windows环境并恢复验收授权后，按矩阵逐组保存真实UI、协议流量、trace及进程/系统设置恢复证据，再更新对应状态。

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

- **15. H2事件诊断 · 待实现/待验证**
  - 目标：在Diagnostics中看到真实H2协议事件并关联到请求，能判断哪一侧、哪个session/stream触发SETTINGS、RST_STREAM或GOAWAY；不是仅增加一条错误文案。
  - 范围：生产采集、方向/session/stream/协议字段和请求关联，复用现有Diagnostics存储、列表、筛选及详情，不另建页面或事件表格。
  - 已有/缺口：已有HTTP增量、trailer、abort及TLS/client-error等业务事件，但不等于原始H2帧；原始帧采集和可靠请求关联尚缺，Mockttp/patch采集暂缓。
  - 下一步：先确定真实采集点并取得必要的第三方修改授权，再验证事件关联、查询和脱敏导出。不能用测试origin回调、会缓冲全正文的completed事件或补0字段冒充生产数据，见[采集边界](features/diagnostics.md#h2事件采集范围)。

## 运行约束

- 第5项原生验收和第6项E2E/smoke已获授权；第9项于2026-10-01恢复本轮官方SDK兼容与Settings说明的实现、验证，其他暂停项不随之恢复。ClashX菜单必须真实操作，额外系统授权由用户处理，不放宽宿主恢复断言。
- 保留日常CA `D74D4BFB3C3708511A755AC6CD905840B464B255`、其他Root及获准常驻helper；不凭历史指纹清理，不卸载ClashX或helper。
- Electron/E2E/smoke共用`8888`和系统代理，必须串行；结束核对Main/Core/Worker、端口、journal及系统设置恢复。
- 保留已有7份stash和12份受保护文件，不重复apply/drop；清单为`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- 第三方修改仍须明确授权；不恢复临时诊断patch或未完成测试。
- Windows实机验收统一在第8项保留，不阻塞其他已满足自身门禁的item提交；本次据此收尾第11项。其他item的macOS失败、第三方授权、真实网络条件及发布凭据不因这一边界调整而解除。
- 未操作stash；旧的受保护文件清单在当前`/tmp`已不存在，未据此推测、恢复或清理任何文件。

## 第9项兼容验证与恢复

证据根目录：[本轮MCP session files](../../../.copilot/session-state/c53a7e2a-5f79-4e41-ba80-45c7b02c018a/files/item9-mcp-compat/)。
本节区分已通过、真实失败和环境阻塞；文件名包含`green`不代表其中结果一定通过，以JSON实际状态为准。

本轮交付按用户最终确认的范围收尾：官方SDK的`legacy: 'stateless'`兼容`2025-06-18`、`2025-11-25`，
保留`2026-07-28`；不加用户版本开关。HTTP响应的取消关联保持到流真正结束，2025取消通知通过SDK公开
handler按认证Client/协议/精确ID关联原业务，重复活跃ID显式拒绝并审计。Settings增加15语言说明，
同步34张设计图，四主题32场景/258目标parity无missing/flagged，新增说明14次测量几何/样式差异均0。
没有新增Playground模型配置、Agent Runtime、第三方patch或依赖。

当前开发Host是VS Code内Copilot CLI/SDK `1.0.73`。通过官方`code agent endpoints`、AHP
`root/configChanged`与Server启动动作自动完成配置/连接，真实Host公布`ready`和`mcp:// serverTools`。
当前Agent经该公开通道列出69项Tool，实际调用20种Tool共22次；六类业务代表查询、113字节自产正文/hash、
Cookie脱敏、App Deny/Allow/Auto、Composer自产POST仅一次、Clear及退出全部有实际断言。
`host-staged/verify-1241.json`为1 passed；Main18120/Core18172正常退出，8888/59821和journal恢复，
准备profile已删除，临时AHP Server停止并移除，原GitHub MCP保持ready。

验收边界不扩大：本轮不是69项Tool逐项真实Host验收；聊天工具搜索热刷新、Host自身审批UI、
其他Host、双Host并发与正式Tool中间进度SSE未验。单次取消、断连、凭据轮换和重启由三版
unit/integration及真实Electron/签名App workflow分别验证，不与本轮公开通道证据混写。
Windows实机继续归第8项。用户已授权本item通过后commit/push，Settings UI按用户要求提交后集中复审，
不写成人工已经确认。仅一份[改动说明](../commit-changes/202610020516_agent-mcp_protocol_stateless-compatibility.html)，
原始产品前后图内嵌、红框仅在报告层，1280/390px已打开检查。

| 范围 | 实际结果与证据 |
| --- | --- |
| 协议与说明前置 | `sdk-final-red.json`为7项协议拒绝、2026组5项Green；`main-protocol-red.json`为14项旧协议拒绝；`ui-copy-red.json`为说明缺失；`e2e-red.json`及同名目录保存3条真实Red及正常退出 |
| SSE headers取消关联 | `cancellation-red.json`保存2项凭据取消Red；`e2e-cancellation-red.json`保存真实Client断开后审批残留；`sdk-lifecycle-green.json`、`main-lifecycle-green.json`及后续真实E2E验证该问题已修复 |
| 历史产品测试 | `mcp-all-green.json`为56 passed；`desktop-mcp-final-green.json`为57 passed / 2 failed，作为单次取消修复前的失败保留；最终结果见下方10-02行 |
| 真实Electron已验部分 | `e2e-green.json`及同名目录为5条Green（说明、Browser CORS、三协议），8代metadata全部`gracefulDestroyVerified=true`；原流程包含断连、审批、Rules/HTTP/WebSocket数据面、凭据及重启，不包含后补单次取消步骤 |
| UI与类型 | `parity-complete.json`汇总四主题32场景/258目标、0 missing/flagged，14次说明测量几何和样式差异均0；全图平均pixel diff 2.1581%含设计画布边框及既有fixture文本差异。`workspace-typecheck.log`全workspace通过，`desktop-final-typecheck.log`包含新增取消测试/流程 |
| 设计与HTML | `design-preview/`保留实际改前/候选及完整展开图；`design-baseline/`为原28张Settings图，`design-green/`为34张同步图；新增warm/ember六张无旧基准，未伪造改前。`change-report-validation.json`及1280/390截图确认两张内嵌产品图、红框在图内、全部展开且无横向溢出 |
| 失败与重跑 | `sdk-red.json`、`main-red.json`是夹具错误，不计产品Red；早期parity的MCP/Tool状态残留已修复，页面加载/点击超时保留。最终分批32场景通过，不改阈值或基准来隐藏产品差异 |
| 产物与锁屏 | `package.log`、`package-audit.log`通过；`packaged-smoke.json/log`在macOS锁屏前置检查处失败，App未启动，不是产品smoke Green，也未修改系统设置 |
| 最终进程 | `final-process-restoration.json`记录12代测试App的24个Main/Core PID均不存在、8888可bind；逐代宿主代理/journal/证书恢复由原真实workflow guard验证 |
| 10-02取消前置 | `resume-20261002/main-single-cancel-red.json`、`e2e-single-cancel-red.json`分别为两版真实取消Red；`cancel-isolation-red.json`、`duplicate-id-red.json`及`cancel-protocol-isolation-red.json`保留隔离/重复ID回归失败 |
| 10-02代码与Electron Green | `resume-20261002/mcp-isolation-green.json`为60 passed、`main-isolation-green.json`为59 passed；`e2e-cancel-green.json`为5条Green/8代正常退出，包含新增单次取消。MCP/Desktop最终typecheck通过 |
| 当前Host尝试 | `resume-20261002/current-host/`第一轮停在等待真实Tool调用，VS Code重启后runner未生成最终JSON，metadata仍非graceful；保留profile `/var/folders/h5/jmc6085s1gb9cgqszq8qtc_00000gn/T/interceptor-e2e-workflow/60542-bvqAew`。`current-host-retry.json`明确为interrupted，metadata已graceful；两次均未调用真实Host Tool，不算通过 |
| Host配置清理 | `resume-20261002/host-config-cleanup.json`与`copilot-host-config-cleanup.json`确认仅移除本轮临时条目、恢复原配置存在性，不保留Token；不覆盖其他配置或修改Host私有RPC |
| 10-02产物与补验 | `resume-20261002/package-final.log`、`package-audit-final.log`和`packaged-smoke-final.json`均通过。`production-mcp-green.json`为4 passed / 1 failed，失败在2026第二代的原生Quit；`production-quit-recovery.json`证实通过产品Close后5个PID/原代理/journal/8888恢复，原失败保留。`production-modern-retry.json`第一代已正常退出，第二代因锁屏未启动 |
| HTML最终复查 | `resume-20261002/report-final-validation.json`及两张截图确认补充取消与Host流程说明后，1280/390px仍无溢出、图片内嵌且全部展开 |
| 10-02最终清理 | `resume-20261002/final-restoration.json`记录本轮20代metadata中的40个Main/Core PID均不存在，原失败metadata未改写；生产Quit失败代另有完整恢复证据。临时VS Code/Copilot配置均移除。通知资源释放后，另一会话重新占用8888，最终只读检查确认新PID不属于本item；不终止他方进程或覆盖其当前系统代理 |
| 10:00共享journal复核 | 第14项报告host guard拒绝后，第9项只读确认Main `78437`/Core `78475`仍存活并监听8888，profile为`77659-GFXRHQ`，不在第9项40个PID记录中；journal于09:57:10写入，当前代理等于`owned`而非`original`。`resume-20261002/journal-ownership-check-20261002.json`保存无敏感值摘要；未删除journal、未改代理、未终止App，已向所属协作会话核对profile归属 |
| `a8115845`后最终产物 | `final-a8115845/production-mcp.json`及同名目录保存三版协议/说明/Browser CORS的5条最终Green。`production-restoration.json`核对8代签名App正常退出、16个Main/Core PID均不存在、8888可用、journal不存在；逐代host guard全部通过。此次复用第14项完成的最新产物，不重建或替换Core。历史原生Quit及锁屏失败不改写 |
| 10:32当前Host等待 | `host-1032/results.json`明确为等待真实Host Tool调用10分钟超时，未执行MCP业务验收；`restoration.json`确认本次测试App正常退出、Main6243/Core6284不再存在、8888/57801释放、journal及临时凭据清除。`host-config-cleanup.json`确认只移除匹配的本轮Server并恢复原配置存在性；用户需配合下一次全新Host接入，不再复用已清理条目 |
| 官方AHP与SDK执行轮 | `host-ahp/ahp-configuration-result.json`及`host-idle-boundary/ahp-configuration-result.json`证明公开Host配置写入并回读成功，未取得新Tool；两次`results.json`均为等待真实Host调用超时。各自`ahp-cleanup.json`确认移除匹配条目；`host-idle-boundary/restoration.json`确认Main10989/Core11030正常退出、端口/journal/凭据清理。不把配置接受或执行轮解释当作真实互操作Green |
| 准备/执行拆分 | `host-staged/prepare.json`为实际prepare及默认fixture说明流程2条Green；`prepare-restoration.json`确认准备App退出、端口/journal恢复、隔离配置0600，明确准备当时`hostCallsVerified=false`。`host-staged/ahp-configuration-result.json`为正式Host配置回读；后续verify的真实结果单独记录，不能仅凭prepare提升状态 |
| 当前Host最终调用 | `host-staged/verify-1241.json`为1 passed；同名目录包含trace、Main/Renderer日志、原生恢复metadata和实际origin。`host-tools-list.json`及`host-<Tool>-<timestamp>.json`均经当前Host公开通道产生；`verification-summary.json`确认69项目录、20种Tool/22次调用、113字节正文/hash、Cookie脱敏、Composer POST一次、App裁决、Clear与正常退出，明确原生聊天工具搜索未验 |
| 最终测试与类型 | `host-staged/final-mcp-tests.json`为60 passed，`final-desktop-tests.json`为59 passed；`final-workspace-typecheck.log`为全workspace Green，包含prepare/verify driver及其调用方。工具/环境失败不计入这些Green |

复验入口与历史恢复说明：

- 用户解锁macOS并保持桌面可交互；不关闭或绕过锁屏检查，不代输密码。
- 单次取消的Red与最终Green、最新产物smoke、三协议签名App及当前Host公开通道最终Green均已取得，
  不需要假补故障。`host-staged`准备profile和Host条目在verify成功后已清理，历史URL/凭据不可复用。
- 后续复验重新运行prepare，取得新的隔离profile；当前Agent通过公开Host状态确认注册，再启动该profile
  并用公开Server启动/重连能力加载。配置、连接、目录、调用和聊天工具搜索分别判定，不调用SDK私有RPC、
  伪造用户消息或另起自制Agent冒充。
- 第14项已由`a8115845`独立提交；第9项只提交自己的兼容、UI、验收和文档，不混入第10/15项未提交记录。

```sh
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" INTERCEPTOR_E2E_MCP_HOST=copilot-cli INTERCEPTOR_E2E_MCP_HOST_VERSION=1.0.73 INTERCEPTOR_E2E_MCP_PHASE=prepare npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/mcp/current-host.workflow.ts --project macos
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/mcp/streamable-http.workflow.ts --project macos --grep '2026-07-28'
```

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

## 第16项验证与恢复

第16项按已授权边界完成，Windows实机与已登录Edge的Bilibili统一留在第8项；本项没有修改产品UI、Main/Core业务、第三方依赖或系统服务。

- HTTPS定位沿用已受信任的共享CA，断言Generate/Install不存在、Start decrypting可用但不执行，不因fresh profile重新生成或授信。
- 每代Page的TLS handler只操作本次取得的按钮节点并释放；节点消失不等待替代按钮，超时/页面错误仍抛出。原Windows click路径不变。
- 系统crash report确认原生GoTo的Return关闭路径在SCIM中触发`NSConcreteTextStorage ... Range or index out of bounds`，导致Open/Save XPC服务SIGILL退出；不是控件迟到。driver改为回读完整路径后真实双击原生建议表中唯一精确目标名，再点击原生OK/Cancel按钮，单/双击计数明确。
- 不切换应用语言或输入法，不写Accessibility值、不改dialog返回值、不预造导入文件；不宣称修复macOS系统服务。临时观察代码、递归控件扫描及失败方案均已移除。

证据根目录沿用上节session files，原失败与恢复记录保持：

| 范围 | 结果与证据 |
| --- | --- |
| 原生根因 | `item16-native-panel-crash-summary.json`关联Main 85032与XPC 85178及SCIM线程；`item16-native-{observation,focus-probe,output-probe,expanded,window-owner}.*`记录诊断失败，不作为产品Red |
| 失败补救 | 定向键盘及早期按钮函数试验失败由`item16-targeted-native-recovery.json`、`item16-mouse-native-recovery.json`证明真实Cancel后产品Quit完成，进程/8888/代理/journal/CA/Root恢复；不把补救改成E2E通过 |
| Rules/Composer | `item16-import-final/`：4条真实UI/Agent/MCP导入、导出、原生及预览取消、权限、重启零重放全部Green |
| 共享native调用方 | 14个调用文件、16个场景全部取得最终Green。先在`item16-native-consumers-final/`取得7条Green，文件任务一次窗口定位失败保留；该场景在`item16-transfer-panel-scope/`及`item16-transfer-repeat/`复验并连续3轮Green。其余Diagnostics/Rules 4场景见`item16-native-remaining/`，没有降低断言或延长测试期限 |
| 协议及Page生命周期 | 本轮HTTP/H2/gRPC/WebSocket/TLS导航5条既有Green仍适用；`item16-final-lifecycle/`最终再跑HTTPS定位、TLS/Edge系统信任、helper跨代复用及Settings只读4条Green |
| 类型与覆盖汇总 | `item16-workspace-typecheck.log`全workspace通过；`item16-final-verification.json`记录20个最终场景均passed、native调用方逐文件覆盖和每代metadata。仅改测试设施，未新增工具自身unit/integration，产品UI未改，parity不适用 |
| 最终宿主 | `item16-final-verification.json`：37代应用均按预期退出，74个记录PID均不存在，8888可bind，完整代理、journal、共享CA与Root恢复；获准常驻helper保留 |
| 改动说明 | [第16项HTML](../commit-changes/202610011120_docs_workflow_shared-fixture-validation.html)复用同一文件，1280/390px已打开核对，无外链资源、折叠内容或横向溢出 |

第10项已有framing故障、Windows-only fixture在macOS的失败和原有间接依赖审计告警仍按上节保留，不能以本项E2E Green将其改写为通过。复验原生导入入口：

```sh
npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/composer/collection-import.workflow.ts workflows/composer/tools-transfer.workflow.ts workflows/rules/import-tree.workflow.ts workflows/rules/tools-import.workflow.ts --project macos
```

## 第14项验证与恢复

第14项已完成代码与本机可执行验收。[Http2ClientService](../apps/proxy-core/src/proxy-core/http2-client/README.md)
由CoreApplication唯一启停，通过Node公开channel、`allowHalfOpen`和TLS/stream事件保留响应缓冲，
覆盖Proxy与Composer；不消费或复制完整正文、不重放请求、不改依赖或内部方法。真正提前EOF以
`ERR_H2_UPSTREAM_INCOMPLETE`失败，Core退出时注销订阅、取消检查并等待session关闭。
Windows实机部分按用户授权归第8项，不伪称已通过。功能边界与复现解释见
[Capture](features/capture.md#normal-goaway-gap)，单一[改动报告](../commit-changes/202610020950_core_http2_graceful-response-drain.html)只描述change。

| 范围 | 结果与证据 |
| --- | --- |
| 根因与边界 | `normal-goaway-probe.ts`、`item14-normal-goaway-matrix.json`与`item14-public-observation.json`确认已收到393216字节及END_STREAM trailer，销毁时327680字节未排空，客户端仅65536。Node24.21及Electron43.1/Node24.18均复现；无观测/只读观测结果一致，纯明文H2对照正常。普通不暂停、无GOAWAY暂停对照通过，384 KiB真实UI也曾通过，不推断每次GOAWAY必丢或真实站点发生率 |
| 正式前置Red | `item14-integration-red-final.json`为trailer、DATA.END、4 MiB、提前EOF四项Red；`item14-lifecycle-red-final.json`为无headers/部分正文EOF、并发和Core代际9项Red/7项对照Green。`item14-e2e-large-baseline/`保存真实UI仅65536/4194304字节、无end的Red及正常退出证据；Host matcher、Apply、锁屏或夹具类型失败不算产品Red |
| Core最终Green | `item14-final-63-tests.{json,log}`：H2、Composer、CoreApplication与TLS/H2生命周期63 passed、0 failed、0 skipped，含32 MiB正文/128 KiB窗口真实背压、取消、无headers EOF和跨代注销；Core/Desktop typecheck通过。早期socket proxy解绑访问的17个未处理错误保留，已预先保存公开解绑方法修正，非零退出不算Green |
| 本地真实E2E | `item14-e2e-green-resumed/`与`item14-e2e-related{,-resumed}/`最终覆盖正常GOAWAY、H2 Range/SETTINGS/双向错误GOAWAY、gRPC、TLS及断点退出5条；Main/Preload/Renderer/Core、真实origin/storage和退出恢复均经过实际流程 |
| 最终产物 | `item14-package.log`、`item14-package-audit.log`通过；`item14-packaged-smoke.{json,log}`为1 passed、0 skipped/errors，包含Core真实重启、安全/资源、既有16张截图与恢复。`item14-packaged-h2/`在最终签名App上再次通过同一4 MiB正常GOAWAY流程；客户端全量/hash/trailer/end、新上游session及两个POST各一次，未降低门禁 |
| 历史环境失败与恢复 | `item14-e2e-green.log`为第9项持有journal时的启动前拒绝，本项未启动App。首次相关H2在锁屏时退出failed，后续TLS未运行；解锁后通过Main78437真实原生Quit恢复，5个记录PID/完整代理/journal复核见`item14-h2-unlock-recovery.json`，原failed metadata不改写；H2/TLS随后独立复跑Green |
| 最终清理与提交边界 | `item14-final-verification.json`汇总6次最终workflow Green（5本地+1签名App）、25个历史/本轮记录PID全退，8888可bind、完整代理匹配此前不变基线、journal不存在；各workflow及smoke完成CA/Root恢复检查。dependency manifests与patches未改；不混入第9项或第15项调查。报告以既有Edge离线检查1280/390px，无外链资源、折叠或横向溢出；没有产品UI设计变更，parity不适用 |

复验同一产物不重新prepare；产物或相关代码变化后重新执行受影响的构建与门禁：

```sh
npm run test --workspace @interceptor/proxy-core -- src/proxy-core/http2-client/tests/integration/transport-lifecycle.test.ts src/proxy-core/proxy/tests/integration/h2.test.ts src/proxy-core/composer/tests/integration/send.test.ts src/proxy-core/tests/unit/core-application.test.ts --no-file-parallelism
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/capture/http2-origin-goaway.workflow.ts --project macos
```

## 复验入口

第5项恢复授权有效。先保存完整宿主基线，经ClashX真实菜单开启系统代理；结束后再经ClashX菜单恢复最初状态，核对完整代理/信任、进程、8888和journal。使用当前既有App，不重复prepare或改写产物：

```sh
EVIDENCE_DIR="$(mktemp -d /tmp/interceptor-item5-XXXXXX)"
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" PLAYWRIGHT_JSON_OUTPUT_FILE="$EVIDENCE_DIR/results.json" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/macos-upstream-proxy.workflow.ts workflows/settings/system-proxy-crash-recovery.workflow.ts --project macos --reporter=list,json --output="$EVIDENCE_DIR/traces"
```

[测试分层](platform/testing.md) · [功能与平台索引](README.md) · [协作与提交规则](../AGENTS.md)。push直连失败可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。
