# Application 与 Shell Workflows

本文件定义 Application 生命周期和共享 Shell 的完整 E2E 步骤。每条 workflow 独立启动 Electron、独占 profile/trace，并只检查与本流程相关的起始状态。

<a id="application-startup-ready"></a>
## `application.startup.ready`

**状态**：planned
**策略**：shared

### Steps

1. 创建独立空profile、evidence目录；只读确认宿主无上次测试遗留的Interceptor Proxy ownership或测试CA。
2. 启动trace并用 `_electron.launch()` 启动新的本地production bundle。
3. 等待 `app.root`、`app.main`、`app.statusbar` 和 `shell.navigation` 可见，确认URL=`interceptor://app/index.html`。
4. 只检查启动相关默认态：active workspace=Capture、Sidebar expanded、窗口1280x800且未最大化/最小化、Core Running并显示真实PID、listener Listening `127.0.0.1:8888`。
5. 检查Proxy readiness显示System Proxy off，UI Paused/Not recording；点击 `capture.readiness.cancel`，确认系统代理未被修改。
6. 确认首窗、Header、Main、Statusbar可操作且无错误overlay。
7. 保存final screenshot、trace、Main/Renderer日志和PID/端口metadata。
8. 点击 `shell.window.close`。
9. 验证Main、Renderer、Core、Worker全退且8888释放。
10. 删除profile；任何强制kill都使workflow失败。

### 预期效果

新的未打包production App可以从空profile完整启动；Shell、Core和listener ready；初始readiness诚实显示未接管系统代理；关闭后无进程或端口残留。

<a id="application-lifecycle-core-restart"></a>
## `application.lifecycle.core-restart`

**状态**：planned
**策略**：os-side-effect

### Steps

1. 创建独立profile/evidence和HTTP origin；启动trace/Electron，等待App root、Core Running、8888和readiness modal。
2. 点击 `capture.readiness.enable`，完成App发起的原生授权；等待Recording，并在Settings Proxy确认Owned by Interceptor。
3. 返回Capture，记录UI显示的旧Core PID；发送一条真实请求并确认row出现。
4. 测试进程只做故障注入结束旧Core PID，不调用重启API。
5. 等待UI进入Unresponsive/Restarting再回Running；确认新PID不同、旧PID退出、listener重新Listening。
6. 确认新Core的临时Capture为空；若guarded recovery已恢复system proxy，则从readiness UI再次Enable。
7. 通过8888发送新请求，确认row和Inspector详情可用；切换Rules/Composer/Capture确认Shell/RPC恢复。
8. 进入Settings Proxy点击 `settings.proxy.restore`，确认非owned和Paused；保存evidence。
9. 点击 `shell.window.close`，验证Main/Renderer/新Core/Worker全退且8888释放。
10. 关闭origin并删除profile；残留ownership/journal使workflow失败。

### 预期效果

Main能检测Core异常退出并创建新代际；Renderer/RPC/listener恢复；旧临时Capture不泄漏；系统代理guarded recovery与最终Restore正确。

<a id="application-lifecycle-graceful-close"></a>
## `application.lifecycle.graceful-close`

**状态**：planned
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

**状态**：planned
**策略**：os-side-effect

### Steps

1. 创建Profile A、B两个独立目录、各自evidence和HTTP origin；确认宿主无遗留ownership/测试CA。
2. 启动A的trace/Electron，等待Core/8888；只检查本流程相关默认态：Light、English、Capture空、Rules无测试rule、Proxy未owned。
3. 从Theme/Language UI选择非默认主题和语言。
4. 点击 `capture.readiness.enable`并完成授权，等待Recording；发送真实请求形成Capture；进入Rules创建并Apply唯一测试rule。
5. 进入Proxy点击 `settings.proxy.restore`；保存A evidence，点击Close并验证A销毁/8888释放，但保留Profile A。
6. 启动Profile B的新trace/Electron，等待Core/8888。
7. 检查B仍为默认主题/语言，Capture不含A请求，Rules不含A规则，Proxy未owned。
8. 点击readiness Cancel；保存B evidence并点击Close。
9. 验证B进程/8888销毁，检查A/B无交叉文件写入。
10. 关闭origin并删除A/B profiles。

### 预期效果

只有本workflow实际写入的主题、语言、Capture和RuleSet用于隔离对比；A状态不进入B；两次App运行独立销毁并恢复系统代理。

<a id="shell-navigation-workspaces"></a>
## `shell.navigation.workspaces`

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile/evidence，启动trace/Electron并等待App root、Core和listener。
2. 检查Shell相关默认态：Capture active、Sidebar expanded、Header/Main/Statusbar一致；点击readiness Cancel。
3. 依次点击 `shell.workspace.rules`、`shell.workspace.composer`、`shell.workspace.breakpoints`。
4. 继续点击 `shell.workspace.diagnostics`、`shell.workspace.settings`，每次确认Header/Main/Statusbar属于同一view。
5. 在Settings访问两个section后点击 `shell.workspace.capture` 返回。
6. 确认active navigation和Capture初始空列表/Inspector状态未被导航改变。
7. 检查各workspace无错误overlay或页面级溢出。
8. 保存evidence并点击Close。
9. 验证进程/8888销毁。
10. 删除profile。

### 预期效果

六个workspace通过正式导航切换；Shell三层上下文一致；导航不会修改无关业务状态。

<a id="shell-sidebar-collapse"></a>
## `shell.sidebar.collapse`

**状态**：planned
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

**状态**：planned
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

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile和两段evidence，启动第一份trace/Electron。
2. 等待App/Core/listener；只检查语言相关默认态：English、`html lang=en`、当前Shell文案；点击readiness Cancel。
3. 从Language UI依次选择15种语言，每次检查`html[lang]`、Header、Sidebar、Workbar和当前modal。
4. 每种语言检查页面无溢出，最长译文不遮挡交互控件；保留最后语言。
5. 保存第一段evidence并Close，验证销毁但保留profile。
6. 使用同一profile启动第二份trace/Electron。
7. 确认最后语言、Ant locale和Main dialog language intent恢复。
8. 点击readiness Cancel，保存第二段evidence并Close。
9. 验证第二份销毁/8888释放。
10. 删除profile。

### 预期效果

15种语言从真实UI切换并持久化；Renderer/Ant/Main语言意图同步；不重复检查与语言无关的业务数据。

<a id="shell-window-controls"></a>
## `shell.window.controls`

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile/evidence，启动trace/Electron并等待App/Core/listener。
2. 只检查窗口相关默认态：1280x800、非maximized/minimized、Header window controls可用；点击readiness Cancel。
3. 点击 `shell.window.maximize-restore`，只读确认maximized=true。
4. 再次点击并确认恢复1280x800、maximized=false。
5. 点击 `shell.window.minimize`，只读确认minimized=true。
6. 测试侧只恢复/show/focus窗口，不修改业务状态。
7. 确认Renderer可交互、Core仍Running、窗口尺寸/状态准确。
8. 保存evidence并点击Close。
9. 验证进程/8888销毁。
10. 删除profile。

### 预期效果

自绘窗口控制通过真实IPC工作；窗口状态准确；操作不破坏Renderer/Core；不检查无关feature默认态。
