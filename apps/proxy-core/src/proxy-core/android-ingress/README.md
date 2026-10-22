# android-ingress

## 当前方向：HTTP/WS副本与处理决定

用户已明确确认：Android持有实际网络连接及TCP/TLS/HTTP/WS协议处理，PC只接收协议副本、
调用规则/断点并返回决定。不接收手机原始TCP、不修改Mockttp、不由PC重复请求源站。
正式字段、应用确认与双向取消见[通信协议](../../../../../../Interceptor-Android/architecture/features/inspection-protocol.md)。

- `entry.ts`直接定义唯一AndroidIngressService，拥有已验证的v2控制/协议副本listener；不依赖ProxyService，不开放旧TCP/DNS路径，也不保留旧入口兼容层。
- CoreApplication现已装配唯一入口、共用RuleService/HttpMessageService与Capture事件队列。可信Main通过`android.start { identity: { key, cert }, devicePin }`显式启动，`android.stop/status`分别停止和查询；不自动启动入口或本机Proxy。Main的CoreRpcClient/CoreRuntime已接返回值映射与`onAndroidStatusChange`，ADB管理和产品配对入口仍未实现。
- `android.status`分别报告`listening`、已完成hello的`connected`、回环`host/port`、`recording`与`captureSessionId`；事件不含私钥、pin或session token，也不推断VPN状态。Core现有背压event batch发送变化快照；订阅者异常有诊断，仍确认已收到的batch。
- `interfaces/inspection.ts`：v2 HTTP信封、保序headers、明确bypass/intercept/respond/abort及正文keep/replace。`body.end`必须携带独立的保序`trailers`（无值为`[]`）；记录消费完成后才回复`body.received`，不接受旧缺字段格式。PC构造的replacement只允许空trailers，不复制原正文的校验信息。
- `utils/inspection-protocol.ts`：严格schema及二进制bodyId/offset编解码，不自动bypass非法输入。
- `internal/http-exchange.ts`：请求/响应独立阶段、决定应用确认、每方向单块ack窗口和双向取消。协议失败取消本exchange的规则等待。
- HTTP状态分开保留源站101和PC决定后的101：原始101改为普通状态后按HTTP完成；普通源站响应不能被PC制造为升级。保留101仍必须取得应用确认并交给后续WS阶段，不因为原始状态提前判断实际协议切换。
- `internal/http-channel.ts`：单个已认证WSS上的HTTP交互，连接真实规则/断点与应用确认，增量正文消费后才ack，Capture结算后才确认complete；取消不被断点等待阻塞，关闭握手结束且异步收尾完成后才释放名额。
- PC的请求和响应replacement使用同一串行pump；body.end的异步记录与实际发送完成前不能发送下一body的binary。另一阶段决定完成或提前到达的ack只推进当前pump，不启动并行发送，避免跨body顺序破坏Android的全方向单块窗口。
- 请求的`body.stopped`显式报告提前响应/synthetic下的已知前缀；正常body.end仍要求完整长度。Android可用`body.discard`停止未结束的请求replacement；PC串行发出body.stopped，并忽略其迟到ACK而不释放响应replacement窗口。只有记录消费和双方body.received后才允许exchange.completed，停止前缀不是完整上传或exchange取消。
- `internal/inspection-control-session.ts`：v2 `session.hello/ready`，PC生成随机session/token，按本次hello确认`["http"]`或`["http", "websocket"]`；WS必须带HTTP前置能力，未知/重复/乱序拒绝。返回授权时复制能力列表，断开先撤销凭据和数据权限，不接受旧TCP或重复hello。正式协议与native WS跨端已验证，仍不代表设备管理、VPN或手机UI交付。
- `entry.ts`：只绑定loopback，TLS私钥证明后按已确认设备SPKI/有效期授权；v2 control/exchange独占路径、16条exchange配额、独立Ping、控制撤销和确定性stop。配额直到实际close及异步录制结算后才归还，不依赖ProxyService或任何源站socket。
- [`http-interception/`](../http-interception/README.md)：复用既有RuleService/HttpMessageService，输入副本不变，返回决定及审计，无网络转发。
- `internal/http-recording.ts`的HttpRecording已接正式CaptureService和CaptureEventQueue，收到请求头即建档，实际应用确认后发布规则效果；正文确认等待真实writer处理，Final只取Android applied副本。BodyRuleEffect的Original独立保存，停止前缀和断开保留truncated证据，Pause/Clear与网络终态分离，IO失败留下不可用状态和诊断。通道的录制队列失败也必须执行settle后归还名额。
- HttpChannel和AndroidIngressService依赖具体HttpRecording，不维护镜像录制interface；请求/响应及WS断点使用已建档的Capture ID，暂停或Clear后的交互不提供不存在的记录身份。通道时序测试的double继承产品类，真实HTTP/WS Capture由独立integration及Android lab验证。Android来源与完整设备生命周期仍缺，组件与协议lab不代表VPN可用。
- CaptureService持有唯一录制意图，Android入口拥有独立`android-usb` Session；启动不覆盖暂停，已有录制继续结算，恢复不补录暂停期间接纳的WSS。Clear撤销旧资格并保留全部活动Session壳；仍被入口拥有的Session不能单独删除，返回显式conflict。入口启停与Clear串行，所有入口排空后才GC；正常退出及RPC失联均先等待Android收尾再释放Capture，失败不报告成功stopped。
- `tests/integration/run-http-android.mjs`使用真实Android Keystore、pin mTLS、adb reverse及双端产品组件。原15笔HTTP与3个WS场景保留，另有5个native TLS H2及2个明文H2 exchange：独立Netty手机client、Node H2源站、并行断点、70,001字节原文/替换、trailers、提前响应、GOAWAY、RST和PC改地址。16次HTTP源站请求（11 H1、4 TLS H2、1明文H2）及3条WS连接只由Android发出，25条Capture记录/事件从正式Store核对。
- H1/H2共用Android决定执行器，H2每stream独立WSS；TLS ALPN与明文preface由Android处理，PC不承接原始H2帧或源站socket。lab验证快stream完成后再放行暂停stream，GOAWAY不重放，pending手机RST不出站；明文原目标保留prior knowledge，PC改地址到H1源站时不继承旧能力。普通字段不含pseudo-headers，7条H2输入的Capture protocol均为`h2`。边界见[正式H2联调](../../../../../../Interceptor-Android/architecture/platform/testing.md#正式native-h2双端lab)和[明文H2联调](../../../../../../Interceptor-Android/architecture/platform/testing.md#明文h2-prior-knowledge与改地址联调)；不包含HTTP/1 Upgrade h2c、H2 extended CONNECT或完整Android App验收。
- 对reverse仅绑定设备loopback的模拟器，可显式使用测试参数`--emulator-origin`；runner核对真实模拟器标志，native测试源站改用标准host地址`10.0.2.2`，PC控制/数据副本仍通过mTLS WSS与adb reverse。它不修改产品网络目标或添加转发后门，也不默认切换或冒充真实USB；实际API26范围见[最低平台复核](../../../../../../Interceptor-Android/architecture/platform/testing.md#最低api26与当前h2产物复核)。成功标记只在业务及全部清理均通过后输出。
- WS lab使用独立Netty/JZlib手机client与Node ws源站，实际验证握手header规则、text修改/drop、binary多块、两方向ping/pong、正常Close与pending取消；22次WS断点决定和11条原始Capture帧逐项核对，实际字节不计drop。JZlib只属于Android测试APK，不进入产品运行时。
- HTTP authority与源站SNI分别验证，TLS使用独立CA与正常hostname校验；默认lab的native目的地使用设备实际非loopback地址及reverse端口，不在产品中覆盖路由，输入仍是socketpair而非系统TUN。证据见[正式WS联调](../../../../../../Interceptor-Android/architecture/platform/testing.md#正式native-ws与tls压缩ws双端验收)，不替代配对、VPN、Main设备管理或Electron E2E。
- `@peculiar/x509`只作为本workspace的devDependency声明，复用已锁定2.1.0生成lab证书，不改变Core runtime dependency或Mockttp行为。

## WebSocket协议副本与压缩

- `interfaces/websocket.ts`与`utils/websocket-protocol.ts`定义独立WS metadata：message、bypass/replace/drop决定和整帧应用确认；与HTTP共用JSON字节限制、信封、UUID和数字校验，不放宽现有HTTP输入。
- `utils/websocket-ids.ts`按exchange前缀、方向、序号和操作生成协议专用UUIDv8。使用已有UUID字节格式与Android标准UUID，不新增通用UUID依赖；精确布局见双端协议。严格序号与派生ID允许完成后删除旧消息状态，不维护无限增长的UUID历史集合。
- `internal/websocket-exchange.ts`保留每方向一个当前消息、每发送方一个未ACK块，完整原文消费后决定，replacement接收后才应用。两方向close均已应用才允许正常完成；重发/交叉取消单独确认，协议错误取消等待。接纳时复制metadata与决定，外部修改不能改变后续状态。
- HttpChannel在同一WSS接收`http.upgraded`，先安装WebSocketExchange和Capture协议状态，再返回`http.upgrade-ready`；升级要求HTTP副本完整消费。WS原文按有界块接收并保存后才确认received，随后调用现有Proxy共用的RuleService和唯一断点配置；replacement使用同一串行pump，`ws.applied`后才更新实际流量并释放当前正文。
- HttpRecording保存text/binary原始帧；控制帧仍参与决定和实际字节统计，不另增Capture帧形状。CaptureService跟踪HTTP四槽与WS双方向的固定writer集合，Clear、删除Session和Dispose统一排空。
- Android对应通道、native streaming/MessageBuilder、高层101/nonce/子协议及压缩协商已接线；四方向独立压缩context、PC互通和native/TLS正常Close已验证。完整消息容量在默认堆验证，不以此宣称全部并发流的内存上限或完整手机功能。边界见[压缩与协商验证](../../../../../../Interceptor-Android/architecture/platform/testing.md#permessage-deflate与正式能力协商)。
- 双端lab的四路reverse都使用显式device端口和`--no-rebind`，删除时使用同一个端口key；不使用`tcp:0`与实际分配端口混合登记/删除。`adb-reverse.json`保存实际映射，H2源站会话和Android原始socket关闭另有证据；不关闭安全检查、不重启共享adb，也不以重试掩盖失败。

## 旧路线历史（Core实现已移除）

原v1 Service曾提供loopback mTLS控制/TCP/DNS WSS入口。旧入口、ControlSession、TcpRelay、DnsQuery、v1专用DTO/parser/限额与对应tcp.test/run-android lab已从本module移除；Android旧v1客户端及专属测试也已移除。以下只保留历史事实，不是当前可运行API或命令。原FIN Red保留在验证证据中，删除旧路线不算修复该故障。
唯一协议设计见[Android USB方案](../../../../../../Interceptor-Android/architecture/features/usb-capture.md)。

- `entry.ts`直接定义Service，拥有HTTPS/WebSocket listener与关闭责任。
- `interfaces/`定义已确认设备身份、入口地址和仅在控制连接存活时有效的数据授权。
- `internal/`实现控制授权、TCP背压与内部CONNECT，以及独立DNS查询和上游socket生命周期。
- `utils/`校验消息和已确认SPKI身份。
- `tests/integration/`使用真实mTLS WSS、ProxyService、Rules/Breakpoints和loopback origin。
- 依赖既有`ws`、Node HTTPS/TLS/net/dgram与`ProxyService`；不新增第三方依赖或复制规则引擎。

入口只绑定`127.0.0.1`，upgrade前校验设备证书有效期、已确认SPKI pin、
Bearer token与固定path。TLS请求客户端证书；自签名身份不交给通用CA授权，
而是在完成私钥握手证明后按已确认pin授权，未授权连接不能打开数据WSS。
活动TCP最多16条、DNS独立最多16条，`ws`解码层单消息上限32768字节，不启用压缩。
内部CONNECT与首帧各有10秒建立期限，升级后没有业务空闲deadline；
20秒Ping只判断存活，不放行断点。每方向最多一个未确认块，
两个FIN均确认后才正常关闭WSS；失败或stop销毁实际TCP连接，不重放请求。

服务层integration覆盖实际规则/断点改写、二进制POST与单次发送、暂停Capture、
背压、非法输入/身份拒绝、连接上限、取消/stop解除pending、端口释放和重新启动。
22秒真实等待验证跨过建立期限及Ping；不保证任意时长或手机端点兼容。
证据与运行命令见[跨仓验证说明](../../../../../../Interceptor-Android/architecture/platform/testing.md#pc-tcp-wss-服务层验证)。

调用方先确认双方身份。`/android/v1/control`在设备pin校验后只接受一次
`session.hello`，`ControlSession`生成随机session ID和32字节base64url token；
仅当前控制会话可以授权`/android/v1/tcp`及协商后的`/android/v1/dns`。控制断开先撤销凭据，再取消全部数据流；
并发控制连接、错误版本/能力和重复hello均拒绝，不由数据WSS注册身份。

`DnsQuery`拥有一笔DNS WSS及其connected UDP socket；使用原目标IP/端口，
不依赖HTTP代理解释DNS，不在日志中保存名称或报文。收到UDP截断响应后向同一目标执行
带两字节长度的DNS over TCP；整笔查询期限10秒，原始报文12–32768字节，
DNS单独最多16笔并发。错误长度、错误ID/响应标志、截断TCP响应、超时或取消均销毁实际socket，
不返回伪成功。控制hello可协商`["tcp"]`或`["tcp","dns"]`，ready只返回该次已协商能力；
TCP-only会话不授权DNS。
返回DNS响应后，上游UDP/TCP立即释放，但WSS直到实际close才归还名额；
关闭握手也受整笔10秒期限约束，控制关闭仍会销毁这些正在关闭的WSS。

专用`tests/integration/run-android.mjs`lab通过真实Android Keystore、
native/JNI与`adb reverse`联调本模块及既有Rules/Breakpoints。它只提前设置测试pin，
不预造数据token；Android从正式控制WSS取得授权。测试资源、映射与原生FD均独占并清理。
同一lab通过真实Android native UDP发送两笔连续DNS查询，PC实际UDP resolver仅绑定本机
非回环IPv4地址（gVisor不接收从外部TUN送入的回环目标包），不向外部DNS服务器发送。
lab需要可用的本地非回环IPv4 interface；无该接口时显式失败，不跳过DNS冒充通过。
Android的`PcTcpTunnelTest`在普通Gradle测试中显式skip，只有该lab传入测试参数时执行；
参数仅在androidTest，不进入产品。

旧路线仍有目标Red：上传FIN早于断点放行时当前适配返回空响应。
该路线已停止，不通过Mockttp patch、延迟FIN或删除失败测试宣称修复；不得把旧lab作为新协议Green。
当前尚未连接CoreApplication/Main、Android来源与设备生命周期，
不自动监听，不把lab预置测试pin当成人工配对。
实际VPN、真实USB拔线、HTTPS与Electron E2E仍待接入；最新测试含此失败，不能称全绿。
