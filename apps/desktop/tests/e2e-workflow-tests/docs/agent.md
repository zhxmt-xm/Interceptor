# Agent Workflows

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

### 证据

- 实现前 Red 依次锁定真实产品仍为 `1280×800`、Windows frameless content 高度多 `2px`，以及 `agent.panel.toggle` 缺失；Red 均来自预期产品缺口，失败后仍完整销毁。
- 当前同一 workflow `1/1` Green：Renderer content 为精确 `1600×900`；Capture、Settings Agent、Rules、Composer、Diagnostics、Capture 与重新进入 Settings 七个节点均为 `panelWidth=440`、`mainRight=panelLeft=1160`、`provider=unconfigured`。
- Main PID `11272`、Core PID `10928`、listener `8888`，`gracefulDestroyVerified=true`；Renderer page error 为 0。
- light/dark 的 Panel 与 Settings Agent 四个 parity view 合计 `30/30 matched / 0 missing / 0 flagged`，最大几何差 `0.7px`。
- `880×560` Renderer 响应式探针在展开 Sidebar + Settings Agent 下由修复前 `main=220 / panel=440 / settings=0` 收敛为 `main=440 / panel=220 / settings=162`，main 与 Panel 边界严格相接。

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

### Evidence

- 实现前有效Red精确停止在缺少 `agent.models.list`，不是selector、构建或环境失败；当前同一workflow `1/1` Green。
- lab共观察5次真实Chat Completions Test：`keyed-model`、`keyed-model-v2`与第一次`keyed-model-edited`均有Authorization，`keyless-model`及显式移除已存Key后的第二次`keyed-model-edited`无Authorization；evidence只保存presence与body hash，重启自动请求数为0。
- 第一代与第二代Provider ID顺序完全一致；第二行default跨重启恢复，依次删除default与最后一项后确定性回退并返回未配置态。
- 第一代Main/Core PID为`16136/30948`，第二代为`18864/44704`；两代均为`gracefulDestroyVerified=true`，listener `8888`释放。三段trace与两代Main/Renderer日志均通过运行期随机测试Key全文扫描。

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

### Evidence

- 当前workflow `1/1` Green；事件sequence从`0`严格递增到`23`，五次真实Model请求中第四次在可见delta后被Stop并由lab观测为aborted，第五次Retry复用同一request body hash且完成。
- 多轮请求message count按`1 → 3 → 5`增长；Retry仍为`5`，没有重复user item。reasoning与assistant正文分离展示，Usage只记录Provider已报告的逐Call事实。
- Main/Core PID为`36412/7948`，`gracefulDestroyVerified=true`，listener `8888`释放；trace分段、Main/Renderer日志及脱敏lab evidence均通过敏感文本扫描。

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

### Evidence

- 当前workflow `1/1` Green；第一代完成3次Model请求，第二代启动新增请求为0，切回Chat A发送follow-up后总数为4。
- 两个Session ID与重启前后Transcript hash稳定恢复；Chat A/B选择、独立历史、Rename、Delete与新建空Chat C均只影响目标Session。
- 第一代Main/Core PID为`19804/15832`，第二代为`31668/27112`；两代均`gracefulDestroyVerified=true`并释放8888，分段trace与日志通过敏感文本扫描。

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

### Evidence

- 实现前真实Electron精确Red于`agent.tools.capabilities`不存在；实现后同一workflow `1/1` Green。
- fresh profile显示Capture、Rules、Composer、Breakpoints、Diagnostics五组24行和48个默认开启Switch；
	`capture_get_proxy_status`仅关闭Agent列，`rules_replace_tree`仅关闭MCP列；
	搜索、Settings往返不改变状态。第一代业务状态前后均为`recording=true / rules revision=0 / system proxy=owned`。
- 第一代关闭两项，第二代同profile恢复后重新开启，第三代再次启动时48项全开，证明空关闭集不依赖持久文件。
- 三代Main/Core PID分别为`31716/32188`、`13204/27660`、`29192/30064`；每代
	`gracefulDestroyVerified=true`，最终8888释放。
