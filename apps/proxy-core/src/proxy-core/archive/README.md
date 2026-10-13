# archive

**Interceptor 原生 archive（ZIP）的导入导出。** 与 HAR 的区别：原生格式保留 HAR 无法表达的信息（WebSocket 帧、原始 trailer、Body/Header Rule effect、Request Original，以及二进制正文按内容寻址去重）。

## 主类

`ArchiveService`（`entry.ts`），注入 `CaptureService` 与 `TransferService`。

## 一次性 Worker

导出/导入各独占一个 **一次性** Archive Worker，任务结束即关闭：

- `host/entry.ts` — `WorkerHost`：主线程侧代理，负责启动、通信、生命周期
- `worker/entry.ts` — `ArchiveWorkerApplication`：Worker 内应用，独占一个临时 SQLite 快照文件，只处理 snapshot 的 append / read

Worker 不参与活动 Capture 数据面，因此 archive 任务再慢也不影响抓包。

`SnapshotStore`在单个事务中创建完整schema，避免建表、建索引逐条自动提交造成重复磁盘同步。
保留`journal_mode = DELETE`与`synchronous = NORMAL`；初始化失败时关闭连接并回滚未提交的schema，不遗留打开的数据库句柄。

导出时，snapshot和Blob读取流绑定同一任务AbortSignal；最后一块数据完成后、最终rename前也检查取消。
取消发生在提交前时关闭流和文件句柄、删除临时ZIP与snapshot，不覆盖原有目标；不更改ZIP格式或Worker快照内容。

SQLite快照为Request/Response分别保存Body effect的`ruleId/effect/source/originalState`与可选
Original body id；导入时为Final和Original重新分配当前Session内的body id，并严格校验
`available`必须有Original、`empty/unavailable`不得伪造Original。标准HAR仍只导出Final，不承载这些
原生证据字段。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `ArchiveService`：任务编排、快照捕获、Blob 流式打包 |
| `archive-zip-writer.ts` | 固定格式 ZIP 写入 |
| `archive-zip-reader.ts` | 固定格式 ZIP 读取与校验 |
| `internal/errors.ts` | `InvalidArchiveError` |

## 依赖

- 依赖：`capture/`（快照与 Blob 流）、`transfer/`（任务管理）
