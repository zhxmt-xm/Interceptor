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

  - 设计基础设施决定：本方案确认后先把设计稿整体迁移到 Vite + React + CSS Modules，再开始产品实现。设计 SPA 复用 `lucide-react`、Ant Design、Monaco、tokens 与稳定 primitives；网络/Core/IPC 用 fixture adapter，不复制业务后端。旧静态 SPA 整体删除，不保留双路径。（已完成：新稿在 `design-vite/`，旧 `design/` 已删除。）


## Bugs或改进
- [x] **已完成 · Detail sections 折叠**：产品 `Section` 已支持折叠；`design-vite` 的 Capture 13 个、Composer 4 个 legacy `.sec > .sh` 已迁移到受控 `CollapsibleSection`，标题具备 button / `aria-expanded` 语义并保持各段独立状态，旧 adapter 命令式折叠分支及 `.sec` / `.esec` 样式已删除。聚焦交互测试 `2/2`、design-vite typecheck / build 通过，重拍 `290` 张无 missing / resized / not drawn。 ![alt text](image.png)
- [x] **已完成 · BodyViewer 格式化**：HTML / CSS 使用 Monaco language service 的 `editor.action.formatDocument`，XML 使用 `xml-formatter`；Format 自动/手动入口和只读恢复已锁定，相关 BodyViewer / formatter 测试 `15/15` 通过。 ![alt text](image-1.png)
- [x] **已完成 · Composer 空白取消选择**：Collection tree 仅在真实空白点击时清除目录落点，并保留右侧已打开请求；store 与 Playwright 交互均已覆盖。 ![alt text](image-2.png)
- [x] **已完成 · Composer 原地重命名**：目录与 request 均支持双击进入输入框，Enter / blur 提交、Escape 取消；真实 UI 流程已覆盖两类节点。
- [x] **已完成 · Composer 唯一选择与三级限制**：目录和 request 通过唯一 `aria-pressed` 暴露互斥选择；选 request 后新建项与它平级，目录最多三级，达到上限时 toolbar 与右键菜单的新建目录均 disabled；store `8/8` 与真实 UI 流程通过。
- [x] **已完成 · Composer Collection tree 样式**：Collection 已采用可折叠 tree、可拖拽 splitter、30px 行高与 26px 层级缩进；聚焦 parity 的 panel / folder / request 几何均为 0px。 ![alt text](image-3.png)
- [x] **已完成 · Composer 右键菜单**：目录包含 Rename / New subfolder / New request / Delete，request 包含 Rename / Delete；深度禁用、outside click 与菜单内容已通过真实 UI 流程。
- [x] **已完成 · Rule effect tag 导航**：存在 `ruleId` 的 header effect 渲染为 button，计算样式 `cursor:pointer`；点击 `Rule appended` 可打开对应 `Rewrite auth header` rule detail，真实 Renderer 流程通过。 ![alt text](image-4.png)
- [x] **已完成 · Rules 子目录与子规则**：目录右键菜单可创建 subfolder / rule，最多三级；真实 Renderer 流程已创建 Nested folder 及其子 rule。
- [x] **已完成 · Rules 右键菜单**：根空白菜单提供 New rule / New folder / Export；目录提供 Rename / New subfolder / New rule / Delete；规则提供 Rename / Show matching requests / Delete，交互均已验证。
- [x] **已完成 · Rules 根级 toolbar 恢复**：`f8f2f53` 将高频根命令全部移入树空白右键菜单，导致可见入口消失；现已恢复 New rule / New folder / Export 三个图标按钮与冲突态 Reload，直接复用现有 store/data 命令，根菜单继续作为辅助入口，Save 仍固定在 detail header。语言无关真实 Electron workflow 先精确 Red 于`rules.toolbar.create`缺失，后`1/1` Green且销毁完成；Desktop `263/263`、design typecheck/build及Rules parity `11 matched / 0 missing / 0 flagged`通过。 ![alt text](image-5.png)
- [x] **已完成 · Rule validation footer**：compile / validation 提示已从 detail 滚动区移到 Rules statusbar，并按选中 rule 显示完整问题或 applied revision。 ![alt text](image-9.png)
- [x] **已完成 · Rules count 间距**：命中数保持 26px 最小列与 4px 行右 padding，聚焦 parity 最大差 0.5px。 ![alt text](image-10.png)
- [ ] **回归待验证/修复 · Detail BodyViewer 撑满**：用户现场观察到Detail的正文pane没有吃满Inspector剩余高度。旧“已完成”证据只有fake-Preload parity，不能替代真实Electron E2E；已新增`capture.detail-body-fill`测量真实response BodyViewer/pane几何，取得Red并定位Root cause后再改CSS。全屏能力保持现状，不与本回归混为一项。 ![alt text](image.png)

