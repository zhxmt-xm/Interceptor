# Capture Workflows

本文件定义 Capture 工作区的完整 E2E 流程。每条 workflow 都独立启动 Electron、独占 profile、trace 和 loopback fixture，并从 fresh App 写到 Close/destroy。

## 多协议测试输入

测试侧只提供真实 loopback origin 和客户端，不替换 App 内部实现：

- Plain origin：HTTP/1.1 JSON + RFC 6455 WS text/binary echo；
- Secure H1 origin：HTTPS JSON + WSS text/binary echo，自签名源站证书；
- Secure H2 origin：ALPN h2 JSON + 原生 gRPC，自签名源站证书；
- 客户端显式连接 `127.0.0.1:8888`，所有字节真实经过 Interceptor listener、Proxy Core、Storage 和 Renderer。

固定请求数据：

- HTTP/HTTPS header：`x-interceptor-e2e-request: <protocol>`；POST body 为固定 JSON；
- response header：`x-interceptor-e2e-response: <protocol>`、JSON content type、两个 Set-Cookie；
- WS/WSS text：`plain-text` / `secure-text`；binary：`01 02 03 04`，origin原样 echo；
- H2 path：`/e2e/mitm/h2?source=workflow`，response trailer `x-interceptor-e2e-trailer: h2-complete`；
- gRPC path：`/interceptor.e2e.WorkflowService/Stream`；一个 request envelope、两个 response envelope，第二个 compressed flag=true；trailers=`grpc-status: 0`、`grpc-message: OK`。

<a id="capture-scenarios-bodies"></a>
## `capture.scenarios.bodies`

**状态**：passed；十一种文本类场景Green，模式/生命周期修复owner22/22、Renderer零异常
**策略**：真实Electron；现有TrafficLab；不新增Playground工具测试

### Steps

1. fresh profile经真实UI开启Recording；逐次运行现有Body默认Draft，所有字节经8888进入Capture。
2. 选择自产路径的单条200请求；有上传内容时在Request Text/Raw核对完整正文。
3. 在Response按既有模式检查JSON、Text、HTML、CSS、JavaScript、XML、YAML、SVG、Markdown、Form及Unknown text；同时核对正文长度。
4. 期望正文在workflow独立定义，不从origin结果生成；HTML/SVG保持代码文本不执行，Markdown Preview显示标题及两项列表。
5. 保存逐场景身份、trace和截图；fixture关闭origin及真实Electron，验证Main/Core/Worker、8888和完整WinINet/journal恢复。

Raw模式必须显示捕获的原始内容，不能残留Code模式自动格式化后的缩进；2026-09-09真实HTML场景发现该故障，先补BodyViewer模式隔离owner测试与真实UI Red，再修复。
每场景独立关闭并重开Inspector，先确认正文长度和radio选中状态；代码模型经真实全选/复制校验，仅归一Windows剪贴板CRLF。模式卸载不得重复销毁Monaco模型，最终Renderer page error必须为0。

<a id="capture-scenarios-body-media"></a>
## `capture.scenarios.body-media`

**状态**：passed；五场景Green，PNG真实解码、Hex及音视频原生保存已核验
**策略**：真实Capture UI；Windows原生Save Dialog；现有流量库

### Steps

1. fresh profile启用Recording，分别运行`body-png`、`body-binary`、`body-unknown-binary`、`body-audio`和`body-video`；每次从空Inspector打开自产200行。
2. Response区块长度分别为68、8、5、48、24字节；PNG须实际解码为1x1并保存预览截图；二进制Hex精确显示固定字节序列。
3. 音视频保持现有不读取Renderer正文的边界，显示MIME且无audio/video/iframe播放器；点击唯一Save并用真实键鼠操作Save Dialog。
4. 只读核对同workflow经产品导出的WAV/MP4文件与独立固定字节一致，不预造导入文件或调用内部API。
5. 保存逐场景证据及trace，Renderer page error为0；fixture正常关闭产品，验证原生窗口、进程、8888、WinINet/journal恢复。

<a id="capture-scenarios-encoding"></a>
## `capture.scenarios.encoding`

**状态**：passed；五种编码/损坏场景Green，原始字节与错误信息均保留
**策略**：真实Capture UI；现有压缩/损坏场景；host-safety-guard

### Steps

1. fresh profile经UI启用Recording；依次经真实8888执行gzip、deflate、brotli、损坏gzip及无效PNG场景。
2. 每种流量显示唯一自产200行和实际编码字节数；正常编码在Response Raw分别显示独立预期`{"encoding":"gzip"}`、`{"encoding":"deflate"}`、`{"encoding":"br"}`。
3. 损坏gzip显示包含协议值gzip的解码错误信息，Hex保留`1f 8b 08 00 01 02 03`；无效PNG显示`image/png`不可预览占位，不保留损坏img元素。
4. 不改变应用语言、不用本地化文案定位；每场景关闭Inspector，避免旧正文控件竞态。
5. 保存逐场景、trace和截图，要求Renderer无page error；fixture验证origin及Main/Core/Worker退出、8888/WinINet/journal恢复。

<a id="capture-scenarios-websocket"></a>
## `capture.scenarios.websocket`

**状态**：passed；四场景Green，真实载荷复制、方向隔离和origin关闭码1000
**策略**：真实Capture Messages；现有WebSocket流量库；方向/载荷/连接隔离

### Steps

1. fresh profile经UI开启Recording，依次运行已有Text、Binary、Bidirectional和Control默认场景，每个独立WebSocket经8888产生真实101握手并以1000关闭。
2. 选择自产Capture行，进入Messages并切换Sent/Received/All；Text各方向1条，Binary各方向1条，双向场景Sent 1条/Received 2条。
3. 文本载荷分别为`hello from client`、`client message`、`origin message`；Binary为`00 01 02 03 ff`，逐行展开并用真实Copy验证完整值。
4. Control场景完成Ping/Pong/Close协议交互；按现有产品语义不把控制帧伪造为数据消息行，Messages为0条。
5. 每条场景关闭Inspector，不串连接；保存逐场景身份、trace与截图，Renderer无page error，fixture验证连接、Main/Core/Worker、8888和WinINet/journal恢复。

`ws-control`另保存`websocket-control-empty-state.png`，用于核对真实Messages空态；该场景只有控制帧，0条数据消息符合当前产品边界。原空态CSS缺失另记录为UI问题，不改正文或帧断言掩盖。

<a id="capture-tools-archive-transfer"></a>
## `capture.tools.archive-transfer`

**状态**：passed
**策略**：native-ui；Windows；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron并开启Recording；loopback HTTP与WebSocket流量经8888进入Capture，UI确认完整正文和双向消息。
2. 通过Settings配置本地Provider；Ask Chat发现`capture_export_archive`与`capture_import_archive`，二者只接受空参数。
3. Agent Ask Deny不打开原生Dialog；Allow导出先真实Cancel，再Allow选择路径，查询任务到成功并核对产品输出归档，不能测试预造文件。
4. UI Clear之后通过Agent Allow导入同一产品文件，先取消原生Open，再确认导入；已挂载Capture自动恢复HTTP正文与WebSocket消息，不依赖切换页面。
5. Agent Auto导出仍显示Save，Auto导入仍显示Open；再导入时追加完整数据，已有Capture不被清空。结果和Transcript只含安全任务字段或取消摘要。
6. 关闭Agent两项权限，旧Chat无法调用；产品UI创建MCP Client，独立开启MCP权限并验证Ask Deny/Allow、原生取消、Auto导出及追加导入。
7. 原UI Archive Export/Import也完成同组操作，使用同一Main方法；MCP撤权后旧连接不能披露或执行两项Tool。
8. 正常关闭并保存trace/evidence；同profile重启，权限保持，Model/origin/文件操作零重放。两代Main/Core/Worker全部退出，8888释放，完整WinINet/journal恢复后清理产品文件。

### 预期与证据

- 前置Red必须来自缺失Tool或目标行为未实现，不能用selector、原生Dialog、构建或环境失败替代。
- 文件内容只在测试本地核对完整性；审批、Tool结果、Transcript及脱敏证据不含凭据、正文、本机路径或文件名。
- Export保存全量原生证据而不是HAR转换；Import保留WebSocket消息与完整正文，追加数据并通过正式通知刷新UI。
- 前置executor16项缺失Tool Red，真实discovery在`b59c5adb`构建上Red；Main/Core `32984/11512`正常退出，证据`interceptor-archive-tools-e2e-red-20260907-193654`。
- 最终1/1（49.0秒），两代Main/Core `6960/19908`、`18620/20208`均`gracefulDestroyVerified=true`，Main/Core/Worker、8888及完整WinINet/journal恢复通过。
	- 证据及trace为TEMP下`interceptor-archive-tools-complete-green-20260907-195117`，HTTP正文和WebSocket消息在Clear后完整恢复，导入数量依次2、4、6、8、10。
	- Agent/MCP Ask/Auto、原生取消、独立撤权、原IPC菜单、共享通知及重启零重放通过；`archive-transfer.json`仅含hash、计数和布尔结论。
