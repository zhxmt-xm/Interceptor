# Breakpoints Workflows

本文件定义 Capture 内嵌 Breakpoint 能力的完整 E2E 流程。产品没有独立 Breakpoints workspace：配置入口是 Capture workbar manager，命中与编辑入口是 paused Capture 行及其 Inspector。每条 workflow 独立启动 Electron、独占 profile/trace，并通过真实 Rules breakpoint action、Core queue 和客户端连接验证。

<a id="breakpoints-tools-batch"></a>
## `breakpoints.tools.batch`

**状态**：passed
**策略**：shared；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，通过Settings配置本地Provider；Ask Chat正式discovery必须披露三条批量Tool。
	通过Rules UI创建并Apply两条不同匹配条件的request breakpoint Rule，通过真实客户端产生各自的HTTP pending。
2. 通过产品UI先为真实WebSocket连接A启用message断点并挂起自产帧，再切到连接B启用并挂起自产帧。
	保留原有单一活动配置，旧pending继续等待；从公开DOM或正式查询取得Rule、queue与pending身份，
	不写storage或直接构造Core队列。
3. Ask请求Continue queue并Deny，确认所有等待项和origin计数不变；Allow Continue rule只释放目标Rule成员，
	原URL/body到达origin，其他Rule和两条WebSocket队列不变，返回实际resolvedCount。Transcript使用本地化
	操作与数量摘要，公开`data-summary-kind`/`data-resolved-count`，不依赖翻译文案或原始JSON判断成功。
4. Auto Drop HTTP queue只丢弃其剩余HTTP成员；分别Continue一条WebSocket queue与Drop另一条，验证帧转发及
	连接隔离、目标数量和原始内容，不使用Renderer未提交编辑。清空后重复命令返回0，不影响其他队列。
5. 通过Settings关闭Agent三项权限，旧Chat均unknown_tool且不解队。使用产品UI建立MCP Client，验证独立
	Ask/Auto审批、三条实际命令及相同作用范围；撤销MCP权限后旧连接不能再发现或调用三项。
6. 正常关闭并以同profile重启，权限保持、Model/origin零重放；关闭所有客户端，保存脱敏trace/evidence，
	验证两代Main/Core/Worker销毁、8888释放及完整WinINet/journal恢复后删除profile。

### 预期与证据

Red必须发生于三条Tool缺失或正式业务效果缺口，不能来自selector、网络fixture或环境失败。空目标/客户端中止
返回0是产品正式语义，不要求虚构stale错误。业务证据只保存目标身份、计数、内容哈希与协议结论；审批和Model
结果不包含敏感URL/Header/正文。unit/integration与同一真实workflow分别按Red→Green闭环，不能用既有
UI批量命令workflow替代本组Agent/MCP调用。

2026-09-06：executor23项因三条Tool缺失Red，既有Core队列基线17/17；同一真实workflow在discovery缺失
三项而Red，Main/Core `26832/37224`正常销毁。接入后23/23 Green；摘要unit随后从`value`精确Red，
真实页面也在`data-summary-kind=value`取得Red，再实现本地化状态/数量摘要后28/28 Green。
Red产物分别在TEMP下`interceptor-breakpoint-batch-e2e-red`、`interceptor-breakpoint-batch-summary-e2e-red`。

最终本workflow1/1（35.3秒），Main/Core两代`42592/42636`、`25756/42356`均正常销毁；通过真实UI创建的
两条Rule、多条HTTP请求与两条WebSocket连接验证Rule/queue隔离、原始body保留、未发送草稿不被使用、
Deny/Allow/Auto、空目标返回0、Ask/Auto摘要、Agent/MCP独立撤权及重启零重放。origin最终6次请求、
WebSocket4条已转发文本；归档只有计数、哈希和布尔结论，文件为`breakpoint-batch.json`。

关联旧Agent断点流程1/1（43.4秒），两代`15836/27864`、`11372/12132`；全局授权、原UI queue命令、
MCP Browser/Desktop四条4/4（1.6分钟），七代`9880/41232`、`27880/35316`、`23808/33460`、
`16740/41760`、`3732/37300`、`14992/28452`、`27684/39564`。六条流程共11个代际均
`gracefulDestroyVerified=true`，8888释放、完整WinINet/journal/进程树恢复；归档分别为
`interceptor-breakpoint-batch-final-e2e-green`、`interceptor-breakpoint-batch-existing-agent-green`与
`interceptor-breakpoint-batch-remaining-e2e-green`。