- [ ] **代码完成 · 待真实 E2E · Capture filter 实时更新不再换位闪动**：Application、Method、Host、Type、Rule 的值保持当前 Capture 中首次出现顺序，计数仍实时更新；Status 与 Protocol 保持固定语义顺序。
  - **Root cause**：`allFacetOptions` 每次从实时 rows 重算后，都按当前 count 降序排列普通 facet；后出现的值一旦计数反超，React 会移动已有 option DOM，600ms 节流只能降低频率，不能阻止整栏反复换位。
  - **解决方案**：保留单次遍历时 `Map` 的首次插入顺序，移除普通 facet 的 count 排序；只让计数文本变化，不移动既有选项。
  - **TDD 证据**：回归测试先复现 `GET, POST` 被翻成 `POST, GET`（Expected / Received 精确失败），实现后扩展覆盖五类动态 facet，Capture store 聚焦测试 `19/19` 通过。
- 有的桌面端应用捕捉不到request？比如douyuclient，好像很多request被归类到edge里去了 ![alt text](image-6.png)
- 我打开https://www.bilibili.com，他的登录失效了，反复登录也是失效的，关掉之后就有效了，不知道为什么
- rule和composer要支持导入导出
- 有时会出现两个相同的application ![alt text](image-7.png)
- [x] **已完成 · Settings 跨 feature 状态保留**：最后访问 section 由 App shell 持有；从 AppContainer 切到 Capture 再返回 Settings 仍保持 AppContainer，明确的 TLS / Proxy 跳转仍可覆盖目标 section。真实 Renderer 流程与 Desktop typecheck 通过。
- [x] **已完成 · AppContainer enabled-first**：Renderer 稳定按 `exempt` 降序后再过滤，enabled 项始终置顶；聚焦 parity `13/13 matched / 0 missing`。
- [x] **已完成 · AppContainer Enable all**：工具栏提供一次确认的 `Enable all`；Renderer 只调用一条 `enableAllAppContainers()`，Main 只启动一次提权 helper，native helper 将当前全部 SID 与既有 exemption 做并集并写后校验。Service `10/10`、helper 真实编译、15 语言 typecheck、视觉 `4/4 matched / 0 flagged / 0.9px`；fake 流程锁定一次调用、4/4、按钮 disabled 与 dialog 关闭。真实 UAC 仍按 headed workflow 现场验收。
- [ ] **待验证/修复 · Capture filter 选项点击误收起分组**：除 Application 外，点击其他 filter 的 option 会同时收起所属分组。选择或取消选择 option 只应更新筛选条件并保持当前展开状态；只有分组标题或 chevron 可以切换折叠。需先用交互测试与真实 Electron workflow 复现，再定位事件传播或受控展开状态的 Root cause。
- [ ] **代码完成 · 待真实 E2E · Clear 后 filter 与列表同步归零**：Core clear 成功后，列表、selection 与 facet snapshot 同一次状态推进清空，不再出现列表已是 `0 of 0`、左侧仍短暂显示旧 application id 和计数的 split state。 ![alt text](image-11.png)
  - **Root cause**：`useThrottledRows` 对所有 rows 变化一律应用 600ms throttle；`clearView` 已同步清空 store rows，但 filter panel 继续渲染上一次非空 snapshot，直到 timer 到期。
  - **解决方案**：把空 rows 定义为同步边界，立即更新时间戳并 `setSnapshot([])`；仅非空实时更新继续使用原节流窗口。
  - **TDD 证据**：mock hook 测试先复现 `setSnapshot` 调用数为0、只注册 timer 的失败；修复后 Clear 立即清空与非空仍节流两条测试通过，Capture 聚焦 `21/21`、Desktop 全量 `261/261`、typecheck 通过。
