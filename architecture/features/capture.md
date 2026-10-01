# Feature: Capture

> Core 模块：`apps/proxy-core/src/proxy-core/proxy/`、`apps/proxy-core/src/proxy-core/capture/`、`apps/proxy-core/src/proxy-core/client-app/`
> Renderer 模块：`apps/desktop/src/renderer/features/capture/`；正文查看器内核 `apps/desktop/src/renderer/components/BodyViewer/`

## 1. 职责与边界

Capture 负责**观察并记录**经过代理的全部流量事实，不参与转发决策。

| 归属 | 内容 |
| --- | --- |
| Capture 负责 | Exchange 生命周期、正文落盘、WebSocket 帧、CONNECT 隧道元数据、事件推送 |
| Capture 不负责 | 转发、改写、阻断、断点挂起（属于 Rules） |

**核心原则**

> 收到 request headers 的瞬间就创建 Exchange、写入存储、推送 Renderer。此后的 request body、Rule 效果、response headers、response body、trailer、abort 全部是对**同一个 Exchange** 的增量更新。

Capture 绝不等待请求或响应完成才建立记录。实现位于 `proxy/internal/exchange-tracker.ts` 的 `ExchangeTracker`。

## 2. 参与者

| 参与者 | 归属 | 职责 |
| --- | --- | --- |
| Client | 外部 | 浏览器或应用，经系统代理指向 `127.0.0.1:8888` |
| Mockttp | Core 内库 | 接入连接、TLS/H2 协商、上游转发、生命周期事件 |
| `ProxyService` | `proxy/entry.ts` | 拥有 Mockttp server，订阅事件，协调规则与存储 |
| `RuleService` | `rules/entry.ts` | 计算规则决策（详见 feature-rules） |
| `CaptureService` | `capture/entry.ts` | Exchange 记录、正文内容寻址存储 |
| `ClientAppService` | `client-app/entry.ts` | 把客户端源端口反查成发起流量的本机应用（见 8） |
| `CaptureEventQueue` | `proxy/internal/capture-event-queue.ts` | 按 Exchange 合并的非阻塞事件队列 |
| `CoreApplication` | `core-application.ts` | 定时 drain 队列，按背压窗口推送 |
| Main | Desktop | 转发 event batch，不持有正文 |
| Renderer | Desktop | 应用事件到 Zustand，按需拉详情 |
| Origin | 外部 | 真实源站 |

**ProxyService 是每个请求的唯一协调者**，因为只有它同时处在事件订阅和规则执行两条路径上。

`ProxyService` 用 `mockttp` 的 `getLocal()` 作显式代理，**只绑 loopback**，由 `proxy.start` / `proxy.stop` / `proxy.status` 三个命令显式控制；Renderer 的 Capture bootstrap 在 Core running 后自动调用 `proxy.start(8888)`。未配置解密时 CONNECT 走字节直通（见 5.2）。Core 运行时依赖（Mockttp 的 WASM / 原生插件、`ws`）不内联进 bundle，随包策略见 [../platform/release.md](../platform/release.md)。

## 3. Mockttp 事件语义

Capture使用下列Mockttp事件语义，不把完整事件订阅等同于零缓冲采集。

### 3.1 事件清单

| 事件 | 载荷 | 代表 | 已被规则改写 |
| --- | --- | --- | --- |
| `request-initiated` | `InitiatedRequest` | 客户端原始请求头 | 否 |
| `request-body-data` | `BodyData` | 客户端请求体增量 | 否 |
| `request` | `CompletedRequest` | 完整请求 | 否 |
| `response-initiated` | `InitiatedResponse` | 写回客户端的响应头 | **是** |
| `response-information` | `InformationalResponse` | 1xx 中间响应 | — |
| `response-body-data` | `BodyData` | 写回客户端的响应体增量 | **是** |
| `response` | `CompletedResponse` | 完整响应 | 是 |
| `abort` | `AbortedRequest` | 请求中断 | — |
| `request-trailers` / `response-trailers` | `TrailerData` | trailer（**本仓库 patch 新增**） | 响应侧为是 |
| `rule-event` | `RuleEvent<T>` | 转发过程内部细节（Mockttp 原生，**当前未订阅**） | 见 3.3 |
| `websocket-request` / `websocket-accepted` / `websocket-message-received` / `websocket-message-sent` / `websocket-close` | — | WebSocket 生命周期 | — |
| `tls-passthrough-opened` / `tls-passthrough-closed` | `TlsPassthroughEvent` | 未解密 CONNECT 隧道 | — |
| `tls-client-error` / `client-error` | — | 握手与协议错误 | — |

### 3.2 completed 事件会强制全量缓冲 [必须规避]

`mockttp-server.js` 的 `handleRequest`：

```js
const hasResponseListener = emitter.listenerCount('response') > 0;
if (hasResponseListener) {
    // Start buffering response body if there's somebody who might want to hear about it later
    response.body.asBuffer().catch(() => { });
}
```

`announceCompletedRequestAsync` 同理调用 `waitForCompletedRequest(request)`。

**结论：只要订阅 `request` 或 `response`，Mockttp 就会无条件把完整正文缓冲进内存。** Mockttp 默认 `maxBodySize = Infinity`，因此 67 MB 视频会完整驻留内存。

Capture 必须**退订这两个事件**，改用 initiated + body-data 组合。

### 3.2.1 trailer 需要 patch

**什么是 trailer**：HTTP 允许在 chunked 正文**结束之后**再发一组 header，叫 trailer。它存在的
理由是有些值只有传完正文才知道——校验和、签名、以及最重要的 **gRPC 状态**。

gRPC 的调用结果不在响应头里，而在 trailer：

```text
:status: 200
content-type: application/grpc+proto
<...gRPC 消息帧...>
grpc-status: 0        ← trailer，正文之后才发出
grpc-message: OK
```

也就是说，**没有 trailer 就读不到 gRPC 的成功/失败状态**。请求侧 trailer 在实践中极少使用
（客户端上传完再附校验和），但响应侧 trailer 是 gRPC 的必需品。

**为什么需要 patch**：Mockttp 只在 `CompletedRequest.rawTrailers` / `CompletedResponse.rawTrailers`
暴露trailer，而拿到completed对象意味着全量缓冲正文（见3.2）。不能为读取trailer而订阅completed事件。

因此仓库维护 patch（`patches/mockttp+4.5.0.patch`）给 Mockttp 增加独立的
`request-trailers` / `response-trailers` 事件，让 trailer 与正文缓冲解耦：

- `request-utils.js` 的 `rawTrailers` setter 与 `addTrailers` override 中回调 `options.onTrailers`
- `mockttp-server.js` 增加 `announceTrailersAsync`，仅在有 listener 时启用
- `mockttp.d.ts` / `types.d.ts` 补齐 `TrailerData` 与事件签名

代理转发上游 trailer 时走的正是 `clientRes.addTrailers()`，而 `trackResponse` 已经 override 了
该方法，因此这个 patch 点能覆盖 H1 与 H2 两条路径。

patch 经 `patch-package` + 根 `postinstall` 自动重放，升级 Mockttp 时若不适用会直接报错。

### 3.3 `rule-event`与wire事实

`rule-event` 是 Mockttp **自带**的公开事件（不是本仓库 patch 新增的），`request-step-impls.js`
在转发过程中发出：

`rule-event`可提供以下两类事实，不能用RuleService的改写结果替代：

- **wire 级精确的上游请求头**。钩子返回值之后，Mockttp 还会自己调整 host 与 content-length，因此 `passthrough-request-head` 与钩子返回值可能有细微差异。
- **区分上游中断与客户端中断**。`abort` 事件只代表客户端侧。

Mockttp仅在存在listener时建立事件回调；产品未订阅这些事件时，不得展示对应的wire字段：

```js
emitEventCallback: (emitter.listenerCount('rule-event') !== 0) ? ... : undefined
```

### 3.4 Header观察位置

| Evidence | 来源 |
| --- | --- |
| 客户端原始请求头 | `request-initiated` |
| RuleService计算的请求头 | `beforeRequestHead`返回值，不等同于Mockttp最终写入上游的wire headers |
| Origin 原始响应头 | `beforeResponseHead` 参数 |
| 回客户端的最终响应头 | `response-initiated` |

这些观察点不要求缓冲正文，也不表示全部快照都已入库。Rule效果marker（生效值、被替代旧值、被删除值）由`RuleService`在
执行每个 header action 时直接记录 `previousValues` 产出，不需要从前后快照反推。

### 3.5 顺序不保证

`handleRequest` 内部：

```js
this.announceInitialRequestAsync(emitter, request);          // L527，setImmediate
let nextRulePromise = this.findMatchingRule(...);            // L553，matcher
await nextRule.handle(request, response, {...});             // L566，beforeRequest
```

`announceInitialRequestAsync`、`announceBodyDataAsync`、`announceRuleEventAsync` 全部用 `setImmediate` 延迟 emit，而规则执行走独立 Promise 链。

**因此所有 Capture 逻辑必须按 `request.id` 做幂等 upsert，谁先到谁创建记录，不得假定顺序。**

### 3.6 body-data 是旁路且自带攒批

`trackResponse` 建立独立 `PassThrough` 复制数据，`emitBodyDataEvents` 按 `CHUNK_BUFFER_INTERVAL_MS`（20ms，Mockttp 内置）合并 chunk 后回调。

```js
bodyStream.on('data', (d) => {
    pendingContent = pendingContent ? Buffer.concat([pendingContent, d]) : d;
    if (!pendingContentTimer) {
        pendingContentTimer = setTimeout(() => flushPendingContent(false), CHUNK_BUFFER_INTERVAL_MS);
    }
});
```

Mockttp **不等待**我们处理完成，因此背压责任在 Capture 侧。

### 3.7 HTTP/2 与 ALPN

有 CA（MITM）时使用 Mockttp `http2:true`，双协议浏览器与 H2-only / gRPC 客户端均可协商 H2；**上游按源站 ALPN 独立协商 h2/h1**，下游用什么协议不决定上游用什么。

Electron运行时不追加OpenSSL专用的`@SECLEVEL=0`，Node运行时保留原配置。

Mockttp 4.5 的 `beforeRequest` / `beforeResponse` 会分别等待完整请求与 `streamToBuffer` 完整响应，因此 Proxy 改用 patch 提供的 `beforeRequestHead` / `beforeResponseHead`——**全部规则在头部阶段执行，正文任何情况下都不缓冲**。这样 67 MB Range 视频被取消时不会全量缓冲，也不会污染复用的 H2 session，同时保留浏览器的 H2 pseudo-header 与 trailer。

完整H2帧级观测需要独立采集streamId、GOAWAY、RST和SETTINGS，不能从HTTP成功状态推导。[协议调研](../backlog/research.md)。

## 4. Exchange 状态机

请求侧与响应侧独立推进，因为 Origin 可能在请求体传完前就返回（401/413/417）。

```mermaid
stateDiagram-v2
    direction LR
    state "request" as REQ {
        [*] --> req_headers
        req_headers --> req_body
        req_body --> req_complete
        req_headers --> req_aborted
        req_body --> req_aborted
    }
    state "response" as RES {
        [*] --> res_none
        res_none --> res_informational
        res_none --> res_headers
        res_informational --> res_headers
        res_headers --> res_body
        res_body --> res_complete
        res_headers --> res_aborted
        res_body --> res_aborted
    }
```

对外暴露的聚合状态：

| `state` | 含义 |
| --- | --- |
| `pending` | 已收到请求头，尚无响应头 |
| `request-complete` | 请求已完整，等待响应（WebSocket 101 后也用此值） |
| `response-streaming` | 已收到响应头，正文传输中 |
| `completed` | 双向完成；413拒绝上传时，完整响应结束后保存当时已捕获正文并收尾记录 |
| `aborted` | 客户端中断，或上游连接失败（DNS/TCP/TLS）被镜像为客户端连接错误 |
| `failed` | Capture 持久化失败或协议错误 |

**迁移规则：**

1. 终态（`completed`/`aborted`/`failed`）不可回退。
2. 迟到或重复事件不得重复累加 bytes，使用 observed 计数覆盖而非累加。
3. `abort` 可以从任意非终态直接进入。
4. 413仅在`response-body-data.isEnded`后结束Capture记录，不在响应头到达时结束，不关闭真实请求或连接；此后迟到的上传/中断事件不再改写该记录。其他状态码保持双向结束规则。
5. 应用归属异步解析可以补充已结束记录的应用信息，但必须保留原终态和耗时；不得将413完成记录推回`response-streaming`或丢失正常/中断请求的耗时。

<a id="41-多协议产品e2e覆盖"></a>
### 4.1 流式记录边界

- 响应头到达前已有唯一请求行；收到响应头后更新同一Exchange的状态码、MIME，正文到达时更新实际累计字节。
- 中断时保留真实响应头及已捕获正文，不把已有200改成伪造错误码，也不把部分正文标成完整成功。
- Pause不截断已接受的流量；Clear只移除记录并推进generation，剩余网络字节继续转发，旧行不得恢复。
- 各协议的用户操作和独立断言见[Capture规格](../../apps/desktop/tests/e2e-workflow-tests/docs/capture.md)。

