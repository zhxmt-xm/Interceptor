# Breakpoints Workflows

本文件定义 Capture 内嵌 Breakpoint 能力的完整 E2E 流程。产品没有独立 Breakpoints workspace：配置入口是 Capture workbar manager，命中与编辑入口是 paused Capture 行及其 Inspector。每条 workflow 独立启动 Electron、独占 profile/trace，并通过真实 Rules breakpoint action、Core queue 和客户端连接验证。

<a id="breakpoints-toggle"></a>
## `breakpoints.toggle`

**状态**：planned
**策略**：privileged UI

### Steps

1. 创建profile/evidence和HTTP origin，启动trace/Electron，等待App/Core/8888/readiness；进入Capture，检查manager badge=0、selection/draft为空。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建含Breakpoint action的规则并Apply。
3. 点击 `capture.breakpoint-manager` 打开manager，确认 `breakpoints.toggle` 初始开启；点击toggle关闭并关闭manager。
4. 通过8888发送匹配请求，确认请求未显示pause icon、pending badge仍为0且客户端正常完成。
5. 再开manager，确认toggle没有被状态刷新反弹；点击toggle重新开启并关闭manager。
6. 再发匹配请求，等待动态 `capture.request-row.<exchangeId>` 显示pause icon且pending badge=1。
7. 点击该Capture行，通过Inspector的Continue释放。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

全局Break on match开关真实同步Core；关闭时Breakpoint action立即continue，开启时请求在Capture原行可见地挂起；manager关闭/重开不改变状态。

<a id="breakpoints-queue-select"></a>
## `breakpoints.queue-select`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和可延迟响应的HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Capture列表、pending badge、selection/draft为空。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建并Apply request breakpoint规则。
3. 测试客户端通过8888发送匹配请求并保持等待。
4. 等待动态 `capture.request-row.<exchangeId>` 出现pause icon、waiting size和pending badge=1。
5. 点击该Capture行，检查Inspector的phase、method、URL和ruleName；产品不显示倒计时。
6. 验证Inspector加载同一snapshot的最终headers、Rule marker与Original/Replacement body状态。
7. 点击Continue unmodified，确认行恢复普通终态并释放客户端。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

真实请求在Core等待；Capture行与Rule/请求关联同一exchange；选择后Inspector展示同一不可变snapshot，且无隐藏独立queue或倒计时UI。

<a id="breakpoints-continue-unmodified"></a>
## `breakpoints.continue-unmodified`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和记录收到header/body的HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Capture无paused行。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建request breakpoint并Apply。
3. 客户端发送带固定header/body的匹配请求；在Capture点击带pause icon的动态row。
4. 不编辑任何字段，点击 `breakpoints.continue-unmodified`。
5. 等待row从queue移除、paused count=0、客户端收到200。
6. 从origin记录确认header/body未变化。
7. 在Capture打开最终Exchange，确认completed且内容为原始值。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Continue unmodified只释放等待，不改字节；pending badge、Core、client与Capture终态一致。

<a id="breakpoints-execute-edited"></a>
## `breakpoints.execute-edited`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和能记录 raw request headers/body 的HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Capture无paused行。
2. 确认冷启动自动进入Recording；若当前尚未Recording，才点击recording toggle并通过readiness Enable完成接管。随后通过Rules UI先创建request Breakpoint rule，再创建priority更晚的request header rewrite，分别启用并Apply。
3. **Header-only**：客户端发送带固定body、`Content-Type`、`Content-Length`和普通header；同一请求还命中一个
	priority 晚于 breakpoint rule 的 header rewrite。选择动态row，先确认暂停快照已包含该 rewrite 的最终值和
	`Rule set` / `Rule appended` marker，
	保持Replacement=Off，通过动态 `breakpoints.header.<headerId>.name/value` 修改普通header与`Content-Type`，
	点击 `breakpoints.execute-edited`。
4. 验证origin收到用户最终headers，body bytes与客户端发送值完全一致；客户端完成，Capture记录实际转发结果，
	并只为用户显式编辑的字段显示绑定 breakpoint rule 的 replace / set / remove effect。
