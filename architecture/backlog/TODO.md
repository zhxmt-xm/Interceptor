## Todo list

> 最后更新：2026-07-26
> 范围：Capture、Rules、真实请求转发、正文与文件任务、系统代理 / MITM。
> 标记：`确认 BUG` 已由代码或复现实验证明；`实现限制` 是当前明确能力边界；`兼容风险` 取决于外部网络或客户端；`安全/隐私` 涉及敏感数据与系统范围影响。

## 已完成且必须保持的基线

- [x] **Capture 增量管线**：Exchange 在 `request-initiated` 即创建并推送（`state='pending'`），不再等 completed 事件配对。已退订 completed `request`/`response`，Mockttp 不再无条件缓冲完整正文。
- [x] **规则头部阶段执行**：单一 `forAnyRequest` + `beforeRequestHead`/`beforeResponseHead`，无 CallbackMatcher、无全量缓冲；上传与下载全程流式。
- [x] **Mockttp patch**：`patches/mockttp+4.5.0.patch` 提供 trailer 事件与 headers 阶段钩子，经 `patch-package` + `postinstall` 重放，已验证随包发布。
- [x] **架构设计文档**：`architecture/feature-*.md` 记录每个 feature 的调用流程与边界。
- [x] Capture request 右键可按 11 种 Action 创建当前完整 URL 的 exact Rule 草稿；只打开 Rules，不自动 Apply。
- [x] Capture 支持 Rule 多选 OR 过滤；Rules 可跳回 Capture；Header Rule marker 可跳转仍存在的 Rule。
- [x] 当前 Capture 没有任何 Rule 命中时，Add filter 的 Rule 字段禁用且不打开空菜单。
- [x] Exchange summary/detail 保存唯一 `ruleIds`，Header effect 保存具体 `ruleId`，Native Archive 可 round-trip。
- [x] KV 使用 `18px` 行盒；Rule marker 与文本共用中线、间距 `4px`；Copy button 为 `18×18px` 且无额外下沉。
- [x] 文本 / HTML / JSON、WebSocket、gRPC 预览上限为 `1 MiB`，CodeMirror / Hex viewport 最大 `320px`；Core 仍完整保存正文。
- [x] gzip / deflate / Brotli 从 Body Store 流式解码有限明文；损坏或不支持的压缩正文 Auto 模式回退 Hex，不再把压缩字节显示成 HTML 乱码。
- [x] `video/*` / `audio/*` 在 Renderer 零读取、零 Hex；经 Main Save Dialog + Core transfer job 保存完整编码正文。
- [x] MITM 保持 `http2:true`；BYD 参数对比和大唐 EV 的首载 / 刷新已验证为 `200`，无 `ERR_HTTP2_PROTOCOL_ERROR`。
- [x] 当前 package、artifact audit、packaged smoke、337 项 unit tests、54 个 parity view 均已通过；这只是现有基线，不代表下列风险已覆盖。

---

## P0：真实请求透明性与稳定性

### 1. Mockttp 动态 Rule 预筛选会阻塞所有上传（已解决）

- [x] **确认 BUG**：已移除 `forAnyRequest().matching(callback)` 形式的 Rule 预筛选。Mockttp `CallbackMatcher.matches()` 会先 `waitForCompletedRequest()`，即使最终返回 `false` 也已读完整 request body。
- [x] 改为单一 `forAnyRequest().thenPassThrough({ beforeRequestHead, beforeResponseHead })`，所有判定在头部阶段完成，不消费 body。
- [x] 回归测试：规则命中时的慢上传，源站必须在第二块正文发出前就收到请求头。
- [ ] 补充验证 chunked、未知长度、大文件上传、客户端中途断开和 `Expect: 100-continue`。

### 2. Capture completed-event 仍会完整缓存所有正文（已解决）

