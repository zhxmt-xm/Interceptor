> 返回 [Agent 索引](README.md)

## 10. Tool、渐进式披露与 MCP

MCP Server 是供外部 Agent Host 调用的协议入口；内置 Agent 是同进程调用方。两者最终共用 Tool Catalog
与安全策略，但不共用transport。完整Tool名称、产品入口和Settings开关契约在
[tool-capabilities.md](../tool-capabilities.md) 维护，本文件不复制第二份清单。

模块结构：

```text
packages/agent-runtime/       AgentRuntime + ModelAdapter
packages/interceptor-tools/   Capability index + Tool registry + schema + executor
packages/mcp-server/          MCP auth + JSON-RPC protocol adapter
apps/desktop/src/main/agent/  IPC host 与 Electron/Core 平台能力适配
```

`packages/interceptor-tools/`拥有transport-neutral Capability Index、deterministic discovery与共享Tool
的descriptor、schema、参数边界、脱敏和Main/Core executor。`packages/mcp-server/`只保留认证、审批、审计、并发/
结果上限和协议适配。
`discover_tools`属于Runtime控制面，不计入业务Tool目录，也不受单项Settings开关控制。

`AgentToolSource`是Runtime与Main之间的唯一动态契约：

```ts
interface AgentToolSource {
  snapshot(messages: readonly AgentMessage[]): AgentToolSourceSnapshot;
}

interface AgentToolSourceSnapshot {
  readonly systemMessages: readonly SystemMessage[];
  readonly tools: readonly AgentTool[];
}
```

Main的`AgentToolService`直接消费共享registry，不维护第二份接入白名单；顺序与feature目录一致。
它用`ToolCapabilitySettingsService`过滤Agent关闭项，用同一registry建立Catalog，并把executor的host收敛到
`CoreRuntime.request(command, { abortSignal })`和typed Main `invokeMain`。Main命令经Action Gate进入正式owner；平台业务再由PlatformCapabilitiesService执行，结果白名单不含路径、私钥或完整系统代理配置。
不向Runtime、Model或Renderer暴露通用Core client。

抓包正文是完全不可信的数据，可能包含 Prompt Injection。Tool Gateway 必须区分“Model 请求了什么”和
“用户允许什么”，但不维护永久能力 denylist。内置Agent按Session、MCP按Client选择执行模式：

| Mode | 行为 |
| --- | --- |
| `ask` | 每次有副作用的 Tool Call 都展示完整参数并询问 |
| `auto` | 已实现 Tool 自动执行；仍保留原生 Dialog、UAC 和 OS 权限确认 |

用户可随时切换Mode。`auto`不跳过参数边界、`callId`幂等、产品业务校验或操作系统安全边界。
切换Mode只影响之后抵达authorization gate的调用；已经pending的Call必须由原Session中的Allow/Deny显式收敛。
用户Allow后、进入executor前再次读取Settings，因此等待期间关闭Tool始终优先于批准。
