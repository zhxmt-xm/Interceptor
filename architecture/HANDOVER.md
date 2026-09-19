# Interceptor Handover

> Tracked commit: `6006bdfe`
> Branch: `main`
> 最后更新：2026-09-20

## Task List

- [ ] **blocked · VS Code Copilot MCP互操作**：Host基础MCP协议与产品要求的`2026-07-28`不匹配；需Host支持后按[MCP矩阵](features/mcp.md)复验。
- [ ] **待验证 · HTTP Execute edited wire correctness**：H1/H2的`Content-Length`、`content-encoding`、`transfer-encoding`与framing矩阵由原负责session继续。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
- [ ] **进行中 · macOS系统代理与E2E验收**：第4步业务E2E已通过3/9；尚未整体完成。
	- 当前执行：生产smoke及现行授信路径已验；继续剩余6条业务流程，随后历史CA清理、卸载/失败rollback。
	- 授权目标：权限操作统一由helper承担；常驻helper复用证书信任授权尚未解决，前台路径Green不代表目标完成。
	- 授权范围：用户已允许恢复正常E2E及权限操作，系统确认仍由用户本机完成；Windows现行路径与业务断言保持。
	- 提交边界：用户已明确允许先保存本item中间进度；余6条业务E2E及阻塞保留。暂停UI、独立package骨架和证书目录迁移不混入。
	- 实现约束：自有数据直接使用当前结构，不加版本分支、兼容层或迁移代码。
	- 上游进度：基础ClashX链式转发已验；防自环7 Red→同组32/32，typecheck、重打包和audit通过；外部改写等尾项保留。
	- 已完成：
		- 当前无授权E2E 8/8：原7条代理/恢复流程，以及Finder Reveal公开证书。
		- helper开发/生产双入口复用已验，阶段提交`6006bdfe`。
		- 既有E2E基线：同步前65/65；同步后7条定向通过，不代表最新全量通过。
		- 前台helper成功授信/撤销、取消回滚真实E2E各1/1；开发组件已核准。
		- 当前生产包smoke 1/1；同产物helper授信/撤销及取消2/2；TLS、H2、gRPC业务3/3。
		- 准确提交树：Desktop242 passed/2 Windows native skipped、Core上游36/36、协议25/25，两workspace类型通过；同源码Core全组既有107/107。
	- 待完成：
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
		- 常驻helper：系统代理、公开CA导入/删除。
		- 前台helper：trust/untrust及系统确认；不等于免授权。
		- 用户：系统要求的Touch ID/密码确认；E2E不得代输。
	- 阻塞/暂停：
		- 证书免重复确认`blocked`：本机trust规则拒绝root免认证，公开API不能接收安装时的授权；不改SIP/授权库，不继续批量弹窗。
		- Agent body-messages发现清单与当前registry不一致；未改共享断言，仍待处理。
		- ClashX外部改写driver三次未通过，停在原生菜单切换；宿主已恢复，待人工联调，不再自动重试。
		- [上游证据与CA清点](features/settings.md#macos-effective-upstream)。
		- HTTPS弹窗动画/定位暂停；Bilibili登录待账号与平台driver适配。
		- Windows原生复验后置；3条Windows专属AppContainer不计macOS欠账。
	- [验证结果](#verification) · [恢复命令](#恢复命令) · [历史证据](features/settings.md#macos-validation-history)。
- [ ] **待确认 · 平台能力 package 整理**：2026-09-19按模块记录进度；继续迁移暂停，独立workspace后置。
	- 下表“已完成”只指列明的归类或代码，不代表完整功能及双平台验收通过。

	| 模块 | 已完成 | 待完成 |
	| --- | --- | --- |
	| 系统代理 | 两端读写/恢复已归入；macOS生效上游接入及ClashX基础链式转发已验 | 外部上游异常/配置变更联调；Windows原生复验 |
	| 证书材料 | 仅本地移动实现、错误类及9项integration，本次不提交 | 确认目录迁移；统一入口和CA类型，保持生成/加密/指纹契约 |
	| 系统证书与trust | 两端导入/删除/查询已归入；macOS开发/生产前台授信及取消E2E通过 | 业务组余6条、历史CA处理；Windows原生复验 |
	| 原生组件与授权 | helper通信、鉴权、双入口、就绪/部署代码已归入 | 最新版本实机验收；root卸载与失败rollback |
	| 本机应用信息 | Windows连接查询helper、应用信息和图标提取已归入 | Core中的原生runner/输出解析归类；macOS能力尚未接入 |
	| AppContainer | Windows枚举及单项/批量loopback exemption已归入 | Windows原生复验；macOS不适用 |
	| 证书系统工具 | 尚未归入 | Main中的PEM→CER、系统查看器、`certmgr.msc`/`Keychain Access`选择与启动 |
	| 安全存储契约 | 已使用`safeStorage`保护私钥；各业务已有注入边界 | 统一`SecureStore`窄契约；Electron适配注入，不搬业务存储格式 |
	| 公共入口与契约 | 已有`PlatformCapabilitiesService`、23个公共类型和4个原错误类 | 纳入CA能力及类型；复核`supported / ready / authorized`边界 |
	| 编排边界 | Main持有任务顺序；Core保留缓存和事件 | `SystemProxyOperationQueue`归Main；`UpstreamProbe`只提供事实，降级策略留Main |
	| 独立package | 仅有private workspace骨架 | 运行入口、实现、依赖与App/Core接入；迁移后置 |

	- 保留在原owner：
		- Main：IPC/Agent/MCP审批、取消、调用顺序、Core/listener生命周期、代理恢复与退出排空。
		- Main：MITM意图、Core配置同步、Renderer状态通知与图标缓存。
		- Core：TLS/叶证书、流量处理、应用归属缓存、Capture关联和事件。
		- Electron适配：窗口、导航、CSP、Dialog、clipboard、`safeStorage`和`shell`绑定。
		- 各feature：Agent/MCP/GitHub凭据业务及存储格式。
		- 工程与验收：Forge、发布流水线、E2E平台driver。
	- 实施边界：
		- 平台模块不等于root helper；CA生成不提权，私钥/token不交给特权服务。
		- Windows/macOS统一调用语义，不强行统一原生命令和授权步骤。
		- 平台模块不依赖Electron；Core不得反向依赖Desktop。
		- 保留CA格式、Windows命令/数据契约、两端IPC/MCP及真实E2E契约。
		- helper仅随App安装升级；不付费、不建项目密钥或独立更新器。
		- package骨架、对应lockfile及证书目录迁移未纳入macOS阶段提交；本item未提交。
	- 代码定位：[平台入口](../apps/desktop/src/main/platform-capabilities/entry.ts)、[证书职责](../apps/desktop/src/main/platform-capabilities/README.md#业务边界)、[Main](../apps/desktop/src/main/main.ts)、[Core原生查询](../apps/proxy-core/src/proxy-core/client-app/utils/index.ts)。
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
- 历史约束要求保留stash `wip: Windows App WVD gateway bypass`；2026-09-19同步前实际stash列表为空，未删除用户stash。保护备份`5baff562`、`0920afba`保留；本次排除项收在`938ee726`，只用于提交后原样恢复。

## Verification

| 范围 | 结果 | 缺口 |
| --- | --- | --- |
| 证书路径迁移 | 本地前后70/70；typecheck通过 | 本次不提交；入口/类型整理后置 |
| macOS上游 | 原生37/37、接管/journal32/32、Core上游36/36；ClashX基础链式转发Green | 外部改写driver失败；停止/恢复待联调 |
| 准确提交树 | Desktop242 passed/2 Windows native skipped；Core上游36/36；协议25/25；Desktop/Core类型通过 | Windows原生未复验；未重跑全量E2E |
| 既有产物 | 防自环修正后package/audit通过；生产smoke 1/1 | 产物含本地暂停项，不是此次精确提交树重打包；整体item仍待验收 |
| macOS E2E | 无授权8/8；生产helper授信2/2；TLS/H2/gRPC业务3/9 | 业务组余6条；Agent旧清单及macOS View待验 |
| 变更报告 | 本机Edge完成1320px/390px预览，图片及红框正常，无折叠或横向溢出 | 默认Playwright浏览器缺失，未安装；未改Renderer或设计基准 |
| 最后宿主复核 | 证书集恢复；无App/前台helper残留；8888释放 | 不代替新流程验收或历史CA清理 |

- 旧版本Green、Windows skip不算当前验收通过。
- 提交树复验文件：`/tmp/interceptor-macos-checkpoint-20260920-{desktop,upstream}.json`；报告预览同前缀`report-*.png`。
- [本轮结果](features/settings.md#macos-effective-upstream) · [历史明细](features/settings.md#handover-verification-history)。

### 恢复命令

开发helper为`ready`时可复跑无授权上游流程，ClashX保持当前系统代理模式：

```sh
npm exec --workspace @interceptor/desktop -- playwright test --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/macos-upstream-proxy.workflow.ts --grep 'preserves the external system upstream' --output=/tmp/interceptor-macos-upstream-rerun
```

用户回来后使用当前已审计产物继续smoke和证书验收；代码改变则先重新package/audit：

```sh
npm run test:smoke --workspace @interceptor/desktop -- --output=/tmp/interceptor-macos-helper-trust-20260919-foreground-smoke-retry
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" npm exec --workspace @interceptor/desktop -- playwright test --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/macos-certificate-helper-trust.workflow.ts --output=/tmp/interceptor-macos-helper-trust-20260919-foreground-e2e
```

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
