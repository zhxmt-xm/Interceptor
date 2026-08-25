# Rules Workflows

本文件定义 Rules 工作区的完整 E2E 流程。每条 workflow 都独立启动 Electron、独占 profile/trace，并通过真实 Rules UI、Preload、Core RuleStore 与 Proxy data plane 验证。

<a id="rules-load-search-select"></a>
## `rules.load-search-select`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile/evidence，启动trace与新Electron。
2. 等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned且系统设置未修改。
3. 点击 `shell.workspace.rules`，检查Rules相关初态：revision=0、rules=[]、dirty=false、selection=null、hits为空。
4. 在 `rules.search` 依次输入现有rule name、matcher字段和action字段片段。
5. 每次确认只过滤可见rows，不改变底层顺序或revision。
6. 点击动态 `rules.row.<ruleId>`，确认Editor显示同一rule的name/enabled/matchers/actions。
7. 清空search，确认全部rules按priority恢复并保持selection。
8. 保存evidence，点击 `shell.window.close`。
9. 验证Main/Core/Worker全退和8888释放。
10. 删除profile。

### 预期效果

Rules页面通过真实Core读取权威RuleSet；搜索只作用于视图；选择、revision、hits和Editor数据一致；App可完整销毁。

<a id="rules-root-toolbar"></a>
## `rules.root-toolbar`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile/evidence，启动trace与新Electron，等待`app.root`、真实Core PID和`127.0.0.1:8888`可连接。
2. Driver 等待冷启动系统代理接管收敛：正常自动接管时直接进入Recording；只有接管失败或ownership lost出现readiness时才dismiss，测试不重复查找或点击该dialog。
3. 点击`shell.workspace.rules`，确认初始tree为空，并检查`rules.toolbar.create`、`rules.toolbar.create-folder`和`rules.toolbar.export`三个命令可见；空tree时Export必须disabled。
4. 点击`rules.toolbar.create`，等待动态`rules.row.<ruleId>`出现并被选中，确认dirty状态和detail editor可见；此时Export必须enabled。
5. 点击`rules.toolbar.create-folder`，等待动态`rules.folder-row.<folderId>`出现，确认rule与folder都保留且新folder进入原地命名状态。
6. 全程只使用公共`data-automation-id`、`aria-pressed`、`disabled`和DOM状态，不读取当前语言文案或翻译后的`aria-label`。
7. 保存trace、截图、Main/Renderer日志与metadata；点击`shell.window.close`，验证Main/Core/Worker退出、8888释放、系统代理无副作用并删除profile。

### 预期效果

Rules根级高频命令始终在Collection toolbar可见；新建落点与现有selection语义一致，根右键菜单仍是辅助入口；空tree不能导出，出现节点后Export恢复可用。

### TDD证据要求

- 修复前提交运行同一workflow，必须失败在首个`rules.toolbar.*`控件不存在；selector、fixture、语言、构建或环境失败不算Red。
- 当前提交运行同一workflow，三个toolbar命令及创建状态全部Green，并完成trace/evidence与销毁验证。
- 2026-08-17：实现前Red精确失败于`rules.toolbar.create`不可见；实现后`1/1` Green，rule editor、folder inline rename、Export disabled/enabled状态均通过，`gracefulDestroyVerified=true`且8888释放。

<a id="rules-hierarchy-menus-status"></a>
## `rules.hierarchy-menus-status`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、trace、evidence与HTTP loopback origin；启动本地production Electron，等待App/Core/8888并通过真实UI开始Recording。
2. 进入Rules，在根空白处打开公共右键菜单创建一级目录；通过目录More菜单连续创建二、三级目录并逐层行内rename，确认第三层New subfolder disabled。
3. 在第三层目录菜单新建rule；确认rule row已选中且editor打开。右键rule并行内rename，动态rule ID保持不变。
4. 新rule缺condition/action时，公共status状态为invalid、validation issue count非零、Apply disabled；`rules.replace`不得发生。
5. 填写默认host matcher与request header action的name/value，打开rule enable switch；确认status转dirty、validation清空、Apply enabled。
6. 选择一级目录，确认目录`aria-pressed=true`但`rules.editor.name`仍保留打开rule；重新选择rule后点击Apply，等待status=applied且revision增加。
7. Reload Renderer并重新进入Rules，确认Core恢复同一目录树、rule ID/name/enabled、revision与applied状态。
8. 测试客户端显式经8888发送匹配GET；等待动态hit count变1。rule右键Show matching requests从disabled变enabled，点击后导航Capture；展开Rule facet并确认目标rule option `aria-pressed=true`。
9. 附加目录/rule ID、status状态、revision、hit count与导航证据；正常Close，由Main恢复系统代理，并验证Main/Core/Renderer退出、8888释放和profile删除。

