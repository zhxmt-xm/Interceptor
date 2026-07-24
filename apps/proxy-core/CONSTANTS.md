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
| `RULES_DB_FILE` | `'rules.sqlite'` | 低频持久 RuleSet 库名 |
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
| `rulesDatabasePath` | `dataDir + RULES_DB_FILE` | Core 直接打开的低频持久 rules.sqlite |
| `captureTempDirectory` | `dataDir + CAPTURE_TEMP_DIR` | 当前 Core 临时 Body spill 目录 |
| `diagnosticsDatabasePath` | `dataDir + DIAGNOSTICS_DB_FILE` | Diagnostics Worker 打开的 diagnostics.sqlite |
| `archiveWorkerEntry` | `__dirname`/`cwd` 解析 | 按需启动的 `archive/worker/entry.cjs` |
| `diagnosticsWorkerEntry` | `__dirname`/`cwd` 解析 | `diagnostics/worker/entry.cjs` |

## 命名约定

1. **实例名与类名一致**：通过 `new X()` 创建的实例/字段名用 `X` 的 camelCase 全名以提升可读性
   （如 `new StorageService()` → `storageService`、`new CaptureEventQueue()` → `captureEventQueue`）。
2. **`Core` 前缀类去前缀**：类名以 `Core` 开头时，实例/字段名去掉 `Core`
   （如 `new CoreDiagnostics()` → `diagnostics`、`new CoreRpcServer()` → `rpcServer`）。
3. **语义明确的简单名可保留**：像 `host` 这类在其作用域内含义明确、简单直接的名字可以保留。
4. **接口命名一致、优先删除单实现接口**：接口命名与其角色/实现保持一致；只有单一实现的接口优先删除,
  直接使用具体类（如删除 `DiagnosticsLog` 接口，直接用 `DiagnosticsWorkerHost`）。
5. **组合根集中、装配处避免闭包**：`CoreApplication.bootstrap` 是唯一组合根（按运行期变量装配
   服务并启动）；装配子对象时注入协作者/宿主（application）而非闭包回调——CoreRpcServer 注入
   实现 `CoreRpcHost` 的 CoreApplication，CoreDiagnostics 注入 `DiagnosticsSink`（Diagnostics
   Worker host），ProxyService 注入 `CaptureEventSink`（捕获事件队列）。

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

真实的生产装配参数不属于“测试注入”，保留：`CaptureSink` / `CaptureEventSink`（ProxyService）、
`DiagnosticsSink`（CoreDiagnostics）、`CoreRpcHost`（CoreRpcServer）、`CoreApplicationOptions`
（bootstrap 装配、测试注入替身），以及 `initializeRuntime` 设定的运行期变量。
