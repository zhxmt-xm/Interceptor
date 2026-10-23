# E2E Fixtures

本目录只负责真实 workflow 的环境、驱动与安全恢复，不维护 Capture 协议流量的第二套实现。

| 目录 | 职责 | 入口 |
| --- | --- | --- |
| `runtime/` | Electron 与 Browser Playground 的启动、可选步骤截图、证据、退出和 profile 保留 | [local-electron-driver.ts](runtime/local-electron-driver.ts)、[step-screenshots.ts](runtime/step-screenshots.ts)、[playground-server.ts](runtime/playground-server.ts) |
| `ui/` | 公共 automation 定位、Capture/Breakpoint/Playground 操作、分平台真实文件 Dialog | [automation.ts](ui/automation.ts)、[capture-workflow.ts](ui/capture-workflow.ts)、[breakpoint-workflow.ts](ui/breakpoint-workflow.ts)、[file-dialog.ts](ui/file-dialog.ts) |
| `safety/` | 宿主进程代际、系统代理与 journal 恢复保护 | [workflow-host-safety-guard.ts](safety/workflow-host-safety-guard.ts) |
| `agent/` | 可控的 OpenAI-compatible 流式回复、Tool Call 与模型请求证据 | [openai-compatible-lab.ts](agent/openai-compatible-lab.ts) |

MCP的确定性workflow与当前开发Host workflow复用[UI助手](ui/mcp-workflow.ts)完成Settings导航、
产品Copy config及恢复录制；不复制业务调用或读取加密Store。`current-host.workflow.ts`只准备真实App、
流量与UI断言，MCP调用由当前Agent的真实Host发起，不添加模型配置或另建Runtime。
该流程的`prepare`正常退出App并保留隔离profile；`verify`通过fixture的`desktopAppUserDataDirectory`
恢复相同Client和endpoint。fixture只接受E2E临时根目录的直接子目录，普通workflow默认仍新建并清理
profile。`preserveDesktopAppUserData`仅保留已准备的数据，不保留进程或放宽宿主恢复；验收失败使用既有
profile保留策略，完整成功后删除测试profile。准备通过不等于Host调用通过。

