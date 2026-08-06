## 新的idea

- [ ] **部分完成**（2026-08-03，commit `b326bc3`）MCP server，先写package，不接入main或core，另外要落地详细架构文档
  - 已完成：`packages/mcp-server/` 认证 + 11 只读 / 7 写工具 + MCP 协议状态机（45 tests，零运行时依赖）；架构文档 `architecture/feature-mcp.md`。
  - 未完成：Main 侧 transport（named pipe / unix socket）、runtime 文件、`bridge.mjs`、Preload 窄 API、Settings 面板与审批弹层——即整条"接入 Main/Core"的链路。

- [ ] Breakpoint 交互重构（配置在 Rules、调试在 Breakpoints 两处分家，很别扭）。**设计稿已于 2026-08-06 选定方案 A 并进入细化；产品尚未实现。** 依赖的 filter 重构已于 2026-08-03 落地（`3eaa14e`）。

  - 现状问题：
    - 断点规则配置在 Rules 的一种 action；HTTP 总开关在 Breakpoints 页的 `Break on match`；WebSocket 断点开关却在 Capture 的 WS 消息面板 —— 同一能力三个入口、两种范式。
    - **命中完全无感知**：`useBreakpoints` 的轮询只在 `BreakpointsMain` 挂载时启动，侧栏无 badge。用户在 Capture 页时，真实流量被挂起 30s（默认 `timeoutMs: 30_000` + `onTimeout: 'continue'`）却零提示，表现为浏览器莫名卡死再自己恢复。这是事故级问题。
    - `PendingBreakpoint` 没有 `exchangeId`，断点和 Capture 行无法关联。但 `applyRulesToRequest` 里已有 `request.id`（正传给 `tracker.recordRuleOutcome`），顺着传进 `awaitBreakpoint` 即可。
    - Core 侧已有 `onBreakpointHit` 推送钩子，Renderer 没用，退化成 1s 轮询。
    - 右键建断点只生成 `enabled:false` 草稿并跳到 Rules 等用户手动 Apply —— 把"临时拦一下"做成了配置流程。

  - 主流工具参考：
    - Fiddler / mitmproxy：**主流量列表原地调试**，命中行变色标记，右侧 Inspector 直接编辑放行。
    - Burp：Proxy 工作区内 Intercept 子标签，与 HTTP history 并列，醒目的 `Intercept is on`。
    - Charles / Proxyman：断点是**独立于 Rewrite 的一类工具**，有自己的规则列表，命中弹独立窗口；流量右键可快捷加断点。
    - 共识：① 断点是独立工具而非混在 rewrite action 里；② 无论配置在哪，"有流量被挂住"必须在主流量视图立刻可见，没有工具让用户去另一个页面查岗；③ 总开关是工具栏级一等公民且唯一；④ 从流量右键一键加断点且**立即生效**。

  - **已选 UI 方案：断点是 Capture 流量状态，不是一个页面**（引擎层仍保持 breakpoint 为 RuleAction）：
    - 目标设计删除独立 Breakpoints navigation；挂起 exchange 在 Capture 列表原行显示黄色 pause icon，Request/Response 同色且不显示倒计时。
    - 选中 paused 行后 Inspector 切为 Request/Response 编辑器，底部固定 Drop / Continue / Forward edited；Headers、Original body、Replacement body 复用普通 Detail 的可折叠 SectionHeader。
    - Capture Workbar 的 Breakpoint icon 是唯一入口并带 pending badge；点击打开 manager，总开关、Advanced rules、规则 enable switch 与 View rule 都在其中。
    - Request/Response body 对称拆成只读 Original 与 Off/Text/File Replacement；Text/File 空态明确 fallback 到 original，文件格式问题只警告不阻断。
    - 从历史 request 快捷创建只影响未来流量，必须即时通知“当前 request 未暂停”；真正命中仍在 Capture 原行处理。

  - 快速创建断点的匹配粒度（**不为 filter 弹新界面**）：
    - 现状 matcher 是 `{ type:'url', mode:'exact', value: scheme+host+path }`（`toEndpointUrl` 剥掉 query，避免 token 明文落 `rules.sqlite` 且换 token 后失配 —— 这个决定要保留）。盲区：REST 路径参数 `/users/123` → `/users/456` 不命中；同 host 其他接口不命中；不区分 method 可能过宽。
    - 主流工具都在**创建那一刻让用户选粒度**（Charles path 支持 `*`，Proxyman 预填可编辑，Fiddler `bpu` 子串，Burp regex）。
    - 建议右键级联子菜单，一次点击直接生效：`This endpoint` / `This path prefix (…/*)` / `This host (host/*)` / `Custom…`（通往已有的 Rules 编辑器做多条件 AND、method 限定、超时策略、Request+Response 成对）。分层是"子菜单快捷 → Rules 编辑器精细"，不引入第三个界面。
    - 断点规则应**创建即 enabled 即 Apply**：rewrite 规则默认不启用是因为字段没填完，而断点 matcher 是从真实请求填出来的，不存在未填完。
    - **尚未统一**：当前 mockup 的快速菜单标题仍写 `Break request + response once`，但 manager 已按评审删除 `Once` / `Always` / `Request + response` 展示。实现前必须决定是否真的支持 Break once 与双 phase 快捷创建，不能让不可编辑标签重新出现。
    - **待 filter 重构后再评估**：`Break on current filter` —— "在看哪些流量"和"想断哪些流量"在语义上是同一个表达式（Burp intercept rules、mitmproxy `i <filter>` 本质如此），复用 Omnibox 最省 UI。风险是切换 filter 会静默改变断点范围，造成"只想换视角却改了断点"的意外。filter 新设计定稿后一并决策。

  - pause 对后续请求的影响（固有代价，非 bug，但必须让用户看得见）：
    - Core 层不阻塞：`applyRulesToRequest` 是 per-request async 回调，`BreakpointQueue` 用 Map 存多个 pending，每条独立 timer + Promise，并发挂起原生支持。
    - 客户端层会阻塞：HTTP/1.1 同连接队头阻塞；浏览器每 host 6 个并发连接，6 个请求被挂起后第 7 个根本发不出来（Capture 里连影子都没有）；挂住 HTML/关键 JS 时后续请求压根不产生；HTTP/2 稍好但依赖链照样停。用户看到的是"整站卡死"，这正是无感知挂起危险的原因。

  - 多断点处理（现在只有列表 + Continue all）：
    - **并发上限（必须）**：pending 超阈值（如 10）时新命中自动放行，状态栏提示 `Breakpoint queue full — N requests auto-continued`。否则一个命中埋点/轮询接口的断点就能把浏览器打死。
    - **Break once（待决策）**：是否命中一次后自动禁用尚未定；只有在 Rules 有明确设置与 manager 可解释时才落地。
    - 逐个放行节奏：Continue 后自动选中队列下一条（类似调试器连按 F5）。
    - 批量分层：`Continue all` / `Drop all` 之外加 `Continue all from this rule`。
    - 超时不显示倒计时：Core 继续强制 timeout；自动 continue/drop 后必须在状态栏/Diagnostics 留痕，不能静默。
    - Request + Response 成对断（Charles/Proxyman 默认行为）：模型是两条独立 action（`phase: request` / `response`），UI 要能表达"这个 exchange 断两次"且第二次能关联回同一行 —— 又指回 `exchangeId`。

  - 产品实现前置三件事（不受 UI 细节影响，做完不返工）：
    1. 断点感知全局化：轮询/推送提到 App 级 + pending 计数 + 状态栏提示。
    2. 并发上限保护 + 超时留痕。
    3. `PendingBreakpoint` 增加 `exchangeId`，为后续任何方案铺路。

  - 设计基础设施决定：本方案确认后先把 `design/app` 整体迁移到 Vite + React + CSS Modules，再开始产品实现。设计 SPA 复用 `lucide-react`、Ant Design、Monaco、tokens 与稳定 primitives；网络/Core/IPC 用 fixture adapter，不复制业务后端。旧静态 SPA 整体删除，不保留双路径。


