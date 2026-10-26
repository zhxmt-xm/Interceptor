# 平台架构：测试分层

> 范围：测试层级、驱动方式、隔离边界和执行约束。

## 1. 验证层级

| 层 | 位置 | 驱动方式 | 职责 |
| --- | --- | --- | --- |
| 单元 / 集成 | 各 workspace 的 `tests/` | Vitest（`environment: node`） | 纯逻辑、真实 worker_threads、真实 `node:sqlite`、真实 HTTP/2 |
| E2E workflow | `apps/desktop/tests/e2e-workflow-tests/` | Windows未打包`_electron.launch()`；macOS及显式packaged App使用Renderer CDP | 从真实 App UI 出发的端到端 workflow |
| Packaged smoke | `apps/desktop/tests/packaged-smoke/` | 最终 package + CDP | 打包产物的综合验证 |
| 设计一致性 | `apps/desktop/tests/visual-parity/` | 独立Node命令、测试目录内fake Preload | Renderer与`design-vite/`声明元素的几何、样式、状态严格一致性，不依赖Agent或截图 |
| 人工验收工具 | `apps/playground/` | Browser手动点击 + Node Traffic Lab | 最新MCP全部详情、逐Tool人工结论与可控协议流量；不替代任何自动层 |

各层职责独立，不能互相替代。

### 辅助测试取舍

E2E fixture与Playground的既有测试按保护的实际风险维护，不因目录里已有测试就继续增加，也不因为测试失败就删除。产品业务单测、Core真实协议集成、Electron workflow和退出恢复不属于精简范围。