- feature命名切换后同一workflow再次`1/1` Green：24行严格按五组顺序出现，组automation ID分别为
  `capture/rules/composer/breakpoints/diagnostics`，48个开关与两次重启恢复保持；旧无前缀名称零行。

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

### TDD证据

- Red：实现前同一workflow的真实Provider、Capture与Agent链路运行成功，`call-storage`公开状态精确为`failed`；
	metadata仍记录Main/Core优雅销毁，证明失败来自Agent未注册`capture_get_storage_status`。
- Green：同一workflow `1/1`通过，最终一次真实`capture.status`返回`1 session / 3 exchanges / 1 body / 92 B`；六个字段
	完整进入Provider history，Transcript公开摘要属性与结果一致，query未出现审批。
- 重启后Model请求增量为0；关闭`capture_get_storage_status`后discovery/schema移除该Tool，猜测调用返回`unknown_tool`，
	重新开启后恢复。两代Main/Core PID为`20596/42100`与`44412/12224`，均
	`gracefulDestroyVerified=true`；Renderer page error为0，最终8888释放且系统代理恢复。

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
5. 经产品Certificates UI生成并安装CA、添加`localhost`源站例外并开启HTTPS解密；再从正式Playground运行
	`grpc-unary-json`。Model调用`capture_list_grpc_messages`读取request与response两侧，验证recognized、body metadata、
	envelope offset/length、compressed/truncated标志和分页结果；payload字节继续通过正文range读取，不由该Tool复制。
6. 确认首次Model request仍只有Capability Index与`discover_tools`；成功discovery后的request才披露三项新schema。
	每项Tool Call/Result保持call ID配对，query在Ask/Auto下均不出现审批。
7. Transcript依调用顺序显示正文range、WebSocket消息和gRPC消息的结构化摘要与公开证据属性；下一次Provider
	request包含三项未被UI摘要裁剪的完整、已脱敏Tool Result。
8. 正常关闭并用同一profile重启，确认Transcript与三项Tool轨迹恢复，启动期间Model和Tool请求增量均为0。
9. 在Settings关闭三项Agent开关，新Chat discovery与schema不再包含它们；分别猜测调用均返回`unknown_tool`。
	重新开启后恢复。最后经产品UI关闭MITM、移除源站例外、卸载并删除本轮CA、恢复系统代理，关闭Edge、
	Playground与两代Electron，验证Main/Core/8888/Playground端口和系统副作用全部收敛。

### 预期效果

三项query Tool只复用共享registry和正式Core命令。正文必须属于目标Exchange并使用可信MIME/encoding；WebSocket
和gRPC按各自方向/side稳定分页。Settings关闭立即从discovery/schema移除并阻止执行，重启不重放任何调用。
本workflow只为三个Tool自产代表性输入，不等同于后续Capture对Playground 39项场景的完整收敛。

### TDD证据要求

- Unit Red：owning executor测试先精确失败于WebSocket/gRPC成功命令映射缺失，Agent adapter测试失败于三项Tool
	未发现/未披露/不可执行；Renderer测试失败于三类结构化摘要缺失。
- E2E Red：在业务实现前运行同一workflow，Playground流量与Capture行成功产生，但首个新Tool Call公开状态因
	Agent未注册而失败；不得把selector、TLS、UAC、build或fixture错误当作Red。
- Green：同一workflow完成三项真实Tool能力调用（正文含两段range）、Provider history与Transcript断言、关闭/恢复、跨重启零重放，
	并验证CA、源站例外、系统代理、Main/Core、8888和Playground端口完整恢复。

### TDD证据

- Unit Red：Agent discovery/执行与Renderer摘要共4项精确失败；实现后Desktop聚焦12/12 Green。Tools owning
	新增WebSocket/gRPC成功命令映射并为13/13 Green；15语言Agent资源10/10 Green。
- E2E Red：业务实现前正式Playground先成功产生`body-json`与`ws-bidirectional`，随后Agent discovery精确只返回
	旧5项，缺少三项新Tool；Main/Core优雅销毁且8888释放，是有效行为Red。
- 接线后正文range与WebSocket全部/单方向真实Tool Call先成功；gRPC输入前置的正式H2链路在Electron
	UtilityProcess中失败，Core记录secure h2 exchange为aborted、response 0 B。
