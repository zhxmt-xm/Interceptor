# TODO List

> 状态只允许三种：✅ 已完成；🔄 进行中；⏳ 未开始。详细阶段统一写在 Description 的 Steps 中。
>
> TDD 固定记录总体状态及 Code / Unit / Integration / E2E / Design/Parity；➖ 表示当前 work item 不适用。Parity、fake Preload 或普通 Renderer 测试不能替代真实 Electron E2E。
>
> 阶段词汇以 AGENTS.md 的基础集合为准，并可按真实 flow 增加具体、可验证的新阶段。已落地的 Breakpoint 交互重构见 <a href="../features/breakpoints.md">breakpoints feature</a>。

<div style="overflow-x: auto;">
<table style="width: 1800px; min-width: 1800px;">
<colgroup>
  <col style="width: 150px;">
  <col style="width: 230px;">
  <col style="width: 400px;">
  <col style="width: 420px;">
  <col style="width: 280px;">
  <col style="width: 320px;">
</colgroup>
<thead>
<tr><th>Status</th><th>Name</th><th>Description</th><th>TDD</th><th>Root cause</th><th>Solution</th></tr>
</thead>
<tbody>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Detail sections collapse</td>
  <td><ul><li>Capture 与 Composer 的详情区支持独立折叠和正确 ARIA 语义。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image.png" alt="Detail sections" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Design interaction 2/2</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 真实 Electron Red→Green 2/2，含销毁证据</li><li><strong>Design/Parity:</strong> ✅ 2/2 matched，0 missing，0 flagged，最大 0.7px</li></ul></td>
  <td><ul><li>Design fixture 已组件化，但产品 Capture 标题缺少 <code>aria-expanded</code>/<code>aria-controls</code>，Composer 响应详情仍是不可折叠静态标题。</li></ul></td>
  <td><ul><li>共享 <code>SectionHeader</code> 暴露 ARIA 关系，feature owner 传入语义 automation ID；正文保持挂载并用 <code>hidden</code> 切换，Composer <code>ResponseSection</code> 对齐 design-vite 样式。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>BodyViewer formatting</td>
  <td><ul><li>按正文语言提供自动与手动格式化，并保留失败回退。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-1.png" alt="BodyViewer formatting" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ BodyViewer/formatter 17/17；Store cache 9/9</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 真实 Electron Red→Green 1/1，含销毁证据</li><li><strong>Design/Parity:</strong> ➖ N/A，未改变布局</li></ul></td>
  <td><ul><li>trimmed Monaco 只注册feature listener却缺HTML/CSS language definition，自动Format静默no-op；补editor action contribution又因缺少内部services产生page error；formatter异常继续向Renderer抛出，Copy也读取原始React文本而非当前model。</li></ul></td>
  <td><ul><li>HTML/CSS/JavaScript直接调用Monaco language worker，XML使用<code>xml-formatter</code>；edits在只读model外合并后一次替换，失败恢复原文，Copy读取当前model；Composer按request/current response缓存格式化视图且不改原始body。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Composer Collection tree interactions</td>
  <td><ul><li>完成选择、重命名、三级目录、splitter 与节点菜单的统一交互。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-2.png" alt="Composer selection" width="220"> <img src="image-3.png" alt="Composer tree" width="220"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Collection Store 8/8</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 真实Electron Red→Green 1/1，含Core回载与销毁</li><li><strong>Design/Parity:</strong> ✅ 聚焦 parity 通过</li></ul></td>
  <td><ul><li>创建落点、选中项和已打开request曾混用同一状态；Collection同步hook又挂在会卸载的ComposerMain，快速切换workspace会取消600ms保存并被Core旧快照清空。</li></ul></td>
  <td><ul><li>拆分<code>targetFolderId</code>/<code>activeRequestId</code>，集中三级约束和菜单命令；将<code>useCollection</code>提升到常驻App shell。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Rules hierarchy, menus and status</td>
  <td><ul><li>统一 Rules 层级、菜单、effect 导航、validation 与命中数布局。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-4.png" alt="Rule effect" width="210"> <img src="image-9.png" alt="Validation" width="210"> <img src="image-10.png" alt="Count" width="210"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Rules Store 19/19；Desktop 267/267</li><li><strong>Integration:</strong> ✅ Apply后Renderer reload从Core恢复revision/tree/rule</li><li><strong>E2E:</strong> ✅ 真实Electron Red→Green 1/1，含hit/navigation与销毁</li><li><strong>Design/Parity:</strong> ✅ 11/11 matched，0 missing，0 flagged，最大0.7px</li></ul></td>
  <td><ul><li>树组织状态与右侧打开项曾耦合，根/节点命令边界不清；validation虽标invalid，但Apply仍可把未填写RuleSet写入Core。</li></ul></td>
  <td><ul><li>拆分<code>selectedId</code>/<code>openRuleId</code>，节点菜单按owner分层，validation移入statusbar；共享<code>isRuleSetComplete</code>同时守住Apply按钮和命令入口。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Rules root toolbar</td>
  <td><ul><li>恢复 New rule、New folder、Export 与冲突态 Reload，保留根右键菜单。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-5.png" alt="Rules toolbar" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Desktop 263/263</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ Red→Green 1/1</li><li><strong>Design/Parity:</strong> ✅ 11/11 matched</li></ul></td>
  <td><ul><li><code>f8f2f53</code> 将高频根命令全部移入右键菜单，导致可见入口消失。</li></ul></td>
  <td><ul><li>在 <code>RuleList</code> 恢复共享 <code>IconButton</code> 并复用既有 store/data 命令。</li></ul></td>
