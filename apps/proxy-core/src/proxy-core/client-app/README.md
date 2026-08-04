# client-app

**把客户端源端口反查成发起流量的本机应用。**

## 主类

`ClientAppService`（`entry.ts`）。`supported` getter 表示当前平台是否具备反查能力（Windows / macOS 有，其他平台返回 `false` 且所有解析降级为无结果）。

## 隐私边界

Core 持有 id / 名称 / 可执行文件路径三元组。**`path` 只交给 Main 用于取应用图标，绝不进入 Renderer**；Renderer 只见 id 与展示名。

## 快照与按需解析

- `cachedAppForPort(port)` 读当前快照，纯内存，命中即让 `exchange-added` 一次带全应用归属
- `resolveAppForPort(port)` 未命中时拉起 helper 子进程重新取快照，结果以 `exchange-updated` 补齐

解析要 spawn 子进程（同步系统调用），所以 `ExchangeTracker` 把它整体推迟到下一个事件循环迭代，保证捕获事件推送与转发永远不被拖慢。

`setProxyPort` 换端口即作废旧快照。

## 依赖

无跨模块依赖。被 `proxy/` 依赖。
