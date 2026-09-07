# transfer

**异步文件任务管理器。** HAR、原生 archive、诊断导出与单正文保存共用同一套任务基础设施。

## 主类

`TransferService`（`entry.ts`）。整个 Core 只有一个实例，`HarService` 与 `ArchiveService` 注入的是同一个，`transfer.job.get` / `transfer.job.cancel` 直接查询它。

## 公开快照的边界

保存全部运行中与已完成任务，按 jobId 关联进度、终态和取消。**公开快照绝不泄漏绝对路径或 AbortController**——Renderer 只见 jobId、kind、state、processed/total 和文件名。

## 公开能力

| 方法 | 说明 |
| --- | --- |
| `start(jobId, kind, filePath, operation)` | 校验 ID 唯一后异步启动，立即返回 running 快照 |
| `get(jobId)` | 不可变公开快照；未知 ID 返回 `null` |
| `cancel(jobId)` | 触发 AbortSignal 并立即更新状态 |
| `cancelAll()` | Core 关闭时调用 |
| `onCompleted(listener)` | 成功任务结束后通知 CoreApplication，只传任务种类 |

- `har-import` 或 `archive-import` 成功后，CoreApplication 向 Main 发布 `captureImported`。
- Main 转给 Renderer，Capture 常驻订阅重新查询 summaries。
- 失败、取消不发成功通知；文件路径与正文不进入通知。

## 依赖

无跨模块依赖。被 `har/`、`archive/`、`capture/`（类型）依赖。