</tr>
<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Detail BodyViewer fill and nested scrolling</td>
  <td><ul><li>让正文 pane 占满 Inspector 剩余高度，并在内层滚动到边界后交接给外层。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ <code>Section grow</code>高度链与<code>alwaysConsumeMouseWheel: false</code></li><li><strong>Unit:</strong> ➖ 真实布局与wheel交接只由E2E验收</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ <code>039dd42</code> retrospective Red → current Green 1/1，含销毁与8888释放</li><li><strong>Design/Parity:</strong> ➖ Fake parity不作为该flow验收</li></ul></td>
  <td><ul><li>正文高度链已满足契约；实际缺陷是Monaco默认在滚动边界继续消费wheel，导致Inspector外层<code>scrollTop</code>不增长。</li></ul></td>
  <td><ul><li><code>BodySection</code>通过grow Section占满剩余高度；<code>CodeViewer</code>关闭边界wheel吞噬。真实Electron先将Monaco滚动条拖到底，再验证下一次wheel交给Inspector。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Capture facet stable ordering</td>
  <td><ul><li>动态 facet 保持当前 Capture 中首次出现顺序，只实时更新计数。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Capture 21/21</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ <code>89d8dda</code> retrospective Red → current Green 1/1，含销毁与8888释放</li><li><strong>Design/Parity:</strong> ➖ N/A</li></ul></td>
  <td><ul><li><code>allFacetOptions</code> 按实时 count 重排普通 facet，计数反超会移动已有 option。</li></ul></td>
  <td><ul><li>保留 <code>Map</code> 首次插入顺序，只更新 count 文本。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Bilibili login regression</td>
  <td><ul><li>确认开启Interceptor MITM后，真实Bilibili完整页面连续刷新仍保持登录。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 仅新增Settings公开automation ID与真实workflow；转发业务代码无需修改</li><li><strong>Unit:</strong> ➖ 站点登录态由真实外部profile E2E验收</li><li><strong>Integration:</strong> ✅ 既有HTTPS MITM聚焦2/2</li><li><strong>E2E:</strong> ✅ 6次独立workflow / 18次完整刷新，含Capture、页头、销毁与副作用恢复证据</li><li><strong>Design/Parity:</strong> ➖ N/A，未改变UI</li></ul></td>
  <td><ul><li>当前实现未复现通用Cookie转发缺陷；主文档每轮均为H2 / 200并携带<code>DedeUserID</code>、<code>SESSDATA</code>与<code>bili_jct</code>。早期匿名观测发生在测试尚未等待Edge信任重载与页头稳定时，不能作为产品Red。</li></ul></td>
  <td><ul><li>保留真实Edge Default profile回归：所有产品状态经UI，原生刷新按钮连续三轮，语言无关UIA头像结构、MITM leaf与主文档身份Cookie共同判定；不注入Cookie、不改profile、不依赖私有登录API。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Rules and Composer import/export</td>
  <td><ul><li>为两类树数据提供 JSON 文件导入导出与结果反馈；导入按纯新增处理。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ Rules / Composer 导入导出、逐项校验、部分导入、不可关闭 busy 遮罩与15种语言完成</li><li><strong>Unit:</strong> ✅ Core tree parser、Rules/Composer parser/store 与 JSON-only 边界 Red→Green；聚焦51/51</li><li><strong>Integration:</strong> ✅ 全workspace typecheck、Windows package、artifact audit、production audit与packaged smoke通过</li><li><strong>E2E:</strong> ✅ 两条真实Electron workflow均在884dcc4取得入口缺失Red，当前各1/1 Green；真实Save→Open、零seed、完整销毁</li><li><strong>Design/Parity:</strong> ✅ 12个明暗场景全部0 missing / 0 flagged，最大几何差0.5px</li></ul></td>
  <td><ul><li>导出链路已存在（<code>rules:export</code> / <code>collection:export</code>），导入从未实现；<code>features/rules.md</code> 曾误记根右键菜单已有 Import 入口。</li><li>冲突检测无可用唯一键：<code>id</code> 是本机生成的，跨机器永不碰撞；产品又允许同目录同名节点，<code>name</code> 也不唯一。</li></ul></td>
  <td><ul><li>导入按纯新增处理：节点与字段行<code>id</code>全部重新生成、<code>enabled</code>沿用文件值、<code>priority</code>重排到本地规则之后、保持文件内层级并追加到根末尾；合并交给既有树操作。</li><li>Main只通过原生Dialog读写JSON；Renderer拥有领域解析，文件级失败整体拒绝，节点级失败逐项跳过并报告路径与原因。</li><li>确认 Dialog 在写入前给出有效/启用/跳过计数；确认后复用整树<code>replace</code>原子持久化。Import/Export从点击到IO完成均有不可关闭遮罩，阻断鼠标与键盘穿透。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Settings section persistence</td>
  <td><ul><li>普通返回 Settings 时保留最后 section，显式 TLS/Proxy 跳转仍覆盖目标。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ App shell 持有section，Settings rail暴露唯一<code>aria-current=page</code></li><li><strong>Unit:</strong> ➖ 当前页面语义与跨workspace生命周期由真实E2E验收</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 公共语义缺失Red→当前1/1 Green，含四个workspace往返与完整销毁</li><li><strong>Design/Parity:</strong> ➖ 仅增加ARIA属性，无视觉变化</li></ul></td>
  <td><ul><li>Section 曾由页面局部状态持有，feature 卸载时丢失；提升到App shell后的剩余缺口是视觉active没有公共当前页面语义，也没有真实Electron验收。</li></ul></td>
  <td><ul><li>由App shell持有最后section，普通workspace切换不改值，显式TLS/Proxy入口先覆盖目标；Settings rail用<code>aria-current=page</code>表达唯一当前项，真实workflow覆盖八项导航与Capture/Rules/Composer/Diagnostics往返。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>AppContainer enabled-first ordering</td>
  <td><ul><li>Enabled/exempt 项稳定置顶，过滤不改变排序。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ native helper按SID去重；Renderer纯函数稳定分组后过滤；公共搜索/行状态探针完成</li><li><strong>Unit:</strong> ✅ Renderer 2/2、Main service 10/10</li><li><strong>Integration:</strong> ✅ 真实Windows helper Red于141/138→Green 138/138；package helper同样138/138</li><li><strong>E2E:</strong> ✅ 列表不可用Red→当前1/1 Green，覆盖1 enabled/137 disabled、搜索子序列、逐项恢复与完整销毁</li><li><strong>Design/Parity:</strong> ✅ 明暗各13/13 matched、0 missing；5个既有flagged，最大3.8px</li></ul></td>
  <td><ul><li>Renderer虽已有enabled-first代码但缺owning测试；真实Windows又会按用户返回重复AppContainer SID，Main正确拒绝重复快照，导致列表在进入排序前即完全不可用。</li></ul></td>
  <td><ul><li>native helper在枚举边界按SID保留一个稳定代表，Main继续保留重复拒绝；Renderer以<code>listVisibleAppContainers</code>稳定分组后再过滤，真实Electron只读验证排序、搜索与恢复，不触发UAC或修改exemption。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>AppContainer Enable/Disable all</td>
  <td><ul><li>一次确认批量启用或停用当前 AppContainer SID，双向操作都保留枚举外既有 exemption。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>真实runas elevation验证完成（本机UAC策略自动批准）</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ Enable/Disable各有Renderer→Preload→Main→native独立命令，helper执行SID并集/差集并读回</li><li><strong>Unit:</strong> ✅ Main service与i18n聚焦22/22；Desktop串行321/321</li><li><strong>Integration:</strong> ✅ Windows package、artifact audit、package helper与packaged smoke通过</li><li><strong>E2E:</strong> ✅ 真实Electron入口缺失Red→当前1/1 Green；OS集合1→138→0→1且最终hash精确恢复</li><li><strong>Design/Parity:</strong> ✅ 四个Dialog view均0 missing/0 flagged；主页面按钮不换行且几何在0.6px内</li></ul></td>
  <td><ul><li>只有Enable all会把批量操作变成不可逆能力；逐项启用又需要重复提权，且直接覆盖集合会破坏枚举外既有exemption。</li></ul></td>
  <td><ul><li>Renderer分别发送Enable all与Disable all语义命令；Main每次只启动一次helper。native层对当前SID做集合并集或差集并读回校验，两种操作都保留枚举外exemption；真实workflow先记录完整初始集合，再Enable/check、Disable/check，并通过正式单项UI恢复初始enabled SID后逐项复核。</li></ul></td>
