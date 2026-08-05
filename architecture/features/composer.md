# Feature: Composer

> 最后更新：2026-08-05
> Core 模块：`apps/proxy-core/src/proxy-core/composer/`、`apps/proxy-core/src/proxy-core/tls-probe/`
> Renderer 模块：`apps/desktop/src/renderer/features/composer/`
> UI 设计：`design/app/` 的 composer 视图（17 个场景 × 浅深共 34 张）与 `design/design-system.md` 的「Composer 工作区」一节，**已落地**。

## 1. 职责与边界

Composer 让用户手工构造并发送请求，Connection 提供独立的 TLS 握手探测。

| 归属 | 内容 |
| --- | --- |
| Composer 负责 | 构造请求、直接发出、采集完整响应与时序 |
| Connection 负责 | 只握手不发请求，读取协议/套件/ALPN/证书链 |
| 两者都不负责 | 经过代理监听端口、写入 Capture、应用 Rules |

**关键边界：Composer 请求不经过代理数据面。** 它由 `ComposerService` 直接发起，因此：

- 不出现在 Capture 列表中。
- 不受 Rules 影响。
- 不受 Recording 开关影响。

这是刻意设计：Composer 是调试工具，需要可预期的纯净行为。

## 2. 调用流程

### 2.1 发送请求

```mermaid
sequenceDiagram
    autonumber
    participant UI as Renderer Composer
    participant Main
    participant App as CoreApplication
    participant Svc as ComposerService
    participant Origin

    UI->>Main: composerSend(input)
    Main->>App: composer.send
    App->>Svc: send(ComposerRequestInput)

    Note over Svc: 未显式提供 timeout 时不设期限
    Svc->>Origin: 直接发起 HTTP/HTTPS 请求
    Origin-->>Svc: 响应头
    Note over Svc: 记录 TLS 握手信息<br/>完整证书链 + remoteAddress
    Origin-->>Svc: 响应体
    Svc-->>App: ComposerResponseOutput
    App-->>Main: 结果
    Main-->>UI: 状态 / 头 / 正文 / 时序 / TLS
```

采集内容：

| 类别 | 字段 |
| --- | --- |
| 响应 | statusCode、statusText、headers、body |
| 时序 | `ComposerTiming` 六阶段：dnsMs、tcpMs、tlsMs、requestMs、waitingMs、downloadMs |
| TLS | protocol、cipher、ALPN、authorized、完整去重证书链 |
| 网络 | remoteAddress、remotePort |

分阶段时序由 `TimingRecorder` 从 socket 事件推导，支撑 Timing 页签的分阶段条。
**未发生的阶段为 0**：明文请求没有 `tlsMs`，复用连接没有 `dnsMs` / `tcpMs`。

Renderer 历史记录不淘汰。

### 2.2 连接探测

```mermaid
sequenceDiagram
    autonumber
    participant UI as Renderer
    participant App as CoreApplication
    participant Svc as TlsProbeService
    participant Origin

    UI->>App: tls.probe(host, port)
    App->>Svc: probe(...)
    Svc->>Origin: tls.connect 只握手
    Origin-->>Svc: 证书链与协商结果
    Note over Svc: 不发送任何 HTTP 请求
    Svc-->>App: 协议 / 套件 / ALPN / authorized / 证书链
    App-->>UI: 展示
```

用于诊断 MITM 兼容性、证书链问题、ALPN 协商结果。

## 3. 数据契约

```ts
interface ComposerRequestInput {
  method: string;
  url: string;
  headers: readonly RuleHeaderPair[];
  body?: string;
  timeoutMs?: number;          // 缺省时不设期限
  ignoreCertificateErrors?: boolean;
}
```

命令：

| 命令 | 用途 |
| --- | --- |
| `composer.send` | 发送构造的请求 |
| `tls.probe` | TLS 握手探测 |

## 4. 与其他 feature 的关系

```mermaid
flowchart LR
    A["Capture 请求行"] -->|"未来：复制到 Composer"| B["Composer 草稿"]
    B --> C["composer.send"]
    C --> D["独立结果面板"]
    E["Settings 证书面板"] -->|"诊断入口"| F["tls.probe"]
```

当前 Composer 与 Capture 之间没有直接联动。若未来支持"从 Capture 复制到 Composer"，必须明确复制的是客户端原始请求还是发往 Origin 的最终请求。

## 5. UI 与 Collection

Composer 已按设计稿落地为 **`Collection 分栏 / splitter / 工作区`**，工作区纵向为 `文档标签条 · URL 行 · 请求编辑区 · splitter · 响应区`；请求集合跨启动持久化。

### 5.1 Collection 已实现链路

| 层 | 新增内容 |
| --- | --- |
| Core | `workspace/entry.ts` 的 `WorkspaceService.loadCollection` / `saveCollection`，与 RuleSet 完全同构：`collection_tree` 单行表 + 整棵树存一个 JSON + 乐观锁 revision |
| Protocol | 只有 `collection.get` 与 `collection.replace` 两条命令 |
| Preload | `getCollection()` / `replaceCollection(expectedRevision, tree)` / `exportCollection(nodes, title)` |
| Renderer | 目录树、行内重命名、选中目录作为新建目标、多请求文档 tab |

