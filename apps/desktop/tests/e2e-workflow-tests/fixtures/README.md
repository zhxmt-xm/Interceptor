# E2E Fixtures

本目录只负责真实 workflow 的环境、驱动与安全恢复，不维护 Capture 协议流量的第二套实现。

| 目录 | 职责 | 入口 |
| --- | --- | --- |
| `runtime/` | Electron 与 Browser Playground 的启动、证据、退出和 profile 保留 | [local-electron-driver.ts](runtime/local-electron-driver.ts)、[playground-server.ts](runtime/playground-server.ts) |
| `ui/` | 公共 automation 定位、Capture/Breakpoint/Playground 操作、分平台真实文件 Dialog | [automation.ts](ui/automation.ts)、[capture-workflow.ts](ui/capture-workflow.ts)、[breakpoint-workflow.ts](ui/breakpoint-workflow.ts)、[file-dialog.ts](ui/file-dialog.ts) |
| `safety/` | 宿主进程代际、系统代理与 journal 恢复保护 | [workflow-host-safety-guard.ts](safety/workflow-host-safety-guard.ts) |
| `agent/` | 可控的 OpenAI-compatible 流式回复、Tool Call 与模型请求证据 | [openai-compatible-lab.ts](agent/openai-compatible-lab.ts) |

已有辅助单测随所属目录放在 `tests/unit/`，验证驱动自身的安全和状态判断，不替代真实 Electron workflow。

## 平台分派

- 业务workflow共用UI操作、真实流量输入和业务结果，不为macOS增加query、替换输入或改Windows超时。原生差异只放driver/fixture的明确Windows/Macos方法，不复制两套业务流程。
- `LocalElectronApplicationDriver`提供代理只读证据与journal路径；Windows继续读取WinINet和`LOCALAPPDATA`共享journal，macOS读取SystemConfiguration和当前profile journal。Core故障的观察时机及crash后profile选择也在各平台方法内，Windows保留原顺序和跨profile断言。
- Windows宿主guard使用原六字段比较；macOS完整比较network service快照，并额外保存/复核admin trust。该检查只属于Macos宿主操作，不在TLS/gRPC/H2 workflow追加Windows证书读取。
- macOS driver按Playwright项目配置准备真实窗口：常规`macos`使用1600x900，只有body-fill滚轮边界用`macos-scroll-boundary`的1600x800，两个项目不重复运行workflow。先校验Main PID/启动时间并等待System Events看到窗口，再调整和验证内容尺寸。Windows不增加项目或窗口调整；业务workflow不通过产品CSS或额外请求数据制造滚动。
- macOS Electron stdout/stderr继承profile内0600日志文件，runner退出时保留App仍能写日志，不因断开的pipe产生EPIPE。附加证据前扫描完整日志中的敏感值，只输出有界末尾；保留profile的私有日志不直接作为附件。主动crash确认后立即保存该代metadata/trace/log，不能等同profile的下一代删除日志后再采集。Windows仍使用原Playwright日志通道。
- [settings-workflow.ts](ui/settings-workflow.ts)分别验证Windows AppContainer搜索控件与macOS不支持状态；共同导航顺序和当前section断言不变。
- [file-dialog.ts](ui/file-dialog.ts)只分派原生操作：Windows调用原有UI Automation，macOS按PID/启动时间定位`save-panel / open-panel`，以真实键鼠打开GoTo、粘贴并核对完整路径/文件名后提交。macOS坐标click发给目标process，不发给System Events应用；文件名选区必须包含扩展名，只读直接textFields，避免遍历文件列表阻塞。失败只取消本轮面板，让产品正常退出，不写原生返回值。媒体/正文、Rules/Collection、HAR/Archive/Diagnostics的Save/Open/Cancel已纳入65条真实Green，逐条结果以Handover为准。
- 运行中传输的原生退出在driver分派：Windows保留原Alt+F4及前台窗口校验，macOS对精确Main进程发送Command+Q。Command+W仅关闭macOS窗口，不能作为App/Main/Core/Worker退出证明。两平台仍验证文件取消清理、宿主恢复和重启不重放。

修改fixture后直接跑受影响的已有真实workflow，现有Windows安全测试可以回归但不能代替Windows原生E2E。不新增测试设施自身的unit/integration；原生授权不可用时记录blocked和恢复结果，不用mock或应急清理冒充Green。

## 协议流量

唯一协议流量库是 [Playground TrafficLab](../../../../playground/server/scenarios/traffic-lab.ts)。
每条需要流量的 workflow 由 `trafficLab` fixture 创建一份实例并统一关闭；以下 fixture 是该实例的协议服务：

| Fixture | 能力 |
| --- | --- |
| `httpTrafficRunner` | HTTP origin、显式代理请求、自定义 status/headers/body、响应挂起与释放、主动取消、origin 观测 |
| `webSocketTrafficRunner` | WebSocket origin、长连接客户端、双向消息、广播、关闭码与真实断开证据 |
| `tlsTrafficRunner` | HTTPS/H2/gRPC/CONNECT 共用的 TLS origin、ALPN、握手次数和应用字节观测；按需创建 |
| `trafficLab` | 运行 Playground 原有场景目录，统一管理全部协议服务 |

测试可以直接使用这些 Node 流量 API，不必启动 Browser。需要验证 Playground 页面或 Browser MCP 时，
使用 `playgroundServer` 和 [Playground UI 驱动](ui/playground-capture-workflow.ts)。
这些 API 只控制外部流量，不操作 Interceptor Store、Preload 或内部业务 API；产品操作仍通过真实 UI。

协议类分工与原始 WebSocket 控制的限制见 [服务端说明](../../../../playground/server/README.md)。
新增 HTTP、HTTPS、HTTP/2、WebSocket 或 gRPC 流量能力放在 Playground，直接通过实际场景或已有真实 E2E 验证，不为测试设施新增单元或集成测试。
不要在本目录重新添加协议 origin/client lab。OpenAI 模拟不属于 Capture 协议场景，独立保留。