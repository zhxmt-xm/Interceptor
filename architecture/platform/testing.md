# 平台架构：测试分层

> 范围：测试层级、驱动方式、隔离边界和执行约束。

## 1. 验证层级

| 层 | 位置 | 驱动方式 | 职责 |
| --- | --- | --- | --- |
| 单元 / 集成 | 各 workspace 的 `tests/` | Vitest（`environment: node`） | 纯逻辑、真实 worker_threads、真实 `node:sqlite`、真实 HTTP/2 |
| E2E workflow | `apps/desktop/tests/e2e-workflow-tests/` | Windows `_electron.launch()`；macOS未打包Electron+Renderer CDP，可显式选择签名产物 | 从真实 App UI 出发的端到端 workflow |
| Packaged smoke | `apps/desktop/tests/packaged-smoke/` | 最终 package + CDP | 打包产物的综合验证 |
| 设计一致性 | `apps/desktop/tests/visual-parity/` | 测试目录内 fake Preload | Renderer 与 `design-vite/` 的几何/像素一致性 |
| 人工验收工具 | `apps/playground/` | Browser手动点击 + Node Traffic Lab | 最新MCP全部详情、逐Tool人工结论与可控协议流量；不替代任何自动层 |

各层职责独立，不能互相替代。

### 辅助测试取舍

E2E fixture与Playground的既有测试按保护的实际风险维护，不因目录里已有测试就继续增加，也不因为测试失败就删除。产品业务单测、Core真实协议集成、Electron workflow和退出恢复不属于精简范围。