5. **Body-only**：客户端再次发送匹配请求；不编辑任何header，选择Text replacement并通过 `breakpoints.body` 输入新正文，点击Execute edited。
6. 验证origin收到新正文；原本存在且未编辑的`Content-Length`按最终content bytes更新，原本缺失的字段不新增，
	其余headers保持，且body-only提交不制造任何header effect。
7. **Header+Body**：客户端第三次发送匹配请求；选择Text replacement，同时把`Content-Encoding`改成`gzip`且不编辑原`Content-Length`，点击Execute edited。
8. 验证origin收到`Content-Encoding: gzip`、可gunzip为用户新正文，继承的`Content-Length`更新为gzip后字节长度；Capture反映实际转发headers/body。
9. 为每一段保存origin observation、客户端结果、最终Capture状态与截图/trace；进入Proxy点击Restore，确认non-owned并Close。
10. 验证Main/Core退出、8888释放、系统代理恢复；关闭origin并删除profile。

### 预期效果

Breakpoint 快照先包含所有普通 Rule 的最终改写，用户草稿不会再被后续 Rule 覆盖。Header-only不改变body；
body-only按继承headers构造新body；header+body按用户最终headers构造新body。三段都经过真实UI/Main/Core/
Mockttp/origin，Core state=edited，Capture反映实际转发结果。

### TDD证据要求

- 修复前提交运行同一workflow：暂停快照缺少priority更晚的rewrite header/marker；Forward edited后Capture缺少绑定breakpoint rule的effect。
- 当前提交运行同一workflow：最终state、暂停marker、origin wire与Capture effect全部Green，并具备代理恢复、进程销毁和8888释放证据。selector、UAC、构建或fixture失败不算Red。

### TDD证据（final state / header effect）

- Retrospective Red：最终workflow源码在`89d8dda`仅回植后续公开automation ID、Rules字段探针与driver helper后，暂停快照中`x-e2e-before-breakpoint`为`null`；Forward edited后`capture.rule-effect.<breakpointRuleId>.set.x-edit-stage`不存在。
- Green：当前同一workflow`1/1`通过，暂停快照包含`rule-value`与`data-effect=set`，Capture显示绑定breakpoint ruleId的`set x-edit-stage` marker，三段真实origin断言同时通过；owning unit `28/28` Green。
- 销毁：Red/Green Main/Core PID分别为`31404/3812`与`46424/29380`，两边`gracefulDestroyVerified=true`，8888释放且系统代理恢复。
- 本节只验收final Rule state与header effect；本workflow整体仍因HTTP framing矩阵未Green保持`planned`。

### Automation Contract

该 workflow 只允许使用下列公共 automation ID，不以翻译文案、`aria-label`、CSS class 或 `window.interceptor` 代替：

| 交互 | Automation ID |
| --- | --- |
| 开始 Recording / readiness | `capture.recording.toggle`、`capture.readiness.enable` |
| 进入 Rules / 新建规则 | `shell.workspace.rules`、`rules.create` |
| 规则名 | `rules.editor.name` |
| Host matcher 值 | `rules.matcher.<ruleId>.0.value` |
| Header action name/value | `rules.action.<ruleId>.0.name`、`rules.action.<ruleId>.0.value` |
| 删除默认 action | `rules.action.<ruleId>.0.remove` |
| 添加 Breakpoint action | `rules.add-action`、`rules.action.breakpoint` |
| Apply / enable | `rules.apply`、`rules.toggle.<ruleId>` |
| 返回 Capture / 选择 pending exchange | `shell.workspace.capture`、`capture.request-row.<exchangeId>` |
| 打开 manager / 切换总开关 | `capture.breakpoint-manager`、`breakpoints.toggle` |
| 编辑 header | `breakpoints.header.<headerId>.name`、`breakpoints.header.<headerId>.value` |
| 暂停/落库 effect | `breakpoints.header.<headerId>.effect`、`capture.rule-effect.<ruleId>.<effect>.<headerName>` |
| Replacement 模式 | `breakpoints.replacement.off`、`breakpoints.replacement.text`、`breakpoints.replacement.file` |
| 编辑/提交正文 | `breakpoints.body`、`breakpoints.execute-edited` |
| 恢复系统代理 | `settings.proxy.restore` |

