# MCP Workflows

本文件定义外部MCP Host接入Interceptor Desktop的真实E2E流程。确定性回归使用官方MCP Client，
`current-host`使用当前开发Agent所在的真实Host；两者都使用产品UI创建的配置，不直接构造Client记录、
读取加密Store、调用Main测试后门或绕过Renderer操作。Token只在暂停trace期间从产品「复制配置」
结果中取得，evidence只保存hash。

## 当前开发Agent的真实Host验收

此流程由正在开发本仓库的Agent执行，不在Playground增加模型配置、Agent Runtime或另一套MCP E2E。
下方`.workflow.ts`继续提供真实Electron的确定性回归；它们使用的官方Client不是VS Code、Claude或Codex
本身，必须与本节真实Host结果分开记录。真实Host场景还未执行时，不能仅因自动回归Green关闭Handover第9项。

### 识别当前Host与配置入口

先读取当前会话可用的身份/metadata，再核对实际使用的Host版本和MCP能力；机器上安装了某个CLI、
模型名称或Client显示名都不能证明当前会话由它承载。

| 当前Host | 配置方式 | 必须核对 |
| --- | --- | --- |
| VS Code内置Copilot Chat | VS Code的MCP配置入口；CLI有`--add-mcp`时可使用官方命令 | 当前profile、Server信任、已发现Tool；不能自动套到Copilot CLI/SDK会话 |
| Copilot CLI或VS Code内Copilot SDK会话 | 独立CLI可用`mcp-config.json`；VS Code Agent Host可通过官方AHP的root `mcpServers`及Server启动动作配置当前会话 | 读取实际Host状态和已公布的能力；只使用官方CLI公布的AHP endpoint，不访问SDK私有RPC或创建替代Agent |
| Claude Code | `claude mcp add --transport http`或其正式MCP配置 | 正确URL、Bearer、scope及当前会话实际发现的Tool，不读取IDE私有凭据 |
| Codex | `codex mcp`或其正式`mcp_servers`配置 | 当前核心版本、HTTP/Bearer配置及协议模式，不强制打开实验协议开关 |

不同Host只替换识别、配置、刷新和证据提取步骤，业务验收清单不复制。不能启动一个新的自制Agent来冒充
当前Host，也不能把直接用官方SDK发送的JSON-RPC记录成当前Agent的Tool调用。

### VS Code Copilot SDK的公开自动入口

已验证路径不依赖手动编辑JSON或Playground：

1. 通过会话metadata和`code agent ps --json`确认当前session；`code agent endpoints`提供官方AHP
   endpoint、版本与连接认证。连接token只驻留调用方内存，不输出或写入验收报告。
2. 正常认证后调用`initialize`，订阅`ahp-root://`和当前session；读取实际schema确认支持`mcpServers`。
   `dispatchAction`的`root/configChanged`合并本轮MCP配置，不覆盖其他Server或Host设置，回读确认生效。
3. Host在新SDK任务开始时加载root配置；steering消息不是新任务。读取当前session实际公布的MCP
   customization，恢复准备好的App后，对其真实id发送`session/mcpServerStartRequested`并等待`ready`。
4. 原生工具搜索和公开MCP通道分开验收。当前Host若公开`channel`及`mcpApp.capabilities.serverTools`，
   当前Agent可以通过该`mcp://`通道执行`tools/list`、`tools/call`，请求由真实Host的既有MCP连接送到App。
   不直接构造产品MCP Client，不增加Agent Runtime，也不猜未公开的channel或能力。
5. AHP `0.9.0`当前安装版将MCP路由放在`params.channel`；遵守实际协商版本的公开实现，
   不把AHP版本当成产品MCP协议版本。若Host不公布此通道/能力，不得使用它或假定通用支持。
6. 报告记录具体入口：公开MCP通道通过不代表聊天工具搜索热刷新、Host自身审批UI或其他Host通过。
   逐项记录实际调用、App裁决、origin与退出恢复；目录69项可见也不代表69项业务均已调用。
7. App通过真实UI撤销本轮Client并关闭后，对Host发送公开`session/mcpServerStopRequested`，
   再按endpoint/token hash核对移除本轮root条目。其他Server与其凭据保持原样。

