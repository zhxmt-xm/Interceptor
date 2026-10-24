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

Capture Lab无需MCP配置。41个场景都由Node使用显式代理`127.0.0.1:8888`发送到Playground自有origin：

| 分组 | 场景 |
| --- | --- |
| HTTP | H1 JSON、upload、streaming、early response、abort，以及H2 JSON、client/origin error GOAWAY |
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

服务器验收代码中的`runTls`会核对原origin确实收到请求；Map Remote可能合法绕过该origin，不能直接把
缺少原origin观测当作映射失败。这类流程复用`TlsTrafficRunner.openHttp1Socket()`建立真实CONNECT/TLS连接，
分别读取客户端响应并核对实际目标origin，不给产品增加专用参数或绕过代理。

### 手动复现H2中断正文

1. 启动Interceptor并开启Recording，确认监听`127.0.0.1:8888`。
2. 在产品Settings中开启HTTPS解密，移除`localhost`的TLS passthrough，并在Certificates允许自签名
   `localhost`源站；关闭会改写或挂起本请求的Rules/Breakpoints。这些配置由产品UI操作，Playground不会代改。
3. 在Capture Lab的HTTP分组选择`H2 client error GOAWAY`或`H2 origin error GOAWAY`，保留默认POST
   Draft，点击Run。两场景分别从客户端或源站发送错误GOAWAY，不需要自己控制点击时机。
4. 源站声明512 KiB，只发送256 KiB的`a`。客户端收到首段后立即触发`NGHTTP2_INTERNAL_ERROR`，不会先等
   Interceptor录制完。随后自动用新连接发送独立GET到同一路径的`/recovered`，不是重试原POST。
5. 在Response Detail的Protocol中核对：
   - GOAWAY：`sent: true`、`errorCode: 2`、`receivedBodyBytes: 262144`、`declaredBodyBytes: 524288`、
     `originRequestCount: 1`。
   - SHA-256：`dd3dde87623d9a6b354c68c943d189c89c63652d945e7bbdf0986cae91a49521`。
   - recovery：`state: complete`、HTTP 200、`originRequestCount: 1`、`differentOriginSession: true`。
6. 在Interceptor Capture按`/playground/h2/error-goaway-client`或`/playground/h2/error-goaway-origin`
   查找最新POST；重复运行时可用Response Detail中的`x-playground-run-id`核对。约1秒收尾后，原H2行应保持200、
   256 KB及已结束的耗时；Response可读256 KiB部分正文，Headers仍声明524288，不能显示补全的512 KiB或重放POST。
   `/recovered`另有正常GET/200行。
7. 故意中断的原HTTP响应显示`failed`是预期现象，不代表整个手动验收失败；`sent: false`、字节/hash不符、
   源站请求重复、恢复失败或Capture正文缺失则不是通过。结合产品观察手动选择Pass / Fail / Blocked并填写备注，
   可用Header下载按钮导出报告；Playground不会自动勾选Pass。
8. 测试结束后，通过产品UI还原本次修改的MITM/localhost/Rules/Breakpoints设置；正常关闭Interceptor与Playground。

该场景复现真实网络中断和迟到观测，不控制Mockttp内部调度，也不宣称每次都能稳定制造同样的通知顺序；
精确1000ms、重复abort不延期、Clear/删除/退出回收由Core回归验证。正文与网络事实仍使用现有面板，不增加新的UI布局。

## 边界

- Browser直接访问Interceptor MCP，因此真实覆盖CORS与Bearer；
- Main只处理`/mcp`路由、preflight与Bearer；认证后的协议判断由官方SDK负责；
- Playground不读取Interceptor内部Store，不构造Client记录，也不绕过Ask/Auto、Dialog、UAC或系统权限；
- 既有自动测试覆盖协议场景与Browser交互，真实Electron workflow验收H1/WebSocket及H2错误GOAWAY的Capture链路；
  新场景直接通过真实页面和产品验证，不扩充Playground工具单测，也不能替代24项Tool逐项人工验收。

## E2E协议复用

[server/scenarios/traffic-lab.ts](server/scenarios/traffic-lab.ts) 同时是人工工作台与 E2E 共用的协议流量库。
E2E 可以直接使用 Node API，不要求所有操作经过 Playground 页面；需要验证页面时仍从 Browser 公开控件运行。

| 入口 | 保留的能力 |
| --- | --- |
| `TrafficLab.run()` | 41项 HTTP/Body/Encoding/WebSocket/H2/gRPC/TLS 场景及 Draft、wire 事实、timing、trailers |
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
- 不使用包住全部代码的 `internal/`。后续修改按实际Playground场景与已有真实E2E验证，不再扩充“测试的测试”；既有测试按下面的风险边界保留，不以历史存在为由无限维护。

## 既有辅助测试的维护边界

| 范围 | 保留原因 |
| --- | --- |
| `redaction`、`observed-fetch`、`acceptance-report` | 防止Token进入展示/导出证据，观测不能消费或阻塞SDK响应，人工结论及schema信息不能被错误转换 |
| `mcp-config`、`traffic-request-draft` | 保留外部输入边界的有效/无效数据校验，避免错误配置或Draft被当成有效验收输入 |
| `abortable-attempts` | 取消与页面失效后的迟到结果不能覆盖当前场景，主动取消仍能呈现终态 |
| HTTP / TLS / WebSocket controls及`traffic-lab` integration | 验证真实wire字节、握手、帧/流、取消、断开和端口释放，保护供产品E2E使用的流量源及证据真实性 |

recipe键集合由`CurrentToolName`和`satisfies Record`约束，非空文字检查不能证明人工步骤正确。Capture workspace的宽度、JSON往返和协议文案以实际页面拖拽、编辑Draft及协议场景检查为准，服务端Draft边界由既有测试保护。

`traffic-lab` integration的临时proxy独立登记入站与上游socket，停止listener后销毁测试连接并等待关闭；清理按创建的反序执行，错误聚合报告，不用`allSettled`吞掉失败。TLS场景保留，不以删除场景或扩大超时处理清理问题。