- [x] **确认 BUG / 容量风险**：已停止订阅 Mockttp completed `request` / `response`。只要注册 completed listener，Mockttp 就会调用 `waitForCompletedRequest` / `body.asBuffer()` 无条件缓冲。
- [x] 使用 `request-initiated` / `response-initiated` 建立 Exchange，使用 `request-body-data` / `response-body-data` 增量写 TemporaryBodyStore。
- [x] 单正文按**累计字节**跨过内存阈值时立即 spill，不再等 Mockttp 在内存组装完整 body。
- [x] Paused 时不再因已注册 completed listener 隐式缓存所有正文。
- [x] 待落盘字节超过 `BODY_WRITER_PENDING_LIMIT_BYTES` 时降级为只计数，保证 Core 内存有界。
- [ ] 为并发大媒体、并发上传和磁盘慢写建立内存峰值测试，并在 UI 明示降级状态。

### 3. Response Rule 破坏流式响应语义（已解决）

- [x] **确认 BUG / 实现限制**：已改用 `beforeResponseHead`，不再 `streamToBuffer`。SSE、无限响应、长下载、gRPC streaming 不再因规则命中而无首字节。
- [x] Header/status-only Action 在 response headers 到达时执行，不等待 body。
- [x] Body 整体替换不等原文，上游流直接 `resume()` 倒掉。
- [x] Delay 语义明确：现在延迟的是响应头，不是完整 body 收完后。
- [x] 回归测试：命中响应规则时，响应头先于源站正文结束到达客户端。
- [ ] 补充真实 SSE、无限 chunked、HTTP/2 大 Range、server-streaming gRPC、客户端取消和源站 reset 的端到端验证。

### 4. 未填写的条件会匹配一切（已解决）

- [x] **确认 BUG**：刚新建、还没输入 host 的规则会命中全部真实流量——`contains ''` 的 `value.includes('')` 与 `regex ''` 的空模式都恒真。真实代理 + 真实源站集成测试已复现并回归。
- [x] Matcher 编译器把未填写的值解释为“还没配好”而恒不匹配；没有任何条件的规则同样恒不匹配。只能在响应阶段判定的规则在请求阶段仍保守放行。
- [x] Renderer 直接限制操作：字段未填完的规则不允许启用（开关置灰 + 说明），新建规则与 Capture 草稿默认不启用；已启用的规则任何时候都可关掉。
- [x] 删除假的 `rules.validate` 命令（固定返回 valid）及其协议/Main/Preload 链路；未填写提示改为 Renderer 本地纯函数 `ruleIssues` 即时派生。
- [x] Core 信任 Main/Renderer 传递的数据，不做规则语义校验；真实流量安全由“未填写条件不匹配 + 不完整规则不能启用 + 引擎只编译 enabled 规则”三道边界保证。
- [ ] 非空但无法编译的 regex、不可解析的 JSON body、不存在的 Map Local 文件仍然只会静默失效，需要在 Renderer 给出可见提示。

### 5. Throttle 是假功能（已移除）

- [x] **确认 BUG**：真实代理 + 真实源站实测，规则设 8 KiB/s、下载 128 KiB，**17 ms** 完成（真限速需 ≥16 s），而 UI 仍显示命中。
- [x] 选择移除而不是实现：限速必须介入正文流，而规则全部在头部阶段执行，需扩 `patches/mockttp+4.5.0.patch`（约 60 行，含 override 分支流式化与 resolve 时序改造）；浏览器 DevTools 本身就支持限速，不值得为此增加 patch 复杂度与升级风险。
- [x] 已从协议、RuleEngine、action executor、Renderer（菜单/编辑器/chip/右键菜单）、automation ID、15 种语言文案与设计稿中删除。
- [ ] 若以后重新引入，必须同时覆盖：body 被规则替换时也要限速（否则静默失效）、resolve 等 `clientRes` finish、gRPC trailer 时序、客户端取消与 Stop/Clear 中断。

### 6. Breakpoint 没有原始 HTTP body（已处理）

- [x] **确认 BUG**：真实代理集成测试证实断点快照的 body 恒为 `undefined`，而 UI 却显示一个标着“body · editable”的空输入框。
- [x] **发现更严重的数据破坏**：`buildEdit` 无条件发送 `body: ''`，因此在断点面板只改一个 header 就点 Continue，会把真实上传/响应正文整体替换成空。
- [x] 快照新增 `bodyAvailable`：HTTP 头部阶段断点为 false，WebSocket 消息断点为 true。Renderer 在不可见且用户未输入时不再发送 `body`，UI 改为“Replace body / 原文尚未到达 / 留空则原样转发”；设计稿同步。
- [ ] 若要展示“已接收片段”，从 `ExchangeTracker` 增量 writer 读取，不为断点再制造第二份无界内存。
- [ ] Binary body 不能一律 UTF-8 replacement；提供 text / hex，并保留编码/长度信息。
- [ ] 验证 Execute edited 后 content-length、content-encoding、transfer-encoding 和 H2 framing 正确。