### TDD证据要求

- Unit Red：含未填写项的RuleSet调用`applyRules()`时，当前实现仍调用`replaceRules`；修复后命令不发出。
- Electron Red：新建不完整rule时status=invalid，但Apply仍enabled；selector、构建、listener、UAC或fixture失败不算Red。
- Green必须覆盖同一三级树/menu/selection/status/Apply/reload/hit/navigation flow及完整销毁。

### TDD证据

- Unit Red：不完整RuleSet调用`applyRules()`返回true并实际调用`replaceRules`；修复后Rules Store `19/19` Green，命令未发出且saving保持false。
- Electron Red：status已是`invalid`且issue count=2，但Apply仍enabled。
- Electron Green：三级目录x坐标`98 / 124 / 150`，第三级New subfolder disabled；invalid→dirty→applied状态一致，Apply后revision=1，Renderer reload从Core恢复相同rule ID/name/enabled；真实GET让origin收到`x-rules-e2e: active`并令hit count=1，Show matching requests导航到Capture且目标Rule facet为pressed。
- 销毁：Main/Core退出、8888释放、系统代理由Main恢复，`gracefulDestroyVerified=true`。

### 预期效果

树组织、editor打开项、节点命令、validation、持久化、命中数与Capture导航共享同一rule身份；invalid草稿不能进入Core。

<a id="rules-action-tag-overflow"></a>
## `rules.action-tag-overflow`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile、trace和evidence，启动真实Electron，等待App/Core/8888并进入Rules。
2. 通过真实Rules UI创建一条测试rule，依次添加四种能产生不同chip的action并保持原顺序；本flow不Apply，不承担action字段完整性验收。
3. 确认rule row只内联显示前两个action chips，省略入口可见且hit count仍完整位于行尾；三级目录中的同一rule不得产生横向溢出。
4. 鼠标hover省略入口，确认Tooltip按原顺序展示四个完整chips；移开后Tooltip关闭。
5. 用键盘聚焦同一省略入口，确认Tooltip再次显示；按Enter或Space不得改变rule selection、editor身份或enabled状态。
6. 保存行宽、chip顺序、Tooltip、selection/editor与overflow证据，正常Close。
7. 验证Main/Core/Worker退出、8888释放、系统代理恢复并删除profile。

### 预期效果

Rule row始终为名称、命中数和树缩进保留空间；超过两个action时只收起视觉标签，不丢失完整有序信息，鼠标与键盘都能访问且不触发其他行命令。

### TDD证据要求

- Unit Red先锁定四个派生chip只返回前两个内联项且保留完整有序列表；实现后同一测试Green。
- 真实Electron Red必须失败于省略入口缺失或仍渲染超过两个内联chip，不能由selector、fixture、构建或环境失败代替。
- Green必须覆盖hover/focus Tooltip、三级目录窄宽度、selection/editor不变与完整销毁。

### TDD证据