- E2E fixture的既有测试保护宿主恢复、精确进程归属和失败profile保留；原生文件窗口与模型交互通过所属真实workflow验证。
- Playground的既有测试保护输入边界、脱敏、取消及真实HTTP/TLS/WebSocket场景，不扩充recipe清单、布局或序列化辅助代码的单测。
- 工具修改直接跑受影响的Playground场景或已有真实E2E；不因精简另建一套fixture测试、测试注册层或宽泛skip。仅删除测试文件不等于对应业务已通过，已有失败与历史证据仍保留。
- 具体职责见[fixtures说明](../../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)与[Playground维护边界](../../apps/playground/README.md#既有辅助测试的维护边界)。
- 正文分块单测保留超过1MiB的真实字节数组、offset/分块调用和end断言，使用完整字节比较而非对百万个索引做通用对象深比较；不能用降低数据量、抽样字节或放宽超时代替等价校验。

Windows实机验收的方法与前提见[Windows执行要求](../../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)，未完成任务由[Handover](../HANDOVER.md)跟踪。各任务完成自身受影响范围的验收；未执行、skip和失败不能改写为通过，发布产物门禁不因此取消。

## 2. Local E2E driver

- **平台启动driver**：Windows继续用`_electron.launch()`启动未打包production bundle，prepare复用Forge Vite配置；macOS默认spawn同一项目的未打包Electron，以Renderer CDP驱动相同workflow。两者都由测试拥有进程，不附着人工Forge实例；协议/Core/native按正式构建顺序准备，业务E2E不要求每次package。
- **Windows启动失败**：Windows保留原`_electron.launch()`与`firstWindow()`入口，按原门禁检查App root、Core PID和listener。启动异常保留profile及原始错误，关闭异常一并报告；不删除仍占用中的Chromium文件，也不将清理的`EBUSY`替代启动失败。
- **已有packaged App**：`INTERCEPTOR_E2E_APP_PATH`显式选择当前平台Windows `Interceptor.exe`或macOS `.app`；`run.mjs`跳过prepare，driver以`spawn()`和Renderer CDP运行同一份workflow。生产Fuses不启用Main debugger，实际版本从App产物读取；未指定产物时保留原未打包入口。
- **平台差异归属**：业务workflow共用操作、输入和结果。helper读取、journal位置、窗口准备、超时、故障观察/profile选择及独立系统权限检查归driver/fixture的Windows/Macos方法，不把macOS适配扩成Windows业务步骤。Windows保留WinINet六字段宿主比较、JSON证据比较和原恢复顺序；macOS完整结构比较与admin trust检查独立执行。
- **macOS窗口与日志**：业务E2E由driver按配置准备真实窗口，常规`macos`项目保持1600x900；只有body-fill滚轮边界用独立`macos-scroll-boundary`项目的1600x800，两者互斥匹配。等待System Events就绪并验证DOM尺寸，不改变Windows窗口或产品布局。macOS日志使用profile内0600文件继承给子进程，避免runner结束后保留App遭遇pipe EPIPE；日志附加前仍扫描敏感内容，证据保持有界。正常结束删除profile；恢复未完成保留profile及私有日志。
- **macOS helper**：开发与业务E2E按`app.isPackaged=false`共用获准UID的开发socket，不核准每次App构建，不因新profile/HMR/rs/重编译业务代码重新安装。原生构建按源码、工具链、签名参数及产物哈希缓存，helper自身变更才更新组件。生产App仍使用独立严格鉴权；`INTERCEPTOR_E2E_MACOS_APP_PATH`只供driver显式选择已有签名App，非产品参数，设置它时直接运行Playwright，不运行prepare。
- **统一安全 Renderer origin**：Main 只要没有 `MAIN_WINDOW_VITE_DEV_SERVER_URL` 就安装 `PackagedRendererProtocol`，因此 local production bundle 与最终 package 都从 `interceptor://app/index.html` 加载；开发 HMR 仍使用精确 Vite origin。该条件不依赖 `app.isPackaged`，但可信导航与 CSP 边界不放宽。
- **生命周期与证据**：`fixtures/runtime/local-electron-driver.ts` 为每个测试创建独立临时 `userData`，启动 BrowserContext trace，等待真实 Renderer/Core/8888 listener，并在 workflow 后保存 `trace.zip`、`final.png`、Main/Renderer 日志和 PID/端口 metadata；两平台普通收尾都点击产品`shell.window.close`，验证 Main/Core 退出与 8888 可重新 bind，不以macOS菜单Quit替代Close。macOS主动crash后立即落该代证据，避免同profile下一代清理日志造成缺失；只有原生快捷键专项使用Command+Q，Windows保留Alt+F4。强制关闭只在宿主保护允许时兜底，不能作为正常退出或E2E成功证明。
- **共享CA验收**：普通workflow及smoke先只读检查已由产品初始化的用户级CA，结束保留材料和系统信任；不把共享CA复制进profile。首次初始化专项允许产品启动生成/授信，破坏性专项要求空共享目录并保存完整Root/admin trust基线。仅测试fixture声明范围，不给产品增加专用路径或开关；Windows首次窗口等待允许新CA UAC完成，业务/系统代理原生契约不变。
- **失败时保留特权profile**：调用`preserveUserDataOnFailure()`的workflow，在Playwright实际状态为`failed`、`timedOut`或`interrupted`时必须保留profile，不能仅判断`await use(driver)`是否抛错；任何清理或宿主guard错误也必须保留。判定归`fixtures/runtime/workflow-profile-retention.ts`，unit覆盖状态与错误组合。CA清理按本轮身份和真实信任状态等待正式UI，不以按钮瞬时不可见当作已清理。
- **零 Mock / 零 seed输入边界**：测试操作通过公共 automation ID 进入真实 App UI，再走 Preload/Main/Core/Storage/Proxy/Worker；测试侧只拥有loopback origin/client、证据与清理。导入文件必须由同一workflow先经产品Export真实产生，测试只能只读核验并重新选择，不得自行构造业务输入。`fixtures/ui/windows-file-dialog.ts`用Windows UI Automation定位真实Open/Save Dialog，再用真实鼠标键盘选择路径，不改写dialog返回值；可选步骤截图只在填入测试自产路径后按owner进程代际捕获该对话框窗口，不截桌面或其他应用。`apps/playground/server/scenarios/traffic-lab.ts`提供共享协议服务与随机origin port，但被测Proxy listener保持产品默认`127.0.0.1:8888`。**禁止 `page.evaluate(window.interceptor.*)` 代替业务操作。**
- **fixture分类与协议归属**：`runtime/` 管进程与profile，`ui/` 管真实控件驱动，`safety/` 管宿主恢复，`agent/` 管模型模拟；按上述取舍保留的安全判断单测仍随所属目录放置。`trafficLab`为每条workflow统一拥有Playground的HTTP、WebSocket和按需TLS服务，场景运行与细粒度控制共享origin。E2E可直接使用Node流量API；Browser Playground只在页面或Browser MCP流程需要时启动。详细边界见[fixtures说明](../../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)。

## 3. 驱动与证据边界

用户流程规格由`e2e-workflow-tests/README.md`和`docs/`维护，可执行用例通过Playwright `--list`确认。`packaged-smoke/startup.spec.ts`负责最终产物的综合启动、安全、资源与退出检查，不等同于全部feature workflow。

macOS常驻helper独立于每条workflow的Main/Core，不作为它们的子进程清除；测试结束仍须证明全部App代际、8888和系统代理/证书恢复。整轮组件的保留或卸载按用户授权处理，不能以helper仍运行掩盖App残留，也不能在每条workflow拆除组件破坏跨启动复用验收。Core故障读取完整原代理并观察旧journal代际退出，自动重接管后核验新original/owned不变；两端均使用用户级journal跨profile恢复，Windows原路径/格式保持。

`apps/playground`不是测试Runner。Browser MCP流程需要真实Electron与浏览器之间的链路；Playground人工报告由使用者实际操作并观察产品与origin后填写，自动结果不能代填。

业务workflow从`npm start → Test → E2E`选择普通验收或逐步截图，仍执行同一份操作与断言。截图模式自动建立独立运行目录，普通测试不会清理其产物；在明确检查点记录PNG，在原driver及宿主guard结束后生成带结果、语言/主题、尺寸和SHA-256的清单。教程发布入口复用这些workflow，按Homepage的`workflows → steps → image`契约校验和生成图片；完整步骤、实际版本及退出恢复不符时停止，操作方法见[开发工作流](../development.md#全部教程截图与homepage发布)。macOS使用独立的一次性原生窗口截图工具，不需要录屏器或FFmpeg；Windows原生Open/Save面板使用owner-scoped `PrintWindow`，进入测试目录并遮盖导航侧栏与地址breadcrumb后写PNG，不捕获桌面或个人路径。直接CLI/CI参数、目录和平台范围见[步骤截图说明](../../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)。普通逐步截图只保存在本地；发布入口只在完整校验后按所选模式生成候选或更新Homepage。

## 4. 执行约束

- 普通E2E的Renderer DOM操作、原生文件面板关闭后的页面断言、窗口尺寸准备和产品Close均不主动前置App。窗口准备只等待并调整真实窗口，不以`frontmost`促使窗口出现；原生Open/Save、系统授权、原生快捷键和最小化恢复专项才由所属driver核对进程代际后取得焦点。产品正常启动显示窗口的行为不变，不增加后台模式或测试专用产品参数。
- macOS Open/Save的路径和文件名以20ms逐字符发送真实Unicode键盘事件；每个字符前核对所属App仍在前台，再由AX完整回读字段。5ms在长临时路径上会稳定截断后半段；不通过写AX值、共享剪贴板或放宽完整值断言规避。
- parity使用显式`headless:true`、`--no-proxy-server`的Edge和`windowsHide:true`的Node子进程，不创建可见测试窗口，不调用系统键鼠、前置或置顶。直连仅用于parity浏览器，避免设计/font请求经过被测系统代理，不改App或宿主代理设置。页面内的Playwright DOM操作不需要OS前台焦点；真实Electron窗口恢复、Open/Save和UAC不属于这一层，用户暂停时保留原用例，等待明确通知后执行。
- parity设计页先逐字重加载`Inter`和`JetBrains Mono`并确认得到已加载的FontFace，再重新计算Monaco字体；Renderer也核对实际使用的自定义字体。`document.fonts.ready`本身不代表下载成功；字体不可用时直接报错，不使用fallback生成布局结论，不更换字体或放宽严格比较。
- parity设计页在同一批次复用，每个场景先清理`overlay: ''`、`mcpToolApproval: ''`并重置`mitm: 'inactive'`，再应用自身`designState`；显式浮层和active场景优先。明暗“MITM Tunnel→普通Capture”、“Composer Export loading→选中目录”及MCP审批后的Composer不能残留上一场景的遮罩。不新增工具自身单测，不改变产品MITM或文件操作。
- 字符串parity目标先以设计侧确定button/text测量语义，双方候选节点去重后必须唯一；缺失或歧义明确记录，不挑第一项。重复控件在配置中限定容器、已选择记录或既有标识；保留必要的`measureText`，不以文字边界代替实际flex对齐规则。
- parity采集原始相对内容画布的几何、声明样式与DOM/ARIA状态。只去除设计页额外卡片装饰，不从目标差值推算或扣除整体偏移；任何非零数值差异均报告，没有1px容差或epsilon。两秒内无法取得相邻帧一致数据、读取错误及未检查范围不能算通过，不等待数值接近设计来隐藏偏差。
- 正常parity的设计与Renderer浏览器视口均为1600×900，设计画布外评审留白在测量前移除。每侧核对实际视口、画布、主题及声明的侧栏状态，JSON保留`conditions`；菜单使用同一逻辑记录与行内触发位置，并分别检查弹层进入可视区域。场景条件不满足时按所属侧记录场景错误，不把离屏初始化位置或不同侧栏状态生成的差值归为产品布局问题；不通过自动补切侧栏、移动弹层或丢弃目标来凑一致。
- `npm start → Test → Parity`与直接CLI运行同一套独立采集、比较、报告流程，不需要模型凭据、外部Agent或MCP。报告默认在`apps/desktop/test-results/visual-parity/`；中文报告按文件绑定具体控件/主题和差异，写清设计值、Renderer值及偏移/增减，不只给“不一致”标签。只合并字段、原始值等均相同的差异，不混淆位置；终端最多列10条具体差异，完整记录和日志在JSON中。关联文件来自实际CSS Modules规则，只是定位入口，不能自动判为根因；未定位时明确说明并给出场景配置。退出码0为通过、1为差异/缺失/歧义/不稳定、2为配置/执行/清理/报告错误；不代表未配置元素、绘制内容或真实E2E通过。
- parity的浏览器console error/warning按所属场景保留为`logs`，不经Vite转发后误标成构建错误；预期业务失败不自动改变退出码。未处理的JS异常和浏览器ErrorEvent仍进入所属侧的页面错误，不忽略ResizeObserver等运行问题；页面关闭前停止采集，正常退出取消不冒充新错误。
- **Proxy Core 全套必须 `--no-file-parallelism`**。大压缩流、真实文件 I/O 与随机端口并行会产生 5 秒假超时；与 desktop 并行运行时 `proxy/tests/integration/h2.test.ts` 会假失败。
- **禁止并行运行 `build:core` 与依赖 `dist` 的集成测试**。`build.mjs` 每次先递归删除 `dist`，而真实代理集成测试运行时依赖该目录，并行会导致瞬时 `ECONNRESET`。必须构建完成后再顺序跑测试。
- 集成测试用 `describe.skipIf(!existsSync(workerBundle))` 保护，worker bundle 不存在时整体跳过。
- 平台专属测试只在对应平台执行：Windows不执行macOS helper、Keychain、macOS代理及DMG用例；macOS不执行WinINet、AppContainer、Windows原生恢复及MSI用例。平台目录通过Vitest收集范围限定，混合文件中的用例通过`runIf`限定；真实E2E在创建App前由平台条件排除。未执行项不算通过，不为运行另一平台的测试修改产品路径代码。
- 通用协议、数据格式、版本解析和支持平台检查继续跨平台执行；不能仅因测试数据或说明中出现Windows/macOS就整文件排除。

平台专属范围包括：Windows的WinINet、AppContainer、当前用户CA文件/证书查看器、Windows进程与原生窗口保护及MSI；macOS的helper部署/通信、Keychain信任、macOS系统代理/WPAD、DMG与macOS原生窗口专项。共用的用户流程仍由当前平台driver执行，不能用另一个平台的fake冒充本机实现。普通默认命令遵守这些限定，不要求额外过滤参数。

通用协议验收不依赖个人登录与第三方页面结构。Windows人工UAC取消专项不作为验收门槛；产品的取消/拒绝错误分支、证书安装/卸载、退出恢复及macOS可自动化的原生授权测试保留，不修改系统授权策略。

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

完整parity在`1600×900`、`deviceScaleFactor=2`下按每批5个view启动独立Edge子进程；每个view使用独立BrowserContext以限制内存峰值，不改变单场景状态或严格数据判定。父进程只准备一次Renderer Vite和设计preview，异步等待子批次并持续报告进度；设计构建使用本次独占临时目录，退出清理，不依赖其他构建可覆盖的共享dist。

普通差异继续汇总余下批次；环境错误不能继续时明确记录未运行范围。browser、Vite与design preview统一在`finally`关闭，关闭失败写入错误报告，不得吞掉后声称通过。SIGINT/SIGTERM分别以130/143退出并清理本次资源。最终报告不混入运行中的中间状态，生成报告与批量截图不进入Git，手工设计评审和真实E2E的截图机制保持独立。

<a id="windows-android-local-environment"></a>
Windows Android本机环境：

- Android构建使用JDK17、Go、SDK36、Build Tools `35.0.0`、NDK `29.0.14206865`和Platform-Tools `37.0.1`；SDK许可由用户确认，`local.properties`中的Windows盘符需要转义，例如`C\:/Users/zhang/AppData/Local/Android/Sdk`。
- 设备验证使用API35、API29、API26及API35 ps16k的Google官方x86_64镜像；ps16k镜像不能替代ARM64或真实16KiB硬件验收。
- 本机工具安装目录为`%LOCALAPPDATA%\interceptor-android\`，现有PowerShell通过`. "$env:LOCALAPPDATA\interceptor-android\activate.ps1"`加载工具与APK环境变量；新启动的终端使用用户环境变量。
- Android仓库执行`./gradlew.bat --no-daemon :app:nativeApkAudit :app:testDebugUnitTest :app:lintDebug :app:assembleDebugAndroidTest`，设备instrumentation另外执行；报告保留在Android仓库`app/build/reports/`和`app/build/test-results/`。
- Desktop执行`npm run build:native --workspace @interceptor/platform-capabilities`、`npm run e2e:prepare-local --workspace @interceptor/desktop`、`npm run package`和`npm run test:package-audit`；本机未签名Desktop包不能替代正式签名或完整packaged smoke，随包Android APK仍须使用原正式签名与固定摘要。
- 模拟器使用`Windows Hypervisor Platform`加速，启用后按系统要求手动重启，并用`emulator -accel-check`核对；编译、JVM测试及真机USB验证不依赖电脑虚拟化。物理USB验证要求手机开启并授权USB调试，不停止共享ADB Server或清理其他设备的reverse映射。

涉及 Main / Preload / IPC / Fuses / CSP / 打包边界时追加：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:package-audit --workspace @interceptor/desktop
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
```
