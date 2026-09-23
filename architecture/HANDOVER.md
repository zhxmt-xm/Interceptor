# Interceptor Handover

> Tracked commit: `e1b5f704`
> Branch: `main`
> 最后更新：2026-09-24

**不允许记录流水账！！！执行任务列表时不允许停下**

## 当前状态

- 用户于2026-09-24明确授权将第1–5项混写的平台改动及直接验收修正合并保存中间进度、commit后push；不再强拆。完成项从下表删除，未完成项保留具体缺口，原编号保留用于交接。
- 本轮只有一份[改动报告](../commit-changes/202609240135_main_shared-ca_startup.html)。历史helper报告不再追加本轮journal内容；GitHub登录设计预览不属于本次提交。
- 不穿插正文设计等暂停工作，第8项留Windows实机。日常CA保护和新的系统授权专项仍须本机确认；合并保存进度不等于全部验收完成。

## Task List

2. **Windows/macOS 共享 CA · 待验证**
	- 当前：同一OS用户跨profile共享三份CA材料已实现，已有CA跨fresh profile复用已验；业务配置和凭据仍隔离，私钥仍由safeStorage加密。
	- 剩余：新启动顺序下的首次创建与完整证书生命周期由第3/4项继续；Windows路径、safeStorage及真实系统授权留第8项，不能用macOS结果代替。
3. **统一启动检查 · blocked**
	- 当前：首窗先显示，再调用`PlatformCapabilitiesService.prepare()`；全缺才生成、未信任才授信、已信任不重复写入，ready前拒绝业务IPC。
	- 下一步：用户能处理系统确认后，验证首次授权页面可见、取消及准备期间Quit。对应前置真实E2E仍缺，不能用旧结果补代。
4. **CA 操作与 E2E · 进行中**
	- 当前：各module已实现即时冲突拒绝、共享授权和已结束失败的回读收尾；原生View已接入。真正未知的写入仍保守占用，可靠解除未解决。
	- 当前步骤：只读部署检查错误占用取得8项Red后修正；提交审阅再发现生效代理快照解析失败被误记unknown，补3项目标Red并标明completed及只读operation。最终平台串行回归265通过、2项Windows native跳过，Desktop类型通过；不扩展helper协议，真正未知写入仍保护。共享CA/helper复用、原生View和跨profile journal四条真实E2E全部Green，七代退出及CA保留已验。授权、取消与完整生命周期仍缺，普通workflow不得清理日常CA。
	- 正文子项暂停：只读预览2 MiB、完整且不超过1 MiB自动格式化、1–2 MiB可手动格式化，截断不格式化；图片独立16 MiB。Text完整编辑，File只预览但使用完整文件；初始高度、内滚动和resize不影响完整保存/导出/发送。产品未实现，候选未定稿，不插入当前平台收尾。
5. **macOS journal 收尾 · 进行中**
	- 当前：[journal](../apps/desktop/src/main/platform-capabilities/system-proxy/macos/journal.ts)跨profile恢复复验Green。生产超时已定位并修复：完整资源校验37.4秒超过30秒，同一签名API只读对照为Background26.99秒、普通6.27秒；不反推历史14:09缺失的耗时证据。
	- 当前步骤：实际launchd策略取得Background的Red后，仅将ProcessType改为Interactive并由用户核准部署；实装plist与运行中的spawn type均为Interactive。平台回归262通过、2项Windows native跳过，最新package、artifact audit、严格签名、生产helper workflow 1/1和packaged smoke 1/1均通过；完整鉴权及30秒期限不变。本轮按用户授权与第1–4项合并保存进度，以下外部验收不标为通过。
	- 外部环境缺口：特殊VPN/TUN、动态网络切换及ClashX联调仍需对应环境，不由普通loopback结果代替。
6. **删除产品 GitHub 登录 · 待确认**
	- 当前：只有[设计候选](../commit-changes/202609211736_ui_github_remove-signin.html)，产品OAuth/Token及登录门槛未删。
	- 下一步：用户确认设计后再实现、验收；保留匿名更新，不碰个人Git/CI凭据或远端仓库可见性。
	- 更新验收缺口：通知的真实下载/打开安装器流程尚缺专属E2E，需可用的新Release与签名包；其他按钮验收不代替。