- Design Red：四action设计场景等待`Show all 4 actions`失败于元素不存在；实现后hover/focus与完整顺序交互`1/1` Green，design全量interaction `15/15`通过。
- Unit Red：两条测试都精确失败于`deriveRuleRowChips is not a function`；实现后`2/2` Green，Desktop全量`315/315`通过。
- Electron Red：真实UI完成三级目录与四action后等待动态`rules.action-overflow.<ruleId>`15秒仍不存在；Red Main/Core PID为`16704/14708`，`gracefulDestroyVerified=true`。
- Electron Green：同一workflow `1/1`通过，行`clientWidth/scrollWidth=416/416`，Ellipsis `22×22px`且位于hit count之前；行内顺序`map/rewrite`，Tooltip顺序`map/rewrite/flow/brk`，keyboard激活后`folderSelected=true / ruleSelected=false / editorName`与enabled不变。Green Main/Core PID为`10760/28336`，`gracefulDestroyVerified=true`且8888释放；相邻`rules.hierarchy-menus-status`同轮`1/1` Green。
- Parity：light/dark各9个target，合计`18/18 matched / 0 missing / 0 flagged / 全几何0px`；完整报告为`142 views / 992 targets / 958 matched / 34 missing / 306 flagged / 平均2.52%`，本项未新增missing或flagged。

<a id="rules-create-edit-delete"></a>
## `rules.create-edit-delete`

**状态**：passed
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 点击 `shell.workspace.rules`，检查revision=0、rules=[]、dirty=false、selection=null并记录row count。
3. 在 Rules tree 空白处打开根级右键菜单，点击 `rules.create`，确认新rule自动选中、dirty=true、detail Save 可用。
4. 在 `rules.editor.name` 输入唯一名称；切换 `rules.editor.enabled` off/on，确认列表同步。
5. 点击 `rules.more`→`rules.delete`，确认只删除新rule。
6. 验证未点击Apply前，离开再返回Rules时草稿状态符合当前Renderer约定，Core revision未增加。
7. 若需要清理草稿，重新加载权威RuleSet；确认初始rules未改变。
8. 保存evidence，点击Close。
9. 验证进程/8888销毁。
10. 删除profile。

### 预期效果

Create、rename、toggle、delete只修改选中草稿并准确维护dirty；Apply前不写Core RuleStore；删除不会误伤相邻rule。

<a id="rules-matcher-variants"></a>
## `rules.matcher-variants`

**状态**：passed
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Rules，检查rules=[]、dirty=false和Editor未选择；点击 `rules.create` 创建专用测试rule。
3. 每次点击 `rules.add-condition`，依次选择 `rules.condition.method/host/path/url/query/header/status/mime`。
4. 通过动态 `rules.matcher.<ruleId>.<index>.<field>` 编辑match mode、name、value、regex和status范围。
5. 验证八种matcher按添加顺序组成AND；切换mode后不保留不适用字段。
6. 输入非法regex、空header name、反向status range，确认精确diagnostic path/message并使Apply disabled。
7. 修复输入，再通过动态remove ID逐项删除；确认后续index和diagnostic path更新。
8. 保存evidence，点击Close。
9. 验证销毁。
10. 删除profile。

### 预期效果

八种matcher的可序列化模型、默认值、模式和校验准确；非法输入不进入RuleStore；删除与索引更新稳定。

<a id="rules-action-variants"></a>
## `rules.action-variants`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Rules，检查rules=[]、dirty=false和Editor未选择；创建专用rule。
3. 每次点击 `rules.add-action`，依次选择 `rules.action.header/query/body/status/synthetic/map-local/map-remote/block/delay/breakpoint`。
4. 通过动态 `rules.action.<ruleId>.<index>.<field>` 编辑phase、operation、name/value、JSON body、path、URL、status和delay。
5. 验证request/response phase只显示适用字段，默认值与协议模型一致。
6. 清空条件与action的必填字段，确认启用开关置灰、Editor列出未填写项，且该规则不会命中任何真实请求。
7. 修复后逐项删除action，确认相邻action不变、顺序稳定。
8. 保存evidence并Close。
9. 验证进程/8888销毁。
10. 删除profile。

### 预期效果

11种action均可通过真实Editor构造；字段、phase和安全校验准确；无运行时callback或不可序列化值进入模型。

