# Agent Workflows

## 原流程与可选步骤截图

Agent只使用原workflow与已有可控模型lab；截图模式不增加第二套模型操作或商业凭据。

- `model-configuration`继续验证Test/Save、编辑后重新验证、默认配置、脱敏凭据与最后模型移除。

- `restart-recovery.workflow.ts`在原Chat隔离/重启基础上核对全局默认与当前Chat模型独立、运行中删除取消真实HTTP、恢复后不重放和未配置面板。

- `streaming-context`与`execution-modes`保留真实流式增量、Usage、Stop/Retry、Ask/Auto和当前Session边界。`traffic-control`补已允许Tool完成后Stop仅取消模型解释、不撤销业务结果，并先确认真实HTTP取消后再Retry。

- `settings-capabilities.workflow.ts`保留原独立开关与全部开启的重启验收，再验证全部change双列关闭、query精确保留、真实MCP拒绝及另一代App中的只读权限；不用单项关闭冒充整个入口只读。

- 各领域Tool仍在原`composer`、`diagnostics`、`rules`、`breakpoints`、`capture-discovery`等流程验证，不重复复制到教程脚本。模型内容与用量是本地测试输入，不是商业模型能力或计费证明。

命令、输出清单和显式导入边界见[套件说明](../README.md#trace-与证据)。已有公开PNG及历史验收记录保持原来源，新的运行不会自动替换它们；本节不把未经执行的平台或分支记为通过。

本文件定义内置 Agent 阶段 1 的完整 E2E 流程。每条 workflow 独立启动真实 Electron、独占 profile 与 trace；
只有需要 Model 的 workflow 才启动本地 OpenAI-compatible lab。所有配置、Chat 与导航动作都经过真实产品边界，
不注入 Provider、Session、Transcript 或 Usage。

<a id="agent-panel-navigation-persistence"></a>
## `agent.panel.navigation-persistence`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立空 profile/evidence；启动 trace 和真实 Electron，不启动 Model lab。
2. 等待 App/Core/8888/readiness，确认窗口恢复为 `1600×900`、Capture active；点击 `capture.readiness.cancel`。
3. 确认 `agent.panel` 初始不存在；记录关闭态 Main workspace 边界。点击 `agent.panel.toggle`，确认 Panel 打开为精确 `440px` 右侧 grid column，Main 同步缩窄且两者边界不重叠。
4. 确认 fresh profile 显示未配置状态、`agent.chat.new` disabled，且 `agent.configure` 是唯一配置出口；不得显示伪造 Session、Transcript、Context Usage 或已连接 Provider。
5. 点击 `agent.configure`；确认进入 Settings > Agent，Settings rail 只有 Agent 为 `aria-current=page`，Panel 保持打开且仍为同一未配置状态。
6. 依次经正式导航进入 Rules、Composer、Diagnostics、Capture，再普通返回 Settings；每次确认 Panel 始终打开、宽度和未配置状态不变，Workspace 内容与 Panel 不重叠，也没有自动出现页面 Context。
7. 点击 Panel 内 `agent.panel.close`，确认右栏消失且 Main 释放 `440px` grid track；Workspace 与当前 Settings section 不改变。
8. 再用全局 toggle 打开 Panel，确认仍为未配置状态；最后再次点击全局 toggle 关闭，证明唯二关闭入口都有效且导航从不隐式关闭。
9. 保存关闭/打开/跨 Workspace/Settings 深链的边界、Panel 状态、无隐式 Context 结论、final screenshot、trace、Main/Renderer 日志与 PID/端口 metadata。
10. 点击 `shell.window.close`，验证 Main、Renderer、Core、Worker 全退、8888 释放且 `gracefulDestroyVerified=true`；删除 profile。

### 预期效果

Agent 是全局右侧栏，不是 Workspace 或 overlay；fresh profile 只显示诚实的未配置态。Workspace/Settings 导航不自动关闭 Panel或注入页面 Context；只有用户点击全局 toggle 或 Panel Close 才关闭。本 workflow 不替代 Provider 配置、Streaming Chat 或重启恢复验收。

`440px` 是 `1600×900` 基线宽度。窗口缩小时 Grid 优先为 main 保留 `440px`，Agent 在同一右侧 track 内响应式收缩，不切换成 overlay；Close 始终可达。

<a id="agent-settings-model-configuration"></a>
## `agent.settings.model-configuration`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立空 profile、两代 evidence 与本地 OpenAI-compatible lab；lab 暴露两个 profile URL，记录每次 Chat Completions 的 model、Authorization 是否存在和脱敏 body hash；启动第一代 trace/Electron。
2. 等待 App/Core/8888/readiness；点击 `capture.readiness.cancel`，进入 Settings > Agent，确认空模型列表和 Add Provider 命令。
3. 打开 Custom Provider Dialog，确认 Profile name、Base URL、API Key、Model ID、Context Window、Maximum Output 均为空，六个 FieldControl 高度一致，未 Test connection 时 Save disabled。
4. 填入第一个 profile URL、测试 Key、Model ID 与 limits；点击 `agent.provider.test-connection`，确认 lab 收到真实请求且有 Authorization，UI 显示 verified、Save enabled。修改 Model ID 后确认 verification 失效与 Save disabled；重新 Test 后 Save。
5. 通过相同产品 UI 配置第二个无 Key profile；确认 lab 收到请求且没有 Authorization。保存后唯一 `Configured models` 列表出现两行，每行只显示 Provider Logo、Model ID、Connected、脱敏 metadata、Edit/Remove 与 default 命令。
6. 确认第一行 `Default` 是非交互状态；点击第二行 `Set default`，确认状态只移到第二行且列表不重排。编辑第一项时 Key 只显示 configured/尾号，选择 keep，修改 Model ID 并重新 Test/Save，确认原行原位更新。
7. 保存第一代 evidence并点击 `shell.window.close`；验证完整销毁但保留 profile。用同一 profile 启动第二代 Electron，确认两行、稳定顺序、脱敏凭据状态和第二行 default 恢复，且启动没有自动发起 Model 请求。
8. 第二代先确认第一项仍只显示Key尾号；编辑该Custom Provider并显式移除已存Key，重新Test/Save，确认lab没有收到Authorization且列表改为无Key。随后通过正式Remove/confirm删除当前default第二项，确认第一项成为default；再删除第一项，确认回到unconfigured。全过程不得从Renderer API/DOM/trace/log读到Key明文。
9. 保存脱敏配置、两代恢复、Test request计数、default切换/删除结果、trace、final screenshot、日志与 metadata；只记录 Authorization 是否存在和 Key 尾号，不记录 header值、完整请求正文或响应正文。测试Key在运行期随机生成，敏感输入期间暂停trace；Dialog卸载后恢复trace，并在每代销毁后结构化扫描全部trace分段、Main与Renderer日志。
10. 点击第二代 `shell.window.close`，验证所有 App 进程与 8888 销毁；关闭 lab 并删除 profile。

### 预期效果

Settings > Agent 是 Provider/模型配置的唯一入口；Test connection 返回的 verification 是 Save 的前置，字段变化后必须重测；`Default` 是状态，`Set default` 才是命令；Provider顺序、default和脱敏凭据安全持久化并跨重启恢复。本 workflow 不验证当前 Chat 模型或 Session。

<a id="agent-chat-streaming-context"></a>
## `agent.chat.streaming-context`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立 profile/evidence 与脚本化本地 OpenAI-compatible lab；lab 对前三个 Turn 分别返回确定性多 chunk 文本、reasoning、cache hit/miss Usage，并支持观察 HTTP abort；启动 trace/Electron。
2. 等待 App/Core/8888/readiness并取消 readiness；通过 Settings > Agent 的 Custom Dialog 真实 Test connection/Save，然后从 Header 打开 Agent Panel。
3. 点击 `agent.chat.new`，输入第一条唯一消息并点击 `agent.message.send`；确认 user item 只追加一次、Composer 进入 running、Send 变为 Stop。
4. 按 lab 的 chunk 顺序观察同一 assistant item 原位增长，完成前不得出现最终状态；完成后确认 Stop 恢复为 Send、文本完整且 Session event sequence 严格递增。
5. 从UI读取Current Context Window Usage的`18px`圆环和`current / max`，确认精确等于lab capability/usage；鼠标悬停Context入口显示Session Usage详情，确认input cache hit、cache miss、output、total、加权rate与coverage对应第一轮事实，移出后详情关闭且页面不再有独立Session Usage按钮。
6. 发送第二条 follow-up；确认 lab 实际收到第一轮 user/assistant history和第二条user item，reasoning以独立可折叠区域流入，最终回答与 reasoning 不混合；Session Usage按两次Model Call累加。
7. 发送第三条消息，在首个可见 delta 后点击 `agent.turn.stop`；确认 HTTP request 被 abort、Turn 标记 stopped、已显示文本保留且没有伪造 completed Usage。
8. 点击该 Turn 的 `agent.turn.retry`；确认只创建一次新 Model attempt，旧 user item 不重复，Streaming 完成后同一 Session 可继续发送下一条消息。
9. 保存 event sequence、分块时序、abort/retry计数、Context/Usage数值、脱敏HTTP metadata、final screenshot、trace与日志；不得保存完整 Prompt、API Key或reasoning正文。
10. 点击 `shell.window.close`，验证 active request 已结束、Main/Renderer/Core/Worker全退、8888释放；关闭lab并删除profile。

### 预期效果

真实 HTTP Streaming 逐段进入 Transcript；多轮 Context、reasoning continuation、Context Window Usage、Session Usage、Stop 与 Retry 均由同一持久 Session 驱动，不重复用户消息或已完成调用。

<a id="agent-chat-restart-recovery"></a>
## `agent.chat.restart-recovery`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立 profile、两代 evidence 与本地 OpenAI-compatible lab；启动第一代 trace/Electron，等待 App/Core/8888/readiness并取消 readiness。
2. 通过 Settings > Agent 配置并保存 lab model；打开 Panel，创建 Chat A，发送唯一消息并完成响应，然后通过 Chat selector 的正式命令将其重命名。
3. 新建 Chat B，发送不同消息并完成响应；确认 selector 同时列出 A/B 且 B 为当前 Chat，记录两边 item IDs、文本 hash、Usage 与当前 Model，不读取 SQLite。
4. 点击第一代 `shell.window.close`；验证第一代 Main/Renderer/Core/Worker全退、8888释放且 `gracefulDestroyVerified=true`，保留 profile 与 lab。
5. 用同一 profile 启动第二代 trace/Electron；等待 App/Core/8888/readiness并取消 readiness，点击 Agent toggle。
6. 确认 Provider/default model、Panel 的当前 Chat B、A/B selector 顺序、两份 Transcript item IDs/hash、Turn outcome 与 Usage 全部恢复，且没有自动重放任何 Model Call。
7. 切换到重命名后的 Chat A 并发送 follow-up；确认 lab 收到 A 的历史而不含 B，Streaming完成后A独立累加Usage，B保持不变。
8. 从 Chat selector 对 Chat B 执行 Delete 并在产品确认框批准；确认 B 从 selector 消失、A 仍完整。创建空 Chat C 后删除，确认不会影响 A 或 Provider 配置。
9. 保存两代 Session 快照 hash、lab request count、重启前后 Usage、删除结果、final screenshot、trace、日志和 metadata；证据不得包含完整 Prompt、key或加密payload。
10. 点击第二代 `shell.window.close`，验证第二代完整销毁和8888释放；关闭lab并删除profile。

### 预期效果

Provider配置、默认模型、Session列表、当前Session、Transcript、outcome与Usage跨正常重启恢复；恢复不会重放网络请求；Rename/Delete/New Chat只影响目标Session。

<a id="agent-tools-settings-capabilities"></a>
## `agent.tools.settings-capabilities`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立空profile并启动真实Electron；进入Settings > Agent。
2. 无需配置Provider，确认`agent.tools.capabilities`存在，五组共24行且每行有Agent/MCP两个Switch；只列共享
	registry中已经实现的Tool，不展示架构目录里尚未开发的目标项。
3. 首次启动48个Switch全部开启；关闭`capture_get_proxy_status`的Agent开关，不改变同一行MCP开关或其他Tool；
	关闭`rules_replace_tree`的MCP开关，不改变同一行Agent开关。
4. 用真实搜索框过滤到`diagnostics_query`，确认隐藏/恢复行不会改变开关；离开Settings并返回，确认两项关闭状态保持。
5. 对比操作前后的Capture recording、Rules revision与系统代理状态，确认能力开关没有改写任何业务状态。
6. 正常关闭并用同一profile重启，确认两项关闭状态恢复；重新开启两项并再次重启，确认恢复为全部开启，
	证明关闭名称已从持久配置移除且未来新增Tool仍会默认开启。
7. 保存24个`agent.tools.row.<toolName>`、48个公开switch状态、搜索、两次重启恢复、trace与每代销毁证据；
	不通过测试API读取或注入设置文件。

### 预期效果

Settings列表由共享registry驱动。Agent与MCP开关默认开启、互不影响，只决定对应入口是否注册Tool，不改写
业务状态，也不提前展示未实现能力。本workflow只验收Settings与持久化，不替代独立的Agent或MCP Tool执行验收；
MCP执行链路由`mcp.desktop.streamable-http`覆盖。

24行Tool名称必须全部符合`<feature>_<verb>[_<object>]`，且前缀只来自`capture/rules/composer/breakpoints/diagnostics`；
旧无前缀名称不得出现在行、Switch automation ID或持久化恢复结果中。五个Capability ID、Settings分组与前缀一致。

<a id="agent-tools-capture-discovery"></a>
## `agent.tools.capture-discovery`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile和本地OpenAI-compatible lab；通过Settings真实配置Provider。
2. 经产品UI开始Recording，并让workflow fixture通过真实代理产生至少一条唯一HTTP exchange；不seed Capture或Agent Store。
3. 打开Agent并发送要求查询当前代理、Capture storage和该exchange的消息；lab依次产生`discover_tools`、
	`capture_get_storage_status`、`capture_get_proxy_status`、`capture_list_exchanges`与`capture_get_exchange`调用。
4. 确认首次Model request只含Capability Index与`discover_tools`，不含业务schema；discovery结果返回当前七个query
	descriptor和`capture_stop_recording`，下一request才披露全部八项；本workflow仍只执行Storage、Proxy、List与Detail四项query。
5. 确认后续每个request都保持assistant Tool Call与Tool Result的call ID配对；Transcript按顺序显示discovery、
	四个query调用、参数与结果摘要；Storage结果包含`sessionCount / exchangeCount / bodyCount / databaseBytes /
	blobBytes / totalBytes`，真实正文使`exchangeCount / bodyCount / blobBytes`非零；Exchange摘要读取正式
	`statusCode`而非不存在的`status`，最终回答引用真实exchange与Storage事实。
6. 正常关闭并用同一profile重启，确认Tool Call/Result轨迹与最终回答恢复；启动不自动重放Model或Tool调用。
7. 在Settings关闭`capture_get_storage_status`的Agent开关，新建Chat再次discover，确认Capability仍存在但结果与下一request
	schema都不含该Tool；让lab直接猜测调用`capture_get_storage_status`，确认返回`unknown_tool`。执行前关闭后Core零命令由
	`AgentToolService` owning unit使用`FakeCoreRuntime.commands`证明，不在E2E中调用测试后门观察Main内部状态。
8. 重新开启后再新建Chat并discover，确认`capture_get_storage_status`恢复；关闭该Chat不影响前一Chat的披露轨迹。
9. 保存脱敏lab请求、Tool item sequence、Capture事实、trace与每代销毁证据；关闭lab并删除profile。

### 预期效果

Agent通过共享Capability Index渐进发现已开启Tool，并查询同一真实Core中的Traffic与Capture storage；Settings关闭项
既不可发现也不可调用。四个query Tool直接执行，不出现change问询；Tool协议轨迹持久化后可跨重启重建Provider history。

<a id="agent-tools-body-messages"></a>
## `agent.tools.body-messages`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、两代evidence、本地OpenAI-compatible lab和随机端口正式Playground；通过产品Settings真实配置Provider。
2. 经产品UI开启Recording；系统Edge打开正式Playground，只通过公开场景目录和Run控件依次自产`body-json`与
	`ws-bidirectional`流量，不直接调用Lab API或seed Capture。
3. 从公开Capture行取得两条exchange identity。Model先discover `capture`，再调用`capture_get_exchange`读取HTTP detail，
	从该真实Tool Result取得response `bodyId`后分两段调用`capture_get_exchange_body`并重组完整JSON；不得由测试构造或
	预读body ID。每段严格遵守解码后明文字节`offset + length`，第一页明确`end=false`、末页`end=true`。
4. Model调用`capture_list_websocket_messages`读取同一WebSocket exchange，分别验证双向完整页与单方向过滤；cursor、limit、
	direction和返回frame顺序都使用共享schema与真实Core结果。
5. 经产品Certificates UI确认共享CA就绪、添加`localhost`源站例外并开启HTTPS解密，不重复生成或安装；再从正式Playground运行
	`grpc-unary-json`。Model调用`capture_list_grpc_messages`读取request与response两侧，验证recognized、body metadata、
	envelope offset/length、compressed/truncated标志和分页结果；payload字节继续通过正文range读取，不由该Tool复制。
6. 确认首次Model request仍只有Capability Index与`discover_tools`；成功discovery后的request精确披露当前17项Capture Tool，包含三项正文/消息schema；名称和顺序与正式契约一致，不仅检查子集。
	每项Tool Call/Result保持call ID配对，query在Ask/Auto下均不出现审批。
7. Transcript依调用顺序显示正文range、WebSocket消息和gRPC消息的结构化摘要与公开证据属性；下一次Provider
	request包含三项未被UI摘要裁剪的完整、已脱敏Tool Result。
8. 正常关闭并用同一profile重启，确认Transcript与三项Tool轨迹恢复，启动期间Model和Tool请求增量均为0。
9. 在Settings关闭三项Agent开关，新Chat discovery与schema不再包含它们；分别猜测调用均返回`unknown_tool`。
	重新开启后恢复。最后经产品UI关闭MITM、移除源站例外、保留共享CA及系统信任，正常退出恢复系统代理，关闭Edge、
	Playground与两代Electron，验证Main/Core/8888/Playground端口和系统副作用全部收敛。

### 预期效果

三项query Tool只复用共享registry和正式Core命令。正文必须属于目标Exchange并使用可信MIME/encoding；WebSocket
和gRPC按各自方向/side稳定分页。Settings关闭立即从discovery/schema移除并阻止执行，重启不重放任何调用。
本workflow只为三个Tool自产代表性输入，不等同于后续Capture对Playground 39项场景的完整收敛。

### 验收要求

- Unit Red：owning executor测试先精确失败于WebSocket/gRPC成功命令映射缺失，Agent adapter测试失败于三项Tool
	未发现/未披露/不可执行；Renderer测试失败于三类结构化摘要缺失。
- E2E Red：在业务实现前运行同一workflow，Playground流量与Capture行成功产生，但首个新Tool Call公开状态因
	Agent未注册而失败；不得把selector、TLS、UAC、build或fixture错误当作Red。
- Green：同一workflow完成三项真实Tool能力调用（正文含两段range）、Provider history与Transcript断言、关闭/恢复、跨重启零重放，
	并验证CA、源站例外、系统代理、Main/Core、8888和Playground端口完整恢复。

<a id="agent-tools-execution-modes"></a>
## `agent.tools.execution-modes`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile与脚本化lab，通过产品Settings配置Provider并新建Chat；确认Session执行模式默认为`ask`，
	新Chat不会继承另一Chat的`auto`。
2. 经产品UI开始Recording；让Model discovery后调用`capture_stop_recording`，确认Turn持久化为
	`waiting-for-tool-approval`，Transcript原位展示Tool、参数、影响与Allow/Deny，Core在裁决前仍为recording。
3. pending期间切到`auto`，确认该问询仍在且未执行；切回原Chat后Deny，确认Tool Result为`tool_denied`、Model
	得到配对Result并继续，Recording不变。
4. 再次让Model调用`capture_stop_recording`并Allow；确认批准后使用同一call ID执行正式`stopCapture`入口，Capture进入paused，
	已裁决按钮不能重复提交。
5. 通过UI恢复Recording，将当前Session切换为`auto`；再次调用`capture_stop_recording`，确认不出现问询且直接经同一正式入口
	进入paused。query Tool在两种Mode下均不出现问询。
6. 再次恢复Recording并在Settings关闭`capture_stop_recording`的Agent开关；即使Session仍为`auto`，新discovery/schema也不含
	该Tool，猜测调用返回`unknown_tool`且Recording保持不变。
7. 正常关闭并用同一profile重启，确认原Session的`auto`与Tool关闭状态恢复且没有重放Model/Tool调用；通过UI恢复
	`ask`、重新开启Tool和Recording后完整销毁。

### 预期效果

Tool启用状态与执行模式正交：关闭永远不可调用；开启的query直接执行；开启的change在`ask`时由用户裁决，
在`auto`时直接复用正式产品意图。模式切换不处置已有pending，Allow前再次检查开关；模式和开关都不能绕过
产品校验或改变无关状态。

<a id="agent-tools-traffic-control"></a>
## `agent.tools.traffic-control`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile与脚本化lab，经产品UI配置Provider并开启Recording；产生可辨识的HTTP流量与Rule hit，选中一行并
	启用method facet，让Capture列表、Inspector、Facet和Rules hit同时持有待清理状态。
2. 在Ask模式调用`capture_start_recording`并Deny，确认返回`tool_denied`且Recording保持暂停；再次调用并Allow，确认复用正式
	`proxy.start`后Capture toggle立即同步为Recording。暂停后切换Auto再次调用，确认不出现问询并恢复Recording。
3. 先暂停Recording形成稳定storage窗口，再在Ask模式调用`capture_clear`，确认批准卡展示的Exchange/Body删除影响
	与同Turn的`capture_get_storage_status`精确一致；Deny后列表、Inspector、Facet、Rules hit和Core usage均不变，再恢复Recording。
4. 再次调用`capture_clear`并Allow，确认Core usage归零；Main发布带`clearedBefore`的reset后，Capture rows、selection、
	Inspector、Facet和Rules hit同步归零，旧事件/分页不能回填；Transcript显示归零后的storage摘要。立即再发一条流量，
	确认Recording仍开启且新行正常进入。
5. 重新产生一条流量并切换Auto，调用`capture_clear`；确认无问询且沿同一正式命令和reset事件完成清理，清空后仍能继续
	捕获。
6. 在Settings分别关闭`capture_start_recording`和`capture_clear`；新discovery/schema不包含对应Tool，猜测调用均返回
	`unknown_tool`，且Recording与usage不被改变。
7. 正常关闭并用同一profile重启，确认Tool关闭状态、第一代审批的结构化effect metadata恢复且没有重放Model/Tool调用；
	恢复Settings与Capture运行态后完成Main/Core优雅销毁、8888释放、系统代理与lab副作用恢复。

### 预期效果

两项Capture change Tool完整服从Session Ask/Auto与共享Settings开关。`capture_start_recording`复用正式Capture状态广播；
`capture_clear`的影响来自审批时的真实usage，成功后所有入口都由同一个`capture:reset { clearedBefore }`事件收敛
Renderer镜像，且不丢失清理开始后到达的新流量。

<a id="agent-tools-rules"></a>
## `agent.tools.rules`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile与脚本化Provider；通过真实Rules UI创建一级folder及其中一条启用的host/path + request-header
	rule并Apply，记录公共rule/folder ID与revision。经8888发送匹配GET，确认origin收到初始header且Rule hit为1。
2. 新建默认Ask Chat，先`discover_tools(capabilityId:'rules')`，再调用`rules_get_tree`与`rules_get_hits`；确认渐进schema包含
	当前五项Rules Tool（含`rules_export`/`rules_import`），结果中的嵌套folder/rule、revision、目标hit与typed摘要一致。
3. Ask调用`rules_replace_tree`把同一Rule header改为Deny候选；审批metadata精确显示当前/目标rule数、启用数与名称差异。
	Deny后返回`tool_denied`，revision不变，真实GET仍得到初始header。
4. 再以同一baseRevision调用并Allow；确认完整树经正式`rules.replace`写入、revision增加、结果摘要更新，真实GET得到
	Allow header且新命中可由`rules_get_hits`读取。
5. 切换Auto，用最新revision再次替换为Auto header；确认不出现问询、revision增加且真实GET得到Auto header。随后用
	旧baseRevision调用，确认返回`invalid_arguments`、不推进revision且Auto effect保持。
6. 在Settings关闭全部五项Agent开关；新discovery/schema不含Rules Tool，旧三项逐项猜测调用均返回`unknown_tool`且Rule tree/revision
	不变。
7. 正常关闭并用同一profile重启；确认Rule tree/revision、五项关闭状态及第一代审批metadata恢复，Model请求增量0。
	重新开启五项并恢复Ask，完成Main/Core优雅销毁、8888释放、系统代理与lab副作用恢复。

### 预期效果

Model只能提交严格递归且符合正式Rule联合的完整树；query直接读取权威Core状态，change服从Session Ask/Auto与共享
Settings。Deny、invalid tree、stale revision和关闭项均不改Rule；Allow/Auto只经正式replace推进revision，真实代理
effect与查询结果一致。

<a id="agent-tools-breakpoints"></a>
## `agent.tools.breakpoints`

**状态**：passed
**策略**：privileged UI

### Steps

1. 真实UI创建并Apply只匹配POST的request Breakpoint Rule；经8888发送真实请求，等待公共pending行并取得动态ID。
2. Agent discovery只披露八项Breakpoints Tool；`breakpoints_list`直接返回同一pending identity与typed snapshot。
3. Ask调用Continue并Deny，确认客户端继续等待、origin零到达；再次Allow后请求原样完成。
4. Ask调用Forward edited并Allow，确认真实origin只收到Tool声明的method/body文本改动；已解决ID在审批前返回
	`invalid_arguments`且不影响其他pending，Core执行竞态仍以`conflict`为准。
5. Auto调用Drop，确认无审批、客户端失败且origin零到达；HTTP disable/enable分别控制后续请求是否pending。
6. 经真实WebSocket UI建立连接并取得exchangeId；Agent启用message断点，真实frame形成pending，再验证Continue、
   edited text、Drop与disable的数据面结果，其他连接不受影响。
7. Settings关闭八项Agent开关；discovery移除且逐项猜测调用返回`unknown_tool`。恢复开关与Ask后完整关闭第一代App。
8. 同profile启动第二代App，确认Model请求和origin到达增量均为0，continued/edited/dropped Transcript结果恢复但
	pending为0；再次正常Close并验证两代Main/Core/Worker、客户端、8888、journal与系统代理完整恢复。

### 预期效果

Agent只能处理真实产品pending；query不问询，七项change遵守Ask/Auto。Deny、stale和关闭项零副作用，Allow/Auto
只影响指定ID；HTTP与WebSocket真实对端结果和Capture状态一致。

<a id="agent-tools-composer"></a>
## `agent.tools.composer`

**状态**：passed
**策略**：privileged UI

### Steps

1. 通过产品Settings配置本地Provider并开始Recording；测试启动真实HTTP origin与自签名TLS origin，不经产品后门。
2. Agent discovery对`composer`只披露`composer_send_request`与`composer_probe_connection`，两项均为change且schema来自共享registry。
3. Ask调用`composer_send_request`并Deny，确认HTTP origin零到达；再次调用并Allow，真实origin收到声明的method、URL query、
	header与文本body，返回指定status/header/body。Tool Result遮罩`Set-Cookie`，typed摘要与真实响应一致；Capture中无该请求。
4. Auto调用`composer_probe_connection`，确认无审批、TLS origin完成一次握手且收到0应用字节；Tool Result包含协议、cipher、ALPN
	与证书链。再探测未监听端口，返回稳定失败而不让Turn失败。
5. Auto发送由origin暂缓响应的请求；origin收到request后点击`agent.turn.stop`，确认Turn取消、真实client socket关闭、
	不产生后续Model Call；释放origin gate不得补写Tool Result或重放请求。
6. Settings关闭当前全部四项Composer Agent开关；discovery为空，原两项网络调用均为`unknown_tool`且origin/TLS计数不变；恢复开关与Ask。Collection查询/替换的实际调用由`composer.tools.collection`独立验收。
7. 完整关闭第一代App；同profile启动第二代，确认Model、HTTP origin和TLS握手增量均为0，已完成与已取消Transcript
	恢复但网络操作不重放。再次关闭并验证两代Main/Core/Worker、8888、journal与系统代理完整恢复。

### 预期效果

Agent只通过正式Core命令产生显式获批的外部网络动作。Composer请求保持直连且不污染Capture，TLS probe只握手；
Stop真实终止socket。Deny、关闭项与重启均不产生网络副作用，响应凭据与测试正文不进入trace或进程日志。

提示词、请求/响应正文、凭据header/query与URL必须在截图前审计可见DOM/输入、trace与进程日志；final screenshot只在审计通过后attach，evidence只保存布尔、计数和Provider request hash。

<a id="agent-tools-diagnostics"></a>
## `agent.tools.diagnostics`

**状态**：passed
**策略**：shared

从仓库根目录复验，不可与其他占用8888的实例并行：

```powershell
npm run test:e2e:workflow --workspace @interceptor/desktop -- diagnostics.workflow.ts
```

### Steps

1. 创建独立profile/evidence和HTTP origin；通过产品Settings配置本地Provider，等待App/Core/8888 ready。
2. 经Composer UI分别新建并发送两次带不同敏感query值的真实请求；origin确认两次到达，Diagnostics UI确认出现两组
	`core / composer.send / success`记录。不得seed Diagnostics或直接调用Core。
3. 新建默认Ask Chat；Model先`discover_tools(capabilityId:'diagnostics')`，确认只披露`diagnostics_query`，下一次
	Model request才包含该schema。
4. Model调用`diagnostics_query({ process:'core', command:'composer.send', outcome:'success', limit:10 })`；确认返回四条
	记录，每次请求各有`action.completed`与`command.completed`且共享trace；sequence严格递减，分页状态与dropped
	count有效，结果不含请求URL或敏感query值。
5. 确认query在Ask模式直接完成、没有审批卡；Transcript显示typed记录数与分页摘要。
6. 完整关闭第一代App；同profile启动第二代，确认Model请求增量为0，已完成Tool轨迹与回答恢复但不重放查询或网络请求。
7. 在Settings关闭`diagnostics_query`的Agent开关；新Chat discovery为空，直接猜测调用返回`unknown_tool`；重新开启后
	再建Chat，确认discovery恢复唯一Diagnostics Tool。
8. 保存仅含计数、顺序、协议字段与Provider request hash的脱敏evidence；关闭Panel后恢复trace，完整销毁第二代
	Main/Core/Worker、释放8888并恢复系统副作用。

### 预期效果

Agent通过共享只读Tool查询真实Diagnostics存储，不建立旁路数据源。过滤与顺序由Core权威实现；查询自身不污染日志，
Composer敏感输入不进入Model结果。Ask、Settings撤权、恢复和重启均保持既有Agent语义。
