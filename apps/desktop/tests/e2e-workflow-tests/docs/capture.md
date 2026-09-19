# Capture Workflows

本文件定义 Capture 工作区的完整 E2E 流程。每条 workflow 都独立启动 Electron、独占 profile、trace 和 loopback fixture，并从 fresh App 写到 Close/destroy。

<a id="capture-body-fullscreen"></a>
## `capture.body.fullscreen`

2026-09-14末行Copy：origin在原JSON/HTML响应中返回`x-copy-wrap: private, max-age=60, s-maxage=60, stale-while-revalidate=300`；通过自产Header key定位实际行。离开行Copy透明、hover显示，Copy所属末行18px且flex居中，紧随文字4px；原生跨行选择及按钮Copy均为完整Header值。保存`header-copy-last-line-{json,html}.json/png`再断言，原URL/方法Copy与三份正文全屏步骤保留。前置真实Red为父容器54px而非18px（`6340/27488`），最终同一workflow1/1（22.5s）Green（`44632/7112`），两代正常退出并恢复宿主；TEMP `interceptor-header-copy-20260914-e2e-{red,green}`含trace/metadata，不把旧尺寸Green当本次排列通过。

**状态**：passed；现有行为覆盖，未修改产品实现，未人为制造Red
**策略**：真实Capture Request/Response；共享BodyViewer/BodyFullscreen；真实剪贴板

2026-09-14新增Copy尺寸验收已完成：General的POST值使用共享IconButton inline档，按钮18x18px、Lucide图标实际14x14px、padding0；离开行opacity0、hover后1且复制完整POST。前置Red图标实际6x14px、padding1px 6px，Main/Core `16900/6088`正常销毁；最终同一workflow1/1（16.9s）、`15600/18660`正常销毁及宿主guard恢复，unit25/25、Desktop类型通过。TEMP `interceptor-ui-copy-inline-20260914-e2e-{red,green}`保存`header-copy-{json,html}.json/png`及trace/metadata；不修改语言、不强制显示所有Copy，本步骤未改变Header换行结构。

### Steps

1. fresh profile经录制UI开启Capture，真实POST请求通过8888进入本轮origin，分别返回JSON与HTML；不注入Store或正文引用。
2. 选择Capture行后核对标题中的自产host/path，hover标题并真实点击Copy，剪贴板必须是带scheme和origin端口的完整URL。General的Request Method显示11.5px普通文字，无标签背景，hover后Copy得到完整POST。在Request/Response选择Raw，核对MIME和原始正文，通过正式Fullscreen按钮打开唯一dialog；内联与全屏不出现两份正文视图。
3. 正文分组标题按设计使用normal字体行高；MIME/大小计数不继承标题的uppercase和字距，保留原本大小写与normal字距。Request的空Query提示使用当前ConfigProvider正文行高token，不继承Shell压缩行高。真实点击弹层Header的Copy，剪贴板必须逐字等于原始正文；Header的Close退出后保持Raw与相同正文。
4. 再次打开并切Hex，用Escape关闭后仍选中Hex；返回Raw并通过内联Copy确认原始字节不变。响应HTML只作为代码显示。
5. 保存每个正文的身份、Copy/模式断言、trace与截图；Renderer不得有page error，fixture正常退出Main/Core/Worker并恢复8888、WinINet/journal。

### 验证证据

