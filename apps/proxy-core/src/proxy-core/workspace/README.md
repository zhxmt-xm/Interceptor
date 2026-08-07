# workspace

**App 全局公用 Store。** 存低频读写的全局配置与模块级配置 —— Settings、Composer 集合，以及将来任何跟着用户走、不随录制丢弃的东西。落在 `workspace.sqlite`。

与 [`capture/`](../capture/README.md) 的区别：capture 是当前录制的易失数据（内存、Clear 即没），workspace 是用户配置（落盘、卸载才没）。

## 主类

`WorkspaceService`（`entry.ts`），由 CoreApplication 独占拥有并注入给需要读写配置的 command handler。

## 为什么单独一个库

这里的东西都是启动读一次、编辑时偶发写，最密集也不过每秒两次，共用一个同步 `DatabaseSync` 连接足够。高频的 diagnostics 有独立 Worker 与独立数据库，**不并入这里**——避免日志写入与配置写入争锁，也避免日志故障波及用户配置。

## 加一种新配置

每种配置对外只有一对 load/save 薄方法（选表名 + JSON 转换 + 空默认值）。全部 SQL 集中在私有 `read`/`write` 与 `utils/index.ts`，所以加配置不需要碰骨架：

1. `interfaces/index.ts` 的 `WorkspaceDocument` 联合类型加一个字面量
2. `internal/constants.ts` 的 `WORKSPACE_DOCUMENTS` 加同一个表名
3. `entry.ts` 加一对 3 行的 `loadXxx` / `saveXxx`

当前文档表：`rule_set`、`collection_tree`、`tls_passthrough_hosts`。TLS passthrough
文档未保存时使用空名单，不自动绕过任何 host；保存时把 DNS 名规范化为小写 ASCII、去重并拒绝
scheme、port、path 或非法 wildcard，避免坏配置进入 Mockttp listener。

## 并发

写入走 `BEGIN IMMEDIATE` 事务，先比对 `expectedRevision` 再自增。不匹配抛 `RevisionConflictError`（`internal/errors.ts`），CoreApplication 映射为 `conflict` 错误码让 Renderer 重取后重试。

## 依赖

无跨模块依赖。
