# Feature: Diagnostics

> Core 模块：`apps/proxy-core/src/proxy-core/core-diagnostics.ts`、`apps/proxy-core/src/proxy-core/diagnostics/`
> Renderer 模块：`apps/desktop/src/renderer/features/diagnostics/`

## 1. 职责与边界

Diagnostics 把 Core、Main、Renderer 三个进程的结构化记录汇入同一持久化存储，提供查询、分析与脱敏导出。

| 归属 | 内容 |
| --- | --- |
| Diagnostics 负责 | Trace/Action 结构化记录、持久化、分页查询、脱敏导出 |
| Diagnostics 不负责 | 业务正确性判断、告警、远程上报 |

**硬约束：日志失败绝不阻塞业务。** Diagnostics 写入失败只计数，不阻塞或回滚 Capture 写入，也不递归回灌同一 sink。

## 2. 存储隔离

```mermaid
flowchart LR
    A["Capture 数据"] --> B["内存 + spill<br/>无 SQLite"]
    C["Diagnostics 记录"] --> D["独占 diagnostics.sqlite<br/>常驻 Worker 线程"]
    B -.->|"完全隔离"| D
```

Capture 与 Diagnostics 使用完全独立的存储路径与线程，互不影响。

## 3. 三进程汇入

```mermaid
sequenceDiagram
    autonumber
    participant Renderer
    participant MainD as MainDiagnostics
    participant App as CoreApplication
    participant CoreD as CoreDiagnostics
    participant Host as DiagnosticsWorkerHost
    participant Worker as Diagnostics Worker
    participant DB as diagnostics.sqlite

    Note over CoreD: Core 组件直接记录
    CoreD->>Host: record(entry)

    Note over Renderer: Renderer 经窄 API
    Renderer->>MainD: 上报
    MainD->>App: diagnostics.ingest
    App->>CoreD: 转交

    Note over MainD: Main 自身记录
    MainD->>MainD: 串行队列
    alt Core 已连接
        MainD->>App: diagnostics.ingest
    else Core 断开
        MainD->>MainD: 保留全部记录
        Note over MainD: 新代际 running 后续传
    end

    Host->>Worker: 批量投递
    Worker->>DB: 批量事务写入
    Note over Worker: 失败只计数<br/>不阻塞不回滚
```

`MainDiagnostics` 是完整串行队列。Core 断开期间不丢弃记录，等新代际 Core 进入 running 后续传。

## 4. 记录模型

### 4.1 DiagnosticsRecorder

各组件通过注入的`DiagnosticsRecorder`记录关键节点，契约位于`@interceptor/core-protocol`。Core由`CoreDiagnostics`实现，运行于Main的平台package由`MainDiagnostics`实现，不反向导入Main类：

```ts
interface DiagnosticsRecorder {
  info(phase: string, fields?: DiagnosticsFields): void;
  warn(phase: string, fields?: DiagnosticsFields): void;
  error(phase: string, fields?: DiagnosticsFields): void;
}
```

未注入时降为 no-op，便于单测直接 `new`。

### 4.2 关键节点

| 组件 | phase |
| --- | --- |
| `CoreRpcServer` | `rpc.connected`、`rpc.connection-failed`、每命令一条 `command.completed` |
| `CoreApplication` | `core.started`、`core.stopping`、`storage.ready`、`diagnostics.ready` |
| `ProxyService` | `proxy.listening`、`proxy.stopped`、`tls.reconfigured`、`tls.client-error`、`capture.persist-failed`、`exchange.aborted`、`exchange.server-error` |
| `CaptureService` | `storage.ready`、`storage.error` |

命令级精简为单条 `command.completed`。`diagnostics.recent` 与 `diagnostics.query` 本身静默，避免轮询自污染。

### 4.3 Trace 与 Action

`CoreDiagnostics` 用 `AsyncLocalStorage` 维护当前 Trace 上下文，命令执行期间的 Action 自动归属该 Trace，形成可展开的时间线。

### H2事件采集范围

- 当前Diagnostics不提供完整H2协议帧及逐请求关联；这不是另一项已确认的H2转发故障，不影响既有H2转发和HTTP层捕获。本节只说明当前能力边界，不承诺新增采集功能。
- `ProxyService`的HTTP增量、trailer、abort及TLS/client-error不等同于完整SETTINGS、RST_STREAM或GOAWAY帧。测试源站的`onOriginStream`不能作为生产来源，也不能用会缓冲完整正文的completed事件替代。
- Node公开API可以读取连接当前状态和参数，无需补丁；`remoteSettings`与`goaway`能观察真实接收事件，`localSettings`表示SETTINGS已获确认。从首个stream才订阅session可能错过初始SETTINGS；`close`及`rstCode`不能还原完整RST_STREAM事件或推定收发方向。NO_ERROR不等于全部stream成功，CANCEL不能自动归因为用户操作。
- Mockttp的公开请求订阅和`rule-event`未提供H2 session/stream与request id绑定，Node stream channel也不提供Mockttp request id。不能按URL、headers内容或时间为并发请求猜配关系。
- `toRendererDiagnosticRecord()`采用白名单，现有`attributes`并不自动进入Renderer；Core写入任意属性不代表用户能在Diagnostics中看到它。

## 5. 查询流程

```mermaid
sequenceDiagram
    autonumber
    participant UI as DiagnosticsProvider
    participant Main
    participant App as CoreApplication
    participant Worker as Diagnostics Worker

    loop 2s 轮询
        UI->>Main: queryDiagnostics(filter, cursor)
        Main->>App: diagnostics.query
        App->>Worker: 分页查询
        Worker-->>App: 记录 + nextCursor
        App-->>UI: 页数据
        Note over UI: 按 process + timestamp + sequence 去重
    end

    UI->>Main: 加载更旧记录
    Note over UI: 递减 id keyset cursor
```

