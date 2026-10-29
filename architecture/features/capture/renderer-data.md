> 返回 [Capture 索引](README.md)

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
- **计数徽标统一使用request单位，不显示选项或类别数量**：
  - 组头读取同一次facet遍历派生的`requestCount`，统计能归入该组任一取值的request；同一request在同组只计一次。
  - All显示当前录制完整快照的request总数；选项显示命中该取值的request数量。统计源仍为完整`rows`，不随搜索或其他facet选择改变，不等同于筛选后的可见行数。
  - Rule组只计有规则命中的request；一条request同时命中多条规则时不能把各选项count相加作为组总数。All仍包含无规则命中的request。
  - 零值Pending入口不贡献request数，Clear后所有组头归零。选项保留、首次出现顺序、折叠与筛选行为不变。
- Clear 成功把 `rows` 置空时，facet snapshot 必须立即同步为空；节流只约束非空实时更新，不能让列表
    已显示 `0 of 0` 时分栏仍短暂保留旧 app id、选项与计数。
- 产品按钮、Agent和MCP的Clear都在Main取得清理开始时间，并只在`capture.cleanup{all}`成功后广播
    `capture:reset { clearedBefore }`。Renderer统一以该时间边界清空rows、selection、搜索、全部facet、
    facet展开状态（回到只展开Application）与Rules hits；旧分页和`startedAt <= clearedBefore`的迟到事件
    不得回填，清理开始后到达的新流量仍可进入当前视图。并发Clear乱序完成时cutoff只允许单调增加；旧reset
    不得再次删除较新cutoff之后已经进入Store的rows。
- 哨兵值用 `\u0000` 前缀（`UNKNOWN_FACET_VALUE` / `FAILED_FACET_VALUE` / `PENDING_FACET_VALUE`），
  与真实 host、状态码字符串不可能碰撞。
- 搜索仍只匹配 `host + path`，是独立维度，不计入 `hasActiveFilter` 的 badge；工具栏的“清空筛选”只重置
  facet，完整 Clear 记录会同时重置搜索与全部 facet，列表回到未过滤状态。

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