#### H2 Range与多stream集成

- 同一H2 session的各stream分别记录headers、正文、trailer和终态。Range、Content-Range与Content-Length保持协议原值，不因另一stream的进度而合并。
- 单stream的`NGHTTP2_CANCEL`只结束该stream，保留已捕获字节和`aborted`，不影响同session的其他stream。
- Clear移除已有记录但不阻断stream；同连接上的后续新请求仍可录制。
- SETTINGS以真实ACK确认生效；session的`closed`与`destroyed`不同，正常GOAWAY后的在途stream仍需独立收尾，不能仅凭session关闭标记判定正文完成。

<a id="normal-goaway-gap"></a>
##### 源站正常GOAWAY的实现缺口

源站正常GOAWAY后，旧响应可能仅到达262144/393216字节，没有end/trailer，Capture停在`response-streaming`；源站stream正常finish/close且rstCode=0。后续请求转入新上游session并完整捕获，不能据此把旧请求记为成功。

诊断指向暂停的上游stream尚有缓冲时被Node的`socketOnClose → closeSession`销毁，`readableEnded=false`；http2-wrapper等不到end，Mockttp无法转发trailer。修复需要第三方生命周期修改授权；不得在close时假补EOF、强制全量缓冲或把Capture改成completed。

#### H2错误GOAWAY

- 源站或客户端发出非零GOAWAY导致stream中断时，保留真实响应头、已收正文和耗时，记录`aborted/failed`，不得把部分正文当作完整成功。
- 客户端事件可能同时出现reset与end；EOF不是完整成功的充分条件。后续新连接可以继续录制，但不能把旧Exchange回退为completed，也不自动重放POST。

#### gRPC在途正文

- 当前Capture按Exchange/side提供正文快照与有限range读取，复用BodyWriter的内存/spill及串行队列，不额外缓存完整stream或伪造在途hash。Final正文优先；等待writer快照期间绑定Final或删除Exchange时重新读取当前状态，显式空Final也不得退回原文。原writer继续保留清理所有权。
- `grpc.messages`通过`GrpcService.query()`只以5-byte header跳读，独立返回`bodyAvailable`、`bodyComplete`和可读`bodySize`。未结束的半个header/payload等待补齐，结束后才报告真实malformed/truncated；不把HTTP200当gRPC成功或提前制造trailers。Renderer经既有Preload入口每350ms沿游标续读，按`grpc.read-range`预览/Copy已有完整消息，切换方向后忽略旧结果。
- 游标offset可等于当前`bodySize`，在途保留该游标，结束后停止续读；超过可读长度抛`InvalidGrpcCursorError`，Core映射为不可重试的`invalid-message`。正文提交失败时BodyWriter快照结束且不可读，保留observed计数并抛出原错误；ExchangeTracker将请求提交、响应提交和终态写入分开排入现有队列，逐次记录失败而不跳过成功正文或实际终态。
- `ExchangeTracker`以待完成写入集合承担排空，不因终态记录移出活动Map或reset而漏等；`settle()`只等待调用时已接受的操作。`ProxyService.stop()`及`prepareCaptureReset()`都先排空Exchange存储，再让后续关闭/Clear清理正文；正常Recording暂停及网络转发保持。

#### 正文视图隔离

- BodyViewer按模式给CodeViewer独立身份，Code自动格式化不能污染Raw；CodeViewer仅调用`editor.dispose()`，不提前销毁仍绑定的隐式模型。

#### HTTP收尾

- 请求和响应分别finalize；提前响应的正文可立即读取，Exchange按双向完成规则收尾。中断时保留已捕获字节并进入`aborted`。
- 413例外只影响记录：完整接收413响应后保存当时的上传片段并以`completed`收尾，不等待或阻断真实上传；后续片段不追加，也不声称已捕获完整上传。
- `TrackedExchange.completedAt`保留收尾时间，后续summary沿用终态和耗时。

### 4.2 Inspector与正文布局

#### WebSocket与gRPC消息

- WebSocket加载、空结果和错误信息使用116px最小高度的flex居中区域、12px字体和`--text-3`，长信息换行。只有控制帧时，数据消息数为0。
- WebSocket消息行使用38px高度、五列、10.5px mono和自然行高；gRPC消息行同为38px高度、10.5px字号及`line-height: normal`。
- WebSocket载荷由外层消息行展开/收起，保留方向、Text/Binary类型、大小、消息序号和Copy元数据行；内部不再增加独立折叠标题。
- `BodyViewer`仅在`compact && !fullscreen`时让`JsonTreeView`按内容定高，普通和全屏Tree填充容器；Tree行高22px，长内容可滚到末行。
- Tree Copy与Raw使用原文，Pretty使用格式化JSON，Hex Copy生成完整16字节dump。Hex显示按容器及实际`1ch`排布并保留滚动；全屏仍提供MIME与Save。

#### HTTPS设置连接示意

- `HttpsConnectionChain`位于说明段落前，展示Client apps、Interceptor、Internet、流向箭头及TLS锁，示意高71px、下方间距16px。
- 锁颜色和图标取自弹窗读取的有效MITM状态；图标复用Lucide，节点、标签和图标分别由Grid/Flex居中，不使用基线或位移补偿。

#### 公共分组标题最小高度

- `SectionHeader`与设计`CollapsibleSection`默认最小高度36px，flex居中、自然行高，内容可增高。HTTP/WebSocket Replacement不设置更小的局部下限。
- 计数标签保留MIME和单位的大小写，使用normal字距及`text-transform: none`，不继承标题的uppercase。
- 空Query提示的`KvSection.empty`使用正文行高token；标题、空提示和正文容器各自负责排版，不用增加padding补偿文字度量。

#### Timing正文行高

- `RequestInspector.timelineRow`使用flex及`align-items: center`，标签150px、时长58px、比例条占剩余宽度；gap12px、上下padding7px、比例条高6px。
- 比例条依据真实时间段计算；各分组独立折叠并保留ARIA状态，不用字形边界或位移调整同行对齐。

#### 受限正文提示行高

- `BodyViewer.note`使用11.5px字体、`var(--interceptor-line-height)`行高、9px/11px padding及8px gap，图标由flex居中。
- 提示允许换行，切换Hex不隐藏截断或解码失败信息；编辑器文字为12px/21px，不继承外壳的字号。

#### 媒体正文占位布局

- `UnavailableBody`使用40px图标框、13px MIME、11.5px大小、12px说明和28px `Button sm`。`content/details`两层flex分别设置图标到详情10px、详情内7px、说明到Save 13px；MIME使用自然行高，大小使用正文token。
- 音视频和超限图片不读取正文来预览；损坏图片尝试解码后显示不可预览原因。占位页保留Save，不创建音视频播放器。

#### TLS Tunnel元数据与方法标签

- TLS与普通Inspector `Kv.key/value`均为11.5px mono、18px单行高度，`gap: 9px 16px`；长值换行或带控件的行按内容增高。
- `RequestInspector.methodChip`使用自然行高；详情元数据行不套用gRPC消息列表的38px高度。

#### Inspector POST配色

- `RequestInspector`根据实际method给POST标签附加局部class，使用`--yellow`与14%黄色背景，不复用列表徽标的16%底色。

#### Request Method详情值

- General中的Request Method显示完整大写协议值和accent文字，不是方法标签；Copy复制完整大写值。列表、筛选、断点和Composer中的方法标签复用`MethodBadge`。

#### Inspector标题行高

- URL使用自然行高，保留完整URL的hover和Copy，不用字体替换或文字位移补偿布局。

#### Compact正文高度

- Compact CodeViewer与设计Monaco的box/message使用`getContentHeight()`加宿主实际上下边框，不重复预留横向滚动条空间；字号12px、行高20px、上下padding13px。
- PayloadEditor的Original body和WebSocket暂停容器按内容定高，不额外增加底部预留或固定最小高度；普通查看器仍填充容器。

##### 普通消息正文限高与拖拽

- 普通gRPC/WebSocket展开消息的Monaco视图支持可调整高度；HTTP Original/File、断点编辑、Composer、Tree、Hex及全屏遵循各自的布局契约。
- `FramePayload/GrpcMessagePayload → BodyView → BodyViewer → CodeViewer`显式传`resizable`，只有`compact && resizable && !fullscreen`启用。gRPC虚拟列表跟随Inspector外层滚动并使用scrollMargin；WebSocket列表填充剩余空间，队首/排队断点仍使用各自既有布局，不以固定360px高度限制普通消息。
- 初始高度为`min(完整显示内容高度, 所属滚动容器内正文起点至底边的可用高度)`，至少保留一行、原上下padding和实际边框。短内容贴合，不固定为441px或360px；隐藏状态不决定初始高度，字体加载和换行重排仍重新计算。
- 用户可通过正文右下角向上/下拖拽；窗口缩小时按当前容器收缩，恢复空间后还原用户拖拽高度。只改变显示高度，Monaco模型、消息字节、Copy、Save及转发不裁剪。
- 滚轮、触控板和键盘可到达正文首尾；Monaco保持`alwaysConsumeMouseWheel: false`，正文到边界后继续滚动消息列表/Inspector。长消息内部滚动时消息标题及工具栏不被一并滚走。

<a id="body-preview-final-acceptance"></a>
##### 正文预览与完整数据边界

- 文本预览最多2 MiB，完整且不超过1 MiB自动格式化，完整1–2 MiB手动格式化；截断正文禁止格式化。图片使用独立16 MiB上限。
- Original/File与普通消息限高并可拖拽，Text保留完整编辑值，Composer继续填充容器。File仅预览前2 MiB，Forward edited仍发送完整文件。
- 界面预览限制不截断Core正文、网络发送、Save或Archive；Copy使用当前视图定义的预览范围。
- chunked编辑的framing缺陷和源站正常GOAWAY的旧stream丢尾段是独立限制，不能由常规正文显示正确推导为已解决。

#### Header值与Copy

- `KvValue`保留文字可用宽度和自然换行，逐行inline-flex居中；Rule marker与共享18px按钮、14px图标放末行，gap4px，marker不继承失效值的删除线。
- 浏览器临时测量换行并按grapheme边界二分定位，不拆字素、不改变文本或字体。原生选择、完整Copy和hover必须保留，不用trim、剪贴板拦截或隐藏副本修饰结果。
- `Kv`只选择IconButton档位和hover状态，不覆盖共享按钮及图标尺寸。

#### Capture状态栏列间距

- `CaptureStatusbar.bar`高30px，三列之间`gap: 16px`。

#### Capture列表列轨道

- `RequestList`表头与`RequestRow`使用`20/66/minmax(0,1fr)/52/40/44/48/52px`列轨道、gap10px、左右padding14px；表头补偿实际scrollbar宽度。文字使用自然行高，表头34px、请求行52px。
- 容器500px档隐藏Proto/Type，380px档再隐藏Size/Time并将Method列设为62px；Path可缩小和省略，不设置撑破列表的最小宽度。
- `CaptureListbar`清除筛选按钮使用`--text-3`，禁用opacity0.35，hover沿用共享IconButton。清除筛选不清除记录或Inspector；Clear记录才同时清空列表、Inspector及facet计数。

#### UTF-8预览截断

- 完整正文中的非法UTF-8以及预览内部的非法字节仍显示替换字符，不能删除所有替换字符来掩盖坏数据。
- 截断事实由读取正文的调用点通过`previewTruncated`明确传入`BodyViewer`，区分未压缩预览上限和Core解压输出`limited`；`decodeUtf8`使用标准TextDecoder的`stream`选项，文本、Raw及文本Copy使用同一解码结果。未知MIME的内容探测同步识别预览边界，实际坏字节与二进制控制字节仍走Hex。
- WebSocket帧行、FramePayload Copy和gRPC JSON payload Copy复用同一解码，按各自消息长度判断是否超出预览上限，不用整个gRPC body是否结束推断消息边界。捕获数据本身残缺不等同预览上限，不因此隐藏真实坏字节。
- Hex、Body Store、Save及导出仍使用原始字节，预览大小和既有截断提示不变；未新增非UTF-8字符集支持，未改Core或网络协议。Composer等没有传截断标记的完整正文调用保留原行为。

#### 正文全屏

- Fullscreen使用1060x660共享弹层，Header Copy复制原文；Close和Escape退出后保留Raw/Hex模式。
- 再次打开仍使用同一份捕获内容，不同时挂载两份正文视图。

## 5. 调用流程

