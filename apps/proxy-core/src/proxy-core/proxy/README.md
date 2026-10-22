# proxy

**Mockttp 显式代理与 Exchange 采集。** 仅绑定 loopback，由 `proxy.start` / `proxy.stop` 显式控制。

## 主类

`ProxyService`（`entry.ts`）。用 Mockttp `getLocal()` 作显式代理：`thenPassThrough()` 转发 HTTP/1.1 absolute-form 请求；未配置 HTTPS 解密时对 CONNECT 做不解密的字节直通。

`startHttpsDecryption()`必须已经收到实际CA；缺失时显式失败且不改变解密状态、listener或session。仅供TLS分流器使用的临时身份不能用于MITM，不以测试CA或忽略客户端证书校验掩盖Main→Core初始化失败。

录制意图统一由CaptureService持有，ProxyService与ExchangeTracker不再各存一份开关；暂停/恢复仍不改变本机listener、系统代理或已有交互。Android读取同一意图但拥有独立Session，既不调用本代理发送源站请求，也不因设备启动而恢复全局录制。

WS消息决定委托唯一RuleService的`evaluateWebSocketMessage`。Proxy保留原始帧保存和实际转发，
不再自行匹配配置、构造断点或解释hex编辑；每对socket的AbortSignal覆盖正在等待及排队的消息，
异常关闭后不创建迟到断点，Capture未完成也不阻塞业务取消。应用message与控制帧仍保持方向内顺序。

### Android TCP 适配前置验证

用户已明确要求Android通过HTTP/WS协议副本接入Core，不传原始TCP，且不允许修改Mockttp。
Android持有真实连接，Core返回处理决定；PC不依据副本访问源站。下述内部CONNECT是旧路线的
实验适配，不作为正式入口；不能包装CONNECT或调用Mockttp私有API宣称直接接入。
该约束不要求改写现有桌面显式代理，具体见[新协议](../../../../../../Interceptor-Android/architecture/features/inspection-protocol.md)。

`tests/integration/tcp-ingress.test.ts`通过真实loopback origin验证：先向本代理建立CONNECT，
再发送origin-form HTTP原始TCP字节，仍会进入现有Rules和Breakpoints，不是源站直通或抓包副本。
覆盖请求/响应头改写、二进制POST正文与单次发送、断点编辑前不抵达origin、
暂停Capture后仍执行规则并转发、客户端断开解除对应pending且不发送POST。

这不改变Android到PC的mTLS WSS协议。[AndroidIngressService](../android-ingress/README.md)
曾在旧服务层使用该路径并验证WSS→ProxyService→origin；该Core/Android旧路线现已删除，正式Service只收HTTP协议副本，不再调用本代理转发手机流量。
正式v2入口已装配CoreApplication命令与Main RPC；设备生命周期、来源绑定或正式配对仍缺，不能作为手机流量接入验收，
也不证明Android HTTPS/非HTTP协议或真实USB已支持。

#### 提前FIN的入口适配限制

独立测试绕过Android、WSS及`TcpRelay`，分别向CONNECT后的socket和直接HTTP入口
发送完整POST，在真实请求断点处发送上传FIN后放行；两条路径均返回空响应，目标仍Red。
同文件的普通Node `http.createServer()`基线也会在响应等待时因客户端FIN关闭返回方向。
因此不能仅据此把故障归因为Android传输或Mockttp独有缺陷，更不能认定必须修改Mockttp。

当前Core的`ProxyService`承担协议转发并串联Rules/Breakpoints/Capture；Core并无可直接
接收任意TCP流的公共业务API。内部CONNECT只是旧Android实验曾选择的适配，不是手机
必须伪装成本机应用，也不是复用Core规则能力的唯一架构方案。该适配尚未满足原始TCP
半关闭要求。用户已停止Core原始TCP入口方向，改为Android解析协议并与PC交换副本及决定；
旧失败保留为历史证据，不通过修改Mockttp解决，也不把迁移方案当作旧路径已修复。

## 只订阅增量事件

