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

## E2E协议复用

[server/scenarios/traffic-lab.ts](server/scenarios/traffic-lab.ts) 同时是人工工作台与 E2E 共用的协议流量库。
E2E 可以直接使用 Node API，不要求所有操作经过 Playground 页面；需要验证页面时仍从 Browser 公开控件运行。

| 入口 | 保留的能力 |
| --- | --- |
| `TrafficLab.run()` | 原有39项 HTTP/Body/Encoding/WebSocket/H2/gRPC/TLS 场景及 Draft、wire 事实、timing、trailers |
| `trafficLab.httpTrafficRunner` | 默认 echo/cookies、精确自定义响应与二进制、任意外部客户端、显式代理、挂起/释放、主动取消和 origin 证据 |
| `trafficLab.webSocketTrafficRunner` | 持续连接、独立客户端、客户端消息、origin 广播、指定 close code、断开与消息证据 |
| `trafficLab.getTlsTrafficRunner()` | 共享 HTTPS/H2/gRPC origin，TLS-only 探测、ALPN、握手次数和实际应用字节计数 |
| `TrafficLab.close()` | 统一关闭协议服务、释放 HTTP 响应 gate、销毁 WS/TLS socket 与取消停滞 CONNECT |

协议归属、共用 WebSocket 客户端的两种关闭操作和生命周期见 [服务端说明](server/README.md)。
E2E fixture 分类与使用边界见 [fixtures说明](../desktop/tests/e2e-workflow-tests/fixtures/README.md)。
OpenAI-compatible 模型模拟继续由 Agent fixture 所有，不并入不接 LLM 的 Playground。

## 代码目录

- [src/main.tsx](src/main.tsx) 是前端唯一启动文件；`app/` 管页面外壳、共享界面与样式，`capture/` 管协议 Draft，`mcp/` 管连接与调用，`acceptance/` 管人工 recipe 与报告。类型跟随所属功能，不在根目录散放。
- [server/entry.ts](server/entry.ts) 是服务端唯一启动文件；`api/` 管输入解析，`scenarios/` 管场景和调度，`http/`、`tls/`、`websocket/` 管对应协议，`shared/` 管跨协议工具。
- 不使用包住全部代码的 `internal/`。已有历史辅助测试保留，后续按实际 Playground 场景与已有真实 E2E 验证，不再扩充“测试的测试”。