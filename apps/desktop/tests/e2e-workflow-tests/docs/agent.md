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

**状态**：planned
**策略**：shared

### Steps

1. 创建独立空 profile/evidence 与两个具有不同 Model ID、Context Window 和 Usage 响应的本地 OpenAI-compatible lab endpoint；启动 trace/Electron。
2. 等待 App/Core/8888/readiness；点击 `capture.readiness.cancel`，进入 Settings > Agent，确认空的 `Configured models` 状态和 Add model 命令。
3. 打开 Custom Provider Dialog，确认 Profile name、Base URL、API Key、Model ID、Context Window、Maximum Output 均为空，六个 FieldControl 高度一致，未 Test connection 时 Save disabled。
4. 填入第一个 endpoint 与可选测试 key；点击 `agent.provider.test-connection`，确认 lab 收到真实兼容请求且 UI 显示成功，再点击 Save。证据只记录 key 是否存在和脱敏尾号。
5. 重复产品 UI 配置第二个 endpoint；确认唯一 `Configured models` 列表出现两行，每行包含 Provider Logo、Model ID、Connected、metadata、Edit 与默认状态命令。
6. 确认第一行的 `Default` 是非交互状态，不具有 button role；点击第二行 `Set default`，确认默认状态只移到第二行并持久化，列表没有重复或重排。
7. 打开 Agent Panel 的 Model Select，确认只列两项已配置模型、当前默认项 selected、已知 Provider 使用品牌 Logo、未知 Provider 回退 Bot；选择第一项只改变当前 Chat 的模型，不改全局 default。
8. 从 Model Select 点击 `Agent settings…`，确认 Panel 不关闭；编辑第一项的 Model ID 并重新 Test connection/Save，随后用正式 Remove/confirm 删除第二项，确认剩余项成为唯一 default。
9. 保存脱敏 model configuration、default/current model 正交状态、Logo mapping、Dialog validation、trace、final screenshot、日志与 metadata；不得记录 key、Authorization header 或完整响应正文。
10. 点击 `shell.window.close`，验证所有 App 进程与 8888 销毁；关闭两个 lab endpoint并删除 profile。

### 预期效果

Settings > Agent 是 Provider/模型配置的唯一入口；Test connection 是 Save 的前置；`Default` 是状态，`Set default` 才是命令；全局默认模型与当前 Chat 模型正交且配置安全持久化。

<a id="agent-chat-streaming-context"></a>
## `agent.chat.streaming-context`

**状态**：planned
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

<a id="agent-chat-restart-recovery"></a>
## `agent.chat.restart-recovery`

**状态**：planned
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