### 7. 系统代理可能让依赖上游代理的环境断网（已解决，仅 Windows）

- [x] **确认兼容风险**：Windows Enable 会清除原 PAC、Auto Detect、Proxy Server 和 bypass 并写入 `127.0.0.1:8888`，而 Proxy Core 只直连源站；必须经公司 PAC、VPN proxy 或认证 proxy 才能联网的环境在启用期间会完全断网。
- [x] 接管前读到的配置转成 `UpstreamProxyConfig`，经 `proxy.setUpstream` 下发 Core，交给 Mockttp `thenPassThrough({ proxyConfig })` 链式转发。PAC 用 `pac+<url>` 交给内置 `pac-proxy-agent` 求值。
- [x] `bypassList` 转 curl 风格 `noProxy`，`<local>` 展开为 `localhost`/`127.0.0.1`/`::1`。
- [x] 不把自己的监听地址当上游（崩溃残留会形成自环）。
- [x] `proxyConfig` 用回调求值，切换上游不重启监听器；Core 重启后经 `onCoreProcessReady` 重新下发。
- [x] 集成测试（真实上游代理 + 真实源站）：直连、经上游、切换即时生效、`noProxy` 绕过。
- [ ] macOS 尚未接入：快照按网络服务分开存，多服务可能各自配不同代理，需先定义合并语义。
- [ ] 认证代理（`Proxy-Authorization`）尚未验证；WinINet 不保存凭据，需要用户手工提供。
- [ ] 仅 Auto Detect（WPAD）环境没有可传给 proxy-agent 的 URL，目前按直连处理。
- [ ] Settings 尚未向用户展示当前上游代理，排查只能看 `proxy.upstream-configured` 诊断。

---

## P1：Capture 生命周期与准确性

### 8. Exchange 只在 completed 后出现（已解决）

- [x] Request headers 到达时立即创建 `pending` Exchange 并推送行；Response headers 到达时更新 status/mime；正文与 trailer 增量更新；完成/失败/abort 只负责终态。
- [x] 为状态机定义合法迁移：请求侧 `headers → body → complete | aborted`、响应侧 `none → headers → body → complete | aborted` 独立推进，对外聚合为 `pending / request-complete / response-streaming / completed / aborted / failed`。
- [x] 事件幂等：所有入口按 request id upsert，终态不可回退，bytes 用 observed 计数覆盖而非累加。
- [ ] 补充 SSE、长下载、长上传和 gRPC streaming 的进行中可见性端到端验证。

### 9. 早期响应可能丢 Exchange 并残留 pending（已解决）

- [x] **确认风险**：改用 `request-initiated` 建立 Exchange 后，origin 在 request body 完成前返回 `401/413/417` 不再丢失记录。
- [x] 用 request id 关联 response；response 可以先完成，request body 仍可继续/abort，最终合并为同一 Exchange。
- [x] 1xx 中间响应经 `response-information` 追加记录，不改变主状态。
- [ ] 补充 early hints、100 Continue、客户端停止上传、源站提前 close/reset 的端到端覆盖。

### 10. Pause / Resume 的时间切面不准确（已解决）