### 5.1 HTTP/HTTPS 常规请求（主路径）

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant App as CoreApplication
    participant Main
    participant UI as Renderer
    participant Origin

    Note over Queue,App: App 每 50ms 定时 drain 一次，收到 event-ack 后也会立即再 flush。<br/>drain 与下方生命周期阶段无关，同一 Exchange 在一个窗口内的多次<br/>enqueue 会合并成一条，摘要取最新

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Proxy: upsertExchange(request.id)
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: 显示 pending 行
    Main-->>App: event-ack

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头
    Proxy->>Storage: 记录请求 rule effects

    loop 每个请求体分块
        Client->>Mockttp: 请求体分块
        Mockttp-->>Proxy: request-body-data
        Proxy->>Storage: 写入 body writer
        Proxy->>Queue: enqueue exchange-updated
    end
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: requestBytes 增长

    Mockttp->>Origin: 最终请求
    Origin-->>Mockttp: 原始响应头

    Mockttp->>Proxy: beforeResponseHead
    Note over Proxy: 参数即源站原始响应头
    Proxy->>Rules: evaluateResponse
    Rules-->>Proxy: ResponseEvaluation
    Proxy-->>Mockttp: 改写后的响应头
    Proxy->>Storage: 记录响应 rule effects

    Mockttp-->>Client: 最终响应头
    Mockttp-->>Proxy: response-initiated
    Proxy->>Storage: 更新 status 与最终响应头
    Proxy->>Queue: enqueue exchange-updated
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: 转 response-streaming 并显示状态码

    loop 每个响应体分块
        Origin-->>Mockttp: 响应体分块
        Mockttp-->>Client: 响应体分块
        Mockttp-->>Proxy: response-body-data
        Proxy->>Storage: 写入 body writer
        Proxy->>Queue: enqueue exchange-updated
    end
    Note over Queue,App: 流式期间定时器持续 drain，<br/>每 50ms 推一条合并后的最新摘要
    App->>Queue: drain
    App->>Main: event-batch
    Main-->>UI: responseBytes 持续增长

    Mockttp-->>Proxy: response-body-data isEnded
    Mockttp-->>Proxy: response-trailers
    Note over Proxy: gRPC 的 grpc-status 在此到达
    Proxy->>Storage: finalize body 得到 hash
    Note over Proxy: 普通请求等待请求侧也结束；完整413响应适用提前收尾例外
    Proxy->>Storage: 绑定 bodyRef 与终态 completed
    Proxy->>Queue: enqueue exchange-updated
    App->>Queue: drain（下一个 tick）
    App->>Main: event-batch
    Main-->>UI: 更新同一行为 completed
```

**逐步说明：**

1. **请求头到达**：`ProxyService` 在 `request-initiated` 回调内检查 `recording` 与 capture generation，通过后分配 `exchangeId`，写入 `ExchangeInput{ state: 'pending' }`，立即 enqueue `exchange-added`。UI 在一个 flush 周期内看到该行。
2. **请求规则**：`beforeRequestHead` 与步骤 1 并行，不保证先后。`ProxyService` 用同一 `request.id` 找到（或暂存到孤儿表等待）Exchange 记录，附加 `ruleIds` 与 header effects。钩子**不等请求正文**。
3. **请求体**：每个 `request-body-data` 把 `content` 追加进该 Exchange 的 request body writer，更新 `requestBytes`。`isEnded` 时 finalize 得到 hash 并绑定 `requestBodyId`。
4. **源站响应头**：`beforeResponseHead` 的参数就是 Origin 原始响应头，作为 response Rule 效果的对照。钩子**不缓冲响应正文**。
5. **最终响应头**：`response-initiated` 提供实际写回客户端的值，更新 `statusCode`、`responseMime`、`responseStartedAt`，状态转 `response-streaming`。
6. **响应体**：同请求体，写入 response body writer。
7. **trailer**：`response-trailers` 追加记录；gRPC 的 `grpc-status` 由此路径获得。
8. **终态**：两侧正文结束后写入`completedAt`与`state: 'completed'`；完整413响应适用4节的提前收尾例外，中断则保留部分正文并进入`aborted`。

### 5.2 CONNECT 隧道（未解密）

未配置 CA 或用户未开启解密时，HTTPS 走字节直通，只记录有限元数据。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant Origin

    Client->>Mockttp: CONNECT host:443
    Mockttp-->>Proxy: tls-passthrough-opened
    Proxy->>Storage: appendExchanges CONNECT 元数据
    Proxy->>Queue: enqueue exchange-added
    Note over Proxy: method=CONNECT<br/>protocol=tls<br/>responseMime=application/x-encrypted-tunnel
    Client<<->>Origin: 加密字节直通，不可见
    Mockttp-->>Proxy: tls-passthrough-closed
    Proxy->>Storage: updateExchange completed
    Proxy->>Queue: enqueue exchange-updated
```

`pendingTunnels` 保存 `Promise<PendingTunnelCapture | null>`，确保 closed 事件等待 opened 落库后才更新。隧道内不读取任何 header 或 body。

**Rule 对未解密隧道完全不生效**，因此上图没有 RuleService 参与。原因在 TLS 层就已决定：

未配置 CA 时 `startServer()` 用 `getLocal({ https: { ...tlsPassthroughIdentity, tlsInterceptOnly: [] } })`。
Mockttp 的 `shouldPassThrough()` 在 `interceptOnlyPatterns` 非 undefined 时返回
`!interceptOnlyPatterns.some(...)`，空数组必然得到 `true`，于是 `analyzeAndMaybePassThroughTls`
读完 ClientHello 就把 socket 交给 passthrough listener 并 `return`，**不再继续 TLS 握手**。

后果是隧道内的字节从未被解密、从未被解析成 HTTP 请求，`forAnyRequest().thenPassThrough()`
这条规则链根本不会被触发，`beforeRequestHead` / `beforeResponseHead` 自然也不会调用。
换言之：**要让 Rule 作用于 HTTPS，必须先安装并信任 CA 且开启 MITM**，此时流量走 5.1 的常规路径，
隧道记录不再产生。

### 5.3 WebSocket

101 Exchange 由 `websocket-accepted` 完成。不能依赖 completed `response`，因为订阅它会
触发全量正文缓冲（见 3.2）。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Rules as RuleService
    participant Storage as CaptureService
    participant Origin

    Client->>Mockttp: TCP/TLS + HTTP/1.1 Upgrade
    Note over Mockttp: Mockttp 拥有 listener，<br/>终止 TLS 并解析 Upgrade 请求
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Note over Proxy: 登记 pendingWebSockets

    Mockttp->>Bridge: 移交 socket 与 head（ListenWebSocketStep.handle）
    Bridge->>Origin: WebSocket Upgrade（转发头 + 子协议）
    Origin-->>Bridge: 101 Switching Protocols
    Note over Bridge: 先连通上游再升级下游，<br/>上游失败则客户端 Upgrade 直接失败

    Bridge-->>Client: 101（ws.handleUpgrade 直接写该 socket）
    Note over Mockttp: 101 字节被 Mockttp 的 socket._write<br/>钩子截获，用于还原响应
    Bridge->>Mockttp: emit ws-upgrade(downstream)
    Note over Mockttp: 卸载 write 钩子退出字节路径，<br/>改为在 downstream 上挂观测
    Mockttp-->>Proxy: websocket-accepted
    Proxy->>Storage: updateExchange 状态 request-complete

    loop 客户端 → 源站
        Client->>Bridge: message / ping / pong / close（同一 socket，Bridge 是 WS 端点）
        Bridge->>Proxy: interceptWebSocketMessage
        alt 当前连接未启用，或 direction / frame 不匹配
            Proxy-->>Bridge: forward（原样）
        else 当前连接配置命中
            Proxy->>Rules: pauseWebSocketMessage
            Note over Rules: 挂起等待用户裁决<br/>continue / edit / drop
            Rules-->>Proxy: outcome
            Proxy-->>Bridge: forward 改写后内容，或 drop
        end
        Bridge->>Origin: 转发或丢弃
        Mockttp-->>Proxy: websocket-message-received
        Note over Mockttp: 由 downstream 的 message 监听器观测
        Proxy->>Storage: appendWebSocketFrames
    end

    loop 源站 → 客户端
        Origin->>Bridge: message / ping / pong / close
        Bridge->>Proxy: interceptWebSocketMessage
        Note over Proxy: 同上，当前连接配置命中时挂起
        Bridge->>Client: 转发或丢弃
        Mockttp-->>Proxy: websocket-message-sent
        Note over Mockttp: 由包装后的 downstream.send 观测
        Proxy->>Storage: appendWebSocketFrames
    end

    Note over Bridge: ping / pong / close 与 message 共用方向内串行链；<br/>Mockttp 的 message 事件仍只观测应用消息

    Client->>Bridge: Close
    Bridge->>Origin: Close 透传
    Mockttp-->>Proxy: websocket-close
    Proxy->>Storage: updateExchange completed
    Origin-->>Bridge: 上游 close
    Bridge->>Bridge: cleanup 检测两端都 CLOSED，从 pairs 移除
    Note over Bridge: terminate 内部即 socket.destroy，<br/>回收细节见 5.5.6
```

**客户端连接的归属分层**（容易误解，单独说明）：

| 层 | 归属 |
| --- | --- |
| TCP/TLS 接入、HTTP Upgrade 请求解析、WebSocket 规则匹配 | Mockttp |
| 101 握手响应与之后全部 WebSocket 帧 | Bridge（`ws`）直接读写 Mockttp 移交的同一 socket |
| `websocket-accepted` / `message-received` / `message-sent` / `close` 观测 | Mockttp，但**不在字节路径上** |

Mockttp 在 Upgrade 阶段给 socket 装 `_write` / `_writev` 钩子，因此 Bridge 调
`downstreamServer.handleUpgrade()` 写出的 101 字节会被它截获并 `parseRawHttpResponse` 还原成
响应对象。随后 Bridge `socket.emit('ws-upgrade', downstream)`，Mockttp 收到后**立刻卸载钩子**，
转而在 `downstream` 这个 WebSocket 对象上挂 `on('message')` 并包装 `send()`，靠对象级 hook 观测
消息。也就是说：**连接是 Mockttp 接的，WebSocket 协议端点是 Bridge 的，Mockttp 升级完成后退化为观察者。**

约束：

- **Rule 的适用范围与 HTTP 不同**，这是 WebSocket 最容易误解的一点：

  | 对象 | 是否经过 Rule |
  | --- | --- |
  | Upgrade 请求（header 改写、block、map local/remote 等） | **否**。Bridge 经 `addWebSocketRule` 注册独立的 WebSocket 规则链（`WildcardMatcher` + 自定义 step），不走 `forAnyRequest().thenPassThrough()`，因此 `beforeRequestHead` / `beforeResponseHead` 不会触发 |
    | 帧 | **仅当前连接临时断点**。`interceptWebSocketMessage` 按 `exchangeId` / `direction` / `frames` 检查 `WebSocketBreakpointSettings` 后调用 `ruleService.pauseWebSocketMessage`；message / ping / pong / close 各有明确 `ruleName`，**不做 matcher 匹配，也不执行 Rules action** |

    即 WebSocket 帧断点由 `websocket.breakpoint.enable` / `websocket.breakpoint.disable` 控制，只作用于配置中的当前 exchange；命中后挂起等待 continue / edit / drop，与 Rules 工作区里的 HTTP breakpoint action 正交。
- **上游先于下游**：`handle()` 先 `new WebSocket(url)` 并 `waitForOpen(upstream)`，成功后才 `handleUpgrade` 回客户端 101。上游握手失败时 upstream 被 terminate 并抛出，客户端拿不到 101，因此不存在「已升级但无上游」的中间态。子协议以上游 `sec-websocket-protocol` 回填，`sec-websocket-extensions` 被删除（bridge 关闭 permessage-deflate，两侧均传明文帧）。
- **配置方向才过断点**：client-to-server 与 server-to-client 都接入 `intercept()`，是否挂起由当前连接配置的 `direction` 决定。两个方向各自维护 `clientTail` / `serverTail` Promise 链，互不阻塞但各自保序；message / ping / pong / close 共用该方向的同一条链。
- **观测依赖 Bridge 走 `send()`**：Mockttp 的 `message-sent` 来自被包装的 `downstream.send()`。控制帧走 `ws.ping` / `ws.pong` / `close`，会经过 Bridge 断点，但不产生 Mockttp message 事件，因此当前不作为普通 message frame 落库；close 仍由 `websocket-close` 更新连接终态。
- **两个方向的记录语义不对称**：Mockttp 与 Bridge 各自在**同一个** `downstream` 对象上挂 `on('message')`，一帧到达同步触发两者（`socket.emit('ws-upgrade')` 是同步的，Mockttp 先注册也先执行）。但转发目标不同导致：

  | 方向 | 观测点 | 记录到的内容 |
  | --- | --- | --- |
  | client → server | `downstream.on('message')`，帧一到就捕获 | 断点**前**的原始内容，被 drop 的消息**仍会**记一条 |
  | server → client | 被包装的 `downstream.send()`，断点决策**后**才调用 | 断点**后**的最终内容，被 drop 的消息**不落库** |

  原因是 client→server 转发调 `upstream.send()`，而 upstream 由 Bridge 自行 `new WebSocket()` 创建、未被 Mockttp 包装，不产生事件。因此「断点改写是否体现在 Capture 记录里」两个方向相反。
- 消息按 `streamId` 串行 `writeTail` Promise 链，保证顺序且等待 101 Exchange 先落库。
- payload 复用 `BodyStore`，按 hash 去重。
- 仅支持HTTP/1.1 Upgrade，不支持H2 Extended CONNECT。

### 5.4 早期响应（HTTP）

**终态场景总览**（5.4 与 5.5 合并对照）：

| 场景 | Mockttp 发出的事件 | Capture 结果 |
| --- | --- | --- |
| HTTP 413拒绝上传 | `response-initiated` → `response-body-data isEnded` | 完整413响应后`completed`，保留收尾时已捕获上传正文 |
| 其他HTTP早期响应 | 两侧`*-body-data isEnded`，或实际`abort` | 双向结束后`completed`；真实中断则`aborted`并保留已捕获正文 |
| HTTP 请求中断 | `abort` | `aborted` + `errorCode` |
| HTTP 上游连接失败（DNS/TCP/TLS） | `abort`（`simulateConnectionErrors` 镜像为客户端连接错误） | `aborted` + 真实 `errorCode` |
| WebSocket 升级前连接直接断开 | `abort`（`data` 为空分支） | `aborted` |
| WebSocket 非正常关闭（closeCode 1006） | `abort` | `aborted` |
| WebSocket 上游升级失败 | 无（`response` 未订阅，`announceResponseAsync` 直接 return） | `aborted`，由 Bridge 显式判终态 |
| 未解密 CONNECT 隧道异常断开 | 仅 `tls-passthrough-closed` | 一律 `completed`，**永远不会是 `aborted`** |

本节只针对 HTTP/HTTPS（MITM 后）：Origin 可能在请求体传完前就返回 401/413/417。
WebSocket 没有等价场景（不存在请求体流式上传），未解密隧道也不适用。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Note over Queue,UI: 事件按 5.1 的 50ms 定时 drain 推送，<br/>此处只标出入队时机

    Client->>Mockttp: 请求头（POST，带正文）
    Mockttp-->>Proxy: request-initiated
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头
    Mockttp->>Origin: 转发请求头

    loop 上传进行中
        Client->>Mockttp: 请求体分块
        Mockttp->>Origin: 转发请求体分块
        Mockttp-->>Proxy: request-body-data
        Proxy->>Proxy: 写入 requestWriter
        Proxy->>Storage: patch requestBytes
        Proxy->>Queue: enqueue exchange-updated
        Queue-->>UI: requestBytes 增长
    end

    Note over Origin: 未读完请求体就决定拒绝

    Origin-->>Mockttp: 早期响应头（401 / 413 / 417）
    Mockttp->>Proxy: beforeResponseHead
    Proxy->>Rules: evaluateResponse
    Rules-->>Proxy: ResponseEvaluation
    Proxy-->>Mockttp: 改写后的响应头
    Mockttp-->>Client: 早期响应头
    Note over Client,Mockttp: 响应已回客户端，但上传通道未关闭，<br/>客户端是否继续发送由它自己决定
    Mockttp-->>Proxy: response-initiated
    Proxy->>Storage: 更新 status，状态转 response-streaming
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 显示状态码，行仍在进行中
    Note over Proxy: 请求侧仍停在 body 阶段，<br/>请求与响应两侧独立推进

    Origin-->>Mockttp: 响应体并结束
    Mockttp-->>Client: 响应体并结束
    Mockttp-->>Proxy: response-body-data isEnded
    Proxy->>Proxy: finalizeResponseBody
    Proxy->>Storage: 绑定responseBody，响应可读
    alt 413响应或上传已经完整结束
        Proxy->>Proxy: 413时finalize仍在写入的requestWriter
        Proxy->>Proxy: completeExchange
        Proxy->>Storage: state completed并保留已捕获正文
        Proxy->>Queue: enqueue终态与耗时
        Queue-->>UI: 更新记录，后续归属更新保持终态
        Note over Proxy: entry已移除，迟到上传/中断不再追加
    else 非413且上传仍在继续
        Client->>Mockttp: 后续请求体分块并结束
        Mockttp-->>Proxy: request-body-data isEnded
        Proxy->>Proxy: finalizeRequestBody + completeExchange
        Proxy->>Storage: 完整上传正文及state completed
    end
```

