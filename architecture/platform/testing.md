# 平台架构：测试分层

> 范围：测试层级、驱动方式、隔离边界和执行约束。

## 1. 验证层级

| 层 | 位置 | 驱动方式 | 职责 |
| --- | --- | --- | --- |
| 单元 / 集成 | 各 workspace 的 `tests/` | Vitest（`environment: node`） | 纯逻辑、真实 worker_threads、真实 `node:sqlite`、真实 HTTP/2 |
| E2E workflow | `apps/desktop/tests/e2e-workflow-tests/` | Windows `_electron.launch()`；macOS未打包Electron+Renderer CDP，可显式选择签名产物 | 从真实 App UI 出发的端到端 workflow |
| Packaged smoke | `apps/desktop/tests/packaged-smoke/` | 最终 package + CDP | 打包产物的综合验证 |
| 设计一致性 | `apps/desktop/tests/visual-parity/` | 独立Node命令、测试目录内fake Preload | Renderer与`design-vite/`声明元素的几何、样式、状态严格一致性，不依赖Agent或截图 |
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
- **零 Mock / 零 seed输入边界**：测试操作通过公共 automation ID 进入真实 App UI，再走 Preload/Main/Core/Storage/Proxy/Worker；测试侧只拥有loopback origin/client、证据与清理。导入文件必须由同一workflow先经产品Export真实产生，测试只能只读核验并重新选择，不得自行构造业务输入。`fixtures/ui/windows-file-dialog.ts`用Windows UI Automation定位真实Open/Save Dialog，再用真实鼠标键盘选择路径，不改写dialog返回值；可选步骤截图只在填入测试自产路径后按owner进程代际捕获该对话框窗口，不截桌面或其他应用。`apps/playground/server/scenarios/traffic-lab.ts`提供共享协议服务与随机origin port，但被测Proxy listener保持产品默认`127.0.0.1:8888`。**禁止 `page.evaluate(window.interceptor.*)` 代替业务操作。**
- **fixture分类与协议归属**：`runtime/` 管进程与profile，`ui/` 管真实控件驱动，`safety/` 管宿主恢复，`agent/` 管模型模拟；按上述取舍保留的安全判断单测仍随所属目录放置。`trafficLab`为每条workflow统一拥有Playground的HTTP、WebSocket和按需TLS服务，场景运行与细粒度控制共享origin。E2E可直接使用Node流量API；Browser Playground只在页面或Browser MCP流程需要时启动。详细边界见[fixtures说明](../../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)。

## 3. 驱动与证据边界

用户流程规格由`e2e-workflow-tests/README.md`和`docs/`维护，可执行用例通过Playwright `--list`确认。`packaged-smoke/startup.spec.ts`负责最终产物的综合启动、安全、资源与退出检查，不等同于全部feature workflow。

macOS常驻helper独立于每条workflow的Main/Core，不作为它们的子进程清除；测试结束仍须证明全部App代际、8888和系统代理/证书恢复。整轮组件的保留或卸载按用户授权处理，不能以helper仍运行掩盖App残留，也不能在每条workflow拆除组件破坏跨启动复用验收。Core故障读取完整原代理并观察旧journal代际退出，自动重接管后核验新original/owned不变；两端均使用用户级journal跨profile恢复，Windows原路径/格式保持。

`apps/playground`不是测试Runner。Browser MCP流程需要真实Electron与浏览器之间的链路；Playground人工报告由使用者实际操作并观察产品与origin后填写，自动结果不能代填。

业务workflow从`npm start → Test → E2E`选择普通验收或逐步截图，仍执行同一份操作与断言。截图模式自动建立独立运行目录，普通测试不会清理其产物；在明确检查点记录PNG，在原driver及宿主guard结束后生成带结果、语言/主题、尺寸和SHA-256的清单。不维护单独Guidebook制作/导入菜单或跨仓发布脚本，截图不绑定Homepage。macOS使用独立的一次性原生窗口截图工具，不需要录屏器或FFmpeg；Windows原生Open/Save面板使用owner-scoped `PrintWindow`，进入测试目录并遮盖导航侧栏与地址breadcrumb后写PNG，不捕获桌面或个人路径。直接CLI/CI参数、目录和平台范围见[步骤截图说明](../../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)。原图不自动发布，使用前仍须审核隐私与实际验证范围。

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