- 根因证据：临时关闭`simulateConnectionErrors`后，同一真实链路返回502；再由Agent `capture_get_exchange_body`读取到
	`OPENSSL_internal:INVALID_COMMAND`。Mockttp对`ignoreHostHttpsErrors`追加OpenSSL专用`@SECLEVEL=0`，Electron
	TLS运行时不支持。诊断探针已撤回，产品透明连接错误语义、CA、系统代理、进程和8888均恢复。
- Developer于2026-09-02明确批准扩展`patches/mockttp+4.5.0.patch`；最终补丁只在Electron运行时省略
	`@SECLEVEL=0`，Node/OpenSSL路径保持，源站例外仍为`rejectUnauthorized: false`。补丁Unit 2/2、H2 integration
	6/6与干净npm包patch apply检查均Green。
- 最终同一workflow`1/1` Green：正文30 B、WebSocket 3条、gRPC request/response各1条；三项关闭后均返回
	`unknown_tool`，重启Model请求增量0。干净Mockttp 4.5.0只应用仓库patch后同一E2E仍Green；最终两代Main/Core为
	`22044/2088`与`38676/35912`，均`gracefulDestroyVerified=true`。完整Prompt/回答在两代trace与进程日志中均为
	0命中；CA、localhost例外、MITM、系统代理、8888与Playground端口全部恢复。
- 提交前复审新增Red：Core解码路径忽略明文range、非gRPC结果误显示为0条完成、Parity参数不满足schema、
	失败代可能在审计前截图或因单步异常跳过后续清理。修复后Proxy聚焦27/27、Agent聚焦22/22和同一E2E Green；
	正文由10 B第一页（`end=false`）与20 B末页（`end=true`）重组为完整30 B，失败代不截图并聚合执行全部审计/销毁步骤。

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

### Evidence

- 实现前Runtime/Session聚焦测试5项精确Red于默认mode、authorization gate、pending状态和公开方法缺失；Desktop
	聚焦测试3项精确Red于`capture_stop_recording`接线与Renderer intent缺失。真实workflow再精确Red于Session根没有默认Ask。
- 当前同一workflow`1/1` Green：新Chat固定Ask；pending切Auto、跨Rules/Capture与Chat切换均不自动裁决；Deny返回
	`tool_denied`且Recording不变，Allow与Auto分别经正式`proxy.setRecording(false)`暂停Recording；关闭项返回
	`unknown_tool`且不改变Recording。
- 同一profile重启后原Session Auto与Tool关闭项恢复，启动Model/Tool请求增量为0；最终两代Main/Core PID为
	`42872/36244`与`28784/8940`，均`gracefulDestroyVerified=true`，最终8888释放。

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

### Evidence

- Runtime动态effect先Red于`describeEffect`调用0次；Desktop Agent先有3项Red于discovery缺项/Tool不存在，MCP
	reset先Red于回调0次，Renderer先Red于共享reset入口不存在。最终Runtime`121/121`、Desktop`397/397`、
	全workspace typecheck Green；Proxy Core仍仅父提交已登记的chunked framing 2项失败，其余319项通过。
- 同一workflow字节级放入父提交`4da20a1e`的detached worktree后，Session在`capture_start_recording`后直接`completed`、
	未进入预期审批，取得有效行为Red；失败代Main/Core `34956/20616`优雅销毁，8888释放且敏感证据审计通过。
- 当前同一workflow`1/1` Green：start与clear各自Ask Deny/Allow和Auto通过；最终动态effect metadata显示
	19个Exchange/1个Body并与同Turn storage精确一致，重启后原值恢复；Allow后的proxy/storage typed摘要通过。
	两次Deny均为`tool_denied`，两项关闭后均为`unknown_tool`。
- Clear后rows、Inspector、method facet与Rule hit原始DOM同步为`0/0/0/0`，随后真实GET继续进入Capture；cutoff后的
	现有流量保留与乱序旧reset幂等由Capture Store unit锁定。产品按钮既有`capture.clear-facets`也`1/1` Green。
	重启Model请求增量0；最终两代Main/Core为
	`17868/32476`与`41868/39536`，均`gracefulDestroyVerified=true`并释放8888、恢复系统代理。
