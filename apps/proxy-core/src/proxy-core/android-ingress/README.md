# android-ingress

## 职责：HTTP/WS副本与处理决定

Android持有实际网络连接及TCP/TLS/HTTP/WS协议处理，PC只接收协议副本、
调用规则/断点并返回决定。不接收手机原始TCP、不修改Mockttp、不由PC重复请求源站。
正式字段、应用确认与双向取消见[通信协议](../../../../../../Interceptor-Android/architecture/features/inspection-protocol.md)。

- `entry.ts`直接定义唯一AndroidIngressService，拥有v2控制/协议副本listener；不依赖ProxyService，不开放旧TCP/DNS路径，也不保留旧入口兼容层。
- CoreApplication现已装配唯一入口、共用RuleService/HttpMessageService与Capture事件队列。可信Main通过`android.start { identity: { key, cert }, devicePin }`显式启动，`android.stop/status`分别停止和查询；不自动启动入口或本机Proxy。Main的CoreRpcClient/CoreRuntime已接返回值映射与`onAndroidStatusChange`。
- `android.status`分别报告`listening`、已完成hello的`connected`、回环`host/port`、`recording`与`captureSessionId`；事件不含私钥、pin或session token，也不推断VPN状态。Core现有背压event batch发送变化快照；订阅者异常有诊断，仍确认已收到的batch。
- `interfaces/inspection.ts`：v2 HTTP信封、保序headers、明确bypass/intercept/respond/abort及正文keep/replace。`body.end`必须携带独立的保序`trailers`（无值为`[]`）；记录消费完成后才回复`body.received`，不接受旧缺字段格式。PC构造的replacement只允许空trailers，不复制原正文的校验信息。
- `utils/inspection-protocol.ts`：严格schema及二进制bodyId/offset编解码，不自动bypass非法输入。
- `internal/http-exchange.ts`：请求/响应独立阶段、决定应用确认、每方向单块ack窗口和双向取消。协议失败取消本exchange的规则等待。
- HTTP状态分开保留源站101和PC决定后的101：原始101改为普通状态后按HTTP完成；普通源站响应不能被PC制造为升级。保留101仍必须取得应用确认并交给后续WS阶段，不因为原始状态提前判断实际协议切换。
- `internal/http-channel.ts`：单个已认证WSS上的HTTP交互，连接真实规则/断点与应用确认，增量正文消费后才ack，Capture结算后才确认complete；取消不被断点等待阻塞，关闭握手结束且异步收尾完成后才释放名额。
- PC的请求和响应replacement使用同一串行pump；body.end的异步记录与实际发送完成前不能发送下一body的binary。另一阶段决定完成或提前到达的ack只推进当前pump，不启动并行发送，避免跨body顺序破坏Android的全方向单块窗口。
- 请求的`body.stopped`显式报告提前响应/synthetic下的已知前缀；正常body.end仍要求完整长度。Android可用`body.discard`停止未结束的请求replacement；PC串行发出body.stopped，并忽略其迟到ACK而不释放响应replacement窗口。响应原文另用`response-replaced`：仅允许已应用响应决定、完整replacement已确认后的Android response/original，不能停止applied、bypass、未收完的replacement或WS升级。只有记录消费和双方body.received后才允许exchange.completed，停止前缀不是完整正文或exchange取消。
- `internal/inspection-control-session.ts`：v2 `session.hello/ready`，PC生成随机session/token，按本次hello确认`["http"]`或`["http", "websocket"]`；WS必须带HTTP前置能力，未知/重复/乱序拒绝。返回授权时复制能力列表，断开先撤销凭据和数据权限，不接受旧TCP或重复hello。
- `entry.ts`：只绑定loopback，TLS私钥证明后按已确认设备SPKI/有效期授权；v2 control/exchange独占路径、16条exchange配额、独立Ping、控制撤销和确定性stop。配额直到实际close及异步录制结算后才归还，不依赖ProxyService或任何源站socket。
- [`http-interception/`](../http-interception/README.md)：复用既有RuleService/HttpMessageService，输入副本不变，返回决定及审计，无网络转发。
- `internal/http-recording.ts`的HttpRecording已接正式CaptureService和CaptureEventQueue，收到请求头即建档，实际应用确认后发布规则效果；正文确认等待真实writer处理，Final只取Android applied副本。BodyRuleEffect的Original独立保存，停止前缀和断开保留truncated证据，Pause/Clear与网络终态分离，IO失败留下不可用状态和诊断。通道的录制队列失败也必须执行settle后归还名额。
- HttpChannel和AndroidIngressService依赖具体HttpRecording，不维护镜像录制interface；请求/响应及WS断点使用已建档的Capture ID，暂停或Clear后的交互不提供不存在的记录身份。通道时序测试的double继承产品类，真实HTTP/WS Capture由独立integration及Android lab验证。
- CaptureService持有唯一录制意图，Android入口拥有独立`android-usb` Session；启动不覆盖暂停，已有录制继续结算，恢复不补录暂停期间接纳的WSS。Clear撤销旧资格并保留全部活动Session壳；仍被入口拥有的Session不能单独删除，返回显式conflict。入口启停与Clear串行，所有入口排空后才GC；正常退出及RPC失联均先等待Android收尾再释放Capture，失败不报告成功stopped。
- `tests/integration/run-http-android.mjs`通过真实Android Keystore、pin mTLS、adb reverse和双端产品组件联调HTTP/1、H2与WebSocket；以源站请求次数、正文、trailers及Capture记录核对协议行为，不替代系统TUN或产品UI验收。
- 完整replacement消费后，Android停止仍在等待EOF的原响应：H1关闭对应源站，H2发出对应stream的CANCEL，不能把这次主动停止变成整个exchange的upstream-failed。lab在同一native H1手机连接中先后请求普通、流式替换、普通响应；H2流式替换完成后仍释放另一条已暂停stream。原文按真实end/stopped结算，已有前缀保留truncated；尚无字节时Original为unavailable，不伪造empty。最终applied正文独立完整，已有原文end/trailers不被改写。
- H1/H2共用Android决定执行器，H2每stream独立WSS；TLS ALPN与明文preface由Android处理，PC不承接原始H2帧或源站socket。lab验证快stream完成后再放行暂停stream，GOAWAY不重放，pending手机RST不出站；明文原目标保留prior knowledge，PC改地址到H1源站时不继承旧能力。普通字段不含pseudo-headers，H2输入的Capture protocol为`h2`。不包含HTTP/1 Upgrade h2c、H2 extended CONNECT或完整Android App验收。
- 对reverse仅绑定设备loopback的模拟器，可显式使用测试参数`--emulator-origin`；runner核对真实模拟器标志，native测试源站改用标准host地址`10.0.2.2`，PC控制/数据副本仍通过mTLS WSS与adb reverse。它不修改产品网络目标或添加转发后门，也不默认切换或冒充真实USB；成功标记只在业务及全部清理均通过后输出。
- WS lab使用独立Netty/JZlib手机client与Node ws源站，核对握手header规则、text修改/drop、binary分块、双向ping/pong、正常Close与pending取消；JZlib只属于Android测试APK，不进入产品运行时。
- HTTP authority与源站SNI分别验证，TLS使用独立CA与正常hostname校验；默认lab的native目的地使用设备实际非loopback地址及reverse端口，不在产品中覆盖路由，输入仍是socketpair而非系统TUN。不替代配对、VPN、Main设备管理或Electron E2E。
- `@peculiar/x509`只作为本workspace的devDependency声明，复用已锁定2.1.0生成lab证书，不改变Core runtime dependency或Mockttp行为。