官方参考：[AHP MCP管理](https://microsoft.github.io/agent-host-protocol/guide/mcp)、
[公开MCP通道](https://microsoft.github.io/agent-host-protocol/specification/mcp-channel)、
[VS Code MCP配置](https://code.visualstudio.com/docs/agent-customization/mcp-servers)。

### 完整操作顺序

1. 当前Agent运行下方unit/integration和真实Electron定向命令，保留协议矩阵的结果。它们不需要模型自行
   生成非法参数，不能因为本节使用真实模型就删除这些稳定的协议与边界断言。
2. 通过既有真实Electron driver准备独立profile、应用代际、trace和loopback origin，先保存宿主代理、
   journal、证书与进程基线；锁屏、UAC或共享端口冲突时停止，不先接管系统代理。
3. 通过App UI进入Settings > Agent，检查三版只读说明，启用MCP并创建具有明确本轮名称的Client，
   保留Ask。暂停trace后Copy config；配置只进入当前Host的正式配置入口，证据只保留token hash。
4. 当前Agent按上表配置/刷新MCP。通过Host实际披露的Tool和后续真实调用确认连接，不以配置文件写入成功
   或另一进程的`tools/list`代替。工具未进入当前会话时记录Host提示和需要的用户操作，不暗中另启会话。
5. 由真实UI和loopback origin产生本轮数据，当前Agent先调用`capture_get_proxy_status`、
   `capture_list_exchanges`、`capture_get_exchange`及正文查询，核对自产URL、状态、字节与App中同一请求。
6. 当前Agent调用change Tool：先Deny再Allow `capture_stop_recording`，确认无副作用/录制停止；
   从UI恢复Recording并切换该Client为Auto，确认相同业务无需审批。模型、Host自身审批与App的Ask/Auto
   是不同层，不能绕过任一需要的确认。
7. 按下表遍历当前平台适用的共享Tool场景。参数中的exchange、body、rule、collection、breakpoint和job
   ID来自本轮实际UI或Tool结果；文件先由同一流程产品Export再Import。不得读日常Capture或把凭据、
   私有代码、真实用户正文发送给外部模型。
8. 在App Ask仍待裁决时，从当前Host正常取消/断开，确认弹窗移除且原业务不执行；重新连接仍可查询。
   UI轮换/撤销凭据后，旧配置被拒绝且所属在途任务取消；其他Client不受影响。
9. 正常退出第一代App，验证恢复后，用同一profile启动下一代，当前Host使用原未撤销配置重连；
   endpoint、权限和已保存业务保持，之前的change不自动重放。
10. 保存当前Host类型/版本、实际协商信息（Host能提供时）、Tool目录及真实Tool调用证据，连同各场景的
    App状态、origin事实、trace、PID和恢复结果。不能把一次普通SSE结果标为中间进度SSE。
11. 从App UI撤销本轮Client并停用MCP，清理本轮Host配置条目，保留其余配置；正常退出App，
    确认Main/Core/Worker、MCP端口、8888、系统代理/journal和证书全部恢复。任何失败都保留原始证据。

### 业务场景复用

完整Tool集合来自[共享目录](../../../../../architecture/features/tool-capabilities.md)，不是手抄一个长期分叉的
Host清单。每个披露Tool分别记录`passed/failed/blocked/not-run`，平台限制、原生授权及未执行不算通过。
以下规格定义准备、操作、实际结果和恢复；当前Agent以真实MCP Tool替换测试Client调用，不复制业务实现。

| 能力组 | 复用的用户流程规格 | 必须保留的实际证据 |
| --- | --- | --- |
| Capture查询、正文与消息 | [Capture](capture.md)中的Tools、HTTP/WebSocket/gRPC流程 | 同一exchange/body ID、实际字节、分页、消息和结束状态 |
| Capture文件与任务 | [Capture](capture.md)中的Body/HAR/Archive transfer | 原生Dialog、Export后Import、完整文件、job状态及取消清理 |
| Rules | [Rules](rules.md)中的Tools查询/替换/导入/导出 | revision、UI同步、真实origin header与导入新身份 |
| Composer | [Composer](composer.md)中的Tools集合/发送/探测/transfer | 同一集合、真实请求/响应、TLS结果与原生文件 |
| Breakpoints | 本文`mcp.tools.breakpoints`及[Breakpoints](breakpoints.md)的批量Tools | 同一pending ID、Continue/edited/Drop、origin次数、无重放 |
| Diagnostics | [Diagnostics](diagnostics.md)中的Tools查询/导出 | 真实审计记录、筛选结果和脱敏文件 |
| Settings | [Settings](settings-updates.md)中的Tools场景 | 共享Main入口、UI同步、权限与系统设置恢复；Windows专属仍归Handover第8项 |

### 当前Agent执行的确定性回归命令

```sh
npm run test --workspace @interceptor/mcp-server
npm run test --workspace @interceptor/desktop -- src/main/mcp/tests src/renderer/features/settings/tests/unit/mcp-settings-store.test.ts src/renderer/i18n/tests/unit/mcp-resources.test.ts --no-file-parallelism
npm run e2e:prepare-local --workspace @interceptor/desktop
npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/mcp/streamable-http.workflow.ts workflows/mcp/protocol-support.workflow.ts --project macos
```

Windows不传`--project macos`。构建后运行真实App前必须满足宿主前提；已有Browser CORS workflow保留为
独立浏览器接入回归，不变成Playground里的另一套MCP E2E。真实Host无法连接、未配置或桌面锁定时，
记录blocked和恢复动作，不把确定性Client结果改名为真实Host证据。

<a id="mcp-current-host"></a>
## `mcp.current-host`

**状态**：当前Copilot CLI/SDK的公开MCP通道验收passed；聊天工具搜索热刷新及其他Host未验证
**策略**：真实开发Agent交互；复用同一Electron driver，不构造测试MCP Client或模型Runtime

接入分为准备与执行，避免Host重载等待依赖正在运行的App。准备通过真实UI产生Client/endpoint/凭据，
正常关闭App并验证恢复后，仅保留这个隔离profile与0600配置；此阶段不算Host调用验收通过。配置可通过
Host正式文件入口或公开AHP配置动作应用，不要求手改JSON；新Tool必须在真实Host中实际加载。

确认当前Host身份与版本后，由当前Agent先准备：

```sh
INTERCEPTOR_E2E_MCP_HOST=copilot-cli INTERCEPTOR_E2E_MCP_HOST_VERSION=1.0.73 INTERCEPTOR_E2E_MCP_PHASE=prepare npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/mcp/current-host.workflow.ts --project macos
```

Host值支持`vscode-copilot`、`copilot-cli`、`claude-code`、`codex`；版本来自当前Host实际信息，不照抄示例。
未提供Host时本交互workflow明确skip，不启动App或算通过；它不要求日常确定性全套测试连接真实模型。
`current-host-phase.json`记录准备好的`userDataDirectory`、配置路径和非秘密指纹。当前Agent按其正式
配置入口注册Server后，等待Host在允许刷新时加载；准备期间App已经退出，不持有8888、MCP端口或系统代理。
Host可以暂时显示离线，不能因此改变endpoint或轮换凭据。

使用准备记录中的隔离profile执行：

```sh
INTERCEPTOR_E2E_MCP_HOST=copilot-cli INTERCEPTOR_E2E_MCP_HOST_VERSION=1.0.73 INTERCEPTOR_E2E_MCP_PHASE=verify INTERCEPTOR_E2E_MCP_PROFILE="<准备记录中的userDataDirectory>" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/mcp/current-host.workflow.ts --project macos
```

只接受E2E临时根目录下已有的独立profile，不使用日常App profile。执行时恢复相同endpoint/Client，
通过真实Copy config重新核对凭据；当前Agent用Host公开启动/重连入口连接，不另起Agent或测试MCP Client。
失败时正常退出App、保留本轮profile以便重试；成功后真实撤销Client、停用MCP并删除profile，当前Agent
移除Host的本轮配置。不得调用私有RPC、强制重启开发Host或伪造Tool结果。

### Steps

1. `prepare`启动独立真实App/profile与trace、保护宿主基线；在Settings开启MCP并创建默认Ask的本轮Client。
2. 从真实Copy config取得配置；trace暂停期间读取Token，仅在临时profile的0600文件保存Host配置，
   保存`prepared`记录后正常退出，验证端口、代理和进程恢复；当前Agent在App关闭后据此配置Host。
3. `verify`重新启动相同隔离profile，确认MCP running、原Client与凭据保持，真实设置Ask。fixture生成唯一
   loopback请求并验证实际响应。`current-host-phase.json`中的`connect-query-then-deny-stop`
   指示当前Agent发现Tool、查询自产请求/正文，再真实调用`capture_stop_recording`；fixture真实点击Deny，
   核对Recording不变。
4. phase变为`allow-stop`后，当前Agent再次调用；fixture真实点击Allow并核对Recording停止，再通过UI恢复。
5. fixture在Settings切换该Client到Auto，发布`auto-stop`；当前Agent再次调用相同Tool，确认无App审批而录制停止。
6. fixture恢复录制并发布`exercise-tools-then-clear`；当前Agent按前节清单执行本平台适用场景和断言，
   最后真实调用`capture_clear`。fixture确认自产请求已消失且Recording仍开启。
7. fixture真实撤销本轮Client并关闭MCP，保存真实origin、UI结果、trace及Host阶段；正常关闭App并核对
   Main/Core/Worker、MCP/8888与系统设置恢复。当前Agent移除本轮Host配置条目，不覆盖其余配置。

准备阶段不等待Host调用。执行阶段单步等待最多10分钟，整个交互流程最多30分钟；超时或Host无法加载
工具时保留失败并正常退出App，不删除仍用于Host接入的隔离profile，不伪造调用结果。
phase文件只是测试驱动的进度，不是产品命令或隐藏API。只有真实Host发起调用并取得产品行为证据时，
本workflow才算通过；身份环境变量、配置文件或模型总结本身都不是连接成功证明。

本轮实际通过范围：当前Copilot Host列出69项，调用20种Tool共22次；覆盖六类业务的代表查询、
自产正文完整性与Cookie脱敏、App Deny/Allow/Auto、Composer真实POST无重放、Clear与退出恢复。
本轮从未另起模型或Agent。未调用的其余Tool、其他Host、双Host并发、Host原生工具搜索热刷新以及
正式Tool中间进度SSE不据此算通过；协议单次取消、断连、凭据轮换与重启的三版矩阵继续由
`mcp.desktop.streamable-http`及所属unit/integration提供独立证据。

<a id="mcp-settings-protocol-support"></a>
## `mcp.settings.protocol-support`

**状态**：macOS前置Red、最终Green与退出恢复已验证；Windows实机归Handover第8项
**策略**：shared

### Steps

1. 使用独立profile启动真实Electron与trace，保留当前应用语言；fixture记录宿主基线。
2. 通过公共导航进入Settings > Agent，确认MCP默认关闭。
3. 通过公共`mcp.server.protocol-support`定位只读说明，确认`2025-06-18`、`2025-11-25`、
   `2026-07-28`均可见；未配置Client或模型也不能隐藏说明，不提供版本切换器。
4. 真实点击启用Server，等待Running，核对说明仍包含三版协议。
5. 真实点击停用Server，等待Off，核对说明保持可见。
6. 保存最终截图、trace和Main/Renderer日志；由fixture正常关闭App，确认Main/Core/Worker退出、
   MCP/8888释放、完整代理/证书基线恢复，再清理profile。

### 验收要求

- 缺失说明是该流程的产品Red；构建、selector约定错误或系统授权失败不算产品Red。
- 本流程只验证产品说明及显示状态，不代替三版协议握手、真实Host或LLM调用验收。

<a id="mcp-browser-playground-cors"></a>
## `mcp.browser-playground-cors`

**状态**：passed
**策略**：shared

### Steps

1. 通过真实产品UI开启MCP并创建默认Ask的Client；暂停trace后Copy config，只在测试内存保留Token。
2. 从真实Browser origin向`/mcp`发送preflight，确认`204`、原样允许Browser声明的method/header且不要求Bearer。
3. Browser使用无Token和错误Token发送实际请求，均确认`401`且Browser可读取状态，Core无业务命令。
4. Browser使用正确Bearer和固定`2026-07-28`协议完成discover与`tools/list`，确认当前完整授权目录可见，
   包含`capture_get_transfer_job`、`capture_cancel_transfer_job`、`capture_export_body`及HAR导入/导出。
5. Browser调用`capture_get_proxy_status`并读取真实Core状态；调用`capture_stop_recording`后在Interceptor真实Modal中Deny，
   再次调用并Allow，分别确认无副作用与正式Recording停止。
6. 关闭Browser与App，确认在途调用、审批、MCP端口、8888、Main/Core/Worker与系统代理全部收敛。

### 预期效果

Origin与Host都不作为身份。任意Browser origin只有持有产品创建的有效Bearer才能调用；无Token仍不可读取Tool或
业务数据。listener继续只绑定loopback，错误path仍由路由返回404；Bearer通过后由官方SDK处理三版协议，
不因Browser来源改变协议或权限。此Browser流程仍固定2026，旧协议由各自矩阵验证。

### 验收要求

- Token只保存hash，trace、截图与日志不含明文。
- 必须确认Main/Core退出、MCP/8888释放、系统代理恢复与`gracefulDestroyVerified=true`。

<a id="mcp-desktop-streamable-http"></a>
## `mcp.desktop.streamable-http`

**状态**：三协议macOS单次取消、握手/断连/重启流程及退出恢复Green；真实开发Host独立验收
**策略**：shared

### 本轮协议矩阵

同一workflow分别以`2025-06-18`、`2025-11-25`和`2026-07-28`运行；每版独占自己的App生命周期、
profile与evidence。Client由官方SDK固定待验协议，配置仍由真实UI创建并复制，不注入Client记录。
前两版的前置Red必须来自修改前严格2026入口的协议拒绝；历史证据见Handover，不回滚当前实现补Red，
也不能把构建、selector或系统授权失败算产品Red。
最终逐版核对协商版本、Tool目录、真实业务结果、Ask/Auto、断连取消、凭据轮换、重启和完整退出恢复。
2025正常Tool结果为SDK stateless路径的SSE；2026普通结果继续为JSON，需要中间消息时才使用SSE。
普通结果采用SSE不算中间进度或真实Host验收通过。

### Steps

1. 创建独立空profile和两代evidence；启动第一代trace与真实Electron，不启动Model lab。等待App/Core/8888/
   readiness后点击`capture.readiness.cancel`，确认MCP默认关闭且没有MCP listener。
2. 进入Settings > Agent，确认MCP Server区显示关闭、无endpoint和无Client；点击正式Enable入口。确认Main只在
   `127.0.0.1`分配空闲高位端口，公开状态显示`http://127.0.0.1:<port>/mcp`且端口不为`8888`。
3. 通过产品UI创建名为`MCP workflow client`的Client，确认默认模式为`ask`。暂停trace，点击该Client的Copy config，
   从系统剪贴板读取标准HTTP MCP配置并恢复trace；只保存URL、token SHA-256与配置结构，不保存token明文。
4. 测试侧使用正确Bearer和当前矩阵项的固定协议连接，核对实际协商版本；无Token、错误Token、Browser CORS与
   Main auth-only边界由integration及`mcp.browser-playground-cors`覆盖。三版通过同一endpoint和正式SDK handler。
5. 首次`tools/list`确认当前完整共享registry可见，包含Capture任务查询/取消、Body导出及HAR导入/导出。
   在Settings关闭`capture_get_proxy_status`的MCP开关，经Client调用`tools/list`，确认该项不可见，
   Agent开关不变；猜测调用同名Tool得到不存在结果且Core未执行。重新开启后再次`tools/list`，确认该项恢复。
6. 用产品UI开始Recording；真实MCP Client调用query Tool `capture_get_proxy_status`，确认结果通过同一个POST返回，
   来自当前Core且不出现审批。按协议矩阵分别核对JSON/SSE。调用change Tool `capture_stop_recording`，保持HTTP请求在途，确认Main显示App级审批弹层，
   调用方、Tool、参数与Effect完整可见且Recording尚未改变。
7. 先只取消当前Tool调用，不关闭Client；确认审批弹层消失、Recording保持，同一Client仍能查询。
   再发起一次Ask并关闭该外部Client，确认在途调用取消、审批弹层自动消失且Recording保持；重新连接后再次调用并点击Deny，
   确认返回结构化`tool_denied`且Recording保持。第三次调用点击Allow，确认正式Recording入口
   停止捕获、Capture UI同步且同一调用只执行一次。通过产品UI恢复Recording。
8. 将`MCP workflow client`切换为`auto`，再次调用`capture_stop_recording`，确认无审批弹层并直接停止Recording；query/change均
   写入不含Token的Diagnostics审计。通过产品UI恢复Recording；再经真实Rules UI创建并Apply一条初始header Rule，
   官方Client调用`rules_get_tree`取得同一完整树并以`rules_replace_tree`替换header。确认Auto不显示审批、Rules Renderer收到
   revision事件后重载，真实8888请求令origin收到MCP更新后的header。
9. 保留profile和测试内存中的首代token，用同一profile启动第二代Electron；确认MCP仍开启、endpoint完全相同、
   Client与`auto`及MCP更新后的Rule/revision恢复，并且旧配置无需修改即可按相同协议重连、`tools/list`和调用
   `capture_get_proxy_status`。
10. 在产品UI点击该Client的Regenerate credential。确认旧token后续请求返回`401`且该Client在途调用取消；暂停trace
    再次Copy config并只记录新token hash，确认hash已改变且新token可连接。其他Client若存在不得受影响。
11. 撤销测试Client并关闭MCP，确认listener、SDK handler和在途调用全部消失，但Proxy Core的`8888`生命周期不受影响；
    保存两代状态、HTTP事实、Tool结果、审批、token hash、final screenshot、trace、Main/Renderer日志与metadata。
12. 点击`shell.window.close`，验证Main、Renderer、Core、Worker全退，MCP端口与8888均释放且
    `gracefulDestroyVerified=true`；删除profile。

### 预期效果

外部Host通过Desktop Main的loopback Streamable HTTP访问同一份产品状态。HTTP认证、MCP Tool开关与Client
`ask`/`auto`相互正交；app重启不轮换token，只有用户显式重新生成或撤销才让旧凭据失效。MCP失败、断连、
认证拒绝和审批等待都不影响抓包转发，关闭MCP不会关闭Proxy Core或修改系统代理。

`tools/list`只披露按feature命名的当前共享目录：`capture_*`、`rules_*`、`composer_*`、`breakpoints_*`、
`diagnostics_*`与`settings_*`。所有旧无前缀名称都必须不存在，逐项调用旧名由协议层拒绝且Core零命令；不提供alias或迁移期双目录。

本workflow覆盖官方Client链路；Browser CORS由`mcp.browser-playground-cors`独立覆盖。SSE响应形态由独立transport
integration test覆盖进度/多消息分帧，本workflow至少验证一个等待审批的在途HTTP调用能够在用户裁决后返回最终结果。

测试侧使用官方`@modelcontextprotocol/client` runtime并固定当前矩阵项的协议，角色等同于VS Code等
Host内部的MCP Client模块。它不启动或模拟第三方Host UI；否则测试结果会依赖VS Code/Claude自身界面与配置
生命周期，而不能精确证明Interceptor的HTTP、认证、Tool与Core链路。

### 验收要求

- trace、截图、日志与metadata不得包含Bearer token、加密Client记录、Capture敏感正文或Host配置绝对路径。
- Body原生Save/Cancel及数据完整性由[`capture.tools.body-export`](capture.md#capture-tools-body-export)验证；HAR实际Save/Open与文件结果由[`capture.tools.har-transfer`](capture.md#capture-tools-har-transfer)验证，不以discovery代替执行覆盖。
- 真实VS Code/Copilot、Claude Desktop的Host互操作须独立验收，当前限制见[Handover](../../../../../architecture/HANDOVER.md)。

<a id="mcp-tools-breakpoints"></a>
## `mcp.tools.breakpoints`

**状态**：passed
**策略**：privileged UI；复用`streamable-http.workflow.ts`

### Steps

1. 延续真实官方MCP Client和产品UI配置；通过Rules UI及8888请求自产HTTP pending并取得动态ID。
2. `tools/list`披露八项；query `breakpoints_list`直接返回，change在Ask下分别验证Deny/Allow，Auto下无审批。
3. Continue、Forward edited与Drop由真实client/origin证明；已解除旧ID在审批前直接返回错误，执行竞态由Core
   `conflict`收敛。
4. HTTP enable/disable控制后续真实请求；真实WebSocket连接自产exchangeId与pending后验证enable/disable和帧结果。
5. 关闭八项MCP Tool后立即从`tools/list`消失，逐项猜测调用均被官方SDK以`Tool <name> not found`拒绝。
   重启后旧Client在Continue审批中断开只取消所属调用；随后轮换credential仍不解除同一业务pending，新Client
   必须再次显式Allow才放行。
6. 完成token脱敏审计、Main/Core/MCP/8888销毁和系统代理恢复。

### 预期效果

MCP Client与内置Agent共享同一Breakpoints schema、Ask/Auto和Core conflict语义；transport、认证或Client生命周期
不会建立第二套queue，也不会在取消调用时替用户解决pending。

### 验收要求

- HTTP/WebSocket正文、编辑目标URL与动态Rule/Breakpoint/exchange ID全部登记为敏感值；业务操作段暂停trace，
   两代关闭时连同前后Bearer Token一起审计trace和进程日志，evidence只保留Token hash、计数与布尔事实。