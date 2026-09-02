# Interceptor Playground

本地Web人工验收工作台。它不接LLM、不进入Interceptor安装包，也不自动把任何Tool标记为通过。

## 启动

从仓库根目录运行：

```powershell
npm run playground
```

打开 `http://127.0.0.1:4175`。同一Node进程提供Vite页面、Traffic Lab API和本地origin；关闭命令后这些端口
一起释放。

Playground默认进入`Capture Lab`，左侧一级导航的第二项是`MCP`。修改Browser或`server/`代码后需要停止并
重新运行`npm run playground`，确保页面与Traffic Lab使用同一代接口。

## MCP人工验收

1. 启动Interceptor，进入`Settings > Agent > MCP Server`；
2. 开启Server，创建一个Client并保留默认`Ask`；
3. 点击Copy config，把完整JSON粘贴到Playground；
4. 点击Connect。页面固定使用`2026-07-28`，不回退legacy；
5. 左侧目录来自在线`tools/list`。选择Tool后查看title、description、annotations、input/output schema与人工recipe；
6. 手工填写Raw JSON并点击Call Tool；运行中可点击Abort；
7. change Tool在Interceptor里手工Deny或Allow，再对照右侧HTTP交换、SDK result和产品状态；
8. 手工选择Pass / Fail / Blocked并填写备注；
9. 点击Header下载按钮导出脱敏报告。报告包含实时schema hash，不包含Bearer明文。

Token只保存在当前页面内存。刷新、关闭页面或点击Clear configuration都会清除Token；页面不使用
`localStorage`、`sessionStorage`或IndexedDB。

## Capture Lab

Capture Lab无需MCP配置。39个场景都由Node使用显式代理`127.0.0.1:8888`发送到Playground自有origin：

| 分组 | 场景 |
| --- | --- |
| HTTP | H1 JSON、upload、streaming、early response、abort，以及H2 JSON |
| Bodies | JSON、text、HTML、CSS、JavaScript、XML、YAML、SVG、Markdown、form、PNG、binary、audio、video、unknown text/binary |
| Encoding | gzip、deflate、brotli、corrupt gzip、invalid image |
| WebSocket | text、binary、bidirectional、ping/pong/close control frames |
| gRPC | proto、JSON、trailers error、compressed、malformed envelope |
| TLS | passthrough tunnel、MITM H1、MITM H2 |

每个场景提供完整Raw Request Draft。发送前可以编辑；`Reset request`、切换场景或刷新页面会恢复默认Draft，
不会写入Browser持久化。页面会明确列出需要Developer在Interceptor中完成的MITM、origin trust或passthrough前置条件。

运行后，中间区显示client结果，右侧`Response Detail`显示origin request、client response、frame/envelope、ALPN、
trailers和timing。详情默认宽560px，可用splitter拖拽；窄窗口保留全部栏并允许水平滚动。Developer在Interceptor
Capture中对照同一请求，再记录人工结论。

## 边界

- Browser直接访问Interceptor MCP，因此真实覆盖CORS与Bearer；
- Main只处理`/mcp`路由、preflight与Bearer；认证后的协议判断由官方SDK负责；
- Playground不读取Interceptor内部Store，不构造Client记录，也不绕过Ask/Auto、Dialog、UAC或系统权限；
- 自动测试覆盖39个协议场景、Browser交互及真实Electron中的H1/WebSocket Capture链路，但不能替代24项Tool逐项人工验收。