动态 ID 中的 `ruleId`、`exchangeId` 和 `headerId` 只能从对应动态行/控件已经公开的 automation ID 中提取。

<a id="breakpoints-drop"></a>
## `breakpoints.drop`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP/WS origin，启动trace/Electron，等待App/Core/8888/readiness；检查Capture无paused行。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建Breakpoint rule并Apply。
3. 客户端发匹配请求并等待；在Capture选择带pause icon的动态row。
4. 点击 `breakpoints.drop`。
5. 确认row移除、paused count=0。
6. 确认客户端连接按phase失败/关闭，origin未收到被drop的数据。
7. 在Capture检查对应终态/失败事实，不出现伪成功response。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origins并删除profile。

### 预期效果

Drop真实中止目标数据面；请求不继续转发；pending badge、client和Capture均反映dropped/closed事实。

<a id="breakpoints-websocket-close"></a>
## `breakpoints.websocket-close`

**状态**：planned
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录并启动仓库本地production bundle；开启BrowserContext trace，等待`app.root`、带真实PID的Core状态和`127.0.0.1:8888`可连接。
2. Fresh profile首次出现Proxy readiness时点击`capture.readiness.cancel`；点击`capture.recording.toggle`，在再次出现的readiness点击`capture.readiness.enable`并完成Windows授权，等待Recording的`aria-pressed=true`。
3. 测试lab在random loopback port启动真实`WebSocketServer`。Raw客户端连接8888，发送absolute-form `GET ws://127.0.0.1:<originPort>/e2e/websocket-close`、Upgrade headers与固定Sec-WebSocket-Key；必须收到真实`HTTP/1.1 101`才算连接建立。
4. 等待包含`/e2e/websocket-close`的动态`capture.request-row.<exchangeId>`并点击；点击`capture.inspector.tab.messages`。点击`capture.websocket.breakpoint.toggle`打开当前连接的setup。
5. 断言`capture.websocket.breakpoint.frame.message`初始`aria-pressed=true`；点击它取消，再点击`capture.websocket.breakpoint.frame.close`并断言选中。保持默认Both directions与`capture.websocket.breakpoint.timeout=0`，点击`capture.websocket.breakpoint.enable`。
6. Raw客户端构造FIN+opcode8、mask bit、随机4字节mask和network-order code=1000的masked close frame并写入8888连接。等待`breakpoints.close-code`可见且value=1000，证明真实close帧已在Capture原行暂停。
7. 只把`breakpoints.close-code`填为1001，不切换Replacement mode；点击`breakpoints.execute-edited`。轮询真实origin的`close`事件并要求code=1001。
8. 附加`websocket-origin-observation.json`、最终截图、trace、Main/Renderer日志和metadata。fixture销毁raw client与server-side sockets，进入Settings→Proxy恢复owned配置，再正常Close并验证Main/Core PID退出、8888可重新bind和profile删除。

### 预期效果

closeCode与body是正交编辑；没有body replacement时仍必须转发用户编辑后的close code，同时保留原始reason bytes。

### TDD证据要求

- 修复前提交运行同一workflow：origin收到1000而非1001。
- 当前提交运行同一workflow：origin收到1001，且完整销毁/恢复证据Green。fixture或selector失败不算Red。

<a id="breakpoints-resize"></a>
## `breakpoints.resize`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin，启动trace/Electron，等待App/Core/8888/readiness；检查Capture列表/Inspector初始splitter布局。
2. 点击readiness Enable并完成授权，等待Recording；创建Breakpoint rule并制造一条pending request；点击paused Capture行。
3. 拖动 `capture.inspector.splitter` 到Inspector最小宽度。
4. 检查列表行metadata、Inspector headers/body和footer actions可见且无重叠。
5. 拖到中间，再拖到列表最小宽度。
6. 编辑一项body但不提交，确认拖动不丢草稿/selection。
7. Continue unmodified释放请求。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Capture列表和Inspector遵守最小宽度；拖动不丢pending选择或草稿；所有操作按钮在边界宽度可用。