- Desktop665/665、Tools326/326、MCP32/32、Archive Core20/20、全workspace类型、parity202/202、package/artifact audit与smoke1/1通过；关联流程与失败记录见[Archive验收](../../../../../architecture/features/transfer.md#archive-tool-acceptance)。

<a id="capture-playground-traffic"></a>
## `capture.playground-traffic`

**状态**：passed

**策略**：os-side-effect

### Steps

1. 创建fresh profile、trace与独立Playground端口；启动真实Electron并等待Core与8888，使用产品UI开启Recording。
2. 系统Edge打开真实`apps/playground`，确认默认Capture Lab、39项目录、Capture专属Header与可编辑Draft。
3. 选择`h1-json`并点击Run；等待Playground显示complete。
4. 在真实Capture中等待自产`/playground/h1-json`行，选择后进入Response，验证h1和`ord_42`正文。
5. 回到Edge选择`ws-text`并点击Run；等待Playground显示complete。
6. 在真实Capture中等待自产`/playground/ws/text`行，选择后进入Messages，验证双向自产text message。
7. 关闭Edge与Playground；正常Close Electron并验证Main/Core退出、8888/Playground端口释放、系统代理恢复与profile删除。

### TDD证据要求

- Retrospective Red：同一workflow针对改造前提交运行，失败必须源于默认页/39项目录/协议场景能力缺失，不得是build、selector或环境失败。
- Green：同一workflow在当前代码通过H1与WebSocket两段真实UI → Proxy → Core → Renderer链路，日志无Renderer page error，所有进程与端口完成销毁。

### TDD证据

- Retrospective Red：最终workflow在`570c5447`精确失败于旧Playground默认MCP页缺少`data-section="capture"`；旧页面尚无39项Capture目录，构建、fixture和Electron启动均成功。
- Green：当前同一workflow `1/1`通过，H1 `/playground/h1-json`的`ord_42`正文与WebSocket `/playground/ws/text`双向`hello from client`均在真实Capture可见。
- 销毁：metadata记录`gracefulDestroyVerified=true`；Main/Core、8888与Playground随机端口均释放，Renderer page error为0。

### 预期效果

Playground不是直接构造Core状态的测试后门；真实Browser点击自产流量进入产品Capture，H1正文与WebSocket消息均可在产品UI检查，退出不遗留listener或系统副作用。

### 2026-09-07 协议合并回归

本次是流量基础设施重构，以上产品流程与断言不变，不为重构人为制造产品Red。
迁移前先补旧HTTP/WS/TLS控制的网络基线，与既有场景合计60/60；原有fixture辅助单测41/41。
`capture.playground-traffic`、`breakpoints.queue-isolation`、`breakpoints.websocket-close`、`agent.tools.composer`
迁移前后同组均4/4 Green，证据分别位于TEMP下`interceptor-playground-consolidation-baseline-20260907`
和`interceptor-playground-consolidation-green-20260907`。

TLS/H2应用字节观测补测精确暴露33字节被计为0，改为TLS stream计数后同组Green；最终Playground84/84、
Browser5/5与Desktop/Playground typecheck通过。最终文件命名后额外复跑Capture与Composer两条2/2，证据在
`interceptor-playground-consolidation-final-20260907`：Capture Main/Core `33088/33932`，Composer两代
`37960/18576`、`36556/16396`，trace齐全且`gracefulDestroyVerified=true`；宿主guard验证进程代际、8888、
WinINet与journal恢复。未受后续TLS命名影响的WS队列/关闭码证据沿用同组Green，不扩大为39项产品E2E全部通过。

随后将普通场景与断点统一到一个WebSocket客户端，`sendCloseFrame()`与`closeGracefully()`分别表示单帧发送和
完整关闭，删除手写帧编解码。关闭码、队列隔离与Playground Capture的真实E2E前后均3/3；最终Main/Core分别为
`11808/44180`、`2532/40652`、`29228/12220`，trace与正常销毁证据位于TEMP下`interceptor-websocket-client-green-20260907`。

最终按功能整理目录，前端根只保留`main.tsx`，服务端根只保留`entry.ts`和说明；代码分别归入页面功能及协议目录，
不保留笼统的internal层。目录调整后直接复跑已有`capture.playground-traffic`，1/1 Green，Main/Core `12720/20536`，
trace齐全且`gracefulDestroyVerified=true`，证据在TEMP下`interceptor-playground-feature-folders-20260907`。
Desktop typecheck通过；当时完整Playground typecheck受并行HAR recipe缺项阻塞，不能将其记为全绿。
按用户新增规范，后续Playground/E2E设施改动只运行实际场景、已有真实E2E及必要typecheck/build，不再扩充设施测试。

<a id="capture-recording-pause-resume"></a>
## `capture.recording.pause-resume`

**状态**：planned
**策略**：os-side-effect

### Steps

1. 创建空 profile、evidence 和 HTTP loopback origin；启动 trace与新 Electron。
2. 等待 App root、Core Running、8888 和 Proxy readiness modal；确认工作栏 Paused、statusbar Not recording。
3. 点击 `capture.readiness.open-proxy-settings`，确认 Listener=Listening、Address=8888、System Proxy 尚未 Owned。
4. 点击 `shell.workspace.capture`；点击 `capture.recording.toggle` 重新触发 readiness，再点击 `capture.readiness.enable`，由 App真实调用平台 helper并完成原生授权。
5. 等待 modal 关闭和 Recording；进入 Proxy page确认 Owned by Interceptor，再回 Capture。
6. 测试客户端通过8888发送请求A，等待并确认对应动态 request row。
7. 点击 `capture.recording.toggle` 暂停；确认 Paused/Not recording；通过8888发送请求B并确认客户端仍得到200。
8. 确认A仍保留、B未出现在列表；再次点击 recording toggle恢复，必要时通过 readiness Enable；发送请求C并确认A/C出现。
9. 进入 Proxy page点击 `settings.proxy.restore`，等待不再Owned；保存 evidence，返回 Capture并点击 `shell.window.close`。
10. 验证 Main/Core/Worker全退、8888释放、系统代理恢复、profile删除。

### 预期效果

Stop只暂停记录，不停止listener或系统代理，不删除旧记录；暂停期间流量继续转发但不落Capture；恢复后继续在同一Core代际追加；退出前系统代理恢复。

<a id="capture-proxy-readiness-resolve"></a>
## `capture.proxy-readiness.resolve`

**状态**：planned
**策略**：os-side-effect

### Steps

1. 创建fresh profile/evidence，启动trace和新Electron；等待App/Core/8888。
2. 验证Proxy not ready modal及 `capture.readiness.close/cancel/open-proxy-settings/enable`，状态为System Proxy off或ownership lost。
3. 点击 `capture.readiness.cancel`；确认modal关闭、Paused/Not recording，系统代理UI状态未改变。
4. 点击 `capture.recording.toggle` 重新触发modal，再点击 `capture.readiness.open-proxy-settings`。
5. 验证Settings自动进入Proxy section：Listener=Listening、Address=8888、非Owned、journal=Protected、Enable可用。
6. 返回Capture，重新触发modal并点击 `capture.readiness.enable`；完成App发起的原生授权。
7. 等待Recording；进入Proxy page确认Owned、Owned by Interceptor、Current configuration=8888及真实bypass/PAC字段。
8. 点击 `settings.proxy.restore`；确认原系统配置恢复、ownership清除；返回Capture确认Paused。
9. 保存evidence，点击 `shell.window.close`。
10. 验证Main/Core/Worker全退、8888释放、journal清理，再删除profile。

### 预期效果

Cancel和打开设置均无隐式系统写入；只有用户点击Enable后才接管代理；失败显示有界错误且不循环静默重试；Restore遵守ownership guard。

<a id="capture-traffic-capture-select"></a>
## `capture.traffic.capture-select`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建fresh profile/evidence和HTTP loopback origin；启动trace与新Electron。
2. 等待App/Core/8888和readiness modal；确认Capture空列表、Paused/Not recording、System Proxy未owned；点击 `capture.readiness.enable`并完成授权，等待Recording。
3. 测试客户端显式通过8888发送POST `/e2e/capture/details?source=workflow`，带固定header/body。
4. 等待动态 `capture.request-row.<exchangeId>` 出现，检查row的POST、host/path、200、h1、json、bytes和duration。
5. 点击该row。
6. 验证Inspector summary的method、host、path、200 OK和完整Request URL。
7. 验证General数据来自同一Exchange而非静态fixture。
8. 进入Settings Proxy点击 `settings.proxy.restore`，确认非owned和Paused；保存evidence，点击 `shell.window.close`。
9. 验证Main/Core/Worker全退、8888释放且系统代理保持恢复状态。
10. 关闭origin并删除profile。

### 预期效果

真实HTTP请求经listener、Mockttp、Core Capture、事件推送进入虚拟列表；点击row后按需取得真实detail；所有metadata与客户端发送/接收结果一致。

<a id="capture-inspector-section-collapse"></a>
## `capture.inspector.section-collapse`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与HTTP loopback origin；启动本地production Electron，等待App/Core/8888并收敛fresh-profile readiness。
2. 通过`capture.recording.toggle`与`capture.readiness.enable`开始真实Recording；客户端显式经8888发送`GET /e2e/capture/section-collapse`，等待动态row并点击进入Inspector。
3. 用`capture.inspector.section.general`与`capture.inspector.section.response-headers`定位两个真实标题按钮；确认初始`aria-expanded=true`，各自`aria-controls`指向仍挂载且`hidden=false`的唯一正文。
4. 折叠General，确认其正文`hidden=true`，Response Headers保持展开；再折叠Response Headers并重新展开General，确认同一`aria-controls`正文恢复且两段状态互不覆盖。
5. 保存截图、trace、日志与metadata；正常Close并验证Main/Core/Renderer退出、8888释放、系统代理恢复和profile删除。

### TDD证据

- Red：两个真实按钮均可定位，但Capture标题没有`aria-expanded`与`aria-controls`。
- Green：独立折叠、ARIA关系与正文`hidden`状态全部通过，workflow `1/1`并保留销毁证据。

### 预期效果

标题按钮与正文有稳定无障碍关系；折叠一段不改变同pane其他段；正文折叠时不卸载，内部查看状态不会因收起而丢失。

<a id="capture-filter-keyword"></a>
## `capture.filter.keyword`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；只检查Capture相关默认态：列表空、keyword空、System Proxy未owned、Paused。
2. 点击 `capture.readiness.enable`并完成授权，等待Recording；通过8888制造 `/e2e/filter/alpha` 与 `/e2e/filter/beta` 两条真实请求。
3. 等待两个动态request row和`2 of 2`。
4. 在 `capture.filter.keyword` 输入 `alpha`。
5. 验证alpha可见、beta隐藏、计数为`1 of 2`。
6. 把输入改成host片段，验证两条均按host匹配。
7. 清空输入，验证两条恢复、顺序和选择不变、计数回到`2 of 2`。
8. 进入Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证进程/8888销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Keyword只过滤视图，不删除全量Capture；计数与可见row同步；清空后完整恢复。

<a id="capture-filter-structured"></a>
## `capture.filter.structured`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和loopback origin；启动trace/Electron，等待App/Core/8888/readiness；检查结构化filters均为空、列表空、Paused。
2. 点击 `capture.readiness.enable`并完成授权，等待Recording；制造method与status各不相同的真实请求集合。
3. 点击 `capture.filter.add` 打开Add filter；确认只列出Method与Status两项，hint预览当前列表出现的值。
4. 点击 `capture.filter.option.method` 进入级联，从列表实际出现的值中点选（如POST）；确认生成method pill、可见row与计数同步收窄。
5. 再次打开Add filter→`capture.filter.option.status`，从实际出现的值中点选（如404）；`capture.filter.back` 可返回上一级。
6. 通过 `capture.filter.remove.method` 与 `capture.filter.remove.status` 逐项移除。
7. 验证每次只清目标字段，最终恢复全量与原排序。
8. 进入Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证Main/Core/Worker销毁、8888释放和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

五类结构化条件正确规范化并以AND组合；非法值不污染filter；pill移除精确；列表和计数始终一致。

<a id="capture-filter-group-selection"></a>
## `capture.filter-group-selection`

**状态**：passed
**策略**：shared

### Steps

1. 创建fresh profile并启动仓库本地production bundle；开启BrowserContext trace，等待真实Electron Renderer、Core PID和`127.0.0.1:8888` listener ready。Fresh profile出现Proxy readiness时只点击Cancel，不修改系统代理。
2. 通过`capture.filter.toggle.status`展开Status组，确认`aria-expanded=true`且永久Pending option可见。
3. 点击`capture.filter.option.status.<pending>`选择该option；确认筛选生效后toggle仍为`aria-expanded=true`、option仍可见。
4. 再次点击同一option取消选择；确认组继续展开。对Content type组重复相同选择/取消流程，证明非Application分组不依赖默认展开状态。
5. 附加每次点击后的`aria-expanded`证据、最终截图、trace、Main/Renderer日志和metadata；正常Close。
6. 验证Main/Core PID退出、8888可重新bind、profile删除且系统代理从未被修改。

### 预期效果

option选择与分组展开是正交状态；选择或取消option只更新筛选条件，只有标题或chevron可以折叠分组。该workflow用于证明真实产品Renderer没有设计fixture的状态重置缺陷。

### TDD证据要求

- 产品实现修改前运行本workflow为Green，因此没有修改Renderer业务代码。
- `design-vite`交互测试在fixture修复前因非Application分组被重置而Red，修复后Green。
- selector、构建、fixture或销毁失败不算产品行为证据。

### 验收证据

- 设计 fixture 修复前，`capture-filters.test.ts` 精确失败于 Method 组点击 POST 后 class 从`fgrp on`变为`fgrp applied`；修复后`2/2` Green。
- Desktop Capture store聚焦测试`21/21` Green；新增断言证明选择和取消option都不改变`expandedFacets`。
- 真实 Electron `capture.filter-group-selection` `1/1` Green；Status与Content type两组在选择/取消Pending option后均保持`aria-expanded=true`。
- metadata记录Main PID`29504`、Core PID`29972`、listener`8888`与`gracefulDestroyVerified: true`；trace、最终截图、Main/Renderer日志均已生成，结束后`8888`空闲，系统代理保持原有配置。

<a id="capture-filter-protocol"></a>
## `capture.filter.protocol`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和H1/WS/H2 origins；启动trace/Electron，等待App/Core/8888/readiness；检查protocol=All、列表空、CA absent、MITM off。
2. 点击readiness Enable并完成授权；从App UI Generate、Install CA，添加`localhost`例外并Start decrypting，等待Recording和MITM active。
3. 制造真实HTTP/1.1、HTTP/2和WS记录；等待三个动态rows。
4. 点击 `capture.protocol.h1`，验证只显示H1。
5. 点击 `capture.protocol.h2`，验证只显示H2。
6. 点击 `capture.protocol.ws`，验证只显示WS handshake。
7. 点击 `capture.protocol.all`，验证全部恢复与计数正确。
8. 从UI关闭MITM、移除host例外、Uninstall/Delete CA并点击 `settings.proxy.restore`；确认非owned、Not generated、Paused。
9. 保存evidence并点击Close；验证进程/8888销毁和系统副作用恢复。
10. 关闭lab并删除profile。

### 预期效果

协议段基于规范化protocol筛选；All/H1/H2/WS互不混淆；TLS tunnel保持独立。

<a id="capture-facet-stable-ordering"></a>
## `capture.facet-stable-ordering`

**状态**：passed
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录和loopback origin，启动BrowserContext trace与仓库本地production bundle；等待`app.root`、真实Main/Core PID和`127.0.0.1:8888` listener。
2. 点击`capture.recording.toggle`；在Proxy readiness中点击`capture.readiness.enable`，等待Recording的`aria-pressed=true`。
3. 显式proxy客户端先发送`GET /e2e/facet-order/get-first`，再发送`POST /e2e/facet-order/post-first`；两次都必须从真实origin取得200，并等待两条公开`capture.request-row.<exchangeId>`进入Renderer。
4. 点击`capture.filter.toggle.method`展开Method；按原始DOM顺序读取组内`capture.filter.option.method.*`，必须是GET、POST。
5. 显式proxy客户端再发送`POST /e2e/facet-order/post-second`；等待POST count变成2后，不使用排序后的测试侧副本，再次读取原始DOM顺序，仍必须是GET、POST。
6. 点击`capture.recording.toggle`停止Recording并确认`aria-pressed=false`。
7. 附加`facet-stable-order.json`、最终截图、trace、Main/Renderer日志和metadata。
8. 通过`shell.window.close`正常关闭应用，由Main退出流程恢复仍由Interceptor持有的系统代理。
9. 验证Main、Renderer、Core与Worker退出、8888可重新bind，然后删除profile和loopback fixture。

### 预期效果

动态facet按当前Capture中的首次出现顺序挂载。后出现值的count反超时只更新数字，不移动既有option DOM。

### TDD证据要求

- 修复前`89d8dda`运行同一workflow：初始顺序为GET、POST；第二个POST到达后顺序变成POST、GET，并精确失败于稳定排序断言。
- 当前提交运行同一workflow：两次顺序均为GET、POST，且trace、metadata、Main/Core/Worker销毁、8888释放和系统代理恢复证据完整。selector、fixture、构建或环境失败不算Red。

### 验收证据

- `89d8dda`仅回植后续公开automation ID测试探针后，真实Electron精确Red：第二个POST到达后Method DOM顺序为POST、GET。
- 当前提交同一workflow `1/1` Green；Main PID `11064`、Core PID `25972`均退出，`gracefulDestroyVerified: true`，listener `8888`释放且系统代理恢复。

<a id="capture-clear-facets"></a>
## `capture.clear-facets`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback origin，启动真实Electron并等待App、Core与8888；通过真实UI开始Recording。
2. 展开Method facet，经8888发送一条测试自产GET并等待Capture行与GET option/count=1可见；点击该行建立selection。
3. 在facet快照刚完成更新后立即点击`capture.clear`，等待Capture行数量变为0。
4. 不使用Playwright auto-retry，直接在同一断言点读取Method group count、GET option数量与当前选中行数量；必须同时为`0 / 0 / 0`。
5. 保存Clear前后原始DOM快照、trace、日志与metadata；正常Close并验证Main/Core退出、8888释放、系统代理恢复和profile删除。

### 预期效果

Clear是空rows的同步边界：列表、selection与facet snapshot在同一次可见状态推进中归零，不允许facet继续显示旧count/options最多600ms。

### TDD证据要求

- 最终workflow源码必须在`89d8dda`取得retrospective Red，且失败值为rows=0时Method count/GET option仍非0；selector、构建、listener、授权或fixture失败不算Red。
- 当前提交运行同一workflow必须Green，并完成trace/evidence、Main/Core销毁、8888释放与系统代理恢复。

### TDD证据

- Retrospective Red：最终workflow源码在`89d8dda`仅回植后续公开facet automation ID、`startRecording` UI helper与旧driver Close定位后，原始DOM为`rows=0 / inspector=0 / methodGroupCount=1 / getOptions=1`。
- Green：当前同一workflow`1/1`通过，Clear后的同一原始DOM采样为`0/0/0/0`；owning hook/store unit `23/23`通过。
- 销毁：Main PID `20116`、Core PID `35120`均退出，`gracefulDestroyVerified=true`，8888释放且系统代理恢复原值。

<a id="capture-breakpoint-menu-hierarchy"></a>
## `capture.breakpoint-menu-hierarchy`

**状态**：planned
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback origin，启动真实Electron并通过真实UI开始Recording。
2. 经8888发送一条测试自产GET，等待动态Capture行出现，并从公开`capture.request-row.<exchangeId>`提取exchangeId。
3. 在该行触发真实contextmenu，等待`capture.create-rule.<exchangeId>.block`与`.breakpoint`可见；读取两个语义label的bounding box，要求文字左缘差小于1px。
4. Hover Breakpoint，确认`capture.create-breakpoint.<exchangeId>.endpoint`可见；按Escape关闭菜单。
5. 保存Block/Breakpoint几何、trace、日志与metadata；正常Close并验证Main/Core退出、8888释放、系统代理恢复和profile删除。

### 预期效果

Breakpoint submenu与Block同属Control group，icon、语义label与hint使用同一行布局；Breakpoint不因额外submenu DOM包装而右移，二级菜单仍可通过hover展开。

### TDD证据要求

- 最终workflow源码必须在`89d8dda`取得retrospective Red，且失败来自Block/Breakpoint语义label左缘差大于1px；selector、构建、listener、授权或fixture失败不算Red。
- 当前提交运行同一workflow必须Green，并完成二级菜单、trace/evidence、Main/Core销毁、8888释放与系统代理恢复。

### TDD证据

- Retrospective Red：最终workflow源码在`89d8dda`仅回植`startRecording`与旧driver Close定位后，Block/Breakpoint语义label左缘差为`7.43621826171875px`。
- Green：当前同一workflow`1/1`通过，两个label左缘均为`815.9757690429688px`、差值0；hover后公开endpoint submenu项可见。
- 销毁：Red/Green Main/Core PID分别为`21056/39980`与`21380/20632`，两边`gracefulDestroyVerified=true`，8888释放且系统代理恢复原值。

<a id="capture-breakpoint-submenu-lifecycle"></a>
## `capture.breakpoint-submenu-lifecycle`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback origin，启动真实Electron并通过真实UI开始Recording。
2. 经8888发送一条测试自产GET，等待动态Capture行出现，并从公开`capture.request-row.<exchangeId>`提取exchangeId。
3. 在行右边界触发contextmenu；确认公开根菜单标记和Breakpoint trigger可见。
4. Hover Breakpoint；确认公开submenu标记与endpoint item可见，同时根菜单标记仍挂载。右边空间不足时，submenu标题横坐标必须小于根菜单标题，且两者均位于viewport内。
5. Hover根菜单Block项；等待submenu关闭，同时根菜单保持。再次hover Breakpoint并进入endpoint item，根菜单仍保持。
6. 按Escape；根菜单与submenu同时消失。重新打开并展开submenu，点击App statusbar空白处；两层再次同时消失。
7. 保存共存、翻转、hover close/reopen与两种dismiss证据；正常Close并验证Main/Core退出、8888释放、系统代理恢复和profile删除。

### 预期效果

Breakpoint submenu由同一Ant Menu树管理：hover展开不会用第二页替换根菜单；指针可在父子菜单间移动；右边界自动向左翻转；Escape与outside click都销毁整棵菜单。

### TDD证据要求

- 最终workflow源码必须在`32867ff^`仅回植公开automation探针与必要driver helper后取得retrospective Red；旧`menuPage`实现因只支持点击换页，hover后endpoint不可见且无法保持根/二级共存。
- 当前提交运行同一workflow必须Green，并验证翻转、hover close/reopen、Escape、outside click、trace/evidence、Main/Core销毁、8888释放与系统代理恢复。

### TDD证据

- Retrospective Red：最终workflow源码在`e5ca501`仅回植根菜单、Breakpoint页与scope按钮automation探针后，hover Breakpoint等待`capture.context-menu.breakpoint-submenu`15秒仍不存在；Main/Core PID `21308/28948`，`gracefulDestroyVerified=true`。
- Green：当前同一workflow`1/1`通过；Breakpoint trigger矩形`x=1030 / width=210`，endpoint可见内容矩形`x=628.126 / width=331.607`，证明右边界向左翻转；根/二级共存、hover close/reopen、Escape和outside click均通过。
- 销毁：Green Main/Core PID `46880/33620`，`gracefulDestroyVerified=true`，Red/Green均释放8888、恢复系统代理并删除profile。

<a id="capture-navigate-tls-passthrough"></a>
## `capture.navigate-tls-passthrough`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback TLS tunnel lab；启动真实Electron并通过真实UI开始Recording。
2. 通过产品UI生成并安装测试CA、开启MITM，再在Settings / TLS passthrough添加`127.0.0.1`，返回Capture。
3. 经8888向测试自产随机端口建立真实CONNECT + TLS ClientHello，完成加密echo，等待动态Capture行并打开TLS tunnel Inspector。
4. 点击公开`capture.tls-tunnel.view-passthrough-pattern`；确认App切到Settings，激活TLS passthrough section。
5. 确认产品从当前持久化settings解析出精确覆盖项`127.0.0.1`，对应公开host row滚入可见区域并带`data-highlighted=true`。
6. 等待3秒后确认同一row仍存在但`data-highlighted=false`；再次从Capture执行跳转时高亮重新出现，证明timer被重新计时。
7. 通过Settings UI删除测试pattern、关闭MITM、卸载并删除测试CA，保存trace、最终截图与Main/Renderer日志；正常Close。
8. 验证Main/Core退出、8888释放、系统代理恢复、profile删除。

### 预期效果

Tunnel入口导航到实际覆盖当前host的最具体持久化pattern；Settings列表自动滚动并提供短暂、可重复的定位反馈。导航不新增pattern、不持久化高亮，也不把wildcard覆盖误显示为精确host配置。E2E用无外部DNS依赖的精确IP验证真实flow；unit另锁定exact优先与多层wildcard选择最长suffix。

### TDD证据要求

- 实现前同一workflow必须Red于导航入口缺失或目标row没有公开高亮状态；selector、构建、UAC或fixture失败不算Red。
- 当前提交必须Green，并保留目标pattern、滚动可见、3秒消退、重复计时、配置清理、Main/Core销毁、8888释放与系统代理恢复证据。

### TDD证据

- Red：真实CA/MITM、持久化pattern与TLS CONNECT均完成后，等待公开`capture.tls-tunnel.view-passthrough-pattern`15秒仍不存在；该轮cleanup与`gracefulDestroyVerified=true`完成。
- Green：当前同一workflow`1/1`通过；目标row位于Renderer viewport内，`data-highlighted`从true在3秒后转false，返回Capture重复导航后再次为true。
- 销毁：Green Main/Core PID为`31036/13248`，`gracefulDestroyVerified=true`；测试pattern、MITM意图与测试CA均由App UI清除，8888释放且系统代理恢复`127.0.0.1:7890`。

<a id="capture-facets-clear-menu"></a>
## `capture.facets-clear-menu`

**状态**：planned
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录并启动仓库本地production bundle；开启BrowserContext trace，等待`app.root`、带真实PID的Core状态和`127.0.0.1:8888`可连接。
2. Fresh profile首次出现Proxy readiness时点击`capture.readiness.cancel`，确认测试arrange未写系统代理。随后点击`capture.recording.toggle`，在再次出现的readiness点击`capture.readiness.enable`并完成Windows授权，等待Recording的`aria-pressed=true`。
3. 展开Application、Status与Content type，先确认三组Pending option即使count=0也存在。启动random-port HTTP origin；显式proxy客户端先向8888发送`GET /e2e/facets/get-first`，再发送`POST /e2e/facets/post-first`；两次都必须从真实origin取得200，并等待对应`capture.request-row.<exchangeId>`出现在Renderer。
4. 点击`capture.filter.toggle.method`展开Method组；等待`capture.filter.option.method.GET`与`.POST`可见。按DOM顺序读取组内所有`capture.filter.option.method.*`，必须是GET、POST。
5. 在GET Capture行触发原生`contextmenu`。从该行公开exchange ID构造`capture.create-rule.<exchangeId>.block`与`.breakpoint`；等待两者可见，轮询动画结束后的bounding boxes并要求文本左缘差<1px。Hover Breakpoint automation ID，确认二级菜单的只读文本`This endpoint`可见，再按Escape关闭。
6. 显式proxy客户端发送`POST /e2e/facets/post-second`并取得origin 200；等待`capture.filter.option-count.method.POST`文本变成2，然后再次原始读取DOM顺序，仍必须是GET、POST。
7. 让origin gate暂不返回`GET /e2e/facets/pending`。等待该Capture行出现，并确认Status Pending与Content type Pending count均为1；点击Status Pending后只保留该进行中行。释放origin response并取得200，等待Pending count回0，但三个Pending option必须继续存在；取消Status筛选。
8. 计数刚刷新后立即点击`capture.clear`；等待所有`capture.request-row.*`数量变为0。随后不使用Playwright auto-retry，直接读取`capture.filter.group-count.method`原始文本并要求为0，同时直接读取GET/POST option数量并要求均为0；三个永久Pending option仍存在且count=0。
9. 附加`capture-facet-state.json`、最终截图、trace、Main/Renderer日志和metadata。fixture进入Settings→Proxy；若`settings.proxy.restore`存在则点击并等待消失，然后正常Close，验证Main/Core PID退出、8888可重新bind并删除profile。

### 预期效果

实时count只更新数字，不移动既有facet DOM；三个Pending bucket永久存在并可筛选真正进行中的request；Breakpoint submenu trigger与同组Block对齐且可展开；Clear完成时列表与facet snapshot同帧归零，不存在最多600ms的split state。

### TDD证据要求

- 修复前提交运行同一workflow：POST反超时顺序变为POST、GET；Breakpoint与Block左缘差大于1px；Clear后rows已为0但facet仍保留旧count/options。
- 当前提交运行同一workflow：三段全部Green，且销毁/系统代理恢复证据完整。selector、UAC、构建或fixture失败不算Red。

<a id="capture-detail-body-fill"></a>
## `capture.detail-body-fill`

**状态**：passed
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录并启动仓库本地production bundle；开启BrowserContext trace，等待`app.root`、带真实PID的Core状态和`127.0.0.1:8888`可连接。
2. 若fresh profile显示Proxy readiness，先点Cancel确认没有隐式OS写入；点击`capture.recording.toggle`，在再次出现的readiness中点击`capture.readiness.enable`并完成Windows授权，等待Recording的`aria-pressed=true`。
3. 启动random-port HTTP origin；测试客户端以absolute-form URL向8888发送`GET /e2e/detail-body-fill`。Origin返回真实JSON response body、`application/json`和固定E2E headers/cookies。
4. 等待动态`capture.request-row.<exchangeId>`出现并点击；点击`capture.inspector.tab.response`，等待按需`body.read-range`完成，确认`capture.inspector.body-view`与`capture.inspector.body-pane`都可见。
5. 同一帧读取`capture.inspector.scroll`、BodyViewer root和CodeViewer pane的`getBoundingClientRect`：pane height必须≥320px；scroll bottom减BodyViewer bottom必须为18px设计padding（容差16–20px）；BodyViewer bottom与pane bottom差绝对值<1px。
6. 点击`capture.inspector.tab.request`加载测试发送的200行JSON request body。让外层Inspector停在距底部80px且鼠标位于`capture.inspector.body-pane`；先用wheel确认Monaco内部滚动，再把Monaco垂直滑块拖到底并记录外层scrollTop；继续同方向wheel 300后，外层scrollTop必须增加，证明内部边界把滚动交回外层。
7. 附加`body-viewer-geometry.json`（含两段scrollTop）、最终截图、trace、Main/Renderer日志和metadata。fixture进入Settings→Proxy；若`settings.proxy.restore`存在则点击并等待消失，然后正常Close，验证Main/Core PID退出、8888可重新bind并删除profile。

### 预期效果

Response tab只有一个Body section时，toolbar保持40px，正文pane吃满Inspector scroll扣除22px top/18px bottom padding和section header后的全部剩余高度；不能只让外层Section变高而让CodeViewer pane塌成一条线。Request tab的pane独立滚动到边界后，继续wheel必须自然驱动Inspector外层滚动。

### TDD证据要求

- 修复前`039dd42`运行字节级相同workflow：几何契约先Green；Monaco到底后的wheel未传给Inspector，外层`scrollTop` expected `> 8.666666984558105`、received `8.666666984558105`，取得业务Red。Main PID `36488`、Core PID `34584`完成销毁，8888释放。
- 当前提交运行同一workflow为`1/1` Green；Main PID `31796`、Core PID `3600`完成销毁，`gracefulDestroyVerified: true`，8888释放且系统代理恢复。

<a id="capture-list-virtual-scroll"></a>
## `capture.list.virtual-scroll`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查列表空、selection=null、scrollTop初始。
2. 点击readiness Enable并完成授权，等待Recording；一次制造超过viewport和overscan的真实请求，等待总计数稳定。
3. 检查DOM中的request row数量远小于总记录数。
4. 滚动到中间，点击一个动态request row并记录scrollTop/selection。
5. 点击 `shell.workspace.rules`，再点击 `shell.workspace.capture`。
6. 确认selection、Inspector和scrollTop保持。
7. 在停靠底部时产生新请求，确认自动跟随；离开底部后再产生请求，确认不抢滚动位置。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证销毁、8888释放和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

TanStack Virtual只渲染有限row；大量数据下选择、滚动和跨workspace状态稳定；实时追加遵守stick-to-bottom语义。

<a id="capture-inspector-body-modes"></a>
## `capture.inspector.body-modes`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Inspector=Headers、selection=null、MITM off。
2. 点击readiness Enable并完成授权，等待Recording；制造一条JSON response并点击其request row→Response tab。
3. 点击 `capture.inspector.body-mode.auto`，验证MIME探测和pretty JSON。
4. 点击 `capture.inspector.body-mode.text`，验证原始UTF-8文本。
5. 点击 `capture.inspector.body-mode.json`，验证显式格式化；另用非法JSON验证保留原文。
6. 点击 `capture.inspector.body-mode.hex`，逐字节比对offset、hex和ASCII。
7. 制造大 body，验证完整正文仍可查看与复制。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Auto/Text/JSON/Hex语义准确；真实body range与显示一致；非法内容和preview上限不会被误报或撑破布局。

<a id="capture-protocols-without-mitm"></a>
## `capture.protocols.without-mitm`

**状态**：planned
**策略**：shared

### Steps

1. 创建fresh profile/evidence和plain HTTP/WS、secure HTTPS/WSS origins；启动trace与新Electron。
2. 等待App/Core/8888和Proxy readiness modal；确认Paused/Not recording、CA absent、MITM off；点击 `capture.readiness.enable`并完成授权，等待Recording。不得Generate CA或Start decrypting。
3. 通过8888发送HTTP POST。点击其动态request row，依次打开Headers/Request/Response/Timing/Cookies/TLS与四个body mode。
4. 建立WS，发送text `plain-text`和binary `01 02 03 04`；origin原样echo并clean close。点击handshake row→Messages，再点击四个动态frame。
5. 建立HTTPS，发送带marker header/body的请求并读完response后clean close。
6. 建立WSS，完成text/binary echo并clean close。
7. 点击两个不同port的CONNECT rows→Tunnel tab，确认Encrypted、TLS tunnel和metadata-only说明；在全UI搜索并确认HTTPS path/header/body和WSS message均不存在。
8. 点击 `capture.clear`；进入Settings Storage刷新，确认Exchange/Body=0、Session=1；进入Proxy点击Restore，确认非owned和Paused；保存evidence。
9. 点击 `shell.window.close`，验证Main/Core/Worker全退、8888释放且系统代理恢复。
10. 关闭全部origin/client并删除profile。

### 预期效果与字段矩阵

**HTTP summary/detail**

- Summary：POST、host、path+query、200、h1、json、request/response bytes、completed duration；
- Request headers：host、connection、content-type、content-length、`x-interceptor-e2e-request: http`；
- Request body：body hash可读、media type/size正确、JSON与发送值一致；
- Response headers：content-type、`x-interceptor-e2e-response: http`；Cookie不在Headers重复；
- Response body：Auto/Text/JSON/Hex与真实UTF-8字节一致；
- Cookies/Timing/TLS：两个cookies、真实TTFB/body段、plaintext且无证书链。

**WS handshake/messages**

- Summary：GET、scheme=ws、`/e2e/plain/ws`、protocol=ws、101、Connected、clean completed；
- Upgrade headers：connection、upgrade、sec-websocket-version、sec-websocket-key；
- Frames：client→server/server→client各一条text和binary，seq递增、opcode=1/2、size/timestamp正确；
- Payload：text与echo一致，binary hex=`01 02 03 04`，body range size/end正确。

**HTTPS/WSS privacy boundary**

- 客户端HTTPS得到200/JSON，WSS完成echo，证明tunnel真实可用；
- Capture各为CONNECT、scheme=https、host=localhost、对应port、protocol=tls、200、MIME=`application/x-encrypted-tunnel`；
- open/request-complete在clean close后更新为completed并有duration；
- headers为空、无request/response body ref、无path/query、无WSS Upgrade header和message；
- Inspector只显示Encrypted、TLS tunnel、No body和metadata-only说明。

<a id="capture-protocols-with-mitm"></a>
## `capture.protocols.with-mitm`

**状态**：planned
**策略**：privileged UI；headed；需要本机UAC/macOS Authorization

### Steps

1. 创建fresh profile/evidence和HTTPS/WSS/H2/gRPC origins；启动trace与新Electron。
2. 等待App/Core/8888和readiness modal；确认Capture列表为空、Paused、Listener=8888、System Proxy未owned。
3. 点击 `capture.readiness.enable`，由App真实发起平台授权；等待Recording。进入Proxy page确认Owned by Interceptor、Current configuration=8888。
4. **Fresh/MITM off基线**：发送HTTPS/WSS并clean close；点击CONNECT rows，确认只显示tunnel且无明文。
5. 选择tunnel，点击 `capture.inspector.setup-https`；确认Generate可用、Install/Start decrypting disabled；点击 `capture.https-setup.generate`。
6. **Generated/not trusted/MITM off**：确认Generated、Not installed、MITM unchecked；再次发送HTTPS/WSS，仍为CONNECT tunnel。
7. 重新打开HTTPS Setup，点击 `capture.https-setup.install`，由本机用户完成原生授权；等待Trusted/Ready，确认Start decrypting enabled但尚未点击。
8. **Trusted/MITM off**：第三次发送HTTPS/WSS，仍只显示tunnel；证明Trust不会自动启用MITM。
9. 在Certificates输入`localhost`并点击Add host；返回Setup点击 `capture.https-setup.start-decrypting`；等待MITM active/switch checked。
10. **Trusted/MITM on**：一次发送HTTPS POST、WSS text+binary、H2 GET+trailer、gRPC request+双response message；通过动态row/frame/message ID逐项验证。
11. 对比Enable前CONNECT rows和Enable后decrypted rows，确认相同secure origin的隐私边界变化。
12. 从UI关闭MITM、移除localhost例外、Uninstall CA并完成原生授权、Delete CA；进入Proxy点击Restore；确认Not generated/Not trusted/MITM off/非owned/Paused。
13. 保存evidence，点击 `shell.window.close`。
14. 验证Main/Core/Worker全退、8888释放、journal无owned、关闭origins并删除profile。

### 预期效果与字段矩阵

**阶段状态**

- Fresh：CA不存在、Trust=false、MITM=false，HTTPS/WSS均tunnel；
- Generated：公开subject/fingerprint/validUntil出现，Trust=false、MITM=false，仍tunnel；
- Trusted：Trust=true、Ready、MITM=false，仍tunnel；
- Enabled：Trust=true、MITM=true，HTTPS/WSS/H2/gRPC完整明文。

**HTTPS H1**

- Summary：secure=true、method/path/query、h1、200、json、bytes/duration；
- Request：scheme=https、`x-interceptor-e2e-request: https`、content headers和JSON body精确；
- Response：`x-interceptor-e2e-response: https`、content type、cookies、JSON body精确。

**WSS**

- Handshake：secure=true、scheme=wss、真实path/query、ws、101、Upgrade headers；
- Frames：双方向text/binary共四条，seq/opcode/size/timestamp和payload精确；
- 与同endpoint的Enable前CONNECT-only记录形成明确对比。

**HTTP/2**

- Summary：secure=true、h2、GET、完整path+query、200、json；
- Pseudo headers：request包含Core实际暴露的`:method/:path/:scheme/:authority`，response包含`:status`，均`isPseudo=true`；
- Regular headers/body：request marker、response marker/content type和JSON精确；
- Trailer：`x-interceptor-e2e-trailer: h2-complete`，kind=response-trailer。

**gRPC**

- Exchange：secure=true、h2、POST、service path、request/response MIME=`application/grpc+proto`、200；
- Request headers：content-type、`te: trailers`和h2 pseudo headers；
- Request message：recognized=true、side=request、一个envelope、compressed=false、offset/length/bytes正确；
- Response messages：两个offset递增envelope，第一compressed=false、第二compressed=true，均非truncated/malformed，payload精确；
- Trailers：grpc-status=0、grpc-message=OK；Inspector显示`gRPC 0 OK`。

**清理**

- MITM switch关闭、localhost例外移除、CA信任卸载、CA文件删除、System Proxy恢复；
- App关闭后无进程、端口、journal或profile残留。

<a id="capture-inspector-resize"></a>
## `capture.inspector.resize`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Inspector width=500、selection=null。
2. 点击readiness Enable并完成授权，等待Recording；制造并选择一条含long URL和body的request。
3. 拖动 `capture.inspector.splitter` 到最小Inspector宽度，检查List与Inspector。
4. 拖到中间位置，再拖到最大允许位置。
5. 切换多个Inspector tab和body mode。
6. 重新选择另一条request，确认布局仍可用。
7. 检查页面无横向/纵向溢出或文字遮挡。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Inspector/List遵守最小宽度；splitter拖动线性且受限；summary、tabs、headers、CodeMirror和Hex不重叠或撑破布局。

<a id="capture-clear"></a>
## `capture.clear`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP/WS origin；启动trace/Electron，等待App/Core/8888/readiness；检查Capture/Storage计数为初始空态。
2. 点击readiness Enable并完成授权，等待Recording；制造含request/response body的HTTP和含text/binary frames的WS。
3. 确认列表、Inspector、Storage counters均非零。
4. 点击 `capture.clear`。
5. 等待按钮从disabled恢复，确认列表、Inspector selection 与 facet 分栏同帧清空；所有 group count 为0，
	不得在列表已显示 `0 of 0` 时短暂残留旧 application id、选项或计数。
6. 进入Settings Storage，点击Refresh。
7. 确认Exchange/Body/WS相关数据归零，Session count保留1，RuleSet/Diagnostics未删。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证spill文件删除、Main/Core/Worker销毁、8888释放和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Clear是唯一删除Capture入口；它删除Exchange、Body和spill，原子重置Renderer timeline与 facet snapshot，
但保留活动Session壳，不影响Rules/Diagnostics。

<a id="capture-tools-body-export"></a>
## `capture.tools.body-export`

**状态**：passed；executor/真实discovery Red、同组Green、关联回归与销毁恢复已闭环
**策略**：native-ui；Windows；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，使用正式Settings配置本地Provider和MCP Client；保留应用当前语言。
	Agent与MCP discovery必须披露`capture_export_body`，不通过Store或内部API注入状态。
2. 经真实UI开启Recording，通过测试拥有的origin/client产生可核验的正文；通过正式Capture查询取得
	Exchange与Body身份。数据包含超过预览上限的正文及需要按原始存储字节保存的正文，不预造导入文件。
3. Agent Ask请求保存正文，先Deny，确认没有Save Dialog或文件任务；再次请求并Allow，在真实原生Dialog
	点击Cancel，确认`started: false`且不伪造job。审批只显示可信身份和元数据，不显示完整URL、正文或路径。
4. 再次Allow并在真实Save Dialog选择测试拥有的目标，取得安全任务摘要；用正式任务查询确认completed，
	只读核对导出文件的长度/hash与真实网络正文一致，不能只校验有限预览或认为任务启动即完成。
5. MCP Auto执行同一Tool仍须弹出真实Save Dialog；验证原生取消及成功保存，Agent/MCP返回均无本地文件
	信息。错配的已知Exchange/Body，以及Clear后的旧身份，不得打开Dialog或创建导出任务。
6. 分别关闭Agent与MCP的Body导出开关，旧Chat/连接不可继续调用；一列撤权不改变另一列。
	原有Capture正文保存入口仍能使用同一正式保存逻辑，不新增测试后门或绕过原生Dialog。
7. 正常关闭后同profile重启，授权保持；Model、origin和文件任务增量为0，旧任务身份不重放。
8. 保存脱敏trace、文件长度/hash、摘要与两代metadata；经产品Close验证Main/Core/Worker全部退出、8888
	释放、完整WinINet与共享journal恢复，再删除本workflow拥有的输出文件与profile。

### 预期与证据

Tool只能导出当前Exchange实际拥有的正文，路径仅由用户在原生Dialog决定。文件数据走Core流式保存，不进入
Renderer或Tool上下文；大正文与编码正文必须以真实文件字节作为证据。审批、执行、Clear竞态与取消边界由
owning unit/integration覆盖，真实Electron锁定用户流程；原生焦点、fixture迁移或构建问题不作为产品Red。

2026-09-07证据：executor13项缺失Tool Red后，当前owner17/17；摘要5项Red后完整42/42。真实discovery Red在
TEMP下`interceptor-body-export-e2e-red-confirmed-20260907`，Main/Core `22608/14492`正常销毁。
同一workflow最终`1/1`（33.8秒），Main/Core `11352/34776`、`5696/10056`均`gracefulDestroyVerified=true`，
trace脱敏、完整进程树、8888、WinINet与journal恢复通过；产物在`interceptor-body-export-e2e-green-mode-20260907`。
文件证据为2,097,815字节gzip响应、256字节请求及32,768字节独立响应，四次导出长度/hash一致，原UI保存入口通过；
撤权、Clear后旧身份拒绝与重启零重放均完成。首次实现后因MCP模式保存未完成而没有原生Dialog，不算产品Red或Green；
等待Client行的公开模式并同时等待原生操作/调用后通过，失败保留在`interceptor-body-export-e2e-green-20260907-140655`。

Capture discovery、Settings双列授权、MCP Browser/Desktop关联真实`4/4`，八代销毁均通过，证据在
`interceptor-body-export-adjacent-e2e-20260907-142551`。最终Desktop615/615、Tools277/277、MCP32/32、
全workspace typecheck与Core正文导出integration6/6通过；设计交互70/70、Body/Settings十视图94/94 targets，
0 missing/flagged、最大0.6px。当前Windows package、artifact audit（1,294 files / 392,907,153 bytes）、
实际production audit0漏洞与packaged smoke1/1（49.2秒）通过；smoke证据在`interceptor-body-export-smoke-20260907-142942`。
全部日志及相关测试明细见[Transfer验收](../../../../../architecture/features/transfer.md#92-capture-body导出验收)。
本组不覆盖已启动导出与Clear的lease/snapshot和Cancel/rename提交点债务。

<a id="capture-tools-transfer-jobs"></a>
## `capture.tools.transfer-jobs`

**状态**：passed；目标Red/Green、关联回归、销毁恢复与当前产物交付验证闭环；不包含取消提交点竞态
**策略**：native-ui；Windows；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，通过Settings创建本地Provider和MCP Client，Ask Chat discovery必须披露
	文件任务Get/Cancel两项；业务状态不注入。由产品Diagnostics Export经真实Save生成一个独立已完成任务，
	其jobId来自正式Tool结果而不是猜测。
2. Agent静默查询已完成任务，确认身份、种类、计数和终态，结果不含文件名/路径/message/warnings内容。
	对同一任务执行Ask Deny、Allow及Auto取消，验证完成任务状态不变；未知身份返回job:null，不重放文件操作。
3. 开启真实录制，用本地origin通过8888发送较大的非压缩响应，等待Capture记录完整；从产品Capture Export菜单
	选择Archive并经真实Save启动文件任务。进度组件公开真实jobId/state/processed/total，不能从Store读取或seed。
4. 当前Archive仍running时，MCP Get返回同一jobId及进度；MCP Cancel先Deny，再Allow取消。关闭进度弹窗后
	通过UI把MCP切到Auto并启动第二个Archive，再取消第二个运行中任务。两轮确认Core状态cancelled、UI一致，
	输出文件不存在、临时文件已清理，其他已完成任务不变。
	测试不能把已完成任务取消当作本步通过，不向产品新增测试专用延迟或暂停入口。
5. 通过Settings分别撤销两项Agent/MCP权限，旧Chat/连接均不可再调用；MCP独立权限不因Agent撤权被关闭。
	操作中保持应用语言，使用公共automation ID、状态属性与测试自产标识进行断言。
6. 正常退出后同profile重启，授权设置保留；旧代际jobId查询为null，无Model/origin/文件任务重放。
	先验证两代Main/Core/Archive Worker销毁、8888释放及完整WinINet/journal恢复，再删除产品输出与profile。

### 预期与证据

Core的进度、运行中取消及终态幂等由unit/integration与同一真实流程交叉验证；取消必须触发真实文件任务的
AbortSignal并清理I/O，而不是仅将界面改为cancelled。保存各阶段安全job快照、文件hash/存在性、恢复与进程代际，
不归档敏感文件名、完整原始正文或认证数据。原生窗口焦点、任务完成太快或selector失败不作为产品Red。

2026-09-07已有证据：executor缺失Tool Red、进度属性Red、真实discovery Red与摘要value Red后Green。
Archive最后Blob期间取消仍落盘的真实故障由两个文件integration Red锁定，修复后服务7/7、关联23/23通过。
最终本workflow1/1（49.7秒），两代Main/Core `38896/16496`、`42672/10272`均`gracefulDestroyVerified=true`，
完成进程树销毁、8888释放和WinINet/journal恢复；TEMP下`interceptor-transfer-summary-e2e-green`保存trace/evidence。
首次取消落盘失败在`interceptor-transfer-jobs-e2e-first-failure`，不记为正常销毁。此前按用户要求保存进度时，
MCP Browser因旧48项目录断言失败，MCP Desktop与当前产物交付验证尚未执行。
2026-09-07恢复后仅补剩余门禁：MCP Browser/Desktop更新50项目录并显式断言两项Transfer Tool，真实关联流程
`2/2`（1.0分钟），三代Main/Core `18380/31780`、`25100/19176`、`27328/7696`全部正常销毁，
8888、WinINet与共享journal由宿主guard验证恢复；证据在TEMP下
`interceptor-transfer-delivery-mcp-20260907-130205`。Desktop typecheck、当前Windows package、artifact audit
（1,294 files / 392,903,421 bytes）及packaged smoke `1/1`（48.7秒）通过；smoke证据在TEMP下
`interceptor-transfer-delivery-smoke-20260907-130801`。线上production audit本轮被执行策略拦截，
经锁文件、依赖清单、npm配置和补丁不变核对后，明确复用同日Diagnostics的零漏洞结果，不计为重新执行。
已有Red/Green未重复长跑；取消提交点竞态继续保留为独立欠账。

<a id="capture-tools-har-transfer"></a>
## `capture.tools.har-transfer`

**状态**：passed；共享IPC/Agent/MCP流程、前置Red、最终Green及退出恢复已验证
**策略**：native-ui；Windows；两代真实Electron；host-safety-guard

### Steps

1. 独立profile与trace启动真实Electron，经Settings配置本地Provider和MCP Client，保持应用语言；
	通过正式discovery确认`capture_export_har`和`capture_import_har`可见。
2. UI开始Recording，通过真实origin/client产生两条可区分HTTP记录，含文本/二进制正文、Authorization
	和Cookie；身份来自正式Capture查询。记录产品自产字节与计数，不写HAR业务输入或注入Store。
3. Agent Ask Export先Deny，再Allow后原生Cancel，确认无文件/任务；随后Allow在Save Dialog选定目标，
	等正式任务completed，只读核对HAR 1.2、范围、最终headers与完整正文，Tool只返回安全任务摘要。
4. Agent Auto Export仍经Save；覆盖filter/selected范围、遮罩Authorization/Cookie与strip bodies，
	对照同workflow真实流量验证输出，不用空结果冒充筛选成功。
5. Agent Ask Import先Deny，再Allow后原生Cancel；通过产品Clear清空后，从Open Dialog选择步骤3生成
	的HAR，等待import completed并验证Capture恢复可表达的记录与正文。导入本身不隐式Clear或覆盖已有数据。
6. MCP Auto分别执行Export/Import，仍经真实Save/Open，选择同workflow产品生成的HAR，验证追加与安全结果。
	关闭两项Agent权限不影响MCP，随后关闭MCP权限使旧连接不可发现/执行，两列均保持独立。
7. 同profile正常关闭并重启，确认授权保持，Model/origin/文件操作无重放；旧代际任务查询为null。
8. 保存脱敏trace、文件hash与安全统计、两代metadata；产品Close后验证Main/Core/Worker全退、8888释放、
	WinINet与共享journal恢复，再删除本workflow拥有的输出/profile。首次失败产物保留，不用强制清理冒充Green。

### 预期与证据

标准HAR文件只能由产品真实Export产生再Import，Core执行正式格式映射及隔离Session追加；Tool不操作路径或
读取文件内容。任务摘要不宣称开始即完成；范围、脱敏和正文完整性分别以输出文件和实际Capture结果交叉证明。
- 2026-09-07前置结果：executor33项Red、真实discovery Red、导入通知与Clear历史记录过滤Red。
- 最终共享流程1/1（40.8秒），证据在TEMP下`interceptor-har-shared-entry-green-20260907`。
	- Main/Core `33040/33692`、`40140/24544`正常退出，trace、8888、WinINet和journal恢复已核验。
	- Agent导入2条，MCP追加后4条；Capture菜单再导出4条、导入后6条，IPC使用同一完成通知自动刷新。
	- all/filter/selected、正文和脱敏、原生Save/Open取消、独立撤权、重启零重放全部通过。
- 关联五条E2E 5/5，九代正常退出；证据在`interceptor-har-adjacent-rerun-20260907-182534`。
- 类型检查、Tools310/310、Desktop639/639、MCP32/32、Core相关35/35通过。
- HAR/Settings parity共130/130 targets，0 missing/flagged；当前package/audit/smoke通过，production audit零漏洞。
- 完整证据见[HAR验收](../../../../../architecture/features/transfer.md#har-tool-acceptance)。
	- 损坏HAR、流式内存及提交点竞态不在本workflow造故障验收。

<a id="capture-transfer-har-roundtrip"></a>
## `capture.transfer.har-roundtrip`

**状态**：planned
**策略**：native-ui + os-side-effect

### Steps

1. 创建profile/evidence、HTTP origin和预定输出目录；启动trace/Electron，等待App/Core/8888/readiness；只检查Privacy的HAR默认值和Capture空态。
2. 点击readiness Enable并完成授权，等待Recording；制造含Authorization、Cookie、query、request/response headers及文本/二进制body的多条真实Capture，记录可由HAR表达的基线字段。
3. 点击 `capture.export-menu`→`capture.transfer.har-export`；依次检查all/filter/selected scope计数，选择All并保留body且不遮罩，使用真实Save Dialog导出round-trip HAR。
4. 等待completed；外部只读解析HAR 1.2，确认entries、timings、headers、query、cookies、文本与base64 body对应基线，且Renderer未获得绝对路径。
5. 再次由UI导出一份开启Authorization/Cookie遮罩和strip bodies的HAR，外部只读验证脱敏输出与原文件不同且无敏感值/body。
6. 通过 `capture.clear` 的真实确认框清空Capture；进入Storage Refresh确认Exchange/Body归零。
7. 点击 `capture.import-menu`→`capture.transfer.har-import`，在真实Open Dialog选择步骤3由本workflow导出的HAR；点击Start并等待completed。
8. 在App逐条选择导入记录，将method/URL/status/headers/query/cookies/body与步骤2基线对比；只要求HAR可表达字段等价，并确认脚本文本保持inert。
9. 复制并破坏导出HAR后再次Import，确认failed且当前已恢复列表不变；进入Proxy点击Restore，确认非owned；保存evidence并Close。
10. 验证销毁和系统代理恢复；删除两份HAR及损坏副本，关闭origin并删除profile。

### 预期效果

HAR输入由同一workflow的真实Capture生成；标准HAR可解析，Clear后能通过UI安全导回且可表达字段等价；脱敏/strip语义准确；损坏输入事务性回滚；不把HAR本来无法承载的Interceptor专有字段误当作全保真要求。

<a id="capture-transfer-archive-roundtrip"></a>
## `capture.transfer.archive-roundtrip`

**状态**：planned
**策略**：native-ui + privileged UI

### Steps

1. 创建profile/evidence、HTTPS/H2/WS origins和输出目录；启动trace/Electron，等待App/Core/8888/readiness；只检查Capture空态、CA absent、MITM off和Proxy未owned。
2. 点击readiness Enable并完成授权，等待Recording；从App UI Generate/Install CA、添加localhost例外并Start decrypting。
3. 制造含HTTPS/H2 pseudo headers、trailers、文本/二进制body和WS frames的真实Capture；逐项记录列表、Inspector及frame基线。
4. 点击 `capture.export-menu`→`capture.transfer.archive-save`；在真实Save Dialog选择`.iarchive`并Start，等待completed；外部只读检查ZIP manifest、snapshot、body entries、size/hash/CRC。
5. 通过 `capture.clear` 的真实确认框清空Capture，确认列表/Inspector为空；点击 `capture.import-menu`→`capture.transfer.archive-open`，在真实Open Dialog选择步骤4由本workflow保存的archive。
6. 点击Start并等待completed；在App逐条选择恢复记录，对比协议、pseudo headers、trailers、headers、timings、文本/二进制body、WS帧方向/顺序/payload及Session元数据，要求全保真等价。
7. 复制并篡改同一archive的hash/CRC或加入路径穿越entry，再次Open；确认failed、错误有界、当前已恢复Capture不污染且Worker进入终态。
8. 在App确认任务状态未暴露绝对路径；从UI关闭MITM、移除localhost例外、Uninstall/Delete CA并在Proxy Restore。
9. 保存evidence并Close；验证App/Core/Worker/8888销毁、系统代理恢复且信任库无测试CA残留。
10. 删除archive及损坏副本，关闭origins并删除profile。

### 预期效果

Archive输入由同一workflow的真实Capture生成；保存文件结构自洽，Clear后通过UI打开可全保真恢复Interceptor专有数据；损坏或恶意ZIP被拒绝并回滚；所有系统副作用在结束前恢复。

<a id="capture-bilibili-login-regression"></a>
## `capture.bilibili-login-regression`

**状态**：passed
**策略**：external-profile + os-side-effect

### 前置条件

真实 Edge Default profile 已登录 Bilibili，当前可见标签页为完整 `https://www.bilibili.com/` 页面。测试不写 profile、不注入 Cookie、不调用 typed Preload API 改产品状态，也不代替用户完成登录。

### Steps

1. 启动真实 Electron；在系统代理仍未被 Interceptor 接管时，从当前 Bilibili 页头读取右上角身份入口的 UI Automation 控件类型、层级、可见性与几何关系，确认已登录并保存测试自产基线。判据不使用显示文案、翻译后的 accessibility name、CSS class 或站点私有 API。
2. 从真实 Settings UI 依次点击 Generate、Install 与 MITM switch；等待 CA trusted / MITM active。进入 Capture，通过真实 Recording/readiness UI 接管系统代理。
3. 用 CONNECT + TLS handshake 探测 `www.bilibili.com` leaf，要求由步骤2本次 UI 生成的 root CA 签发；通过 `edge://restart` 让 Edge 重载系统信任，返回原 Bilibili 标签页。
4. 只使用 Edge 公开地址栏 AutomationId `view_1021` 的 ValuePattern 确认当前标签仍是 `https://www.bilibili.com/`；通过刷新按钮 AutomationId `view_1003` 的 InvokePattern执行一次完整页面刷新。
5. 等待本轮 `www.bilibili.com/` 主文档以非 `tls` exchange完成，要求 H2 / 200、存在 `DedeUserID` / `SESSDATA` / `bili_jct` 且无Rule header effect；随后等待页头runtime ID变化并确认身份入口恢复到步骤1的语言无关UIA结构。
6. 重复步骤4–5共三轮。每轮只附加 URL、host/protocol汇总、主文档status、Cookie名称、身份入口结构与页头截图；任何一轮出现匿名入口即失败。
7. 从 UI 关闭 MITM、Uninstall/Delete CA；正常 Close Electron，由产品销毁 Main/Core/Worker、释放8888并恢复原系统代理。测试不通过数据库、profile seed或测试专用命令修复现场。

### 预期效果

Interceptor MITM 对已登录 HTTPS 页面透明：完整页面连续三次真实刷新后，Bilibili 右上角仍保持步骤1采集的身份入口；Cookie不会因 H1/H2 header 归一化、规则钩子或 Capture而丢失或改变语义。

### TDD证据要求

- 现有行为在正式workflow建立后即为Green，因此没有伪造Red，也没有修改Proxy Core转发行为；新增代码仅为真实UI flow所需的公开automation ID测试探针。
- Green必须运行同一workflow三轮全部通过，并保留trace、每轮Capture/UIA evidence、Main/Core/Worker销毁、8888释放、系统代理恢复和CA清理证据。
- 固定登录API路径、显示文案、单独HTTP请求、Cookie/profile注入、数据库修改或MITM关闭均不能作为Red/Green替代。

### 验收证据

- 真实Edge Default profile连续运行六次独立workflow，共18次完整页面原生刷新；每轮主文档均为H2 / 200，身份Cookie存在，三个页头截图均保留头像入口。
- 最终语言无关版本只用`view_1021` / `view_1003`定位Edge，不依赖应用当前语言、窗口标题、站点文案或CSS class。
- 最终metadata记录Main PID `12472`、Core PID `28068`、listener `8888`与`gracefulDestroyVerified: true`；结束后8888空闲、产品进程为0、系统代理恢复为原配置，本轮测试CA指纹已从信任库移除。
