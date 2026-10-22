# capture

**当前 Recording 的易失抓包数据。** Core 代际内的内存 Exchange Store + 内存/spill Body Store，Clear 或进程退出即丢弃。

不是持久化模块——跨 Recording 存活的低频配置（RuleSet、Composer 集合）在 [`workspace/`](../workspace/README.md)。本模块不使用 SQLite，也没有常驻 Worker。

## 主类

`CaptureService`（`entry.ts`），由 CoreApplication 独占拥有并注入给 proxy / android-ingress / grpc / har / archive。

对上只暴露意图型 API，临时目录与 spill 文件路径不出本模块。

## 组成

| 文件 | 职责 |
| --- | --- |
| `entry.ts` | `CaptureService`：组合下面两个 Store，对外统一门面 |
| `internal/exchange-store.ts` | `ExchangeStore`：Session 元数据、Exchange 记录、Final/Original body引用、Body/Header Rule effect、WebSocket frame、规则命中审计；分页查询、快照与cleanup |
| `internal/body-store.ts` | `BodyStore`：内容寻址正文；小正文驻内存，超阈值异步 spill 到 `capture-temp/`，支持 GC 与 range 读 |
| `internal/body-writer.ts` | `BodyWriter`：push 式增量写入器，供 Proxy 消费 body-data 事件 |
| `internal/errors.ts` | `InvalidCursorError` |

## 生命周期

`initialize()` 建临时目录 → 抓包期间读写 → `cleanup(scope)` 按范围删除并 GC 孤立正文 → `dispose()` 清空并删除临时目录。

`isRecording`、`pauseRecording()`和`resumeRecording()`持有唯一的实时录制意图。ProxyService/ExchangeTracker与Android新交互读取同一状态；网络listener和各入口Session独立，暂停不停止规则或网络，恢复不补录旧请求。

Core的全量Clear使用`all-except-sessions { sessionIds }`保留全部活动Session元数据，但清空其全部Exchange、正文和等待建档的采集。入口启停与Clear共享串行边界；Core拒绝单独删除仍被入口拥有的Session，并在所有入口排空后才执行停止时的孤立正文GC。Core退出还须等待已接受的Clear，不能提前dispose。

Body 的内容寻址决定了 **hash 只有写完才能确定**，因此传输过程中 Exchange 只记录 observed bytes，`requestBodyId` / `responseBodyId` 在正文结束后才绑定。`createBodyWriter(exchangeId, side)`按Exchange/side登记在途writer；`getExchangeBodySnapshot()`返回当前可读大小与独立的`available`/`complete`，`readExchangeBodyRange()`只读有限range，不为在途正文伪造hash。

在途读取与写入、finalize、abort共用BodyWriter串行队列。小正文读取内存分片，大正文读取同一spill文件；完成后仍经BodyStore读hash，不保存第二份完整正文。已绑定的Final正文优先，不能把Rule替换前的请求writer误当Final；等待writer快照后重新核对Final和Exchange状态，覆盖并发绑定显式空正文或Clear的情况。Clear/Dispose先等待被删除Exchange的writer读取与放弃操作，再删除spill。

Exchange网络状态与正文采集所有权独立：`updateExchange()`只更新metadata，不因`aborted`提前解绑writer。Tracker的中断窗口通过`retainBodyCapture()`登记读取/清理所有权，即使首个writer尚不存在，空正文快照仍保持`complete:false`；窗口封口、写入与引用绑定完成后由`releaseBodyCapture()`解除关联。正常完成同样显式解除，Final仍优先于Original。

`createOriginalBodyWriter(exchangeId, side)`为协议副本登记独立的Original写入器，不覆盖`createBodyWriter()`的当前展示槽位。request/response的Original与Final使用同一Exchange所有权，Clear、Session删除和Dispose统一等待四个writer的读写并释放spill。现有Exchange范围读取仍只选Final/当前展示writer；Android的HttpRecording已使用该能力，将实际应用副本与BodyRuleEffect的Original证据分别绑定，不把PC拟发送的replacement当作Final。

`createWebSocketBodyWriter(exchangeId, direction)`复用同一清理机制，为每个方向保留一个当前WS正文writer；加上HTTP槽位，每条Exchange固定最多六个槽位，不随消息历史增长，也不覆盖HTTP Original/Final。Android只将text/binary原文绑定为现有WS frame记录；控制帧仍参加决定和实际转发计数，不另扩展UI数据形状。实际传输字节在Android应用确认后更新，drop不累计。

Session删除、Clear和Dispose同步取消登记的等待回调，等待已接受的读写及writer放弃后再清理BodyStore；迟到通知不能重新创建writer。采集快照的`complete`表示不再增长，不把中断的HTTP消息声明为完整成功。

`retainBodyCapture(exchangeId, sessionId, onDiscard)`显式登记所属Session，首个请求头尚未入Store也可以按范围取消。Clear先同步撤销建档/写入资格，再等待已接受的读取和writer结束；删除其他Session不会误停当前录制。Proxy的TrackedExchange保留创建时Session，迟到中断不读取可能已切换或清空的当前Session。

Clear保留活动Session时只保留元数据，仍撤销该Session中尚未收到请求头的旧采集；迟到的首个请求也不得重建已清空的记录。

提交失败时BodyWriter仍向调用方抛出原错误，但快照必须为已结束、不可读，可读长度归零，observed字节数保持。BodyStore继续负责提交失败的spill清理，不能留下无正文却持续等待增长的writer状态。

单正文导出在sync和关闭临时文件之后、最终rename之前检查取消；取消被确认时清理临时文件并保留原目标。rename成功后返回TransferResult，迟到取消不能将这次成功保存记为cancelled；任务终态由TransferService等待实际结果后发布。

存在Body Rule effect时，公开`requestBody` / `responseBody`始终是Final。Request Original仅在
`originalState: available`时通过effect引用；`empty`与Response的`unavailable`不携带虚假ref。
Original参与storage统计、GC引用重建、Archive快照hash枚举和Clear生命周期，与Final同样由BodyStore
内容寻址。

## 依赖

- 依赖：`transfer/`（导出任务的进度与结果类型）
- 被依赖：`proxy/`、`grpc/`、`har/`、`archive/`、`android-ingress/`（Core命令已装配，Main设备生命周期及真实手机流程仍待接线）