<a id="rules-reorder"></a>
## `rules.reorder`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Rules，检查revision=0、rules=[]、dirty=false；通过UI创建至少三条rule，点击Apply持久化。
3. 通过 Rules tree 空白处根级右键菜单的 `rules.create-folder` 建两级目录，把三条规则分别放在根和目录中。
4. 直接拖动动态 `rules.row.<ruleId>` 到另一规则行的上/下四分之一区域，确认前后插入语义与 DFS 顺序。
5. 拖动动态 `rules.folder-row.<folderId>` 到另一目录中，确认整个子树一起移动；尝试落入自身子树或形成第 4 级目录，确认没有落点且树不变。
6. 在第三级目录打开 `rules.folder-menu.<folderId>`，确认 New subfolder disabled；在 `rules.search` 输入过滤条件，确认拍平结果行 `draggable=false`，清空搜索后恢复。
7. 点击 detail header 的 `rules.apply`；离开并返回Rules，确认Core重新加载后的列表顺序和priority与UI一致。
8. 保存evidence并Close。
9. 验证销毁。
10. 删除profile。

### 预期效果

整行拖拽按树的 DFS 顺序生成连续 priority；目录子树、成环与 3 级上限语义稳定；搜索态防止不完整列表拖拽；Apply并重新加载后Core持久顺序与UI一致。运行时命中顺序由`rules.runtime-hit`验证。

<a id="rules-validate-apply"></a>
## `rules.validate-apply`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Rules，检查revision=0、rules=[]、dirty=false并记录revision；创建rule并通过UI添加合法matcher/action。
3. 观察 validation 文案出现在 Rules statusbar，确认 detail header 的 `rules.apply` enabled。
4. 点击 detail header 的 `rules.apply`；保存过程中确认按钮disabled/显示Applying。
5. 等待成功，确认revision+1、dirty=false、statusbar同时显示 Rule set applied 与当前 rule compile 状态。
6. 关闭App并验证销毁，但保留该profile。
7. 用同一profile启动第二份Electron/trace，进入Rules确认rule和revision持久存在。
8. 保存evidence并点击Close。
9. 验证第二次销毁和8888释放。
10. 删除profile。

### 预期效果

只有dirty且valid的RuleSet可Apply；乐观revision准确；写入成功后状态清理；RuleStore可跨Core/App重启持久化。

<a id="rules-apply-conflict"></a>
## `rules.apply-conflict`

**状态**：planned / blocked，需先实现可在零Mock条件下安全共享RuleStore且listener不冲突的双实例fixture
**策略**：shared

### Steps

1. 创建独立测试根目录和evidence，准备两个真实App实例可安全访问同一RuleStore但使用独立Chromium profile的环境；若无法满足，workflow保持blocked。
2. 启动实例A和B各自的trace/Electron，等待两边App/Core及各自真实listener；在两边点击readiness Cancel并确认系统代理未修改。
3. 两边从UI检查dirty=false并加载同一revision；A、B各自通过UI编辑不同内容。
4. 在A点击 `rules.apply`，等待revision+1和成功状态。
5. 在B点击 `rules.apply`。
6. 验证B收到真实conflict，不覆盖A；UI显示conflict/reload状态。
7. 在B通过真实UI重新加载权威RuleSet，确认展示A的内容与新revision。
8. 分别保存A/B evidence并点击各自Close。
9. 验证两套Main/Core/Worker/listener全部销毁。
10. 删除两个profile和共享测试存储。

### 预期效果

真实乐观并发冲突被发现；旧revision无法覆盖新RuleSet；恢复过程不使用service mock或直接Store注入。

<a id="rules-runtime-hit"></a>
## `rules.runtime-hit`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和可记录请求内容的HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查RuleSet初始revision/dirty和Capture空态。
2. 点击readiness Enable并完成授权，等待Recording；进入Rules，通过UI创建matcher和一个可观察action（header/body/status/delay/block之一），点击Apply。
3. 测试客户端通过8888发送一条匹配请求和一条不匹配请求。
4. 在Rules等待目标rule hit count只增加一次。
5. 点击 `shell.workspace.capture`，打开两条动态request rows并比较实际结果。
6. 返回Rules，使用动态 `rules.toggle.<ruleId>` 禁用规则并Apply。
7. 再发送一条原本匹配的请求，确认不再命中且结果未改写。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Rule不仅能编辑和保存，也真实作用于Proxy数据面；匹配/不匹配、hit count、Capture结果和禁用行为一致。