中间测试前提修正不计为产品Red：先进入Capture再Recording；公开PendingBreakpoint是扁平DTO；WebSocket
方向内串行所以两条连接各产生一个pending；已选Capture行不能重复点击关闭详情。原始失败证据均独立保留。
旧Agent关联首轮将11项撤权塞进同一Turn导致失败，并在失败清理中遇到敏感可见内容审计；Main/Core
`40148/16460`正常销毁不代表整条验收通过，证据在`interceptor-breakpoint-batch-related-first-run`。
改为discovery与每项撤权独立Turn后同一流程Green，未提升产品步数上限、未删除任何撤权断言。

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

<a id="breakpoints-queue-stepping"></a>
## `breakpoints.queue-stepping`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建profile/evidence和HTTP origin；启动真实Electron并进入Recording；通过Rules UI创建POST request Breakpoint Rule，再经8888产生一条普通GET作为焦点负例。
2. 按A、B、C顺序发送三个POST并逐项等待公开`queueKey=http`、`data-breakpoint-state`和1/2/3位置稳定。
3. 真实中止B客户端，确认B的pending身份消失但Capture行保留，C更新为位置2。
4. 选择A并Continue unmodified；确认A原样到达origin，C根据最新snapshot成为位置1并自动获得可编辑Inspector。
5. 加入D后选择普通GET；中止C，确认D成为队首，但普通GET仍保持当前Detail且断点编辑按钮不存在。
6. 手动选择D并Continue；确认A/D到达origin、B/C从未到达，badge归零。
7. 保存客户端/origin/Capture/trace证据；正常Close并验证Main/Core、8888和系统代理恢复。

### 预期效果

HTTP pending按最新snapshot推进；中间abort不删除Capture行。只有用户仍查看已解决队首时自动推进，查看普通流量时不抢焦点。

### TDD证据要求

- 产品实现前，同一workflow必须因`queueKey`/队列位置/Queued Detail/推进语义缺失而Red；selector、fixture、授权、构建或环境失败不算Red。
- 产品实现后，A/B/C、B/C abort、最新snapshot推进、普通行不抢焦点与完整销毁必须在同一workflow Green。

<a id="breakpoints-queue-isolation"></a>
## `breakpoints.queue-isolation`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建profile/evidence、HTTP origin和WebSocket lab；启动真实Electron，先建立当前连接并从Messages UI启用message断点，再创建HTTP request Breakpoint Rule。
2. 同时制造一个HTTP pending，以及同一WebSocket连接的出站/入站两个pending；确认全局badge=3，分别属于`http`与`ws:<exchangeId>`。
3. 确认WebSocket队首可编辑、第二项为Queued且没有编辑器；同一已捕获应用帧由pending row在原sequence位置
	暂时代替，后到的未挂起反向历史帧仍排在其后；Sent / Received筛选不显示另一方向的pending。
4. 在HTTP与WebSocket队首分别填写不同Text草稿，往返选择后逐项恢复，证明草稿按`breakpointId`隔离。
5. 对WebSocket执行Continue all；命令开始时两项原样放行，命令期间产生的echo作为未来项保持pending，HTTP与HTTP草稿不变。
6. 再次Continue all释放未来WebSocket项；随后选择HTTP，确认草稿仍在，并用Continue unmodified原样发送客户端正文。
7. 保存HTTP/双向WebSocket数据面、Capture/trace证据；正常Close并验证Main/Core、8888和系统代理恢复。

### 预期效果

HTTP与WebSocket逻辑队列互不阻塞；同一WebSocket连接的双向帧按Capture sequence稳定排序，方向筛选同时
作用于历史与pending。草稿互不覆盖，批量Continue不应用草稿，调用开始后产生的未来项不被吸收。

### TDD证据要求

- 产品实现前，同一workflow必须因多`queueKey`或非队首语义缺失而Red。
- 产品实现后，HTTP/WS隔离、同连接顺序、Queued、独立草稿、调用开始快照、真实socket结果与完整销毁必须Green。

