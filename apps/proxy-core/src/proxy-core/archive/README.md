# archive

**Interceptor 原生 archive（ZIP）的导入导出。** 与 HAR 的区别：原生格式保留 HAR 无法表达的信息（WebSocket 帧、原始 trailer、二进制正文按内容寻址去重）。

## 主类

`ArchiveService`（`entry.ts`），注入 `CaptureService` 与 `TransferService`。

## 一次性 Worker

导出/导入各独占一个 **一次性** Archive Worker，任务结束即关闭：

- `host/entry.ts` — `WorkerHost`：主线程侧代理，负责启动、通信、生命周期
- `worker/entry.ts` — `ArchiveWorkerApplication`：Worker 内应用，独占一个临时 SQLite 快照文件，只处理 snapshot 的 append / read

Worker 不参与活动 Capture 数据面，因此 archive 任务再慢也不影响抓包。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `ArchiveService`：任务编排、快照捕获、Blob 流式打包 |
| `archive-zip-writer.ts` | 固定格式 ZIP 写入 |
| `archive-zip-reader.ts` | 固定格式 ZIP 读取与校验 |
| `internal/errors.ts` | `InvalidArchiveError` |

## 依赖

- 依赖：`capture/`（快照与 Blob 流）、`transfer/`（任务管理）