- [x] **已完成 · Proxy / MITM 持久化**：system proxy 用 ownership journal 跨进程恢复原始/owned 快照；MITM 持久化用户解密意图，Core 重开后读回；TLS passthrough / insecure hosts 同样持久化。聚焦重启测试 `24/24` 通过。
- [x] **已完成 · Breakpoint 二级菜单生命周期**：一级与二级统一使用 Ant Menu children；聚焦 parity 同时匹配一级/二级共 `8/8` targets，0 missing，一级菜单不会在 submenu 出现时卸载。 ![alt text](image-12.png)
- breakpoint最好支持无timeout和有timeout
- 对于tls passthrough的policy影响的reqeust，可以在tunnel的信息框里加一个按钮点击去查看对应的passthrough item，并给那个item一个临时的高亮然后消失 ![alt text](image-13.png)
- [ ] **代码完成 · 待真实 E2E · Breakpoint header 编辑显示 Rule effect**：request / response 的显式 header replace、add、remove 会写入 Capture，并在 Inspector 显示绑定 breakpoint rule 的 marker；body-only 不制造假 header effect。 ![alt text](image-14.png)
  - **Root cause**：`RuleService` 在 breakpoint resolve 后直接调用 `applyRequestEdit` / `applyResponseEdit`，没有像普通 header action 一样向 `evaluation.headerEffects` 追加证据，因此 Capture 只知道规则命中，不知道具体 header 差异。
  - **解决方案**：在 mutate state 前按 `BreakpointEdit.editedHeaderNames` 比较断点前后值，生成 replace / set / remove `RuleHeaderEffect` 并沿既有 `recordRuleOutcome` 入库；完整 headers 中未编辑或值未变化的字段被忽略。
  - **TDD 证据**：request / response 测试先精确失败为 Expected effects、Received `[]`；实现后单元覆盖 replace/add/remove/unchanged/body-only与重复同名值，真实代理验证 Capture 收到 `ruleEffect` 与 `ruleId`。最终 Proxy Core（排除既知 framing 专项）串行 `293/293`、typecheck 通过。
- [ ] **待设计/实现 · Body Rule effect**：Breakpoint body replacement 与普通 Rule body action 目前只有 rule hit，没有独立 body effect 协议、Capture 存储字段或 Inspector marker；需要先定义 body 证据（原始/最终、text/file、request/response）和设计稿，再按协议→Core→Renderer→E2E 落地，不能伪装成 Header effect。
- [ ] **代码完成 · 待真实 E2E · Breakpoint 暂停最终 Rule state 并显示 effect**：request / response 都先完成全部普通 Rule action，再进入 breakpoint；暂停编辑器显示最终 header，并在当前仍存在的 set / append 行展示与普通 Inspector 同语义的 Rule marker。
  - **Root cause**：`RuleService` 在 priority 循环里遇到 breakpoint 就立即 `await`，所以 priority 更晚或同规则后续的 action 尚未执行，snapshot 不是最终 state；同时 `PendingBreakpoint.headers` 只有 name/value，Renderer draft 会丢失已有 `RuleHeaderEffect` 来源。
  - **解决方案**：评估改成两阶段，第一阶段按原顺序执行全部非-breakpoint action并收集 breakpoint，未被 respond/block 短路时第二阶段按 encounter 顺序挂起；协议新增 `BreakpointHeader.ruleEffect/ruleId`，Core 把最终仍存在的 set/append effect 一次性匹配到 header 行，Renderer 按 design-vite 定稿显示 badge。replace/remove 旧值不放回可编辑表单，避免 Forward edited 时复活。
  - **TDD 证据**：request / response 顺序测试先复现 snapshot headers Received `[]`；marker 测试再复现只有 `{name,value}`，审查回归补充 abort-before-suspend、最终写入者与重复实例归属。实现后 workspace typecheck、Protocol `15/15`、Desktop `262/262`、Proxy Core（排除既知 framing 专项）串行 `293/293`、design-vite interaction `3/3` 通过。Marker parity 0 missing，宽高/字体均0差，request/response `dy` 分别2.8px/0.8px（request 为既有 section 累积偏差）。
- [ ] **代码完成 · 待真实 E2E · 右键菜单 Breakpoint item 与 Control 行统一**：Breakpoint 与 Block 处于同一 Control group，icon、文字与 hint 起点一致，仍保留 Ant 原生 submenu hover、箭头、贴边翻转与 dismissal。 ![alt text](image-15.png)
  - **Root cause**：Block 是 Ant `group.children` 内的普通 item，Breakpoint 却是 group 外的顶层 submenu；两种 DOM 层级的行起点不同，submenu 的 icon slot 又少一层 `title-content` wrapper，最终文本左缘相差 `7.4375px`。
  - **解决方案**：把 Breakpoint submenu 放回 Control group，并在自有语义 label 内用 flex + gap 组合 Pause icon 与 name/hint；不 hack `.ant-*` 私有 DOM，箭头仍由 Ant 管理。design-vite 与产品同步。
  - **TDD 证据**：Playwright 几何测试先精确失败为 `7.4375px`，组合结构后转 Green；产品根菜单 parity `4/4 matched / 0 missing / 0 flagged / geometry 0`，二级菜单 `8/8 matched / 0 missing`，仅 popup 整体保留既有 `dw -1px`。