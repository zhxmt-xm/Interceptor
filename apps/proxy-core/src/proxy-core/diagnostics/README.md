# diagnostics

**结构化诊断日志的持久化与查询。**

## 主类

`DiagnosticsService`（`entry.ts`），组合一个 **常驻** Diagnostics Worker。

## 为什么用独立 Worker + 独立数据库

日志是 Core 里唯一的高频写入。放进独立 Worker 与独立 `diagnostics.sqlite`：

- 写入不阻塞主线程数据面
- 日志库损坏或写满不会波及 [`workspace/`](../workspace/README.md) 的用户配置
- 崩溃时只丢日志，抓包继续

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `DiagnosticsService`：模块门面，非阻塞写入 + 分页查询 + 生命周期 |
| `host/entry.ts` | `WorkerHost`：主线程代理；写入缓冲、按 requestId 关联查询；Worker 崩溃时拒绝挂起查询并丢弃缓冲 |
| `worker/entry.ts` | `DiagnosticsWorkerApplication`：Worker 入口，串行处理写入/查询/关闭 |
| `worker/record-store.ts` | Worker 内的 SQLite 读写 |

## 导出

`exportJsonl` 按 JSON Lines 原子导出（同样是 tmp + rename），可取消、可汇报进度。

## 依赖

无跨模块依赖。写入方是 `core-diagnostics.ts` 的 `CoreDiagnostics`，它是全 Core 的诊断记录入口。