完整parity在`1600×900`、`deviceScaleFactor=2`下按每批5个view启动独立Edge子进程；每个view使用独立BrowserContext以限制内存峰值，不改变单场景状态或严格数据判定。父进程只准备一次Renderer Vite和设计preview，异步等待子批次并持续报告进度；设计构建使用本次独占临时目录，退出清理，不依赖其他构建可覆盖的共享dist。

普通差异继续汇总余下批次；环境错误不能继续时明确记录未运行范围。browser、Vite与design preview统一在`finally`关闭，关闭失败写入错误报告，不得吞掉后声称通过。SIGINT/SIGTERM分别以130/143退出并清理本次资源。最终报告不混入运行中的中间状态，生成报告与批量截图不进入Git，手工设计评审和真实E2E的截图机制保持独立。

App视觉基准已按用户确认恢复为视觉对齐前的实现，不再为消除设计差异调整产品：

- [源码恢复核对](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/final-scope-verification.json)覆盖43个Renderer实现/样式文件和15个语言资源文件，均与改前源码逐字节一致；菜单统一恢复Ant Popover，JetBrains Mono恢复原可变字重注册，断点数量恢复原普通文字。具体行为见[Renderer说明](renderer.md)。
- [相关产品测试](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/final-green-tests.log)为11个文件、126项通过，[Desktop typecheck](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/final-typecheck.log)通过；恢复前的目标Red分别保留在[细微排版](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/red-tests.log)和[字体/数量文字](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/three-groups-red-tests.log)中。
- [全场景数据报告](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/all-scenes/report.md)覆盖534/534场景、4137/4137目标；缺失、歧义、不稳定和执行错误均为0。保留2305条差异（2293条几何、12条样式，几何差值绝对值最大4px），结果仍为`differences`，不能称为设计一致性通过，也不把78个相关文件当作78个产品故障。
  - [输入与来源记录](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/resume-inputs.json)核对734份输入及Node、Edge版本；汇总暂停前完整285个场景与恢复后249个场景。中断批次重新执行，原中断报告保留；这是同一有效基准下的完整覆盖，不是一次连续运行。
  - [收尾核对](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/app-led-revert/final-verification.json)确认源码、保留修复与Git staged mode/blob未变，5199在IPv4/IPv6均已释放。本层未启动真实Electron/Main/Core，未改宿主代理或证书，不作为业务E2E或最终打包验收。
- 已确认的比较准备修正继续保留：设计请求菜单不因`key`变化重建，普通Body行选择排除隐藏断点行，设计字体栈移除未注册的Inter Variable前缀；两侧编辑器的后续ResizeObserver通知合并到动画帧，卸载取消回调。独立数据parity、原始精度和全部目标不变，未采用后续未批准的设计同步候选。
  - ResizeObserver修复的前置[两个Red](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/resize-observer-fix/unit-red.log)、[四文件60项Green](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/resize-observer-fix/related-unit-green.log)与[原始全量记录](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/resize-observer-fix/full-verification.json)保留。该历史阶段覆盖534场景、4125/4137目标，观察器错误从3降至0，原始5175条元素差异与场景条件逐项未变；38个故障场景目标复验无运行错误，两个当时未确认设计菜单的前提错误仍使整体状态为`error`，不冒充当前最终结果。
  - [比较条件与日志归因记录](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/parity-comparison-audit/full-page-diagnostics-verification.json)保留修复前5条错误的归属：两个未就绪设计菜单使12个目标未比较，其余三条为ResizeObserver错误。两次全量原始差异一致，727份受测源码未变，8个预期WPAD失败日志按场景保留、构建错误为0。该阶段的[修正预览](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/parity-comparison-audit/review/)是历史材料，不表示仍等待同一轮确认；原始失败证据未覆盖。
  - [中文具体差异验收](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/parity-specific-differences/)保存实际CLI、原始报告与分组核对：`upstream-settings-system-editing-light`的8个目标产生12条差异、0执行错误，报告调整前后`views`和`summary`完全相同；精度、方向、字体声明、状态值、分组和文件链接均已检查。上述历史运行均正常关闭自有服务并释放5199，未启动真实Electron或操作宿主代理、证书，不作为业务E2E。

设计稿按上述固定App基准同步，Rules菜单正式落地前的小差异验证如下：