- [x] 已定义为“请求开始时固定 capture generation”：`request-initiated` 时判定 `recording` 并固定 generation，后续事件沿用。
- [x] 录制中开始、暂停后才完成的长请求继续完成记录；暂停期间开始的请求始终不建记录。
- [x] Stop 仍只暂停记录，不停止转发或系统代理。
- [ ] 继续补gRPC streaming及压力场景跨Pause/Resume验证；2026-09-09已补upload/download/SSE六个本地时序用例，修复WebSocket恢复后孤立正文，Proxy122/122与真实Pause/Resume、队列隔离2/2 Green。证据及实际范围见[Capture录制验证](../features/capture.md#73-pauseresume验证证据)，不将未跑的gRPC一并标记完成。

### 11. Clear 与迟到事件 / 文件任务竞态（部分解决）

- [x] 每个 Exchange 绑定 capture generation；Clear 经 `prepareCaptureReset()` 递增 generation 并 abort 全部在途 body writer，旧 generation 的 request/body/response/trailer 全部拒绝。
- [x] Clear 后迟到 event 不会重新创建 row、body ref、rule hit 或 WebSocket frame（已有回归测试）。
- [ ] Clear 与 Body save、HAR export、Archive export/import 同时发生时定义 snapshot / lease / cancel 语义。
- [ ] 当前 Body save 不阻塞 Clear；Clear 删除 spill 时，正在读取的 export stream 可能失败。
- [ ] 覆盖 Clear 点击瞬间的 in-flight H1、H2 多 stream、WebSocket 和 gRPC。

### 12. Capture bytes、framing 与网络事实需进一步明确

- [ ] 区分 wire encoded bytes、decoded preview bytes、Rule body override bytes；Size 列和导出必须标明采用哪一种。
- [ ] Content-Length 缺失、错误或与实际捕获长度不一致时，不能把正文标成完整；记录 observed bytes 与 declared bytes。
- [ ] 保留 `Content-Type` charset 参数；当前正文 MIME 归一化会丢 charset，Renderer 又固定按 UTF-8 解码。
- [ ] 捕获 H2 stream ID、RST_STREAM、GOAWAY、settings、trailers 与取消原因；未获取时 UI 不伪造。
- [ ] 区分 client abort、origin abort、Rule block/reset、TLS failure、Capture persist failure。
- [ ] HTTPS passthrough 明确只能有 CONNECT metadata；不能与解密 HTTP Exchange 混为一类。

### 13. Capture 无界增长

- [ ] **实现限制 / 容量风险**：定义用户可见的内存、磁盘和 session 生命周期策略；当前 Exchange summary、headers、Body refs、event queue 和 Renderer rows 都不淘汰。
- [ ] 多个 `<1 MiB` 正文会一直驻内存；单体 threshold 不能限制大量小正文累计内存。
- [ ] Event batch 未 ACK 时 pending queue 无上限；Renderer 长时间卡死可导致 Core 队列持续增长。
- [ ] 虚拟列表只减少 DOM，不减少 Zustand 中所有 summaries 的内存。
- [ ] 磁盘满时当前只跳过 body；UI 应明确标注 body capture failed，而不是让用户误以为正文为空。
- [ ] 提供 session size、memory/spill bytes、磁盘剩余量和明确的 Clear / 保存建议；策略不得静默丢数据。

### 14. WebSocket / gRPC / 长连接准确性

- [ ] WebSocket 超大单 frame 仍会整体进入 `ws` Buffer；定义 frame 大小与增量/落盘策略。
- [ ] 原生 gRPC 当前只在完整 HTTP body 后扫描；server-streaming / bidi-streaming 长时间不会显示消息。
- [ ] gRPC 增量 parser 需跨 chunk 保存 5-byte envelope 状态，处理 compressed flag、畸形 length、trailers 和中途 reset。
- [ ] H2 Extended CONNECT WebSocket 未实现；UI/过滤不得把它误标为普通 H2 request。

---

## P1：Rules 正确性与 Rules / Capture 联动

### 15. Rule hit 数不是“处理过的请求数”（已解决）

- [x] **确认 BUG**：真实代理实测一条三 action 的规则命中一个请求，命中数计为 3。现已按 `Rule × Exchange` 去重，命中数即“拦到多少个请求”。
- [x] Clear 后 Rules hit counter 立即清零，不等下一次 4s poll。
- [ ] 如需同时展示 `executed actions` 与 `blocked/short-circuited`，再单独设计，不用一个数字混合。

### 16. 历史 Capture 指向当前 Rule，不是命中时版本

- [ ] 保存每次命中的 `ruleRevision`，必要时保存可审计的 Rule snapshot / name / action summary。
- [ ] Header marker 不能只凭 ruleId 跳到后来已修改的当前 Rule，否则用户看到的详情与历史效果不一致。
- [ ] Rule 删除后 marker 点击应提示“历史规则已删除”，不能静默无反应。
- [ ] 防止 Rule ID 被复用后历史 Capture 误指向无关新 Rule。
- [ ] Native Archive 当前保留 `ruleIds` / header `ruleId`，但不包含完整历史 RuleDefinition；导入后要么恢复 snapshot，要么明确只读证据不可跳转。
- [ ] Rule 编辑但 ID 不变时，旧 Capture 的 Rule filter 标签应显示命中时名称/版本，而不是新名称。

### 17. Rule 草稿和 Apply 冲突可能丢失本地编辑（已解决）

- [x] **确认 BUG**：乐观并发冲突后不再自动 `loadRules()`；本地草稿与冲突提示都保留，用户只能通过显式 Reload 按钮放弃草稿。
- [x] 冲突提示不再被 `loadRuleSet` 立即重置为无错误状态。
- [ ] 多窗口/多实例并发编辑、Core restart 和 Rules 首次加载需要 workflow 测试。
- [ ] 如需 base/local/remote 三份合并，在有真实多实例场景后再设计。

### 18. 右键 exact URL 可能泄漏秘密且过度脆弱（已解决）

- [x] **安全/隐私**：右键建规则现在只取 scheme+host+path，**丢弃整个 query 与 fragment**。这同时解决了 token/signature 明文落 `rules.sqlite` 和缓存戳/动态 query 被固化为 exact 导致规则永远不再命中两个问题。
- [ ] 如需让用户选择匹配范围（完整 URL / host / method+path），再单独设计菜单。
- [ ] 重复 key、百分号编码和默认端口的规范化尚未处理。

### 19. Rules → Capture 在无命中时仍可进入空列表（部分解决）

- [x] Rules editor 的“Show matching requests”按钮在当前 Capture `0` 个匹配 Exchange 时禁用，并用标签说明原因。
- [ ] Rule 被禁用、删除或未 Apply 时，区分“当前 Capture 无命中”和“草稿尚未参与执行”。
- [ ] Capture filter 中存在已经删除的历史 ruleId 时，显示历史名称/不可用状态，不直接显示裸 ID。
- [ ] 从 Rules 跳回 Capture 时保存/恢复用户原筛选，或明确这是一次临时替换；当前会直接清空旧条件。

### 20. Rule phase 组合和热更新一致性

- [x] 新增/删除 response Rule 对已在途请求的生效方式已确定：只有单一 passthrough 规则，不再由“请求最初选中哪个 Mockttp hook”偶然决定；响应阶段按 `beforeResponseHead` 执行时的规则集求值。
- [ ] response-only matcher + request Action 当前永远不执行；validator 必须拒绝或重新定义语义。
- [ ] 明确 request Action 改写后的 method/URL/headers 是否参与 response Rule matcher；为 map-remote、query/header rewrite 后再匹配 response Rule 添加真实集成测试。
- [ ] 同一请求的 request phase 与 response phase 应固定在同一 RuleSet revision；当前两个钩子各自读 `this.compiled`，热更新窗口内仍可能跨 revision。
- [ ] Rule priority、短路 Action、多个 Rule 对同一 header/body/status 的执行顺序必须有可审计记录。

### 21. Rule observability 不完整

- [ ] 当前只有 Header Action 有可点击 marker；为 query/body/status/map/delay/block/breakpoint/synthetic 提供统一 Rule evidence timeline。
- [ ] 无实际变化的 remove/matcher 不应冒充 wire effect。
- [ ] Capture detail 应区分客户端原始值、Rule 中间状态、发往 origin 的最终值、origin 原始响应和发给客户端的最终值。

---

## P1：正文预览、保存、HAR 与 Archive

### 22. 文本与二进制不应共享 1 MiB 预览上限

- [ ] 文本/HTML/JSON 可保留 `1 MiB`；Hex、WebSocket binary、raw protobuf 建议降到 `64–128 KiB`。
- [ ] **确认性能风险**：1 MiB Hex 会生成约 `65,536` 行、`4.75 MiB` 字符串；即使 viewport 只有 320px，仍会占用大量 CPU、内存和 DOM/CodeMirror 成本。
- [ ] Hex 应按可视范围虚拟化或按页读取，不应一次构造完整字符串。
- [ ] Copy 明确只复制当前预览，并显示复制字节数；大 binary Copy 不应同步构建多 MiB 字符串。

### 23. Charset 与截断语义

- [ ] 按完整 `Content-Type` charset 解码 UTF-8、GBK/GB18030、Shift-JIS、ISO-8859-1 等；未知 charset 明确回退。
- [ ] UTF-8预览截断边界：当前实现与最终验证证据随本项保存，前置E2E Red缺口保留。显式截断标记和TextDecoder只暂缓尾部半个字符，真实坏字节与Hex原始数据保留；2026-09-10 unit40/40、Desktop typecheck及HTTP/压缩/WebSocket/gRPC四条真实workflow分别1/1 Green，含完整Save和系统恢复。实现前用户禁止E2E，不回滚补造历史Red、不将提交当作前置门禁通过；证据见[Capture预览](../features/capture.md#utf-8预览截断)。
- [ ] 大 JSON 截断后不能标为“有效 JSON”；显示“JSON preview truncated”，关闭错误的完整格式化/校验结论。
- [ ] HTML/XML 截断是预览，不应让用户误以为文档结构完整。
- [ ] unsupported / corrupt content-encoding 要区分“编码不支持”和“数据损坏”，并提供 raw Hex 与保存原始正文。

### 24. 媒体识别与 206 Partial Content

- [ ] 不能只依赖 `video/*` / `audio/*` MIME；`application/octet-stream`、错误 MIME 或缺失 MIME 的 MP4/WebM 仍可能触发巨大 Hex。
- [ ] 使用 MIME + magic bytes + Content-Disposition 综合识别媒体/文件。
- [ ] `206 Partial Content` 的 Save body 只保存当前 Range，不是完整媒体；UI 必须显示 Range 和“保存当前响应片段”，不能暗示下载完整文件。
- [ ] 保存的是 encoded wire body；若存在 `Content-Encoding`，文件扩展名与内容可能不一致。提供“保存原始编码正文 / 保存解码正文”选择。

### 25. Body export 的原子替换存在旧文件丢失窗口（已解决）

- [x] **确认 BUG**：已删除 `rm(filePath)` 再 `rename(temp, filePath)` 的顺序，四处导出（body / HAR / diagnostics / archive）全部改为直接 rename 覆盖。去掉 `rm` 后全量测试仍通过，证明 `rename` 本身就能覆盖、`rm` 纯粹是风险。
- [ ] 覆盖 destination 被占用、只读目录、磁盘满、rename 失败和进程崩溃后的 temp 清理。

### 26. Body export 取消、Clear 与状态反馈竞态

- [ ] Cancel 与最终 fsync/rename 建立提交点；提交后不能再把已落盘文件显示为 Cancelled。
- [ ] BodyView 目前只有 loading，没有 Cancel、进度、成功位置或完成反馈；大媒体保存应复用完整 Transfer UI。
- [ ] Clear / Core shutdown / body GC 与 export stream 建立 lease 或 snapshot；不能一边删除 spill 一边导出。
- [ ] 导出失败时区分 body 已被 Clear、磁盘错误、权限、取消和 Core restart。

### 27. TransferJob 与 Capture 存储长期增长

- [ ] TransferJobManager 当前永久保存所有终态 job；定义 UI 消费确认、有限历史或显式清理。
- [ ] 不得只按任务条数粗暴淘汰仍被 UI 轮询的 running job；终态清理需可证明不会破坏查询。
- [ ] Capture 内大量 `<1 MiB` body 全驻内存；增加总体 usage 观测与用户决策，不静默丢弃。
- [ ] spill 文件是未加密原始正文；崩溃后直到下次启动清理前仍在磁盘。明确权限、生命周期和“敏感会话”清理入口。

### 28. HAR / Native Archive 大文件风险

- [ ] HAR export 当前按 chunk 读取后 `Buffer.concat` 单个完整 body，再 base64/JSON stringify；大正文可再次造成 Core OOM。改为流式编码/写入。
- [ ] HAR import / export 不设文件、entry、header、URL、body 总量；对不可信超大 HAR 建立流式 parser 和明确资源策略。
- [ ] Native Archive 不支持 ZIP64；超大 Capture 可能无法保存。
- [ ] Archive import 当前不限制 entry 数、解压总量、压缩比；不可信 archive 存在 zip bomb / 磁盘耗尽风险。
- [ ] Native Archive 当前不保存完整历史 Rule definitions；需要与 Rule evidence 方案一起补齐。
- [ ] Archive/HAR 与 Clear/Recording 并发语义必须有 snapshot 测试，不能依赖全屏 UI 作为 Core 正确性边界。

---

## P2：系统代理、MITM 与外部兼容性

### 29. 异常退出和 ownership lost

- [ ] 强杀 / OS crash 会让系统代理暂时停在 8888，直到 startup journal recovery 或人工恢复；提供独立 repair 工具/启动项或更明显的系统级故障提示。
- [ ] 外部程序修改代理后会 ownership lost，Interceptor 按设计不覆盖；但用户可能同时失去原配置恢复能力，需要展示原/owned/current 三方差异和手工恢复指导。
- [ ] Close、Core fatal、Main crash、更新安装、系统关机各自覆盖真实恢复测试。

### 30. WinINet / SystemConfiguration 覆盖范围

- [ ] Windows 当前只接管 WinINet；自带网络栈、WinHTTP、Java、curl、容器、WSL 等可能不走 Capture。
- [ ] `<local>` bypass 会让 localhost、无点主机名等流量绕过系统代理；UI 应明确展示。
- [ ] macOS 多 network service、VPN 切换、睡眠唤醒和 service 增删期间的 ownership 需要真实 runner 验证。

### 31. HTTPS MITM 客户端兼容

- [ ] 证书 pinning、mTLS/client certificate、独立 trust store 的应用会拒绝 MITM；提供 per-host passthrough，而不仅是“忽略源站证书错误”。
- [ ] QUIC/HTTP3/UDP 不在当前 HTTP proxy 捕获范围；明确是否由系统/浏览器自动回退 H2，必要时提供显式诊断。
- [ ] Start/Stop decrypting 会重启 Mockttp listener，可能中断活动下载、WebSocket、SSE、gRPC；UI 应要求确认并展示影响。
- [ ] 已建立的旧 TLS tunnel 不会自动变成 MITM；必须重连，Capture 中应清楚区分旧 passthrough 与新 MITM。
- [ ] `ignoreHostHttpsErrors` 会关闭指定 origin 的证书校验；必须逐 host 明示风险并避免通配。

### 32. CA 与敏感数据安全

- [ ] Root CA 安装到 local-machine trust store 会影响本机全部用户/进程；安装/卸载提示必须明确范围。
- [ ] CA 私钥已用 safeStorage 加密且不进 Renderer；继续用 package/smoke 守住该边界。
- [ ] Capture headers/body 默认不脱敏，TemporaryBodyStore spill 为原始明文；Authorization、Cookie、PII、文件上传内容都可能落临时磁盘。
- [ ] exact URL Rule 可能把 token/signature/code 明文持久化到 `rules.sqlite`；见第 18 项。
- [ ] Native Archive 默认包含完整敏感数据且未加密；导出前需明确警告，可选加密另行设计。

---

## P2：UI / 交互准确性

### 33. Marker 与跳转失败反馈

- [ ] Rule marker 对应 Rule 已删除、未加载或 archive 中不存在时，显示明确只读历史提示；当前点击会静默无反应。
- [ ] 跳转过程中 loading / Core error 不能让用户误以为点击无效。
- [ ] Rule tag 应显示命中时 Rule name/revision；当前只显示 effect 类型。

### 34. Filter 状态与计数

- [ ] Rules → Capture 临时替换过滤时提供 Back/Restore previous filters。
- [ ] Rule filter 对历史已删除 Rule 显示稳定名称与 unavailable 状态。
- [ ] 当前 Capture 清空、Archive import、Core restart 后，筛选值/selection/scroll 应按明确规则恢复或清空。
- [ ] `visible of total`、Rules hits、状态栏 request count 必须分别说明是 Exchange、匹配请求还是 Action 次数。

### 35. 进行中与不完整正文提示

- [ ] pending/SSE/streaming row 展示已接收 bytes 和进行中状态；不能显示成完整正文。
- [ ] body persist failed、decode failed、preview limited、source aborted、user cancelled 要用不同状态。
- [ ] 复制/保存按钮必须说明操作对象是 preview、当前 Range、encoded body 还是 decoded body。

---

## 验收矩阵：必须补齐的真实 workflow

### 36. 透明转发与时序

- [x] 规则命中时的慢上传：origin 在第二块正文发出前收到 headers（已有自动回归）。
- [x] 规则命中时的下载：响应头先于源站正文结束到达客户端（已有自动回归）。
- [ ] request matcher 不命中、request-only、response-only、request+response 各自验证首字节、总时长、内存峰值和 wire bytes。
- [ ] 早期 401/413、100 Continue、chunked upload、客户端 abort、origin reset。
- [ ] SSE 首字节与持续事件、无限 chunked response、Range video cancel、H2 多 stream、WebSocket、gRPC unary/server-stream/bidi。

### 37. Capture 生命周期

- [x] initiated row 立即出现；bytes 增量更新；completed/abort 状态准确（已有自动回归）。
- [x] Clear 瞬间迟到事件被丢弃（已有自动回归）。
- [ ] Pause 前开始/后完成、Pause 中开始/Resume 后完成。
- [ ] Core restart、Renderer reload、event ACK 阻塞、10万+ rows、大量小 body、并发 spill、磁盘满。

### 38. Rules 行为

- [ ] 8 种 matcher × 11 种 Action 的 request/response phase 合法矩阵。
- [ ] invalid Rule 必须 validate/replace 双重拒绝；不能进入持久化或真实流量。
- [ ] priority、短路、header/body/status 冲突、hot update/in-flight revision、双实例 conflict。
- [ ] Breakpoint 有原始/编辑后的 body 证据。
- [ ] Rule hit request 去重、历史 revision、Archive restore、删除 Rule marker。

### 39. 文件与安全边界

- [ ] Body save：existing/locked/readonly/disk-full/cancel/clear/restart/crash，旧文件永不丢失、temp 可回收。
- [ ] HAR 超大正文流式导出、超大/恶意 HAR 导入、Archive ZIP64/zip bomb。
- [ ] PAC/static upstream proxy、认证代理、ownership lost、强杀恢复、系统关机恢复。
- [ ] Pinning、mTLS、QUIC/H3、独立 trust store、per-host passthrough。
- [ ] packaged API whitelist、Renderer 无 path/readFile/writeFile、私钥不出 Main/Core、artifact audit 继续通过。

---

## 建议实施顺序

已完成：

- [x] **Stage B / Capture state machine**：initiated + body-data 增量管线、早期响应合并、Pause/Resume/Clear generation。剩余 SSE/streaming 端到端验证归入 Stage F。
- [x] **Stage A 的转发透明性部分**：移除 CallbackMatcher body 等待，规则改到 headers 阶段执行，上传与下载全程流式。

进行中/待办：

1. [ ] **Stage A' / Stop-ship correctness 余项**：断点大正文预览上限与 binary text/hex 双模式。
2. [ ] **Stage C / Rule evidence**：按 Exchange 去重 hit、固定 RuleSet revision、历史 snapshot、冲突保留草稿、联动空态/错误反馈。
3. [ ] **Stage C' / 进行中状态展示**：Renderer 明示 pending / streaming 与已接收字节，区分 persist failed、decode failed、preview limited。
4. [ ] **Stage D / Body & files**：文本/二进制分级预览、charset、Range/encoded 语义、原子保存、Cancel/Clear lease、HAR 流式化。
5. [ ] **Stage E / Network compatibility**：upstream proxy/PAC chaining、异常恢复、per-host passthrough、pinning/mTLS/QUIC 诊断。
6. [ ] **Stage F / Capacity & release gates**：无界增长观测、SSE/大媒体内存峰值、真实 workflow、压力/故障注入、Windows/macOS packaged 发布门禁。
