# capture

**当前 Recording 的易失抓包数据。** Core 代际内的内存 Exchange Store + 内存/spill Body Store，Clear 或进程退出即丢弃。

不是持久化模块——跨 Recording 存活的低频配置（RuleSet、Composer 集合）在 [`workspace/`](../workspace/README.md)。本模块不使用 SQLite，也没有常驻 Worker。

## 主类

`CaptureService`（`entry.ts`），由 CoreApplication 独占拥有并注入给 proxy / grpc / har / archive。

对上只暴露意图型 API，临时目录与 spill 文件路径不出本模块。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `CaptureService`：组合下面两个 Store，对外统一门面 |
| `internal/exchange-store.ts` | `ExchangeStore`：Session 元数据、Exchange 记录、body 引用、WebSocket frame、规则命中审计；分页查询与 cleanup |
| `internal/body-store.ts` | `BodyStore`：内容寻址正文；小正文驻内存，超阈值异步 spill 到 `capture-temp/`，支持 GC 与 range 读 |
| `internal/body-writer.ts` | `BodyWriter`：push 式增量写入器，供 Proxy 消费 body-data 事件 |
| `internal/errors.ts` | `InvalidCursorError` |

## 生命周期

`initialize()` 建临时目录 → 抓包期间读写 → `cleanup(scope)` 按范围删除并 GC 孤立正文 → `dispose()` 清空并删除临时目录。

Body 的内容寻址决定了 **hash 只有写完才能确定**，因此传输过程中 Exchange 只记录 observed bytes，`requestBodyId` / `responseBodyId` 在正文结束后才绑定。

## 依赖

- 依赖：`transfer/`（导出任务的进度与结果类型）
- 被依赖：`proxy/`、`grpc/`、`har/`、`archive/`