7. **macOS 最终验收 · 待验证**
	- 当前：新helper和产物已获本机核准；生产workflow、packaged smoke及最后一次Desktop typecheck通过。全量parity已跑完，402/406通过，4个暂停中的HTTPS弹窗位置差异未通过；不能登记全量Green。现有结果针对保留工作区，不等于独立item提交树已验收。
	- 剩余：第3/4项授权专项及第16项全量验收。最后的只读解析修正已有3项Red、265项Green和类型结果，但尚未重新打包；已验包的smoke不冒充最终源码产物。本轮为已授权中间进度，终包复验留本项，不再为保存进度重复触发系统授权。暂停UI和设计基准不修改。
	- 显示环境调整后已通过真实1600×900准备。旧1536×875失败、手动Close恢复及Main85537的trace保存ENOENT均保留为历史失败，不改成Green。
8. **Windows 实机验收 · 待验收**
	- 当前：未执行，由用户回Windows后验收；macOS通过或native skip不能替代。
	- 下一步：按下方[Windows复验表](#windows-复验)执行，并核对真实UAC、原生窗口、系统设置与进程恢复。
	- 排除范围：用户已排除Manager管理员MMC原生专项；保留Manager功能、逻辑及UI检查，不把排除项记为通过。
9. **VS Code Copilot MCP互操作 · blocked**：Host协议与`2026-07-28`不匹配，待Host支持后按[MCP矩阵](features/mcp.md)复验。
	- 验收缺口：VS Code与Claude双Host同读Capture、正式Tool中间进度SSE仍需对应真实场景；不为旧Host增加legacy兼容，也不制造假进度流。
10. **HTTP Execute edited wire correctness · 待验证**：由原session继续H1/H2的长度、编码和framing矩阵。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
	- 已确认缺口：H1 request replacement把继承chunked改为Content-Length；response replacement产生Content-Length与Transfer-Encoding共存。H1/H2四类header的request/response矩阵未齐，已有UI/effect结果不能代替wire正确性。
11. **平台能力 package 整理 · 待确认**：独立workspace/骨架/lockfile后置；原生runner、证书系统工具及支持边界待整理，macOS连接归属/图标未实现。[职责](../apps/desktop/src/main/platform-capabilities/README.md#业务边界)。
12. **WPAD · 待验证**：缺纯Auto Detect环境验收，Windows现行无显式代理/PAC时直连。[详情](features/settings.md#34-上游代理链式转发)。
13. **首个真实 tag release · 待验收**：签名、公证及Windows/macOS发布产物待验。[发布说明](platform/release.md)。
14. **H2源站正常GOAWAY · 待验证**：验证源站`NO_ERROR`后的stream收尾、上游新连接与Capture记录。[覆盖](features/capture.md#h2-range与多stream集成)。
15. **H2事件诊断 · 待实现/待验证**：缺生产原始帧和请求关联，Mockttp/patch采集暂缓；复用Diagnostics，不另建页面。[范围](features/diagnostics.md#h2事件采集范围)。
16. **共享代码全量复验 · 待验证**
	- 当前：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发和导入取消调用方均受影响；macOS仅有可执行子集结果，Windows未验。
	- 当前步骤：fake HTTP snapshot的bodyAvailable修正后，406场景全部执行，402通过、4个HTTPS弹窗位置差异约80–80.75px；无遗漏、无缺失配对，设计/产品未为parity改动。smoke改为等待公开Recording状态就绪后经真实Settings UI Restore，复跑1/1通过；Desktop typecheck通过。授权专项与Windows仍未验；本项是交付检查，不另拆feature commit。

## Constraints

- 当前日常CA为`16CEB8D0990CCC29FA7313B7F85F1167B227C26C`，保留且受信任。未获本机确认不清理CA、不启动新授权专项；历史CA、helper卸载/rollback及ClashX不自动处理。
- 第1–5项及其直接验收修正可合并保存当前进度；只暂存所属改动，不夹带暂停项、独立package/lockfile或无关文档整理。未完成项继续跟踪，不因commit而标passed。
- 暂停UI、Bilibili、正文候选、独立package/lockfile全部保留；12项修改已恢复，7份stash不得重复apply/drop。保护清单：`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- macOS App/E2E/smoke共用`8888`与系统代理，必须串行，结束核对完整宿主恢复。其余通用规则依[AGENTS.md](../AGENTS.md)，不在这里重复。

## Verification

| 范围 | 结果 | 缺口 |
| --- | --- | --- |
| CA服务归属（原第1项） | Main仅持有readonly平台对象；材料/Trust Store、模块状态、Core同步、upstream和图标缓存归对应module。相关类型、265项平台回归、四条真实E2E及归属迁移产物的package/audit/smoke通过，完成项已从任务列表删除 | 不包含第3/4项尚缺的授权专项或第8项Windows实机；不迁独立package |
| 类型/单测/集成 | 类型与macOS适用Desktop、Tools、MCP、Agent测试通过；平台定向检查通过 | Core仍有2项framing失败；5个Windows文件窗口fixture在macOS失败并被适用命令排除，2项Windows native跳过，均不算通过 |
| 真实E2E | 73/87条取得最终Green，退出和宿主恢复有证据 | 14条未执行；Body/Archive隔离复验通过，但首跑偶发超时原因未根治 |
| UI parity | **未通过**：406/406已执行，402通过；无遗漏及缺失配对，4个TLS位置偏差80–80.75px | 4项属于暂停的HTTPS弹窗定位；不改产品或基准掩盖差异 |
| 最近已验macOS产物 | Interactive helper已部署；package、artifact audit、严格签名、生产helper workflow 1/1、packaged smoke 1/1均通过 | 产物早于最后只读解析修正，且含未提交的保护UI，不是最终commit产物；特殊VPN/TUN及ClashX未验 |
| 证书/启动专项 | **blocked**：日常CA保留，新的系统授权专项仍需本机确认 | 新启动顺序缺前置真实E2E；真正未知写入的可靠解除、取消与完整生命周期仍缺；生产helper status超时已解决 |

未执行14条：Windows AppContainer 3条；需空共享目录/本机确认的Certificate/TLS 5条；外部上游/ClashX 2条；用户暂停的Bilibili/HTTPS弹窗2条；gRPC长正文/第10项Execute edited 2条。均不计通过。

原始证据保留在`/tmp/interceptor-platform-final-20260923-*`：`workflow-inventory.json`索引逐项E2E；`{desktop,desktop-macos,core,core-paths}.json`记录完整测试；`parity-combined.json`与`parity-batch-300.json`合计305场景；`package.json`记录产物身份。平台前置Red仍在`/tmp/interceptor-platform-{modules,completion,authorization,maintenance,layout}-20260923-*`；生产准备超时证据在`/tmp/interceptor-daily-ca-ready-20260923-MhBXIZ/`。不删除或改写失败报告。

本轮证据在`/tmp/interceptor-platform-resume-20260923-*`：`inspection-red.json`为8项目标Red，`inspection-green.json`为262通过/2 Windows native跳过；`platform-e2e-green/`与同名JSON为共享CA/helper复用、原生View及跨profile journal四条Green，`host-check.json`核验七代退出、8888及日常CA保留。`package.json`是授权前产物身份快照；`approved-startup.*`、`approved-close.json`记录人工生产核准与恢复，不代替workflow。`production-helper-green/`实际为失败重跑，结合`production-timeout.log`确认37.4秒资源校验；`signature-{background,foreground}.jsonl`为相同API的只读调度对照，不算E2E。

最新结果同前缀：`launchd-policy-red.json`记录实际Background的目标Red，`qos-regression.json`为262通过/2 Windows native跳过，`qos-production-helper.json`为生产1/1 Green，`qos-smoke-ui.json`为smoke 1/1 Green；生产workflow两代Main/Core正常退出，smoke结束App进程和8888释放，常驻helper保留。`parity-complete.json`汇总全部406场景，4项失败为`capture-tunnel{,-dark,-mitm-active,-mitm-active-dark}`。最后执行`npm run typecheck --workspace @interceptor/desktop`通过。上述结果不补造历史前置Red，也不覆盖尚未执行的证书专项。

`qos-package.json`保存最新App及helper身份：helper SHA-256为`18590483b88049c8e1298bdc1f3e98418e8dafb9757ba17e2e73797f8035b86d`，与实际安装文件一致，launchd为Interactive。`final-host-check.json`确认日常CA指纹与信任保持、App进程全部退出、8888释放，HTTP/HTTPS/PAC/SOCKS代理均停用；12份保护文件哈希不变，常驻helper按约定保留。产物来自保留工作区，暂停的HTTPS弹窗修改未纳入本次提交。

提交审阅收尾：`effective-read-payload-red.json`为null/array/string三种完整只读回复的3项目标Red；修正后`effective-read-serial-green.json`为265通过/2 Windows native跳过，Desktop typecheck通过。并发首跑`effective-read-green.json`实际为264通过/1失败/2跳过，失败是`UpstreamProbe`的10ms网络期限断言；同组串行复跑通过，保留首跑失败，不放宽期限或改写结果。最后仅改typed client的只读解析收尾，没有重建/重新核准App；终包验证仍由第7项跟踪。报告在1600px和480px宽度下已检查，截图内嵌、红框位置正确、无折叠和横向溢出，结果为`report-preview.json`。

## Windows 复验

仅供第8项执行。下面workflow路径相对[workflows目录](../apps/desktop/tests/e2e-workflow-tests/workflows/)，`{a,b}`表示两份文件；具体步骤依现有[规格](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)。

| 分组 | 用例 | 重点 |
| --- | --- | --- |
| CA/启动/View | `settings/{certificate-startup,tools-certificates,tools-tls}.workflow.ts` | 首窗先于UAC、取消、跨profile/safeStorage复用、坏材料保留、卸载/删除及真实View关窗；就绪120秒、证书操作30秒、普通操作15秒，先终态后清理 |
| 代理/AppContainer | `settings/{tools-system-proxy,system-proxy-crash-recovery,app-container-bulk-access,tools-app-containers,app-container-ordering}.workflow.ts` | 单项/批量UAC、冲突/Quit立即拒绝、无重放、完整WinINet/exemption恢复 |
| 协议/交互 | `capture/{tls-scenarios,http2-scenarios,grpc-scenarios,navigate-tls-passthrough}.workflow.ts`；`settings/{tls-compatibility,proxy-mitm-persistence}.workflow.ts`；`agent/body-messages.workflow.ts` | 首请求源站例外、Edge证书校验、Raw/Copy长度及hash、每代Page；取消背景host默认选择，Capture discovery精确17项 |
| 导入/只读 | `composer/{collection-import,tools-transfer}.workflow.ts`；`rules/{import-tree,tools-import}.workflow.ts`；`settings/tools-readonly.workflow.ts` | 真实signal、原生/预览Cancel与Confirm、退出取消、重启零重放；六项无审批查询及CA不变 |
| 构建/路径 | `build:native`及平台所属测试；[Client App](../apps/proxy-core/src/proxy-core/client-app/tests/unit/service.test.ts)、[Transfer](../apps/proxy-core/src/proxy-core/transfer/tests/unit/job-manager.test.ts)、[Windows文件窗口fixture](../apps/desktop/tests/e2e-workflow-tests/fixtures/ui/tests/unit/windows-file-dialog.test.ts) | 共用runner、8 MiB枚举、certutil/UAC、Windows路径解析；不使用macOS skip替代 |
| 产物/全量 | 全部适用workflow及[packaged smoke](../apps/desktop/tests/packaged-smoke/startup.spec.ts) | ready门禁、精确Preload白名单、Core重启、截图矩阵、系统设置/进程恢复 |

## 恢复命令

用户在场并恢复验收后，先正常启动新包处理必要的系统确认，再关闭App运行smoke。证书生命周期专项要求空共享目录，不能直接对日常CA执行。其他具体命令查[测试说明](platform/testing.md)和[证书规格](../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md)。

```sh
open -n -a "$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" --args --user-data-dir="$(mktemp -d /tmp/interceptor-helper-approval.XXXXXX)"
npm run test:smoke --workspace @interceptor/desktop
```

本轮合并commit后立即push；后续仍按获准item交付。直连失败时可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