**响应与上传是并行的两条通道。** 早期响应头一到就会被 Mockttp 转发给客户端，Capture 也立刻
`patch` 出 `response-streaming` 并入队推给 Renderer——**不需要等上传结束**。此时客户端的上传通道
仍然开着，继续发还是放弃完全由客户端决定（很多 HTTP 客户端收到 4xx 后仍会把已排队的分块发完）。
413完整响应后Capture收尾，后续事件不再追加；其他状态码保留仍在上传的entry，直至上传结束或收到真实中断事件。

**终态不会因迟到事件回退。** `completeExchange`与`finishExchange`都会保存收尾时间并移除entry。
普通请求必须等两侧正文结束；413例外只要求完整响应及当时已捕获上传保存完毕。它表示Capture记录已结束，
不表示客户端全部上传都到达origin，也不主动关闭真实连接。后续应用归属摘要仍保留终态和同一耗时。

Exchange在请求头阶段建立，早期响应合并到同一记录。移除entry前，两侧writer必须分别finalize或abort，不能只移除引用而遗留正文或spill临时文件。

### 5.5 中断（abort）

由全局 `server.on('abort')` 驱动，**覆盖 HTTP 与 WebSocket**，不覆盖未解密隧道。
五种触发场景的前置流程互不相同，各画一张从客户端发起请求开始的完整时序。

无论哪一种，收尾都汇聚到 `finishExchange`：两个 writer 都 finalize（已接收的部分正文保留并绑定
body 引用），写入 `state`、`completedAt`、`errorCode`，`terminal` 置真并从 `entries` 移除，
最后 `resolveExchangeReady`。

#### 5.5.1 HTTP 客户端主动中断

用户取消、请求超时或客户端进程退出，连接在上传或等待响应期间断开。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头
    Mockttp->>Origin: 转发请求头

    loop 上传进行中
        Client->>Mockttp: 请求体分块
        Mockttp->>Origin: 转发请求体分块
        Mockttp-->>Proxy: request-body-data
        Proxy->>Proxy: 写入 requestWriter
        Proxy->>Queue: enqueue exchange-updated
        Queue-->>UI: requestBytes 增长
    end

    Client--xMockttp: 连接断开（用户取消、超时、进程退出）
    Mockttp--xOrigin: 上游连接一并中断
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Note over Proxy: 两个 writer 都 finalize，<br/>已上传的部分正文保留
    Proxy->>Storage: state aborted + completedAt + errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted
```

#### 5.5.2 HTTP 上游连接失败

DNS 解析失败、TCP 被拒或 TLS 握手失败，请求从未到达源站。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Proxy as ProxyService
    participant Rules as RuleService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: 请求头
    Mockttp-->>Proxy: request-initiated
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行

    Mockttp->>Proxy: beforeRequestHead
    Proxy->>Rules: evaluateRequest
    Rules-->>Proxy: RequestEvaluation
    Proxy-->>Mockttp: 改写后的请求头

    Mockttp->>Origin: 建立连接
    Origin--xMockttp: 解析失败、连接被拒或握手失败
    Note over Mockttp: simulateConnectionErrors 把上游故障<br/>镜像为客户端连接错误，不伪造 502
    Mockttp--xClient: reset 或 close
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Proxy->>Storage: state aborted + completedAt + 真实 errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted 并显示失败原因
```

**上游失败语义**：passthrough 固定 `simulateConnectionErrors: true`，因此客户端看到的是与不挂代理时一致的失败形态（连接被重置/关闭），而不是一个伪造的 502 响应。Capture 里也是一条带真实 `errorCode` 的 `aborted` 记录，而不是一条假响应。

#### 5.5.3 WebSocket 升级完成前客户端断开

客户端发出 Upgrade 后、握手完成前就断开，此时还没有任何响应字节写回。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: HTTP/1.1 Upgrade
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行
    Mockttp->>Bridge: 移交 socket 与 head
    Bridge->>Origin: WebSocket Upgrade

    Client--xMockttp: 连接断开
    Note over Mockttp: 一个字节响应都没写出，<br/>socket close 时走 data 为空分支
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Proxy->>Storage: state aborted + completedAt + errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted

    Origin-->>Bridge: 101 Switching Protocols（上游握手仍会完成）
    Bridge->>Bridge: 检测下游 socket 已不可读写
    Note over Bridge: ws 的 completeUpgrade 只会 destroy 下游<br/>并静默跳过回调，connectPair 不会执行
    Bridge--xOrigin: terminate 上游（内部即 socket.destroy），避免孤儿连接
    Note over Bridge: downstream 未创建，pairs 未加入
```

**Bridge 必须自己收尾上游。** 上游握手是异步的：客户端断开时 `await waitForOpen(upstream)` 往往仍在
等待，之后源站照样会回 101，于是出现「下游已死、上游刚活」的错配。此时 `ws` 的 `completeUpgrade`
第一件事就是 `if (!socket.readable || !socket.writable) return socket.destroy()`——**它只销毁下游
socket，并且不调用回调**，因此 `connectPair` 永远不执行、上游既进不了 `pairs` 也无人 `terminate`，
`bridge.close()` 同样兜不住（它只遍历 `pairs`）。

`handle()`在`handleUpgrade`前检查下游是否仍可读写，并注册一次`socket.once('close')`守卫：配对未完成时调用`upstream.terminate()`。

被移交的下游 socket 不需要 Bridge 额外处理——`completeUpgrade` 已经 `destroy()` 了它。

#### 5.5.4 WebSocket 上游升级失败

上游拒绝升级或连接不通，Bridge 的 `waitForOpen(upstream)` 失败。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: HTTP/1.1 Upgrade
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行
    Mockttp->>Bridge: 移交 socket 与 head

    Bridge->>Origin: WebSocket Upgrade
    Origin--xBridge: 连接被拒或响应非 101
    Note over Bridge: waitForOpen 以 error 拒绝
    Bridge--xOrigin: terminate 上游（内部即 socket.destroy）

    Bridge->>Proxy: onUpgradeFailed
    Proxy->>Proxy: failWebSocketUpgrade 进入 aborted
    Proxy->>Storage: state aborted + completedAt + 真实 errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted

    Bridge--xMockttp: 抛出异常
    Mockttp--xClient: 写回 HTTP/1.1 500 后 socket.destroy(error)
    Note over Bridge: 从未调用 handleUpgrade，<br/>downstream 未创建，pairs 未加入
    Note over Mockttp: 此处本应 announceResponseAsync，<br/>但 listenerCount('response') 为 0 直接 return，<br/>事件根本不会发出，故终态必须由 onUpgradeFailed 给出
```

**这里没有「收不到的事件」，而是压根不发。** `announceResponseAsync` 的第一行就是
`if (emitter.listenerCount('response') === 0) return`，Capture 从不订阅 `response`，因此
Mockttp 连 `waitForCompletedResponse()` 都不会调用——既不会有事件投递，也不会触发 3.2 说的全量正文
缓冲。代价是这条路径**没有任何 Mockttp 事件可用**，终态只能由 Bridge 的 `onUpgradeFailed` 补上。

#### 5.5.5 WebSocket 已建立后非正常关闭

握手成功、消息通道已经工作，之后连接异常中断（`closeCode` 1006，非 clean close）。

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Bridge as WebSocketBridge
    participant Proxy as ProxyService
    participant Storage as CaptureService
    participant Queue as CaptureEventQueue
    participant UI as Renderer
    participant Origin

    Client->>Mockttp: HTTP/1.1 Upgrade
    Mockttp-->>Proxy: websocket-request
    Proxy->>Storage: appendExchanges 状态 pending
    Proxy->>Queue: enqueue exchange-added
    Queue-->>UI: 显示 pending 行
    Mockttp->>Bridge: 移交 socket 与 head

    Bridge->>Origin: WebSocket Upgrade
    Origin-->>Bridge: 101 Switching Protocols
    Bridge-->>Client: 101 Switching Protocols
    Mockttp-->>Proxy: websocket-accepted
    Proxy->>Storage: state request-complete
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 request-complete

    loop 消息往返
        Client->>Bridge: 应用消息
        Bridge->>Origin: 转发
        Mockttp-->>Proxy: websocket-message-received
        Proxy->>Storage: appendWebSocketFrames
    end

    Client--xBridge: 连接异常中断（closeCode 1006）
    Note over Mockttp: 非 clean close，走 announceAbortAsync<br/>而不是 websocket-close
    Mockttp-->>Proxy: abort

    Proxy->>Proxy: finishExchange 进入 aborted
    Proxy->>Storage: state aborted + completedAt + errorCode
    Proxy->>Queue: enqueue exchange-updated
    Queue-->>UI: 行转 aborted

    Note over Bridge: Capture 侧判终态与 Bridge 侧收尾是两条独立路径，<br/>下面这段不依赖 abort 事件
    Bridge->>Bridge: downstream 的 close 监听触发 closePeer(upstream)
    Bridge--xOrigin: 关闭上游（1006 不是合法出网 code，改发无 code close）
    Origin-->>Bridge: 上游 close
    Bridge->>Bridge: cleanup 检测两端都 CLOSED，从 pairs 移除
