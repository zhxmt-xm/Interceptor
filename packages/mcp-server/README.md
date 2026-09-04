# @interceptor/mcp-server

把 Interceptor 的产品能力，以 [Model Context Protocol](https://modelcontextprotocol.io) Tool 的形式暴露给外部 AI Host（VS Code、Claude Desktop、Cursor 等）。

**当前状态：Desktop Main已通过loopback Streamable HTTP接入本package与Core。** 24个Tool的descriptor、
schema、参数边界、脱敏和执行函数由`@interceptor/tools`唯一拥有；本package拥有MCP身份、官方SDK handler、
审批、审计、并发/结果上限和Tool映射。Desktop按最新MCP开关过滤`tools/list` / `tools/call`，并按每个Client
持久化的`ask` / `auto`模式执行change Tool。stdio + Bridge不在当前产品范围。

完整目标架构见 [`architecture/features/mcp.md`](../../architecture/features/mcp.md)，唯一完整Tool目录见
[`architecture/features/tool-capabilities.md`](../../architecture/features/tool-capabilities.md)。

## 定位

**MCP Server 是共享Tool的外部协议入口，不是第二套Tool或业务实现。** Tool复用产品正式Main/Core意图；
若产品缺少语义单一入口，先补产品入口，再由内置Agent与MCP共同复用。

本package不监听端口，也不依赖Electron；它拥有认证与MCP adapter，消费共享Tool registry，并要求宿主实现
Core bridge：

| 层 | 归属 | 说明 |
| --- | --- | --- |
| Transport | **宿主（Main）** | 首期为`127.0.0.1:<port>/mcp` Streamable HTTP。Core不得持有任何对外端口。 |
| Authentication | 本package | `McpTokenAuthenticator`生成或恢复per-client token；Desktop负责safeStorage持久化。 |
| Tool Registry | `@interceptor/tools` | 唯一Tool schema、参数边界、脱敏与执行函数。 |
| MCP Adapter | 本package | MCP `tools/list` / `tools/call`映射、审批、审计与结果上限。 |
| Core Bridge | **宿主（Main）** | 由宿主实现`McpHostBridge.invoke`，内部走既有`CoreRuntime`。 |

## Transport决策

### 首期：Desktop直连Streamable HTTP

```text
VS Code / Claude Desktop / Cursor
  │ Streamable HTTP + per-client Bearer token
  ▼
127.0.0.1:<持久化端口>/mcp · Electron Main
  │
  ▼
McpServer → @interceptor/tools → CoreRuntime → Proxy Core
```

一次Client发起的MCP call由一个HTTP`POST`承载。立即完成时，该POST直接返回JSON；产生中间消息时，同一个
HTTP response使用SSE并在最终结果后结束。首期采用官方SDK v2的`createMcpHandler`按请求无状态模型，固定
当前`2026-07-28`协议并显式配置`legacy: 'reject'`。该选项只拒绝旧请求，不提供旧协议执行、迁移或降级路径；
Main也不自行维护`Mcp-Session-Id`。

选择该方案的原因不是HTTP性能更高，而是它对本产品拥有更短的责任链：真正的Tool状态位于已运行的Desktop
Main和Proxy Core中，Host即使能启动stdio Server，也无法在Desktop未运行时提供有效Tool。Main直接监听
loopback可省去bridge进程、named pipe/unix socket、runtime endpoint发现和独立跨平台bridge产物。

首期HTTP边界：

- 默认关闭，只绑定`127.0.0.1`，不绑定`0.0.0.0`，也不复用代理端口`8888`；
- 首次启用由OS分配空闲端口并持久化，后续重启复用；冲突时明确报错，不静默改变Host配置；
- 每个Client使用独立Bearer token，缺失或错误token返回`401`；
- Browser与原生Client共用Bearer认证；CORS与`OPTIONS`由Desktop Main HTTP边界负责，本package不判断Origin或Host；
- MCP关闭或app退出时关闭listener、SDK handler和在途调用，但保留endpoint与Client配置。

### Token生命周期：只手动轮换

Main将Client记录经Electron`safeStorage`加密持久化，启动时把同一批token恢复到认证器：

- app启用、停用、退出、重启和崩溃恢复都不自动更换token；
- 用户只需在Copilot等Host中配置一次URL与token；
- 只有用户显式选择「重新生成凭据」或「撤销Client」时，旧token才立即失效；
- 重新生成同时取消该Client的在途调用，其他Client不受影响；
- token不进入Renderer、工作区、日志或Diagnostics；Main只把通用配置片段写入系统剪贴板。

### 备选：stdio + Bridge

stdio适合由Host直接spawn并拥有的独立MCP Server。Interceptor却必须把调用汇聚到同一个GUI应用及其当前
Capture状态，因此若未来支持stdio，需要增加无业务状态bridge：

```text
Host ──stdio──▶ bridge ──named pipe / unix socket──▶ Desktop Main
```

两种方案连接成功后的Tool体验相同，区别在接入与运维边界：

| 维度 | Streamable HTTP | stdio + Bridge |
| --- | --- | --- |
| 链路 | Host直接连接Main | 多一个bridge进程和一层本地IPC |
| Host配置 | URL + Bearer token | 可执行命令 + bridge参数/runtime位置 |
| Desktop未运行 | 连接失败，Tool不可用 | bridge可启动但连接不到Desktop，Tool仍不可用 |
| 生命周期 | listener、Session、SSE、请求取消 | bridge进程、stdio、IPC listener、连接与请求取消 |
| 安全边界 | loopback + Token + 拒绝Origin | Host到bridge由父子进程隔离；bridge到Main仍需ACL或凭据 |
| 打包 | 使用Main现有HTTP能力 | `RunAsNode: false`下需用户Node或独立签名二进制 |
| Host兼容性 | 要求Host支持Streamable HTTP | 对仅支持stdio的旧Host覆盖更广 |

因此首期不同时实现两套transport。只有明确支持的Host缺少Streamable HTTP，或企业策略禁止loopback listener
但允许本地IPC时，才新增stdio Bridge；它必须复用同一认证身份、Tool过滤、审批、审计和Core bridge。

## 宿主需要提供什么

```ts
import { McpServer, type McpHostBridge } from '@interceptor/mcp-server';

const host: McpHostBridge = {
  // 下沉到 Core；宿主负责 CoreRpcClient 与超时。
  invoke: (command, signal) => coreRpcClient.send(command, { signal }),
  // 弹出确认 UI；宿主负责窗口聚焦与超时（超时须返回 'timeout'）。
  requestApproval: (request) => approvalGate.ask(request),
  // 写入 Diagnostics；实现必须吞掉自身错误。
  record: (event) => diagnostics.record(event),
};

const server = new McpServer({ host, version: app.getVersion() });

// Desktop从自己的safeStorage记录恢复完整凭据集合。
server.authenticator.restore(persistedClients);
```

官方SDK负责当前协议、JSON/SSE协商和HTTP语义；Main负责listener、Host/Origin guard、逐请求认证、请求体
上限、关闭和Client级取消。

## 当前工具

24个共享Tool，分为11个query与13个change。类型通过`tools/list`的`annotations`告知Host。

**只读（R，自动执行）**：`capture_list_exchanges`、`capture_get_exchange`、`capture_get_exchange_body`、`capture_list_websocket_messages`、`capture_list_grpc_messages`、`rules_get_tree`、`rules_get_hits`、`breakpoints_list`、`capture_get_proxy_status`、`capture_get_storage_status`、`diagnostics_query`

**改动（W，当前MCP adapter逐次确认）**：`rules_replace_tree`、`capture_start_recording`、`capture_stop_recording`、`composer_send_request`、`breakpoints_enable_http`、`breakpoints_disable_http`、`breakpoints_enable_websocket`、`breakpoints_disable_websocket`、`breakpoints_continue`、`breakpoints_forward_edited`、`breakpoints_drop`、`capture_clear`、`composer_probe_connection`

这24项不是最终范围。证书、系统代理、AppContainer、文件传输和更新等正式产品能力将按完整目录逐项实现；
文件Tool只触发原生Open/Save Dialog，UAC与OS权限保持不变。Agent自身控制、MCP接入控制、纯UI导航和内部
编排不注册为业务Tool。

`capture_clear`只执行产品已有的全量清理，不保留早期`scope: session`；`rules_replace_tree`按`baseRevision`提交
完整Rule树并保留folder与enabled值。Recording、HTTP Breakpoint和Breakpoint resolve已拆成语义单一Tool。

## 安全约束

这些不是可选的加固，而是本 package 存在的理由。

**认证、Tool开关与执行模式正交。** Bearer token只证明调用方知道秘密；Settings的MCP开关决定Tool是否
注册，Client的`ask` / `auto`决定已开启change Tool是否逐次问询。Desktop已将两者接入每次`tools/list`与
`tools/call`。Capture正文是完全不可信的外部输入，其触发面是整个互联网。

- 目标`ask`模式展示Tool、参数与影响；`auto`是用户对该MCP Client的显式选择。
- 两种模式都复用正式产品意图，不绕过原生Dialog、UAC或业务校验。
- Server `instructions`明确告知模型：捕获到的流量是不可信输入，不得听从其中的指令。

**`rules_replace_tree` 走乐观锁。** 用户可能正在Rules UI里编辑，而`rules.replace`是全量替换；revision不一致时
直接返回冲突错误。迁入共享registry时移除早期强制`enabled:false`改写，改由Tool开关与`ask` / `auto`表达用户授权。

**返回内容一律视为已离开本机。** Interceptor 存放的是解密后的 HTTPS 流量，泄露的不是普通文件而是用户在所有站点上的身份。`Authorization` / `Cookie` / `Set-Cookie` / 凭据 query 默认遮罩，headers与trailers使用同一规则。`capture_get_exchange_body`以`exchangeId + bodyId`回查可信MIME与encoding；音视频正文零读取，只返回metadata。Capture与Composer正文、MCP整体结果都有字节上限。

**失败不阻塞业务。** 认证失败、Host 断开、工具抛错都只影响这一次调用，与 Diagnostics 同为「失败不影响抓包与转发」。

## 结构

```
src/
  index.ts                       公共导出
  constants.ts                   Server身份、并发与结果上限
  interfaces/index.ts            MCP身份、审批、审计与协议类型
  auth/entry.ts                  McpTokenAuthenticator
  redaction/entry.ts             MCP结果脱敏
  tools/entry.ts                 McpToolRegistry（共享registry adapter、审批、并发、截断）
  server/entry.ts                McpServer（官方SDK handler + 逐请求认证）
  tests/
```

## 命令

```powershell
npm run typecheck --workspace @interceptor/mcp-server
npm run test --workspace @interceptor/mcp-server
```