- 设计入口复用已有Ant reset，主行高与对应局部行高、默认段落/列表间距、普通计数及文本分段、菜单间距和分隔线归属按App同步。字体来源与注册方式不变，不修改Renderer或比较规则来消除差异。
- [菜单落地前的完整覆盖报告](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/current-small/report.md)覆盖534/534场景、4137/4137目标；2305条差异降至3条，均属于Rules的Add action菜单位置/高度。缺失、歧义、不稳定和执行错误均为0；该阶段仍为`differences`，不是全量通过。
  - 来源为[第二轮全量](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/full-02/report.md)中未受影响的532个场景，加上[Proxy标题与设置导航复验](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/proxy-title-final/report.md)的2个场景、6个目标。不是一次连续运行；原始全量的5条差异报告保留，不混入未批准候选的结果。
  - [适用性核对](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/current-small/verification.json)确认734份输入中733份逐字节未变，唯一后续改动严格限定为`.proxy-ready-dialog > .dlghead > b`的18px行高；未改通用弹窗标题。App保持不变，原场景记录逐项保留，5199在IPv4/IPv6均已释放。
- [Design typecheck](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/final-small-typecheck.log)通过；Proxy弹窗的[浅色](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/proxy-title-shots/light/proxy-not-ready/dialog.png)与[深色](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/proxy-title-shots/dark/proxy-not-ready/dialog.png)设计图已生成并检查，标题、图标、正文和按钮布局正常。设计截图与独立数据parity分开执行，没有新增设计工具自身测试；本轮未启动真实Electron/Main/Core，也未操作系统代理或证书，不作为业务E2E。
- Rules菜单的[三方评审](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/rules-candidate/index.html)已获用户确认并落地：修复编辑器裁切并同步App的Popover、组标题与动作图标。以下候选记录保留为历史评审证据，不代替正式源码的最终验证。
  - [候选类型与交互补验](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/rules-validation-04/result.json)使用仓库已有TypeScript 7.0.2的内存文件接口检查虚拟组件及修改后的源文件，配置、全局、语法、绑定与语义诊断均为0；该次检查只在内存修正CSS Modules class拼接类型，没有落盘或变更依赖。正式实现已包含此修正。
  - 明暗主题均先取得harness稳定帧，再核对10个动作的命中；菜单与App同为`782 / 413 / 250 / 486.5625`，Breakpoint不再被裁切。触发按钮、Escape和外部点击均能关闭，缩小到`1280×700`后菜单仍完整进入视口，全部动作可命中；[设计与App截图](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/rules-validation-04/images/)已检查。
  - 原设计与候选的动作条目都只作静态示意：点击Rewrite header后仍为2张动作卡片且菜单不关闭；App会新增动作并关闭。这是保留原设计能力，不算新增动作业务流程通过，也未为本项扩建设计编辑器。
  - 候选通过[独立CLI定向复验](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/rules-validation-04/official/report.md)：`rules-add-action,rules-select-dropdown`共2个场景、2个目标，0差异及执行问题；只证明已声明字段一致。734份正式输入未变，自有Renderer、两个设计preview与浏览器均关闭，三个动态端口重新绑定成功；菜单落地前的完整报告保留当时的3条差异。
- Rules正式源码的[Design typecheck](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/applied-typecheck.log)与[交互及定向检查](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/rules-applied-validation-02/result.json)通过，不使用Vite源码转换或虚拟组件：明暗菜单的几何与App严格一致，10项动作均可命中，触发按钮、Escape、外部点击关闭及`1280×700`边界避让通过；设计动作条目仍保留上述静态示意能力。原CLI对`rules-add-action,rules-select-dropdown`的2场景2目标为零差异，737份输入未变，两个自有页面服务及浏览器退出，端口重新绑定成功。
  - [首次正式诊断记录](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/rules-applied-validation/result.json)捕获开场动画中的缩放尺寸，未算通过；手工交互检查随后按既有菜单截图准备方式等待真实动画结束，再调用原harness采样。没有关闭产品动画、修改parity判定或补偿几何读数；定向结果不能替代全量验证。

设计稿按App基准同步的最终验收：

