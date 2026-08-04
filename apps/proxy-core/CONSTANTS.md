# Proxy Core 常量与约定

本文件是 `@interceptor/proxy-core` 全部常量与运行期配置的总览，以及命名与单元测试约定的
权威记录。跨模块运行期常量位于 `src/proxy-core/constants.ts`；模块私有常量位于对应
`<module>/<module>-constants.ts`，每个取值仍只有一个代码来源。

## 静态常量清单

跨模块/运行期静态常量集中在 `src/proxy-core/constants.ts`，生产代码从中 import，单元测试用
`vi.mock` 覆盖，不向构造函数注入仅测试用的参数。

| 常量 | 值 | 用途 |
| --- | --- | --- |
| `HEARTBEAT_INTERVAL_MS` | `1_000` | CoreApplication 向 Main 发 heartbeat 的间隔 |
| `EVENT_FLUSH_INTERVAL_MS` | `50` | 捕获事件批量 flush 间隔 |
| `EVENT_INFLIGHT_WINDOW_SIZE` | `8` | 同时在途、等待ack的批次数；队列总量不限 |
| `EVENT_DRAIN_BATCH` | `200` | 单次从捕获事件队列取走的最大事件数 |
| `WORKSPACE_DB_FILE` | `'workspace.sqlite'` | 低频持久工作区配置库名（RuleSet、Composer 集合） |
| `CAPTURE_TEMP_DIR` | `'capture-temp'` | 当前 Core 代际的临时 Body spill 目录 |
| `BODY_MEMORY_THRESHOLD_BYTES` | `1 * 1024 * 1024` | Body 从内存切换到 spill 的阈值 |
| `DIAGNOSTICS_DB_FILE` | `'diagnostics.sqlite'` | 诊断数据库文件名（dataDir 下） |
| `DEFAULT_PROXY_HOST` | `'127.0.0.1'` | 显式代理默认绑定的 loopback 地址 |

模块私有常量：

| 文件 | 常量范围 |
| --- | --- |
| `har/har-constants.ts` | HAR 无损分页、导入批次与正文读取 chunk 大小 |
| `proxy/proxy-constants.ts` | 终态集合、可解码 content-encoding |

## 运行期变量（读 process.argv / __dirname，entry 初始化）

依赖 `process.argv` 与 `__dirname` 的值集中为 `constants.ts` 的模块级可变变量（`export let`），
由 entry 启动时调用 `initializeRuntime(process.argv)` 一次确定（确保 worker bundle 路径正确），
其余模块直接 import 只读使用，避免 `dataDir`、worker 路径经多层构造函数透传。

| 变量 | 来源 | 用途 |
| --- | --- | --- |
| `dataDir` | `--data-dir=` | 存储根目录；null 时无存储模式 |
| `appVersion` | `--app-version=` | 捕获会话元数据；ProxyService 读取 |
| `workspaceDatabasePath` | `dataDir + WORKSPACE_DB_FILE` | Core 直接打开的低频持久 workspace.sqlite |
| `captureTempDirectory` | `dataDir + CAPTURE_TEMP_DIR` | 当前 Core 临时 Body spill 目录 |
| `diagnosticsDatabasePath` | `dataDir + DIAGNOSTICS_DB_FILE` | Diagnostics Worker 打开的 diagnostics.sqlite |
| `archiveWorkerEntry` | `__dirname`/`cwd` 解析 | 按需启动的 `archive/worker/entry.cjs` |
| `diagnosticsWorkerEntry` | `__dirname`/`cwd` 解析 | `diagnostics/worker/entry.cjs` |

## 命名约定

1. **名字与类型名一致**：指向某个类实例的变量、字段、构造函数/方法参数、对象属性，
   一律用该类名的 camelCase 全名（`new CaptureService()` → `captureService`、
   `connection: RpcConnection` → `rpcConnection`、`controller: AbortController` → `abortController`、
   `db: DatabaseSync` → `databaseSync`）。**类型名的简称不可接受**：`jobs: TransferService` 必须写
   `transferService`，`store: ExchangeStore` 必须写 `exchangeStore`。`Core` 前缀不作特例
   （`new CoreApplication()` → `coreApplication`、`CoreDiagnostics` → `coreDiagnostics`）。