<a id="rules-body-effect-evidence"></a>
## `rules.body-effect-evidence`

**状态**：passed
**策略**：native-ui + privileged UI

### Steps

1. 创建独立profile、trace与可记录request/response body的loopback origin，启动真实Electron并通过UI开始Recording。
2. 通过Rules UI创建request Breakpoint；发送带非空原文的POST，经Capture选择Text replacement并Forward edited，确认origin收到Final，Capture marker绑定breakpoint rule、source=Text，默认Final，Original/Final可双向切换，marker可导航回Rules。
3. 停用Breakpoint，通过Rules UI创建request Text body rule并Apply；用chunked POST隔离已登记framing债务，确认origin收到Final、Capture marker绑定普通rule，Original/Final分别可读。
4. 创建response Text body rule并Apply；origin返回chunked正文，确认客户端和Capture都是Final，marker绑定该rule、source=Text，Original control disabled且状态为unavailable。
5. 同时启用普通request writer与request Breakpoint；Breakpoint Text覆盖普通writer后，确认只显示Breakpoint marker，普通writer marker不存在，Original仍是客户端入站正文。
6. 经产品BodyViewer Save和真实Save Dialog生成唯一文件；创建response Breakpoint并通过真实Open Dialog选择同一文件，显式删除冲突的`transfer-encoding`后Forward edited，确认source=File、绝对路径未进入Renderer/evidence、客户端与Capture Final字节等于文件、Original unavailable。
7. 同一阶段额外发送Continue unmodified与只编辑header的请求，确认原文不变且不出现body marker。
8. Native Archive round-trip保真与标准HAR只含Final、不含body effect历史的边界下沉到transfer unit/integration，本workflow不直接构造导入文件。
9. 保存Original/Final、ruleId/source/availability、origin观察、trace、日志与metadata；正常Close并验证Main/Core/Worker退出、8888释放、系统代理恢复并删除临时文件/profile。

### 预期效果

Body marker只来自真实Rule/Breakpoint replacement；Request能检查Original与Final，Response明确Original unavailable；Text/File、request/response、最终写入者与Rules导航一致，不泄漏本地文件路径。

### TDD证据要求

- 实现前同一workflow必须因`requestBodyEffect/responseBodyEffect`与Inspector marker/version controls不存在而Red，不能用selector、fixture、原生Dialog或构建失败代替。
- unit/integration Red先于产品实现，分别锁定RuleService最终写入者、Breakpoint Text/File、Capture存储、Native Archive与HAR边界；当前实现后同一矩阵与真实Electron workflow全部Green并完成销毁证据。

### TDD证据

- Red：RuleService unit中转发state已是最终正文但`bodyEffect=undefined`；真实Capture integration中主Request ref仍指向Original且双向effect均缺失；Native Archive导入丢失effect；真实Electron在Text replacement已到达origin后等待`capture.body-rule-effect.<ruleId>`15秒仍不存在。Red Main/Core PID为`10656/24836`，`gracefulDestroyVerified=true`。
- Green：RuleService `27/27`、Body effect三态`2/2`、Breakpoint File相关`2/2`、Archive/HAR`9/9`通过；真实Electron同一workflow`1/1`通过上述Text/File/request/response/final-writer/负例矩阵。
- 视觉：Request/Response × Text/File × light/dark 8个view均`0 missing / 0 flagged / 0px`；design interaction `13/13`。
- 销毁：Green Main/Core PID为`45548/23816`，`gracefulDestroyVerified=true`；产品Save生成的临时文件已删除，8888无listener、无Interceptor/Electron残留，WinINet恢复`127.0.0.1:7890`。

<a id="rules-import-tree"></a>
## `rules.import-tree`

**状态**：planned
**策略**：native-ui

### Steps

