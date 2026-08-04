## 新的idea

- [x] **已完成**（2026-07-31，commit `cc11b5e`/`27bcd5f`/`5cdfc2a`）我们能不能加上application和图标？![alt text](image-5.png)
- [x] **已完成**（2026-08-02 设计稿 `a8a484a`，2026-08-03 Renderer `3eaa14e`）我在想sidebar默认收起，然后顶部的filter全部换到左侧一个分栏，有各种filter，可以折叠，分栏可以收起，filter现状还是不够直观，最好和现在的all/h1/h2那样可以直接点，并且h1最好分为http1.1和其他版本。list和detail仍保持现状 ![alt text](image-6.png)
- [x] **已完成**（同 `a8a484a`/`3eaa14e`）list的host column，可以把path和host位置互换下，因为host可以用左侧来filter，所以path更显眼直观一点
- [x] **已完成**（2026-08-04，commit `c934c1c` + Export 按钮收尾）composer应该做成postman或proxyman这样的UI格式 ![alt text](image-7.png)
  - 实现：`apps/desktop/src/renderer/features/composer/` 下 CollectionPanel / DocumentTabs / RequestUrlBar / RequestPane / ResponsePane / ComposerMain / ComposerTabBar / KeyValueTable / ComposerStatusbar 等组件目录；设计稿 17 个 composer 场景（浅深共 34 张）全部落地，i18n 77 词条 × 15 语言、43 条 automation id 同步。
  - 与原计划的两处差异：① 协议只落 `collection.get` / `collection.replace` **两条**命令而非 4 条——整棵树读写 + 乐观并发 `revision`，不做树形表与增量命令，`architecture/feature-composer.md` 5.1 节已明确此简化；② 顺带扩了协议的 `ComposerTiming`，Core 新增 `TimingRecorder` 用 socket 事件采集 DNS/TCP/TLS/Request/Waiting/Download 六阶段，支撑 Timing 页签的分阶段条（原范围未列，但设计稿的 Timing 页要求）。
  - 编辑即生效已核实：无 Save 按钮、无 dirty 标记，600ms 节流整树写回，revision 冲突直接以 Core 版本重载。Body 的 Form 档由 Renderer 编码成 `x-www-form-urlencoded` 字符串，协议不变；`multipart/form-data` 如约不在本轮。
  - 收尾补做：Collection 工具栏第三个「Export collection」按钮此前遗漏，已补 `collection:export` IPC（Main 系统保存对话框写 JSON，数据本就在 Renderer 手上，不经过 Core）。
  - **仍欠验收资产**：`apps/desktop/tests/visual-parity/parity.config.mjs` 的 composer 段仍指向旧稿 `light/shell-v2/composer.png` 与旧 DOM 的 parity id，需按 `light/composer/` 新稿重写并重跑；packaged smoke 未实跑（本轮新增 3 条 collection IPC channel）。
