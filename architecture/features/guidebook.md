# Guidebook

> 范围：Desktop App 内的在线 Guidebook 入口、远程页面边界、主题/语言同步与外部浏览器跳转。

## 1. 入口与页面

Renderer Sidebar 在 Settings 上方提供独立的 Guidebook workspace。进入后，Window Header 继续显示当前 workspace 名称，主区由在线工具栏和 Guidebook 页面组成，底部 Statusbar 显示在线文档状态。

Guidebook 使用固定 origin `https://www.interceptor.cn`：

- 简体中文入口：`/guide?embed=desktop`；
- 其他 App 语言入口：`/en/guide?embed=desktop`；
- App 不提供离线副本，也不把远程 URL 作为用户输入；
- 刷新只重新加载当前固定入口，浏览器打开只交给 Main 打开同一官方页面。

官网的 `embed=desktop` 模式只移除网站 Header/Footer，保留 Guidebook 自己的目录、正文、本章导航、搜索和图片预览。Guidebook 内部导航继续保留 `embed=desktop`，正文滚动由 iframe 自身负责。

## 2. Renderer 与 Main 边界

远程 Guidebook 只运行在 sandboxed iframe：

- iframe 仅允许脚本与自身 origin，不能弹窗、下载、提交表单或访问本地文件；
- Desktop CSP 的 `frame-src` 只允许 `https://www.interceptor.cn`；
- Renderer 的 Preload API 只存在于顶层 `interceptor://app` 页面，不注入远程 frame；
- Main 继续拒绝新窗口、非可信顶层导航、下载、权限申请和 WebView；
- “在浏览器中打开”使用 `openGuidebookInBrowser(language)` IPC；Main 只接受 15 种公开 UI language 值，并映射到中文或英文两个固定官方页面，不接收 Renderer 提供的 URL。

## 3. 主题、语言与搜索

iframe ready 后以及 App 主题/语言改变时，Renderer 使用固定 target origin 向该 frame 发送：

```ts
{
  source: 'interceptor-desktop-guidebook',
  type: 'sync-preferences',
  theme: 'light' | 'warm' | 'ember' | 'dark',
  locale: 'zh-CN' | 'en'
}
```

除 `zh-CN` 外的 App 语言统一显示英文 Guidebook。官网只接受来自其 parent frame 的上述有限消息，不读取或回传 App 状态，不接触 Preload、IPC、凭据、Capture 或本地存储。

工具栏 Search 发送同来源的 `open-search` 消息，由当前 Guidebook 页面打开既有搜索弹窗。图片点击和大图关闭仍由官网既有交互负责。

## 4. 状态与失败

Renderer 显示 Loading、Ready 与 Error 三种独立状态：

- iframe `load` 前显示 Loading；
- 官方页面完成 `load` 后显示 Ready；
- iframe 加载错误、浏览器离线或超时进入 Error，并提供 Retry；
- Retry 创建新的 frame 代际并重新同步当前主题与语言。

错误态不能伪装成成功，也不能静默切换到第三方页面或本地占位文档。
