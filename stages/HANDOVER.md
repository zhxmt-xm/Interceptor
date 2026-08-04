# Interceptor Handover

> 最后更新：2026-08-04
> 用途：只保留下一位开发者或下一 Session 继续工作所需的必要上下文。历史细节请按需读取 `archived/`。

## 新 Session / Agent 必读

开始任何实现前，按以下顺序阅读：

1. 本文件：确认工作树状态、已实现功能、剩余工作和精确恢复步骤。
2. **[ARCHITECTURE.md](ARCHITECTURE.md)：理解当前已经落地的进程边界、代码所有权、通信路径、安全策略和打包路径。未经阅读不要调整 Main、Preload、Core 或 Renderer 边界。**
3. **[../architecture/](../architecture/)：按 feature 组织的目标架构设计、service 调用流程与 Client/Origin 交互步骤。修改某个 feature 前先读对应的 `feature-*.md`。**
4. 只有需要历史索引时再读 [archived/PROGRESS.md](archived/PROGRESS.md) 与最新完成 Stage [archived/M14.md](archived/M14.md)。
5. 只有需要产品设计或早期决策时再读 [archived/桌面网络调试代理完整方案.md](archived/桌面网络调试代理完整方案.md)、[archived/M1.md](archived/M1.md) 或 [archived/M0.md](archived/M0.md)。

不要只根据聊天摘要开始工作；仓库文档和当前代码是权威来源。

## 当前状态

