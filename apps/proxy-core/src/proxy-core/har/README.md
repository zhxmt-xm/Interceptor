# har

**标准 HAR 1.2 文件的导入导出。**

## 主类

`HarService`（`entry.ts`），注入 `CaptureService` 与 `TransferService`。文件系统与正文始终留在 Core，Renderer 只见 jobId 与进度。

## 公开能力

| 方法 | 说明 |
| --- | --- |
| `startExport(jobId, filePath, options)` | 登记异步任务并立即返回 running 快照 |
| `startImport(jobId, filePath)` | 同上 |
| `exportToFile(...)` | 按 scope（all / filter / selection）原子导出 |
| `importFromFile(...)` | 校验并导入；失败或取消时回滚新建 Session |

## 原子写

导出先写 `<target>.<uuid>.tmp`，`sync()` 后直接 `rename` 覆盖。**不先 `rm` 再 `rename`**——那会留下旧文件已删、新文件未就位的窗口，一旦 rename 因权限/磁盘/杀软失败，用户原文件就找不回来了。

关闭输出句柄后、调用rename前最后检查AbortSignal，已取消时删除临时文件并保留原目标。rename一旦成功，导出返回成功，迟到取消不能删除已提交文件或把任务改为cancelled。

## 错误

`InvalidHarError`（`internal/errors.ts`）：结构不合法或版本不支持。

## 依赖

- 依赖：`capture/`（读写 Exchange 与正文）、`transfer/`（任务管理）、`proxy/`（正文解码工具）
