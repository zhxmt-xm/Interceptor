# client-app

**把客户端源端口反查成发起流量的本机应用。**

## 主类

`ClientAppService`（`entry.ts`）。`supported` getter表示是否注入本机反查helper路径；当前仅Windows提供，macOS未实现且返回无结果。helper的TSV应用标识按Windows路径解析，展示名缺失时只返回不含扩展名的文件名。

## 隐私边界

Core 持有 id / 名称 / 可执行文件路径三元组。**`path` 只交给 Main 用于取应用图标，绝不进入 Renderer**；Renderer 只见 id 与展示名。

## 快照与按需解析

- `cachedAppForPort(port)` 读当前快照，纯内存，命中即让 `exchange-added` 一次带全应用归属
- `resolveAppForPort(port)` 未命中时拉起 helper 子进程重新取快照，结果以 `exchange-updated` 补齐

解析要 spawn 子进程（同步系统调用），所以 `ExchangeTracker` 把它整体推迟到下一个事件循环迭代，保证捕获事件推送与转发永远不被拖慢。

`setProxyPort` 换端口即作废旧快照。

## 依赖

通过`@interceptor/platform-capabilities/client-app`执行原生helper查询并解析TSV，公共身份仍使用`@interceptor/core-protocol`。快照、失败退避、Capture关联及投递状态继续由本module负责；只读loopback判断留在本module的`utils/`。被`proxy/`依赖。
