# Interceptor Handover

> Tracked commit: `a7b02a2c`
> Branch: `main`
> 最后更新：2026-09-21

## Task List

- [ ] **blocked · VS Code Copilot MCP互操作**：Host基础MCP协议与产品要求的`2026-07-28`不匹配；需Host支持后按[MCP矩阵](features/mcp.md)复验。
- [ ] **待验证 · HTTP Execute edited wire correctness**：H1/H2的`Content-Length`、`content-encoding`、`transfer-encoding`与framing矩阵由原负责session继续。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
- [ ] **进行中 · macOS系统代理与E2E验收**：第4步业务E2E已通过3/9；尚未整体完成。
	- 当前执行：代码完成 · 待E2E。自动trust/临时规则/恢复记录已删除；产品3 Red→同组63/63、准确范围247 passed/2 Windows native skipped，类型和package/audit通过。真实取消前置Red及宿主恢复已取得，最新smoke/E2E因用户不在场未运行。
	- 授权目标：常驻root helper只做可执行的系统代理与公开CA存取；trust/untrust走普通用户前台原生进程及系统确认，不再尝试修改授权规则。
	- 授权范围：上一版组件已获用户确认；本次helper字节变化需重新核准。trust/untrust始终是独立系统确认，不代输凭据或重复尝试，Windows现行路径与业务断言保持。
	- 新授权边界：删除`AuthorizationRightSet`临时规则分支、恢复记录、后台trust/untrust及自动回退，不保留旧实现；不改SIP、共享认证规则或私有entitlement。规则完整内容前后必须不变。
	- 提交边界：沿用用户“可以先提交代码”的中间进度授权及逐项提交指令，只保存本item的自动trust删除、对应验证和平台归属说明；余6条E2E及阻塞保留，暂停UI、package骨架和证书迁移排除并原样保留。
	- 实现约束：自有数据直接使用当前结构，不加版本分支、兼容层或迁移代码。
	- 上游进度：基础ClashX链式转发已验；防自环7 Red→同组32/32，typecheck、重打包和audit通过；外部改写等尾项保留。
	- 已完成：
		- 当前无授权E2E 8/8：原7条代理/恢复流程，以及Finder Reveal公开证书。
		- helper开发/生产双入口复用已验，阶段提交`6006bdfe`。
		- 既有E2E基线：同步前65/65；同步后7条定向通过，不代表最新全量通过。
		- 前台helper成功授信/撤销、取消回滚真实E2E各1/1；开发组件已核准。
		- 前一阶段产物smoke 1/1、helper授信/撤销及取消2/2、TLS/H2/gRPC业务3/3；不覆盖本轮删除后的产物。
		- 准确提交树：Desktop242 passed/2 Windows native skipped、Core上游36/36、协议25/25，两workspace类型通过；同源码Core全组既有107/107。
	- 待完成：
		- 待确认 · CA独立存放：两端目前均为userData/certificates；同一OS账户跨profile复用CA尚未实现。此前仅复制CA文件的测试方案未授权、未实施，不默认放宽零seed要求。
		- 待修 · macOS恢复journal仍在profile，Windows已在用户级固定目录；本轮只确认差异，未移动路径。不能把OS代理状态与恢复文件混为一谈。
		- 第4步余6条：TLS passthrough跳转、TLS兼容性、MITM跨进程持久化。
		- 第4步余6条（续）：Settings TLS Tools、Certificate Tools、Agent body-messages。
		- TLS Tool/MITM持久化及证书Tool清点/Finder已接平台fixture；完整授信组待复验。
		- macOS View只启动Keychain Access，未取得可归属窗口；外部查看及完整证书Tool待人工确认。
		- 外部上游停止/恢复、ClashX改写系统代理及特殊网络配置联调。
		- 历史CA：只读发现1张未受信任证书；归属未确认，尚未删除。
		- root卸载、安装/更新失败rollback实机验收。
	- 角色：
		- Main：任务编排、Core配置同步、状态通知与退出协调。
		- Core：listener、代理转发、TLS/MITM。
		- 常驻root helper：系统代理、公开CA导入/删除；无trust/untrust或授权规则写入。
		- 普通用户前台helper：直接trust/untrust及系统确认；不等于复用root授权。
		- 用户：系统要求的Touch ID/密码确认；E2E不得代输。
	- 阻塞/暂停：
		- 本轮组件更新blocked：新helper与已安装旧版字节不同，两入口outdated；用户暂不在场，不重复触发确认。旧helper876仍在运行，删除代码不等于已部署。
		- 旧成功workflow失败于Uninstall后15秒等待；本次仅macOS专项改为120秒，类型及发现检查通过，真实撤销待验。旧1 passed/1 failed不改写为2/2。
		- 已放弃的自动方案：root helper876规则写入均返回`-60005`，独立直连复验同样拒绝；本次删除该路径，不再把13/14实机尝试列为待办。[历史证据](features/settings.md#macos-validation-history)。
		- TLS passthrough导航续验失败于安装30秒等待；本轮CA随后留在系统，已按失败截图精确指纹经helper撤销/删除，其他证书与代理保持、App已退、8888释放。证据`/tmp/interceptor-macos-navigation-20260920-resumed/recovery.json`，不计Green。
		- Agent body-messages发现清单与当前registry不一致；未改共享断言，仍待处理。
		- ClashX外部改写driver三次未通过，停在原生菜单切换；宿主已恢复，待人工联调，不再自动重试。
		- [上游证据与CA清点](features/settings.md#macos-effective-upstream)。
		- HTTPS弹窗动画/定位暂停；Bilibili登录待账号与平台driver适配。
		- Windows原生复验后置；3条Windows专属AppContainer不计macOS欠账。
	- [验证结果](#verification) · [恢复命令](#恢复命令) · [历史证据](features/settings.md#macos-validation-history)。
- [ ] **待确认 · 平台能力 package 整理**：继续迁移暂停，独立workspace后置。
	- 已归类：系统代理/信任库、macOS组件通信与部署、Windows应用信息/图标及AppContainer。归类完成不代表双平台验收完成。
	- 仅本地暂停：CA实现/错误类/9项integration的目录迁移；private package骨架及lockfile，均不纳入本次提交。
	- 待整理：CA入口/类型、SecureStore契约、Core原生runner、Main证书查看器/管理器；复核supported/ready/authorized边界，保持原Windows契约。
	- profile外现状：OS代理与系统CA/trust、macOS常驻helper及批准、两端App原生资源；Windows恢复journal也在profile外。
	- profile内且两端一致：规则/集合/TLS名单/MITM意图、Agent/MCP会话与凭据、Tool授权、Renderer偏好和诊断。CA当前也在profile，但不属于已决定必须如此的业务数据。
	- 实际不一致：macOS journal跟profile；缺连接归属/应用图标；证书View目标窗口未验。AppContainer仅Windows适用，原生API/系统授权差异不强行统一。
	- Main继续编排/通知/缓存；Core继续TLS/流量/应用归属缓存；Electron适配及各feature凭据格式不迁入root helper。Forge/发布/E2E driver仍归工程验收。
	- 实施边界：
		- 平台模块不等于root helper；CA生成不提权，私钥/token不交给特权服务。
		- Windows/macOS统一调用语义，不强行统一原生命令和授权步骤。
		- 平台模块不依赖Electron；Core不得反向依赖Desktop。
		- 保留CA格式、Windows命令/数据契约、两端IPC/MCP及真实E2E契约。
		- helper仅随App安装升级；不付费、不建项目密钥或独立更新器。
		- package骨架、对应lockfile及证书目录迁移未纳入macOS阶段提交；本item未提交。
	- 逐项说明：[谁执行](../apps/desktop/src/main/platform-capabilities/README.md#谁执行)、[profile外](../apps/desktop/src/main/platform-capabilities/README.md#profile外状态当前可复用)、[profile内](../apps/desktop/src/main/platform-capabilities/README.md#profile内状态两端业务隔离一致)、[差距](../apps/desktop/src/main/platform-capabilities/README.md#当前差距与必要差异)。
	- [验证结果与缺口](#verification)。
- [ ] **待验证 · WPAD**：尚缺纯Auto Detect环境验收；仅启用Auto Detect、没有显式代理或PAC URL时按直连处理。[详情](features/settings.md#34-上游代理链式转发-已实现仅-windows)。
- [ ] **待验收 · 首个真实 tag release**：签名、公证配置及Windows/macOS CI产物发布仍需完成验收。[发布说明](platform/release.md)。
- [ ] **待验证 · H2源站正常GOAWAY**：源站以`NO_ERROR`通知关闭连接时，验证既有stream收尾、新请求换用上游连接及Capture记录；客户端正常GOAWAY不代替此方向。[现有覆盖](features/capture.md#h2-range与多stream集成)。
- [ ] **待实现/待验证 · H2事件诊断**：复用现有Diagnostics列表、筛选和详情，不另建H2页面；仍缺生产原始帧事件及可靠的请求关联，涉及Mockttp/patch的采集改动按当前要求暂缓。[范围](features/diagnostics.md#h2事件采集范围)。

## Constraints

- 当前开发环境为macOS x64；已有Windows验收记录不代替macOS原生helper、Authorization、系统设置恢复、签名和公证验收。
- 用户按开源项目维护，明确不加入付费Apple Developer Program；不能将购买Developer ID签名/公证资格作为当前开发和E2E的前提，不推进依赖该资格的新helper方案。免费本地构建或ad-hoc签名不等于Apple公证，也不自动消除系统操作授权。现有tag release签名门禁仍保留，若调整开源分发策略须另行确认，不在本轮改发布配置。
- 开发实例、真实Electron E2E和packaged smoke共用`8888`及系统代理，不能并行；测试须由对应平台宿主guard管理进程和系统代理恢复。
- 原生Open/Save、证书授权等流程需要可交互桌面；UAC提示由本机用户处理，不能无人值守代输凭据。
- 历史约束要求保留stash `wip: Windows App WVD gateway bypass`；2026-09-19同步前实际stash列表为空，未删除用户stash。保护备份`5baff562`、`0920afba`保留；本次`938ee726`中的排除项已原样恢复、19项文件状态核对一致，stash保留且勿重复apply。
- 自动trust checkpoint `a7b02a2c`的19项排除修改已从`f2875e79`原样恢复，哈希/删除状态全部一致，index为空；清单位于`/tmp/interceptor-macos-auto-trust-checkpoint-20260920-aiEFuE/preserved.json`。该stash及旧备份保留，勿重复apply。

## Verification

| 范围 | 结果 | 缺口 |
| --- | --- | --- |
| 删除自动trust | 产品3 Red→native37/37、信任库26/26；准确范围247 passed/2 Windows native skipped，类型/Swift构建通过；真实取消前置Red，Main54482/Core54495正常退出、完整规则不变 | Windows native未运行；最新最终取消/成功E2E未运行 |
| 本轮新产物 | package/audit1487文件、339464410字节；ASAR无自动授权分支，新helper SHA-256以4499f582开头 | 部署blocked：机器仍为旧helper876，两入口outdated；用户不在场，未启动新smoke/E2E，不记失败或通过 |
| 运行时依赖 | `npm audit --omit=dev`：0漏洞 | 未更改依赖或lockfile |
| 证书路径迁移 | 本地前后70/70；typecheck通过 | 本次不提交；入口/类型整理后置 |
| macOS上游 | 原生37/37、接管/journal32/32、Core上游36/36；ClashX基础链式转发Green | 外部改写driver失败；停止/恢复待联调 |
| 前一checkpoint `7e9bd3b3` | Desktop242 passed/2 Windows native skipped；Core上游36/36；协议25/25；Desktop/Core类型通过 | Windows原生未复验；不替代本次授权路径验收 |
| 旧checkpoint `a7b02a2c` | 排除暂停项后Desktop270 passed/2 Windows native skipped及typecheck通过，含native44/44、隔离恢复15/15、信任库27/27；目标workflow发现2项 | 仅历史结果，不代表删除自动方案后的验收 |
| 本机root直连诊断 | 固定trust命令实测1次：authd拒绝规则写入`-60005`，未自动授信；无人工回退，原规则字节未变，临时CA和完整宿主已恢复 | 本地诊断不代替真实E2E；本机15.8不能用此规则取得免确认授信 |
| 旧`a7b02a2c`产物 | package/audit通过，1487文件、339499911字节；helper核准后两入口ready、已安装字节匹配；production smoke1/1 | 不代替本次产物或证书成功组 |
| 既有产物 | 防自环修正后package/audit通过；生产smoke 1/1 | 产物含本地暂停项，不是此次精确提交树重打包；整体item仍待验收 |
| macOS E2E | 旧无授权8/8、前台helper2/2、TLS/H2/gRPC业务3/9；新增自动回退取消1/1 | 新版成功授信workflow失败于撤销等待；业务组余6条仍待验 |
| 变更报告 | 本机Edge完成1320px/390px截图与布局检查；图片/红框正确，无折叠或横向溢出 | 内置浏览器截图宽度失真已改用Edge；未改Renderer或设计基准 |
| 最后宿主复核 | 前置取消E2E已验证代理/Root/admin trust恢复和完整授权规则不变；后续仅构建/只读，新产物检查无App、8888释放、无规则恢复记录 | 旧helper876保留，未更新；不代替最终E2E或历史CA清理 |

- 旧版本Green、Windows skip不算当前验收通过。
- 本轮删除前置与局部Green：`/tmp/interceptor-remove-automatic-trust-20260921-{red,green}.json`、`-e2e-red-results.json`及`-e2e-red/`；真实取消/CA清理后精确失败于直接授权日志缺失，旧自动回退日志仍存在。
- 准确范围与产物：`/tmp/interceptor-remove-automatic-trust-20260921-desktop-green.json`、`-artifact.json`；19项暂停状态保存在`-preserved.json`及stash `620416f3`，提交后原样恢复，旧stash保留。
- 本轮报告：同前缀`-report.json`、`-report-{1320,390}.png`及各宽度的`-top/-figure/-bottom.png`，以Edge结果为准。
- 提交树复验文件：`/tmp/interceptor-macos-checkpoint-20260920-{desktop,upstream}.json`；报告预览同前缀`report-*.png`。
- 本次兼容证据：`/tmp/interceptor-macos-automatic-trust-20260920-*`，包括`client/transaction/uncertain-{red,green}.json`、`desktop-final-green.json`、`e2e-red/`、`production-smoke/`、`deployment.json`、`smoke-failed-host.json`、`final-host.json`及`report-{1320,390}.png`。
- 最新续验：`/tmp/interceptor-macos-automatic-trust-20260920-resume-KTYw7z/`，保存`host-before.json`、`smoke-results.json`、`production-smoke/`（含trace）、`native-preparation-log.json`和`smoke-failed-host.json`；结果为failed/核准blocked，不计Green。
- 窗口定位：`/tmp/interceptor-macos-authorization-window-20260920-VaMrUU/`，保存两轮smoke、`native-window-observations.json`、`visible-native-window-observations.json`及宿主基线；`revealed=true`仅指已发送显示/前置请求，实际窗口仍报告不可见。
- 窗口诊断更正：`/tmp/interceptor-launchservices-20260920-CAaJKz/`保存`native-window.json`、`window-status-comparison.json`、`helper-stack.txt`和`final-host.json`。CGWindow确认窗口在屏幕前台，System Events的false不代表不可见；本轮仅诊断/取消，不计E2E Green，代理/CA/规则已恢复、App/helper退出、8888释放。
- 核准后实机：`/tmp/interceptor-user-approval-20260920-yFRvez/`保存`approved-host-restored.json`、`smoke-results.json`、`certificate-results.json`、`certificates/`及`certificate-rule-attempts.json`。smoke1/1，证书1 passed/1 failed；root规则写入三次均`-60005`，无再次安装helper。
- 本地直连诊断：`/tmp/interceptor-direct-root-trust-20260920-5GiIq0/`保存`host-before.json`、`result.json`和`native-rule-denial.json`；只复用产品生成的测试CA公开DER，导入→自动trust被拒→删除，未读私钥或触发前台授权。
- 本次准确提交树：`/tmp/interceptor-macos-auto-trust-checkpoint-20260920-aiEFuE/`保存`desktop-green.json`、排除项清单及`report-{1320,390}.png`；报告宽窄屏、图片、红框和展开状态检查通过。
- [本轮结果](features/settings.md#macos-effective-upstream) · [历史明细](features/settings.md#handover-verification-history)。

### 恢复命令

开发helper为`ready`时可复跑无授权上游流程，ClashX保持当前系统代理模式：

```sh
npm exec --workspace @interceptor/desktop -- playwright test --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/macos-upstream-proxy.workflow.ts --grep 'preserves the external system upstream' --output=/tmp/interceptor-macos-upstream-rerun
```

用户回来后先核准本轮已审计的新组件/App，再复跑smoke和同产物证书E2E；只在系统窗口确认，不在聊天输入凭据。此更新删除机器上旧版的自动规则能力。代码改变则先重新package/audit：

首次可通过正常LaunchServices打开同一App的独立诊断profile，不受smoke的120秒等待限制。在系统窗口完成组件更新后，通过Command+Q退出App，再运行下方测试；这不是E2E验收，不复用该profile冒充fresh workflow。

```sh
open -n -a "$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" --args --user-data-dir="$(mktemp -d /tmp/interceptor-helper-approval.XXXXXX)"
```

```sh
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/interceptor-remove-automatic-trust-20260921-smoke-results.json npm run test:smoke --workspace @interceptor/desktop -- --reporter=line,json --output=/tmp/interceptor-remove-automatic-trust-20260921-smoke
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/interceptor-remove-automatic-trust-20260921-e2e-green-results.json npm exec --workspace @interceptor/desktop -- playwright test --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/macos-certificate-helper-trust.workflow.ts --reporter=line,json --output=/tmp/interceptor-remove-automatic-trust-20260921-e2e-green
```

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