</tr>
<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Capture filter option collapses group</td>
  <td><ul><li>选择 filter option 时保持分组展开，仅标题或 chevron 可折叠。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Capture Store 21/21</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 真实 Electron 1/1，销毁通过</li><li><strong>Design/Parity:</strong> ✅ Interaction Red→Green 2/2；Capture 截图复跑 158/158 identical</li></ul></td>
  <td><ul><li><code>syncFixture</code> 在任意 design state 变化后重算 facet 展开态；option 点击更新 <code>hasFilter</code> 时会把用户手动展开的非 Application 分组重置。</li><li>真实 Renderer 的 Zustand 筛选值与 <code>expandedFacets</code> 已正交，不存在同一缺陷。</li></ul></td>
  <td><ul><li>把 design fixture 展开同步移入只依赖 owning scene 字段的 effect；普通 option 状态更新不再覆盖用户展开结果。</li><li>新增 design 交互 Red→Green、Capture Store 契约测试和真实 Electron workflow。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Capture clear synchronizes facets</td>
  <td><ul><li>Clear 后列表、selection 与 facet snapshot 同一次推进到空状态。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-11.png" alt="Capture clear" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ owning hook/store 23/23</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 89d8dda retrospective Red、当前1/1 Green与完整销毁证据</li><li><strong>Design/Parity:</strong> ➖ N/A，未改变UI</li></ul></td>
  <td><ul><li><code>useThrottledRows</code> 对空 rows 仍节流，filter 暂时渲染旧 snapshot。</li></ul></td>
  <td><ul><li>空 rows 作为同步边界立即清空 snapshot，只节流非空实时更新。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Proxy and MITM persistence</td>
  <td><ul><li>跨进程恢复系统代理 ownership、MITM 意图与 TLS 配置。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ 既有重启测试24/24；本轮聚焦回归41/41</li><li><strong>Integration:</strong> ✅ journal、workspace.sqlite与真实Core聚焦通过</li><li><strong>E2E:</strong> ✅ c978915 retrospective Red、当前1/1 Green、两代销毁与系统副作用恢复</li><li><strong>Design/Parity:</strong> ➖ N/A</li></ul></td>
  <td><ul><li>瞬时运行态曾代替用户意图与系统代理原始快照，重启后无法可靠恢复。</li></ul></td>
  <td><ul><li>持久化正交用户意图，以 ownership journal 保存 original/owned 快照。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Breakpoint submenu lifecycle</td>
  <td><ul><li>Submenu 展开时保持一级菜单挂载，并统一 hover、翻转与 dismissal。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-12.png" alt="Breakpoint submenu" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 既有Ant Menu树无需业务修改，仅补automation探针</li><li><strong>Unit:</strong> ➖ N/A，portal lifecycle由真实Electron验收</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ e5ca501 retrospective Red、当前1/1 Green与销毁证据</li><li><strong>Design/Parity:</strong> ✅ 8/8 matched</li></ul></td>
  <td><ul><li>旧<code>menuPage: root | breakpoint</code>用Breakpoint页替换根菜单，hover不能展开且父子无法共存。</li></ul></td>
  <td><ul><li>统一使用 Ant Menu <code>items[].children</code> 管理完整菜单树。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Breakpoint finite and infinite timeout</td>
  <td><ul><li>显式支持无 timeout 与有限 timeout，并清楚表达超时策略。</li><li><strong>Steps:</strong><ul><li>协议设计完成</li><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Queue/RuleService 36/36、Renderer/Rules/i18n聚焦57/57、MCP registry 19/19</li><li><strong>Integration:</strong> ✅ WebSocket真实proxy 9/9；HTTP策略由真实E2E验收</li><li><strong>E2E:</strong> ✅ HTTP/WS各自Red，当前2/2 Green与完整销毁/系统代理恢复</li><li><strong>Design/Parity:</strong> ✅ Custom/Invalid × Rules/WS × light/dark 8 views均0 missing / 0 flagged，最大0.6px</li></ul></td>
  <td><ul><li><code>timeoutMs=0</code>以魔法值表达无限等待，HTTP无timeout时仍携带无意义policy；UI没有可验证的Custom正整数草稿边界。</li></ul></td>
  <td><ul><li>用判别联合表达infinite/finite；单一下拉框提供No timeout、预设与Custom，只有finite HTTP显示policy；Custom原始文本只留在Renderer并通过正整数校验后写入协议。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Navigate to TLS passthrough item</td>
  <td><ul><li>从 Tunnel 信息跳转到对应 passthrough item，并短暂高亮。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-13.png" alt="TLS passthrough" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ Settings utility 17/17</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 有效Red于公开导航入口缺失、当前1/1 Green与完整销毁证据</li><li><strong>Design/Parity:</strong> ✅ 新增4个明暗入口/目标view均0 missing / 0 flagged，最大0.1px</li></ul></td>
  <td><ul><li>Request 证据与 Settings 配置项之间没有可导航关联。</li></ul></td>
  <td><ul><li>App按当前host读取最新settings，exact优先并选择最长wildcard suffix；以瞬态pattern/sequence导航目标row、滚入视口并高亮3秒，重复导航重新计时。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Breakpoint header edit Rule effect</td>
  <td><ul><li>将显式 header replace/add/remove 写入 Capture 并显示绑定 rule marker。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-14.png" alt="Header effect" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ RuleService/message-editing 28/28</li><li><strong>Integration:</strong> ✅ 真实 Proxy 验证通过</li><li><strong>E2E:</strong> ✅ 89d8dda retrospective Red、当前1/1 Green与完整销毁证据</li><li><strong>Design/Parity:</strong> ✅ Marker parity 通过</li></ul></td>
  <td><ul><li>Breakpoint resolve 直接 mutate state，没有向 <code>evaluation.headerEffects</code> 追加证据。</li></ul></td>
  <td><ul><li>按 <code>editedHeaderNames</code> 比较前后值，生成 <code>RuleHeaderEffect</code> 并入库。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Body Rule effect evidence</td>
  <td><ul><li>为普通 Rule body action 与 Breakpoint replacement 建立独立正文证据和 marker。</li><li><strong>Steps:</strong><ul><li>协议设计完成</li><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ RuleService 27/27、Protocol 24/24</li><li><strong>Integration:</strong> ✅ Body三态2/2、Breakpoint File 2/2、Archive/HAR 9/9</li><li><strong>E2E:</strong> ✅ 有效Red于marker缺失、当前完整矩阵1/1 Green与完整销毁证据</li><li><strong>Design/Parity:</strong> ✅ 8个明暗Text/File view均0 missing / 0 flagged / 0px，interaction 13/13</li></ul></td>
  <td><ul><li>当前只有 rule hit，没有原始/最终、text/file、request/response 的 body effect 契约。</li></ul></td>
  <td><ul><li>公开协议记录最终writer与Original三态；Capture主ref恒为Final，Request保存Original，Response明确unavailable；Archive保真、HAR仅Final，Renderer提供marker与版本切换。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Breakpoint final Rule state and marker</td>
  <td><ul><li>全部普通 actions 执行后再暂停，editor 显示最终 header 与最终写入者 marker。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ✅ RuleService/message-editing 28/28</li><li><strong>Integration:</strong> ✅ Proxy Core通过</li><li><strong>E2E:</strong> ✅ 89d8dda retrospective Red、当前1/1 Green与完整销毁证据</li><li><strong>Design/Parity:</strong> ✅ Interaction 3/3</li></ul></td>
  <td><ul><li>旧 priority loop 遇到 breakpoint 立即 await，且 pending headers 丢失 effect 来源。</li></ul></td>
  <td><ul><li>两阶段执行非-breakpoint action 与 suspension，并在协议中携带 <code>ruleEffect/ruleId</code>。</li></ul></td>