- [x] **已实现**（2026-08-04）request和response的body preview应该针对不同的type，提供不同的格式切换以及代码高亮，而不是固定的json，auto感觉也不需要，默认用默认的适配的格式比如HTML、json、javascript等，然后预留text和hex就行了，json应该还可以支持tree view，可以右键复制object或value。js和css等文件应该有formatter代码高亮，png图片等应该有预览等等，针对每个格式应该有对应的preview，这个也要详细的记录进 feature 架构里。现在的组件如果不支持有什么比较权威的好的三方库可以支持display？

  - 实现位置：`components/BodyViewer/`（内核 + BodyToolbar / HexView / FormView / ImageView / JsonTreeView / MarkdownView / UnavailableBody）；Capture 侧外壳 `features/capture/RequestInspector/BodyView.tsx` 只管加载与 Save，Composer 响应体已改用同一内核。
  - 新依赖：`xml-formatter`（Monaco 无 XML 服务）、`react-markdown` + `remark-gfm`。Monaco 改用 `languages/features/{json,css,html,typescript}` 完整语言服务（带 formatter 与结构化折叠），并关掉全部诊断。
  - 阈值常量集中在 `packages/core-protocol/src/messages.ts`：`BODY_PREVIEW_MAX_BYTES` 5 MiB、`IMAGE_PREVIEW_MAX_BYTES` 16 MiB、`FORMAT_AUTO_MAX_BYTES` 2 MiB、`FORMAT_MAX_BYTES` 8 MiB。
  - 还没做：阈值 Settings 化（含给 `BodyReadRangeCommand` 加 `maxOutput`）、`multipart/form-data` 预览、`readRange` 内存分支的 `subarray` 放大 IPC。

  - 设计稿：`design/app/` capture 视图新增 17 个档位场景 × 浅/深共 34 张（`shots/<theme>/capture/body-*.png`），列表新增 png / 12 MB html / markdown / 超大图 / mp4 五条示例流量；点行切内容类型、点 Segmented 切查看档位，设计稿可直接手点验证。Composer 响应档位条与 WebSocket / gRPC 内联工具行同步改为派生档位。规范见 `design/design-system.md` 的「正文预览档位矩阵」。
  - **内容类型与查看档位必须是两个独立维度**（设计稿里是 `data-body-kind` + `data-body-mode`）。把两者混成一个枚举会直接出 bug：在 JSON 响应上点 Hex 会跳到另一条请求、HTML 点 Raw 会变成 JSON。实现时 Renderer 同样要把「当前 Exchange 的内容类型」与「选中档位」分开存，切档位不得改变 MIME/体积标签。

  - 现状问题（`BodyView.tsx` + `bodyContent.ts`）：

    | 问题 | 事实 |
    | --- | --- |
    | 档位与类型无关 | `auto/text/JSON/Hex` 写死，MIME 不参与 |
    | `auto` 偏向 JSON | 无条件先试 `formatJsonBody`，能 parse 就当 JSON —— 这就是"固定 json"的来源 |
    | 高亮粗糙、无结构化折叠 | `bodyLanguage()` 已按 MIME 选语言，但 `monacoSetup.ts` 除 JSON 外只引了 `languages/definitions/`（纯 tokenizer），**连 Monaco 自带的 CSS/HTML formatter 都没启用** |
    | 没有 formatter | 只有 JSON 美化，HTML/CSS/JS/XML 零处理，min.js 一行到底 |
    | **图片走 hex** | `isMediaMime` 只拦 `video/*`/`audio/*`，`image/png` 文本探测失败后落 hex dump |
    | **hex 是当前最重的渲染路径** | 5 MiB → 约 35 万行 → 约 25 MB 字符串塞进单个 `<pre>`，无 memo 无虚拟化，拖动 Inspector 分栏会因 `ResizeObserver` 重算整份 dump |
    | 无 JSON tree、无右键 | Monaco `contextmenu: false` |
    | Composer 另一套 | `ResponsePanel.tsx` 用 `<pre>` + 手写 `prettyBody`，不复用 CodeViewer |
    | `subarray` 放大 IPC | 见末尾「顺带要修的既有缺陷」 |

  - 核心认知：**"卡死"只发生在 Renderer 主线程**，Main 与 Core 全程只搬字节；全链路传的是 `Uint8Array`，**没有任何 base64/dataURL 转换**（DevTools 反而因 CDP 返回 base64 而多一层）。

    | 活 | 在哪 | 卡 UI |
    | --- | --- | --- |
    | Core 读字节、gzip 解压（`decodeBodyStream` 的 zlib 跑在 libuv 线程池） | Core 进程 | 否 |
    | IPC 搬运（两次 memcpy） | Main 进程主线程 | 否 |
    | **hex 拼字符串 + `<pre>` 排版** | **Renderer 主线程** | **是，秒级** |
    | **JS formatter 的 parse** | **Renderer 主线程** | **是，十秒级** |
    | `<img>` 图片解码 | Renderer 图片解码线程 | 否 |
    | Monaco language service | Monaco 自带 worker | 否 |

    推论：图片能"免费"离开主线程——Chromium 自带图片解码线程、延迟解码、按绘制尺寸光栅化、可丢弃缓存；**JS 解析没有这种免费午餐**，必须靠 worker。

  - 方案形态：拆 **viewer 内核**（吃 `(bytes, mediaType, truncated)`，不认识 hash/IPC）+ **BodyView 外壳**（管按需加载、decode 状态、截断提示、Save body）。Capture/WS/gRPC 用外壳，**Composer 同期收编直接用内核**（否则内核签名要返工）。

    档位矩阵（「默认档」= Segmented 初始选中项）：

    | 类型 | 默认档 | 候选 |
    | --- | --- | --- |
    | JSON / `+json` / ndjson | Pretty | Tree · Raw · Hex |
    | HTML / CSS / JS / XML | Code | Raw · Hex |
    | 图片（非 SVG） | Preview（`<img>`） | Hex |
    | `image/svg+xml` | XML 代码 | Hex（可执行 XML，默认不渲染） |
    | Markdown | Preview（富文本） | Split · Source · Hex |
    | 音视频 | 元信息 + Save | —（零读取，维持现状） |
    | `x-www-form-urlencoded` | 键值表格 | Raw · Hex |
    | 二进制（字体 / octet-stream） | Hex | Text · Hex |
    | 未知 | 内容探测决定 | Text · Hex |

    `auto` 档位删掉，但**探测逻辑保留**——它暗中承担着"未知 MIME 是文本还是二进制"的判定，只是从可见档位降级为默认档选择器。候选列表始终追加探测出的那一档，以容忍 MIME 谎报。

  - 图片档：

    | 条件 | 行为 |
    | --- | --- |
    | `encodedSize > IMAGE_PREVIEW_MAX_BYTES` | 元信息 + Save body，**连 IPC 都不发** |
    | `decodeStatus === 'limited'` | 元信息 + Save body（字节已到手但不完整） |
    | 否则 | `Blob` → `<img src=blob:>`；`onload` 读 `naturalWidth/Height` 显示尺寸；`onerror` 统一兜住 bomb/损坏/不支持格式；cleanup 里 `revokeObjectURL` |

    - 用 blob URL 不用 data URL：我们拿到的本来就是 `Uint8Array`，data URL 要多一次 base64（+33% 字节 + 一份字符串）；DevTools 用 data URL 只因 CDP 返回 base64。
    - 字节上限的作用不是防崩溃，是**防半张图**（截断字节喂给 `<img>` 比不显示更糟）+ 省 IPC。
    - gzip 图片无需额外代码（Core 已解好），但 `encodedSize` 是压缩后大小会低估，靠 `decodeStatus === 'limited'` 兜底。

  - Formatter 走 **Monaco 路线，Prettier 整个砍掉**：`languages/features/` 只有 `json/css/html/typescript` 四个 full service（带 formatter + 结构化折叠 + 自带 worker），正好覆盖 idea 点名的 HTML/JSON/JS/CSS；`typescript` 那 11.78 MB 对桌面应用可接受。三个实现要点：
    1. `monacoSetup.ts` 的 `WORKERS` 映射必须补 css/html/typescript，否则 label 静默落到 EditorWorker。
    2. `readOnly: true` 会禁用 `formatDocument` action → **在文本进 viewer 之前格式化**（临时 model + worker proxy），不要为此改 readOnly。
    3. 关掉诊断（`noSemanticValidation`/`validate:false`），否则白烧 worker CPU。

  - 选型：

    | 需求 | 方案 |
    | --- | --- |
    | 高亮 + 结构化折叠 + JSON/HTML/JS/CSS formatter | **Monaco `languages/features/` 四件套**，零新依赖、worker 现成 |
    | JSON 美化 | 继续用 `JSON.parse/stringify`（V8 原生，比走 Monaco worker 快） |
    | **JSON Tree 档** | **自建** + 已有的 `@tanstack/react-virtual`。Monaco 是编辑器，**折叠 ≠ 树**，它没有 tree view 这种 UI 形态；自建才能 1:1 套设计 token 并挂右键菜单 |
    | XML formatter | `xml-formatter`（~15 KB 零依赖，纯文本进纯文本出，着色仍走 Monaco tokenizer，不涉及设计还原） |
    | Markdown 富文本预览 | `react-markdown`（元素级组件映射 → 设计可 1:1；默认不渲染裸 HTML，天然防 XSS） |
    | 图片 | 零依赖 |
    | YAML / Markdown **formatter** | 不做。formatter 是重排 md/yaml **源文本**（对齐表格列、统一列表标记），与「渲染成富文本」是两回事；这两种格式不会被压缩，拿到就可读，只读 viewer 里整理源码没有价值 |

  - 阈值：

    | 阈值 | 值 | 说明 |
    | --- | --- | --- |
    | `BODY_PREVIEW_MAX_BYTES` | 5 MiB | 现有常量，**不动**——文本/WS/gRPC/Core decode 输出四处共用 |
    | `IMAGE_PREVIEW_MAX_BYTES` | **16 MiB** | 新增独立常量 |
    | formatter 自动 | **≤ 2 MiB** | |
    | formatter 按钮 | **2 – 8 MiB** | 带 loading，结果可丢弃 |
    | formatter 禁用 | **> 8 MiB** | 提示 Save body |

    阈值作用是**防用户干等**，不是防卡——Monaco 在 worker 里跑，但 TS parser 处理超大 min.js 仍是几十秒。已知边界：Core decode 分支硬编码 `BODY_PREVIEW_MAX_BYTES`，所以**被 gzip 的图片有效上限仍是 5 MiB**（图片几乎不被 gzip，可接受）。

  - 已否决的方案（避免重复讨论）：

    | 砍掉 | 理由 |
    | --- | --- |
    | Worker/Canvas 生成缩略图 | `<img>` + CSS 缩放视觉等价（Skia 本就按绘制尺寸光栅化），手工缩略反而丢 GIF/APNG 动画，且缩略前必须先完整解码，躲不掉内存峰值 |
    | Core 引 sharp 生成缩略图 | 原生依赖 + 打包复杂度，只有将来做"流量列表行内缩略图"才值得 |
    | 像素护栏 / 解 PNG-JPEG 文件头拿 W×H | 超大图的表现是解码失败破图而非进程崩溃；`onload` 的 `naturalWidth` 就能拿尺寸，`onerror` 一个分支兜住所有异常 |
    | Prettier | Monaco 四件套已覆盖且 worker 现成；桌面应用不在乎 TS service 的 11.78 MB |
    | 放宽 CSP | `react-markdown` 默认不渲染裸 HTML 所以不需要；唯一会诱使放开的 `img-src https:` 恰恰不该开（等于追踪像素 + 暴露"你在看这条流量"），远程图片应走"显示占位 + 手动加载" |
    | `multipart/form-data` 预览 | 独立一档，本轮不做（形态是 part 列表 + 对选中 part 递归套用同一个内核） |

  - 分期：
    1. 内核剥离 + 档位由 MIME 派生 + Composer 收编 + hex 虚拟化 + 阈值收敛到单一读取点。
    2. 图片档（16 MiB + `<img>` + revoke + SVG 例外）。
    3. Formatter（Monaco 四件套 + `xml-formatter` + 2/8 MiB 三档 + 可丢弃结果）。
    4. JSON tree + 右键复制 value/object/path。
    5. Markdown 预览——**卡在设计稿上**，需先按 `ui-design-mockup` 在 `design/app/` 画出富文本排版与 Split 布局；用 `react-markdown` 做元素级组件映射，上下分栏（Inspector 横向不够宽），不做滚动同步。
    6. 阈值 Settings 化：给 `BodyReadRangeCommand` 加 `maxOutput` 让 Core 不再 import"预览上限"这种 UI 概念，并合并 `feature-capture.md` 6.3 第 4 项那条既有待办（含 BodyView 问号按钮）。

  - 顺带要修的既有缺陷：`toHexDump` 无 memo 且 resize 会重算；图片不该走 1 MiB 分块读（必须完整才能解码）；`body-store.ts` 的 `readRange` 内存分支返回 `subarray` **视图**，V8 序列化 TypedArray 会连整块底层 ArrayBuffer 一起写，从 3 MiB 内存 body 读 64 KB 实际传 3 MiB——改造后分块读取变多会放大此问题。

  - 文档落点（本轮先不落）：`architecture/feature-capture.md` 第 10 节「预览上限」扩成「正文预览渲染矩阵」；`architecture/feature-composer.md` 标注复用 viewer 内核。

