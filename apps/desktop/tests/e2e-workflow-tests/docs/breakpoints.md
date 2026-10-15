# Breakpoints Workflows

## 教程逐步骤录制

`guidebook-request.workflow.ts`在正式Release中按真实UI建立`Guide request breakpoint`，Host限制为`127.0.0.1`且Path包含`/guide/breakpoints`。对自产POST依次演示Text替换`{"message":"edited-by-guide"}`、原样放行`{"message":"original"}`和Drop；源站及客户端分别核对修改、保留和拒绝，截图与视频复用同一组值。每步图和字幕由原生窗口录制器产生，不用设计稿。

完成后停用并Apply，原driver验证代理、Core及8888恢复。此流程不证明File、响应阶段或WebSocket步骤已配图，不能以本片覆盖未实际录制的分支。

### 响应 Header、Text 与 File

`guidebook-response.workflow.ts`只录真实Release中的响应断点，不重复普通请求断点教程。

1. 独立profile启动真实App、trace及loopback origin，等待Core、8888和Recording。通过Rules UI准备`Guide response breakpoint`，Host为`127.0.0.1`、Method为`POST`、Path包含`/guide/response`；初始仍为request阶段。
2. 从同一origin取得`/guide/response/source`，在Capture选中该GET并打开Response。正文为公开的`file-from-product`及`guide-response-001`。真实点击Save body，在原生Save面板保存`guide-response.json`；截图必须包含该面板与文件名，只读比较导出文件和客户端收到的完整字节。
3. 在Rules中打开阶段选项、选择response并Apply，回到Capture。发送`/guide/response/header-only`，确认源站已收到`{"request":"guide-response"}`，客户端尚未完成且Capture为Head；这是响应头阶段暂停，不要求原始响应正文已可预览。
4. 选中响应，明确保持Body Off，只将`x-guide-response`改成`header-only-guide`。Forward edited后客户端Header改变，完整正文仍为`{"message":"origin-response","orderId":"guide-response-001"}`，源站收到的请求字节不变。
5. 下一条`/guide/response/text`切到Text，输入`{"message":"text-from-guide","orderId":"guide-response-001"}`后Forward edited；核对客户端完整响应字节及源站实际请求。
6. 下一条`/guide/response/file`切到File，经真实Open面板选择步骤2的文件。折叠响应头，为完整文件预览留出空间；分别保留原生选择图、文件名/大小/可读预览图以及Forward edited后的图。客户端响应必须逐字节等于产品保存的文件，不能由测试写入替换文件。
7. 逐步停用规则并Apply，保存每步PNG、视频/VTT、步骤与示例值、客户端及源站证据。原driver点击`shell.window.close`，验证Main/Renderer/Core/Worker退出、8888释放、完整宿主代理及日常CA保持，再删除profile及关闭origin；不修改App语言。

### HTTP 队列与批量操作

`guidebook-queue.workflow.ts`通过真实客户端建立HTTP队列；不预造pending或注入草稿。

1. 独立profile、trace、真实App和loopback origin就绪后启用Recording，通过Rules UI准备`Guide POST queue`与`Guide PUT queue`，均限制Host `127.0.0.1`，Method分别为`POST`/`PUT`。录制展示两条实际规则后回到Capture，筛选自产`/guide/queue`路径。
2. 依次发送`post-a`、`post-b`、`put-a`，正文分别为`{"order":"POST-A","source":"original"}`、`{"order":"POST-B","source":"original"}`、`{"order":"PUT-A","source":"original"}`。逐条截取Head、Queued和pending数量；公开DOM的`data-queue-key`必须为`http`。
3. 在Head切到Text，输入`{"order":"POST-A","source":"draft-not-submitted"}`。分别选择两个Queued项，确认只读详情、没有Forward edited，再回到Head核对草稿仍在；源站此时未收到这三条请求。
4. 展开批量菜单并单独执行Continue rule，只放行两条POST，且发送原始正文而不是未提交草稿；PUT仍等待并成为Head。分别核对客户端完成、实际origin字节和剩余数1。
5. 增加`put-b`后展开菜单、执行Drop queue。两条PUT均报连接错误且不抵达origin，HTTP队列清空；已经放行的POST结果不变。
6. 再建立`post-c`与`put-c`，展开菜单、执行Continue queue。两种Method均原样抵达origin并完成，证明Queue范围不是单一Rule；公开pending与badge清空。
7. 逐步停用两条规则并Apply，保存逐步PNG、视频/VTT、步骤与示例值、origin及客户端结果。原driver正常Close，验证所有App进程及8888释放、完整代理与CA恢复，再删除profile并关闭origin。失败素材不作为产品Red或教程通过证据。