</tr>

<tr>
  <td><strong>✅ 已完成</strong></td>
  <td>Breakpoint context-menu hierarchy</td>
  <td><ul><li>让 Breakpoint 与 Block 同属 Control group，并对齐 icon、文字与 hint。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码已完成</li><li>自动验证完成</li><li>已完成</li></ul></li><li><img src="image-15.png" alt="Context menu" width="240"></li></ul></td>
  <td><strong>✅ 完成</strong><ul><li><strong>Code:</strong> ✅ 完成</li><li><strong>Unit:</strong> ➖ N/A</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ✅ 89d8dda几何Red、当前1/1 Green与完整销毁证据</li><li><strong>Design/Parity:</strong> ✅ 根4/4、二级8/8</li></ul></td>
  <td><ul><li>两种菜单项 DOM 层级不同，文本左缘相差 <code>7.4375px</code>。</li></ul></td>
  <td><ul><li>将 Breakpoint submenu 放回 Control group，以自有语义 label 组合内容。</li></ul></td>
</tr>

<tr>
  <td><strong>⏳ 未开始</strong></td>
  <td>Breakpoint queue stepping and batch commands</td>
  <td><ul><li>让多个 HTTP / WebSocket breakpoint 以独立逻辑队列连续调试，同时保留 Capture 对普通请求的自由查看，并提供语义明确的批量操作。</li><li><strong>Steps:</strong><ul><li>产品决策完成</li><li>待设计</li><li>待协议变更</li><li>代码待完成</li><li>待自动验证</li></ul></li></ul></td>
  <td><strong>❌ 未开始</strong><ul><li><strong>Code:</strong> ❌ 未开发</li><li><strong>Unit:</strong> ❌ 未开始</li><li><strong>Integration:</strong> ❌ 未开始</li><li><strong>E2E:</strong> ❌ 未开始</li><li><strong>Design/Parity:</strong> ❌ 未开始</li></ul></td>
  <td><ul><li>当前 Core 只有一个包含 HTTP 与 WebSocket pending 的注册表；Renderer 的 breakpoint selection 与 Capture exchange selection 又彼此独立。解除当前项后，Breakpoint Store 会把不可见 draft 回退到 pending 首项，但 Capture 仍选中旧 exchange，因此不会在 UI 中进入下一条。</li><li>当前只保存一个 draft；切去查看普通 Request 或其他 pending 项时，无法为每个 breakpoint 独立保留临时编辑。</li><li>现有 timeout 会让仍在排队、尚未进入编辑状态的项自行继续或丢弃，与人工断点队列语义冲突。</li></ul></td>
  <td><ul><li><strong>逻辑队列：</strong>Core 可以继续使用一个 pending registry，但每项必须带 <code>queueKey</code>。HTTP Request / Response / WebSocket Upgrade 进入一个 <code>http</code> 逻辑队列；每条 WebSocket 连接使用独立 <code>ws:&lt;exchangeId&gt;</code> 队列，同一连接的双向 message / ping / pong / close 按 <code>createdAt</code> 排序。HTTP 不阻塞 WebSocket，不同 WebSocket 连接也互不阻塞；每个逻辑队列内部允许队首阻塞后续项。</li><li><strong>Capture 与 Detail：</strong>所有 pending 仍是普通 Capture Request / WebSocket 连接行，可同时显示暂停状态，也可被现有 filter 隐藏；filter 只影响行可见性，不改变队列。Capture selection 保持独立，用户可随时查看任意普通非-breakpoint Request。只有选中项对应其逻辑队列当前队首时才显示可编辑 Breakpoint Detail；非队首 pending 按普通 Request / connection Detail 展示，并标记为 <code>Queued</code>（不是网络 loading）。</li><li><strong>队首推进：</strong>Continue / Forward edited / Drop 后必须根据 Core 最新 pending snapshot 重新计算该逻辑队列队首，不能使用旧数组下标。若用户仍停留在刚处理的队首 exchange，则自动选择同一逻辑队列的新队首；若用户已切去查看普通 Request 或其他队列，则不得抢焦点。HTTP 同一 exchange 后续产生 Response breakpoint、WebSocket 同一连接后续产生 frame breakpoint 时，按各自队列自然进入下一项。</li><li><strong>客户端断开：</strong>abort 只移除对应 pending breakpoint 和临时 draft；Capture Request / connection 行不删除，而是进入 aborted / failed 等普通终态并继续提供普通 Detail。例如 <code>A → B → C</code> 中 B 断开后队列变为 <code>A → C</code>，处理 A 后以最新 snapshot 进入 C。</li><li><strong>删除 timeout：</strong>移除 HTTP 与 WebSocket breakpoint 的 finite / infinite timeout 产品能力，包括协议字段、Core timer / <code>onTimeout</code>、Rules 与 WebSocket UI、导入解析、i18n 与 MCP 参数，不保留兼容路径。pending 只由用户 Continue / Forward edited / Drop、客户端 abort 或 Core / RPC 生命周期关闭释放；生命周期关闭不得再伪装成用户 timeout。</li><li><strong>草稿生命周期：</strong>草稿按 <code>breakpointId</code> 独立保存，不只按 exchange 保存，避免同一 HTTP exchange 的 Request / Response 以及同一 WebSocket 连接的多方向 frame 相互覆盖。切换 Capture selection 时保留；重新选中同一 pending 时恢复。只有 Forward edited 应用草稿；Continue unmodified 忽略草稿。Continue、Forward edited、Drop、abort、pending 消失或 Core 换代后删除对应临时内容，绝不写入 Capture 原始数据或持久化配置。</li><li><strong>非队首 resolve：</strong>Core 不强制 FIFO，也不拒绝非队首 ID。每个 suspension 独立，按 ID Continue / Drop 非队首项只会将其移出 registry，不改变当前队首；非队首没有编辑器时不产生 edited payload。队首是默认编辑目标和 UI 顺序，不是协议锁。</li><li><strong>批量命令：</strong><code>Continue all</code> 与 <code>Drop all</code> 作用于当前逻辑队列；<code>Continue all from this rule</code> 按当前 <code>ruleId</code> 筛选全部 pending。三种用户意图必须是独立协议 / Preload / Main / Core 命令，不用布尔参数、空 ID 或魔法 payload 复用；执行时允许解除非队首项，并在完成后按最新 snapshot 推进各受影响队列。</li><li><strong>计数与保护：</strong>全局 pending badge 继续汇总所有逻辑队列；队列拆分不得取消现有容量保护、auto-continue 诊断、客户端 abort 和 Core shutdown 清理。容量应继续以一个有界 pending registry 为系统安全边界，逻辑分组只决定展示、推进与批量命令作用域。</li></ul></td>