- [x] **已完成**（2026-08-04）进入时做一个酷炫的加载界面等待 proxy ready
  - 实现：`apps/desktop/src/renderer/app/BootScreen/` + `app/bootStore.ts`；设计稿为 `design/app/` 的 boot 视图（5 个阶段 × 明暗）。
  - 形态：全屏遮盖 shell，大 app icon + `conic-gradient` 渐变环绕圆弧 + mono 状态行 + 三个进度点；只保留窗口控制，卡住时仍可关窗。
  - 三步均为必备且**全自动**：`CoreProcessStatus.state` → `CaptureStatus.listening` → `SystemProxyStatus.owned`。系统代理改为直接接管（不再弹授权弹层），底部常驻告知文案；MITM 不属于启动流程。
  - 失败态给 `Open diagnostics` / `Enter anyway` / `Retry` 三个出口；只遮盖冷启动，运行期 Core 重启仍走 `ProxyReadinessDialog`。
  - 顺带：首次启动改为跟随系统语言（`matchSystemLanguage`），而不是硬编码英语。
- [ ] **部分完成**（2026-08-03，commit `b326bc3`）MCP server，先写package，不接入main或core，另外要落地详细架构文档
  - 已完成：`packages/mcp-server/` 认证 + 11 只读 / 7 写工具 + MCP 协议状态机（45 tests，零运行时依赖）；架构文档 `architecture/feature-mcp.md`。
  - 未完成：Main 侧 transport（named pipe / unix socket）、runtime 文件、`bridge.mjs`、Preload 窄 API、Settings 面板与审批弹层——即整条"接入 Main/Core"的链路。

