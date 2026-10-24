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

普通在线阅读workflow保持初始App语言；语言切换及frame locale同步由独立`shell.guidebook.i18n` workflow通过真实UI验证，并在退出前恢复初始语言。

工具栏 Search 发送同来源的 `open-search` 消息，由当前 Guidebook 页面打开既有搜索弹窗。图片点击和大图关闭仍由官网既有交互负责。

## 4. 状态与失败

Renderer 显示 Loading、Ready 与 Error 三种独立状态：

- iframe `load` 前显示 Loading；
- 官方页面完成 `load` 后显示 Ready；
- iframe 加载错误、浏览器离线或超时进入 Error，并提供 Retry；
- Retry 创建新的 frame 代际并重新同步当前主题与语言。

错误态不能伪装成成功，也不能静默切换到第三方页面或本地占位文档。

## 5. 教程素材约定

- 教程逐功能说明用途、平台前提、真实操作、预期结果和限制；每个操作步骤关联真实 App 图片，示例名称和值与同一次运行一致。相似测试归纳为用户场景，不把 fixture、故障注入或验收日志写成操作步骤。
- 素材来自原 workflow 的[可选截图模式](../../apps/desktop/tests/e2e-workflow-tests/README.md#trace-与证据)，使用前独立审核；不维护专用 Guidebook 制作/导入链路，不要求视频，不新增私有教程 npm 包或 registry 依赖。
- 只录本次 App 及其原生面板，先定位测试自产文件目录；不录桌面、其他应用、个人流量、路径或凭据。保持当前 App 语言和日常 CA，不绕过锁屏、UAC、Gatekeeper 或系统授权。
- Homepage Markdown 是完整教程的唯一来源，正式部署对应 `Interceptor-Homepage` commit `83999b9`。App 只接入在线阅读页；正式设计基准为 `design-vite/src/features/GuidebookAppPreview/GuidebookAppPreview.tsx`，候选预览不能代替正式设计或产品验收。
- 已交付中英文步骤图与有限 Host 实录不代表全部 Tool、其他 Host、商业模型或隔离系统场景通过；具体证据与未执行项见[测试文档](../platform/testing.md#guidebook-app-validation)。
- [教程目录](../../../Interceptor-Homepage/guidebook/README.md)与[读取、媒体及恢复说明](../../../Interceptor-Homepage/docs/guidebook.md)由Homepage维护。本地预览使用`http://127.0.0.1:4175/guide`；停止后在Homepage运行`npm run dev`恢复，预览地址不替代正式App入口。

## 6. 与当前验证范围的差异

- Windows 可见 UAC、安装/升级、更新打开和正式版本/语言素材映射仍需对应平台、系统策略与产物。已有 AppContainer、Archive、Recording、系统代理、TLS 和原生 Open/Save 实录不替代最终 Windows package 验收。
- 原 Homepage 截图契约限定 `0.1.1-alpha.1`、`darwin/x64`、`en-US`；Windows 未打包 workflow 与本地步骤图不能冒充该 Release 或覆盖 macOS 素材，版本、平台和双语映射未核对前不发布。
- 证书生成、安装、卸载、删除仍需共享材料为空的隔离 macOS 用户或 VM，以及正常系统授权；不能破坏日常 CA。
- DNS/DHCP WPAD 仍需授权的隔离网络和恢复保护；其他外部 MCP Host、商业模型仍缺明确目标、账号、凭据和服务使用授权。
- 当前 Host 仍有 11 项未执行：gRPC 消息查询、`rules_replace_tree`、`composer_probe_connection`、7 项 Breakpoint 启停/处理及已排除原生专项的 `settings_open_certificate_manager`；上述证书生命周期另有 4 项环境阻塞。它们保持 `not-run/blocked`，不阻塞现有步骤图与 App 在线入口的交付。
- 空 Rules 树删除后的 Apply 入口、受测 Upgrade 未进入 pending 等限制按实际行为说明；产品修复需独立授权和对应 Release，不能用备用规则、隐藏 API、篡改发布包或修改截图掩盖。只有 pre-release 时，稳定版更新 REST 入口按 GitHub 语义返回 `404`。