<a id="breakpoints-queue-commands"></a>
## `breakpoints.queue-commands`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建profile/evidence与HTTP origin；通过Rules UI创建POST与PUT两个互斥request Breakpoint Rule。
2. 制造两个POST和一个PUT pending，在POST队首填写未提交草稿；执行Continue all from this rule。
3. 确认两个POST原始正文到达origin、草稿未应用，PUT仍pending并因最新snapshot自动成为队首。
4. 再加入一条PUT并执行Drop all；确认两条PUT客户端失败且origin零写入，badge归零。
5. 新建两个POST pending并执行Continue all；确认两客户端与origin都收到原始正文，badge归零。
6. 保存三种命令的数据面与trace证据；正常Close并验证Main/Core、8888和系统代理恢复。

### 预期效果

`Continue all`、`Drop all`和`Continue all from this rule`分别走独立意图链路。Rule与Queue作用域不串线，批量Continue不应用草稿，Core返回实际`resolvedCount`。

### TDD证据要求

- 产品实现前，同一workflow必须因三条公开批量命令入口缺失而Red。
- 产品实现后，queue/rule作用域、草稿忽略、队列推进、客户端/origin结果和完整销毁必须Green；调用开始快照、stale目标与`resolvedCount`由Queue/CoreApplication单测锁定。

### Automation Contract

新增公开automation ID必须落在实际接收交互或表达状态的DOM上，不使用翻译文案、CSS class或私有API：

| 交互/状态 | Automation ID或公开属性 |
| --- | --- |
| pending Capture行 | `capture.request-row.<exchangeId>` / `capture.websocket.frame.<exchangeId>.<seq>` |
| pending身份与顺序 | `data-breakpoint-id`、`data-queue-key`、`data-queue-position`、`data-breakpoint-state=head\|queued` |
| 打开批量菜单 | `breakpoints.queue-menu` |
| 当前逻辑队列Continue all | `breakpoints.continue-queue` |
| 当前逻辑队列Drop all | `breakpoints.drop-queue` |
| 当前Rule Continue all | `breakpoints.continue-rule` |
| 单项动作 | `breakpoints.continue-unmodified`、`breakpoints.execute-edited`、`breakpoints.drop` |

动态`exchangeId`、frame sequence、`breakpointId`、`queueKey`和`ruleId`只能从产品已公开的动态行与属性读取。

<a id="breakpoints-lifecycle-release"></a>
## `breakpoints.lifecycle-release`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建profile/evidence、HTTP origin和WebSocket lab；启动真实Electron并进入Recording，通过产品UI启用HTTP与WebSocket断点。
2. 同时制造HTTP与WebSocket pending；等待固定观察窗口，确认badge保持2且两种payload均未抵达origin。
3. 异常断开WebSocket客户端；确认该连接pending立即消失、badge只剩HTTP的1，挂起payload未抵达origin。
4. 建立第二条真实WebSocket连接，通过产品UI启用断点并再次制造pending，确认badge恢复为2。
5. 保存关闭前截图/trace，通过产品Close触发Main→Core正常关闭。
6. 确认HTTP客户端失败、第二个WebSocket客户端关闭、两个origin仍无挂起payload；共享fixture验证Main/Core退出、8888释放和系统代理恢复。

### 预期效果

HTTP与WebSocket均没有产品timeout。pending无隐藏数量上限，只由用户操作、HTTP客户端abort、WebSocket
异常断开或Core生命周期关闭释放；异常断开只清理所属逻辑队列，`closeAll()`统一结算全部pending为
`aborted`并清空Renderer临时状态。

### TDD证据要求

- 删除timeout实现前，同一workflow必须因旧Timeout控件仍存在而Red。
- 删除后，无自动释放、WebSocket异常断开精确清理、`aborted`结果、Core关闭与完整销毁必须Green；无控件与协议字段由unit/typecheck/design验证。

### 逻辑队列阶段TDD证据

- Retrospective Red：最终四条workflow源码在`d854588`旧产品运行；`queue-stepping`与`queue-commands`
	已经通过真实Rules UI形成paused请求但Capture行无`data-queue-*`，`queue-isolation`的HTTP已pending但无
	`queueKey`，`lifecycle-release`在真实WebSocket setup仍找到1个timeout控件。Main/Core PID依次为
	`34028/1940`、`32556/29092`、`31380/12648`、`14964/31472`，四组
	`gracefulDestroyVerified=true`。