- E2E fixture只保留宿主恢复、精确进程归属和失败profile保留的3个既有测试文件；文件窗口脚本文本断言与模型lab响应快照已移除，真实行为由所属workflow验证，Windows未验收状态不改变。
- Playground保留输入边界、脱敏/证据、取消及真实HTTP/TLS/WebSocket场景的10个既有测试文件；重复类型约束的recipe清单和布局/序列化辅助函数单测已移除。
- 工具修改直接跑受影响的Playground场景或已有真实E2E；不因精简另建一套fixture测试、测试注册层或宽泛skip。仅删除测试文件不等于对应业务已通过，已有失败与历史证据仍保留。
- 具体职责见[fixtures说明](../../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)与[Playground维护边界](../../apps/playground/README.md#既有辅助测试的维护边界)。
- 正文分块单测保留超过1MiB的真实字节数组、offset/分块调用和end断言，使用完整字节比较而非对百万个索引做通用对象深比较；不能用降低数据量、抽样字节或放宽超时代替等价校验。

Windows实机验收的范围与实际状态见[Windows矩阵](../../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)，后续任务由[Handover](../HANDOVER.md)跟踪。按用户确认，Windows待验不作为其他item的提交blocker；其他item仍须完成自身可执行验收，Windows未执行、skip和失败不能改写为通过，发布产物门禁不因此取消。

## 2. Local E2E driver

- **平台启动driver**：Windows继续用`_electron.launch()`启动未打包production bundle，prepare复用Forge Vite配置；macOS默认spawn同一项目的未打包Electron，以Renderer CDP驱动相同workflow。两者都由测试拥有进程，不附着人工Forge实例；协议/Core/native按正式构建顺序准备，业务E2E不要求每次package。
- **Windows启动失败**：Windows保留原`_electron.launch()`与`firstWindow()`入口，按原门禁检查App root、Core PID和listener。启动异常保留profile及原始错误，关闭异常一并报告；不删除仍占用中的Chromium文件，也不将清理的`EBUSY`替代启动失败。
- **平台差异归属**：业务workflow共用操作、输入和结果。helper读取、journal位置、窗口准备、超时、故障观察/profile选择及独立系统权限检查归driver/fixture的Windows/Macos方法，不把macOS适配扩成Windows业务步骤。Windows保留WinINet六字段宿主比较、JSON证据比较和原恢复顺序；macOS完整结构比较与admin trust检查独立执行。
- **macOS窗口与日志**：业务E2E由driver按配置准备真实窗口，常规`macos`项目保持1600x900；只有body-fill滚轮边界用独立`macos-scroll-boundary`项目的1600x800，两者互斥匹配。等待System Events就绪并验证DOM尺寸，不改变Windows窗口或产品布局。macOS日志使用profile内0600文件继承给子进程，避免runner结束后保留App遭遇pipe EPIPE；日志附加前仍扫描敏感内容，证据保持有界。正常结束删除profile；恢复未完成保留profile及私有日志。
- **macOS helper**：开发与业务E2E按`app.isPackaged=false`共用获准UID的开发socket，不核准每次App构建，不因新profile/HMR/rs/重编译业务代码重新安装。原生构建按源码、工具链、签名参数及产物哈希缓存，helper自身变更才更新组件。生产App仍使用独立严格鉴权；`INTERCEPTOR_E2E_MACOS_APP_PATH`只供driver显式选择已有签名App，非产品参数，设置它时直接运行Playwright，不运行prepare。
- **统一安全 Renderer origin**：Main 只要没有 `MAIN_WINDOW_VITE_DEV_SERVER_URL` 就安装 `PackagedRendererProtocol`，因此 local production bundle 与最终 package 都从 `interceptor://app/index.html` 加载；开发 HMR 仍使用精确 Vite origin。该条件不依赖 `app.isPackaged`，但可信导航与 CSP 边界不放宽。
- **生命周期与证据**：`fixtures/runtime/local-electron-driver.ts` 为每个测试创建独立临时 `userData`，启动 BrowserContext trace，等待真实 Renderer/Core/8888 listener，并在 workflow 后保存 `trace.zip`、`final.png`、Main/Renderer 日志和 PID/端口 metadata；两平台普通收尾都点击产品`shell.window.close`，验证 Main/Core 退出与 8888 可重新 bind，不以macOS菜单Quit替代Close。macOS主动crash后立即落该代证据，避免同profile下一代清理日志造成缺失；只有原生快捷键专项使用Command+Q，Windows保留Alt+F4。强制关闭只在宿主保护允许时兜底，不能作为正常退出或E2E成功证明。
- **共享CA验收**：普通workflow及smoke先只读检查已由产品初始化的用户级CA，结束保留材料和系统信任；不把共享CA复制进profile。首次初始化专项允许产品启动生成/授信，破坏性专项要求空共享目录并保存完整Root/admin trust基线。仅测试fixture声明范围，不给产品增加专用路径或开关；Windows首次窗口等待允许新CA UAC完成，业务/系统代理原生契约不变。
- **失败时保留特权profile**：调用`preserveUserDataOnFailure()`的workflow，在Playwright实际状态为`failed`、`timedOut`或`interrupted`时必须保留profile，不能仅判断`await use(driver)`是否抛错；任何清理或宿主guard错误也必须保留。判定归`fixtures/runtime/workflow-profile-retention.ts`，unit覆盖状态与错误组合。CA清理按本轮身份和真实信任状态等待正式UI，不以按钮瞬时不可见当作已清理。
- **零 Mock / 零 seed输入边界**：测试操作通过公共 automation ID 进入真实 App UI，再走 Preload/Main/Core/Storage/Proxy/Worker；测试侧只拥有loopback origin/client、证据与清理。导入文件必须由同一workflow先经产品Export真实产生，测试只能只读核验并重新选择，不得自行构造业务输入。`fixtures/ui/windows-file-dialog.ts`用Windows UI Automation定位真实Open/Save Dialog，再用真实鼠标键盘选择路径，不改写dialog返回值；`apps/playground/server/scenarios/traffic-lab.ts`提供共享协议服务与随机origin port，但被测Proxy listener保持产品默认`127.0.0.1:8888`。**禁止 `page.evaluate(window.interceptor.*)` 代替业务操作。**
- **fixture分类与协议归属**：`runtime/` 管进程与profile，`ui/` 管真实控件驱动，`safety/` 管宿主恢复，`agent/` 管模型模拟；按上述取舍保留的安全判断单测仍随所属目录放置。`trafficLab`为每条workflow统一拥有Playground的HTTP、WebSocket和按需TLS服务，场景运行与细粒度控制共享origin。E2E可直接使用Node流量API；Browser Playground只在页面或Browser MCP流程需要时启动。详细边界见[fixtures说明](../../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)。

## 3. 驱动与证据边界

用户流程规格由`e2e-workflow-tests/README.md`和`docs/`维护，可执行用例通过Playwright `--list`确认。`packaged-smoke/startup.spec.ts`负责最终产物的综合启动、安全、资源与退出检查，不等同于全部feature workflow。

macOS常驻helper独立于每条workflow的Main/Core，不作为它们的子进程清除；测试结束仍须证明全部App代际、8888和系统代理/证书恢复。整轮组件的保留或卸载按用户授权处理，不能以helper仍运行掩盖App残留，也不能在每条workflow拆除组件破坏跨启动复用验收。Core故障读取完整原代理并观察旧journal代际退出，自动重接管后核验新original/owned不变；两端均使用用户级journal跨profile恢复，Windows原路径/格式保持。

`apps/playground`不是测试Runner。Browser MCP流程需要真实Electron与浏览器之间的链路；Playground人工报告由使用者实际操作并观察产品与origin后填写，自动结果不能代填。

## 4. 执行约束

- 普通E2E的Renderer DOM操作、原生文件面板关闭后的页面断言、窗口尺寸准备和产品Close均不主动前置App。窗口准备只等待并调整真实窗口，不以`frontmost`促使窗口出现；原生Open/Save、系统授权、原生快捷键和最小化恢复专项才由所属driver核对进程代际后取得焦点。产品正常启动显示窗口的行为不变，不增加后台模式或测试专用产品参数。
- parity使用显式`headless:true`、`--no-proxy-server`的Edge和`windowsHide:true`的Node子进程，不创建可见测试窗口，不调用系统键鼠、前置或置顶。直连仅用于parity浏览器，避免设计/font请求经过被测系统代理，不改App或宿主代理设置。页面内的Playwright DOM操作不需要OS前台焦点；真实Electron窗口恢复、Open/Save和UAC不属于这一层，用户暂停时保留原用例，等待明确通知后执行。
- parity设计页先逐字重加载`Inter`和`JetBrains Mono`并确认得到已加载的FontFace，再重新计算Monaco字体。`document.fonts.ready`本身不代表下载成功；字体不可用时直接报错，不使用fallback生成布局结论，不更换字体或调整像素阈值。
- parity设计页在同一批次复用，每个场景先清理`overlay: ''`、`mcpToolApproval: ''`并重置`mitm: 'inactive'`，再应用自身`designState`；显式浮层和active场景优先。明暗“MITM Tunnel→普通Capture”、“Composer Export loading→选中目录”及MCP审批后的Composer不能残留上一场景的遮罩。不新增工具自身单测，不改变产品MITM或文件操作。
- 字符串parity目标先以设计侧确定测量对象：设计实际为button时，Renderer也量同名可见button，否则两边仍量文字节点。同名按钮优先选择文字内容完全匹配的按钮，避免Cancel误配右上角同名图标；必要时为重复按钮使用明确的footer selector。显式selector与`measureText`不变，不放宽原几何及样式阈值；几何差值用于定位产品/设计差异，不代替实际flex布局规则验收。
- **Proxy Core 全套必须 `--no-file-parallelism`**。大压缩流、真实文件 I/O 与随机端口并行会产生 5 秒假超时；与 desktop 并行运行时 `proxy/tests/integration/h2.test.ts` 会假失败。
- **禁止并行运行 `build:core` 与依赖 `dist` 的集成测试**。`build.mjs` 每次先递归删除 `dist`，而真实代理集成测试运行时依赖该目录，并行会导致瞬时 `ECONNRESET`。必须构建完成后再顺序跑测试。
- 集成测试用 `describe.skipIf(!existsSync(workerBundle))` 保护，worker bundle 不存在时整体跳过。
- 平台专属测试只在对应平台执行：Windows不执行macOS helper、Keychain、macOS代理及DMG用例；macOS不执行WinINet、AppContainer、Windows原生恢复及MSI用例。平台目录通过Vitest收集范围限定，混合文件中的用例通过`runIf`限定；真实E2E在创建App前由平台条件排除。未执行项不算通过，不为运行另一平台的测试修改产品路径代码。
- 通用协议、数据格式、版本解析和支持平台检查继续跨平台执行；不能仅因测试数据或说明中出现Windows/macOS就整文件排除。

平台专属范围包括：Windows的WinINet、AppContainer、当前用户CA文件/证书查看器、Windows进程与原生窗口保护及MSI；macOS的helper部署/通信、Keychain信任、macOS系统代理/WPAD、DMG与macOS原生窗口专项。共用的用户流程仍由当前平台driver执行，不能用另一个平台的fake冒充本机实现。普通默认命令遵守这些限定，不要求额外过滤参数。

按用户确认，移除依赖个人登录与第三方页面结构的Bilibili专属workflow，不以第三方登录态作为通用协议验收前提。Windows人工UAC取消专项不作为验收门槛；产品的取消/拒绝错误分支、证书安装/卸载、退出恢复及macOS可自动化的原生授权测试保留。移除范围不记为passed，也不修改系统授权策略。

## 5. 常用命令

Electron 44的npm包按需下载运行时；`npm ci`成功和`npm ls`版本匹配不代表Windows Electron二进制已经就绪。需要使用镜像的环境先通过包自带入口安装，再运行会加载Electron的测试；PowerShell环境变量只对当前进程及其子进程生效：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm exec --no --workspace @interceptor/desktop -- install-electron
```

```powershell
npm run typecheck
npm run test --workspace @interceptor/platform-capabilities -- --no-file-parallelism
npm run test --workspace @interceptor/desktop
npm run test --workspace @interceptor/proxy-core -- --no-file-parallelism
npm run test --workspace @interceptor/core-protocol
npm run test --workspace @interceptor/mcp-server
node apps/desktop/tests/visual-parity/parity.mjs
```

完整 parity 在 `1600×900`、`deviceScaleFactor=2` 下按每批 5 个 view 启动独立 Edge 子进程；每个 view
使用独立BrowserContext，以限制内存峰值，不改变单场景状态、断言或像素算法。browser、Vite与design preview
统一在`finally`关闭，失败不得遗留测试server。

涉及 Main / Preload / IPC / Fuses / CSP / 打包边界时追加：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:package-audit --workspace @interceptor/desktop
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
```