## Bugs或改进
- capture detail的general、response headers这些head应当可以折叠和收起 ![alt text](image.png)
- capture detail的body似乎并没有实现对html、css之类的格式化，button也没反应 ![alt text](image-1.png)
- composer collection点侧栏的空白处是不能取消选择的 ![alt text](image-2.png)
- composer collection目录双击目录名不能改名称，目录和item都不能改名称，双击可以在原地变成输入框改名
- composer collection同时只能选一个，选中目录和item是互斥的，只能选一个，选item时，创建目录和item都是创建平级的，如果超过3级就必须disable create button了
- composer collection的样式间距太小了，宽度也小了点可以稍大些，最好做成类似rule那种，之前的设计图里有一版是tree，做成那一版可以 ![alt text](image-3.png)
- composer collection没有右键菜单，目录应该可以rename、new、delete，item应该可以rename、delete
- capture detail里rule加的header tag的cursor应该是可点击的cursor ![alt text](image-4.png)
- rule collection不能创建sub folder和sub rule，这个应该和composer保持一致
- rule collection也没有右键菜单，菜单内容应该跟composer类似
- rule collection右上角的几个按钮没必要存在，可以在rule detail这边加一个save button用来保存 ![alt text](image-5.png)
- rule detail的提示可以放底栏 ![alt text](image-9.png)
- rule collection的数字右边距太少了，跟composer不一样 ![alt text](image-10.png)
- capture detail的body viewer感觉最好是默认撑满，最小高度还是需要设一个，比如320？你觉得多少比较合适？另外最好加一个全屏观看按钮，点击之后会弹出一个dialog，里面可以查看和copybody，点击其他地方会关闭 ![alt text](image.png)

- 不止是application会闪，其他的capture filter也会闪
- 有的桌面端应用捕捉不到request？比如douyuclient，好像很多request被归类到edge里去了 ![alt text](image-6.png)
- 我打开https://www.bilibili.com，他的登录失效了，关掉之后又有效了，不知道为什么
- rule和composer要支持导入导出