- 结果行design interaction`67/67`；完整parity为`200 views / 1,374 targets / 1,342 matched / 32既有missing /
	303既有flagged`，本轮结果行明暗`12/12`与Traffic/body四视图`38/38`均0 missing、0 flagged。Windows package与
	artifact audit（1,294 files / 392,792,364 bytes）、production audit 0漏洞和
	packaged smoke`1/1`通过。

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

### Evidence

- 2026-09-06 Rules Export扩展后，同一workflow按四项目录、全组撤权与重启恢复复跑`1/1` Green；Main/Core
	`2432/16356`、`4960/28640`均正常销毁、释放8888并恢复宿主。证据归档于TEMP下
	`interceptor-rules-export-existing-agent-rules-green`；新导出自身的Agent/MCP实操见`rules.tools.export`。
- 同日Rules Import扩展后，五项目录、全组撤权和恢复再通过`1/1`，Main/Core `44740/14364`、`26496/28060`
	均正常销毁；证据保留于`interceptor-rules-import-combined-first-run`，该归档中的后续Export焦点失败不属于此workflow。
- Owner Red精确失败于schema无`$defs`且7类非法树先触达`rules.get`；Agent Red为Rules discovery空数组与
	`rules_replace_tree`不存在，摘要Red退化为原始JSON；Rules revision回调与Renderer同步分别Red于0次/入口不存在；
	复审再Red于stale revision仍生成审批摘要及设计结果态使用错误DOM属性。
- 父提交`1234ea9a`在源码、workspace链接和npm依赖均隔离的detached worktree运行同一workflow，第二次Model request
	只有`discover_tools`而缺三项Rules schema，取得有效行为Red；失败代Main/Core `37404/8912`优雅销毁并释放8888。
- 当前同一workflow`1/1` Green：真实UI创建folder/rule，完整matcher/action/priority由`rules_get_tree`返回；初始hit为1，
	Deny保持初始effect，Allow/Auto令revision `1→2→3`并由真实origin header验证，stale返回`invalid_arguments`；
	三项关闭后discovery为空且均返回`unknown_tool`，重启恢复Rule、审批metadata、Auto/开关且Model请求增量0。
- `mcp.desktop.streamable-http`补充同一共享入口的外部同步证明：父提交`1234ea9a`中MCP替换已成功但Renderer仍为
	revision 1，取得有效Red；当前官方Client Auto `rules_get_tree → rules_replace_tree`令Renderer与origin同步到revision 2，
	重启恢复同一Rule并再次验证真实origin effect。两代Main/Core为`38740/43808`与`26768/39376`，均完整销毁且
	Renderer pageerror为0。
- Map Local真实路径由owner测试证明不会离开Core，任意路径、新建占位或借占位修改matcher/enabled/priority/action
	均无法触达replace；只有未变Rule可连同路径跨folder移动。Rules Store `30/30`覆盖保存期间编辑、普通/外部load乱序、
	dirty/saving冲突、最高revision及显式Reload不得回退已观察revision且必须结束loading。最终Tools`43/43`、Desktop`410/410`、
	Runtime`121/121`、MCP`30/30`、design interaction`68/68`与全workspace typecheck Green。
- 最终Agent两代Main/Core为`31464/7148`与`11940/44028`，均`gracefulDestroyVerified=true`，Renderer pageerror为0且
	8888/系统代理恢复。完整parity为`204 views / 1,404 targets / 1,370 matched / 34既有missing / 304既有flagged`；
	Rules新增query/result明暗4 views合计`30/30 matched / 0 missing / 0 flagged / 0px`。Windows package、artifact audit
	（1,294 files / 392,804,000 bytes）、production audit 0漏洞与packaged smoke`1/1`通过。

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

### Evidence

- 最终workflow在修复前提交`32f2889a`的detached worktree精确Red：真实Agent discovery对`breakpoints`返回`[]`，
	与预期八项不符；不是selector、fixture、构建或环境失败。
