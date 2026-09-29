# 平台架构：Core 模块结构与存储

> 范围：Proxy Core 进程的组合根、模块组织约定，以及跨 feature 的存储所有权划分。
> 单个feature的数据模型见`../features/`中的对应文档。

> Capture/Body 直接属于当前 Core UtilityProcess；**活动抓包不使用 SQLite，也没有常驻 Storage Worker**。
> Renderer 只持有全量轻量 summary，不接触 SQL、临时文件或完整正文。

## 1. 进程启动与注入

- **数据目录注入**：Main `CoreRuntime.launchCoreProcess` fork Core 时传 `--data-dir=<userData>/storage`；`entry.cts` 据此构建 `CaptureService` 与 `DiagnosticsService`（内部组合 `DiagnosticsWorkerHost`，缺省则无存储模式）。`entry.cts` 用 try/catch 包住组合根装配与启动，失败时向 Main 发 `fatal` 生命周期消息并置非零退出码。
- **根证书合并**：`entry.cts` 在 `initializeRuntime()` 后调用 `core-ca-certificates.ts` 的 `installDefaultCaCertificates()`，把 `bundled + system + extra` 合并后 `tls.setDefaultCACertificates()`。MITM 下由 Core 校验源站证书，而 Node 默认只信内置 bundle，企业根 CA 不在其中；**不能改用 `--use-system-ca`，那是替换而非合并**。

## 2. 模块组织约定

`apps/proxy-core/src/proxy-core/<module>/` 下当前有 archive / capture / client-app / composer / diagnostics / grpc / har / proxy / rules / tls-probe / transfer / workspace。

每个模块以真实的 `entry.ts` 门面为根，**Service 类直接写在 `entry.ts` 里**，且一个模块只导出一个 `<模块名>Service`。模块目录下只有 `entry.ts`、`README.md` 和子目录：

| 位置 | 内容 |
| --- | --- |
| `internal/` | 该模块拥有的实现类，一文件一个 class，**文件名与类名都不带模块前缀** |
| `internal/errors.ts` | 该模块全部 Error 子类，集中一个文件 |
| `internal/constants.ts` | 模块常量（跨模块常量在 `proxy-core/constants.ts`） |
| `interfaces/index.ts` | 显式 `interface` / `type` 声明 |
| `utils/index.ts` | 无状态函数 |
| `tests/` | 该模块测试 |
| `host/`、`worker/` | worker 线程相关，各自也有 `entry.ts` |

协作者的类型直写具体类（`CaptureService`、`CaptureEventQueue`），不写镜像它的结构接口——每个模块只有一个长期存活实例，narrowing interface 会破坏 go-to-definition。完整约定见仓库根 `AGENTS.md` 的 *Proxy Core Module Structure*。

生产构造函数不接收仅测试用的注入参数；单元测试用 `vi.mock` 覆盖常量、用真实 Worker 覆盖通道，详见 `apps/proxy-core/CONSTANTS.md`。

## 3. 存储所有权

共享平台状态不属于业务profile：CA由Main平台模块保存于Windows `%LOCALAPPDATA%/Interceptor/certificates`或macOS `~/Library/Application Support/Interceptor Platform/certificates`，safeStorage加密私钥；系统代理恢复journal使用同一用户级根目录的`system-proxy/journal.json`（Windows根目录为`Interceptor`）。启动仅补缺失步骤，普通退出不清CA；profile删除不删除共享CA/journal，不迁移旧profile材料。

三份数据完全隔离，任何一份的故障都不影响另外两份。

| 所有者 | 存放 | 生命周期 |
| --- | --- | --- |
| `CaptureService`（`capture/entry.ts`） | 内存 Map + `capture-temp/` spill 文件 | 当前 Core 代际，进程退出即释放 |
| `WorkspaceService`（`workspace/entry.ts`） | `workspace.sqlite` | 跨 Recording 持久 |
| Diagnostics Worker（`diagnostics/worker/entry.ts`） | `diagnostics.sqlite` | 跨 Recording 持久，独立线程独占 |