支持的过滤条件：`process`（core/main/renderer）、`trace`、`command`、`level`、`outcome`、`duration`。

默认拉取 200 条，过滤变化时重查首页。

## 6. 保留策略

**不按数量、字节或时长淘汰。** Core 内存、待写队列与 SQLite 均无淘汰逻辑。

这是刻意选择：调试工具的日志一旦被淘汰就失去排障价值。容量管理交给用户显式清理。

## 7. 脱敏

双层脱敏：

```mermaid
flowchart LR
    A["原始记录"] --> B["入库前脱敏<br/>CoreDiagnostics"]
    B --> C["diagnostics.sqlite"]
    C --> D["导出前再次脱敏<br/>redactRecordForExport"]
    D --> E["JSONL 文件"]
```

脱敏对象：敏感键名、凭据片段、URL query。

**绝不序列化完整 Command payload 或 Body 到日志。**

## 8. 导出

```mermaid
sequenceDiagram
    autonumber
    participant UI as Renderer
    participant Main
    participant App as CoreApplication
    participant Jobs as TransferService
    participant FS as 文件系统

    UI->>Main: 导出诊断
    Main->>Main: 系统 Save Dialog
    Main->>App: diagnostics.export.start(jobId, filePath, filter)
    App->>Jobs: 复用共享任务管理器
    loop 分页读取
        App->>App: 按 process/level/outcome 过滤
        App->>App: redactRecordForExport
        App->>FS: 逐行写 JSONL 临时文件
    end
    App->>FS: fsync
    App->>FS: 原子替换
    App-->>UI: job 快照
```

Renderer 只拿到 job 快照，没有路径。

## 9. Agent / MCP 查询 Tool

`diagnostics_query`是Diagnostics feature的持久化分页查询Tool，复用正式`diagnostics.query`命令与共享registry
schema，不增加Agent专用IPC、第二份日志存储或Renderer后门。它是只读query，在Agent Session的Ask与Auto模式下
都直接执行，不显示change审批。

- 支持`cursor`、`limit`、`process`、`level`、`outcome`、`traceId`、`command`、`minDurationMs`与
    `maxDurationMs`过滤；参数边界只由共享Tool schema校验；
- 结果保持Core返回的稳定顺序、`nextCursor`、`hasMore`与`droppedCount`，不在Agent层重新排序或补造记录；
- `diagnostics.query`继续属于静默命令，Tool查询自身不得生成新的Diagnostics记录；
- Model只能看到已由Core入库前脱敏的结构化记录。命令payload、请求URL、header与正文不得因Tool接入而进入结果；
- Transcript使用typed摘要显示记录数、是否还有更早记录与丢弃数，不展开完整attributes。

### 9.1 当前快照与导出Tool

三项与`diagnostics_query`共用唯一registry、Agent/MCP独立授权和正式Diagnostics/Transfer owner。

- `diagnostics_get_trace`为query，仅接受非空`traceId`，复用`diagnostics.recent { limit: 200, traceId }`；
    返回原traceId、records与droppedCount，不宣称这是超过200条的完整trace，不改顺序或补造记录。
    Recent/Trace只读当前Core代际的内存记录，保持原有从旧到新的顺序；持久化历史与最新优先分页仍由
    `diagnostics_query`负责，不能把两者当成同一种快照。
- `diagnostics_get_recent`为query，仅接受可选1..200整数limit，默认200；复用`diagnostics.recent`并返回
    records与droppedCount。两项在Ask/Auto都不审批，查询本身保持静默，调用预取消不触达Core。
- 两项只返回正式脱敏记录，沿用Core入库前处理；参数不接受本地路径或任意日志文件读取。未知trace返回
    正式空列表，不查询其他trace作为fallback；断连/错误不伪造成功记录。
- `diagnostics_export`为独立change，仅接受正式`process`、`level`、`outcome`可选过滤，不接受文件路径、
    jobId、cursor或模型提供的JSONL内容。Ask Deny不打开Save Dialog，Allow/Auto仍使用真实原生选择。
- UI和Tool复用同一Main导出入口；选择前后检查取消，迟到选择不能启动写入。Core继续使用现有分页、
    双层脱敏与原子JSONL写入，不复制第二套导出器。已启动任务沿用正式Transfer lifecycle，不由断开聊天
    隐式取消；后续显式任务取消使用独立`capture_cancel_transfer_job`意图。
- 原生取消返回`started:false`；启动后返回`started:true`与公开job快照，只包含正式身份、状态、进度/计数
    和警告数量，不包含路径、文件名、正文或可变message/warnings内容。任务启动不等于文件导出成功，摘要必须明确区分。
- 导出摘要先显示状态，再显示长jobId，避免关键信息被尾部省略。

详见[真实规格](../../apps/desktop/tests/e2e-workflow-tests/docs/diagnostics.md#diagnostics-tools-queries-export)。

## 10. 性能约束

- 结构化日志的对象分配与 IPC 批次有成本，必须限制 attributes 数量。
- 低优先级记录可采样。
- 记录必须非阻塞。

## 11. 验收要点

- Core 断开期间 Main 记录不丢，恢复后完整续传。
- Diagnostics 写入失败不影响 Capture。
- 敏感 attribute 与 URL query 在库中与导出文件中均已脱敏。
- 轮询查询自身不产生新记录。
- keyset 分页在大数据量下稳定，无重复无遗漏。
- Agent通过共享query读取真实记录，遵守过滤、顺序、脱敏和权限契约；重启不重放查询。