- Green：当前`queue-stepping`、`queue-commands`、`queue-isolation`、`lifecycle-release`合并`4/4`
	通过（26.9秒），Main/Core PID依次为`24768/21248`、`30096/30308`、`18196/12256`、
	`36720/2084`；四组`gracefulDestroyVerified=true`，8888释放且系统代理恢复。
- 无上限补充Green：`queue-stepping`通过真实Rules UI创建规则并依次发送11条真实HTTP请求；11条均带
	`queueKey=http`与位置1至11，badge为11且origin零到达。随后真实客户端abort释放这些项，原有
	中间abort、最新snapshot推进与不抢焦点流程继续Green。
- 提交后复审Red：`queue-isolation`在pending应用帧后收到一条未挂起反向历史帧，DOM顺序断言为false，
	证明pending被错误追加到列表末尾；`lifecycle-release`异常destroy WebSocket客户端后15秒仍保留1条
	pending。对应Core unit / integration同时Red于timeline函数缺失、`abortQueue`缺失、非法action被结算为
	`dropped`、capture reset越过阻塞frame写入和暂停Recording waiter未settle。
- 提交后复审Green：同一`queue-isolation`锁定pending在原sequence替代历史行，Sent / Received同时筛选
	history与pending；同一`lifecycle-release`锁定1006只清所属WebSocket队列，再由Core关闭清理第二条
	连接与HTTP。逻辑队列四条workflow合并`4/4`、graceful close编辑`1/1`通过，均保留完整销毁证据。
- 视觉证据独立于业务E2E：HTTP queue head/Queued/menu、WebSocket setup/head/Queued、Rules action明暗
	14 views均`0 missing / 0 flagged`，最大0.8px；业务workflow不包含像素或几何断言。

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
3. Playground的`WebSocketTrafficRunner`在random loopback port启动真实`WebSocketServer`。共用的`ProxiedWebSocketClient`经8888发送absolute-form HTTP Upgrade；Node解析响应，并校验真实`HTTP/1.1 101`和`Sec-WebSocket-Accept`后才算连接建立。
4. 等待包含`/e2e/websocket-close`的动态`capture.request-row.<exchangeId>`并点击；点击`capture.inspector.tab.messages`。点击`capture.websocket.breakpoint.toggle`打开当前连接的setup。
5. 断言`capture.websocket.breakpoint.frame.message`初始`aria-pressed=true`；点击它取消，再点击`capture.websocket.breakpoint.frame.close`并断言选中。保持默认Both directions，点击`capture.websocket.breakpoint.enable`。
6. 客户端调用`sendCloseFrame(1000)`，由`ws.Sender`编码masked Close帧，不提前改变连接状态或开始关闭超时。等待`breakpoints.close-code`可见且value=1000，证明真实close帧已在Capture原行暂停。
7. 只把`breakpoints.close-code`填为1001，不切换Replacement mode；点击`breakpoints.execute-edited`。轮询真实origin的`close`事件并要求code=1001。
8. 附加`websocket-origin-observation.json`、最终截图、trace、Main/Renderer日志和metadata。fixture销毁客户端与server-side sockets，进入Settings→Proxy恢复owned配置，再正常Close并验证Main/Core PID退出、8888可重新bind和profile删除。

### 预期效果

closeCode与body是正交编辑；没有body replacement时仍必须转发用户编辑后的close code，同时保留原始reason bytes。

### TDD证据要求

- 修复前提交运行同一workflow：origin收到1000而非1001。
- 当前提交运行同一workflow：origin收到1001，且完整销毁/恢复证据Green。fixture或selector失败不算Red。

2026-09-07统一客户端重构前后，关闭码编辑、queue isolation和Playground Capture同组三条真实E2E均3/3。
最终关闭码workflow Main/Core为`11808/44180`，trace齐全、`gracefulDestroyVerified=true`；证据在TEMP下
`interceptor-websocket-client-green-20260907`。关闭码仍由用户在真实UI修改，不通过客户端改造绕过产品流程。

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