</tr>

<tr>
  <td><strong>⏳ 未开始</strong></td>
  <td>Rules action tag overflow</td>
  <td><ul><li>Rule row 最多显示两个 action tags，超出时显示可聚焦的省略入口，Tooltip 按原顺序展示完整 tags。</li><li><strong>Steps:</strong><ul><li>待设计</li><li>代码待完成</li><li>待自动验证</li></ul></li></ul></td>
  <td><strong>❌ 未开始</strong><ul><li><strong>Code:</strong> ❌ 未开发</li><li><strong>Unit:</strong> ❌ Overflow 计算未覆盖</li><li><strong>Integration:</strong> ➖ N/A</li><li><strong>E2E:</strong> ❌ 多 tag 与 Tooltip 交互未覆盖</li><li><strong>Design/Parity:</strong> ❌ 未开始</li></ul></td>
  <td><ul><li>Rule row 内联渲染全部 action tags，没有数量上限，会挤压 hit count 和可用宽度。</li></ul></td>
  <td><ul><li>先在 design-vite 定稿；产品只渲染前两个 tag 与 Ellipsis，Tooltip 显示完整有序 tags，并补窄宽度 parity 与 hover/focus E2E。</li></ul></td>
</tr>

<tr>
  <td><strong>🔄 进行中</strong></td>
  <td>MCP server Main/Core integration</td>
  <td><ul><li>接入已完成的 MCP package 到 Desktop/Main/Core。</li><li><strong>Steps:</strong><ul><li>设计完成</li><li>代码待完成</li><li>待自动验证</li></ul></li></ul></td>
  <td><strong>🔄 部分完成</strong><ul><li><strong>Code:</strong> 🔄 Package 完成，Desktop 未开发</li><li><strong>Unit:</strong> ✅ Package 45/45</li><li><strong>Integration:</strong> ❌ Desktop 链路未开始</li><li><strong>E2E:</strong> ❌ 未开始</li><li><strong>Design/Parity:</strong> ❌ 未开始</li></ul></td>
  <td><ul><li><code>b326bc3</code> 只交付独立 package，未接入 Desktop/Main/Core。</li></ul></td>
  <td><ul><li>按 <a href="../features/mcp.md">MCP feature</a> 完成 transport、runtime、Preload、Settings 与 approval 全链路。</li></ul></td>
