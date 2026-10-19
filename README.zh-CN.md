<p align="center">
  <img src="apps/desktop/assets/interceptor-icon.png" width="80" height="80" alt="Interceptor 标识">
</p>

# Interceptor

[English](README.md) | [简体中文](README.zh-CN.md)

**面向 Windows 和 macOS 的桌面 HTTP(S) 调试代理。**

Interceptor 将流量检查、请求重放、响应模拟和 AI 辅助调试整合到一个工作区。查看应用实际发送了什么，复现接口故障，或在不修改服务端的情况下替换响应。

[下载](https://github.com/zhxmt-xm/Interceptor/releases) | [功能](#功能) | [快速上手](#快速上手) | [反馈](https://github.com/zhxmt-xm/Interceptor/issues)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="design-vite/shots/dark/capture/framed.png">
  <img src="design-vite/shots/light/capture/framed.png" alt="Interceptor Capture 工作区，包含应用筛选和 HTTP 流量列表" width="1600">
</picture>

*Capture 工作区设计预览，使用示例流量，并非已发布版本的截图。*

## 功能

### 捕获与检查

- **HTTP 与 HTTPS 抓包。** 捕获 HTTP/1.1 和 HTTP/2 流量，检查请求头、Cookie、正文、耗时和 TLS 信息；按应用、域名、方法、状态码和协议筛选。
- **易读的正文。** 在请求详情中直接查看 JSON 树、格式化文本、图片和十六进制数据。
- **WebSocket 与 gRPC 检查。** 在 HTTP 请求之外查看 WebSocket 帧和 gRPC 消息。

### 修改与复现

| 工具 | 可以做什么 |
| --- | --- |
| Rules 规则 | 匹配请求或响应，改写请求头、查询参数、正文和状态码；模拟响应、映射本地文件、转发到其他服务、阻断请求或添加延迟。 |
| Breakpoints 断点 | 暂停 HTTP 请求、响应或 WebSocket 帧，检查并编辑内容，再决定放行或丢弃。 |
| Composer 请求编辑器 | 构造和重新发送请求，编辑参数、请求头与正文，并用 Collection 管理可复用的请求。 |

### 保存、共享与扩展

- **导入导出。** 交换 HAR 文件、保存原生录制归档、导出单独的正文，也可以共享 Rules 或 Composer Collection。
- **Agent 与 MCP。** 使用可选的内置 Agent，或连接兼容的外部 AI 客户端，通过明确的 Tool 权限与审批模式控制操作。
- **网络控制。** 管理系统代理、串联上游代理、配置 TLS 透传，并通过诊断日志排查问题。
- **可调整的工作区。** 提供四种时段主题和 15 种界面语言，支持拖拽调整面板，方便查看详情。

## 获取 Interceptor

已发布的安装包及其兼容性说明以 [GitHub Releases](https://github.com/zhxmt-xm/Interceptor/releases) 为准。

| 平台 | 安装包 | 安装方式 |
| --- | --- | --- |
| macOS | DMG / ZIP | 选择适合当前 Mac 的产物，先将App复制到Applications，再打开应用。 |

只以 Release 实际附带的产物为下载依据。没有对应平台安装包时，可参考 [中文开发指南](architecture/development.md) 从源码构建。

macOS安装包采用ad-hoc签名，未经过Apple公证，首次启动可能被Gatekeeper阻止。确认下载来源可信且文件完整后，可按系统提供的“系统设置 → 隐私与安全性 → 仍要打开”流程放行该应用；受管理设备可能不提供此选项。不要全局关闭系统安全保护。Interceptor安装helper及信任CA时请求的系统授权是另外的权限步骤。

应用更新同样来自 GitHub Releases。查看更新说明后，由你决定何时下载，下载完成后再打开安装器，不会自动开始下载。检查和下载均匿名进行；Release 不可访问或请求失败时显示失败，不要求登录。

## 快速上手

1. **启动 Interceptor。** 应用会在 `127.0.0.1:8888` 启动本地代理，并自动接管系统代理。
2. **让目标应用经过代理。** 遵循系统代理的应用会自动使用该地址；其他支持代理的客户端需要手动配置相同地址。
3. **按需启用 HTTPS 解密。** 打开 HTTPS Setup，生成本地 CA，通过操作系统提示安装并信任，再开启解密。证书信任需要管理员授权。
4. **复现目标请求。** 在 Capture 选择请求查看详情；用 Composer 重发，用 Rules 修改后续流量，或通过 Breakpoints 在转发前介入。
5. **保留需要的证据。** 导出 HAR 或原生归档，方便后续检查。结束后正常关闭应用，让它恢复自己接管的系统代理设置。

使用证书固定或独立信任库的应用，可能需要额外配置或 TLS 透传。透传保留加密连接，不提供解密后的 HTTP 内容；完全绕过代理的客户端流量也不会被捕获。

## Agent 与 MCP

AI 是可选能力。抓包、Rules、Breakpoints 和 Composer 都不需要模型 API Key。

| 入口 | 配置方式 |
| --- | --- |
| 内置 Agent | 在 Settings 添加 DeepSeek 模型和自己的 API Key，再打开 Agent 侧栏。会话历史在本地加密保存。 |
| 外部 MCP 客户端 | 在 Settings 开启 MCP，创建客户端，将连接配置复制到兼容的 Host。服务仅监听本机 loopback，每个客户端使用独立 Bearer token。 |
| Tool 权限 | Agent 与 MCP 分别提供逐 Tool 开关。`Ask` 在调用前请求审批，`Auto` 自动执行已授权的 Tool；原生文件对话框和操作系统授权仍需正常完成。 |

MCP 默认关闭。客户端是否兼容取决于其支持的 Streamable HTTP 协议版本，不能仅凭“支持 MCP”判断，详见 [MCP 兼容性说明](architecture/features/mcp.md)。

## 隐私与安全

- **录制数据存储在本地。** 录制、导出文件和诊断日志可能包含 Cookie、凭据或个人信息，应按敏感数据管理。
- **AI 会引入外部数据边界。** Agent 会将会话上下文和 Tool 结果发送给配置的模型服务；已授权的 MCP 客户端可以读取其启用 Tool 所暴露的数据。连接前请检查权限。
- **证书信任影响整台设备。** 关闭解密或退出应用不会卸载 CA；不再需要时，应通过 Settings 移除其信任。
- **系统设置需要正常恢复。** 请正常退出应用。会话期间若其他应用修改了系统代理，Interceptor 会避免覆盖对方的新设置。
- **仅检查获得授权的流量。** 向他人或 Issue 分享材料前，先检查并移除敏感信息。

## 反馈与贡献

通过 [GitHub Issues](https://github.com/zhxmt-xm/Interceptor/issues) 报告可复现的问题或提出建议。请提供应用版本、操作系统、相关协议和复现步骤，不要附带私人流量、API Key 或证书材料。

欢迎代码、文档、翻译和具体的问题反馈。源码初始化、模块分工、调试、验证与打包统一见 [中文开发指南](architecture/development.md)；功能契约和平台说明见 [架构文档索引](architecture/README.md)。

完成初始化后，运行`npm start`，选择`Development / Test / Build / Release`。Desktop与Design不再询问构建模式；确认默认Yes，仍需按Enter执行。Release进入现有`npm run release`向导，启动CI前确认源码、版本与目标，构建和完整性检查通过后自动Publish，不再二次询问。原始命令继续供直接调用和CI使用。

在Test下，E2E可选普通验收或逐步截图，无需手写命令参数，截图自动保存到独立目录。两种模式使用同一批workflow；截图只是测试证据，不自动发布到官网。

## 致谢

Interceptor 基于 [Electron](https://www.electronjs.org/)、[Mockttp](https://github.com/httptoolkit/mockttp)、[React](https://react.dev/)、[Monaco Editor](https://microsoft.github.io/monaco-editor/) 及仓库使用的其他库构建。

## 许可证

Interceptor自有代码采用[Apache-2.0](LICENSE)，版权归属见[NOTICE](NOTICE)。第三方组件保留各自的许可证和归属声明，应用安装包同时携带自有许可及依赖声明。使用软件不以赞助为前提。