2. **测试同样适用**：fixture、测试替身、局部变量都与其类型同步
   （`new BodyWriterFixture()` → `bodyWriterFixture`、`new RecordingCaptureService()` →
   `recordingCaptureService`、`new FakeRpcPort()` → `fakeRpcPort`）。
3. **名字承载类型名没有的信息时保留**：当名字回答的是"哪一个/什么角色"而不是"什么类型"，
   保留语义名（`mainWindow: BrowserWindow`、`coreProcess: UtilityProcess`、
   `insertStatement: StatementSync`、`downloadAbortController`）。同作用域多个同类实例必须靠
   名字区分（`first`/`second`、`exportHost`/`importHost`、`requestWriter`/`responseWriter`）。
4. **通用容器与数据字段按语义命名**：`Map`/`Set`/`Promise`/`RegExp`/`TypedArray` 等容器名表达
   内容（`zipByName`、`ruleIds`、`referenced`）；DTO 与协议字段是数据契约，不套用实例命名
   （`entries: ZipCentralEntry[]`、`query: URLSearchParams`、`options: XxxOptions`）。
5. **模块 entry 主类统一 `Service` 后缀**：每个模块目录的 `entry.ts` 只导出一个 `<模块名>Service`
   （`capture/` → `CaptureService`、`workspace/` → `WorkspaceService`、`tls-probe/` → `TlsProbeService`）。
6. **依赖具体类，不写镜像它的结构接口**：每个模块只有一个长期实例，协作者的类型就写那个类
   （`CaptureService`、`CaptureEventQueue`）。窄化接口会破坏 go-to-definition、掩盖实际运行的实现；
   测试替身改用 `extends` 真实类 + `override` 被断言的方法。`interface` 只用于纯数据形状。
7. **组合根集中、装配处避免闭包**：`CoreApplication.bootstrap` 是唯一组合根（按运行期变量装配
   服务并启动）；装配子对象时注入协作者/宿主（application）而非闭包回调——CoreRpcServer 注入
   实现 `CoreRpcHost` 的 CoreApplication，ProxyService 注入 `CaptureService` 与 `CaptureEventQueue`。

### 执行改名的工具约束

- **跨文件改名一律用编辑器的语言服务重命名**，它会同步 import、解构别名和 `{ signal }` 简写。
- 单文件内可用正则，但词边界必须排除 `-` `/` `.`（否则会改坏 `breakpoint-queue` 这类 import 路径
  与 `x.signal` 属性访问），且**字符串/注释里出现同词时禁止整词替换**，改用精确模式
  （`const x = new T(`、`x.`）逐条替换后 grep 复核。
- 任何脚本化文本替换必须显式 UTF-8 写入（PowerShell `Set-Content` 默认 ANSI，会不可逆破坏
  中文注释），改完后重新以严格 UTF-8 解码全部文件校验。


## 单元测试约定：不向构造函数注入测试参数

生产构造函数**不接收仅供测试的注入参数**。需要在测试中改变行为时，用以下手段替代：

- **数值/路径常量** → 用 `vi.mock('.../constants')` 覆盖。需按用例变化时用
  `vi.hoisted` 持有一个可变对象并以 getter暴露常量（如Body spill阈值）。
- **Worker 通道与路径** → 起真实 `worker_threads` Worker 测试，不注入假通道。测试调
  `initializeRuntime(['--data-dir=<temp>'])` 设置运行期变量，`constants` 的 `resolveWorkerEntry`
  自解析已构建 bundle（生产用 `__dirname`，源码运行回落到工作区 `dist`）；这类测试需先
  `npm run build`，bundle 缺失时跳过。
- **时钟/随机源** → 生产直接用 `Date.now()` / `crypto.randomUUID()`；需要确定性时在测试里用
  `vi` 的时间/spy 能力，而非注入 `now`/`generateId`。
- **回退/副作用** → 如诊断 sink 失败回退写 stderr，测试 `vi.spyOn(process.stderr, 'write')` 断言，
  而非注入 `fallback`。

真实的生产装配参数不属于“测试注入”，保留：`CaptureService` / `CaptureEventQueue`（ProxyService）、
`DiagnosticsSink`（CoreDiagnostics）、`CoreRpcHost`（CoreRpcServer）、`CoreApplicationOptions`
（bootstrap 装配、测试注入替身），以及 `initializeRuntime` 设定的运行期变量。