- 2026-09-09 BodyViewer内容、模式和CodeViewer生命周期既有基线15/15 Green，Desktop typecheck通过；真实workflow1/1（12.0s）。没有业务实现或UI样式修改，不新增设计/parity基准，不把本条作为其他全屏调用点的专属E2E证据。
- 2026-09-11共享方法标签flex回归：同一构建与Collection联合2/2（31.3s），本workflow Main/Core9492/1800正常退出。随后补General Request Method普通文字与完整POST复制断言，1/1（13.5s），Main/Core22464/11152正常退出；两代均通过8888、WinINet、共享journal及登记进程恢复。原URL/正文Copy、唯一全屏视图、Raw/Hex和关闭状态保持断言未减弱；TEMP `interceptor-method-value-20260911-e2e*`保存最终trace/metadata。
- 2026-09-11分组文字还原：计数字距、空Query正文token、标题normal三个前置真实Red分别保存；最终与Capture/Composer两处折叠流程3/3（36.2s），本workflow Main/Core17844/13592正常销毁并通过宿主guard。正文unit25/25、Desktop类型、明暗Request16/16通过；详细证据见[请求正文分组](../../../../../architecture/features/capture.md#请求正文分组的计数标签)。
- JSON请求31字节、JSON响应49字节、HTML响应66字节均验证Raw原文、Header Copy、Close、再次打开、Hex与Escape关闭后的模式保持；三张真实dialog截图均为1060x660逻辑像素，Renderer无page error。
- Main/Core `15836/41732`均正常销毁，8888、WinINet/journal恢复；TEMP归档`interceptor-body-fullscreen-green-20260909-205316.zip`，SHA256 `BEE96AB10FF1894DAD5C2B1C22C354469D4EDE11CA76A0ED5350476BA998FE32`，含trace、metadata、三份截图与测试日志。
- 2026-09-10 Inspector URL行高修复后，当前workflow新增标题显示与完整URL Copy断言，1/1 Green、Desktop typecheck通过；Main/Core `9668/5996`正常销毁，host guard恢复通过。原正文三组模式/Copy/弹层断言同跑；TEMP归档`interceptor-inspector-url-green-20260910-133816.zip`，SHA256 `D3E57A744F14A809FC3351740EBE34E3B05CE8056D05EF771DE9320E1D2A15DE`。15个URL宽高已匹配，4个旧页面位置差异独立保留，详见[Inspector行高](../../../../../architecture/features/capture.md#inspector标题行高)。

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

<a id="capture-scenarios-http"></a>
## `capture.scenarios.http`

**状态**：2026-09-15当前Core修复后单独1/1（33.9s）Green，包含十个流式场景及长上传取消；Main/Core `32564/47456`正常退出与宿主恢复，Mockttp及patch不变
**策略**：真实Electron；复用Playground流量库；不启动Playground页面，不新增流量工具的测试

### Steps

1. fresh profile启动真实Electron，经公开Recording控件开始抓包；使用现有`trafficLab`创建真实origin/client。
2. `TrafficLab.run()`运行已有场景默认Draft，所有流量经产品`8888`，不注入Store或直接调用Preload/Main/Core业务API。
3. `h1-json`验证H1/GET/200及固定JSON；`h1-upload`验证完整45字节上传和实际接收计数；`h1-stream`保留三个JSON分块；`h1-early-response`响应先完成仍保留38字节完整上传。
4. 真实检查Request/Response Headers、Raw正文；`h1-abort`源站断开后请求仍保留，不显示200或等待状态。H2由独立workflow验证。
5. 额外413边界使用workflow拥有的真实origin/client：先发送一段上传，再返回分段413响应。收到413响应头时继续接收正文；完整响应结束后，Capture保留413状态、完整响应正文和当时已捕获的上传片段，不要求客户端先断开。此项不新增Playground场景或修改第三方。
6. SSE使用独立loopback origin/client，先保留响应不发头：确认Capture已有唯一自产请求行。再发送200与`text/event-stream`和第一条事件，通过Headers页核对MIME、列表Size核对实际字节；保持连接未结束，发送第二条事件并确认同一行Size增长。两次均独立断言origin未结束、client未完成响应，不能先结束流再验进行中状态。
7. 最后发送第三条事件并正常结束，client收到的完整正文与三条事件逐字节一致；产品Response Text显示全部事件，行身份保持不变。SSE使用既有Text/Hex档位，不要求不存在的Raw控件。保存`sse-inflight.json`、`sse-inflight.png`、场景结果、trace与截图；fixtures关闭origin及Electron，核验Main/Core/Worker、8888、完整WinINet和共享journal恢复。
8. 客户端取消与origin reset各新建一条SSE连接，重复未结束时的Headers、36/72 B与唯一行断言，然后分别由client或origin真实断开。要求client响应未完整结束、origin关闭，Capture同一行保留72 B且没有进行中占位；不把已收到的200改为伪造错误码。分别保存`sse-client-abort.json`与`sse-origin-reset.json`及各自进行中截图，最后仍由同一workflow完整清理。
9. 长上传逐项覆盖未知长度chunked、Content-Length和Expect: 100-continue：公共Keyword输入定位自产path，先只发头，origin必须在正文发送前接收请求；Expect场景等待真实100 Continue。逐段发送2 MiB，前两段各等待origin实际接收并核对Capture同一行的2/4 MB，client和origin均未结束上传。最后发送第三段并结束，origin完整6 MiB的SHA-256必须一致，Capture保留同一行并展示200、完整`upload-ok`响应。保存逐段字节、结束状态、framing与SHA-256，清除Keyword后继续其他场景。
10. 长下载使用真实origin逐段发送三段2 MiB，正常结束、跨Pause/Resume和Clear各使用独立连接。首段后通过产品Recording暂停或Clear，第二段在连接未结束时仍由client接收；普通/暂停场景同一行显示2/4 MB，Clear场景旧行消失且不因后续分块复活。完整6 MiB响应SHA-256一致后，普通/暂停场景保留6 MB及耗时，暂停场景恢复Recording；Clear场景通过已有`h1-json`产生新请求并确认其Capture行出现、旧行仍不存在。分别保存`download-*.json`、进行中截图与完整workflow退出证据，不将本步骤外推为H2/gRPC或文件任务竞态覆盖。

### 证据要求

- 测试对象是Interceptor抓取与展示，不是Playground场景实现；网络返回值只证明流量已产生，产品期望独立写在workflow中。
- 只新增现有产品行为的E2E覆盖，不人为制造Red；若发现产品故障，先保存真实失败证据并补所属模块测试，再修改产品。
- 长上传取消在两个2 MiB分块已由origin接收并由Capture显示后，由client真实断开；origin必须关闭且未完整接收，Capture保留4 MB及同一行且不再显示进行中占位，不要求生成未收到的200或响应正文。
- SSE证据保存响应头发出前及两次事件到达后的行内容、公共行身份、实际字节数与origin/client结束状态；三种结束方式分别记录，不以正常结束通过替代取消/reset。本步骤不代表Rule命中、H2大Range或gRPC streaming通过。
- 通过一个场景不提升整组或39项总量；逐场景记录实际Green及退出恢复证据。
- early response必须在Request区块显示38字节并可读完整`{"request":"continues-after-response"}`；响应为`sent-before-request-completed`。2026-09-09已有owner及真实UI Red，双向结束修复后owner3/3及五场景E2E Green；新413例外单独取得前置Red和最终Green，不能用普通提前200场景的通过替代。
- 413验收不以中断事件为前提，也不把所有错误状态视为同一规则；完整413响应接收后可读取已捕获上传正文，迟到事件不改写终态。真实请求是否继续发送或关闭仍由客户端和origin决定，Core只调整Capture记录。
- 2026-09-09最终HTTP1/1（19.4s）与矩阵8/8通过，Proxy module102/102、Core/Desktop typecheck通过；应用归属迟到不得覆盖终态/耗时，原`h1-abort`等待占位断言保留。
- HTTP Green归档`interceptor-http-item-green-20260909-201206.zip`（Main/Core `45688/44448`正常退出）；完整矩阵为`interceptor-capture-http-final-green-20260909-201525.zip`，SHA256 `2A4274974D3C90F087ED7236C6866613CDDF617485CF2143DE8BD53F253201DD`。八代进程、8888、CA及完整WinINet/journal恢复；前置Red详见[Capture功能证据](../../../../../architecture/features/capture.md#http收尾与验证)。

<a id="capture-scenarios-http2"></a>
## `capture.scenarios.http2`

**状态**：2026-09-15同一workflow1/1（24.2s）通过；既有Headers/trailer/正文、五种Range与源站/客户端错误GOAWAY同跑，CA与宿主恢复通过；源站正常GOAWAY另行跟踪
**策略**：真实Electron；正式Certificates UI；仅本轮CA；host-safety-guard

### Steps

1. 保存完整Root指纹基线，在fresh profile通过Certificates UI生成、安装本轮CA，添加localhost源站例外并开启MITM；不调用Manager。
2. 经UI开启Recording，使用现有`h2-json`默认Draft，经CONNECT/TLS/ALPN向真实origin发请求。
3. 客户端完成H2/200和`x-playground-trailer: h2-complete`；Capture只显示一条自产H2/GET/200行。
4. 真实点击Headers，核对Request `accept: application/json`、Response `content-type: application/json`和trailer；Response Raw正文包含`"protocol": "h2"`与`"path": "/playground/h2-json"`。
5. 保存trace、截图和协议/行身份；`finally`通过UI停用MITM、删除localhost例外，按本轮CA指纹卸载、删除材料并比较完整Root集合。
6. fixture正常退出Electron，验证Main/Core/Worker、8888、WinINet/journal恢复；失败保留profile。fixture不新增unit/integration测试。

同一workflow补充三种多stream场景：每种使用一个真实CONNECT/TLS/H2 session，同时请求两个6 MiB Range。共享TLS origin各先发送2 MiB，尚未结束时通过真实Capture列表核对两条独立H2/GET/206记录及2 MB，在Headers核对Range、Content-Range和Content-Length，保存stream ID、公共行身份、字节数及进行中截图。正常完成后客户端逐流hash一致、原行变为6 MB且Time不再占位；Clear必须点击产品按钮，剩余数据继续完整转发、旧行不恢复，同一连接的新请求仍可录制；取消只发送首条stream的NGHTTP2_CANCEL，源站对应响应关闭、Capture保留2 MB及结束耗时，另一条仍完整接收6 MiB。确定性Core终态由已有H2集成覆盖，UI不虚构未展示的协议字段。每种保存`h2-ranges-<action>.json`和前后截图，最后仍由同一workflow通过真实UI恢复CA/Root及宿主，不增加产品测试专用入口。

继续增加两个session场景，保留上述准备、真实UI断言及清理：`settings`在各到2 MiB时通过客户端发送并等待SETTINGS ACK，确认32 KiB窗口、0字节header table和32 KiB最大frame后，两流完整到6 MiB；`goaway`在相同位置正常关闭客户端session，记录此时closed但尚未destroyed，已有两流完整结束后确认连接已销毁，再由新H2连接发`after-goaway`并在真实列表确认新200行。两场景均保留原行身份、最终字节/hash和结束耗时，`h2-ranges-<action>.json`增加session阶段快照；不把协议客户端的控制操作当作产品API，也不要求UI显示尚未实现的GOAWAY事件。

错误GOAWAY两方向：真实POST的200响应已收到首段256 KiB且声明512 KiB时，分别由源站和客户端发送`INTERNAL_ERROR` GOAWAY。客户端实际中断并只保留首段hash，Capture原行仍保留真实200与部分字节、结束耗时，不显示完整成功；Core集成核对`aborted/failed`终态。源站记录POST仅到达一次，另开下游H2连接发送独立后续请求，真实列表新增200行，旧行及部分正文不改变。沿用原CA准备和恢复，保存错误码、stream/session身份、请求次数、字节/hash、截图和trace；不得注入产品状态或直接调用业务API。背景TLS提示只经公共Dismiss真实关闭，不自动加host；部分正文通过实际Text模式而非JSON Raw查看。

当前证据为TEMP `interceptor-h2-multistream-20260915-e2e-green`，Main/Core `47824/13880`正常退出；三场景stream ID均为1/3，最终字节分别6/6、6/6、2/6 MiB，Clear后旧行0/0，其余保持各1条。首次取消失败源于流量库对Readable二次包装，修复后通过，旧`-e2e`与`33216/9300`退出记录保留；共享gRPC最终1/1（2.8m）和Desktop/Playground类型通过，详见[H2证据](../../../../../architecture/features/capture.md#h2-range与多stream集成)。

SETTINGS/客户端GOAWAY加入后的最终证据为TEMP `interceptor-h2-session-20260915-e2e`，五个Range场景与原H2同跑1/1（27.3s），Main/Core `22300/13000`正常退出及CA/Root/宿主恢复；Core完整H2组11/11、Core/Desktop类型通过。旧三场景结果保留为历史，不替代当前五场景。源站/错误GOAWAY与协议事件展示尚未验收。

错误GOAWAY当前证据为TEMP `interceptor-h2-error-goaway-20260915-e2e-green`和同前缀`evidence.json`：两方向同跑1/1（24.2s），Main/Core `41928/47264`正常退出与CA/宿主恢复；各保留262,144 B而非声明524,288 B，POST和恢复请求各1次，新上游session与原session不同。客户端主动关闭可触发Node end，但reset为`CANCEL`且Capture保持非成功终态；源站方向为`INTERNAL_ERROR`。既有11项及新增2项集成通过，源站正常GOAWAY另行失败未纳入此通过范围。首轮背景TLS遮罩和第二轮Raw选择器失败均保留，详细结果见[错误GOAWAY证据](../../../../../architecture/features/capture.md#h2错误goaway)。

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

2026-09-10补充UTF-8最终验收1/1：真实响应使5 MiB边界落在2/3/4字节字符内，分别检查普通文本、未知MIME、代码Raw、工具栏Copy和真实编辑器全选复制；只比较长度/尾部/SHA256，不向trace返回整份大正文。真实Save生成完整正文并校验SHA256，包含预览之外的字节。Main/Core `51180/27120`正常退出且host guard通过。非法字节与Hex保真由相关unit40/40验证；实现前用户禁止E2E，缺真实Red，不能把最终Green当成前置证据。归档及完整边界见[UTF-8预览](../../../../../architecture/features/capture.md#utf-8预览截断)。

2026-09-12受限提示布局代码完成，新增断言待E2E：每个UTF-8预览场景在正文模式确定后，从公共body-view内定位提示条，确认11.5px字号、正文token行高、9px/11px padding与8px gap，图标和提示条垂直居中；保存尺寸JSON与提示截图，再执行原Copy/完整Save断言。用户暂停后未运行此布局的前置/最终E2E，旧UTF-8 Green不作为新增断言通过证据。

<a id="capture-scenarios-body-media"></a>
## `capture.scenarios.body-media`

**状态**：原五场景passed；2026-09-12媒体占位布局代码完成，新增断言待E2E
**策略**：真实Capture UI；Windows原生Save Dialog；现有流量库

### Steps

1. fresh profile启用Recording，分别运行`body-png`、`body-binary`、`body-unknown-binary`、`body-audio`和`body-video`；每次从空Inspector打开自产200行。
2. Response区块长度分别为68、8、5、48、24字节；PNG须实际解码为1x1并保存预览截图；二进制Hex精确显示固定字节序列。
3. 音视频保持现有不读取Renderer正文的边界，显示MIME且无audio/video/iframe播放器；检查图标到详情10px、详情内7px、说明到Save 13px，图标/MIME/大小/说明/Save水平居中。Save仍28px的sm按钮，MIME为13px自然行高、大小为11.5px正文token行高；点击唯一Save并用真实键鼠操作Save Dialog。
4. 只读核对同workflow经产品导出的WAV/MP4文件与独立固定字节一致，不预造导入文件或调用内部API。
5. 保存逐场景证据及trace，Renderer page error为0；fixture正常关闭产品，验证原生窗口、进程、8888、WinINet/journal恢复。

原生Save由平台file-dialog fixture分派：Windows复用原UI Automation和键鼠实现；macOS通过System Events按Main PID/启动时间定位真实面板，以键鼠导航路径和提交。两平台使用相同自产媒体、保存步骤和字节断言，不改写原生返回值。

本次只复验unit和浏览器parity，用户暂停后没有运行布局的前置或最终E2E。以上历史业务Green不外推到新增布局断言；恢复授权后运行原`body-media-scenarios.workflow.ts`并保留尺寸JSON、截图、原生保存字节与宿主恢复证据。

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

UTF-8追加步骤：通过同一真实origin发送超过5 MiB的gzip输入，解码明文在5 MiB处只包含中文字符的前两个字节；Raw/Copy和编辑器全选复制必须只有完整前缀。2026-09-10当前workflow1/1、Main/Core `25284/11364`正常退出且host guard通过；原`min(encodedSize, 5 MiB)`读取契约不变，首次小gzip预期错误不算产品Red，归档见[UTF-8预览](../../../../../architecture/features/capture.md#utf-8预览截断)。

<a id="capture-scenarios-websocket"></a>
## `capture.scenarios.websocket`

**状态**：2026-09-14Compact Tree及Binary消息行均取得各自真实Red；当前同一workflow1/1（54.7s）Green，原四场景与5MiB同跑，Main/Core与宿主恢复通过
**策略**：真实Capture Messages；现有WebSocket流量库；方向/载荷/连接隔离

Binary行排版目标：在原ws-binary的Sent/Received两方向各保存`websocket-binary-row-{sent,received}.json/png`，核对消息行38px、mono10.5px、自然行高和父行center。该值来自设计消息行，不用固定像素补偿单个Binary标签；现有内容/Copy/方向和Tree/UTF-8步骤不变。

Compact正文尺寸：在真实binary JSON消息默认Pretty档、切Tree之前保存`websocket-compact-code-height.json/png`。五行仍各20px、字号12px、上下padding各13px；外框等于实际文字内容加padding及设备上实际边框，不再额外预留固定8px滚动条。先在旧外框取得Red，修复后同一workflow复验，Tree/Copy/全屏和原协议步骤保持。

当前Binary真实Red为lineHeight12.915px（`21904/26272`），Green为normal且38px/10.5px/五列宽度不变（`42520/15276`）；两代均正常销毁/宿主guard通过。TEMP `interceptor-websocket-row-20260914-e2e-{red,green}`含双向JSON/截图、trace和metadata，当前1/1（54.7s），不改写早期Tree的独立前置证据。

### Steps

1. fresh profile经UI开启Recording，经真实WebSocket binary帧发送`{"buildId":8431,"state":"running","branch":"main"}`并由origin完整echo，校验返回字节与binary标志，以1000关闭；从自产Capture行进入Messages/Sent，展开消息并选择Tree。通过已有通用二进制内容探测进入JSON，不修改Core MIME；text帧有明确文本MIME，不强行要求Tree。实际树面板必须容纳全部五行，不能只剩边框/padding；通过DOM状态切换根节点折叠/展开并核对高度随内容变化，正文Copy必须等于原始JSON。全屏保留原MIME/Save与同消息，关闭后保留Tree；保存改前/改后截图与树面板尺寸JSON。该步骤在旧四场景前执行，避免把相邻历史selector失败当目标Red。
2. 依次运行已有Text、Binary、Bidirectional和Control默认场景，每个独立WebSocket经8888产生真实101握手并以1000关闭。
3. 选择自产Capture行，进入Messages并切换Sent/Received/All；Text各方向1条，Binary各方向1条，双向场景Sent 1条/Received 2条。
4. 文本载荷分别为`hello from client`、`client message`、`origin message`；Binary为`00 01 02 03 ff`，逐行展开并用真实Copy验证完整值。
	展开后的载荷标题必须显示当前语言的方向和类型，不得泄漏`capture.text`等资源键；通过自产帧的Copy automation ID定位标题，不切换语言或用翻译文案定位。文本发送/接收两态分别保存真实截图。
5. Control场景完成Ping/Pong/Close协议交互；按现有产品语义不把控制帧伪造为数据消息行，Messages为0条。空态保留116px最小高度、12px字体及flex双轴居中布局，不退回未应用样式的默认黑字。
6. 每条场景关闭Inspector，不串连接；保存逐场景身份、trace与截图，Renderer无page error，fixture验证连接、Main/Core/Worker、8888和WinINet/journal恢复。

`ws-control`保存`websocket-control-empty-state.png`及`websocket-empty-presentation.json`，核对真实Messages空态和计算样式；该场景只有控制帧，0条数据消息符合当前产品边界。加载、空结果与错误状态另有明暗parity；不改正文或帧断言掩盖样式问题。

2026-09-09空态样式复验1/1（19.2s）通过，Main/Core `31728/34944`正常销毁并恢复8888、WinINet/journal；归档`interceptor-websocket-message-state-green-20260909-203912.zip`，SHA256 `09AABB44F67EF585F11DB3D9A454ABD5870C16881C314B220464C58C6E1D8835`。parity六个消息状态区匹配，外层Inspector标题保留既有1.6px差异；前置Red与细节见[Capture状态验证](../../../../../architecture/features/capture.md#websocket消息状态)。

2026-09-10追加真实大文本消息：5 MiB预览边界落在四字节字符内，origin和客户端收到完整消息，行预览、专用Copy、展开正文Copy与编辑器内容仅保留完整字符前缀。当前workflow1/1，Main/Core `24244/14348`正常退出且host guard通过；原四场景同时复跑。实现前真实Red缺口与归档见[UTF-8预览](../../../../../architecture/features/capture.md#utf-8预览截断)。

2026-09-11载荷标题资源键修复取得真实Red（Main/Core `42540/1756`）与最终1/1 Green（56.9s，`35356/9584`），两代正常销毁且host guard恢复。标题通过当前语言UI读取，不切换语言；四场景与5MiB预览原断言保留。unit7/7、含catalog16/16及Desktop类型通过，证据见[WebSocket载荷标题](../../../../../architecture/features/capture.md#websocket载荷标题)，不将本项Red用于弥补UTF-8历史缺口。

2026-09-14Compact JSON Tree前置unit3 Red/9 Green后12/12；真实binary帧Red为内容110px/可见0（`20372/19832`），最终1/1（54.8s）展开可见110px、折叠22px、全屏返回110px，`2252/34812`正常销毁及宿主guard恢复。首轮text帧无Tree导致selector失败（`20096/36492`）不算产品Red；全部trace/metadata及`websocket-tree-{expanded,collapsed,restored}.json/png`、全屏截图保存在TEMP `interceptor-compact-tree-20260914-e2e-{red,red-binary,green}`。真实150%DPR下外框约127.33/39.33px，按内容可见高度验证，不把DPR2的128/40硬编码到Electron。原四场景和5MiB断言同时保留。

<a id="capture-scenarios-grpc"></a>
## `capture.scenarios.grpc`

**状态**：2026-09-15当前Core修复后单独1/1（2.5m）Green，包含bidi、Pause/Resume、Clear、原五场景及UTF-8边界；Main/Core `34820/45124`正常退出、CA/Root及宿主恢复通过
**策略**：真实gRPC Inspector；正式CA/MITM UI；现有H2流量库

### Steps

1. fresh profile通过Certificates UI生成/安装本轮CA、添加localhost源站例外并启用MITM；经UI启用Recording。
	- 新增streaming步骤先运行：复用`TlsTrafficRunner`与受控响应流，经真实8888/TLS/H2发送JSON gRPC。仅到达3-byte header时消息为0；收齐第一条envelope后，响应未结束时消息为1且真实Copy正确；第二条payload未收齐时仍为1，补齐后为2且Copy正确。最后结束流并核对实际grpc-status 0；全过程不调用业务API替代UI。
	- 进行中失败必须先保存`grpc-streaming.png`与`grpc-streaming.json`，记录客户端是否结束、源站输入流是否结束及实际消息数，再结束流和恢复CA/Root，不能用流结束后出现消息的截图冒充前置状态。
	- 系统背景流量触发TLS compatibility时，使用公共`settings.tls-compatibility.dismiss`对应的Not now控件真实关闭，不自动添加host或修改MITM策略。清理前移除Playwright locator handler，仍按原正式UI恢复CA与Root；弹窗挡点击的失败不算目标Red。
	- Pause/Resume与Clear分别创建新H2 stream：第一条消息出现后真实点击Recording暂停或Clear，再发送第二条。暂停时第二条仍可查看和Copy，完整结束后恢复Recording；Clear后旧行与消息保持消失，真实两条消息及trailers仍完整到达client，后续五个原场景仍可产生新Capture记录。保存各自进行中和最终状态JSON，不把Clear当作断开网络。
	- 双向streaming同时保持Request/Response未结束，各先发送一条完整JSON消息，再发送第二条缺两字节的payload；逐侧核对第一条可Copy、半条不生成消息，补齐后第二条出现且Copy正确。每次Copy时两侧均未结束，最后共同结束并核对实际请求/响应字节与trailers；保存`grpc-bidirectional-streaming.json/png`。
2. 逐个运行Unary proto、Unary JSON、Trailers error、Compressed及Malformed场景，确认实际H2/200和grpc-status为0/13；不将HTTP 200当gRPC业务成功。
3. 真实选择Capture H2行并打开gRPC；逐侧切换Request/Response，校验消息数、声明载荷长度和`@ 0x0005`偏移。
4. 用真实Copy核对proto Hex、JSON文本及gzip原始压缩字节；Malformed仅响应末尾少两个字节，请求保持完整，UI声明长度保留，Copy只返回实际字节。
5. status 13的Response消息为0，UI显示`grpc-status: 13`和`grpc-message: Playground failure`，不制造响应消息。
6. 保存逐场景身份、trace与截图，Renderer无page error；finally通过UI停用MITM、移除例外、卸载/删除本轮CA并比较Root集合，fixture验证Main/Core/Worker、8888、WinINet/journal恢复。

2026-09-14在途结果：首条31 B到达时真实Red为1条预期/0条实际，client与origin均未结束；Green在63 B时显示两条且实际Copy分别为`stream-first`/`stream-second` JSON。Main/Core Red `10432/37368`、Green `27992/35704`均正常销毁，CA/Root与宿主guard通过；TEMP `interceptor-grpc-streaming-20260914-e2e-{red-valid,green}`保存JSON、截图、trace和metadata。此前背景TLS弹窗挡点击仅算环境干扰；不将本次结果外推为gRPC bidi、Pause/Resume、Clear或压力矩阵完成。

后续已有完整结果保留于TEMP `interceptor-capture-streaming-20260914-final`及同名日志：HTTP/gRPC2/2（2.6m），gRPC Main/Core `47348/39892`、HTTP `13232/7896`正常销毁。上述结果包含bidi、Pause/Resume、Clear，但不含本次越界游标和Final快照竞态修复后的真实复验；用户暂停期间不运行workflow、不补造前置Red。

2026-09-15最终目录为TEMP `interceptor-streaming-acceptance-20260915-grpc-green`。首轮180秒总预算在正文完成后的CA清理阶段用尽，旧目录`-grpc`及正常退出metadata保留；同一workflow改300秒总预算，单步断言和所有场景不变后通过，不将超时当产品Red。

2026-09-10追加多消息边界：Request与Response各两条JSON消息，分别把三/四字节字符放在大消息5 MiB边界，并用完整小消息验证相邻offset；专用Copy、Raw Copy与编辑器内容逐条比较长度/SHA256，不读入下一条envelope。当前workflow1/1，Main/Core `36504/43572`正常退出，Root集合及host guard恢复通过；原五场景同跑，未覆盖gRPC streaming生命周期。实现前真实Red缺口与归档见[UTF-8预览](../../../../../architecture/features/capture.md#utf-8预览截断)。

<a id="capture-scenarios-tls"></a>
## `capture.scenarios.tls`

**状态**：2026-09-12三场景和新增连接示意最终Green；暂停期缺前置E2E Red保留
**策略**：真实TLS/CONNECT；正式Certificates UI；同代解密前后对比

### Steps

1. fresh profile只开启Recording，运行`tls-passthrough`；真实TLS握手完成但不发HTTP应用字节，Capture仅显示localhost的CONNECT/TLS行。
2. 打开Tunnel，核对目标和端口；没有Response标签或正文预览。通过`capture.inspector.setup-https`打开HTTPS设置，确认连接示意可见、Generate可用、Install/Start decrypting禁用；截图后Cancel，仍无正文和CA副作用，不能伪造加密HTTP内容。
3. 经真实Certificates UI生成、安装本轮CA，添加localhost源站例外并开启MITM，不调用Manager。
4. 依次运行`tls-mitm-h1`与`tls-mitm-h2`，分别验证实际ALPN为http/1.1与h2、Capture显示对应GET/200行，Response Raw显示mode与secure字段。
5. TLS页显示https、localhost、本轮端口和TLS事实；保存三个场景证据，Renderer无page error。
6. finally经UI停用MITM、移除源站例外、按本轮身份卸载/删除CA；Root集合完全恢复，fixture验证origin及Main/Core/Worker、8888、WinINet/journal恢复。

2026-09-12恢复授权后执行新增步骤2，连接示意可见、按钮前置状态和Cancel全部通过；后续未解密/H1/H2、CA/Root及宿主恢复同跑。与真实正文workflow联合2/2（45.7s），本条Main/Core13768/41652正常销毁；TEMP `interceptor-update-button-centering-20260912-e2e/`保存完整证据。2026-09-11暂停期间缺少实现前E2E Red的历史事实不变，组件渲染和parity仍不是其替代证据。

### 2026-09-09 场景矩阵证据

- 最终8条workflow/39场景合跑8/8 Green，8代Main/Core均`gracefulDestroyVerified=true`；8888、WinINet/journal及CA恢复。
- TEMP归档`interceptor-capture-39-green-20260909-161253.zip`，SHA256 `959F4804CCCB10BFFE42A178D6ED072600D0C3DC6351A916C30D5D82882718CB`；该矩阵来自当前工作树，不替代HTTP修复尚未通过的额外owner回归。
- Body前置Red：`interceptor-body-mode-red-20260909-153356.zip`、`interceptor-viewer-lifecycle-red-20260909-154133.zip`；相关owner22/22 Green。
- Desktop/Core/Playground typecheck通过；Body九视图parity与仓库旧报告相同，保留11 flagged/1 missing，不改基准。
- 其余场景是给既有产品补覆盖，不人为造Red；首次原生焦点、Header大小写和控件时序错误不算产品Red。
- TLS首轮CA恢复已单独真实UI验收1/1，证据`interceptor-tls-profile-recovery-green-20260909-160512.zip`；恢复用临时workflow已删除，不进入长期套件。

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
7. 原UI Archive Export/Import也完成同组操作，使用同一Main方法。菜单条目使用`display: flex`与`align-items: center`，16px行高、9px/10px padding，扩展名`.iarchive`为9.5px文字及2px/6px padding；总高为38px加扩展名上下边框，DPR=2时40px、DPR=1.5时39.3333px，按真实设备像素校验。Export说明/敏感警示均为12px文字、11px/13px内边距及15px图标，黄/红两种状态不混用。先点击产品Cancel再重新Export；Import保留单个说明警示。分别保存不含背景敏感正文的弹窗截图，完成真实Save/Open及原文件完整性断言；MCP撤权后旧连接不能披露或执行两项Tool。
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
- 2026-09-12当前UI parity菜单与警示最终真实1/1（46.4s），Main/Core10756/32024、10568/11492双代`gracefulDestroyVerified=true`，HTTP/WebSocket完整恢复、权限、2/4/6/8/10计数与宿主恢复同跑；TEMP `interceptor-e2e-resumed-20260912-archive-dpi`及同名log保留两张弹窗图、trace和metadata。首轮DPR1.5下39.3333px被固定40px误报（40828/35836正常销毁），修正按物理像素断言后通过，不算产品Red；暂停期样式前置E2E缺口仍保留。

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

**状态**：passed；owner/真实socket/真实UI Red后Green，完整退出恢复通过
**策略**：os-side-effect

### Steps

1. 创建空profile、evidence与本轮HTTP/WebSocket loopback origin；启动trace和真实Electron，等待App/Core/8888。通过公开Recording/readiness控件开始录制，不切换语言。
2. 通过8888发送HTTP请求A并建立WebSocket连接A；发送自产文本并检查origin收到、客户端echo和Messages双向记录。记录Capture行与Storage的Exchange/Body计数。
3. 点击`capture.recording.toggle`暂停，`aria-pressed=false`；发送HTTP请求B并确认仍得到200但无对应行；在已录制连接A发送第二条文本，双向消息继续完整记录。
4. 暂停期间建立WebSocket连接B并发送自产文本；origin和客户端双向成功，但Capture不得创建B的行、消息或正文。通过Settings Storage导航和Refresh取得暂停后的计数快照。
5. 回Capture点击Recording恢复，`aria-pressed=true`；在B继续发送不同文本，真实echo必须成功，B仍没有Capture行。再次进入Storage点击Refresh，Exchange/Body引用数及正文占用字节必须与上一步相同，不能留下无主正文；真实ExchangeStore会拒绝不存在的Exchange，不能仅靠引用数为零判定没有写入。
6. 恢复后发送HTTP请求C并建立WebSocket连接C，确认新Capture行和C的双向消息可见；A/B/C都用真实Close握手结束，origin关闭码为1000。
7. 保存自产请求路径、消息、公开行身份、Storage前后计数、trace与截图；Renderer无page error，Main/Core无`websocket.persist-failed`。
8. fixture点击`shell.window.close`，由Main退出流程恢复仍owned的系统代理；确认Main/Core/Worker全部退出、8888释放、WinINet与共享journal恢复，再删除本轮profile和网络fixture。不主动Restore代替退出恢复验证。

### 预期效果

Stop只暂停记录，不停止listener或系统代理，不删除旧记录；录制决定以HTTP请求/WebSocket握手开始时状态为准。暂停期间流量继续转发，Resume不能为旧的未录制连接创建孤立消息、正文或等待者；恢复后的新请求继续在同一Core代际追加。退出必须恢复系统代理及进程资源。

### 验证证据

- 2026-09-09修复前真实UI Red：Exchange/Body引用数未变，正文占用151增加到191字节；owner和真实socket同样Red，无测试清理ECONNRESET。有效Red Main/Core `31924/42384`正常退出；第一次Refresh locator失败不计产品Red。
- 修复后Proxy122/122、Core/Desktop typecheck、当前workflow1/1（19.1s）通过；Storage恢复前后均2 Exchange、5正文引用、151字节，旧录制连接在Pause期间继续记录，新连接在Resume后正常追加。Main/Core `45884/37752`正常退出，host guard确认8888、WinINet/journal与登记进程恢复。
- 相邻`breakpoints.queue-isolation`1/1（19.0s），Main/Core `20252/28136`正常退出，完整host guard通过。gRPC streaming及压力验证不属于该workflow通过范围；非目标Main日志错误保留。
- 三层Red、Green、相邻回归的TEMP归档及SHA256见[Capture录制验证](../../../../../architecture/features/capture.md#73-pauseresume验证证据)，不得用该Green替代其他未验收用户流程。

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

**状态**：passed；2026-09-16公共标题36px最小高度、独立折叠与Timing流程已验证
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与HTTP loopback origin；启动本地production Electron，等待App/Core/8888并收敛fresh-profile readiness。
2. 通过`capture.recording.toggle`与`capture.readiness.enable`开始真实Recording；客户端显式经8888发送`GET /e2e/capture/section-collapse`，等待动态row并点击进入Inspector。
3. 用`capture.inspector.section.general`与`capture.inspector.section.response-headers`定位两个真实标题按钮；确认初始`aria-expanded=true`，各自`aria-controls`指向仍挂载且`hidden=false`的唯一正文。两个标题都使用36px最小高度和flex居中，折叠后最小高度不变，不设置固定高度来裁切较高内容。
4. 折叠General，确认其正文`hidden=true`，Response Headers保持展开；再折叠Response Headers并重新展开General，确认同一`aria-controls`正文恢复且两段状态互不覆盖。
5. 切换Timing，通过分组的公共控件与`aria-controls`定位两行内容；标签和时长保留真实文字。父行使用flex、align-items:center、自然行高和12px gap；标签列150px、时长列58px，6px高的比例条flex占剩余宽度。记录实际样式与截图，不用字形或自算矩形中心定义对齐，不改时序数据。
6. 保存截图、trace、日志与metadata；正常Close并验证Main/Core/Renderer退出、8888释放、系统代理恢复和profile删除。

### TDD证据

- Red：两个真实按钮均可定位，但Capture标题没有`aria-expanded`与`aria-controls`。
- Green：独立折叠、ARIA关系与正文`hidden`状态全部通过，workflow `1/1`并保留销毁证据。
- 2026-09-11Timing行高还原：row-format前后8/8、Desktop类型；真实token断言先得到18.5769px/14.145px的Red（Main/Core42888/42628），最终1/1（17.3s，26812/19300），两代均正常销毁并恢复宿主。原折叠/ARIA断言未改；[Timing证据](../../../../../architecture/features/capture.md#timing正文行高)。
- 上述token版随后因用户视觉反馈撤回，不再称为对齐改善。该历史阶段改为标签/时长/进度条中心检查，撤回前后1/1（18.3s/20.1s），Main/Core46032/4400、32356/33148均正常销毁与宿主恢复；保留原折叠和真实时长断言。此检查已被当前父行flex契约取代，不作为当前布局的最终结果。
- 2026-09-13父flex前置Red：row-format14/14后，真实Timing行为`display:grid`而非flex，Main/Core `24104/1252`正常销毁。修改后unit14/14、Desktop/design类型及明暗8目标parity通过；当日晚间首次最终尝试在listener ready前退出且trace清理失败（`10840/27480`），随后用户暂停，不能把该次失败记为Green。
- 2026-09-14恢复后，同一workflow最终1/1（20.2s），Main/Core `47500/17304`的`gracefulDestroyVerified=true`，trace、Timing截图、独立折叠/ARIA及全部flex列宽断言齐全，fixture验证进程、8888、WinINet/journal恢复。当前row-format14/14、Desktop类型通过；TEMP `interceptor-ui-parity-20260914-timing-e2e`及同名log保存结果，原失败证据不覆盖。
- 2026-09-16公共标题前置Red为`min-height:24px`而非36px（Main/Core `17636/5840`）；修改后同一workflow1/1（13.9s）通过，展开与折叠下限、flex居中及原独立折叠/ARIA/Timing断言均保留，`26240/45428`正常退出并通过宿主恢复检查。TEMP `interceptor-shared-header-height-20260916-e2e-{red,green}`保存截图、trace和metadata；[共享标题与全量parity证据](../../../../../architecture/features/capture.md#公共分组标题最小高度)。

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
2. 展开Method facet，经8888发送一条测试自产GET；通过Recording按钮暂停新录制，保留已有行。等待自产Capture行、GET option与非零计数可见，点击该行建立selection。系统代理可能捕获其他应用的CONNECT/GET，不假设全局Method或GET计数恰好为1；保存清空前实际计数。
3. 核对清空筛选按钮disabled且opacity为0.35；真实点击GET option后按钮enabled且opacity为1。点击清空筛选，GET恢复`aria-pressed=false`、按钮重新disabled且opacity为0.35；自产请求和Inspector仍可见，不把清空筛选实现为清空记录。
4. 在facet快照完成更新后点击`capture.clear`，等待Capture行数量变为0。
5. 不使用Playwright auto-retry，直接在同一断言点读取Method group count、GET option数量与当前选中行数量；必须同时为`0 / 0 / 0`。
6. 保存Clear前后原始DOM快照、trace、日志与metadata；正常Close并验证Main/Core退出、8888释放、系统代理恢复和profile删除。

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

**状态**：原导航流程passed；2026-09-12列表布局代码完成，新增断言待E2E
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback TLS tunnel lab；启动真实Electron并通过真实UI开始Recording。
2. 通过产品UI生成并安装测试CA、开启MITM，再在Settings / TLS passthrough添加`127.0.0.1`，返回Capture。
3. 经8888向测试自产随机端口建立真实CONNECT + TLS ClientHello，完成加密echo，等待动态Capture行并打开TLS tunnel Inspector。
4. 点击公开`capture.tls-tunnel.view-passthrough-pattern`；确认App切到Settings，激活TLS passthrough section。
5. 确认产品从当前持久化settings解析出精确覆盖项`127.0.0.1`，对应公开host row滚入可见区域并带`data-highlighted=true`。保存target-layout，确认host/说明14px行高、2px文字组gap，行高不小于66px；不通过修改TLS设置制造推荐标签。
6. 等待3秒后确认同一row仍存在但`data-highlighted=false`；再次从Capture执行跳转时高亮重新出现，证明timer被重新计时。
7. 通过Settings UI删除测试pattern、关闭MITM、卸载并删除测试CA，保存trace、最终截图与Main/Renderer日志；正常Close。
8. 验证Main/Core退出、8888释放、系统代理恢复、profile删除。

### 预期效果

Tunnel入口导航到实际覆盖当前host的最具体持久化pattern；Settings列表自动滚动并提供短暂、可重复的定位反馈。导航不新增pattern、不持久化高亮，也不把wildcard覆盖误显示为精确host配置。E2E用无外部DNS依赖的精确IP验证真实flow；unit另锁定exact优先与多层wildcard选择最长suffix。

### TDD证据要求

- 实现前同一workflow必须Red于导航入口缺失或目标row没有公开高亮状态；selector、构建、UAC或fixture失败不算Red。
- 当前提交必须Green，并保留目标pattern、滚动可见、3秒消退、重复计时、配置清理、Main/Core销毁、8888释放与系统代理恢复证据。

### TDD证据

- 2026-09-12列表布局断言仅预留，用户暂停后前置/最终E2E均未执行；下列历史Green不覆盖新断言。推荐标签与兼容性弹窗仅取得浏览器/parity结果，真实弹窗流程另待实施。
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
3. 启动random-port HTTP origin；测试客户端以absolute-form URL向8888发送`POST /e2e/detail-body-fill`和200项JSON entries，保留两平台同一份原始输入。macOS的真实窗口尺寸由driver/config准备，不在workflow添加额外query或改产品CSS制造滚动。Origin返回真实JSON response body、`application/json`和固定E2E headers/cookies。
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

**状态**：2026-09-15同一workflow1/1（44.1s），原两次运行中取消和新增运行中窗口退出均通过；两代正常退出、文件清理和宿主恢复齐全，新增关闭步骤的历史前置E2E Red缺口保留，不包含取消提交点竞态
**策略**：native-ui；Windows；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，通过Settings创建本地Provider和MCP Client，Ask Chat discovery必须披露
	文件任务Get/Cancel两项；业务状态不注入。由产品Diagnostics Export经真实Save生成一个独立已完成任务，
	其jobId来自正式Tool结果而不是猜测。
2. Agent静默查询已完成任务，确认身份、种类、计数和终态，结果不含文件名/路径/message/warnings内容。
	对同一任务执行Ask Deny、Allow及Auto取消，验证完成任务状态不变；未知身份返回job:null，不重放文件操作。
3. 开启真实录制，用本地origin通过8888发送较大的非压缩响应，等待Capture记录完整；从产品Capture Export菜单
	选择Archive并经真实Save启动文件任务。进度组件公开真实jobId/state/processed/total，不能从Store读取或seed。
4. 当前Archive仍running时，MCP Get返回同一jobId及进度；通过真实Ask批准`capture_clear`，Core必须拒绝，原Capture行身份与导出running状态保持。保存`capture-clear-during-transfer.json/png`及trace，不用任务已经完成后的Clear代替这一断言。随后MCP Cancel先Deny，再Allow取消。关闭进度弹窗后
	通过UI把MCP切到Auto并启动第二个Archive，再取消第二个运行中任务。两轮确认Core状态cancelled、UI一致，
	输出文件不存在、临时文件已清理，其他已完成任务不变。
	测试不能把已完成任务取消当作本步通过，不向产品新增测试专用延迟或暂停入口。
5. 通过Settings分别撤销两项Agent/MCP权限，旧Chat/连接均不可再调用；MCP独立权限不因Agent撤权被关闭。
	操作中保持应用语言，使用公共automation ID、状态属性与测试自产标识进行断言。
6. 关闭Agent面板后，在同一128 MiB真实捕获数据上通过Capture菜单和原生Save再启动一份Archive。保存公开进度、截图并确认任务仍为running；因进度遮罩覆盖自绘窗口按钮，核验测试Main的PID、启动代际和前台窗口后使用真实Windows Alt+F4，不先点Transfer Cancel。退出完成时输出和临时文件必须清理，已完成Diagnostics文件不变，Main/Core/Archive Worker全部退出。
7. 同profile重启，授权设置保留；已完成任务与退出时运行中的旧代际jobId均查询为null，无Model/origin/文件任务重放。
	先验证两代Main/Core/Archive Worker销毁、8888释放及完整WinINet/journal恢复，再删除产品输出与profile。保存两代trace/metadata及运行中关闭前的公开进度；竞态确定性由Transfer/Core关闭unit覆盖，不把当前复验补称为历史前置Red。

### 预期与证据

Core的进度、运行中取消及终态幂等由unit/integration与同一真实流程交叉验证；取消必须触发真实文件任务的
AbortSignal并清理I/O，而不是仅将界面改为cancelled。保存各阶段安全job快照、文件hash/存在性、恢复与进程代际，
不归档敏感文件名、完整原始正文或认证数据。原生窗口焦点、任务完成太快或selector失败不作为产品Red。

取消提交点续作：Cancel返回的是Core确认的实际结果，只有操作中止并完成清理才返回cancelled；如果保存或导入已经提交，应返回completed并保留成功文件/数据及通知。确定性的fsync/rename时序由所属unit/integration覆盖，不为真实E2E注入暂停或故障分支；原运行中取消与重启workflow先确认当前基线，再于修复后同样复跑。

Clear互斥已取得真实前置Red及同一workflow最终Green：运行中Archive未被取消，Clear的MCP调用由成功改为错误，原Capture行由0条恢复为1条；随后原取消和重启步骤继续通过。2026-09-15最终1/1（46.1s），两代Main/Core `13404/16476`、`31212/35940`正常退出与宿主恢复，TEMP `interceptor-capture-transfer-exclusion-20260915-e2e-green`保存JSON、截图和trace；前置代`39964/35616`及旧失败保留于同前缀`-e2e-red`。其他方向的确定性竞争由Core命令单测覆盖，详细范围见[Transfer](../../../../../architecture/features/transfer.md#clear与文件任务)。

当前证据为TEMP `interceptor-streaming-acceptance-20260915-transfer-jobs-native-close`，`transfer-jobs.json`含`shutdownArchiveState: running`、`shutdownOutputRemoved`和`shutdownJobNotReplayed`；Main/Core `3916/22680`及`44120/33196`正常退出。原生粘贴失败和遮罩导致Close等到任务完成的两次验收失败保留在原目录及`-retry`，不算产品Red；具体原因和相关Body/HAR/Archive结果见[Transfer关闭](../../../../../architecture/features/transfer.md#2-四类任务)。

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

**状态**：共享IPC/Agent/MCP流程已有历史Green；新增HAR警示样式检查待E2E，用户暂停期间不执行
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
5. Agent Ask Import先Deny，再Allow后原生Cancel；通过真实Recording按钮暂停并确认`aria-pressed=false`，避免背景流量混入后续all范围。通过产品Clear清空后，从Open Dialog选择步骤3生成
	的HAR，等待import completed并验证Capture恢复可表达的记录与正文。导入本身不隐式Clear或覆盖已有数据。
6. MCP Auto分别执行Export/Import，仍经真实Save/Open，选择同workflow产品生成的HAR，验证追加与安全结果。
	关闭两项Agent权限不影响MCP，随后关闭MCP权限使旧连接不可发现/执行，两列均保持独立。
	Capture菜单的原IPC导出入口先核对菜单`display: flex`及`align-items: center`、`.har`扩展名与9.5px字号，再核对限制警示可见、12px文字、11px/13px内边距和非透明背景，随后执行既有导出/导入断言。
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
- 2026-09-12恢复授权后HAR最终1/1（36.9s），警示/菜单、实际文件脱敏、权限/取消与重启通过，Main/Core10744/41872、40052/2720正常销毁和宿主恢复；TEMP `interceptor-e2e-resumed-20260912-har-paused`及同名log保留trace/metadata。Archive另1/1（46.4s），证据见本页`capture.tools.archive-transfer`。前置E2E历史缺口保留，不把最终Green改写为前置结果。
- 同日FileCommand布局与扩展名还原的断言同样预留，四个明暗菜单parity24/24、八组浏览器打开/取消与中心检查不替代真实文件流程。
- 同日全UI整改后，HAR/Archive菜单断言已同步为flex；原生Save/Open、权限、文件完整性和宿主恢复断言全部保留。用户再次暂停真实E2E，当前仅静态检查通过，以上真实Green属于整改前版本，不能作为本轮flex回归结果。

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
