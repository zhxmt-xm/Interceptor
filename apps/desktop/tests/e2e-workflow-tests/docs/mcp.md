# MCP Workflows

本文件定义外部MCP Host接入Interceptor Desktop的真实E2E流程。测试端只充当标准MCP Client，通过产品UI
创建的配置连接Main公开的loopback Streamable HTTP endpoint；不得直接构造Client记录、读取加密Store、调用
Main测试后门或绕过Renderer操作。Token只在暂停trace期间从产品「复制配置」结果中取得，evidence只保存hash。

<a id="mcp-browser-playground-cors"></a>
## `mcp.browser-playground-cors`

**状态**：passed
**策略**：shared

### Steps

1. 通过真实产品UI开启MCP并创建默认Ask的Client；暂停trace后Copy config，只在测试内存保留Token。
2. 从真实Browser origin向`/mcp`发送preflight，确认`204`、原样允许Browser声明的method/header且不要求Bearer。
3. Browser使用无Token和错误Token发送实际请求，均确认`401`且Browser可读取状态，Core无业务命令。
4. Browser使用正确Bearer和固定`2026-07-28`官方Client完成discover与`tools/list`，确认当前24项可见。
5. Browser调用`get_proxy_status`并读取真实Core状态；调用`stop_recording`后在Interceptor真实Modal中Deny，
   再次调用并Allow，分别确认无副作用与正式Recording停止。
6. 关闭Browser与App，确认在途调用、审批、MCP端口、8888、Main/Core/Worker与系统代理全部收敛。

### 预期效果

Origin与Host都不作为身份。任意Browser origin只有持有产品创建的有效Bearer才能调用；无Token仍不可读取Tool或
业务数据。listener继续只绑定loopback，错误path仍由路由返回404；Bearer通过后的旧协议由官方SDK拒绝。

### Evidence

- 实现前真实系统Edge在`server/discover`的preflight后以`TypeError: Failed to fetch`取得有效Red；当前同一workflow Green；
- integration锁定CORS preflight与实际response headers；真实Browser锁定最新协议、24项Tool、query、Deny/Allow及Recording前后态；
- Token只保存hash，trace、截图与日志不含明文；
- Main/Core PID、MCP/8888释放、系统代理恢复与`gracefulDestroyVerified=true`。

<a id="mcp-desktop-streamable-http"></a>
## `mcp.desktop.streamable-http`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立空profile和两代evidence；启动第一代trace与真实Electron，不启动Model lab。等待App/Core/8888/
   readiness后点击`capture.readiness.cancel`，确认MCP默认关闭且没有MCP listener。
2. 进入Settings > Agent，确认MCP Server区显示关闭、无endpoint和无Client；点击正式Enable入口。确认Main只在
   `127.0.0.1`分配空闲高位端口，公开状态显示`http://127.0.0.1:<port>/mcp`且端口不为`8888`。
3. 通过产品UI创建名为`VS Code E2E`的Client，确认默认模式为`ask`。暂停trace，点击该Client的Copy config，
   从系统剪贴板读取标准HTTP MCP配置并恢复trace；只保存URL、token SHA-256与配置结构，不保存token明文。
4. 测试侧使用正确Bearer和固定当前`2026-07-28`协议的官方Client连接；无Token、错误Token、Browser CORS与
   Main auth-only边界由integration及`mcp.browser-playground-cors`覆盖。Server不提供旧协议兼容路径。
5. 在Settings关闭`get_proxy_status`的MCP开关，经已连接Client调用`tools/list`，确认24项共享registry中只缺该项，
   Agent开关不变；猜测调用同名Tool得到不存在结果且Core未执行。重新开启后再次`tools/list`，确认该项恢复。
6. 用产品UI开始Recording；真实MCP Client调用query Tool `get_proxy_status`，确认同一个POST直接返回JSON，结果
   来自当前Core且不出现审批。调用change Tool `stop_recording`，保持HTTP请求在途，确认Main显示App级审批弹层，
   调用方、Tool、参数与Effect完整可见且Recording尚未改变。
7. 关闭该外部Client，确认在途调用取消、审批弹层自动消失且Recording保持；重新连接后再次调用并点击Deny，
   确认返回结构化`tool_denied`且Recording保持。第三次调用点击Allow，确认正式Recording入口
   停止捕获、Capture UI同步且同一调用只执行一次。通过产品UI恢复Recording。
8. 将`VS Code E2E`切换为`auto`，再次调用`stop_recording`，确认无审批弹层并直接停止Recording；query/change均
   写入不含Token的Diagnostics审计。通过产品UI恢复Recording，保存第一代trace、截图和销毁证据后正常关闭App。
9. 保留profile和测试内存中的首代token，用同一profile启动第二代Electron；确认MCP仍开启、endpoint完全相同、
   Client与`auto`恢复，并且旧配置无需修改即可重新initialize、`tools/list`和调用`get_proxy_status`。
10. 在产品UI点击该Client的Regenerate credential。确认旧token后续请求返回`401`且该Client在途调用取消；暂停trace
    再次Copy config并只记录新token hash，确认hash已改变且新token可建立Session。其他Client若存在不得受影响。
11. 撤销测试Client并关闭MCP，确认listener、SDK handler和在途调用全部消失，但Proxy Core的`8888`生命周期不受影响；
    保存两代状态、HTTP事实、Tool结果、审批、token hash、final screenshot、trace、Main/Renderer日志与metadata。
12. 点击`shell.window.close`，验证Main、Renderer、Core、Worker全退，MCP端口与8888均释放且
    `gracefulDestroyVerified=true`；删除profile。

### 预期效果

外部Host通过Desktop Main的loopback Streamable HTTP访问同一份产品状态。HTTP认证、MCP Tool开关与Client
`ask`/`auto`相互正交；app重启不轮换token，只有用户显式重新生成或撤销才让旧凭据失效。MCP失败、断连、
认证拒绝和审批等待都不影响抓包转发，关闭MCP不会关闭Proxy Core或修改系统代理。

本workflow保留原生Host链路；Browser CORS由`mcp.browser-playground-cors`独立覆盖。SSE响应形态由独立transport
integration test覆盖进度/多消息分帧，本workflow至少验证一个等待审批的在途HTTP调用能够在用户裁决后返回最终结果。

测试侧使用官方`@modelcontextprotocol/client` runtime并固定当前`2026-07-28`协议，角色等同于VS Code等
Host内部的MCP Client模块。它不启动或模拟第三方Host UI；否则测试结果会依赖VS Code/Claude自身界面与配置
生命周期，而不能精确证明Interceptor的HTTP、认证、Tool与Core链路。

### Evidence

- 实现前取得由公开MCP Server控制缺口导致的真实Electron Red，不以缺selector、fixture、构建或端口冲突冒充。
- Green记录两代Main/Core PID、MCP endpoint、token hash变化、当前协议版本、HTTP状态、Tool集合、审批结果、
   `gracefulDestroyVerified`、MCP端口/8888释放和系统代理恢复。
- trace、截图、日志与metadata不得包含Bearer token、加密Client记录、Capture敏感正文或Host配置绝对路径。