- **Proxy Core 模块结构已重构（2026-08-04）**：模块名与主类一一对应且不再有误读空间——`capture/` → `CaptureService`（当前 Recording 的易失 Exchange/Body，Clear 即丢，不用 SQLite）、`workspace/` → `WorkspaceService`（**App 全局公用 Store**，低频读写的全局与模块级配置，持久 `workspace.sqlite`）、`tls-probe/` → `TlsProbeService`（只做握手探测）、`rules/` → `RuleService`、`transfer/` → `TransferService`。原 `storage/`（名字暗示持久存储，实际是易失缓冲）与 `connection/`（名字暗示连接管理，实际只有一个 `probe`）已不存在。**每个模块目录只有 `entry.ts` + `README.md` + 子目录**，实现类进 `internal/`、显式类型进 `interfaces/index.ts`、无状态函数进 `utils/index.ts`、Error 集中在 `internal/errors.ts`；`internal/`、`host/`、`worker/`、`tests/` 里的文件名与类名**不再重复模块名**（`capture/internal/exchange-store.ts` 导出 `ExchangeStore`），只有去掉前缀会剩下 `Store`/`Host` 这类泛词时才保留限定词。12 个模块 README 已补齐。
- **镜像具体类的结构接口已全部删除**：`CaptureSink`、`CaptureEventSink`、`GrpcStorageReader`、`HarStorage`、`ArchiveStorage`、`BodyWriter` 六个接口的方法签名与某个具体类完全一致、生产实现只有一个，却让 go-to-definition 停在接口声明上。现在协作者直接依赖具体类（`CaptureService`、`CaptureEventQueue`），测试替身 `extends` 真实类并只 `override` 被断言的方法。`interface` 只保留给纯数据形状与真正有多实现的能力。
- **Composer 的 Collection 数据链路已通到 Preload，Main IPC 仍缺**：`core-protocol` 有 `collection.ts` 与 `collection.get` / `collection.replace`；`WorkspaceService.loadCollection` / `saveCollection` 与 RuleSet 同构（`collection_tree` 单行表 + 整棵树一个 JSON + 乐观 revision）；CoreApplication 路由、`desktop-api.ts`、`preload.ts`、`core-rpc-client.ts` 均已就位。**`apps/desktop/src/main/main.ts` 的两个 `ipcMain.handle` 还没写，所以 Renderer 现在调不通**。
- **Composer 设计稿已定稿，Renderer 未动**：`design/app/` 的 composer 视图重做为 Postman/Reqable 形态——左 `216px` **Collection 分栏**（可任意嵌套的命名目录树、chevron 折叠与名称选中分为两个命中区、选中目录即新建目标、`⋮` 菜单 Rename/New subfolder/New request/Delete、行内命名、可整体收起）+ splitter + 工作区（`40px` 文档标签条 · `56px` URL 行 · 请求编辑区 Query/Headers/Body/Auth · splitter · `368px` 响应区 Body/Headers/Cookies/Timing）。**编辑即生效**：tab 就是 Collection 条目，无保存动作、无未保存标记、无 Save 按钮。Body 四档 `None / JSON / Text / Form` 均已出图（Form 是第三张 KV 表，由 Renderer 编码成字符串，**协议不变**；`multipart/form-data` 不在本轮）。被删掉的控件及理由：Bulk edit（无配套文本模式界面）、Save body（Composer 场景是调 API 看 JSON，且无大正文/媒体策略）、Save（改为编辑即生效）。
- **正文查看器取消了 `320px` 最低高度**：`[data-monaco="fill"]` 改为 `flex:1 1 0 + min-height:0` 纯粹吃掉面板剩余高度，面板变矮时编辑器跟着变矮，不再撑破容器或触发外层滚动；同时删掉了 `.jsonv.mono` 的 `border-top`（旧布局遗留）。**这两改动影响了 Capture Inspector 的正文区**，相关 shots 已重出。
- **设计稿里查出两个全局 CSS 污染**（实现到 React 后因 CSS Modules 而天然消失，但设计稿是全局 CSS，**新增类名前必须 grep 是否撞名**）：`.app.shell-v2 .tabs { margin-top: 6px }`（Capture Inspector 专用）漏给了 composer，已收窄为 `.app.shell-v2 .insp .tabs`；全局 `.rmeta { display:flex; flex-direction:column; flex:1 }`（Rules 列表用）与 composer 响应指标撞名，已改名为 `.rmetric`。
- **新增一条对齐规范**（`design/design-system.md` 「交互状态」节）：同一行内混排文字不要用 `align-items:center`（它对齐盒子中心，字体/字号不同基线就会错开），要么统一字体字号后用 center，要么用 `baseline` 并给圆点/图标单独 `align-self:center`；另注意 **flex 容器的基线取自第一个 flex item**，首个 item 是无文字圆点时基线会退化为圆点底边。
- **Capture 筛选分栏已落地到 React，设计稿与实现一致**：`design/app/` 与 Renderer 同为该形态。侧栏默认收起；54px Capture 工作栏整体撤销，Recording / Clear / Import / Export / 搜索全部进列表上方 `44px` 工具栏 `CaptureListbar`（grid `1fr auto 1fr` 三列，两侧等分把搜索块钉在几何中心，Recording 文案长度变化不再让搜索框位移）；文本搜索与全部结构化筛选进入 list 左侧可收起筛选分栏 `CaptureFilterPanel`（默认 200px，可拖 160–360px）；facet 顺序严格跟随 list 表头 `Application / Method / Host / Status / Protocol / Content type / Rule`，直接点击即生效（组内 OR、组间 AND），分组展开/收起**纯手动**，不因有选中值强制展开；分组头 hover 出现 × 清空该组，工具栏漏斗-× 清空全部 facet 但**保留搜索词**（搜索与 facet 是两个独立维度，`hasActiveFilter` 只看 facet）；facet 选项列表按 600ms 节流快照重算，避免实时流量下排序抖动；list 列改为 **path 主行 + host 次行**（CONNECT tunnel 无 path，保持 host 主行）；Inspector 默认关闭且顶部留 10px。已删除的旧形态与代码：`Omnibox/`、`CaptureWorkbar/` 两个目录、Add filter 级联弹层、list 上方 `All/H1/H2/WS` Segmented、`protocolSegment`/`matchesSegment`/`distinct*Options` 等工具函数、`addFilter`/`filterRemove`/`protocol*` automation ID。
- **Capture 底栏语义已重定义**：`CaptureStatusbar` 三槽 grid——左 `● host:port` + System proxy on/off，中为解密态（绿锁 `HTTPS decrypting`）或未解密（黄划线锁 `HTTPS passthrough` + accent `Click to enable MITM`），右槽预留给上游代理。**右槽当前恒空**：`SystemProxyStatus` 不含 Interceptor 实际使用的上游，要显示需先扩 Preload 契约。划线锁 Lucide 没有，`CaptureStatusbar.tsx` 内联了一个自绘 `LockOffIcon`。
- **列在窄宽度下先收缩再隐藏**：`RequestList`/`RequestRow` 用 container query 分三档——600px 起把 gap 12→8、padding 18→12、Method/Status/Size/Time 列一并收窄（全列可见下限因此降到 512px，即 `CaptureMain` 的 `MIN_LIST_WIDTH`）；只有 470px / 380px 以下才依次隐藏 Proto+Type、Size+Time。两个文件的列定义必须同步修改。CSS Module 内跨模块选择器无效，行与表头各自声明自己的 container query。
- **共享 `Tabs` 放不下时收进 `…` 菜单**：不换行（面板头高度会浮动）也不横向滚动（看不出还有多少 tab）。实现是一层 `visibility:hidden` 的全量副本用于测量自然宽度，配 `ResizeObserver` 算出可见数量，溢出项进 `Flyout`；选中项被收起时 `…` 显示激活态。
- **Exchange detail 跟随 summary 引用刷新**：`useExchangeDetail` 订阅该行 summary 的**对象引用**（而非挑字段比较），配 300ms 节流重拉，重拉期间保留已有详情不闪回加载态；此前 pending → completed 后详情会停在 pending 快照。
- **`feature-mcp.md` 的工具层已落地为独立 package，但未接入 Main/Core**：`packages/mcp-server/` 实现了认证（per-client token，仅存内存）、完整工具层（11 个只读 + 7 个写工具，全部映射到既有 Core command）与 MCP 协议状态机（`initialize` / `ping` / `tools/list` / `tools/call`，协议修订版 `2025-06-18`，兼容 `2025-03-26` 与 `2024-11-05`）。**零运行时依赖**（只用 `node:crypto`），不引用 Electron，因此可脱离整个 app 单测（45 tests）。宿主通过 `McpHostBridge` 注入三件事：`invoke`（下沉 Core，宿主持有 `CoreRpcClient`）、`requestApproval`（弹审批 UI，宿主负责超时与窗口聚焦）、`record`（写 Diagnostics）。**尚未接线的部分**：Main 侧 transport（named pipe / unix socket）、runtime 文件、`bridge.mjs`、Preload 窄 API、Settings 面板与审批弹层。关键安全不变量已由单测锁定：写工具未获确认时不产生任何 Core command、审批超时按拒绝、审批携带完整参数而非摘要、`apply_rules` 强制 `enabled:false` 且 revision 冲突即拒、凭据头与 query 默认遮罩、音视频零读取、`tls.configure`/`proxy.start`/`proxy.stop`/全部 import-export 不可见。`packages/core-protocol` 零改动这一设计验证点已由实现证实。
- **架构设计文档已建立**：根目录 `architecture/` 按 feature 记录目标架构、service 调用流程与 Client/Origin 交互，包含 `feature-capture` / `feature-rules` / `feature-breakpoints` / `feature-composer` / `feature-transfer` / `feature-diagnostics` / `feature-settings` / `feature-mcp` 八篇与一份 `README.md` 索引。文档用 `[已实现]` / `[改造中]` / `[阶段一]` / `[阶段二]` / `[待定]` 标记区分现状与目标。
- **`feature-mcp.md` 为对外 AI Host 暴露 MCP 工具的目标方案**，阶段一 stdio + bridge、阶段二 Streamable HTTP 分章独立。关键结论：监听端必须在 Main（Core 不得对外监听）；`packages/core-protocol` 零改动，MCP 只复用既有 command；写工具强制用户审批；`RunAsNode` fuse 已锁死，bridge 阶段一依赖用户机器上的 `node`。实现前先读该文档。
- **Capture 已显示发起请求的客户端应用（仅 Windows）**：列表首列显示系统图标，Inspector General 增加 `Client Application` 行。归属与图标由单一原生 helper `apps/desktop/src/main/client-app/windows-helper.cs` 提供（`GetExtendedTcpTable` 端口→PID、父进程链上溯、`IShellItemImageFactory` 取图标）。“已安装应用”是一张**安装目录索引**，四个来源合起来正好覆盖“设置 → 应用 → 安装的应用”：MSIX 包登记表的 `PackageRootFolder`、卸载登记表中 `SystemComponent != 1` 的 `InstallLocation`/`DisplayIcon`、`App Paths`、开始菜单快捷方式目标。判定一律按**可执行文件路径**，**不能按 AUMID**——MSIX 宿主（Teams、Outlook、Windows App、Widgets）派生的 `msedgewebview2.exe` 会继承宿主包身份，按 AUMID 判会让上溯停在 WebView2 上，UI 里就会看到一片“Microsoft Edge WebView2”。索引覆盖不到的安装方式（MSI 常不登记安装目录，如 GlobalProtect）由“停在最后一个可信祖先”兜底。上溯**不设层数上限**，改用**父进程创建时间不得晚于子进程**来排除 PID 复用造成的假父子关系与环（层数拦不住认错，反而会截断 `Microsoft.CodeAnalysis.LanguageServer → Visual Studio Code` 这类真实长链）。**没有硬编码进程名，也不比较发布者**（宿主常用别家运行时，实测 GlobalProtect 用微软的 WebView2）；系统目录下只有 MSIX 包才算应用，否则 `System32` 会整个变成应用目录。显示名按 **主程序登记名 → 目录登记名 → exe 的 `FileDescription` → 文件名** 依次取（登记名里 `@{...}` 形式经 `SHLoadIndirectString` 解析）。登记名优先于 `FileDescription`，因为这一列的语义是“哪个应用发出的请求”，而 `FileDescription` 描述的是组件（`Microsoft OneDrive Sync Service`、`LGHUB Agent`）；主程序又必须优先于目录，否则 Office 套件在卸载表里只有一个条目，Word/OneNote 会一律叫成套件名。**不按 `ProductName` 校验目录登记名**——试过，7 个受影响进程里只修好 `node.exe`（落在 nvm 的登记目录下），却误伤了 `OpenConsole.exe`（VS Code 自带的 conpty 宿主）与 `lghub_agent.exe`，为修一个错两个。图标必须走 Shell 层：`app.getFileIcon`/`SHGetFileInfo` 对 MSIX/UWP（Teams、Outlook）只能拿到通用图标，因为其 exe 是 stub。**归属结果的 `path` 会被换成应用的代表标识**（卸载表 `DisplayIcon` 指向的主程序，或包只有一个应用时的 `shell:AppsFolder\<AUMID>`），让名称、图标、`appId` 三者同源；否则 OneDrive 的 `FileCoAuth.exe`、Outlook 的 `olkexthost.exe` 这类无图标资源的后台组件会拿到通用图标并在 UI 里裂成独立条目。代表标识只能来自权威来源：App Paths 与开始菜单快捷方式只代表单个入口，拿它们代表目录会把 OneNote 显示成 Excel（Office16 下多入口共存）。helper 以普通用户权限运行，对 SYSTEM 服务进程 `OpenProcess` 会被拒（实测 89 个 svchost 里 80 个打不开），此时退到 `CreateToolhelp32Snapshot` 的 `ExeFile` 取得进程名，路径为空、无图标；Renderer 靠 `clientAppIcons` map 的“无该键 / 值为 null / 值为字符串”天然区分出加载中 / 未知 / 已取到三态。`execFile` 的 spawn 是同步系统调用，因此 `beginRequest` 只做同步快照命中，未命中时经 `setImmediate` 排出捕获栈再解析，`exchange-added` 绝不被子进程创建推迟（已有回归用例用“永不返回的 helper”锁住）；端口快照 15 秒过期防复用错认。协议上 `processName` 已改名为 `appId`/`appName`，完整身份（含 path）随 `event-batch` 的 `clientApps` 只到 Main，Main 经 `client-app:icons` 单向推图标，Renderer 无拉取 API 也拿不到路径。helper 另有 `--resolve <pid>` 与 `--apps` 两个诊断模式可直接核对归属与索引。详见 [ARCHITECTURE.md](ARCHITECTURE.md) 与 [../architecture/feature-capture.md](../architecture/feature-capture.md) 第 8 节。
- **Capture 增量管线已落地（阶段一）**：Exchange 在 `request-initiated` 即创建并推送（`state='pending'`），不再等 completed 事件配对。已**退订** completed 的 `request`/`response`，因为 Mockttp 检测到这两个 listener 就会 `waitForCompletedRequest` / `body.asBuffer()` 无条件缓冲完整正文。新增 `ExchangeTracker`（`proxy/proxy-exchange-tracker.ts`）按 request id 幂等 upsert，新增 `TemporaryBodyWriter`（`storage/storage-temporary-body-writer.ts`）按累计字节 spill 并在待落盘超限时降级为只计数。WebSocket 101 改由 `websocket-accepted` 驱动。
- **规则安全边界改为“不完整就不生效”**：未填写的条件值与空条件集在 matcher 编译器里恒不匹配（此前 `contains ''` 的 `includes('')` 与 `regex ''` 都恒真，刚新建、还没输入 host 的规则会改写全部真实流量）；只能在响应阶段判定的规则在请求阶段仍保守放行。Renderer 直接限制操作：字段未填完的规则不允许启用，新建规则与 Capture 草稿默认 `enabled:false`，未填写项由本地纯函数 `ruleIssues` 即时派生。**Core 信任 Main/Renderer 传递的数据，不做规则语义校验**；固定返回 valid 的假 `rules.validate` 命令已从协议/Main/Preload/Renderer 整条链路删除。
- **Throttle 已移除**：真实代理实测 8 KiB/s 规则下载 128 KiB 只用 17 ms（真限速需 ≥16 s），但 UI 会显示命中。限速必须介入正文流，而规则全在头部阶段执行，需再扩 patch 约 60 行（含 override 分支流式化与 resolve 时序改造）；浏览器 DevTools 自带限速，因此从协议、引擎、UI、automation ID、15 种语言和 `design/app` 一并删除；delay 仍在用的黄色调名改为 `flow`。
- **断点正文可见性已如实标注**：HTTP 断点在头部阶段挂起，快照新增 `bodyAvailable`（HTTP=false、WebSocket 消息=true）。修复了一个真实数据破坏：`buildEdit` 原本无条件发送 `body:''`，在断点面板只改一个 header 就点 Continue 会把真实上传/响应正文抹成空；现在正文不可见且用户未输入时不再带 `body`，UI 与 `design/app` 改为“Replace body / 原文尚未到达 / 留空则原样转发”。
- **上游连接失败改为镜像真实网络故障**：passthrough 固定 `simulateConnectionErrors: true`。此前 Mockttp 默认把 DNS/TCP/TLS 级上游失败转成伪造的 502（正文是 `AggregateError` 之类的错误文本），并用 `console.error` 打印整个错误对象——AggregateError 的 `message` 为空，所以整段 `ETIMEDOUT` 堆栈都会经 `[proxy-core]` 刷屏。现在客户端直接收到连接 reset/close，与不挂代理时一致；Mockttp 走 `AbortError` 分支不再打印；Exchange 记为 `aborted` 并保留真实 `errorCode`，`exchange.aborted` 诊断也带上 `errorCode`。
- **Mockttp trailer patch 已引入**：`patches/mockttp+4.5.0.patch`（约 390 行）给 Mockttp 增加 `request-trailers` / `response-trailers` 事件与 `beforeRequestHead` / `beforeResponseHead` 钩子。退订 completed 事件后 trailer 本会丢失，而 gRPC 的 `grpc-status` 正是 response trailer。已加 `patch-package` 与根 `postinstall`；`ship-core-deps.mjs` 从 `node_modules` 拷贝，已验证 patch 后代码进入 `dist/proxy-core/node_modules`。**升级 Mockttp 时 patch 若不适用会直接报错，必须人工 review。**
- **Rule 流式执行已落地（阶段二）**：Proxy 只注册单一 `forAnyRequest().thenPassThrough({ beforeRequestHead, beforeResponseHead })`。已删除四档 `.matching(callback)` 预筛选（CallbackMatcher 会 `waitForCompletedRequest`，阻塞所有上传）与 `beforeRequest`/`beforeResponse`（分别等完整请求与 `streamToBuffer` 完整响应）。所有 matcher 与 action 在头部阶段完成，因此**响应侧 matcher、`header append`、response `delay` 均无需降级缓冲**，正文全程流式。patch 同时支持不等原文的整体 body 替换。回归测试已覆盖：规则命中时慢上传的请求头仍先到达源站，以及响应头先于源站正文结束到达客户端。
- **M0–M14 已完成**；生产实签/公证和真实macOS runner证据因外部凭据/平台缺失待首个tag发布时补齐。
- **上游代理链式转发已落地（P0 #7，仅 Windows）**：接管系统代理前读到的用户配置经 `system-proxy-upstream.ts` 转成 `UpstreamProxyConfig`（PAC → `pac+<url>`、显式代理 → `http://host:port`、仅 socks → `socks5://`，`bypassList` → curl 风格 `noProxy`，`<local>` 展开为回环地址），经新增的 `proxy.setUpstream` 命令下发 Core，交给 Mockttp `thenPassThrough({ proxyConfig })`。**Mockttp 4.5.0 原生支持上游代理**（`http/https/socks/pac-proxy-agent` 依赖齐备），无需自己实现 PAC 求值。三条关键约束：`proxyConfig` 用回调而非固定值，切换上游不重启监听器；上游存在 Core 进程内，`onCoreProcessReady` 必须与 TLS 材料一同重新下发，否则 Core 重启即断网；接管前读到的地址若就是自己的监听地址（崩溃残留）则视为无上游，避免自环。Mockttp 经上游时统一走 CONNECT 隧道，即使目标是明文 HTTP。macOS 尚未接入（多网络服务需先定义合并语义），Settings 也尚未展示当前上游。详见 [../architecture/feature-settings.md](../architecture/feature-settings.md) 第 3.4 节。
- **Local E2E 基础设施已建立，workflow 实现已重置**：`apps/desktop/tests/e2e-workflow-tests/` 现有 production bundle builder、Playwright `_electron.launch()` driver、独立 profile/trace/evidence/destroy fixture、loopback lab、60 条完整验收规格和公共 automation ID contract；`workflows/` 当前为空，Inventory 无 `implemented` 条目，不能把基础设施构建成功表述为 feature workflow 已通过。
- **M14 临时 Capture 架构已完成**：Core 直接拥有内存 Capture + 内存/spill Body；Diagnostics Worker 保留；native archive 使用一次性 Archive Worker。常驻 Storage Worker、运行时 `capture.sqlite` 和持久 blobs 已删除。
- **Proxy Core 模块结构已重构**（本轮）：`storage/` → `capture/`（`CaptureService`，只管当前 Recording 的易失数据），`connection/` → `tls-probe/`（`TlsProbeService`）；新增 `workspace/`（`WorkspaceService`，App 全局公用 Store，持久 `workspace.sqlite` 的 `rule_set` 与 `collection_tree`）。每个模块目录只留 `entry.ts` + `README.md` + 子目录，实现类入 `internal/` 且不再带模块名前缀；entry 主类统一 `<模块名>Service`。镜像具体类的结构接口（`CaptureSink`、`CaptureEventSink`、`GrpcStorageReader`、`HarStorage`、`ArchiveStorage`、`BodyWriter`）全部删除，协作者直接依赖具体类，测试替身改为 `extends` 真实类。
- **Transfer 简化边界**：import/export 到达 Core 后直接读取当前 Store；全屏 Loading 阻止正常 UI 操作并只保留 Cancel。无 Body lease/generation/barrier，无 Core action 门禁。
- **Stop 语义**：Stop 只暂停记录（`proxy.setRecording{false}`）——Mockttp/WebSocket listener 与系统代理保持运行、流量继续转发、已有记录保留，暂停期间新连接不落库；Start 恢复 `recording=true` 并继续追加；系统代理只在应用退出与紧急修复时恢复；Clear 才删除记录和 spill；Core 重启释放临时数据。
- **Capture 后续增强已完成**：默认进入 Capture 后等待 Core 并启动 8888 loopback Recording；系统代理由 readiness 弹层要求用户显式 Enable。HTTPS 默认 passthrough，只记录有限 Tunnel metadata，用户从 Tunnel 面板显式执行 CA/Trust/Start decrypting。first-run 代码与设计资产已删除。
- **Core 已合并系统根证书**：`proxy-core/core-ca-certificates.ts` 在 `initializeRuntime()` 后把 `bundled + system + extra` 三份根证书合并后 `tls.setDefaultCACertificates()`。MITM 开启后是 Core 自己校验源站证书，而 Node 默认只信内置 bundle，企业根 CA（实测：系统库 106 张里有、bundled 120 张里没）不在其中，内网服务会整片 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`。**不能用 `--use-system-ca`**：那是替换而非合并，会丢掉 bundled 里有、系统库没有的公开 CA。证书去重比较用 `fingerprint256`，PEM 文本比较会因格式规范化产生假阴性。
- **Proxy readiness 已改为显式授权**：自动 Capture bootstrap、手动 Start 与 Core 重启均先启动 listener，再检查系统代理；未 ready 时 UI 必须是 Paused / `System proxy off` 并弹 `Proxy not ready`，只有用户点击 Enable 且 listener+routing ready 后才显示 Recording，或进入 Settings → Proxy & Listener。错误文本完整保留，不循环静默写系统设置。
- **自有窗口 Chrome**：跨平台 `frame:false`，自有顶栏可拖拽并提供 Minimize / Maximize-or-restore / Close；Close 走窄 IPC → `app.quit()`，继续执行系统代理恢复与 Core shutdown。
- **Header V2 已一对一落地并成为唯一设计**：`design/app` 与 React Renderer 只使用 Shell V2；旧 `layout=current` / `data-layout` 分支、六组 feature `.tv` 顶栏和 Layout 切换器已删除。保留全高侧栏，右侧依次为 46px Window Header、feature 内容工作栏、主体和 30px 状态栏。Capture 使用 54px `CaptureWorkbar`，内容命令行统一 40px、图标按钮统一 30×30px/15px icon/3px gap；Detail 全白且 Request 摘要为 40px 白色均匀阴影 box；所有 workspace 共用 1px splitter + 4×40px 共轴 grip。Window Header 只保留折叠按钮、feature 名称和窗口控制，业务命令与状态分别进入内容工具栏和底栏。
- **Renderer 壳与编辑交互已简化**：`App.tsx` 直接拥有 Sidebar/Header/Main/Footer Grid，原 `AppShell` 转发层已删除；Diagnostics 仍只在当前视图通过条件 `DiagnosticsProvider` 挂载。Capture Omnibox 支持 Method/Status/Rule 级联多选（Rule 多选为 OR），并配 Clear 清空与无数据禁用；Detail 改为点击行展开/收起、摘要 box 外提供 Close。Rules 可创建全部八种 matcher，并通过 More 菜单或 grip 拖放调整真实执行优先级；host/path/url/query/header 的值匹配使用 `Aa`/`ab`/`.*` 三个开关（区分大小写／精确／正则，默认 contains）。Apply 对草稿与已应用快照做内容深度比较。共享 `Select` 使用 Ant Design；Add action 菜单按 改写/映射/流控/中断 分组，map-local/map-remote/synthetic/block 四者互斥。
- **Capture / Rules 双向联动已完成**：Capture 请求行右键按 11 种 Action type 创建当前完整 URL 的 exact matcher 草稿，只打开 Rules、不自动 Apply；Rules editor 漏斗按钮清空旧 Capture 条件并过滤当前 Rule 的命中请求；Inspector Rule marker 可点击选择仍存在的 Rule detail。Core summary/detail 保存实际命中的唯一 `ruleIds`，Header effect 保存具体 `ruleId`，Native Archive 保真 round-trip。
- **Capture Body 展示/保存边界已收紧**：Core 继续完整保存 Body（小正文内存、大正文 spill），HAR/Native Archive 不截断；Renderer 文本/结构化 BodyView、WebSocket 行预览和 WS/gRPC Copy 最多读取前 `5 MiB`；正文查看器为只读 Monaco，吃掉面板剩余高度且不低于 `320px`（WS/gRPC 内联消息按内容贴合）。gzip/br 超限返回有限明文前缀，不再把压缩字节显示成 HTML 乱码。`video/*`/`audio/*` 零读取、零 Hex 预览，只能经 Main Save Dialog + `body.export.start` 从 Core 流式原子保存；Renderer 不拿绝对路径或完整字节。BYD 的 `67 MB MP4` 是真实 `206 video/mp4` 媒体请求。
- **Modal 以设计稿为准**：HAR/Archive、HTTPS Setup、Proxy readiness 保持设计内容宽度 `512/560/500px`；Ant v6 只作为交互底座，通过官方 `styles.container/body` 清除默认 content padding、应用设计边框和 `1.23` 行高，不允许反向缩窄设计稿迁就 Ant 默认值。三类 Modal 已移除弃用的 `maskClosable`，改用 `mask.closable`。
- **Renderer 轻重分层**：App 常驻 Zustand 保存当前 Core 全量轻量 summary 和视图状态；完整 header/body/WS/gRPC payload 留在 Core 按需读取。
- **规则 Header 效果可观测**：RuleService 按执行顺序记录 request/response header 的 `set/append/replace/remove + ruleId`；Capture Inspector 显示生效值与被替代/删除旧值，分别使用绿/蓝/黄/红 marker，失效值加删除线，marker 可直达 Rule。Request marker 表示代理发往上游的值，Response marker 对应浏览器实际收到的最终响应；HAR 只导出最终 wire headers，Native Archive 保真保存 marker 与规则身份。
- **15 种界面语言已完成**：默认英语；`en/zh-CN/zh-TW/ja/ko/de/fr/es/it/pt-BR/ru/nl/pl/tr/uk` 每种均有完整catalog，切换即时生效并持久化。Ant Design locale、`html lang`、`Intl`格式和Main原生文件对话框同步切换；俄/波/乌CLDR多复数已覆盖。
- **M13 GitHub Releases更新已完成**：`GitHubReleaseUpdateService`只访问固定公开仓库，packaged Windows/macOS启动及每小时检查latest stable Release；Release body作为app内纯文本changelog。用户显式点击后才流式下载当前平台的MSI/DMG，完整后通过`Open installer`交给系统；不自建服务、不做Squirrel、资源热更新、静默下载或自动安装。
- **M13下载安全边界**：Main校验SemVer、draft/prerelease、仓库URL/tag/asset basename、平台扩展名、显式架构、声明size和GitHub SHA-256；不设metadata/changelog/installer大小上限。Renderer永远拿不到URL/path。
- **M13 UI/Contract**：Preload仅新增`getUpdateStatus/checkForUpdates/downloadUpdate/openDownloadedUpdate/onUpdateStatusChange`；Settings与顶部通知覆盖checking/available/downloading/downloaded/up-to-date/failed/unsupported七态，changelog不执行远程markup。
- **M12 发布加固已完成**：Desktop 0.1.0；Windows x64 per-user MSI完整lifecycle已实测；macOS ad-hoc/Developer ID/notarize与DMG+ZIP配置/原生smoke已落地；固定SHA release workflow在tag构建后发布MSI/DMG/ZIP并生成GitHub changelog。
- **Package 安全已收紧**：Renderer 使用固定 `interceptor://app`；file extra privileges 关闭；Electron 43 九项 Fuse strict 锁定；Main/Preload/Core release 0 maps；artifact audit 拒绝 source/env/test 泄漏并校验签名策略。
- **M11 系统代理与恢复已完成**：Windows WinINet 和 macOS SystemConfiguration helper、多服务/多字段精确 ownership、原子 startup journal、启动/Core failure guarded restore、Proxy Settings 与 emergency repair 均已落地。后续已删除 first-run，改由 Capture bootstrap 启动 Recording/接管代理；四项 Renderer API 仍是窄意图，不暴露 helper 路径或 snapshot。
- **M10/T10.5 三进程诊断已完成**：Core/Main/Renderer 记录经同一 Diagnostics Worker 持久化；内存、待写队列和SQLite不按数量/字节/时长淘汰，Core断开期间Main保留并在恢复后续传；查询/UI/JSONL支持process来源并统一脱敏。
  - **Diagnostics 分析/导出（T10.4）**：`diagnostics.query` 支持 trace/command/level/outcome/duration keyset 分页；Renderer `DiagnosticsProvider` 走持久化分页并可加载更旧记录；`diagnostics.export.start` 经共享 transfer job + Main Save Dialog 原子导出 JSONL。入库和导出前双层脱敏，敏感 attributes 与 URL Query 不落盘。
  - **原生 archive（M14 当前实现）**：`ArchiveService` 导出固定格式 ZIP；按批次读写snapshot但不设文件、entry、解压总量或压缩比上限，保留格式、路径、CRC、size、hash与SQLite完整性检查。Archive、Rules、Diagnostics 直接创建当前 SQLite 表结构，无 schema version、migration runner 或旧数据搬运路径；不兼容旧 Archive schema，也不支持ZIP64。
  - **HAR Core**：`HarService` 完成标准 HAR 1.2 导入导出；不限制文件、entries、headers、URL或body大小/数量，只保留HAR结构、base64和可映射网络scheme检查，不执行脚本、插件或远程内容。
  - **异步 transfer job**：`har.export.start`/`har.import.start`/`transfer.job.get/cancel`；公开快照只含 basename/进度/状态/警告。Main 用系统 save/open dialog 持有真实路径，Renderer 没有文件系统 API。
  - **Capture 文件 UI**：顶栏删除无行为 Info/Settings/More，改为 Import/Export 菜单：`Import HAR` / `Export HAR` 用于跨工具交换，`Open Capture` / `Save Capture` 用于 Interceptor 全保真恢复。四种命令各自进入单一动作弹层；HAR Export 保留 all/filter/selected、Authorization/Cookie 遮罩与 strip bodies。15 种语言已同步；Export 菜单 parity 0 missing/flagged、几何差 0 px。
  - **Core 目录规范化**：业务根所有者直接位于 `entry.ts`；类型进 `interfaces/index.ts`、纯函数进 `utils/index.ts`，一文件一个 class。真实 worker bundles 现为按需 `archive/worker/entry.cjs` 与持续 `diagnostics/worker/entry.cjs`；Storage 无 host/worker 子目录。
  - **T9.1 WebSocket 捕获**：Mockttp HTTP/1.1 Upgrade，text/binary Message 按 direction/opcode/time/payloadRef 有序落 `websocket_frame`，payload 复用 Blob；101 后 Exchange 保持 open，clean close 更新 completed。
  - **T9.2 WebSocket UI/断点**：`WebSocketBridge` 接管双向消息转发并在 send 前 await BreakpointQueue，支持 edit/continue/drop；`websocket.frames` keyset 页 + Body range；Capture Messages 虚拟列表和 Breakpoints text/hex 编辑。仅 H1 Upgrade，H2 Extended CONNECT 未实现。
  - **T9.3 gRPC 基础展示**：原生 gRPC 作为 Mockttp 通用 H2 request/response 捕获；`grpc.messages` 从既有 Blob 每条只读 5B header 跳读分页，UI 显示 request/response、compressed/truncated/malformed、offset、grpc-status trailer 和 raw text/hex。无 descriptor/reflection；完成后扫描，非实时 streaming。
  - **测试架构**：Desktop tests 现在分为三层：`tests/e2e-workflow-tests/`（local production `_electron.launch()`，基础设施已完成但 workflow 为0）、`tests/packaged-smoke/`（真实 exe/CDP 的现有综合 smoke，尚未复用 workflow contract）与 `tests/visual-parity/`（测试目录内完整 fake Preload + 正常 UI 交互）。业务 Renderer 无 parity fixture/DEV setter；local 与 packaged 的目标 workflow 都禁止直接调用 `window.interceptor` 完成业务 arrange/act。
- **M6 HTTP/2 已交付并修复大媒体缓冲**：MITM 保持 Mockttp `http2:true`。Proxy 对 Rule request/response action 做实时预筛选，分别挂载 request+response / response-only / request-only hook；无候选的上传与下载走无 callback 的流式 passthrough，不再触发 Mockttp 4.5 的 `waitForCompletedRequest` / `streamToBuffer`。该修复消除了 BYD 67 MB Range 视频取消后 `ERR_HTTP2_PROTOCOL_ERROR` 污染后续刷新，同时保留浏览器 H2 与 H2-only/gRPC。`proxy/utils/index.ts` 提供 gzip/deflate/brotli 流式有限预览解码。**已知限制**：实际需要 request/response action 的大正文仍必须由 Mockttp 缓冲；streamId/GOAWAY/RST/settings/背压未暴露。
- **M5 CA 与 HTTPS MITM 已交付**：Main 用 `@peculiar/x509` 生成 RSA/SHA-256 Root CA、Electron `safeStorage`（DPAPI/Keychain）加密私钥存 `<userData>/certificates/`（**证书库懒加载**避免阻塞 Main/CDP 启动）；`TrustStoreService` 做 **local-machine 信任库**安装/卸载/检测（`@vscode/sudo-prompt` 提权 certutil/security）；CA 经内部 `tls.configure` 单向下发 Core，Core 用 Mockttp `getLocal({https})` 对 CONNECT 做 MITM（**仅信任且 `mitmEnabled` 开启时启用**，信任与 MITM 解耦）解密 HTTPS 复用现有捕获管线；per-host 不安全例外（`ignoreHostHttpsErrors`）；Settings/Certificates 面板接真实数据（含 reveal/view/系统证书管理器/delete 入口）。**私钥绝不进 Renderer/日志/导出。** 详见 [archived/M5.md](archived/M5.md) 后续增强。
- **M3 最小显式代理已交付**：`ProxyService` 基于Mockttp loopback显式代理；实时事件经无淘汰合并队列+窗口背压推送。正文无单体/总量配额，超过1MiB自动spill。
- **M4 会话列表 UI 已交付**：Capture 工作区数据驱动——TanStack Virtual 虚拟化列表 + Zustand 轻量 summary 状态、当前 Session 过滤、实时前插滚动补偿、feature 往返状态保持；按需 `sessions.detail` + `body.read-range` 驱动 Inspector（完整 cookies、真实 Timing、Auto/Text/JSON/Hex）。body/header 不入全局状态。
- **窄 API 已扩展**：M10新增HAR/archive/Diagnostics；M11新增系统代理意图；M13新增GitHub Release状态/检查/下载/打开已下载文件。Preload仍不暴露通用日志、helper、snapshot、URL、path/readFile/writeFile，packaged smoke apiKeys已同步。
- **Mockttp/ws 打包方案已落地并验证**：esbuild `--external:mockttp --external:ws` + `scripts/ship-core-deps.mjs` 随包发布依赖闭包；`ws` 内联会阻塞首代 UtilityProcess entry，external 后最终 package 首代 Core 正常 ready/heartbeat。
- **M13验证全绿**：286 unit tests；全typecheck；package audit；真实packaged smoke；正式MSI；两版x64 MSI lifecycle；生产audit 0；actionlint；Updates 14个parity场景0 missing。完整数字见 [archived/M13.md](archived/M13.md)。
- **多语言增强验证全绿**：293 unit tests；三 workspace typecheck；Windows package audit 1,292 files / 377,348,054 bytes；真实 packaged smoke 逐项验证 15 种语言、持久化、侧栏译文、页面无溢出与 Main language IPC 非法值拒绝；生产 audit 0。
- **Capture 后续增强验证全绿**：311 unit tests；三 workspace typecheck；Windows package；真实 packaged smoke 1/1（活动 Recording Clear 后保留 Session 壳、Exchange/Body 归零）；生产 audit 0。Payload/Cookies/Timing/Tunnel/topbar 目标场景已完成浏览器与视觉检查。
- Git：`main` 在既有 M14/Shell V2/packaged smoke 基线上新增 local E2E 基础设施、公共 automation ID contract、Shell/Capture 初始接线、local production `interceptor://app` 启动路径、60 条 planned workflow 规格、上游代理链式转发，以及本轮的 Capture 筛选分栏设计稿。本轮提交并 push 后应与 `origin/main` 对齐且工作树干净；不要提交 `.vite/`、package、Playwright report 或 `test-results/` 产物。新 Session 先跑 `git status --short --branch` 与 `git log -4 --oneline` 确认实际状态。
- 当前工作目录：`H:\code\Interceptor`；默认分支：`main`。若 `tsc` 报找不到 `@interceptor/core-protocol`，先跑 `npm install` 重建 workspace junction。
- 当前已验证 Windows x64 package/MSI。macOS 配置和 smoke 已实现，但 Swift helper、DMG/ZIP、Gatekeeper/staple 尚未在真实 macOS runner 执行；生产签名凭据不在仓库。
- **跑 packaged smoke 前必须先退出本机的开发实例**：两者都竞争 8888 端口与系统代理，smoke 实例会拿到 `listening:false` / `owned:false` 而卡在 readiness。若开发实例是被强杀的，系统代理会残留指向已停止的 `127.0.0.1:8888`（整机断网），需手动把 `HKCU:\...\Internet Settings` 的 `ProxyEnable` 置 0、删掉 `ProxyServer` 并调 `InternetSetOption(39/37)` 通知 WinINet。

## M0、M1 与 M2 已交付

- npm workspaces、严格 TypeScript、Forge/Vite Main/Preload/Renderer 三入口。
- 安全 BrowserWindow、严格 CSP、可信 Renderer reload、窄 Preload API 和 Electron Fuses。
- 独立UtilityProcess Proxy Core与CoreRuntime生命周期；heartbeat仅观测，自动重启只由启动无ready、真实异常退出或真实MessagePort关闭触发。
- 模块化 Ant Design v6 Renderer：App shell、六个 feature workspace、Inspector、四套时段主题（light/warm/dark/ember）+ 侧栏主题/语言切换器和扁平共享组件库。
- SVG/PNG/ICO/ICNS 应用图标及可重复生成脚本。
- Vitest 单测、真实 packaged executable 的 Playwright CDP smoke、package 与生产依赖审计流程。
- M0 详细实现、排障和验证历史已迁入 [archived/M0.md](archived/M0.md)。
- Main/Core 专用 MessagePort、TypeScript runtime schema、request correlation、timeout/cancel 和 CoreProcess restart recovery。
- Core 结构化 Command/Action Trace、完整内存/持久记录、敏感字段脱敏和 stdout/stderr 后备。
- 窄 Renderer API：CoreProcess 状态、M1 echo 和脱敏 Trace 查询；无通用 IPC、MessagePort 或 Node 暴露。
- **M2 存储层**：`node:sqlite` + `worker_threads` 的 Capture/Diagnostics 双库、内容寻址 Blob Store、keyset 分页查询、Storage 状态/清空窄 API 与 Storage 设置面板；代码位于 `apps/proxy-core/src/proxy-core/{storage,diagnostics}/`，协议扩展在 `packages/core-protocol/src/{messages,validation}.ts`，桌面接线在 `shared/desktop-api.ts`、`preload/preload.ts`、`main/main.ts`、`main/utils/renderer-utils.ts`、`features/settings/`。详见 [archived/M2.md](archived/M2.md) 的实施记录。

## 已实现功能与代码位置

### 工程、构建与命令

| 已实现内容 | 代码或配置位置 | 说明 |
| --- | --- | --- |
| npm monorepo 与根命令 | `package.json`、`package-lock.json` | 编排 Desktop/Core build、dev、typecheck、unit、package、smoke |
| 严格 TypeScript 基线 | `tsconfig.base.json` | Desktop/Core 继承，不应为局部错误放宽全局严格性 |
| Node/npm 版本约束 | `.nvmrc`、`.npmrc`、根 `package.json` | Node 24.18.0、npm 11.16.0、精确依赖 |
| Desktop Forge/Vite 构建 | `apps/desktop/forge.config.ts`、`apps/desktop/vite.*.config.ts` | Main/Preload/Renderer 三入口、ASAR、Core extraResource、Fuses、图标 |
| Proxy Core 构建 | `apps/proxy-core/package.json`、`apps/proxy-core/tsconfig.json` | 独立 CommonJS UtilityProcess 产物 |
| Shared Core protocol | `packages/core-protocol/` | 平台中立消息类型、Command/Result mapping、严格 runtime validator 和协议测试 |

### Electron Main、安全与生命周期

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| Main 应用所有者 | `apps/desktop/src/main/main.ts` | `DesktopApplication` 集中管理安全窗口、Session/IPC 和一个 CoreRuntime |
| Main CoreRuntime | `apps/desktop/src/main/core/core-runtime.ts` | 唯一 Core 入口；拥有 CoreProcess、MessageChannel、状态、heartbeat/restart/shutdown 和 RPC client |
| Main Core RPC client | `apps/desktop/src/main/core/core-rpc-client.ts` | CoreRuntime 内部 Promise correlation、timeout/cancel、late/duplicate/disconnect 和 replacement 清理 |
| CoreRuntime 单测 | `apps/desktop/src/main/core/tests/core-runtime.test.ts` | fake CoreProcess/timer 覆盖正常、重启、listener 清理和强制停止路径 |
| Main Renderer utils | `apps/desktop/src/main/utils/renderer-utils.ts` | Renderer IPC 输入校验与 Diagnostics DTO 映射纯函数 |
| Renderer URL 白名单 | `apps/desktop/src/main/security/trusted-renderer-url.ts` | 开发精确同源、生产精确 `interceptor://app/index.html` |
| URL 安全单测 | `apps/desktop/src/main/security/tests/trusted-renderer-url.test.ts` | 可信 reload 与外部/无效 URL 拒绝 |
| GitHub Release更新服务 | `apps/desktop/src/main/updates/github-release-update-service.ts` | stable检查、changelog、平台asset选择、用户触发流式下载与打开安装器 |
| 更新服务测试 | `apps/desktop/src/main/updates/tests/github-release-update-service.test.ts` | Windows MSI/macOS DMG、哈希/截断/外域/tag/架构/目录失败/旧文件清理/开发态/轮询12项 |
| Core application | `apps/proxy-core/src/proxy-core/core-application.ts` | 子进程根对象；拥有 ready/heartbeat/shutdown/signal、RPC、Diagnostics 和后续 Storage/Proxy Service |
| Core executable entry | `apps/proxy-core/src/proxy-core/entry.cts` | 只解析 UtilityProcess parentPort 并启动 CoreApplication；bundle 为 `entry.cjs` |
| Core RPC server | `apps/proxy-core/src/proxy-core/core-rpc-server.ts` | 信封/version/关联、request/cancel、response、connection replacement |
| Core diagnostics | `apps/proxy-core/src/proxy-core/core-diagnostics.ts` | AsyncLocalStorage Trace、Action、完整记录、脱敏和 sink fallback |

### Preload 与共享契约

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| Renderer 可见 API 类型 | `apps/desktop/src/shared/desktop-api.ts` | `CoreProcessStatus`、echo、脱敏 Trace 和窄 `InterceptorDesktopApi` |
| contextBridge 实现 | `apps/desktop/src/preload/preload.ts` | 进程状态订阅和两个意图型 RPC；无通用 IPC |
| Renderer Window 类型 | `apps/desktop/src/renderer/global.d.ts` | 声明 `window.interceptor` |
| 更新窄契约 | `apps/desktop/src/shared/desktop-api.ts`、`preload/preload.ts` | get/check/download/openDownloaded/status event；无URL/path |

### Renderer

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| React 入口 | `apps/desktop/src/renderer/main.tsx` | 加载全局样式并挂载 App |
| App shell | `apps/desktop/src/renderer/app/App.tsx`、`Sidebar.tsx` | `App.tsx` 直接拥有 Sidebar/Header/Main/Footer Grid，按 view 渲染六个 feature 的 main/statusbar；Sidebar 提供导航与主题/语言切换器 |
| App shell 布局 | `apps/desktop/src/renderer/app/App.module.css` | 46px Window Header、全高 Sidebar、Main、30px Footer 与窗口控制视觉 |
| Capture workspace | `apps/desktop/src/renderer/features/capture/` | 子组件 CaptureWorkbar/Omnibox/CaptureMain/RequestList/RequestInspector/CaptureStatusbar，各自 colocated CSS Module |
| Rules workspace | `apps/desktop/src/renderer/features/rules/` | RulesMain/RuleList/RuleEditor/RulesStatusbar；搜索/New/Apply/More 位于 RuleList 内容工具栏 |
| 其余 workspace | `apps/desktop/src/renderer/features/{composer,settings,breakpoints,diagnostics}/` | Main/Statusbar + 内容工具栏，colocated CSS Module；一对一还原 `design/app` 对应视图 |
| Updates UI | `features/settings/{updateStore.ts,update-format.ts,SettingsContent/UpdatesPanel.tsx,UpdateNotification/}` | 七态更新面板、进度、纯文本changelog与 Header 下方独立通知 |
| 共享 UI 原子 | `apps/desktop/src/renderer/components/` | 扁平库(每个组件独立子目录含 tsx+module.css)：IconButton/Button/Switch/Select/InputBox/Segmented/Checkbox/Chip/Tabs/FilterChip/Timeline/Splitter/MethodBadge/StatusBadge/SectionHeader/StatItem/Count/MenuItem/NavItem/Flyout + cx/index |
| Automation ID contract | `apps/desktop/src/shared/automation-ids.ts`、Renderer Shell/Capture/共享组件 | 静态ID、动态前缀与factory的唯一来源；当前完成Shell/Capture初始接线，其余feature随workflow实现补齐；无测试状态或隐藏IPC |
| 主题 / 语言切换器 | `apps/desktop/src/renderer/components/{ThemeSwitcher,LanguageSwitcher}/`、`renderer/i18n/` | 侧栏底部控件（取代旧 Account）；Flyout 以按钮为锚 portal 弹出、底边对齐。语言列表提供 15 种完整本地 catalog；主题四项 hover 浮现时段山水 |
| Ant Design 主题 | `apps/desktop/src/renderer/theme/theme.ts` | 四套时段主题 palette（light/warm=default、dark/ember=dark 算法）+ 全局/Button/Segmented/Splitter/Tabs/Tooltip Token |
| 全局样式 | `apps/desktop/src/renderer/styles/global.css` | reset、四套主题 `:root[data-theme]` tokens、字体和 reduced-motion |

### 图标与测试

| 已实现内容 | 代码位置 | 说明 |
| --- | --- | --- |
| 图标源与产物 | `apps/desktop/assets/interceptor-icon.{svg,png,ico,icns}` | SVG 为源；PNG/ICO/ICNS 供 Renderer/Windows/macOS 使用 |
| 图标生成脚本 | `scripts/generate-icon.ps1` | 可重复生成平台图标，修改后需人工检查所有格式 |
| Local workflow E2E | `apps/desktop/tests/e2e-workflow-tests/` | `_electron.launch()` + 未打包production bundle；driver/fixture/60条规格已完成，`workflows/`为空、0条已实现 |
| Packaged smoke | `apps/desktop/tests/packaged-smoke/startup.spec.ts` | 真实 exe + CDP；当前综合覆盖 UI、安全、Core、主题、窗口尺寸和退出清理，尚未复用60条workflow contract |
| Playwright 配置 | `apps/desktop/playwright.config.ts` | 最终 package smoke 配置 |

当前高层 Workflow 图和 20 步流程表见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 最近 Core 简化

当前分支包含进入 M2 前的 Core 子进程根对象简化：

- `apps/desktop/src/main/core/`：删除 Supervisor/adapter，新增统一拥有 CoreProcess、状态、MessageChannel 和 RPC client 的 `CoreRuntime`。
- `apps/desktop/src/main/utils/`、`src/main/main.ts`：提取 Renderer 输入校验/DTO 映射，DesktopApplication 只持有一个 CoreRuntime。
- `apps/proxy-core/src/proxy-core/`：删除重复的 `CoreProcess` 类，由 `CoreApplication` 统一拥有子进程生命周期、RpcServer、Diagnostics 和业务路由；可执行入口改名为 `entry.cts`。
- `README.md` 与 `stages/`：同步新的对象所有权和高层 Workflow 文档。

接手后必须以 `git status --short` 和 `git diff` 为准复核；不要假设聊天中列出的文件清单永远完整。

## 最近验收与下一动作

2026-08-04 Composer 落地 + Renderer 规范化提交前验证：三 workspace typecheck 通过；Desktop 155 / Proxy Core 241 / Protocol 15 / MCP 45，共 **456 项 unit tests** 通过；`npm run build:core` 通过。本轮三件事：

**（一）Composer 全链路落地**。协议新增 `ComposerTiming`（分阶段耗时），Core 侧 `composer/internal/timing-recorder.ts` 按 socket 的 `lookup`/`connect`/`secureConnect` 事件与请求写完、首字节、结束五个时刻折算 DNS/TCP/TLS/Request/Waiting/Download，H1 与 H2 两条路径都接入——设计稿的 Timing 页要的就是这批数据，此前协议里只有 `durationMs`。Main 补齐 `collectionGet`/`collectionReplace` 两个 IPC handler，并把 rules/collection 共用的乐观并发失败映射抽成 `DesktopApplication.toReplaceFailure`。Renderer 按 `design/app` 的 34 张 composer 截图重写为 13 个组件：`ComposerMain`（两处 splitter）、`CollectionPanel`（树 / 行内重命名 / 目录菜单）、`DocumentTabs`、`RequestUrlBar` + `RecentSends`、`ComposerTabBar`、`KeyValueTable`、`RequestPane` + `BodyPane` + `AuthPane`、`ResponsePane` + 四个响应页 + 占位。i18n 15 种语言各 75 条 composer 词条，删掉重写后不再使用的旧词条。共享原语扩展：`Splitter` 支持水平方向、`Select` 透传 Ant 的 `labelRender`/`optionRender`、`Button` 支持 `className`、新增可编辑的 `CodeEditor`。

**响应式**按设计稿画布与结构尺寸区分处理：Collection 宽度（216px）与响应区高度（368px）只是初始值，两处 splitter 可拖拽，**上限由对侧最小尺寸推导**（`总宽 − MIN_WORK_WIDTH − 轨道宽`），`ResizeObserver` 在窗口缩放时重新 clamp；行高、控件尺寸、弹层宽度沿用设计稿固定值。

**（二）Renderer 规范化**。AGENTS.md 新增四条 Renderer 结构规范（一个 tsx 一个组件、纯函数进 utils.ts、CSS 与 tsx 一一对应、画布尺寸 vs 结构尺寸），并按规范清理全部存量：`SettingsContent` 拆出 4 个面板 + `SettingsGroup`/`SettingsRow`/`ProxyOwnershipBadge`；`RequestInspector` 拆出 `Kv`/`StatusValue`/`ClientAppValue`/`Section`/`KvSection`/`BodySection`；另有 `TlsDetailRow`/`TlsTunnelDetailRow`/`FramePreview`/`FramePayload`/`GrpcMessagePayload`/`FacetGroup`/`FacetValueLabel`/`StatusFacetValue`/`FileCommand`/`SetupStep`/`ScopeOption`/`CheckOption`/`JobProgress`/`ModeToggles`/`MatcherControls`/`ActionBody`/`TabLabel`/`LockOffIcon`/`NoOpenRequest`/`ResponsePlaceholder` 等 30+ 个组件独立成文件，各配同名 CSS Module（唯一一份被 4 个 tsx 共用的 `SettingsContent.module.css` 已拆散）。约 25 个纯函数归入各 feature 的 `utils.ts`，其中 `describeError` 与 `copyPayload` 各有两份重复实现，合并后去重；恒等函数 `shortenId` 直接删除。**审计脚本复检：121 个 tsx / 110 个 CSS，0 处违规。**

顺带修了两处**历史遗留的 GBK 乱码注释**（`InputBox.tsx`、`MethodBadge.tsx`，来自更早的提交），并加了一个全仓编码检查：496 个文件 0 损坏。

**（三）待办**。visual parity 与 packaged smoke 都还欠着：parity 基线本来就是 `Review required`（53 views / 375 targets / 32 missing / 310 flagged），Composer 的 target 尚未加入 `parity.config.mjs`；packaged smoke 的 Preload API 键断言已同步（顺带修好上一轮 `getStorageStatus` → `getCaptureUsage` 改名后错位的排序），但未实跑。

2026-08-04 Proxy Core 模块结构重构 + Composer 数据链路（Core 侧）提交前验证：三 workspace typecheck 通过；Desktop 154 / Proxy Core 241 / Protocol 15 / MCP 45，共 **455 项 unit tests** 通过；`npm run build:core` 通过（两个 worker bundle 重建，`ship-core-deps` 1207 files / 9.96 MiB）。本轮两件事：

**（一）Proxy Core 模块结构重构**。`storage/` → `capture/`（`CaptureService`，只管当前 Recording 的易失 Exchange/Body），`connection/` → `tls-probe/`（`TlsProbeService`），新增 `workspace/`（`WorkspaceService`，App 全局公用 Store，持久 `workspace.sqlite` 的 `rule_set` 与 `collection_tree`），`RuleEngine` → `RuleService`、`TransferJobManager` → `TransferService`。每个模块目录现在只有 `entry.ts` + `README.md` + 子目录，实现类进 `internal/` 且不再带模块名前缀（`capture/internal/exchange-store.ts` → `ExchangeStore`）。**删除了六个镜像具体类的结构接口**（`CaptureSink`、`CaptureEventSink`、`GrpcStorageReader`、`HarStorage`、`ArchiveStorage`、`BodyWriter`），协作者直接依赖具体类，测试替身改为 `extends` 真实类并 `override` 被断言的方法——此前这些接口让 go-to-definition 跳到接口声明而非实际实现。12 个模块 README 已补齐，规则写进 AGENTS.md 与 `apps/proxy-core/CONSTANTS.md`。

一个教训记在这里：批量改名用 PowerShell 时 **`Set-Content` 在 PS 5.1 下默认按 ANSI(GBK) 写出**，把 31 个文件的 UTF-8 中文注释写坏（部分字节不可逆丢失），只能 `git checkout` 回滚后用 `[IO.File]::WriteAllText($p, $t, [Text.UTF8Encoding]::new($false))` 重做。以后在本仓做任何脚本化文本替换都必须显式指定 UTF-8 编码并在之后校验（严格 UTF8Encoding 解码一遍全部文件）。

**（二）Composer 的 Collection 数据链路已通到 Preload**。`core-protocol` 新增 `collection.ts`（`Collection` / `CollectionNode` / `CollectionRequest` / `CollectionFolder`）与 `collection.get` / `collection.replace` 两条命令；`WorkspaceService.loadCollection` / `saveCollection` 与 RuleSet 同构（单行表 + 整棵树一个 JSON + 乐观 revision）；CoreApplication 路由完成；`desktop-api.ts`、`preload.ts`、`core-rpc-client.ts` 已声明。**Main 侧 IPC handler 尚未实现，所以这条链路目前仍是断的**。

**（三）命名同步规则扩展到全仓**。原则写在 AGENTS.md 新增的「命名」节与 `apps/proxy-core/CONSTANTS.md`：指向类实例的变量/字段/参数/对象属性一律用类名的 camelCase 全名，不用简称（`connection: RpcConnection` → `rpcConnection`、`controller: AbortController` → `abortController`、`db: DatabaseSync` → `databaseSync`、`signal: AbortSignal` → `abortSignal`），`Core` 前缀不作特例（`CoreApplication` → `coreApplication`），测试 fixture 与替身同样适用（`RecordingCaptureService` → `recordingCaptureService`）。**但名字承载类型名没有的信息时保留语义名**——`mainWindow: BrowserWindow`、`coreProcess: UtilityProcess`、`insertStatement: StatementSync` 不改，同作用域多实例仍靠 `first`/`second`、`exportHost`/`importHost` 区分，通用容器（Map/Set/Promise/RegExp）与 DTO 字段按内容语义命名。本轮除 Proxy Core 外还改了 Main（`pending` → `pendingRpcRequest`、`journal` → `systemProxyJournal`、`downloadAbort` → `downloadAbortController`、`port: MessagePortMain` → `messagePortMain`）、Renderer（`params: URLSearchParams` → `urlSearchParams`）、MCP（`tools` → `mcpToolRegistry`、`redactor` → `mcpRedactor`）与全部相关测试。`packages/core-protocol` 只有 type/interface，无类实例，未改。

未跑 package / packaged smoke：本轮未改 Fuses、CSP、导航边界或打包产物构成，但 Main 加了 `collectionGet`/`collectionReplace` channel 常量，**Composer 落地后要补一次 packaged smoke**。visual parity 同样等 Renderer 落地后再跑。

2026-08-04 Composer 设计稿（idea 第 4 条）提交前验证：本轮**只改设计资产与文档，未改任何产品代码**——`git status` 确认改动仅落在 `design/`、`stages/`、`architecture/`，因此按 AGENTS.md 不跑 typecheck / unit / package / smoke。`node design/app/shoot.mjs` 全量重出 **170 张**截图（composer 从 2 张扩到 34 张，新增 `request-query` / `request-body` / `request-body-form` / `request-body-none` / `request-auth` / `response-headers` / `response-cookies` / `response-timing` / `empty` / `sending` / `history` / `collection-collapsed` / `collection-folder-menu` / `collection-rename` / `collection-folder-actions`）。**Capture 与 shell-v2 的部分截图一并变化**，原因是取消了 `[data-monaco="fill"]` 的 `min-height: 320px` 并删掉 `.jsonv.mono` 的 `border-top`，这两处会连带影响 Capture Inspector 的正文区。过程中查出并修掉两个**全局 CSS 污染**：`.app.shell-v2 .tabs` 的 `margin-top` 漏给 composer（收窄为 `.insp .tabs`，不是靠提高特异性对抗）、全局 `.rmeta` 的 column flex 污染响应指标（改名 `.rmetric`）——后者正是 `142 ms` 换行与基线错乱的真凶。**visual parity 本轮不跑也跑不了**：Renderer 的 Composer 还是旧形态，与新设计稿必然全项不匹配，parity 要等 React 落地后才有意义。

2026-08-02 Capture 筛选分栏设计稿（idea 第 2 / 3 条）提交前验证：本轮**只改设计资产，未改任何产品代码**，因此不跑 typecheck / unit / package / smoke——`apps/`、`packages/`、`scripts/` 零改动。`node design/app/shoot.mjs` 全量重出 **132 张**截图（新增 `filters-collapsed` / `filters-collapsed-active` / `filters-active` / `filters-method` / `filters-host` / `filters-status` / `filters-protocol` / `filters-type` / `filters-group-clear` / `recording-paused` / `sidebar-expanded`，删除整组 `add-filter/*` 与 `capture/collapsed`）。截图脚本原来用 `waitUntil:'networkidle'` 等 Google Fonts + Monaco CDN，慢网下 120s 仍超时，已改为 `waitUntil:'load'` + 显式等 `window.__monacoReady` 与 `document.fonts.ready`。过程中修掉两个设计稿真实缺陷：`setState` 只在传了 `scene` 时才同步列表选中行，导致场景之间残留上一次的高亮行；筛选 badge 原本只由截图用的 `data-filter-active` 驱动，在浏览器里手点 facet 根本不亮，已改为扫描真实 `.fitem.on` 计算。**visual parity 本轮不跑也跑不了**：`apps/desktop` 的 Renderer 还是旧形态，与新设计稿必然全项不匹配，parity 要等 React 落地后才有意义。

2026-07-31 客户端应用归属（idea 第 1 条）提交前验证：三 workspace typecheck 通过；Desktop 138 / Proxy Core 238 / Protocol 15，共 **391 项 unit tests** 通过（新增 11 项 `ClientAppService` 与 6 项 tracker 时序用例，其中一项用“永不返回的 helper”锁住 `exchange-added` 不被子进程创建推迟）。Visual parity **54 views / 366 targets / 366 matched / 0 missing / 114 flagged / 平均像素差 2.07%**：新增的 `List app header` / `List app cell` / `List app cell empty` / `Inspector client app` 四个 target 全为 `ok`（前三者 0.0 px），相比旧基线 362 targets / 113 flagged 只多出 `capture / List status cell` 一项 1.3 px 字体子像素偏差。过程中修了一处**设计稿结构错误**：`design/app/index.html` 把 `client-app-value` 直接加在 `.v` 上，使它成为 grid item 被 blockify 成 flex、宽度拉满列并把后续 kv 行整体下移（`Inspector client app` 差 159.4 px、四个 Rule marker 差 1.5–1.8 px）；改为内层 span 后五项全部转 `ok`。本轮未跑 package / packaged smoke：只新增了 Main 的图标读取与 `client-app:icons` 推送，未改 Fuses、CSP 或导航边界；但 `dist/client-app` 作为 extraResource 随包发布，**下次 package 时要一并核对 artifact audit 文件数**。用户未在 dev 真机复验最终归属规则（helper 路径在 Core fork 时注入，需重启 dev app）。

2026-07-26 P1 一批（TODO #15/#17/#18/#19/#25）提交前**全面验证**：三 workspace typecheck 通过；Desktop 134 / Proxy Core 215 / Protocol 15，共 **364 项 unit tests** 通过；`npm audit --omit=dev` 0 vulnerabilities；Windows x64 package 通过；artifact audit **1,292 files / 377,565,157 bytes** 全通过；**真实 packaged smoke 1/1 通过**（本轮删除了 `validateRules` 窄 API，apiKeys 断言已同步并由 smoke 实证）；visual parity **54 views / 362 targets / 0 missing / 113 flagged / 平均像素差 2.01%**，与既有基线一致，说明删 Throttle 菜单、chip 改名、断点正文区域、Reload 按钮与 Filter 禁用态都能对上设计稿且无新增几何偏差；dev 真机经 8888 请求 `example.com` 返回 200、请求死端口被镜像为连接错误且终端零 `[proxy-core]` 报错。本轮改动：Rule 命中数改为按 `Rule × Exchange` 去重（一条三 action 的规则命中一次请求由计 3 改为计 1）并在 Clear 后立即归零；Apply 冲突不再自动重载覆盖本地草稿，改为保留草稿+冲突提示并提供显式 Reload；右键建规则只取 scheme+host+path，不再把 `access_token`/`signature` 写进 `rules.sqlite`；无命中时 Filter 按钮禁用并说明原因；body/HAR/diagnostics/archive 四处导出去掉多余的 `rm`，改为直接 `rename` 覆盖以消除旧文件丢失窗口。

2026-07-26 Stage A' （TODO #4/#5/#6）提交前验证：三项都先用真实代理 + 真实源站的集成测试复现再修。证据：空 host 条件的规则确实给源站注入了 `x-injected`；8 KiB/s 限速下载 128 KiB 实测 17 ms；断点快照 `body` 恒为 `undefined` 且无任何可见性标注。修复后三 workspace typecheck 通过；Desktop 131 / Proxy Core 212 / Protocol 15，共 358 项 unit tests 通过，proxy-core 全量连跑三次无间歇失败（新增集成测试改用随机端口并在清理时先放行挂起断点）。dev 真机启动正常、经 8888 请求 `http://example.com/` 返回 200。local E2E workflow 套件仍是 0 条规格，因此本轮一律用真实 Mockttp 集成测试作为最高可达层级的证据。

2026-07-26 上游连接失败控制台刷屏修复提交前验证：问题先被复现——`proxy-service.test.ts` 新增用例在旧代码下确实打印 `Failed to handle request: connect ECONNREFUSED ...` 并把伪造的 502（正文为错误文本）回给客户端。修复后三 workspace typecheck 通过；Desktop 126 / Proxy Core 209 / Protocol 15，共 350 项 unit tests 通过。dev 真机（`npm run dev` + 8888 loopback）经代理请求死端口时客户端收到 `Connection was reset`、终端零 `[proxy-core] Failed to handle request`，对照请求 `http://example.com/` 仍返回 200；系统代理未被接管（`ProxyEnable` 仍指向用户自有 7890），退出后 8888 已释放。local E2E workflow 套件仍是 0 条规格（`playwright test --list` = 0 tests），因此本轮没有也不能用它验证。未运行 package/packaged smoke：本轮未改 Main、Preload、IPC、Fuses、CSP 或打包边界。

2026-07-25 Capture / Rules 联动、Body 安全预览/保存与 BYD 修复提交前验证：三 workspace typecheck 通过；Desktop 126 / Proxy Core 196 / Protocol 15，共337项unit tests通过。Capture request 右键建 exact-URL Rule 草稿、Rule OR 过滤、Rules→Capture、effect marker→Rule 已闭环；ruleIds/header ruleId 经 Native Archive Worker round-trip。文本/结构化/WS/gRPC 预览上限为1MiB，压缩正文从 Body Store 流式解码有限明文；音视频 Renderer 零读取并经 Main Save Dialog + Core transfer job 流式原子保存。Proxy 对 request/response Rule hook 做动态预筛选，无候选流量不再触发 Mockttp 全量缓冲；保持 `http2:true`。真实 Proxy Enable + Trusted CA + MITM 下，BYD 参数对比/大唐EV两页各首载+刷新均200，标题正确、`ERR_HTTP2_PROTOCOL_ERROR=0`，Capture HTML 以`<!doctype html>`开头且无decode failure。设计 SPA 现有122张场景；visual parity 54 views / 362 targets / 0 missing / 平均像素差2.00% / 113 flagged（既有字体/旧场景几何基线）；新增 request menu、Rule filter有/无命中、1MiB文本和媒体保存场景均0 flagged。Windows x64 package通过；artifact audit 1,292文件 / 377,532,994 bytes全通过；真实 packaged smoke 1/1通过；`npm audit --omit=dev`为0 vulnerabilities；系统代理最终恢复到测试前`ProxyEnable=0`且8888已释放。

2026-07-25 Header effects / dropdown / SQLite schema 简化提交前验证：三 workspace typecheck 通过；Desktop 119 / Proxy Core 185 / Protocol 15，共319项unit tests通过；Core 与真实 Archive/Diagnostics Worker bundles重建成功，Archive Worker真实线程3项round-trip通过。Rules Add action最小窗口由Ant自动 `right→left`、整块面板最大几何差0.6px；Rules Select 8项自然高度272px、无滚动、整块面板0px差；Capture四种Rule Header marker尺寸/字体/颜色0差，位置残差0.9–1.2px，整体剩余flag为既有字体子像素级1.3–1.6px。`git diff --check`通过。未运行package/packaged smoke：本轮未改Main/Preload/IPC/Fuses/CSP或打包边界。

2026-07-22 本次提交前验证：三 workspace typecheck通过；Desktop 115 / Proxy Core 180 / Protocol 19，共314项unit tests通过；`e2e:prepare-local`成功构建Core、Windows helper和未打包production Main/Preload/Renderer bundles。Visual parity保持既有基线：45 views / 330 targets / 0 missing / 平均像素差1.83% / 94 flagged。Windows x64 package通过；package audit 1,292文件 / 377,412,874 bytes全通过；真实 packaged smoke 1/1通过；`npm audit --omit=dev`为0 vulnerabilities。因为`workflows/`为空，本次没有运行或宣称任何local feature workflow通过。

下一动作：Composer 的 Core / Main / Renderer / i18n 已全部落地，剩下的是**验收资产**。

1. **visual parity**：`apps/desktop/tests/visual-parity/parity.config.mjs` 补 composer 的 target（对应 `design/app` 的 34 张 composer 截图）并重跑。注意 **parity 基线本来就欠着**：当前 `parity-report.md` 是 `Review required`（53 views / 375 targets / 32 missing / 310 flagged），Capture 筛选分栏落地后没重建过，这轮 Composer + Renderer 拆分之后应一并清账。
2. **packaged smoke**：本轮新增了 `collection:get` / `collection:replace` 两个 IPC channel，Preload API 键断言已同步但未实跑，需要 `npm run package` 后跑一次 `test:smoke`。
3. **dev 真机复验 Composer**：Collection 的建/改/删、编辑即生效的节流写回、Send 后的四个响应页（尤其 Timing 的分阶段条），以及两处 splitter 拖拽 + 窗口缩放 clamp。

范围与边界见 [../architecture/feature-composer.md](../architecture/feature-composer.md) 第 5 节；「编辑即生效」意味着 `collection.replace` 会被高频调用，Renderer 侧已用 600ms 节流（整棵树一次写入，不做增量命令是有意的设计选择），冲突时以 Core 版本为准重载——集合没有草稿概念，这点与规则集不同。之后再按 idea 推进 Breakpoint 交互重构（依赖的 filter 重构已完成，已解锁）。local E2E 方面仍是：从 `application.startup.ready` 开始重新实现第一条 local workflow，只通过公共 automation ID 操作真实App UI；成功保存独立trace/evidence并验证destroy后，才把该单条Inventory状态改为implemented。随后逐条扩展60条规格；packaged目标复用同一业务contract，不能复制第二套workflow。不要加入`.vite/`、package、Playwright report或`test-results/`；继续保留`apps/desktop/tests/visual-parity/parity-report.md`作为验收资产。

提交后，首个真实 tag release 仍需仓库 Secrets 中的 Windows 签名证书、Apple Developer ID 与公证凭据；无凭据时不要放宽 tag 发布门禁。

## 剩余工作项目

### 已完成 Stage 的后续优化（非阻塞）

- M3 T3.3 真零内存流式正文：改用 Mockttp `request-body-data`/`response-body-data` 事件按 id 增量喂入 `BlobStore.writeStream`，超内存阈值 spill。
- M5 详细源站 TLS metadata（version/cipher/ALPN/证书链）记录 + Inspector TLS/Timing 标签填充；CA 导出（PEM/DER）后续。机器级信任库（sudo-prompt 提权）已完成（见 M5.md 后续增强）。
- Diagnostics 面板过滤（Level/Outcome）、脱敏 JSONL 导出、Main/Renderer 日志纳入诊断（M10 T10.4/T10.5）。

### 后续 Stage

| Stage | 状态 | 主要范围 | 产品设计入口 |
| --- | --- | --- | --- |
| M12 | 已完成（外部签名/macOS 证据待补） | MSI/DMG/ZIP、strict Fuses、artifact/installer/package smoke、release CI | 完整方案第十七/十八章、第二十七章 M12 |
| M13 | 已完成（100%，外部签名/macOS证据待补） | GitHub Release检查、app内changelog、手动下载MSI/DMG、Updates UI | 完整方案第十七章、第二十七章 M13 |
| M14 | 已完成（100%） | 临时 Capture/Body、Renderer 全量 summary、RuleSet 拆分、按需 Archive Worker | 完整方案第十二、十四章、第二十七章 M14 |

归档的 `M*.md` 不再追加日常进度；新工作更新本 Handover 与已落地架构，只有追溯历史设计时才读取对应归档文件。

## 必须保持的边界

- `UtilityProcess.parentPort` 只用于 ready、heartbeat、rpc-port transfer、shutdown 和 stopped；业务消息只能走转交后的专用 MessagePort。
- `CoreProcessStatus.running` 只表示最近收到 heartbeat，不是业务健康结论。
- Core 当前无外部接入且与 Desktop 同包发布；不要引入 Koa/WebSocket、本地监听端口、Named Pipe/UDS、Token 或跨版本协商矩阵。
- Renderer 继续只通过面向意图的 `window.interceptor` API 访问 Main。
- Main 不搬运未来请求/响应正文；正文数据路径保持在 Core/Storage。
- Protocol 字段不可直接复用 React state、Ant Design props、Electron event、Mockttp 运行时对象或数据库 row。
- 分页使用有限 metadata + opaque keyset cursor；Body 使用有限 range/chunk；大列表和完整 Body 不通过单条消息传输。
- 日志必须非阻塞并脱敏；不得因队列、记录数、字节或保留期淘汰。
- Capture SQLite 与 `diagnostics.sqlite` 必须使用独立 Worker/Writer；日志失败不得阻塞或回滚 Capture 写入。
- `sessions.query`、Body range等handler使用typed payload与opaque keyset cursor；Protocol只校验信封/version/关联字段，数据或请求错误不能改变连接与进程状态。

## 已知风险

- Forge Vite Plugin 仍是 Experimental；升级 Electron/Forge/Vite/TypeScript/Fuses 后必须重跑 package、ASAR/Fuses、smoke 和 HMR。
- UtilityProcess MessagePort 转交、Core restart 后的 port replacement 和 packaged 资源路径必须通过真实 exe smoke；修改 Main/Core 生命周期或打包路径后必须重跑，不能只依赖单元 Fake。
- 结构化日志的对象分配和 IPC 批次仍有成本；必须限制 attributes、队列记录数/字节数和低优先级采样，不能把完整 Command 或 Body 序列化为日志。
- 完整开发依赖 audit 含 Forge 工具链已知漏洞；生产依赖 audit 为零，最终 ASAR 不含相关开发包。不要运行 `npm audit fix --force`。
- Packaged Renderer使用标准安全`interceptor://app`协议，`GrantFileProtocolExtraPrivileges`已关闭；不得回退到`loadFile`或放宽导航白名单。
- Windows/macOS 生产可信签名、公证和 macOS helper/SystemConfiguration round-trip 需要仓库外凭据及原生 runner；发布 workflow 已提供验收入口。Windows unsigned MSI/package 全生命周期已验证。
- Visual parity 已作为正式测试放在 `apps/desktop/tests/visual-parity/`，通过 fake Preload + 正常 UI 交互运行；禁止把 fixture/DEV setter 放回业务 Renderer。Linux 字体差异只作诊断，Windows/macOS 为权威视觉结果。

## 最近验证状态

2026-07-13 M1 对象所有权复核后的最终验收：

- `npm run typecheck`：通过，Desktop、Proxy Core、Protocol 三个 workspace 均无错误。
- `npm run test:unit`：通过，82 tests（Desktop 21、Proxy Core 55、Core Protocol 6）；Proxy Core 覆盖 capture/blob/diagnostics store、Storage/Diagnostics Worker host（假通道）、真实 worker 线程集成和 10 万行 keyset 分页稳定性。
- `npm run package`：通过，生成 Windows x64 `Interceptor` package；`proxy-core` esbuild 多入口输出 `entry.cjs` + `storage/storage-worker.cjs` + `diagnostics/diagnostics-worker.cjs`，Forge `extraResource` 递归复制。
- `npm run test:smoke --workspace @interceptor/desktop`：历史验证通过；当前`getCaptureUsage`返回真实计数与临时正文用量，不含quota；Capture database bytes为0，`clearCapture`正常。
- `npm audit --omit=dev`：通过，0 vulnerabilities（M2 未新增生产依赖，全部用 `node:sqlite`/`worker_threads` 等内置模块）。
- `git diff --check`：通过。

M2 存储层用 `node:sqlite`（Electron 43 内置 Node 24.18.0，已探测 WAL/外键/FTS5/`user_version` 均可用）配合 `worker_threads` 把同步 SQLite 移出网络事件循环；Capture 与 Diagnostics 双库/双 Worker 强隔离，日志写入失败只计数不阻塞或回滚捕获。真实 worker 集成测试 + packaged smoke 已验证 worker spawn、worker 内 `node:sqlite` 与 bundle 路径解析。

如果接手时 [archived/PROGRESS.md](archived/PROGRESS.md)、[archived/M2.md](archived/M2.md) 与本节结果不一致，以最新命令实际输出为准；归档内容只作历史参考。

## 常用恢复命令

```powershell
git status --short --branch
npm run typecheck
npm run test:unit
```

涉及 Main、Preload、IPC、Fuses、CSP 或打包边界时，在阶段收尾额外运行：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
git diff --check
```

完整命令说明见 [README.md](../README.md)。

## Handover 更新规则

- 本文件必须足够详细，使没有聊天上下文的新 Session/Agent 可以定位代码并继续任务；但诊断流水和完整验证历史放在对应 Stage 文件，避免无限增长。
- 每次 handover 必须写明：当前 Stage 和百分比、已完成任务、已实现功能及代码位置、工作树状态、剩余任务、阻塞/风险、下一条可执行任务和验证状态。
- 如果当前 Stage 已完成，必须明确标记“进入下一 Stage”，并链接下一 Stage 文件；如果未完成，必须逐项列出当前 Stage 的剩余工作。
- 每次都必须提醒接手者先阅读 [ARCHITECTURE.md](ARCHITECTURE.md)。
- 需要追溯产品设计时参考 [archived/桌面网络调试代理完整方案.md](archived/桌面网络调试代理完整方案.md)；归档 Stage 文件不再用于日常进度追加。
- 一个任务完成后更新本文件的当前状态、验证和精确下一动作；历史流水不要持续堆入接棒入口。
- 架构已落地的变化同步到 [ARCHITECTURE.md](ARCHITECTURE.md)；只有命令或环境发生变化时更新 README。