```

**Bridge 的收尾与 abort 事件互不依赖。** `abort` 只驱动 Capture 判终态；连接回收由 `connectPair`
注册的监听器完成：任一端 `close` → `closePeer` 把关闭传播给对端 → 两端都 `CLOSED` 时 `cleanup`
把 pair 从 `pairs` 移除。`ws` 的 `close()` 会发关闭帧并挂一个 30s `closeTimer`，对端不回应也会
`socket.destroy()` 兜底，因此不会无限挂起。

**WebSocket 复用同一模型**：`beginWebSocketRequest` 内部就是 `beginRequest`，条目同样落在 `entries` 里，因此 `abortExchange` 能正常命中。正常关闭（clean close）走的是 `websocket-close` → `closeWebSocket` → `completed`，不在本节范围内。

#### 5.5.6 资源回收对照

WebSocket 路径上 Bridge 实际持有的对象只有三类，逐场景的回收责任如下（HTTP 路径见本表末尾）。

| 对象 | 谁创建 | 回收方式 |
| --- | --- | --- |
| `upstream: WebSocket`（到源站） | Bridge `new WebSocket(url)` | 见下表逐场景 |
| `downstream: WebSocket`（到客户端） | `ws` 的 `handleUpgrade`，包装 Mockttp 移交的 socket | 与 upstream 成对，随 pair 一同回收 |
| `pairs: Set<WebSocketPair>` | Bridge | `cleanup` / `failPair` / `close()` 移除 |

| 场景 | upstream 回收 | downstream / socket 回收 | pairs |
| --- | --- | --- | --- |
| 上游升级失败（5.5.4） | `waitForOpen` catch 中 `terminate()` | Mockttp `sendWebSocketErrorResponse` 写 500 后 `socket.destroy(error)` | 从未加入 |
| 升级期间客户端断开（5.5.3） | 预检查或 `socket.once('close')` 守卫 `terminate()` | `ws` 的 `completeUpgrade` 已 `socket.destroy()` | 从未加入 |
| 已建立后任一端关闭（5.5.5 与正常关闭） | `closePeer` 传播关闭，30s `closeTimer` 兜底 `socket.destroy()` | 同左，对称处理 | `cleanup` 在两端 `CLOSED` 后移除 |
| 消息转发或连接报错 | `failPair` 直接 `terminate()` | `failPair` 直接 `terminate()` | `failPair` 立即移除 |
| Proxy 停止 / TLS 重配 | `bridge.close()` 遍历 `pairs` 全部 `terminate()` | 同左 | `pairs.clear()` |

`terminate()` 在 `ws` 内部就是 `this._socket.destroy()`，因此上表的每条路径最终都会销毁底层 TCP/TLS
socket，不存在只丢引用不关连接的情况。`connectPair` 注册的监听器都挂在这两个 WebSocket 对象上，
pair 移除后对象即可回收，监听器随之释放。

**HTTP 路径没有需要 Bridge 收尾的连接对象**：客户端与上游 socket 全部由 Mockttp 拥有和销毁，
Capture 只订阅事件。Capture 自己持有的可释放资源仅有 `BodyWriter`（可能已 spill 到临时文件），
其回收点是 `completeExchange` / `finishExchange` 的 finalize，以及 `tracker.reset()` 对在途条目的
`abort()`。

**未解密隧道没有中断语义**：`completeTunnel`固定写`state: 'completed'`。`TlsPassthroughEvent`只带destination / remoteIpAddress / timingEvents /
`tlsMetadata`，**没有任何关闭原因字段**（带 `failureCause` 的是另一个事件
`TlsHandshakeFailure`，只覆盖握手失败）。因此隧道记录无法区分正常关闭与连接重置，永远不会出现 `aborted`。

### 5.6 已登录 HTTPS 页面透明刷新

HTTPS MITM 只改变传输链路，不得改变客户端与 Origin 之间的身份语义。客户端发送的
身份 Cookie 必须完整到达 Origin，Origin 返回的 `Set-Cookie` 必须到达客户端。Capture
只能观察这条链路，不能改变登录语义。

透明性检查以真实浏览器profile中的完整页面及登录入口为准，不注入Cookie、不修改profile、不用旧DOM、CONNECT记录或单独API请求代替页面刷新。证据只记录Cookie名称，不记录凭据值。操作约定见[Capture规格](../../apps/desktop/tests/e2e-workflow-tests/docs/capture.md)。

## 6. 正文存储

### 6.1 增量写入

```mermaid
flowchart LR
    A["request-body-data<br/>response-body-data"] --> B["BodyWriter"]
    B --> C{"累计写入字节"}
    C -->|"未超阀值"| D["留在内存 memoryChunks"]
    C -->|"首次超阀值"| E["建 spill 文件并把<br/>已缓存分片全部写入"]
    E --> E2["清空 memoryChunks，<br/>后续 chunk 直接追写文件"]
    B --> F{"isEnded"}
    F -->|"是"| G["finalize 计算 hash"]
    G --> H["绑定 bodyRef 到 Exchange"]
```

**spill 是全量迁移，不是只写超出部分。** `consume()` 在首次发现
`writtenBytes > memoryThresholdBytes`（即 `BODY_MEMORY_THRESHOLD_BYTES`，3 MiB）时才创建 spill 文件，紧接着把 **已经放在
`memoryChunks` 里的全部分片按顺序写进文件**，然后 `memoryChunks.length = 0` 清空内存，
当前 chunk 也直接追写文件。此后 `output` 非空，所有 chunk 一律走文件。

因此一份正文要么**完全在内存**、要么**完全在文件**，不存在一半内存一半文件的拆分状态。
`finalize()` 里的 `const memory = this.spillPath ? null : Buffer.concat(...)` 也体现了这一点：
一旦 spill 过，内存侧就是 `null`。

**内容寻址的必然约束**：`BodyStore` 按内容 hash 去重，因此 **hash 只有写完才能确定**。传输过程中 Exchange 只能记录 observed bytes，`requestBodyId` / `responseBodyId` 必须在 `isEnded` 后绑定。

普通HTTP正文的大小实时增长，按bodyId预览与保存须等待提交；gRPC的在途消息读取使用writer快照，不伪造内容hash，见4.1。

### 6.2 阈值语义

两个阈值都定义在 `proxy-core/constants.ts`，作用于**单个正文**（非全局）：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `BODY_MEMORY_THRESHOLD_BYTES` | `3 * 1024 * 1024` = **3 MiB** | 累计写入超过它就建 spill 文件，并把已缓存内容全量迁移进去 |
| `BODY_WRITER_PENDING_LIMIT_BYTES` | `128 * 1024 * 1024` = **128 MiB** | 待落盘积压的**病态兜底**，正常流量不会触及 |

两者职责不同：**3 MiB 决定“存在哪里”**（内存还是文件），**128 MiB 决定“什么时候放弃”**
（只在磁盘持续远慢于接收速度时才触发）。写入是异步串行的，因此即使已经 spill，排队中的
chunk 仍占内存，128 MiB 上限正是给这段队列封顶。

**设计意图是完整保留正文。** 128 MiB 取值远高于真实流量的积压水位，包括大文件下载在内的
常规场景都不会丢弃内容；它只在磁盘异常或极端本地源站这类病态情况下生效，避免 Core 因内存
无界增长而被重启。

**两个阀值都是“每条正文”而非全局上限**，因此峰值内存会乘上并发数。

spill判断使用累计`writtenBytes`，不是单个chunk大小，也不等待完整buffer；累计跨过阈值时立即迁移。

### 6.3 背压

`write()` 由 Mockttp 的 `body-data` 回调同步调用，而 Mockttp **不等待**消费者（见 3.6，body-data 是
旁路复制流）。因此 `write()` 必须立刻返回，不能 `await` 磁盘——每个 chunk 只能先复制进内存、挂到串行
Promise 链上排队，真正落盘在后台进行。`pendingBytes` 就是「已收下但尚未落盘」的字节数。

**上限约束的是这段积压，而不是正文大小。** 若不设限，当到达速度持续快于磁盘写入速度时队列只进不出，
排队的 Buffer 全部驻留 RAM，Core 内存会无界增长。反过来，60 MB 正文只要任一时刻积压不超过上限就毫无
问题——它限制的是瞬时落差，不是总量。

无法做真正的背压：Mockttp 的 `emitBodyDataEvents` **忽略回调返回值**，且在 `'data'` 事件里无条件
累积 `pendingContent`，无任何接口可以告知“慢一点”；旁路流也不影响转发管线，唯一能减速的方式是
拖慢真实流量。Interceptor 是透明调试代理，**不能因为记录器跟不上就拖慢用户的流量**，
因此只能给队列封顶。

1. 每个body writer维护有界待写队列，上限为`BODY_WRITER_PENDING_LIMIT_BYTES`（128 MiB）。
   该上限是**病态兜底**，不是常规限制：正常流量（含大文件下载）下磁盘远快于网络，积压接近于零，
   正文完整保留。它是**每个 writer** 的，一条 Exchange 有请求/响应两个 writer。
2. 超限时停止保存内容，
   仅累计 observed bytes（因此 UI 上的大小仍然准确），`finalize()` 返回 `null` 不绑定 bodyRef。
   降级是 **整条丢弃而非截断**：`discardCollected()` 会清空内存分片并删除已写的 spill 文件。
   原因是 Body Store 按内容 hash 寻址，截断的正文会算出与真实内容对不上的 hash，
   让用户看到一份与实际传输不符的「正文」，比没有更危险。
3. 缺少bodyRef不能解释为正文为空；UI没有独立的积压降级提示，observed bytes与可读正文必须分别判断。

可配置阈值属于候选方案，Settings没有对应配置项。若引入，存储阈值只对新建writer生效，Core校验范围；预览上限与存储阈值分开，由调用方通过读取命令指定解码输出上限。提示需区分空正文、预览截断和积压丢弃，不能把三者混成一种状态。
调大积压上限会按writer并发数抬高Core峰值内存，配置提示需要说明这一代价。

磁盘写入失败只跳过该正文，绝不影响转发、RPC 或进程状态。

各writer独立排队，一个writer受阻不串行阻塞其他正文；`finalize/abort`必须等待已接受写入结束，再提交或清除spill文件。单writer上限不构成全Core RSS、磁盘总量或Session容量上限。

### 6.4 正文按线上编码保存，解码元数据随 bodyRef

`body-data` 事件给出的是**线上原始字节**：`gzip` / `br` / `deflate` 压缩的响应体在这里就是压缩流。
Capture 原样落 Body Store，**不在数据面解压**——解压需要完整输入，会毁掉流式，也会让内容寻址
hash 与真实传输内容对不上。

代价是渲染端必须知道怎么还原，因此 `BodyRefInput` 必须同时携带两项元数据，请求侧与响应侧对称：

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `contentEncoding` | 该方向 headers 的 `content-encoding` | `body.read-range{decode:true}` 时选择解码链 |
| `mediaType` | 该方向 headers 的 `content-type` | Inspector 判定文本/二进制，决定 Auto 走文本还是 Hex |

`ExchangeTracker` 在 `beginRequest` / `beginResponse` 的头部阶段就把两个值读进 `TrackedExchange`，
再在三个收尾点（`finalizeRequestBody`、`completeExchange`、`finishExchange`）绑定到 bodyRef 上。
必须在头部阶段取：正文结束时 Mockttp 的 headers 对象已不在手边。

**漏掉 `contentEncoding` 的后果是静默的**：正文字节完好、逐字节可还原，但 Renderer 不会请求解码，
于是把压缩流当 UTF-8 渲染成乱码，HAR 导出也会把压缩字节写成 `text`。回归用例按 H1 / H2 / HTTPS MITM
三条链路各自断言 origin 收到的请求正文、客户端收到的响应正文、以及落库正文三者逐字节一致，
并校验 bodyRef 上的 `mediaType` + `contentEncoding` 能把正文还原成明文。

WebSocket 不走这条路径：bridge 两端都关掉 `permessage-deflate` 并剥掉 `sec-websocket-extensions`，
帧 payload 永远是未压缩字节，只按 opcode 记 `text/plain; charset=utf-8` 或 `application/octet-stream`。

## 7. Recording、Pause 与 Clear

### 7.1 三种状态

| 操作 | 命令 | 效果 |
| --- | --- | --- |
| Start | `proxy.start` | 启动 listener（若未启动），`recording = true` |
| Stop | `proxy.setRecording{false}` | **只暂停记录**。listener 与系统代理保持运行，流量继续转发 |
| Clear | `capture.cleanup{all}` | 没有在途Capture文件任务时推进generation、Exchange与正文归零，保留活动Session壳；否则返回conflict（见7.2） |

Stop 不停止转发，也不恢复系统代理。系统代理只在应用退出、Core 故障恢复、用户显式 Restore 或紧急修复时恢复。

### 7.2 Capture generation

Core先检查Body导出及HAR/Archive导入导出是否仍持有Capture数据，包含取消后的清理阶段；存在时返回`conflict`、`retryable: true`，不执行下方reset流程。Clear执行期间也禁止新Capture文件任务和重复Clear，结束或失败后释放，Diagnostics导出不受影响。UI遮罩、MCP及Agent入口遵守同一Core检查，详见[文件任务互斥](transfer.md#clear与文件任务)。

```mermaid
sequenceDiagram
    autonumber
    participant UI as Renderer
    participant App as CoreApplication
    participant Proxy as ProxyService
    participant Tracker as ExchangeTracker
    participant Queue as CaptureEventQueue
    participant Storage as CaptureService

    Note over Tracker: request-initiated 时固定<br/>entry.generation = 当前值

    UI->>App: capture.cleanup 且 scope 为 all
    App->>Proxy: prepareCaptureReset()
    Proxy->>Tracker: reset()
    Note over Tracker: generation += 1<br/>abort 全部在途 body writer<br/>清空 entries 与孤儿表<br/>未决 exchangeReady 一律 resolve(null)
    Proxy->>Proxy: await captureOperations
    Note over Proxy: WebSocket frame持久化完成后<br/>再清空webSocketTails与pendingTunnels
    Proxy-->>App: 仍在监听则返回当前 sessionId，否则 null

    App->>Queue: reset()
    Note over Queue: 丢弃尚未 drain 的事件，<br/>避免清空后旧数据仍被推给 UI

    alt 仍有活动 Session
        App->>Storage: cleanup(all-except-session)
        Note over Storage: 保留当前 Session 壳，<br/>Exchange 与 Body 归零
    else 未在监听
        App->>Storage: cleanup(all)
    end
    Storage-->>App: StorageStatusReport
    App-->>UI: capture.status

    Note over Tracker: 旧 generation 的迟到事件
    Tracker->>Tracker: generation 不匹配则丢弃