1. 创建独立profile/evidence，启动trace与新Electron，等待`app.root`、真实Core PID与`127.0.0.1:8888`可连接；Driver按既有约定收敛冷启动系统代理接管。
2. 进入Rules，确认初始tree为空。通过`rules.toolbar.create`创建两条rule：第一条通过UI填完matcher与action并用`rules.toggle.<ruleId>`启用，第二条保持未启用；再通过`rules.toolbar.create-folder`建一层目录并把第二条拖入。点击`rules.apply`持久化，记录revision与两个ruleId。
3. 点击`rules.toolbar.export`，先确认`rules.export.busy`遮罩出现且底层按钮、Escape、Tab均不可操作；在真实Save Dialog中用键鼠输入本workflow临时目录下的`.json`路径并确认，等待遮罩消失。测试侧只读解析该文件，断言顶层为`{ nodes }`、目录层级与UI一致、两条rule的`enabled`分别为true/false，并记录文件内的全部`id`。该文件是本workflow用产品UI真实产生的唯一导入输入，测试不另行构造任何文件。
4. 通过`rules.toolbar.import`打开真实Open Dialog，确认`rules.import.busy`遮罩存在且不可关闭；用键鼠选择同一文件并确认。等待`rules.import.dialog`出现，断言其报告的rule数、folder数与**已启用条数**与文件内容一致。
5. 点击`rules.import.cancel`，直接读取DOM确认`rules.row.*`与`rules.folder-row.*`数量、顺序、revision与dirty状态全部未变——取消不得写入任何节点。
6. 再次执行导入并点击`rules.import.confirm-apply`；确认写入期间Dialog的关闭、Cancel、遮罩点击与Escape均被禁用。等待Dialog关闭、新节点出现且revision递增，断言：树中rule总数翻倍；新增节点的`id`与步骤3记录的文件内`id`**没有交集**；新增两条rule的`enabled`与文件一致；新增目录层级与文件一致；新增内容整体排在原有节点之后。
7. 离开Rules再返回，确认Core重新加载后的树、revision与新增节点身份一致，导入确认本身已经原子持久化，不需要第二次点击Apply。
8. 再次通过同一入口导入同一文件并确认，验证重复导入稳定累加且不产生同id节点，不出现任何覆盖或合并。
9. 全程只使用公共`data-automation-id`、DOM状态属性与测试自产数据判定，不依赖任一语言的显示文案。
10. 保存trace、截图、导入前后的树快照JSON、Main/Renderer日志与metadata；点击`shell.window.close`，验证Main/Core/Worker退出、8888释放、系统代理无副作用并删除profile与临时文件。

### 预期效果

导入是纯新增：文件内容整体追加到现有树末尾，既不覆盖也不合并本地任何节点。节点`id`全部重新生成，因此同一文件可重复导入而不产生同id不同内容的节点；`enabled`沿用文件值；层级与文件一致。确认Dialog在写入之前给出准确计数，取消后树零变化，确认后经既有`rules.replace`原子持久化。文件读写与确认写入期间均有不可关闭遮罩，不能误操作底层UI。

结构非法的文件、节点字段错误与越界层级由共享tree parser及Renderer owning parser的unit测试覆盖：产品UI无法导出这类文件，在E2E里制造它们只能靠测试写文件，属于禁止的seed行为。

### TDD证据要求

- 实现前提交运行同一workflow，必须精确失败于`rules.toolbar.import`入口不存在；selector笔误、fixture、语言、构建或环境失败不算Red。
- 当前提交运行同一workflow全部Green，涵盖取消零变化、id不复用、enabled沿用、层级保持、追加位置、重复导入累加与Core持久化，并完成trace/evidence与销毁验证。
- 导入输入文件必须由本workflow的真实Export产生；出现测试自建输入文件即视为该条Green无效。

### TDD证据

- Retrospective Red：最终workflow源码在`884dcc4`精确失败于`rules.toolbar.import`不存在；同环境`rules.root-toolbar`为Green，排除构建、listener与fixture失败。
- Green：当前`1/1`通过。真实Save Dialog生成`rules-roundtrip.json`，三次真实Open Dialog覆盖取消、确认和重复确认；两条rule与一层目录依次扩展为4/2、6/3个节点，新增id不复用，enabled保持true/false，revision为`1→2→3`。
- 销毁：Main PID `34724`、Core PID `20512`均退出，`gracefulDestroyVerified=true`，8888释放，系统代理恢复原值。