- **CaptureService**：只管当前 Recording 的易失数据，组合 `ExchangeStore` 与 `BodyStore`。Exchange 用 Map + 惰性 `(startedAt,seq)` 索引；Body 小于 3 MiB 驻内存，较大正文 spill 到 `capture-temp/`。不使用 SQLite，也没有常驻 Worker。
- **WorkspaceService**：跨 Recording 持久的低频配置，单个同步 `DatabaseSync` 连接。当前五张文档表：`rule_set`（RuleSet）、`collection_tree`（Composer 集合）、`tls_passthrough_hosts`（不解密名单）、`tls_insecure_hosts`（源站证书 per-host 例外）与 `tls_decryption_preference`（用户是否想解密 HTTPS），都是单行 JSON + revision。前三张走乐观锁；后两张只有一个编辑入口，走不比对 revision 的 `overwrite`。高频 diagnostics 有独立 Worker 与独立库，不并入。
- **Diagnostics Worker**：`DiagnosticsService`是根门面，组合`DiagnosticsWorkerHost`；worker独占`diagnostics.sqlite`，批量事务写入、聚合丢弃计数和keyset分页，不按条数或时长淘汰。写入失败只计数，不阻塞或回滚捕获，也不递归回灌同一sink。
- **Archive Worker**（`archive/host/entry.ts` + `archive/worker/entry.ts`）：仅 native archive 导入/导出时创建，按 100 条批次把内存 Capture materialize/读取当前固定的 `capture.sqlite`；完整 schema 直接属于 Worker Store，**无版本数组、迁移文件或旧格式分支**；完成、取消或失败即退出。

## 4. Recording 生命周期

三个动作的语义不能混淆：

- **Stop** 只经 `proxy.setRecording{recording:false}` 暂停记录——Mockttp listener 与系统代理保持运行、流量继续转发，暂停期间的新连接不再落库/推送，已在途的 Exchange 自然完成。
- **Start**（含首次 bootstrap）经 `proxy.start` 恢复 `recording=true`；若未监听则先启动 listener，显式换端口时在同会话迁移监听端口。
- **Clear**清理Capture/Body，并遵守[Transfer互斥规则](../features/transfer.md#clear与文件任务)，不能绕过运行中的文件任务。

系统代理只在应用退出与紧急修复时由 Main 恢复。Core 退出自然释放临时数据。`proxy.status` 同时上报 `listening` 与 `recording`，Renderer 的 `capturing` 取 `recording`。

## 5. 正文边界

Live Capture Body 小于 3 MiB 驻内存，超过后 spill 到 Core 临时目录（首次跨阈时已缓存内容全量迁移进文件）。**没有单正文或总量配额**，磁盘 I/O 失败只跳过该正文捕获，不影响流量转发、RPC 或进程状态。

Renderer Inspector 是独立的展示边界：文本/结构化 Body、WS 与 gRPC 最多读取前 `2 MiB`（`BODY_PREVIEW_MAX_BYTES`），压缩文本解码输出也为2 MiB；图片使用独立的16 MiB读取/解码预算，输入超限时不读、解码输出被截断时不渲染。音视频不进入预览，只能经 Main Save Dialog + Core 流式任务保存。文件替换的Main预览按同一2/16 MiB边界读取，完整文件仍由Core按路径发送，不将预览覆盖实际输入。

gRPC在途预览通过`CaptureService.getExchangeBodySnapshot/readExchangeBodyRange`按Exchange/side读取当前writer的有限range；hash只在写完后确定。读取与写入/finalize/abort串行，内存与spill共用一份正文；Final引用绑定后优先读取已提交Blob。Clear/Dispose等待被移除Exchange的writer队列再清理文件。

`ExchangeTracker`跟踪全部已接受但未完成的存储操作，终态记录离开活动Map后仍可排空；`ProxyService.prepareCaptureReset()`在推进generation后先等待这批操作，再允许Capture清理文件。正文commit失败时writer结束且不可读，两侧commit与Exchange终态分别收尾。

## 6. 构建产物

`proxy-core` 输出 `entry.cjs` + 按需的 `archive/worker/entry.cjs` + 常驻的 `diagnostics/worker/entry.cjs`；Forge 递归复制整个 `dist/proxy-core`。运行时依赖的随包策略见 [release.md](release.md)。

在途正文18/18、178/178早期子集与后续排空修复的历史范围统一保存在[Capture验证记录](../features/capture.md#capture-streaming-core-history)，不与当前预览预算或新产物混用。