```

**Clear 由 CoreApplication 编排，不是 ProxyService 自己完成。** 三步顺序不可换：先
`prepareCaptureReset()`先建立切面（推进generation，让在途Tracker事件立即失效），再等待统一登记的
`captureOperations`完成。WebSocket frame写入与HTTP/tunnel写入使用同一排空边界，不得在Storage cleanup后
继续写入旧exchange/body。随后`captureEventQueue.reset()`丢弃已入队但未推送的事件，最后才真正执行
`capture.cleanup`；三步顺序不可换。

**活动 Session 会被保留。** `prepareCaptureReset()` 在代理仍在监听时返回当前 `sessionId`，
scope 随之收窄为 `all-except-session`——Exchange 与 Body 全部归零，但 Session 壳保留，
录制得以无缝继续。只有未在监听时才是真正的 `cleanup(all)`。

**判定规则：以请求开始时的状态为准。**

- 录制中开始、暂停后完成的长请求：继续完整记录。
- 暂停期间开始、恢复后完成的请求：始终不记录。
- 暂停期间建立的WebSocket没有Capture exchange；`whenExchangeReady`立即返回`null`，不得创建会阻塞
    Clear或Core退出的无主waiter。
- Clear 后旧 generation 的所有 request/body/response/trailer/rule hit 全部拒绝，不得重新创建行。

### 7.3 WebSocket录制边界

消息通过`whenExchangeReady()`关联握手时已录制的Exchange；未录制连接立即返回`null`，不得先保存payload再等待不存在的Exchange。暂停期间建立的连接始终不记录，Resume后的新连接正常记录，Pause前已记录连接继续保存双向消息。HTTP Rule钩子的提前预留ID与这条消息关联路径分开。

## 8. 客户端应用归属（Windows）

Capture 在创建 Exchange 时同时记录**发起这条请求的本机应用**，用于列表图标与 Inspector 展示。

### 8.1 解析链路

| 环节 | 数据源 | 说明 |
| --- | --- | --- |
| 连接 → PID | `GetExtendedTcpTable` | `request-initiated` 给出客户端源端口，在系统 TCP 表里查 owning PID |
| PID → 可执行文件 | `QueryFullProcessImageName` | — |
| 进程 → 应用 | 见 8.2 | 容器进程需沿进程树上溯 |
| 应用 → 图标 | `IShellItemImageFactory` | 与资源管理器同源。**不能**用 `SHGetFileInfo` / `app.getFileIcon`：MSIX/UWP 应用的 exe 只是 stub，图标在包的 Assets 里，后者只能拿到通用图标 |

全部经`client-app-helper`（Windows C#单文件，属于`packages/platform-capabilities/src/client-app/`）完成，Main在fork Core时以`--client-app-helper`注入路径。Core从`@interceptor/platform-capabilities/client-app`使用原生查询和TSV解析，缓存、Capture关联及增量事件继续由Core的ClientAppService负责。其他平台`ClientAppService.supported`为false，列表不显示图标。只有loopback客户端才反查；远程设备不存在对应的本机进程。

helper四个子命令：`<proxyPort>`输出TSV `sourcePort/PID/displayName/identity`（捕获路径用），`--icon <path>`输出base64 PNG，`--resolve <pid>`与`--apps`用于排查。Main通过平台对象的Client App模块复用同一个exe读取并缓存图标。

一条请求从到达到图标上屏的完整链路：

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Mockttp
    participant Tracker as ExchangeTracker
    participant AppSvc as ClientAppService
    participant Helper as client-app-helper
    participant Queue as CaptureEventQueue
    participant App as CoreApplication
    participant Main
    participant UI as Renderer

    Client->>Mockttp: 请求头（客户端源端口 51234）
    Mockttp-->>Tracker: request-initiated（remotePort）
    Tracker->>AppSvc: cachedAppForPort(51234)
    Note over Tracker,AppSvc: 纯内存同步读，带 TTL 判定，<br/>不触碰子进程

    alt 快照命中且未过期
        AppSvc-->>Tracker: appId + appName
        Note over Tracker: 直接写进 ExchangeInput，<br/>一条 exchange-added 带全
    else 未命中或已过期
        AppSvc-->>Tracker: 无
    end

    Tracker->>Queue: enqueue exchange-added
    Note over Tracker,Queue: 无论是否命中都先入队，<br/>helper 绝不出现在这条路径上

    opt 仅未命中时发生
        Tracker->>Tracker: setImmediate 排出当前捕获栈
        Note over Tracker: execFile 的 spawn 是同步系统调用，<br/>在 beginRequest 内直接调用会推迟 exchange-added
        Tracker->>AppSvc: resolveAppForPort(51234, arrivedAt)
        AppSvc->>Helper: execFile(helper, proxyPort)
        Note over Helper: GetExtendedTcpTable 取全表，<br/>再沿父进程链上溯到已安装应用
        Helper-->>AppSvc: TSV sourcePort/PID/displayName/imagePath
        AppSvc->>AppSvc: 整表替换 appByPort，<br/>新应用记入 undeliveredApps
        AppSvc-->>Tracker: appId + appName，或解析不到
        Tracker->>Queue: enqueue exchange-updated
    end

    App->>Queue: drain（每 50ms）
    App->>AppSvc: pendingAppsForMain()
    AppSvc-->>App: ClientAppIdentity[]（含 path）
    App->>Main: event-batch events 与 clientApps
    Main-->>UI: 请求行（此时只有应用名，无图标）
    App->>AppSvc: markAppsDelivered()

    loop 每个首次出现的应用
        Main->>Helper: execFile(helper, --icon path)
        Note over Helper: IShellItemImageFactory，<br/>与资源管理器同源
        Helper-->>Main: base64 PNG 或空
        Main->>Main: 写入图标缓存（解析不到也缓存 null）
    end

    Main-->>UI: client-app:icons 的 clientAppId 与 data URL
    UI->>UI: applyClientAppIcons，已渲染的行重新取图
```

### 8.2 容器进程归属

WebView2宿主、微信小程序容器这类进程自己不是用户心目中的应用，因此沿进程树向上追溯，**一旦命中系统已安装应用就停**。不设层数上限，避免截断真正的长链归属，例如`Microsoft.CodeAnalysis.LanguageServer.exe → Visual Studio Code`。

“已安装应用”是一张**安装目录 → 系统登记名**的索引，组合以下四类来源：

| 来源 | 取值 | 补的是什么 |
| --- | --- | --- |
| MSIX/UWP 包登记表 | `PackageRootFolder` + `DisplayName` | 全部打包应用（Teams、Outlook、Windows App、Widgets、SearchHost） |
| 卸载登记表 | `SystemComponent != 1` 条目的 `InstallLocation` / `DisplayIcon` | 传统桌面应用 |
| `App Paths` | 主程序所在目录 | 卸载表没写 `InstallLocation` 的 |
| 开始菜单快捷方式 | `.lnk` 目标所在目录 + 快捷方式名 | MSI 安装（OneDrive、Logitech G HUB 等） |

`SystemComponent = 1` 是 Windows 标记运行时组件的官方标志（WebView2 Runtime 即属此列），因此它不会成为归属终点。

**MSIX来源迁移候选。** `CollectPackagedApps()`直接读取AppModel
Package Repository 注册表；可改用官方 `PackageManager.FindPackagesForUser("")`，获得当前用户注册包
的 identity、安装路径、版本与状态，并正确覆盖非默认 PackageVolume。收益是摆脱内部注册表结构、
强类型语义更稳定；代价是不会返回只为其他用户注册或仅 staged/provisioned 的包。

对“当前用户发起的网络连接”，当前用户范围通常正是正确语义；但 SYSTEM/其他用户真正运行的
packaged process 仍需单独处理。全用户 `FindPackages()` 要管理员权限，不应放入抓包热路径。因此实施前
必须比较当前 registry 索引、`FindPackagesForUser` 与实际运行 PID 三组结果，不做盲目一换一。详见
[研究备忘](../backlog/research.md) § 3.3。

AppContainer exemption UI 不使用这张索引；它由 `NetworkIsolationEnumAppContainers` 直接提供候选
AppContainer、SID、package、display name 与 binaries。把 exemption 枚举与 Capture 运行时归属分成
两个模块，避免为了授权一个 SID 引入整套启发式应用识别。

五个边界条件：