</tr>

<tr>
  <td><strong>⏳ 未开始</strong></td>
  <td>Desktop application attribution</td>
  <td><ul><li>修复 Douyu 等桌面应用的 request 被错误归类到 Edge。</li><li><strong>Steps:</strong><ul><li>等待用户确认问题截图与可复现操作</li><li>待设计</li><li>代码待完成</li><li>待自动验证</li></ul></li><li><img src="image-6.png" alt="Application attribution" width="240"></li></ul></td>
  <td><strong>❌ 未开始</strong><ul><li><strong>Code:</strong> ❌ 未开发</li><li><strong>Unit:</strong> ❌ 未开始</li><li><strong>Integration:</strong> ❌ 未开始</li><li><strong>E2E:</strong> ❌ 未开始</li><li><strong>Design/Parity:</strong> ➖ N/A</li></ul></td>
  <td><ul><li>未知；没有截图对应请求的进程与 socket 证据时不能猜测。</li></ul></td>
  <td><ul><li>用户确认截图与复现操作后，记录 request socket、PID、可执行路径与 client identity 匹配链，再定位 owner。</li></ul></td>
</tr>

<tr>
  <td><strong>⏳ 未开始</strong></td>
  <td>Duplicate application identities</td>
  <td><ul><li>消除 Capture filter 中看似相同的重复 Application。</li><li><strong>Steps:</strong><ul><li>待设计</li><li>代码待完成</li><li>待自动验证</li></ul></li><li><img src="image-7.png" alt="Duplicate application" width="240"></li></ul></td>
  <td><strong>❌ 未开始</strong><ul><li><strong>Code:</strong> ❌ 未开发</li><li><strong>Unit:</strong> ❌ 未开始</li><li><strong>Integration:</strong> ❌ 未开始</li><li><strong>E2E:</strong> ❌ 未开始</li><li><strong>Design/Parity:</strong> ➖ N/A</li></ul></td>
  <td><ul><li>未知；可能是 identity key 重复、显示名碰撞或 facet snapshot 重复。</li></ul></td>
  <td><ul><li>用带真实 id/path 的 fixture 复现并定义去重契约，不按显示名盲目合并。</li></ul></td>
</tr>

</tbody>
</table>
</div>