- [正式源码全量报告](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/full-applied/report.md)为一次连续运行：534/534场景、4137/4137目标，差异、缺失、歧义、不稳定和执行错误均为0，退出码0；本项差异记录由2305降至0，没有删除目标或放宽比较规则。
- [输入与退出核对](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/design-sync-preview/full-applied-verification.json)确认737份输入逐字节未变，Renderer视觉基准不变，Node为`v24.21.0`、Edge为`155.0.4283.62`；5199在IPv4/IPv6均已释放。
- 为隔离并行会话的未提交Android设计和Core改动，[提交候选类型检查](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/item21-commit/typecheck-index.json)直接使用独立Git index中的源文件，125个根文件、1164个依赖源文件为0诊断，不写工作区或实际index；[提交候选parity](../../../../.copilot/session-state/a420ef8f-364c-45ad-aa6f-936b1b113590/files/item21-commit/parity-index/report.md)在Capture、Add action和Rule Select共3场景44目标上严格零差异，737份工作区输入未变，自有服务与浏览器退出。
- 本轮仅同步设计稿及相关说明，没有修改Rules业务或Renderer，也没有运行真实Electron/Main/Core、操作宿主代理或证书；上述结果不替代真实业务E2E。全量报告不读取或生成PNG，手工设计评审截图单独保留在本地。

Android USB接入当前验证：

- Main Android device owner的6个纯业务目标与APK parser/安装器5个目标通过，覆盖：
  - 设备拔出/offline后的Core停止与本地ownership释放；
  - ADB transport名称不同于用户serial时仍只按本轮local/remote端口核对mapping；
  - APK缺失安装、同签名升级、换签拒绝、降级拒绝及安装后精确字节复核。
- API35 emulator真实ADB integration通过：
  - `devices -l`读取ready设备；
  - 正式Launcher由`am start`打开；
  - Main listener建立`reverse --no-rebind`，手机`toybox nc`实际穿透到该listener；
  - 清理只执行目标设备`reverse --remove tcp:39080`，共享ADB Server保持运行；
  - 另从设备卸载测试App后，由`AndroidDeviceService.installDeviceApplication()`执行真实`adb install -r`，设备内base APK SHA-256、版本与随包APK再次完全一致。
- Renderer按现有Android设计新增安装态，四主题的已安装与缺失共8场景、48/48目标严格parity通过；报告在忽略目录`apps/desktop/test-results/visual-parity/`，不读取或生成PNG。
- 最新macOS package包含正式签名`0.1.0` Android APK、Platform-Tools 37.0.1、NOTICE与manifest；manifest固定APK SHA-256 `a5899620307f674b79ff1d6a91ae66e79ae1ad00efa14bec4bf70748f0f62375`及签名证书SHA-256 `bbf7858fcad16453a5d224f2835d9d31aaf20cae34819dae76b98c3f3699eb79`。package artifact audit核对1532个文件、413004691字节并通过；Forge保留Google官方ADB签名和staging SHA-256，完整App通过`codesign --deep --strict`。
- `npm audit --omit=dev`在把既有override从DOMPurify 3.4.16更新到3.4.17、`ip-address` 10.7.3更新到10.7.4后为0 vulnerability；Monaco和代理栈主版本均未变化。Workspace typecheck、package/artifact audit及隔离Android parity通过；全workspace测试仅保留既有raw TCP FIN两项目标Red，与本次patch升级无关。
- 最新未打包Electron在独占窗口完成真实API35双端流程：产品UI从缺失态安装随包APK，双方输入并确认完整指纹，Main启动Core listener和精确reverse，Android完成真实系统通知/VPN授权，TUN HTTP返回并在Capture显示Android来源；随后手机本地停止、Desktop断开并正常Close。最终VPN、reverse、8888和系统代理journal全部为空。该流程使用emulator ADB传输，不替代物理USB拔线、ARM64真机或原生16KiB硬件。
- 此前APK SHA-256 `b116e283f40c2cbd87d37e8ad9360314baed9a463a3162fa9fa7a78a3fe9640e`的package完成过完整packaged smoke；它不再是当前draft asset。EC签名重建会产生不同APK字节，最新APK使外层ad-hoc App的designated requirement变为`cdhash H"c7c2159a7e08a032d4a91b7b1471301da1085a9d"`，已安装helper当时仍授权`cdhash H"66be08972cea020f5ab9103b24cd37dc3b69fd36"`；初次smoke真实停在SecurityAgent管理员重新授权，没有修改授权数据库、放宽helper校验或移用旧package结果。用户随后完成真实管理员确认，helper授权与当前App requirement一致，最新package完整smoke 1/1 Green；固定`interceptor://app`、Preload白名单、sandbox/CSP、Main/Core、Capture、Composer、Breakpoint、截图矩阵、正常Close和系统代理恢复均通过，最终Main/Core/Worker退出，8888与39080空闲。

涉及 Main / Preload / IPC / Fuses / CSP / 打包边界时追加：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:package-audit --workspace @interceptor/desktop
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
```