- **一律按可执行文件路径判定，绝不按 AUMID**。MSIX 宿主派生的 `msedgewebview2.exe` **会继承宿主的包身份**，`GetApplicationUserModelId` 对它同样成功；按 AUMID 判会让上溯在 WebView2 进程处停住，Teams / Outlook / Windows App / Widgets 的流量在 UI 里会一律显示成 `Microsoft Edge WebView2`。
- **父进程必须经创建时间校验**。`ParentProcessId` 是创建时的快照，父进程退出后 PID 会被系统复用，“父进程”可能指向毫不相干的新进程，甚至沿复用形成的环兑圈子。因此父进程的创建时间晚于子进程就停——这才是防环与防认错的真正手段，比层数上限精确。
- **索引未命中不等于起始进程就是应用**。MSI安装可能不登记`InstallLocation`或`DisplayIcon`，开始菜单快捷方式也可能指向`C:\Windows\Installer\{GUID}\`的广告stub；一路未命中时停在**最后一个可信祖先**上。
- **不比较发布者**。宿主应用可以使用其他发布者的运行时，按发布者限制会误判归属。
- **系统目录下只有打包应用才算应用**。否则 `App Paths` 与开始菜单里大量指向 `System32` 的条目会把整个系统目录变成应用目录，`svchost.exe` 会立刻命中；反过来，`C:\Windows\SystemApps` 下的 MSIX 包（SearchHost）仍能正确归属。

### 8.3 显示名的分层选取

同一个进程有好几个"名字"，它们描述的**不是同一层东西**：

| 来源 | 描述的是 | 粒度 | 例子 |
| --- | --- | --- | --- |
| 主程序登记名（开始菜单快捷方式名、卸载表 `DisplayIcon` 指向的主程序） | 用户会去点的那个入口 | per-入口 | `WINWORD.EXE → Word`、`Weixin.exe → 微信` |
| 目录登记名（MSIX 包 `DisplayName`、卸载表 `InstallLocation` 的 `DisplayName`） | 一个打包应用 / 一次安装 | per-包、per-安装包 | `Microsoft Teams`、`Microsoft 365 Apps for enterprise - en-us` |
| exe 版本资源 `FileDescription` | 这个可执行文件是什么 | per-exe | `OneDrive.Sync.Service.exe → Microsoft OneDrive Sync Service` |

按优先级依次尝试：**主程序登记名 → 目录登记名 → `FileDescription` → 不含扩展名的文件名**。

登记名优先于 `FileDescription`，因为这一列的语义是"哪个应用发出的请求"，而 `FileDescription` 描述的是进程/组件（`Microsoft OneDrive Sync Service`、`G HUB`、`LGHUB Agent`），不是用户心目中的应用。主程序又必须优先于目录：套件类安装（Office）在卸载表里只有一个条目，只按目录会把 Word、OneNote 一律叫成 `Microsoft 365 Apps for enterprise`。

**不按`ProductName`校验目录登记名**。应用内的运行时组件可以有不同的产品名，例如VS Code的`OpenConsole.exe`；要求同源会错误拆分所属应用。这个取舍也意味着，落在nvm登记目录下的`node.exe`可能显示为NVM，而不是Node.js。

**代表标识决定 `appId` 与图标。** 归属结果的 `path` 会被换成应用的代表标识——卸载表 `DisplayIcon` 指向的主程序，或包只有一个应用时的 `shell:AppsFolder\<AUMID>`——让名称、图标、`appId` 三者同源。否则 OneDrive 的 `FileCoAuth.exe`、Outlook 的 `olkexthost.exe` 这类没有图标资源的后台组件会拿到通用图标，并在 UI 里裂成独立条目。代表标识只取自权威来源：App Paths 与快捷方式只代表单个入口，拿它们代表整个目录会把 OneNote 显示成 Excel。

**系统权限进程的兜底**。helper以普通用户权限运行，对SYSTEM服务进程的`OpenProcess`可能被拒绝。此时使用`CreateToolhelp32Snapshot`的`ExeFile`提供文件名；没有路径就无法取图标。Core仍登记这类条目，以显示名代替路径计算`appId`。

### 8.4 不阻塞捕获管线

`resolveAppForPort` 会拉起 helper 子进程，而 `execFile` 的 spawn 是**同步系统调用**。因此 `beginRequest` 只做纯内存的快照命中：

- 命中 → 同步写入 entry，`exchange-added` 一次带全，不产生额外事件
- 未命中 → `setImmediate` 排出当前栈后再解析，结果以 `exchange-updated` 补齐

这保证 helper 慢、挂起或失败都不会延后 `exchange-added` 与转发。解析失败只记 `client-app.lookup-failed` 诊断；孤儿 Promise 带 `catch`，Node 默认 `unhandled-rejections=throw` 会终止 Core 进程并中断抓包。

**反查中的条目与无归属条目分开。** 排队反查的entry带`appPending: true`（只在为真时进摘要），Renderer将其归入10.1节的Pending bucket，而不是Unknown。**成功、查不到、helper异常三种终态都必须清除此字段**；即使没有其他字段变化，也要补推`exchange-updated`，避免永久显示解析中。

### 8.5 快照与缓存

`ClientAppService` 持有两张表：

| 字段 | 内容 | 生命周期 |
| --- | --- | --- |
| `appByPort` | 源端口 → 应用 | 每次 helper 调用整表替换，`CLIENT_APP_SNAPSHOT_TTL_MS`（15s）后作废 |
| `undeliveredApps` | 尚未交给 Main 的应用身份 | 随 event-batch 下发成功后清除 |

TTL 防的是端口复用错认：连接关闭后源端口会被系统重新分配给其它进程，过期快照会把请求归给错误的应用。

并发解析共享同一次 helper 调用；解析时每一轮都先 `await` 快照再判断，**绝不在快照飞行中直接放弃**（请求到达时 TCP 连接必然已建立，只需一张采样时刻不早于此刻的快照）。helper 失败后在同一窗口内退避，避免反复拉起子进程。

### 8.6 身份与图标的传递边界

- Core 只把 `appId`（应用标识 sha256 前 16 位）与 `appName` 放进 `CaptureExchangeSummary`
- 完整身份（含 `path`）随 `event-batch` 的 `clientApps` 字段一次性交给 Main，**每个应用一次**；Main 无需再按 id 回问 Core
- Main 读取图标后经 `client-app:icons` 主动推给 Renderer，Renderer 从不发起索取
- Renderer 全程只见 `appId` 与 PNG data URL，拿不到可执行文件路径

图标按应用而非按请求去重，因此不会随每条 Exchange 重复传输（一张 data URL 2–4 KB，`appId` 只有 16 字符）。Renderer 侧 `clientAppIcons` 是响应式 map，且靠“有无该键”天然区分出图标三态，不需额外状态字段：

| `clientAppIcons.get(appId)` | 含义 | 展示 |
| --- | --- | --- |
| `string` | 已取到 | 真实图标 |
| `undefined` | 还在路上（图标总是晚于 Exchange 到达） | 占位方块 |
| `null` | 取不到（系统权限进程没有路径，或 shell 返回失败） | 未知应用图标 |

批次发送失败时身份留在 `undeliveredApps` 里下一轮继续带上；Renderer 重新加载会丢失已推送的图标，Main 在 `did-finish-load` 时补发一次已知集合。

## 9. 数据契约

### 9.1 Core 内部接口

`CaptureService`（`capture/entry.ts`）向Proxy暴露的写入方法：

```ts
class CaptureService {
  ensureSession(session: CaptureSessionInput): Promise<void>;
  appendExchanges(exchanges: ExchangeInput[]): Promise<{ id: string; seq: number }[]>;
  updateExchange(patch: ExchangePatch): Promise<void>;
  writeBody(source: AsyncIterable<Uint8Array>): Promise<BlobWriteResult>;
  createBodyWriter(): BodyWriter;
  appendRuleHits(exchangeId: string, hits: readonly RuleHitRecord[]): Promise<void>;
  appendWebSocketFrames(exchangeId: string, frames: readonly WebSocketFrameInput[]): Promise<void>;
}
```

`ProxyService`与`ExchangeTracker`直接持有这个具体类；测试替身
`extends CaptureService` 并只 `override` 被断言的方法。

`ExchangePatch` 除 `id` 外全部可选，未提供的字段保持原值，覆盖：

- 请求侧：`requestBytes`、`requestBodyId`、`requestMime`、`requestSentAt`、`requestBody`
- 响应侧：`statusCode`、`statusText`、`responseMime`、`responseStartedAt`、`responseBytes`、`responseBodyId`、`responseBody`
- 通用：`headers`（追加）、`ruleIds`（去重合并）、`errorCode`、`state`、`completedAt`

`writeBody` 是 pull 式、可背压，用于 WebSocket 单条消息；`createBodyWriter` 是 push 式、
不可阻塞，用于 HTTP 正文的 body-data 事件。两者语义不同，不能互相替代。

### 9.2 事件契约

```ts
interface CaptureEventSink {
  enqueue(kind: CaptureExchangeEventKind, summary: CaptureExchangeSummary): void;
}
```

`CaptureExchangeSummary` 需支持 pending 表达：`statusCode` 与 `durationMs` 可缺省，Renderer 据此渲染进行中状态。`appId` / `appName` 同样可缺省（非 Windows、远程客户端、反查失败）；反查排队期间额外带 `appPending: true`（见 8.4）。

事件批次 `CoreEventBatch` 除 `events` 外带可选 `clientApps: ClientAppIdentity[]`，只携带本批新出现的应用身份（见 8.5）。

队列合并行为：同 id 事件就地合并，**保留首次 sequence、摘要取最新、kind 不更新**。因此 `exchange-added` 尚未 drain 时到来的 `exchange-updated` 会被正确压成一条 added。

推送节奏与背压：`CoreApplication` 用 `EVENT_FLUSH_INTERVAL_MS`（50ms）定时器持续 `drain`，并在收到 `event-ack` 后立即再 flush 一次，**与 Exchange 的生命周期阶段无关**。单批上限 `EVENT_DRAIN_BATCH`（200 条），未 ack 批次上限 `EVENT_INFLIGHT_WINDOW_SIZE`（8 批），窗口满或无 RPC 连接时本轮跳过、事件留在队列里继续合并。

由此产生的可见语义：每次 `patch()`（含每个 body chunk）都会同步 enqueue，但 UI 收到的是**每 50ms 一帧的最新快照**，而不是每个 chunk 一帧。中间值会被跳过（例如 `responseBytes` 不会逐块呈现），这是保护数据面与限制 IPC 频率的有意取舍。

### 9.3 Renderer 命令

| 命令 | 用途 |
| --- | --- |
| `sessions.query` | keyset 分页拉取 summary |
| `sessions.detail` | 单条完整 headers 与 body 引用 |
| `body.read-range` | 按 hash + offset + length 读取正文片段 |
| `body.export.start` | Save body：把完整正文流式写到用户选定文件，不受预览上限限制 |
| `websocket.frames` | WebSocket 帧分页 |
| `websocket.breakpoint.enable` | 为当前 exchange 启用 direction / frames 配置 |
| `websocket.breakpoint.disable` | 停用当前 WebSocket 帧断点 |
| `grpc.messages` | gRPC envelope 分页 |
| `proxy.start` / `proxy.status` / `proxy.setRecording` | 生命周期；Renderer 的 Stop 映射为 `setRecording{false}` |
| `capture.cleanup` | Clear |

`proxy.stop` 不对 Renderer 开放常规入口，仅在 Main 的紧急修复路径中调用。

**按需解码**：`sessions.detail` 返回 `CaptureExchangeDetail`，正文经 `body.read-range` 按 hash 分块。带 `decode` 的请求由 `proxy/utils/index.ts` 按 gzip / deflate / brotli **多层且容错**地流式延迟解压，再按明文字节 `offset + length` 返回range并回传`end`与`decodeStatus`——正文本身始终按线上编码保存（见 6.4）。

**IPC字节范围**：`TypedArray.subarray()`共享底层ArrayBuffer，V8序列化可能携带整个buffer；返回有界range时需要独立字节存储，不能只靠view的`byteLength`判断实际传输量。

**gRPC framing 不读整段正文**：`grpc/entry.ts` 的 `GrpcService` 通过 `grpc/utils/index.ts` 解析 5 字节 envelope——每条只从 Blob 读 5B header，再按 payload length 跳到下一个 offset。payload 继续走既有的 range 读取，不需要新的存储结构。

**BodyViewer嵌套滚动契约**：正文pane内容溢出时由pane自身滚动；到达顶部/底部后继续同方向wheel必须交给Inspector外层scroll，不能由Monaco永久消费。产品`CodeViewer`与design-vite `MonacoFixture`都必须显式使用`alwaysConsumeMouseWheel:false`。外框可用`overflow:hidden`裁切圆角，但不得关闭Monaco内部scrollbar或阻断边界后的scroll chaining。

**BodyViewer填充**：`BodySection`通过grow Section把正文pane贯通到Inspector剩余高度；Compact高度按4.2节的内容高度与实际边框计算。

**Inspector分组折叠契约**：General、headers/trailers、request line、query、body、timing与cookies各自持有独立展开状态。标题是实际接收点击的button，使用`aria-expanded`表达状态、`aria-controls`指向由`useId()`生成的唯一正文id；正文折叠时保持挂载，只切`hidden`，避免BodyViewer等内部状态因收起而销毁。稳定automation ID由调用处按业务语义传给共享`SectionHeader`，共享primitive不硬编码feature ID。

WebSocket 与 gRPC 的意图 API 把 payload 原样转交，Core protocol 只校验 RPC 信封 / version / 关联字段，不对 payload 做运行时语义校验。

## 10. Renderer 数据层

```mermaid
flowchart LR
    EVENT["event-batch"] --> HOOK["useCaptureData"]
    HOOK --> STORE["captureStore"]
    STORE --> LIST["RequestList"]
    LIST -->|"选中行"| DETAIL["sessions.detail"]
    DETAIL --> INSPECTOR["RequestInspector"]
    INSPECTOR -->|"按需"| RANGE["body.read-range"]
