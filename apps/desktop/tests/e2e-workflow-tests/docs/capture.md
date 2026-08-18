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

**状态**：planned
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

**状态**：planned
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录并启动仓库本地production bundle；开启BrowserContext trace，等待`app.root`、带真实PID的Core状态和`127.0.0.1:8888`可连接。
2. 若fresh profile显示Proxy readiness，先点Cancel确认没有隐式OS写入；点击`capture.recording.toggle`，在再次出现的readiness中点击`capture.readiness.enable`并完成Windows授权，等待Recording的`aria-pressed=true`。
3. 启动random-port HTTP origin；测试客户端以absolute-form URL向8888发送`GET /e2e/detail-body-fill`。Origin返回真实JSON response body、`application/json`和固定E2E headers/cookies。
4. 等待动态`capture.request-row.<exchangeId>`出现并点击；点击`capture.inspector.tab.response`，等待按需`body.read-range`完成，确认`capture.inspector.body-view`与`capture.inspector.body-pane`都可见。
5. 同一帧读取`capture.inspector.scroll`、BodyViewer root和CodeViewer pane的`getBoundingClientRect`：pane height必须≥320px；scroll bottom减BodyViewer bottom必须为18px设计padding（容差16–20px）；BodyViewer bottom与pane bottom差绝对值<1px。
6. 点击`capture.inspector.tab.request`加载测试发送的200行JSON request body。让外层Inspector停在距底部80px且鼠标位于`capture.inspector.body-pane`；第一次wheel 5000把Monaco滚到底，记录外层scrollTop；第二次同方向wheel 300后，外层scrollTop必须增加，证明内部边界把滚动交回外层。
7. 附加`body-viewer-geometry.json`（含两段scrollTop）、最终截图、trace、Main/Renderer日志和metadata。fixture进入Settings→Proxy；若`settings.proxy.restore`存在则点击并等待消失，然后正常Close，验证Main/Core PID退出、8888可重新bind并删除profile。

### 预期效果

Response tab只有一个Body section时，toolbar保持40px，正文pane吃满Inspector scroll扣除22px top/18px bottom padding和section header后的全部剩余高度；不能只让外层Section变高而让CodeViewer pane塌成一条线。Request tab的pane独立滚动到边界后，继续wheel必须自然驱动Inspector外层滚动。

### TDD证据要求

- 当前未修代码先运行同一workflow：几何契约可Green，但scroll chaining必须因外层scrollTop不增长取得Red；若两者都Green，则现场问题尚未被复现，禁止盲改实现。
- 定位并修复后复跑同一workflow取得Green，同时保留代理恢复、进程销毁与8888释放证据。

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