- [ ] Breakpoint 交互重构（配置在 Rules、调试在 Breakpoints 两处分家，很别扭）。**依赖的 filter 重构已于 2026-08-03 落地（`3eaa14e`），此项已解锁。**

  - 现状问题：
    - 断点规则配置在 Rules 的一种 action；HTTP 总开关在 Breakpoints 页的 `Break on match`；WebSocket 断点开关却在 Capture 的 WS 消息面板 —— 同一能力三个入口、两种范式。
    - **命中完全无感知**：`useBreakpoints` 的轮询只在 `BreakpointsMain` 挂载时启动，侧栏无 badge。用户在 Capture 页时，真实流量被挂起 30s（默认 `timeoutMs: 30_000` + `onTimeout: 'continue'`）却零提示，表现为浏览器莫名卡死再自己恢复。这是事故级问题。
    - `PendingBreakpoint` 没有 `exchangeId`，断点和 Capture 行无法关联。但 `applyRulesToRequest` 里已有 `request.id`（正传给 `tracker.recordRuleOutcome`），顺着传进 `awaitBreakpoint` 即可。
    - Core 侧已有 `onBreakpointHit` 推送钩子，Renderer 没用，退化成 1s 轮询。
    - 右键建断点只生成 `enabled:false` 草稿并跳到 Rules 等用户手动 Apply —— 把"临时拦一下"做成了配置流程。

  - 主流工具参考：
    - Fiddler / mitmproxy：**主流量列表原地调试**，命中行变色标记，右侧 Inspector 直接编辑放行。
    - Burp：Proxy 工作区内 Intercept 子标签，与 HTTP history 并列，醒目的 `Intercept is on`。
    - Charles / Proxyman：断点是**独立于 Rewrite 的一类工具**，有自己的规则列表，命中弹独立窗口；流量右键可快捷加断点。
    - 共识：① 断点是独立工具而非混在 rewrite action 里；② 无论配置在哪，"有流量被挂住"必须在主流量视图立刻可见，没有工具让用户去另一个页面查岗；③ 总开关是工具栏级一等公民且唯一；④ 从流量右键一键加断点且**立即生效**。

  - UI 方案（引擎层保持 breakpoint 作为 RuleAction 不变，只改呈现层）：
    - **方案 A（推荐）断点是流量的一个状态，不是一个页面**：删侧栏 Breakpoints 导航；挂起的 exchange 在 Capture 列表原地显示 `Paused`（琥珀色 + 倒计时）；选中该行时 Inspector 切换为断点编辑模式（复用 `BreakpointEditor`，底部 Continue / Drop）；总开关升到 Capture Workbar 与 Record 同级并带 pending 计数，WS 开关合并进来。代价：Inspector 双模式复杂度上升，多断点的"队列感"要靠列表过滤补。
    - 方案 B（保守）：保留 Breakpoints 页，只补 App 级轮询 + 侧栏 badge + 通知跳转 + Workbar 开关。改动小但两处分家的困惑只被缓解。
    - 方案 C（Burp 模式）：Capture 工作区内 `Traffic | Paused (2)` 双 tab，共用工作区与选中态，Inspector 不用改双模式。

  - 快速创建断点的匹配粒度（**不为 filter 弹新界面**）：
    - 现状 matcher 是 `{ type:'url', mode:'exact', value: scheme+host+path }`（`toEndpointUrl` 剥掉 query，避免 token 明文落 `rules.sqlite` 且换 token 后失配 —— 这个决定要保留）。盲区：REST 路径参数 `/users/123` → `/users/456` 不命中；同 host 其他接口不命中；不区分 method 可能过宽。
    - 主流工具都在**创建那一刻让用户选粒度**（Charles path 支持 `*`，Proxyman 预填可编辑，Fiddler `bpu` 子串，Burp regex）。
    - 建议右键级联子菜单，一次点击直接生效：`This endpoint` / `This path prefix (…/*)` / `This host (host/*)` / `Custom…`（通往已有的 Rules 编辑器做多条件 AND、method 限定、超时策略、Request+Response 成对）。分层是"子菜单快捷 → Rules 编辑器精细"，不引入第三个界面。
    - 断点规则应**创建即 enabled 即 Apply**：rewrite 规则默认不启用是因为字段没填完，而断点 matcher 是从真实请求填出来的，不存在未填完。
    - **待 filter 重构后再评估**：`Break on current filter` —— "在看哪些流量"和"想断哪些流量"在语义上是同一个表达式（Burp intercept rules、mitmproxy `i <filter>` 本质如此），复用 Omnibox 最省 UI。风险是切换 filter 会静默改变断点范围，造成"只想换视角却改了断点"的意外。filter 新设计定稿后一并决策。

  - pause 对后续请求的影响（固有代价，非 bug，但必须让用户看得见）：
    - Core 层不阻塞：`applyRulesToRequest` 是 per-request async 回调，`BreakpointQueue` 用 Map 存多个 pending，每条独立 timer + Promise，并发挂起原生支持。
    - 客户端层会阻塞：HTTP/1.1 同连接队头阻塞；浏览器每 host 6 个并发连接，6 个请求被挂起后第 7 个根本发不出来（Capture 里连影子都没有）；挂住 HTML/关键 JS 时后续请求压根不产生；HTTP/2 稍好但依赖链照样停。用户看到的是"整站卡死"，这正是无感知挂起危险的原因。

  - 多断点处理（现在只有列表 + Continue all）：
    - **并发上限（必须）**：pending 超阈值（如 10）时新命中自动放行，状态栏提示 `Breakpoint queue full — N requests auto-continued`。否则一个命中埋点/轮询接口的断点就能把浏览器打死。
    - **Break once（最实用）**：命中一次后自动禁用该断点规则，专治高频接口，建议作为右键 Break 的默认。
    - 逐个放行节奏：Continue 后自动选中队列下一条（类似调试器连按 F5）。
    - 批量分层：`Continue all` / `Drop all` 之外加 `Continue all from this rule`。
    - 超时可见：倒计时已有 `formatCountdown`，但超时自动 continue 后要在状态栏/Diagnostics 留痕，不能静默。
    - Request + Response 成对断（Charles/Proxyman 默认行为）：模型是两条独立 action（`phase: request` / `response`），UI 要能表达"这个 exchange 断两次"且第二次能关联回同一行 —— 又指回 `exchangeId`。

  - 可先行、不受 filter 重构影响、不改导航结构的三件事（做完不返工）：
    1. 断点感知全局化：轮询/推送提到 App 级 + pending 计数 + 状态栏提示。
    2. 并发上限保护 + 超时留痕。
    3. `PendingBreakpoint` 增加 `exchangeId`，为后续任何方案铺路。