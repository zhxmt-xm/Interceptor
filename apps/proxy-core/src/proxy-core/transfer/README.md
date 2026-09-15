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
| `hasPendingCaptureTransfers()` | 判断Body导出、HAR/Archive导入导出是否仍持有Capture数据，包含取消清理阶段 |
| `cancel(jobId)` | 触发AbortSignal，等待该任务完成后返回实际终态快照 |
| `cancelAll()` | Core关闭时发出取消，返回等待已启动操作及清理结束的Promise |
| `onCompleted(listener)` | 成功任务结束后通知 CoreApplication，只传任务种类 |

`pendingTransfersById`按jobId保留尚未结束的操作，操作结束后移除。`cancel()`只等待目标任务；取消请求发出后仍为`running`，由操作确认取消并完成清理后才变为`cancelled`。操作成功返回表示提交完成，迟到取消不能覆盖`completed`或抑制成功通知；与取消并发的真实文件错误仍为`failed`，保持错误脱敏。

`cancelAll()`先请求取消全部任务，再等待每个操作结束，也包含此前已收到取消但仍在清理的任务。Core同时停止Proxy，等待两者后再释放Capture并确认`stopped`。公开状态集合不变，`transfer.job.cancel`仍返回`transfer.job`，不暴露Promise或本地路径。

CoreApplication在Clear之前使用实际待结束的Capture文件任务判断互斥；冲突返回可重试的`conflict`，不取消任务或删除数据。清理执行期间反向阻止新Capture文件任务及重复Clear，清理成功或失败后释放。Diagnostics导出与Capture无关，不阻止Clear；文件模块内部的导入失败回滚仍由其自身负责。

- `har-import` 或 `archive-import` 成功后，CoreApplication 向 Main 发布 `captureImported`。
- Main 转给 Renderer，Capture 常驻订阅重新查询 summaries。
- 失败、取消不发成功通知；文件路径与正文不进入通知。

## 依赖

无跨模块依赖。被 `har/`、`archive/`、`capture/`（类型）依赖。