### WebSocket 文本消息

`guidebook-websocket.workflow.ts`只使用一条`/guide/websocket/text`真实连接，不扩展ping/pong/close断点。

1. 独立profile启动真实App与trace，等待Core/8888，启用Recording；创建真实WebSocket origin/client，经8888建立连接。选中自产路径，打开Messages、断点设置，逐步选择Sent与默认Message并启用；其他帧选项保持未选中。
2. 发送公开文本`{"type":"chat","message":"hello-original"}`，截取暂停帧和原文。Continue unmodified后源站及echo客户端收到相同字节。
3. 发送`{"type":"chat","message":"edit-this"}`，选择Text、输入`{"type":"chat","message":"edited-by-guide"}`并Forward edited；源站与echo客户端只收到替换文本。再发送`{"type":"chat","message":"do-not-forward"}`并Drop，确认源站与客户端均未收到。
4. 停用Sent设置，再打开设置、选择Received并启用Message。从origin依次发送`server-original`、`server-edit-this`、`server-do-not-forward`三个同结构JSON文本，分别演示Continue unmodified、Text替换为`server-edited-by-guide`及Drop；暂停时客户端尚未收到，放行后按完整文本核对。
5. 停用连接断点，用`{"type":"chat","message":"after-disabled"}`完成无暂停echo，证明连接仍然可用、被Drop的消息未延迟转发。正常关闭示例连接并核对origin关闭码1000。
6. 保存每个真实操作后的PNG、视频/VTT、公开示例和双端结果。原driver点击产品Close，验证Main/Renderer/Core/Worker退出、8888释放、宿主代理和日常CA保持，再删除profile并关闭origin；不切换App语言，不调用Preload/Store业务API。

以上三组的origin端口、exchangeId和ruleId由实际运行产生；固定文件名、路径、Header与payload必须与截图及字幕一致。录制仅选择本轮App或其原生文件面板，不把App灰色遮罩当作文件窗口。

本文件定义 Capture 内嵌 Breakpoint 能力的完整 E2E 流程。产品没有独立 Breakpoints workspace：配置入口是 Capture workbar manager，命中与编辑入口是 paused Capture 行及其 Inspector。每条 workflow 独立启动 Electron、独占 profile/trace，并通过真实 Rules breakpoint action、Core queue 和客户端连接验证。

## `breakpoints.body-preview`

2MiB预览不得影响3MiB文件和Text发送。短File另覆盖展开前置Original后的高度重算，Windows原生窗口待验。普通文件用Content-Length请求；继承chunked的编辑framing由`breakpoints.execute-edited`独立验收，不以本流程通过代替。

1. fresh profile启动真实Electron，保存宿主基线，通过UI开始Recording；使用现有HTTP origin产生完整且超过2 MiB的UTF-8正文，通过产品Save body导出本轮文件，不自行写入替换文件。
2. 通过Rules UI创建request breakpoint并Apply，向测试origin发送含长正文请求；从实际Capture行打开断点，Original预览最多2 MiB并显示截断，禁止Format；正文限高且右下角可拖，滚轮/键盘可达预览末尾。
3. 收起Original，Text填入完整超过2 MiB输入并在末尾追加自产标记，Forward edited后origin收到完整文本。再次挂起，选择File并用真实Open Dialog选步骤1产品导出的文件；显示可读JSON/文本预览和完整文件说明，File预览不是编辑值。
4. 拖拽File高度后Forward edited，origin的完整长度/hash与步骤1保存文件一致；预览末尾截断不影响发送。分别保留无替换、空Text、File模式切换与取消选文件的原有语义。
5. 保存改前/改后PNG、预览字节数、完整文件/发送hash和trace；通过正常Close退出，Main/Core/Worker全退、8888释放、完整代理/日常CA保持。不得以fake Preload或预造文件替代产品保存、选择与发送。

键盘复制预览时只归一化平台CRLF/LF差异，然后同时比较完整文本长度和SHA-256，保存原始长度与CRLF数量；不只比较长度。产品导出文件及Forward edited的网络正文仍逐字节核对，不归一化文件或线上数据。

## `breakpoints.original-body`

