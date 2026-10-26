# Application 与 Shell Workflows

## 原流程与可选步骤截图

工作区和窗口只由原流程产生截图，不再保留独立Guidebook录制脚本。

- `application/core-restart.workflow.ts`继续验证Core代际、临时Capture与系统代理恢复，不把普通导航混入故障恢复。

- [Guidebook在线阅读workflow](../workflows/application/guidebook-online.workflow.ts)对应[`shell.guidebook.online`](#shell-guidebook-online)，验证远程frame、搜索、图片、主题、刷新与浏览器出口；[独立i18n workflow](../workflows/application/guidebook-i18n.workflow.ts)对应[`shell.guidebook.i18n`](#shell-guidebook-i18n)，通过真实Language菜单验证并恢复初始语言。它们验证App内Guidebook功能，不是制作其他功能教程的专用脚本。

- `settings/navigation.workflow.ts`覆盖工作区往返、Settings末次分组、侧栏、四主题与原主题恢复、只读语言菜单和真实Maximize/Restore/Minimize。最小化时不截桌面，只对恢复后的同一App窗口取景；原生窗口读取/恢复归平台driver。

- `agent/panel-navigation-persistence.workflow.ts`保留空态Configure深链、面板跨工作区和关闭；Composer保存及重启归Composer原流程，偏好持久化归Settings原流程。

- 首页已有浅深原图保持不变。新的截图来自所属功能的原workflow，不额外维护一个首页专用业务脚本。

命令、输出清单和显式导入边界见[套件说明](../README.md#trace-与证据)。已有公开PNG及历史验收记录保持原来源，新的运行不会自动替换它们；本节不把未经执行的平台或分支记为通过。

本文件定义 Application 生命周期和共享 Shell 的完整 E2E 步骤。每条 workflow 独立启动 Electron、独占 profile/trace，并只检查与本流程相关的起始状态。

<a id="application-startup-ready"></a>
## `application.startup.ready`

**策略**：shared

### Steps

1. 创建独立空profile、evidence目录；只读确认宿主无上次测试遗留的Interceptor Proxy ownership或测试CA。
2. 启动trace并用 `_electron.launch()` 启动新的本地production bundle。
3. 等待 `app.root`、`app.main`、`app.statusbar` 和 `shell.navigation` 可见，确认URL=`interceptor://app/index.html`。
4. 只检查启动相关默认态：active workspace=Capture、Sidebar expanded、窗口1600x900且未最大化/最小化、Core Running并显示真实PID、listener Listening `127.0.0.1:8888`。
5. 检查Proxy状态：正常环境下产品冷启动已自动接管系统代理并进入Recording，断言 `capture.recording.toggle` 的`aria-pressed=true`且状态栏显示系统代理已开启；若环境未能接管，则readiness弹窗出现，点击 `capture.readiness.cancel`并确认系统代理未被修改。
6. 确认首窗、Header、Main、Statusbar可操作且无错误overlay。
7. 保存final screenshot、trace、Main/Renderer日志和PID/端口metadata。
8. 点击 `shell.window.close`。
9. 验证Main、Renderer、Core、Worker全退且8888释放。
10. 删除profile；任何强制kill都使workflow失败。

### 预期效果

新的未打包production App可以从空profile完整启动；Shell、Core和listener ready；系统代理按产品设计在冷启动自动接管并进入Recording，无法接管时由readiness诚实提示且Cancel不修改系统设置；关闭后无进程或端口残留。

<a id="application-lifecycle-core-restart"></a>
## `application.lifecycle.core-restart`

**策略**：os-side-effect

macOS续验使用相同真实请求、Core故障和退出恢复断言；读取完整SystemConfiguration快照及用户级共享journal。Windows继续读取WinINet及LOCALAPPDATA共享journal，原命令和路径不变。忙时Quit拒绝按下述共同操作契约验证，两端均须保存各自证据，不沿用历史Windows passed记录。

### Steps

1. 创建独立profile/evidence和HTTP origin；启动trace/Electron，等待App root、Core Running、8888和readiness modal。
2. 点击 `capture.readiness.enable`，完成App发起的原生授权；等待Recording，并在Settings Proxy确认Owned by Interceptor。
3. 返回Capture，记录UI显示的Core A PID和三字段journal；通过8888发送真实请求并确认row与Inspector可用。
4. 测试环境按PID+启动时间精确终止Core A，不调用产品重启API、不终止Main；等待旧PID退出。
5. 等待UI进入Restarting再回Running，确认Core B PID不同、8888重新Listening且旧临时Capture已按代际清空。
6. 确认Main已把系统代理从journal的`owned`恢复为`original`并清除journal；新Core ready后，Renderer代际bootstrap自动重新Enable，确认新journal的`original`仍等于workflow启动快照，没有把8888重记为恢复目标。
7. 通过8888发送第二条真实请求，确认新row、Inspector和Rules/Composer/Capture导航可用，证明新Core、RPC与Renderer恢复。
8. 记录Core B的PID+启动时间，精确终止Core B后立即点击真实`shell.window.close`。若平台已空闲则正常退出；若恢复或Core同步仍忙，必须显示公共`platform.operation.conflict`和真实operation，保存提示截图。等待新Core/listener/Recording恢复及提示消失，确认App未因旧请求自动退出，再发起一次真实Quit。不得增加产品排队、测试自动循环点击或放宽退出恢复断言。
9. 验证Main/Renderer/Core/Worker没有任何代际存活、8888释放、journal不存在且完整WinINet等于workflow启动快照；保存两代PID、请求、代理和销毁evidence。
10. 关闭origin并删除profile；任何强制清理、残留进程、journal或系统代理差异都使workflow失败。

### 预期效果

Main能检测Core异常退出并创建新代际；Renderer/RPC/listener恢复；旧临时Capture不泄漏；系统代理在Core故障后先安全交回，在新Core ready后由Renderer代际bootstrap自动重新接管；Core故障后立即正常退出时不留下任何进程代际或系统代理副作用。

<a id="application-lifecycle-graceful-close"></a>
## `application.lifecycle.graceful-close`

**策略**：shared

### Steps

1. 创建空profile/evidence，启动trace和新Electron。
2. 等待App root、Core Running、8888；检查readiness=System Proxy off和UI Paused。
3. 点击 `capture.readiness.cancel`，确认未修改系统代理。
4. 通过 `shell.workspace.rules` 和 `shell.workspace.capture` 确认App正常可操作。
5. 记录Main PID、Core PID和listener port。
6. 保存关闭前final screenshot并封存trace。
7. 点击 `shell.window.close`，不得直接调用quit API。
8. 等待Electron close event，验证Main/Core PID退出、Renderer/Worker不存在、8888可重新bind。
9. 写入`gracefulDestroyVerified=true` metadata并附加日志。
10. 删除profile；finally强制kill时测试必须失败。

### 预期效果

产品Close触发真实guarded shutdown；所有进程和listener释放；证据完整；测试清理不会掩盖destroy缺陷。

<a id="application-lifecycle-profile-isolation"></a>
## `application.lifecycle.profile-isolation`

**策略**：os-side-effect

### Steps

1. 创建Profile A、B两个独立目录、各自evidence和HTTP origin；确认宿主无遗留ownership/测试CA。
2. 启动A的trace/Electron，等待App root、Core Running和8888；记录首次启动语言作为基线，只检查本流程相关默认态：Light、本轮请求尚不存在、Rules无测试rule。
3. 从Theme UI选择dark、从Language UI选择与基线不同的语言（默认`ja`，基线为`ja`时选`de`），分别断言`html[data-theme]`和`html[lang]`。
4. 通过 `startRecording()` 等到真实Recording（产品冷启动已自动接管时直接复用）；通过8888发送一条唯一路径的请求并确认row出现。
5. 进入Rules新建规则，填写唯一名称、host与request header，启用并Apply；确认 `rules.status.state` 为`applied`。
6. 记录A的`userData`和系统代理journal；在Proxy点击 `settings.proxy.restore`，确认restore按钮消失、journal不存在且系统代理等于workflow启动快照；保存A evidence后点击Close，验证A销毁/8888释放，但保留Profile A。
7. 启动Profile B的新trace/Electron（不同`userData`），等待App root、Core Running和8888。
8. 检查B为Light、`html[lang]`等于第2步基线（不是`ja`）、不含A的请求路径、Rules为0行；确认B的`userData`与A不同。产品冷启动会自动接管系统代理，B仍可能捕获宿主自身流量，因此不要求列表为空。
9. 直接读取两个profile目录：A的profile（含Core `workspace.sqlite`）必须包含本轮唯一规则标记，B的整个profile目录不得包含同一标记。
10. 保存B evidence并点击Close；验证B进程/8888销毁、系统代理journal被清除，关闭origin并删除A/B profiles。

### 预期效果

Theme、Language、Capture和RuleSet只出现在写入它们的profile；B既不继承A的UI偏好，也不含A的Capture或RuleSet；A关闭后系统代理回到原始配置，两次运行各自完整销毁。

<a id="shell-navigation-workspaces"></a>
## `shell.navigation.workspaces`

**策略**：shared

六个顶层view是 capture、rules、composer、diagnostics、guidebook、settings；Sidebar的workspace组只放前四项，Guidebook与Settings是底部独立入口。Breakpoint是Capture列表栏（`CaptureListbar`）里的manager浮层，不是view，也不产生workspace状态。

Shell用三个语言无关标记表达当前view：`app.root`的`data-view`、`app.header.title`的`data-view`、`app.statusbar`的`data-view`。工作流不读取Header文案、`aria-label`或CSS class判断当前view。

### Steps

1. 创建空profile/evidence，启动trace/Electron并等待App root、Core和listener；driver通过真实UI收起首次readiness弹窗，确认System Proxy未被修改。
2. 检查默认态：`app.root[data-view=capture]`、`app.header.title[data-view=capture]`、`app.statusbar[data-view=capture]`，且 `shell.workspace.capture` 是唯一带 `aria-current=page` 的Sidebar入口。
3. 通过 `capture.recording.toggle` 暂停Recording并确认 `aria-pressed=false`，记录Capture当前行数作为基线；导航期间不得新增Exchange。
4. 依次点击 `shell.workspace.rules`、`shell.workspace.composer`、`shell.workspace.diagnostics`；每步断言同一view的三处标记一致，且目标入口成为唯一current page。
5. 点击 `shell.workspace.guidebook`：断言三个标记为 `guidebook`、`guidebook.root` 可见、`guidebook.status` 位于Statusbar。允许 `guidebook.root` 处于loading或error，离开时不等待在线frame成功；App退出也不依赖它是否加载完成（Main服务停止后直接结束进程）。教程内容、搜索与图片由 `shell.guidebook.online` 和 `shell.guidebook.i18n` 独立验收。
6. 点击 `shell.workspace.settings`：断言三个标记为 `settings`、`settings.section.certificates` 可见；Settings内部的十个section由 `settings.navigation` 独立验收。
7. 每次切换后检查 `app.main` 内目标view的公共控件可见，且页面根节点没有横向或纵向溢出。
8. 点击 `shell.workspace.capture` 返回：三个标记回到 `capture`，Capture列表行数与暂停前基线一致，未因导航产生Exchange。
9. 点击 `capture.breakpoint-manager` 打开浮层，断言 `breakpoints.toggle` 可见、三个view标记仍为 `capture`，按Escape关闭后 `aria-expanded=false`。
10. 保存各view的标记evidence并点击 `shell.window.close`。
11. 验证进程/8888销毁；删除profile。

### 预期效果

六个顶层view通过正式入口切换；Sidebar、Header、Main、Statusbar使用同一view标记；Guidebook的导航验收不依赖外网在线；导航不修改无关业务状态。

### 验收要求

- evidence逐项记录view、Sidebar `aria-current`、`app.header.title[data-view]`与`app.statusbar[data-view]`，不记录翻译文案。
- Guidebook允许loading/error，只要 `guidebook.root` 与 `guidebook.status` 存在即可通过本契约。
- 六个入口之外不得出现新的workspace入口；Breakpoint manager只作为Capture浮层出现。

<a id="shell-sidebar-collapse"></a>
## `shell.sidebar.collapse`

**策略**：shared

### Steps

1. 创建空profile/evidence，启动trace/Electron并等待App/Core/listener。
2. 只检查Sidebar相关默认态：expanded、Capture active、workspace按钮可用；点击readiness Cancel。
3. 点击 `shell.sidebar.toggle`。
4. 确认collapsed=true、品牌/文本收起、workspace图标仍有automation/accessibility ID。
5. 在折叠态点击 `shell.workspace.rules`，确认Rules打开。
6. 再次点击toggle，确认expanded恢复且Rules active保持。
7. 检查布局无页面级溢出，窗口状态未变化。
8. 保存evidence并点击Close。
9. 验证进程/8888销毁。
10. 删除profile。

### 预期效果

折叠只影响Sidebar呈现，不破坏导航、可访问性或active view；展开恢复稳定。

<a id="shell-appearance-theme"></a>
## `shell.appearance.theme`

**策略**：shared

### Steps

1. 创建空profile和两段evidence，启动第一份trace/Electron。
2. 等待App/Core/listener；只检查主题相关默认态：theme=Light、窗口可见、当前Capture布局正常；点击readiness Cancel。
3. 从Theme UI依次选择warm、light、ember、dark，每次检查`html[data-theme]`和可见token。
4. 检查每套主题下当前页面无文本/控件重叠。
5. 保存第一段evidence并点击Close，验证第一份进程/8888销毁，但保留profile。
6. 使用同一profile启动第二份trace/Electron。
7. 确认dark主题自动恢复；只检查主题切换未改变窗口和当前workspace。
8. 点击readiness Cancel，保存第二段evidence并Close。
9. 验证第二份销毁/8888释放。
10. 删除profile。

### 预期效果

四主题通过真实UI切换并持久化；只验证主题与布局相关状态，不重复检查Rules、Composer、Privacy等无关默认值。

<a id="shell-appearance-language"></a>
## `shell.appearance.language`

**策略**：shared

### Steps

1. 创建空profile和两段evidence，启动第一份trace/Electron。
2. 等待App root、Core Running和8888；记录首次启动语言作为基线（首次运行按系统语言匹配，必属15种之一）；若 `app.root` 的`data-collapsed=true`，点击 `shell.sidebar.toggle` 展开Sidebar。
3. 从Language UI依次选择15种语言，每次断言`html[lang]`、`app.header.title`文案、Sidebar分组与六个入口文案、Language/Theme控件文案、`capture.keywordFilter`占位与Recording文案。
4. 每种语言断言`documentElement`无横向/纵向溢出，且Header、Sidebar、Language/Theme控件与Recording按钮的可见文本没有被裁切（`scrollWidth <= clientWidth`）。
5. 保留最后语言；保存第一段evidence并点击Close，验证销毁但保留profile。
6. 使用同一profile启动第二份trace/Electron。
7. 断言 `html[lang]`、Header与Sidebar代表文案恢复为最后语言。
8. 保存第二段evidence并点击Close，验证第二份销毁/8888释放。
9. 删除profile。

### 预期效果

15种语言通过真实Language菜单切换，完整语言矩阵下外壳与列表栏文案正确、无页面溢出或文字裁切；保存的语言跨重启恢复。Ant locale与Main原生对话框语言不在本workflow断言：产品界面没有Ant locale文案，Main原生对话框标题固定英文，语言ID的对齐由 `i18n.test.ts` 的unit契约约束。

<a id="shell-guidebook-online"></a>
## `shell.guidebook.online`

**策略**：shared

### Steps

1. 创建空 profile/evidence，启动 trace 和真实 Electron；等待 App root、Core Running 与 8888 listener。
2. 点击 readiness Cancel，确认未修改系统代理；从 Sidebar 点击 `shell.workspace.guidebook`。
3. 检查 Guidebook toolbar 和固定官方地址；按初始App语言等待sandboxed iframe Ready，`zh-CN`使用`https://www.interceptor.cn/guide?embed=desktop`，其余语言使用`https://www.interceptor.cn/en/guide?embed=desktop`。确认网页Header/Footer不出现，概览目录和正文可见；进入具体章节后确认本章导航可见。
4. 点击 App toolbar Search，确认 iframe 内既有 Guidebook 搜索弹窗打开；输入测试自产查询，选择结果并确认正文导航仍保留 `embed=desktop`。
5. 点击真实教程图片并关闭官网大图预览，确认 App 外壳、Sidebar、Header 与 Statusbar 始终保留。
6. 保持初始App语言，通过真实 Theme UI 切换当前主题，确认 iframe 使用相同主题，再恢复初始主题；语言同步由下述独立i18n workflow验证。
7. 点击 Refresh，确认旧iframe断开、新frame重新进入Loading后恢复Ready，URL仍是当前官方章节；点击`guidebook.open-browser`，确认不新增Electron页面、不出现错误提示且Renderer无未处理错误。Main调用操作系统的固定URL另须原生只读证据：Windows将实际浏览器启动命令的父PID、创建时间与本轮Main PID、UI点击trace对应；记录固定官方URL，不读取其他浏览器历史。其他平台使用对应原生观察，不能用Electron页面数量代替。
8. 通过BrowserContext网络环境设置离线，确认`guidebook.root[data-state=error]`、错误区域与Retry可见、Search禁用。用finally恢复网络，确认仍需用户Retry；点击`guidebook.retry`，核对旧iframe断开、新frame Ready、当前章节URL与初始主题/语言恢复。
9. 保存trace、final screenshot、Main/Renderer日志及frame URL、离线与Retry evidence。
10. 点击 `shell.window.close`；验证 Main、Renderer、Core、Worker 全退且 8888 释放。
11. 删除profile；Retry后网络仍不可用、远程页面结构不匹配或强制kill均使workflow失败。

### 预期效果

Desktop 通过安全的在线 frame 提供完整 Guidebook 阅读、搜索、图片预览与主题/语言同步；远程页面不获得 Preload 或业务 IPC；外部浏览器只打开固定官网 URL；关闭后无进程、端口或系统设置残留。

<a id="shell-guidebook-i18n"></a>
## `shell.guidebook.i18n`

**策略**：shared

### Steps

1. 创建独立空profile/evidence，启动trace与真实Electron，等待App root、Core Running和8888 listener；点击readiness Cancel，确认系统设置未修改。
2. 读取初始App语言与主题，从Sidebar进入Guidebook；等待固定官网frame Ready，核对`zh-CN`映射`/guide`、其余语言映射`/en/guide`，保留`embed=desktop`。
3. 通过真实Language菜单切换到另一种教程语言：初始为`zh-CN`时选择`en`，其他初始语言选择`zh-CN`。
4. 等待App的`html[lang]`更新和新的Guidebook frame Ready；核对官网origin、入口路径、正文`lang`和主题同步，远程frame无Preload。
5. 通过同一Language菜单恢复初始App语言；等待原locale入口与正文`lang`恢复，主题始终不变。
6. 保存语言、frame URL、trace、final screenshot及Main/Renderer日志和metadata；点击`shell.window.close`，验证Main/Renderer/Core/Worker全部退出、8888释放和宿主基线恢复，删除profile。

### 预期效果

App语言只在本独立i18n workflow中切换，官网入口与正文locale同步并恢复；普通Guidebook workflow保持初始语言，不以Store或localStorage写入代替UI操作。

<a id="shell-window-controls"></a>
## `shell.window.controls`

**策略**：shared

### Steps

1. 创建空profile/evidence，启动trace/Electron并等待App/Core/listener。
2. 只检查窗口相关默认态：1600x900、非maximized/minimized、Header window controls可用；点击readiness Cancel。
3. 点击 `shell.window.maximize-restore`，只读确认maximized=true。
4. 再次点击并确认恢复1600x900、maximized=false。
5. 点击 `shell.window.minimize`，只读确认minimized=true。
6. 测试侧只恢复/show/focus窗口，不修改业务状态。
7. 确认Renderer可交互、Core仍Running、窗口尺寸/状态准确。
8. 保存evidence并点击Close。
9. 验证进程/8888销毁。
10. 删除profile。

### 预期效果

自绘窗口控制通过真实IPC工作；窗口状态准确；操作不破坏Renderer/Core；不检查无关feature默认态。