Capture **只订阅 initiated / body-data 类事件，绝不订阅 completed 的 `request` / `response`**。Mockttp 一旦发现 completed listener，就会调用 `waitForCompletedRequest` 与 `body.asBuffer()` 无条件缓冲完整正文——那会让大文件下载吃满内存。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `ProxyService`：Mockttp 生命周期、TLS 配置、上游代理、规则钩子挂载 |
| `internal/exchange-tracker.ts` | `ExchangeTracker`：按 Mockttp request id 聚合单条 Exchange 的完整生命周期 |
| `internal/capture-event-queue.ts` | `CaptureEventQueue`：有界合并队列，摘要经背压窗口推给 Renderer |
| `internal/websocket-bridge.ts` | `WebSocketBridge`：WebSocket 帧转发与断点挂起 |

## 上游平台边界

- Windows保持单转发规则与`{ proxyUrl, noProxy }`配置，原CONNECT/WebSocket处理不变。
- macOS按HTTP/HTTPS注册相同头部处理逻辑，接收`httpProxyUrl / httpsProxyUrl / exceptions / excludeSimpleHostnames`。
- macOS WebSocket复用Mockttp的HTTP/SOCKS/PAC agent；选择发生在Core，不改系统代理或读取journal。
- Main负责接管前配置和生命周期下发；Core只按当前配置转发，旧代际缓存随连接关闭清理。
- 源站证书例外改变时通过Mockttp公开`setRequestRules()`整体替换HTTP转发规则，使未预热的首笔请求也使用最新例外；保留Windows单规则/macOS分协议规则及头部流式hooks，不重启listener或替换WebSocket规则。

## 出站 TLS/H2 生命周期

`CoreApplication`统一拥有[Http2ClientService](../http2-client/README.md)，通过Node公开API保留TLS EOF后
尚未被Mockttp消费者排空的H2响应。源站正常GOAWAY不丢失暂停正文或trailer；旧stream不重放，新请求使用
新上游session。真正提前EOF按显式stream错误进入现有Mockttp/Capture中断路径，不伪造end或completed。
Proxy不重复注册进程订阅，不额外缓存响应，也不修改第三方转发方法。

## 上游配置应用

Core的`upstream.applySettings`先调用`ProxyService.validateUpstream()`，通过现有版本
`pac-proxy-agent`的公开`getResolver()`加载并编译PAC，再保存Workspace偏好并同步切换后续请求的配置。
下载、编译、取消或Workspace写入失败时不调用`setUpstreamProxy()`；切换本身不重启listener、
关闭已有stream或重放请求。`proxy.setUpstream`仍是Main用于运行时同步的内部命令，不保存用户偏好。

Mockttp的H1出站构造校验最终字段并转换为小写多值对象，同名值与空值不覆盖，保留`setDefaultHeaders:false`；
Cookie数组由Node拼接，响应Set-Cookie路径不改。共用header helper使用无原型对象并区分空字符串和缺失，
不改原始Capture或已生成的正文content bytes。