**为什么不做树形表和增量命令**：Collection 只有几十到几百条，整棵树序列化成 JSON 的开销可以忽略。做成 `collection_tree` 单行表后，父子关系、排序字段、`upsert`/`remove`/`move` 三条增量命令与它们各自的并发语义全部不需要存在，读写只有"读整棵树"和"写整棵树"两条路径。

**编辑即生效**：文档 tab 就是 Collection 里的条目，改动直接写回，没有保存动作、没有未保存标记、没有 Save 按钮；Send 用的就是当前状态。`+` 新建时直接在选中目录下创建一条 `Untitled`。写入由 Renderer 节流，避免每次按键都落库。

**共享目录树与拖拽**：Collection 与 Rules 直接复用 `packages/core-protocol/src/tree.ts` 和
`components/share/useTreeDrag.ts`。请求与目录整行可拖，目录悬停自动展开，移动是
`removeNode + insertNode`；目录最多 3 级，拖拽不给超深落点，第三级目录的 New subfolder
和工具栏 New folder 同时禁用，store 也拒绝越界写入。Collection 不保留自己的
`findRequest` / `replaceRequest` / `removeNode` 等重复实现。

**导出**：工具栏的 `Export collection` 走 `collection:export`，由 Main 弹系统保存对话框并把整棵树写成 JSON。集合数据本来就在 Renderer 手上，这条路径不经过 Core。

### 5.2 Recent sends

URL 行的 `Recent sends` 是**重放记录**，与 Collection 是两件独立的事，不互相写入：列出最近发送的 method / URL / 状态码 / 相对时间，点击恢复为请求。是否持久化待定；只存内存即可满足设计稿表达。

### 5.3 请求 Body 的四档

| 档位 | 形态 | 协议影响 |
| --- | --- | --- |
| None | 占位文案，无编辑器 | `body` 不传 |
| JSON | 可编辑 Monaco，Format 调 Monaco 自带格式化 | 无 |
| Text | 同上，语言为 plaintext，Format 禁用 | 无 |
| Form | 第三张 KV 表 | Renderer 编码成 `a=1&b=2` 字符串，**协议不变** |

**`multipart/form-data` 传文件不在本轮范围**：`ComposerRequestInput.body` 只接受 `string`，要传二进制必须先扩协议。

### 5.4 响应 Body 复用 Capture 的查看器内核

`ResponsePane/ResponseBodyPane` 直接渲染共享内核 `components/BodyViewer/`，与 Capture Inspector 是**同一实现**：
档位由响应 MIME 派生（JSON `Pretty/Tree/Raw/Hex`、代码 `Code/Raw/Hex`、图片 `Preview/Hex` …），
Format、JSON Tree 右键复制、Hex 虚拟化与四个阈值常量全部一致。完整矩阵见
[capture.md 10.2](capture.md)，此处不重复。

Composer 与 Capture 的差别只在**外壳**：Capture 侧的 `BodyView` 要按需拉字节、跟踪解码与截断状态、驱动
Save body；Composer 的响应正文随 `composer.send` 一次性返回，外壳只把字节交给内核。因此内核签名是
`(bytes, mediaType, truncated)`，不认识 hash 与 IPC——Composer 在同期收编就是为了避免内核签名事后返工。

### 5.5 Renderer 组成

`features/composer/` 下每个组件一个文件、各配同名 CSS Module：`ComposerMain`（两处 splitter 与响应式 clamp）、`CollectionPanel` + `CollectionTreeNode` / `RenameRow` / `FolderMenu`、`DocumentTabs`、`RequestUrlBar` + `RecentSends`、`ComposerTabBar`（请求区与响应区共用）、`KeyValueTable`（Query / Headers / Form 三处共用）、`RequestPane` + `BodyPane` / `AuthPane`、`ResponsePane` + `ResponseBodyPane` / `ResponseHeadersPane` / `ResponseCookiesPane` / `ResponseTimingPane` / `ResponseSection` / `ResponsePlaceholder`。

**设计稿的 216px / 368px 只是初始值**：Collection 宽度与响应区高度都可拖拽，上限由对侧最小尺寸推导（`总宽 − MIN_WORK_WIDTH − 轨道宽`），`ResizeObserver` 在窗口缩放时重新 clamp；行高、控件尺寸、弹层宽度这类结构尺寸沿用设计稿固定值。

## 6. 验收要点

- [ ] Composer 请求不出现在 Capture 列表。
- [ ] Composer 请求不受启用的 Rules 影响。
- [ ] 未设 timeout 的长请求不被强制中断。
- [ ] TLS 证书链完整且已去重。
- [ ] `tls.probe` 不产生任何 HTTP 流量。
- [x] Collection 整行拖拽保留完整子树，且移动/新建均不能超过 3 级目录。