```

**分层规则：**

- Zustand 只保存全部 `CaptureExchangeSummary` 与视图状态（filter、selection、scrollTop、tab、宽度）。
- 完整 headers、body、WebSocket/gRPC payload **不进入全局状态**，按需拉取。
- `useCaptureData` 常驻 App，跨 feature 持续接收事件。
- bootstrap 与重连以 **500 条分页批次**同步当前 Core 的全量 summary。
- Stop/Start **保留已有行**；只有 Core generation 变化或 Clear 才清空。
- 列表用固定 52px 行的 TanStack Virtual 虚拟化。
- 过滤完全在 Renderer 派生。

### 10.1 结构化筛选分栏

筛选是列表左侧可收起的 `CaptureFilterPanel`（宽度可拖，160–360px，存于 `captureStore.filterPanelWidth`），
`CaptureListbar`提供分栏开关、Recording、Clear、搜索与Import/Export。

七个 facet 分组，**顺序严格跟随列表表头**：

| facet | `CaptureFilter` 字段 | 取值来源 | 排序 |
| --- | --- | --- | --- |
| `application` | `apps` | `summary.appId`，无归属归入哨兵值；`appPending` 进入永久显示的 Pending bucket（见 8.4） | 首次出现顺序，Pending固定置尾 |
| `method` | `methods` | `summary.method` 大写 | 首次出现顺序 |
| `host` | `hosts` | `summary.host` | 首次出现顺序 |
| `status` | `statuses` | 状态码十进制串；无码时按 `failed` / `pending` 哨兵值 | 码值升序，Failed后接永久Pending |
| `protocol` | `protocols` | `protocolFacetValue()` | 固定版本序 |
| `type` | `types` | response headers未到时进入永久Pending；headers到达后由`typeLabel(responseMime)`决定 | 首次出现顺序，Pending固定置尾 |
| `rule` | `ruleIds` | `summary.ruleIds`，一条可命中多个 | 首次出现顺序 |

- **组内 OR、组间 AND，搜索与所有 facet 之间也是 AND**。`matchesCoreFilter` 同时供列表派生与实时事件使用，
  保证新到流量与已有行走同一判定。
- **分组展开状态与筛选值正交**。选择或取消 option 只更新对应 `CaptureFilter` 字段，保持该组和其他组
  当前的展开状态；只有分组标题或 chevron 可以调用 `toggleFacetExpanded`。设计稿 fixture 必须遵守同一
  交互契约，不能在筛选状态同步时重置用户手动展开的分组。
- **Protocol facet 比列表 Proto 列更细**：列表列把 `HTTP/1.x` 收敛为 `h1`，facet 则区分 `HTTP/1.1` 与 `HTTP/1.0`，
  另有 `HTTP/2`、`HTTP/3`、`WebSocket`、`TLS tunnel`。
- 值与计数由 `allFacetOptions` **一次遍历**派生全部 facet；实时流量下每条摘要只扫一遍，
    并经 `useThrottledRows(FACET_REFRESH_MS)` 节流。Application / Method / Host / Type / Rule 保持
    当前 Capture 中的首次出现顺序，计数变化只更新数字，不再按 count 动态换位；Status / Protocol
    继续使用各自的固定语义顺序。
- Application / Status / Content type 的 Pending option在count=0时也始终渲染并可选择；新进入加载态的request会自动命中已选bucket。请求完成后count回0但option不增删，避免facet高度与DOM抖动。Method / Host / Protocol在request headers阶段已确定，不提供虚假的loading项；Rule当前没有独立“计算中”字段，也不编码无法区分的状态。
- Clear 成功把 `rows` 置空时，facet snapshot 必须立即同步为空；节流只约束非空实时更新，不能让列表
    已显示 `0 of 0` 时分栏仍短暂保留旧 app id、选项与计数。
- 产品按钮、Agent和MCP的Clear都在Main取得清理开始时间，并只在`capture.cleanup{all}`成功后广播
    `capture:reset { clearedBefore }`。Renderer统一以该时间边界清空rows、selection与Rules hits；旧分页和
    `startedAt <= clearedBefore`的迟到事件不得回填，清理开始后到达的新流量仍可进入当前视图。并发Clear乱序完成时
    cutoff只允许单调增加；旧reset不得再次删除较新cutoff之后已经进入Store的rows。
- 哨兵值用 `\u0000` 前缀（`UNKNOWN_FACET_VALUE` / `FAILED_FACET_VALUE` / `PENDING_FACET_VALUE`），
  与真实 host、状态码字符串不可能碰撞。
- 搜索仍只匹配 `host + path`，是独立维度，不计入 `hasActiveFilter` 的 badge。

#### 10.1.1 Body effect evidence

存在`requestBodyEffect/responseBodyEffect`时，Inspector Body section标题行依次显示标题、可点击`Rule replaced` marker、`Text/File`来源与chevron；marker点击沿用Header effect的Rules导航，MIME/大小只在BodyViewer工具栏显示。展开区顶部使用独立`Body version · Original / Final`证据栏并默认Final：Request Original为客户端入站正文，Response Original因header-stage流式替换不可观测而disabled，正文区显示明确不可用提示，不伪造diff。

主`requestBody/responseBody`始终指向Final；effect内的`originalBody`只在`originalState:'available'`时存在，`empty`与`unavailable`必须区分。BodyViewer读取、Copy、Save、Fullscreen都只作用于当前Original/Final选择，MIME/大小标签同步所选ref。Header effect marker与Body effect marker都只表达真实证据，不从rule hit反推。

**列顺序：Path 在前、Host 在后。** 列表主列渲染为 `path · host` 而非 `host · path`——host 在筛选分栏里
一点即达，path才是同一host下区分请求的信息。窄宽度下按4.2节的两个容器档位隐藏Proto/Type与Size/Time，Path · Host主列永不隐藏。

### 10.2 源站证书失败的就地出口

TLS 有两类失败，能做的事完全不同：

- **TLS①（客户端不认我们的 CA）**：整个 app 不可用，由 App 壳的全局 compatibility dialog 处理，
   出口是加 TLS passthrough。
- **TLS②（源站证书本身不可信）**：只影响单个 host，失败的 exchange 本来就躺在 Capture 列表里，
   因此不再加第二个全局弹窗，改为在 Inspector 的 Connection / TLS 面板里就地给出口。

判据是 detail 的 `errorCode` 落在证书校验错误集合内（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`、
`SELF_SIGNED_CERT_IN_CHAIN`、`CERT_HAS_EXPIRED`、`ERR_TLS_CERT_ALTNAME_INVALID` 等）。协议协商类失败
（`EPROTO`、`ECONNREFUSED`）不显示，因为加 per-host 例外并不能解决。点 `Trust this host` 写入
`tls.replaceInsecureHosts`，Core 在同一条命令里完成持久化与生效。

### 10.3 正文预览渲染矩阵

正文查看器是共享内核 `components/BodyViewer/`，Capture / Composer / WebSocket / gRPC 用同一实现。

**外壳与内核分离**：内核只吃 `(bytes, mediaType, truncated)`，不认识 hash、IPC 与 Save；
`RequestInspector/BodyView.tsx` 是 Capture 侧外壳，负责按需拉字节、跟踪解码与截断状态、驱动 Save body。
Composer 的 `ResponseBodyPane` 直接用内核。

**内容类型（`kind`）与查看档位（`mode`）是两个独立维度。** `kind` 由 MIME + 内容探测决定并锁定工具行的
MIME/体积标签，`mode` 只决定渲染方式。合成单一枚举会直接出 bug（在 JSON 上点 Hex 跳到另一条请求、
HTML点Raw变成JSON）。内容探测用于选择未知MIME的默认文本或二进制档位，并将探测结果追加进候选档位以容忍MIME谎报，不提供独立的Auto档。

| `kind` | 默认档 | 候选档 |
| --- | --- | --- |
| `json`（含 `+json`、ndjson） | Pretty | Tree · Raw · Hex |
| `code`（HTML / CSS / JS / XML / SVG） | Code | Raw · Hex |
| `image`（非 SVG） | Preview | Hex |
| `markdown` | Preview | Split · Source · Hex |
| `form`（`x-www-form-urlencoded`） | Form | Raw · Hex |
| `text` | Text | Hex |
| `binary` | Hex | Text · Hex |
| `media`（`video/*`、`audio/*`） | 元信息 + Save body | 无档位，零读取 |

`multipart/form-data`不提供结构化part列表，按binary展示；结构化预览可采用part列表与选中part递归复用BodyViewer的候选方案。

档位名是技术术语（Pretty / Raw / Hex…），与 JSON、Hex 同类，**不进 i18n catalog**。

**各档实现要点：**

- **Hex**：逐行虚拟化。按16字节一行时2 MiB约13万行，不虚拟化会在拖动 Inspector 分栏时因
  `ResizeObserver` 重算整份 dump。
- **JSON Tree**：自建 + `@tanstack/react-virtual`，可右键复制 value / object / path。Monaco 是编辑器，
  **折叠 ≠ 树**，没有 tree view 这种 UI 形态，自建才能套设计 token 并挂右键菜单。
- **Code 的 Format**：HTML/CSS直接调用Monaco language WorkerManager，JavaScript使用公开worker getter，
    XML由`xml-formatter`补。worker返回的edits先在只读model外按offset倒序合并，再一次替换model；不加载
    `formatActions` contribution，也不临时解除read-only。JSON美化仍用`JSON.parse/stringify`（V8原生，
    快于绕一趟worker）。任一formatter失败都恢复调用前原文；诊断全部关闭，避免白烧worker CPU。
- **Image**：`Blob` → `<img src=blob:>`，`onload` 读 `naturalWidth/Height` 显示尺寸，`onerror` 统一兜住
  破图/不支持格式，cleanup 里 `revokeObjectURL`。用 blob URL 而非 data URL——字节本来就是 `Uint8Array`，
  data URL 要多一次 base64（+33% 字节 + 一份字符串）。SVG 是可执行 XML，按 `code` 展示，默认不渲染。
- **Markdown**：`react-markdown` + `remark-gfm` 做元素级组件映射，默认不渲染裸 HTML（天然防 XSS，
  也因此不需要放宽 CSP）。Split 为上下分栏（Inspector 横向不够宽），不做滚动同步。

**阈值**（全部定义在 `packages/core-protocol/src/messages.ts`）：

只读文本/结构化/WS/gRPC最多2 MiB；完整正文≤1 MiB自动格式化，1–2 MiB只手动，预览或捕获截断都不格式化。`previewTruncated`只表达读取上限，以便丢弃半个UTF-8尾字符；`incomplete`单独表达捕获不完整，阻止格式化但保留真实坏字节。图片读取和解压使用独立16 MiB预算。压缩输入大小不能充当解码输出预算；正文保存、HAR/Archive、编辑与发送仍使用完整数据。

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `BODY_PREVIEW_MAX_BYTES` | 2 MiB | 文本 / WebSocket / gRPC payload的单次只读预览上限，压缩文本解码按相同输出预算 |
| `IMAGE_PREVIEW_MAX_BYTES` | 16 MiB | 超过则连 IPC 都不发，直接给元信息 + Save body |
| `FORMAT_AUTO_MAX_BYTES` | 1 MiB | 完整正文及以下自动格式化 |
| `FORMAT_MAX_BYTES` | 2 MiB | 1–2 MiB只响应用户Format；超限、预览截断或捕获不完整禁用 |

阈值作用是**防用户干等**，不是防卡：Monaco 在 worker 里跑不阻塞主线程，但 TS parser 处理超大 min.js
仍是几十秒。图片上限的作用也不是防崩溃，而是**防半张图**（截断字节喂给 `<img>` 比不显示更糟）并省下 IPC。
Core decode接收调用方的输出预算：文本2 MiB、图片16 MiB，不以压缩输入size缩小该预算。图片未完整拿到字节时`decodeStatus === 'limited'`回到元信息与Save，不向`img`传半张图。

正文读取链路传`Uint8Array`，不为IPC增加base64/dataURL转换。下表区分各项工作所在进程；进程隔离不保证端到端延迟，也不消除大正文进入Renderer后的解析和分配开销：

| 工作 | 执行位置 | 卡 UI |
| --- | --- | --- |
| Core 读字节、gzip 解压（zlib 在 libuv 线程池） | Core 进程 | 否 |
| IPC 搬运（两次 memcpy） | Main 进程 | 否 |
| Hex 拼字符串与排版 | **Renderer 主线程** | **是（故虚拟化）** |
| JS formatter 的 parse | Monaco worker | 否（故不需 Prettier） |
| 图片解码 | Chromium 图片解码线程 | 否 |

**预览截断不等于数据丢失。** 预览上限只作用于Inspector单次拉取的字节数，不截断Core保存的正文；存储写入仍受6.3节的积压及磁盘错误边界约束。
超出时 UI 明确显示预览大小与完整大小，用户可经 **Save body**（`body.export.start`）把完整编码正文
流式写到自选文件，该路径不受预览上限限制。

## 11. 验证边界

- 规则命中时的慢上传：Origin 在第二块正文发出前收到 headers。
- 规则命中时的下载：响应头先于源站正文结束到达客户端。
- 早期 401/413/417：Exchange 完整保留。
- 早期响应分别提交两侧正文；非413等待双向结束，完整413响应保存当时已捕获的上传片段。
- WebSocket 上游升级失败判为 `aborted` 而非停在 `pending`（回归用例 *marks the exchange aborted when the upstream websocket upgrade fails*）。
- WebSocket 升级期间客户端断开时，已建立的上游连接被关闭（回归用例 *closes the upstream websocket when the client disconnects during the upgrade*）。
- Clear 后旧 generation 的迟到事件被全部丢弃。
- WebSocket 捕获在退订 completed 事件后仍完整。
- gRPC `grpc-status` trailer 在退订 completed 事件后仍可读。
- H1 / H2 / HTTPS MITM 三条链路上压缩正文双向逐字节保真，且 bodyRef 记录了还原所需的 `mediaType` 与 `contentEncoding`（回归用例 *forwards compressed bodies byte-for-byte …*）。
- WebSocket 文本（多字节 UTF-8）与二进制（全 256 字节值）消息回显与落库逐字节一致，未编辑的断点不做 hex/utf8 回转（回归用例 *forwards and stores websocket text and binary payloads byte-for-byte*、*keeps binary websocket payloads intact through an unedited breakpoint*）。
- 67 MB Range 视频：全程流式，Core 内存峰值不随文件大小线性增长。
- SSE 与无限 chunked 响应：行立即出现，字节持续增长。
- Pause 前开始、Pause 后完成的请求继续记录。
- Header规则效果与四组wire headers分别核对，不能用effect marker代替真实传输证据。