## WebSocket协议副本与压缩

- `interfaces/websocket.ts`与`utils/websocket-protocol.ts`定义独立WS metadata：message、bypass/replace/drop决定和整帧应用确认；与HTTP共用JSON字节限制、信封、UUID和数字校验，不放宽现有HTTP输入。
- `utils/websocket-ids.ts`按exchange前缀、方向、序号和操作生成协议专用UUIDv8。使用已有UUID字节格式与Android标准UUID，不新增通用UUID依赖；精确布局见双端协议。严格序号与派生ID允许完成后删除旧消息状态，不维护无限增长的UUID历史集合。
- `internal/websocket-exchange.ts`保留每方向一个当前消息、每发送方一个未ACK块，完整原文消费后决定，replacement接收后才应用。两方向close均已应用才允许正常完成；重发/交叉取消单独确认，协议错误取消等待。接纳时复制metadata与决定，外部修改不能改变后续状态。
- HttpChannel在同一WSS接收`http.upgraded`，先安装WebSocketExchange和Capture协议状态，再返回`http.upgrade-ready`；升级要求HTTP副本完整消费。WS原文按有界块接收并保存后才确认received，随后调用现有Proxy共用的RuleService和唯一断点配置；replacement使用同一串行pump，`ws.applied`后才更新实际流量并释放当前正文。
- HttpRecording保存text/binary原始帧；控制帧仍参与决定和实际字节统计，不另增Capture帧形状。CaptureService跟踪HTTP四槽与WS双方向的固定writer集合，Clear、删除Session和Dispose统一排空。
- Android对应通道、native streaming/MessageBuilder、高层101/nonce/子协议及压缩协商已接线；四方向使用独立压缩context；消息容量不代表全部并发流的内存上限。
- 双端lab的四路reverse都使用显式device端口和`--no-rebind`，删除时使用同一个端口key；不使用`tcp:0`与实际分配端口混合登记/删除。`adb-reverse.json`记录实际映射，清理核对H2源站会话、Android原始socket和自有映射；不关闭安全检查、不重启共享adb，也不以重试掩盖失败。
