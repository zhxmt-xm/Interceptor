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
5. 从 UI 读取 Current Context Window Usage 圆环和 `current / max`，确认精确等于 lab capability/usage；展开 Session Usage，确认 input cache hit、cache miss、output、total、加权 rate 与 coverage 对应第一轮事实。
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
2. 无需配置Provider，确认`agent.tools.capabilities`存在，四组共24行且每行有Agent/MCP两个Switch；只列共享
	registry中已经实现的Tool，不展示架构目录里尚未开发的目标项。
3. 首次启动48个Switch全部开启；关闭`get_proxy_status`的Agent开关，不改变同一行MCP开关或其他Tool；
	关闭`apply_rules`的MCP开关，不改变同一行Agent开关。
4. 用真实搜索框过滤到`query_diagnostics`，确认隐藏/恢复行不会改变开关；离开Settings并返回，确认两项关闭状态保持。
5. 对比操作前后的Capture recording、Rules revision与系统代理状态，确认能力开关没有改写任何业务状态。
6. 正常关闭并用同一profile重启，确认两项关闭状态恢复；重新开启两项并再次重启，确认恢复为全部开启，
	证明关闭名称已从持久配置移除且未来新增Tool仍会默认开启。
7. 保存24个`agent.tools.row.<toolName>`、48个公开switch状态、搜索、两次重启恢复、trace与每代销毁证据；
	不通过测试API读取或注入设置文件。

### 预期效果

Settings列表由共享registry驱动。Agent与MCP开关默认开启、互不影响，只决定对应入口是否注册Tool，不改写
业务状态，也不提前展示未实现能力。本workflow只验收Settings与持久化；Agent仍不注册业务Tool，MCP仍不接Desktop。

### Evidence

- 实现前真实Electron精确Red于`agent.tools.capabilities`不存在；实现后同一workflow `1/1` Green。
- fresh profile显示四组24行和48个默认开启Switch；`get_proxy_status`仅关闭Agent列，`apply_rules`仅关闭MCP列；
	搜索、Settings往返不改变状态。第一代业务状态前后均为`recording=true / rules revision=0 / system proxy=owned`。
- 第一代关闭两项，第二代同profile恢复后重新开启，第三代再次启动时48项全开，证明空关闭集不依赖持久文件。
- 三代Main/Core PID分别为`31716/32188`、`13204/27660`、`29192/30064`；每代
	`gracefulDestroyVerified=true`，最终8888释放。

<a id="agent-tools-traffic-discovery"></a>
## `agent.tools.traffic-discovery`

**状态**：planned
**策略**：shared

### Steps

1. 创建独立profile和本地OpenAI-compatible lab；通过Settings真实配置Provider。
2. 经产品UI开始Recording，并让workflow fixture通过真实代理产生至少一条唯一HTTP exchange；不seed Capture或Agent Store。
3. 打开Agent并发送要求查询当前代理和该exchange的消息；lab依次产生`discover_tools`、`get_proxy_status`、`list_exchanges`与`get_exchange`调用。
4. 确认首次Model request只含Capability Index与`discover_tools`，discovery后才向后续request披露匹配schema。
5. 确认Transcript按顺序显示Tool Call、参数和结果摘要，最终回答引用真实exchange ID、method、URL与status。
6. 在Settings关闭`get_exchange`的Agent开关，新建Chat再次discover，确认目录与schema都不再包含该Tool，直接调用返回未知Tool且不产生产品命令；重新开启后恢复。
7. 保存脱敏lab请求、Tool事件sequence、Capture事实、trace与销毁证据；关闭lab并删除profile。

### 预期效果

Agent通过共享Capability Index渐进发现已开启Tool，并查询同一真实Core中的Traffic；Settings关闭项既不可发现
也不可调用。三个query Tool直接执行，不出现change问询。

<a id="agent-tools-execution-modes"></a>
## `agent.tools.execution-modes`

**状态**：planned
**策略**：shared

### Steps

1. 创建独立profile与脚本化lab，配置Provider并新建Chat；确认Session执行模式默认为`ask`。
2. 让Model调用`stop_recording`；确认Turn持久化等待状态，UI展示Tool、参数和影响，Core在用户裁决前仍为recording。
3. 拒绝调用，确认Tool Result为拒绝且Recording不变；再次调用并允许，确认产品正式stop入口执行且Capture进入paused。
4. 通过UI恢复Recording，将当前Session切换为`auto`；再次调用`stop_recording`，确认不出现问询且同一正式入口执行。
5. 将`stop_recording`的Agent开关关闭，即使Session仍为`auto`，确认Tool不可发现、不可调用且Recording保持不变。
6. 正常关闭并重启，确认Session的`auto`模式与Tool关闭状态恢复；通过UI恢复默认与Recording，完成销毁。

### 预期效果

Tool启用状态与执行模式正交：关闭永远不可调用；开启的query直接执行；开启的change在`ask`时由用户裁决，
在`auto`时直接复用正式产品意图。模式和开关都不能绕过产品校验或改变无关状态。