1. fresh profile通过真实UI开始Recording并创建POST断点，客户端向loopback origin发送完整3MiB JSON。
2. Original显示有限2MiB且禁止Format；容器限高、右下角可拖，Raw/Copy不读取超出预览的字节。
3. 通过Continue unmodified释放，origin收到完整原始字节；保存几何/截图/trace，正常退出并验证进程、8888、代理与日常CA恢复。

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
	Auto由Settings fixture执行同一次点击，并等待公开Client `data-execution-mode=auto`及MCP区`aria-busy=false`确认持久化完成，再发下一条外部Tool；不改变两平台步骤、输入、审批规则或超时。
6. 正常关闭并以同profile重启，权限保持、Model/origin零重放；关闭所有客户端，保存脱敏trace/evidence，
	验证两代Main/Core/Worker销毁、8888释放及完整WinINet/journal恢复后删除profile。

### 预期与证据

Red必须发生于三条Tool缺失或正式业务效果缺口，不能来自selector、网络fixture或环境失败。空目标/客户端中止
返回0是产品正式语义，不要求虚构stale错误。业务证据只保存目标身份、计数、内容哈希与协议结论；审批和Model
结果不包含敏感URL/Header/正文。unit/integration与同一真实workflow分别按Red→Green闭环，不能用既有
UI批量命令workflow替代本组Agent/MCP调用。

<a id="breakpoints-toggle"></a>
## `breakpoints.toggle`

**状态**：passed
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

### 验收要求

- 必须检查`queueKey`、队列位置、Queued Detail和推进语义；selector、fixture、授权、构建或环境失败不算产品故障。
- A/B/C、B/C abort、最新snapshot推进、普通行不抢焦点与完整销毁必须由同一workflow验证。

<a id="breakpoints-queue-isolation"></a>
## `breakpoints.queue-isolation`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建profile/evidence、HTTP origin和WebSocket lab；启动真实Electron，先建立当前连接并从Messages UI启用message断点，再创建HTTP request Breakpoint Rule。
2. 同时制造一个HTTP pending，以及同一WebSocket连接的出站/入站两个pending；确认全局badge=3，分别属于`http`与`ws:<exchangeId>`。
3. 确认WebSocket队首可编辑、第二项为Queued且没有编辑器；同一已捕获应用帧由pending row在原sequence位置
	暂时代替，后到的未挂起反向历史帧仍排在其后；Sent / Received筛选不显示另一方向的pending。
4. 在HTTP与WebSocket队首分别填写不同Text草稿，往返选择后逐项恢复，证明草稿按`breakpointId`隔离。首次打开WebSocket队首时，从公共Execute edited按钮定位当前Inspector，按Section的`aria-controls`读取Original容器；断言`display:flex`、默认`min-height:auto`且高度等于内部BodyViewer，保存`websocket-paused-original-layout.json/png`。不按翻译文案或CSS class定位，不把此前headless结果当作真实E2E。
5. 对WebSocket执行Continue all；命令开始时两项原样放行，命令期间产生的echo作为未来项保持pending，HTTP与HTTP草稿不变。
6. 再次Continue all释放未来WebSocket项；随后选择HTTP，确认草稿仍在，并用Continue unmodified原样发送客户端正文。
7. 保存HTTP/双向WebSocket数据面、Capture/trace证据；正常Close并验证Main/Core、8888和系统代理恢复。

### 预期效果

HTTP与WebSocket逻辑队列互不阻塞；同一WebSocket连接的双向帧按Capture sequence稳定排序，方向筛选同时
作用于历史与pending。草稿互不覆盖，批量Continue不应用草稿，调用开始后产生的未来项不被吸收。

### 验收要求

- 同时检查多`queueKey`及非队首语义。
- HTTP/WS隔离、同连接顺序、Queued、独立草稿、调用开始快照、真实socket结果与完整销毁均须通过。

<a id="breakpoints-queue-commands"></a>
## `breakpoints.queue-commands`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建profile/evidence与HTTP origin；通过Rules UI创建POST与PUT两个互斥request Breakpoint Rule。打开`capture.breakpoint-manager`，确认标题父行flex/align-items:center，计数与分组标签使用自然行高，Advanced rules为28px共享按钮且图文gap为7px；保存Manager截图，再真实点击关闭。该步骤不改变规则或总开关。
2. 制造两个POST和一个PUT pending，在POST队首填写未提交草稿；执行Continue all from this rule。
3. 确认两个POST原始正文到达origin、草稿未应用，PUT仍pending并因最新snapshot自动成为队首。
4. 再加入一条PUT并执行Drop all；确认两条PUT客户端失败且origin零写入，badge归零。
5. 新建两个POST pending并执行Continue all；确认两客户端与origin都收到原始正文，badge归零。
6. 保存三种命令的数据面与trace证据；正常Close并验证Main/Core、8888和系统代理恢复。