- 当前同一workflow`1/1` Green：HTTP Ask Deny/Allow、stale、method/body编辑、Auto Drop与启停均由真实客户端/origin
	验证；WebSocket覆盖连接隔离、Continue、文本编辑、Drop和Disable；八项关闭后均为`unknown_tool`。
- 重启在ready后与关闭前两次确认Model、HTTP origin与WebSocket消息增量均为0；提示词、HTTP/WebSocket正文和动态
	Rule/Breakpoint/exchange ID均通过trace与进程日志脱敏审计；最终两代Main/Core为`31388/16116`与
	`29116/20280`，均
	`gracefulDestroyVerified=true`，Renderer pageerror为0且8888、journal和系统代理恢复。
- Breakpoints Agent明暗设计场景合计`22/22 matched / 0 missing / 0 flagged / 0px`；既有44张Agent设计图逐像素
	不变。完整Parity为`206 views / 1,426 targets / 1,396 matched / 30既有missing / 304既有flagged`。

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
6. Settings关闭两项Agent开关；discovery为空，逐项猜测调用均为`unknown_tool`且origin/TLS计数不变；恢复开关与Ask。
7. 完整关闭第一代App；同profile启动第二代，确认Model、HTTP origin和TLS握手增量均为0，已完成与已取消Transcript
	恢复但网络操作不重放。再次关闭并验证两代Main/Core/Worker、8888、journal与系统代理完整恢复。

### 预期效果

Agent只通过正式Core命令产生显式获批的外部网络动作。Composer请求保持直连且不污染Capture，TLS probe只握手；
Stop真实终止socket。Deny、关闭项与重启均不产生网络副作用，响应凭据与测试正文不进入trace或进程日志。

### Evidence

- Agent实现前，同一最终workflow启动真实Electron后精确Red于Composer discovery返回`[]`；修复前owner integration
	进一步精确Red于H1与TLS在Abort后仍等到timeout。当前H1/H2/TLS真实网络integration `8/8`、TLS预取消零
	`tls.connect` unit `1/1` Green。
- 当前`agent.tools.composer` `1/1` Green：Ask Deny/Allow、method/query/header/body真实origin事实、响应header/query
	脱敏、Capture零新增、TLS成功/失败、Stop关闭真实socket、两项`unknown_tool`与重启零网络全部通过。
- 业务证据`directRequestVerified/tlsProbeVerified/cancelledSocketVerified=true`、`restartNetworkRequestCount=0`；
	两代Main/Core为`11120/16796`与`29936/34788`，均`gracefulDestroyVerified=true`，8888、journal和系统代理恢复。
- 提示词、请求/响应正文、凭据header/query与URL均经截图前可见DOM/输入、trace与进程日志敏感审计；final screenshot
	只在审计通过后attach，evidence只保存布尔、计数和Provider request hash。明暗Requests parity合计
	`20/20 matched / 0 missing / 0 flagged / 0px`，既有46张Agent设计图逐像素
	不变。完整Parity为`208 views / 1,446 targets / 1,412 matched / 34既有missing / 305既有flagged`。

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

### Evidence

- Unit Red：Agent discovery返回空matches，Renderer摘要返回原始JSON；共享executor正向测试基线Green。
- E2E Red：Agent接线前精确失败于第二次Model request没有`diagnostics_query`；最终修订workflow又在父提交
	`401af972`的detached worktree得到同一行为Red，Main/Core `11540/18252`优雅销毁且释放8888。
- 当前字节相同workflow `1/1` Green：四条action/command记录按sequence严格递减并归属两个trace，敏感URL/query
	不进入Model结果；Ask无审批，关闭后`unknown_tool`，重新开启恢复discovery。重启Model与origin请求增量均为0。
- 两代Main/Core `11444/35300`、`42312/18808`均`gracefulDestroyVerified=true`，Worker随Core退出，8888释放，
	宿主guard恢复系统副作用。`agent-tool-diagnostics.json`、trace、截图与进程日志通过完整敏感文本审计后再attach。
- 设计与产品明暗parity为`18/18 matched / 0 missing / 0 flagged / 0px`，不替代上述真实Electron证据。