PAC加载成功不等于选路正确。既有Mockttp patch为TLS stub提供HTTPS实际authority，同时保留
`secureEndpoint:false`使TLS字节原样透传；IPv6主机模式也使用合法URL表示。普通PAC通过Mockttp内的
公开resolver适配保留实际目标端口，端口属于Agent缓存key。PAC不复用请求结束后的空闲socket，
避免后续请求沿用首次DIRECT/PROXY而跳过求值；固定代理keep-alive和在途长连接不改变。
两份上游Agent源码保持原版；目标原故障及相关边界有真实集成覆盖，完整交付状态见
[Settings发送契约](../../../../../architecture/features/settings.md#upstream-request-adapter)。

## ExchangeTracker 的顺序前提

Mockttp 的 `request-initiated`、`*-body-data`、`*-trailers` 都经 `setImmediate` 异步发出，而规则钩子走独立 Promise 链，**两者顺序不保证**。因此所有入口都是幂等 upsert；规则结果若先于 `request-initiated` 到达，先存进孤儿表，待 Exchange 建立后合并。

每条 Exchange 用自己的 `tail` Promise 串行化存储写入，保证顺序且不阻塞事件回调。`pendingExchangeWrites`单独跟踪尚未结束的写入，完成后移除；记录进入终态或reset不丢弃排空责任。`settle()`等待调用时已接受的那一批，不依赖活动Exchange数量，也不等待之后的新流量。

请求与响应正文独立finalize，正常提前响应不会丢弃后续上传。413仅在完整响应结束后保存当时已捕获的上传并结束Capture记录，迟到上传不再追加；不关闭真实连接或修改Mockttp。终态保留`completedAt`，应用归属晚到时不得覆盖终态和耗时。

中断等统一收尾中，两侧正文提交和Exchange终态分别排入同一串行队列。任一正文提交失败只记录该次`capture.persist-failed`，另一侧仍完成并保留成功正文，Capture详情仍写入实际终态及已观察字节；不因捕获文件失败改变网络转发。

`ProxyService.stop()`在关闭监听器后排空存储；`prepareCaptureReset()`在推进generation后先排空Exchange写入，再等待WebSocket等Capture操作，最后才允许调用方清理正文。Recording暂停不走此关闭流程，不停止转发。

正文规则结果与`request-body-data`同样可能乱序。`ExchangeTracker`把RuleService的最终replacement
写为主Request/Response Body ref；客户端request stream另作为Original保存到
`requestBodyEffect.originalBody`。Request空原文记`empty`，Response在headers-stage替换时不缓冲
origin正文并固定记`unavailable`。规则结果先到或body-data先到都经同一条`tail`收敛，不从Rule hit
反推证据。

正文replacement先由[`http-message/`](../http-message/README.md)按最终charset与`Content-Encoding`
生成content bytes，并按编辑意图维护继承的`Content-Length`。Mockttp headers-stage hook只替换stream，
不再编码正文或决定CL/TE；`Transfer-Encoding`与H1/H2 framing由Mockttp/Node发送层执行。

## 中断正文收尾

- `abortExchange()`立即固定网络终态、错误及结束时间，把请求移出活动集合；每条中断记录仅保留一个1000ms迟到观测窗口，重复abort不重置它。
- `abortedCapturesByRequestId`持有等待中的采集关联，不重复存储正文。窗口内按原事件顺序写入现有writer，首批正文也可在abort后创建writer；已完成的一侧不重新打开，迟到结束事件不能恢复completed。
- 截止定时器将封口排入`setImmediate`，允许同轮已排队的正文通知先执行。封口后拒绝追加，沿原写入队列finalize、绑定正文并解除CaptureService关联；这是尽力保留窗口，不保证所有任意迟到通知必然齐全。
- `settle()`包含已开启窗口的最终收尾。Clear/stop先取消等待并放弃对应writer；listener重建对等待中的记录立即封口、保留已接受字节和原中断时间。Session清理/Dispose经CaptureService取消窗口，不能在删除后创建writer或复活记录。
- 定时器属于ExchangeTracker；BodyWriter保留write/finalize/abort，不添加延迟提交或网络策略，也不延长真实连接。
- Mockttp异常入口对原`AbortError`及`response.destroyed && !response.writableFinished`沿用中断收尾，不再向已经销毁且未正常写完的响应追加合成错误正文。真实迟到正文仍进入原1秒窗口；连接仍可用时的普通错误响应不变，新增条件不把已正常写完的响应重新标为中断。

## 依赖

- 直接使用的HTTPS proxy agent为ESM；WebSocket bridge在既有异步建连路径加载它，仍等待选路成功后才建立上游连接。
  PAC预检使用ESM动态加载并随包保留WASM，实际Mockttp转发继续由其自有Agent实现负责。

- 依赖：`capture/`（写入抓包数据）、`rules/`（请求/响应评估）、`http-message/`（replacement content bytes）、`client-app/`（源端口反查应用）、`diagnostics/`
- 被依赖：`har/`（复用正文解码工具）