### 预期效果

`Continue all`、`Drop all`和`Continue all from this rule`分别走独立意图链路。Rule与Queue作用域不串线，批量Continue不应用草稿，Core返回实际`resolvedCount`。

### 验收要求

- 三条公开批量命令入口均须实际操作。
- queue/rule作用域、草稿忽略、队列推进、客户端/origin结果和完整销毁均须通过；调用开始快照、stale目标与`resolvedCount`由Queue/CoreApplication单测锁定。

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

### 验收要求

- 产品不显示Timeout控件，也不按超时自动释放pending。
- WebSocket异常断开精确清理、`aborted`结果、Core关闭与完整销毁均须通过；控件和协议字段同时由unit/typecheck/design验证。

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

**状态**：passed
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
9. **Body-only inherited chunked**：客户端第四次发送不含`Content-Length`且使用`Transfer-Encoding: chunked`的匹配请求；不编辑header，选择Text replacement并点击Execute edited。
10. 验证origin收到新正文和`Transfer-Encoding: chunked`，没有`Content-Length`；Core只生成content bytes，Mockttp/Node完成H1 chunk framing。
11. 为每一段保存origin observation、客户端结果、最终Capture状态与截图/trace；进入Proxy点击Restore，确认non-owned并Close。
12. 验证Main/Core退出、8888释放、系统代理恢复；关闭origin并删除profile。

### 预期效果

Breakpoint 快照先包含所有普通 Rule 的最终改写，用户草稿不会再被后续 Rule 覆盖。Header-only不改变body；
body-only按继承headers构造新body；header+body按用户最终headers构造新body。四段都经过真实UI/Main/Core/
Mockttp/origin，Core state=edited，Capture反映实际转发结果。

### 验收要求

- 暂停快照包含priority更晚的rewrite header/marker；Forward edited后Capture保留绑定breakpoint rule的effect。
- 最终state、暂停marker、origin wire与Capture effect均须通过，并确认代理恢复、进程销毁和8888释放。selector、UAC、构建或fixture失败不算产品故障。

HTTP framing矩阵仍未通过，本workflow整体保持`planned`；final Rule state与header effect不能替代线上字节验收。

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
4. 等待包含`/e2e/websocket-close`的动态`capture.request-row.<exchangeId>`并点击；点击`capture.inspector.tab.messages`。origin通过真实连接发送四条自产历史消息，客户端全部收到且列表每行38px。保存消息断点按钮截图，验证30×30px和1px透明边框，再点击`capture.websocket.breakpoint.toggle`打开当前连接的setup。
5. 断言`capture.websocket.breakpoint.frame.message`初始`aria-pressed=true`；点击它取消，再点击`capture.websocket.breakpoint.frame.close`并断言选中。保持默认Both directions，点击`capture.websocket.breakpoint.enable`。
	鼠标移开后记录已启用按钮颜色与背景，再hover并断言二者不变，保留黄色状态；默认/启用两态均保持30×30px。边框按当前devicePixelRatio核对一条CSS像素的实际物理像素，150%缩放的0.666667px不当作缺失边框。
6. 客户端调用`sendCloseFrame(1000)`，由`ws.Sender`编码masked Close帧，不提前改变连接状态或开始关闭超时。等待`breakpoints.close-code`可见且value=1000；队首编辑时消息列表外框126px，真实滚轮可访问底部暂停帧。暂停说明、方向和队列按钮必须由同一层`display:flex; align-items:center`排布，箭头与phase文字也使用flex center，不用baseline或字形位置容差代替。Replacement标题36px、折叠控件13px，折叠/恢复仅改变内容可见性，Off始终选中；保存暂停布局截图。
7. 只把`breakpoints.close-code`填为1001，不切换Replacement mode；点击`breakpoints.execute-edited`。轮询真实origin的`close`事件并要求code=1001。
8. 附加`websocket-origin-observation.json`、最终截图、trace、Main/Renderer日志和metadata。fixture销毁客户端与server-side sockets，进入Settings→Proxy恢复owned配置，再正常Close并验证Main/Core PID退出、8888可重新bind和profile删除。

### 预期效果

closeCode与body是正交编辑；没有body replacement时仍必须转发用户编辑后的close code，同时保留原始reason bytes。

### 验收要求

- origin必须收到用户编辑后的1001，而不是入站1000。
- 完整销毁和系统恢复均须通过；fixture或selector失败不算产品故障。

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