原Tool workflow的MCP调用可通过`runtime/workflow-mcp-client.ts`显式选择当前Host公开`mcp://`通道；默认官方SDK路径不变。
Host入口只配置本次Client、使用一次性同Host session公布的`serverTools`，不直连产品的替代Client。
VS Code 1.143应用配置后，当前Agent须在该一次性session执行官方`/mcp reload`；fixture会先写入
`configuration-applied`证据并输出无凭据提示，再等待Server出现。原UI、原生窗口与业务断言保持，
未公布的协议选项直接报错；结束后停止并移除本轮Server、删除一次性session，Host证据和原App退出证据同时保留。
具体参数及验收边界见[当前Host入口](../docs/mcp.md#原tool-workflow的当前host执行入口)。

辅助单测只保留以下既有安全判断，不替代真实 Electron workflow：

- [workflow-host-safety-guard.test.ts](safety/tests/unit/workflow-host-safety-guard.test.ts)：没有基线时不恢复宿主、只终止登记进程、恢复失败仍报告原污染。
- [windows-workflow-host-safety-operations.test.ts](safety/tests/unit/windows-workflow-host-safety-operations.test.ts)：精确PID代际/profile归属、外部代理修改不被覆盖、journal与恢复范围。
- [workflow-profile-retention.test.ts](runtime/tests/unit/workflow-profile-retention.test.ts)：失败或恢复未完成时保留profile及证据，不因测试结束误删恢复材料。

文件窗口的PowerShell片段/拼接顺序断言和OpenAI lab自身的响应快照已移除。前者不能证明真实点击或窗口归属，后者只验证模拟器返回自己排入的消息；Windows原生导入/导出与Agent Tool Call继续由所属真实workflow验证。driver、lab及产品实现未因此改变，不把移除辅助断言记为Windows或Agent验收通过。

## 平台分派

- `stepScreenshots`是默认关闭的测试option。`step-screenshots.ts`跟随当前测试的真实App代际，在原流程检查点保存PNG；自动fixture最先建立本次截图运行，最后在其他fixture、driver退出及宿主恢复结束后生成清单。driver只报告实际恢复结果，证据写入失败也进入原清理错误聚合，不得生成成功清单；不用图片代替业务断言。
- macOS PNG由[window-screenshot.swift](ui/window-screenshot.swift)一次性捕获，先核对所属Main及窗口。原生文件面板在[file-dialog.ts](ui/file-dialog.ts)的共享操作边界取景，底层macOS窗口工具不依赖截图runtime；只在定位本次文件后拍Open/Save，取消则拍返回App的状态。锁屏、权限或取景失败显式失败，不录桌面、不启动视频。
- 输出留在本次测试的`step-screenshots/`，fixture不读写Homepage、不执行Git。显式发布操作由`npm start`调用[发布脚本](../../../../../scripts/guidebook-publish.mjs)，复用原workflow与持久映射；普通模式仍保留原trace/final.png和正常退出门禁。
- `recordScreenshotExample()`保存测试实际拥有的loopback端点，拒绝用户名/密码和同key变更，移除query/hash；HTTP/模型/TLS fixture在真实listener就绪后登记，独立认证、MCP换地址与上游流程使用不同明确key。只有截图模式收集这些值，不通过Renderer/Store或产品参数注入示例。
- 可选高亮由`screenshot-highlights.ts`读取真实Locator边界，并在独立PNG上绘制红框与编号；App画面及原始PNG不变。目标不在当前窗口、未完整显示或捕获期间移动时明确失败，不使用猜测偏移；合成器仅在确有标注时加载。
- macOS原生路径与文件名由[type-macos-text.swift](ui/type-macos-text.swift)以20ms逐字符发送Unicode键盘事件，不使用共享剪贴板粘贴；每个字符前检查所属App仍在前台，避免事件队列截断长临时路径。实际字段仍逐字核对；Go To失败只显示测试自产目标和字段值，不读取或输出外部剪贴板。

- Windows文件窗口点击使用UI Automation提供的物理坐标及`SetPhysicalCursorPos`，不混用逻辑坐标；不改变系统缩放、窗口归属/前台检查、真实键鼠或提交后的文件断言。
- Recording助手同时处理fresh profile的readiness确认与已确认后的暂停/恢复：真实点击后等待Recording或确认按钮，只有确实显示readiness才确认；不等待不存在的弹窗，不调用Preload代替用户操作。
- Windows仍由`_electron.launch()`启动，并使用原有`firstWindow()`取得首窗；之后继续验证App root、真实Core PID与8888。启动失败保留profile和原始错误，关闭失败单独合并报告，不因删除仍被Chromium占用的profile而覆盖启动错误。
- macOS窗口准备仅操作已核对PID/启动时间的测试Main：只等待System Events暴露真实窗口，再调整并断言尺寸，不显示隐藏App或用前置促使窗口出现，不改变产品或模拟viewport。
- 普通收尾在Windows/macOS都点击`shell.window.close`，不打开macOS菜单Quit；Renderer DOM操作及原生文件面板关闭后的页面断言不调用`bringToFront()`。只有真实原生键鼠和最小化恢复专项取得焦点，原生driver继续核对目标窗口和进程代际。
- 业务workflow共用UI操作、真实流量输入和业务结果，不为macOS增加query、替换输入或改Windows超时。原生差异只放driver/fixture的明确Windows/Macos方法，不复制两套业务流程。
- `LocalElectronApplicationDriver`提供代理只读证据与journal路径；Windows继续读取WinINet和`LOCALAPPDATA`共享journal，macOS读取SystemConfiguration和用户级Interceptor Platform journal，两端crash恢复均用fresh profile。
- 普通workflow在启动前只读检查共享CA已就绪，运行中只恢复profile内TLS配置，不Generate/Install/Uninstall/Delete。首次初始化使用certificate-startup workflow；破坏性证书专项使用`certificate-lifecycle-driver.ts`，要求启动前共享材料为空，基线包含完整系统Root/admin trust，只能清理本轮CA，不使用产品隐藏参数。
- 首次授权/取消workflow用测试端`waitForStartupReady: false`取得准备中的首窗，自己验证BootScreen、原生确认与失败退出；普通workflow默认仍等ready。该选项只控制driver的等待时机，不改变产品参数、Store、IPC或原生返回值。
- macOS的`waitUntilReady()`先在既有120秒自动准备时限内观察ready或本轮helper的唯一授信窗口，首次启动与relaunch使用同一路径；仅确认该窗口存在且启动阶段为certificate后，前置并单独等待用户确认（最多300秒），再执行原来的ready/Core/listener检查。超时只取消归属明确的本轮窗口，保留失败，不继续业务步骤。`desktopApp`使用Playwright独立的600秒fixture预算，人工准备不消耗测试正文预算；首窗、普通启动和业务断言期限不变，Windows不变。`waitForStartupReady: false`的取消专项仍自己控制授权。
- macOS证书授权窗口和helper进程是分次采样：helper已退出但窗口或Renderer尚未更新时继续等待正式完成状态，不把该瞬间当成错误授权路径。仍检查本轮Main的真实`security add-trusted-cert`调用并明确拒绝；成功后等待原生窗口退出，不跳过系统确认。
- 启动页已进入公开的`data-phase="error"`时，driver立即报告启动失败并保留Main日志/trace，不再继续等待hidden直到耗尽120秒，也不自动点击Retry把失败改成通过。
- `LocalElectronApplicationDriver.launch()`为每代App的Page注册TLS兼容性提示handler，保留到Page关闭；准备、业务操作、清理和relaunch使用相同策略。仅激活“暂不”，不添加规则；macOS以仍存在的host行为触发条件，异步handler只取得当前公共按钮的ElementHandle并发送真实Enter，不用locator等待已经关闭提示的替代按钮。按钮已经不存在或该具体节点已detach表示旧提示消失；超时、页面关闭和其他错误仍抛出，handle始终释放。新提示由原操作的actionability检查重新触发，不等待可能被新事件重新占据的selector消失。Windows保留dismiss按钮触发/click。普通清理不再重复点击同一按钮。专门验证该提示的workflow声明`test.use({ dismissTlsCompatibilityDialogs: false })`，不自动关闭待测弹窗；策略只在测试端，不进入产品。
- Windows宿主guard使用原六字段比较；macOS完整比较network service快照，并额外保存/复核admin trust。该检查只属于Macos宿主操作，不在TLS/gRPC/H2 workflow追加Windows证书读取。
- macOS driver按Playwright项目配置准备真实窗口：常规`macos`使用1600x900，只有body-fill滚轮边界用`macos-scroll-boundary`的1600x800，两个项目不重复运行workflow。先校验Main PID/启动时间并等待System Events看到窗口，再调整和验证内容尺寸。Windows不增加项目或窗口调整；业务workflow不通过产品CSS或额外请求数据制造滚动。
- macOS每代App启动前，通过CoreGraphics只读确认登录完成且桌面未锁定；锁屏时明确要求解锁，不创建测试profile或启动App，避免先自动接管代理后才发现原生窗口不可访问。packaged smoke共用同一前置检查；通过前置检查不代表后续窗口或授权验收已通过。
- macOS Electron stdout/stderr继承profile内0600日志文件，runner退出时保留App仍能写日志，不因断开的pipe产生EPIPE。附加证据前扫描完整日志中的敏感值，只输出有界末尾；保留profile的私有日志不直接作为附件。主动crash确认后立即保存该代metadata/trace/log，不能等同profile的下一代删除日志后再采集。Windows仍使用原Playwright日志通道。
- [settings-workflow.ts](ui/settings-workflow.ts)分别验证Windows AppContainer搜索控件与macOS不支持状态；共同导航顺序和当前section断言不变。
- [file-dialog.ts](ui/file-dialog.ts)只分派原生操作：Windows调用原有UI Automation，macOS按PID/启动时间定位`save-panel / open-panel`，以真实键鼠打开GoTo、粘贴并核对完整路径/文件名后提交。macOS坐标click发给目标process，不发给System Events应用；文件名选区必须包含扩展名，只读直接textFields，避免遍历文件列表阻塞。失败只取消本轮面板，让产品正常退出，不写原生返回值。媒体/正文、Rules/Collection、HAR/Archive/Diagnostics的Save/Open/Cancel已纳入65条真实Green，逐条结果以Handover为准。
- macOS每次发送键鼠前前置并raise所属Open/Save或GoTo面板，确认进程代际与焦点；使用CoreGraphics真实键鼠事件，按键按下/抬起之间留原生处理间隔。仍从原生面板读取并核对路径/文件名，不写AX值或改原生返回结果。
- macOS GoTo读取完整输入路径后，从其原生建议表中精确匹配测试自产文件/目录名，要求唯一命中并真实双击；只查询GoTo的`AXScrollArea → AXTable → AXRow → AXCell → AXList → AXStaticText`，不递归遍历文件浏览区。Save/Open类型取面板AXIdentifier，不能由文件名控件是否已出现暗示。
- GoTo、Save/Open分别通过实际`CloseButton`、`OKButton`、`CancelButton`位置发送鼠标按下/抬起，明确清除修饰键并设置单击/双击计数。避免在关闭GoTo时按Return触发本机SCIM的text-storage越界、使系统Open/Save XPC服务崩溃；不修改输入法、应用语言、系统服务或dialog返回值。此处只改验收操作，不宣称修复了macOS系统服务。
- 运行中传输的原生退出在driver分派：Windows保留原Alt+F4及前台窗口校验，macOS对精确Main进程发送Command+Q。Command+W仅关闭macOS窗口，不能作为App/Main/Core/Worker退出证明。两平台仍验证文件取消清理、宿主恢复和重启不重放。
- `closeGracefully()`在两平台都通过产品Close进入Main guarded shutdown，不激活App或操作系统菜单。macOS测试已超时时跳过最终截图，先尝试Close再核验宿主，记录`trace-unavailable`，不把缺失trace或失败流程算通过；Renderer已不可操作时明确报告关闭失败，由宿主guard保留尚未恢复代理的App/profile，不以菜单退出或强杀冒充成功。正常轮次仍先保存trace再退出。

修改fixture后直接跑受影响的已有真实workflow，现有Windows安全测试可以回归但不能代替Windows原生E2E。不新增测试设施自身的unit/integration；原生授权不可用时记录blocked和恢复结果，不用mock或应急清理冒充Green。

## 协议流量

唯一协议流量库是 [Playground TrafficLab](../../../../playground/server/scenarios/traffic-lab.ts)。
每条需要流量的 workflow 由 `trafficLab` fixture 创建一份实例并统一关闭；以下 fixture 是该实例的协议服务：

| Fixture | 能力 |
| --- | --- |
| `httpTrafficRunner` | HTTP origin、显式代理请求、自定义 status/headers/body、响应挂起与释放、主动取消、origin 观测 |
| `webSocketTrafficRunner` | WebSocket origin、长连接客户端、双向消息、广播、关闭码与真实断开证据 |
| `tlsTrafficRunner` | HTTPS/H2/gRPC/CONNECT 共用的 TLS origin、ALPN、握手次数和应用字节观测；按需创建 |
| `trafficLab` | 运行 Playground 原有场景目录，统一管理全部协议服务 |

测试可以直接使用这些 Node 流量 API，不必启动 Browser。需要验证 Playground 页面或 Browser MCP 时，
使用 `playgroundServer` 和 [Playground UI 驱动](ui/playground-capture-workflow.ts)。
这些 API 只控制外部流量，不操作 Interceptor Store、Preload 或内部业务 API；产品操作仍通过真实 UI。

协议类分工与原始 WebSocket 控制的限制见 [服务端说明](../../../../playground/server/README.md)。
新增 HTTP、HTTPS、HTTP/2、WebSocket 或 gRPC 流量能力放在 Playground，直接通过实际场景或已有真实 E2E 验证，不为测试设施新增单元或集成测试。
不要在本目录重新添加协议 origin/client lab。OpenAI 模拟不属于 Capture 协议场景，独立保留。