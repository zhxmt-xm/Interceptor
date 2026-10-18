# Rules Workflows

## 教程逐步骤录制

`guidebook-header.workflow.ts`在真实Release从空树创建`Guide test header`，依次填写Host `127.0.0.1`、Path `/guide/rules/order`和请求Header `x-interceptor-guide: rules-demo`，启用、Apply后由外部客户端产生匹配与非匹配请求，核对源站实际Header、命中与Capture详情，再停用并Apply。每个操作步骤保留独立原生截图与视频位置；不通过Store、Preload或业务API创建规则。

使用独立教程录制配置；本流程不代替其他matcher/action及原生导入导出验收。结束后正式Close和宿主guard必须证明代理、进程及8888恢复。

补充实录由`guidebook-actions.workflow.ts`逐个核对Query、Body、Status、Synthetic、Delay、Block、Map Remote和Map Local，后者必须先用产品Save body生成输入文件。`guidebook-matchers.workflow.ts`构造全部八类条件并用真实GET/POST核对AND正反例；`guidebook-organization.workflow.ts`核对可见顺序导致的真实Header覆盖、目录拖动、Export、Import取消与追加。它们保存独立步骤图和真实输入值，不把未执行的组合归为已通过。

macOS原生文件选择沿用共享fixture：先回读完整GoTo路径，再真实双击唯一匹配的自产文件/目录建议项，使用原生Save/Open或Cancel按钮收尾；不发送关闭GoTo的Return，不更改系统输入法或应用语言。实际导出文件、导入预览、取消零写入和退出恢复仍由每条workflow独立核验。

`guidebook-response-evidence.workflow.ts`补录独立的`Guide response and body`示例：由空白区域菜单创建，只匹配`127.0.0.1`与`/guide/response-evidence`；响应Header `x-guide-list`依次append `two`与remove，客户端核对原值`one`的保留及移除。随后通过UI改为请求Body，发送`{"message":"guide-original"}`并替换为`{"message":"guide-final"}`，逐步录制Original/Final、Copy、Fullscreen、原生Save body和效果标记跳转。响应Body另用`{"message":"guide-response-final"}`，明确核对Original不可用；最后停用并Apply，以新请求证明恢复。每步保留原生图和影片位置，保存文件必须由产品产生，正常Close及宿主guard核对代理、CA、进程和8888。

`guidebook-tree.workflow.ts`实录三级目录、第四级禁用、空规则校验、目录重命名/搜索/折叠、规则菜单跳Capture及Header效果返回。`Guide nested priority`与`Guide root priority`实际比较后写覆盖，再删除非最后一条规则与已空目录并Apply，验证剩余规则仍命中；最后一条保留停用，不添加无业务作用的备用规则或宣称空树删除已修复。全程使用自有Host/Path，正常Close及宿主guard核对退出恢复。

`guidebook-matching-modes.workflow.ts`在同一`Guide matching modes`规则中实录contains、Aa大小写、exact、regex及无效`[`的实际行为，再用Response Header动作验证`application/*`的JSON正例与text/plain反例。当前Release会保存无效正则并恒不匹配，不伪造语法诊断或把“已应用”当作输入正确。每次Apply后用带公开`x-guide-case`的真实请求区分结果，不额外给被测Path添加query；在Capture检查同一请求再返回编辑。正则/大小写控件只通过已存在的匹配字段及其三枚按钮操作，不给Release补隐藏属性或直接改Store。

`guidebook-response-controls.workflow.ts`补录Synthetic的额外Header、Delay/Block/Synthetic各自停用后的实际恢复，明确操作reset与close两种模式。编码部分先只改Response `content-encoding:gzip`并证明原始字节没有被压缩，再添加显式Body替换，核对真实gzip字节、自动更新的原Content-Length和Capture解码正文；不把只改Header描述成编码转换。所有动作只作用于自有前缀，最后停用Apply并正常Close。

`guidebook-conflict.workflow.ts`通过正式UI创建初始规则，随后保留未Apply的local草稿；已配置的本机官方MCP SDK发起`rules_replace_tree`，用户真实Ask允许后写入remote版本。核对草稿保留、冲突状态、Core实际新请求使用remote，之后显式Reload并基于最新revision编辑merged、Apply和验证流量。Client凭据在录制前复制到内存且不展示，不注入Store、不假装外部商业Host；最后停用规则、关闭MCP并正常Close。

`guidebook-routing.workflow.ts`把自有HTTPS localhost输入经Map Remote改到另一HTTP 127.0.0.1端口与路径，复用真实TLS socket读取客户端响应，并独立核对目标origin，不要求已被绕过的原origin再收到请求。停用后原HTTPS端点对未配置的例子路径恢复404，不冒充业务200。Map Local先用本轮目录中未创建的文件名得到真实404，再改成同流程Save body产生的JSON文件并验证完整字节；不预造输入、不调用个人服务或删除日常CA。最后停用规则、清理本轮TLS设置并正常Close。

本文件定义 Rules 工作区的完整 E2E 流程。每条 workflow 都独立启动 Electron、独占 profile/trace，并通过真实 Rules UI、Preload、Core RuleStore 与 Proxy data plane 验证。

内置Agent的`rules_get_tree`、`rules_get_hits`与`rules_replace_tree`纵向流程由
[`agent.tools.rules`](agent.md#agent-tools-rules)拥有。它复用真实Rules UI创建输入与本文件既有revision/hit/effect契约，
但不替代Rules工作区自身的层级、菜单、冲突与编辑器workflow。
外部MCP提交后的Renderer同步由[`mcp.desktop.streamable-http`](mcp.md#mcp-desktop-streamable-http)拥有，使用官方Client
和真实origin验证`rules_get_tree → rules_replace_tree`、revision事件与跨重启恢复。

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

### 验收要求

- 三个`rules.toolbar.*`命令及创建状态必须由真实UI验证；selector、fixture、语言、构建或环境失败不算产品故障。
- 同一workflow完成trace/evidence与销毁验证。

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

### 验收要求

- unit验证含未填写项的RuleSet调用`applyRules()`时不发出`replaceRules`。
- 真实Electron中新建不完整rule时status=invalid且Apply禁用；selector、构建、listener、UAC或fixture失败不算产品故障。
- 同时覆盖三级树/menu/selection/status/Apply/reload/hit/navigation流程及完整销毁。

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

### 验收要求

- unit验证四个派生chip只返回前两个内联项且保留完整有序列表。
- 真实Electron显示省略入口且内联chip不超过两个；selector、fixture、构建或环境失败不能代替业务结果。
- 同时覆盖hover/focus Tooltip、三级目录窄宽度、selection/editor不变与完整销毁。

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

**状态**：passed（Body与Header effect布局两条真实用例）
**策略**：native-ui + privileged UI

### Steps

1. 创建独立profile、trace与可记录request/response body的loopback origin，启动真实Electron并通过UI开始Recording。
2. 通过Rules UI创建request Breakpoint；发送带非空原文的POST，经Capture选择Text replacement并Forward edited，确认origin收到Final，Capture marker绑定breakpoint rule、source=Text，默认Final，Original/Final可双向切换，marker可导航回Rules。
3. 停用Breakpoint，通过Rules UI创建只包含Body action的request Text rule并Apply；发送明确的chunked POST，确认origin收到Final并保留chunked、没有Content-Length，Capture marker绑定普通rule，Original/Final分别可读。不再加入旧的Transfer-Encoding删除绕行，否则会把正文场景变成无framing的不同输入。
4. 创建response Text body rule并Apply；origin返回chunked正文，确认客户端和Capture都是Final，marker绑定该rule、source=Text，Original control disabled且状态为unavailable。
5. 同时启用普通request writer与request Breakpoint；Breakpoint Text覆盖普通writer后，确认只显示Breakpoint marker，普通writer marker不存在，Original仍是客户端入站正文。
6. 经产品BodyViewer Save和真实Save Dialog生成唯一文件；创建response Breakpoint，File未选择时验证112px居中区域与32px高、11.5px字号的按钮并保存区域截图。通过真实Open Dialog选择同一文件，显式删除冲突的`transfer-encoding`后Forward edited，确认source=File、绝对路径未进入Renderer/evidence、客户端与Capture Final字节等于文件、Original unavailable。
7. 同一阶段额外发送Continue unmodified与只编辑header的请求，确认原文不变且不出现body marker。
8. Native Archive round-trip保真与标准HAR只含Final、不含body effect历史的边界下沉到transfer unit/integration，本workflow不直接构造导入文件。
9. 保存Original/Final、ruleId/source/availability、origin观察、trace、日志与metadata；正常Close并验证Main/Core/Worker退出、8888释放、系统代理恢复并删除临时文件/profile。

### Header effect布局追加用例

1. 独立启动真实Electron并开始Recording；通过Rules UI分别创建request/set和response/append规则，各自同时包含同阶段Breakpoint，字段为`x-effect-layout`、值为`from-rule`。
2. loopback请求和响应均包含普通Header；选择真实paused行，确认快照存在相应effect且value为`from-rule`。
3. 保存每个阶段的Header区域截图与几何JSON；断言所有name/value输入框等宽，effect距value下方2px、右对齐、9px字号和12px高，普通行30px、effect行44px，行内没有横向溢出。
4. 通过input临时修改value再恢复，通过Add/Remove增删一行；Continue unmodified放行，request在origin验证set值，response在客户端验证append值，确认布局调整未改变规则结果。
5. 两阶段均完成后停用测试规则，保存trace/metadata并正常Close；fixture验证Main/Core/Worker、8888、WinINet和journal恢复。

### 预期效果

Body marker只来自真实Rule/Breakpoint replacement；Request能检查Original与Final，Response明确Original unavailable；Text/File、request/response、最终写入者与Rules导航一致，不泄漏本地文件路径。

### 验收要求

- 实现前同一workflow必须因`requestBodyEffect/responseBodyEffect`与Inspector marker/version controls不存在而Red，不能用selector、fixture、原生Dialog或构建失败代替。
- unit/integration Red先于产品实现，分别锁定RuleService最终写入者、Breakpoint Text/File、Capture存储、Native Archive与HAR边界；当前实现后同一矩阵与真实Electron workflow全部Green并完成销毁证据。
- Header布局只改变显示；修改产品CSS前先确认断点编辑/Store基线，再以真实UI几何断言验证目标差异，不把selector或环境失败算Red。

<a id="rules-tools-export"></a>
## `rules.tools.export`

**状态**：passed
**策略**：native-ui；Windows；host-safety-guard；两代真实Electron

### Steps

1. 创建独立空profile和证据目录，由宿主guard保存系统状态；启动Electron并经Rules UI创建两条
	enabled不同的规则及一层目录，Apply后记录公共ID、顺序和revision。通过Settings UI配置本地Provider。
2. 默认Ask Chat发现`rules_export`；发起导出后在真实审批卡Deny，确认没有打开原生Dialog、没有输出
	文件且RuleSet不变。
3. 再次导出并Allow，取消真正的Save Dialog；返回`exported=false`，无输出文件，Core规则不变。
4. 再次Allow并用真实键鼠选择本workflow输出位置；等待成功，测试只读解析产品生成的JSON，验证
	完整`{ nodes }`、enabled、目录层级、ID和当前已保存规则一致。Model结果只含exported，不含路径或正文。
5. 切换Auto再次导出，跳过应用审批但仍打开Save Dialog；保存并比较文件结构。编辑UI草稿不Apply后
	再经Tool导出，确认导出已保存规则且用户草稿不被覆盖；UI自己的导出仍保留现有草稿语义。
6. 通过Settings关闭Agent导出权限，旧Chat再调用得到unknown_tool且不打开Dialog；MCP开关独立。
7. 经产品UI启用MCP、创建Ask Client并复制配置给官方Client；在Agent已关闭时仍可发现/调用导出。
	Deny不写；Allow经真实Save Dialog保存与同一Core规则一致的JSON；切Auto后原生Cancel返回false。
	关闭MCP授权后当前连接不再披露Tool，旧调用被拒绝。复制的Token必须注册脱敏审计，不进入证据。
8. 正常关闭第一代并验证进程/8888/宿主恢复；使用同profile重启，Model请求增量0、历史导出不重放、
	Agent/MCP关闭项保持。正常关闭第二代并保存两代gracefulDestroyVerified与脱敏trace/evidence。
9. 只在完整销毁确认后删除本workflow生成的文件和profile。不得直接构造规则输入、覆写原生Dialog
	返回值或把Browser/fake Preload测试当本条E2E。

### 预期与证据

导出不修改Core规则或UI草稿；取消、拒绝、撤权均不写文件。Red必须精确来自新Tool未披露/未实现，
不是Dialog、selector或环境错误。Green保留文件结构比较、审批裁决、脱敏、重启零重放与完整销毁证据。

<a id="rules-tools-import"></a>
## `rules.tools.import`

**状态**：passed
**策略**：native-ui；Windows；host-safety-guard；两代真实Electron

### Steps

1. 使用独立空profile与证据目录启动Electron，通过Rules UI创建两条enabled不同的规则与一层目录，Apply。
	经真实UI Export和Save Dialog生成本workflow唯一导入输入；测试只读比较输出，不直接构造业务文件。
2. 经Settings UI配置Provider，Ask Chat发现`rules_import`；Deny后没有文件Dialog，树与revision不变。
3. Allow后真实取消Open Dialog，结果`imported=false`；再次Allow选择产品导出的文件，预览中规则/目录/
	enabled/skipped计数正确，取消预览后仍不写入。
4. 再次Allow并选择同一文件，在原ImportConfirmDialog确认；导入节点追加在原树后、所有ID全新，层级、
	enabled与顺序保留，revision立即增加且无需第二次Apply；结果只返回imported与计数/revision。
5. 创建可辨识但未Apply的本地草稿修改；切Auto后再导入同一文件，仍须真实Open和确认。确认后原草稿内容
	与新节点一起按原UI语义持久化，重复导入稳定累加、不覆盖旧节点、不复用旧ID。
6. 关闭Agent导入权限，旧Chat调用unknown_tool且不打开Dialog。经产品UI创建的MCP Client在自身权限开启时
	仍可独立导入；验证MCP Ask的拒绝/允许、原生选择与预览确认、Auto预览取消及MCP撤权不写入。
7. 正常关闭第一代并验证系统恢复；同profile重启后树、revision与两列关闭项保持，Model请求与文件操作增量0。
	正常关闭第二代，保留trace、文件来源哈希、节点身份断言及两代gracefulDestroyVerified证据。
8. 完整销毁后移除本workflow输出和profile。非法JSON、非法节点或越界目录输入下沉unit，不在E2E写坏文件。

### 预期与证据

真实Red必须来自`rules_import`缺失而不是selector或fixture错误。UI和Tool使用同一导入流程与确认Dialog，
取消不写、确认即原子持久化；现有草稿与规则不丢失，Model与证据不包含文件正文、本机路径或MCP Token。

<a id="rules-import-tree"></a>
## `rules.import-tree`

**状态**：passed
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

### 验收要求

- 必须通过`rules.toolbar.import`真实入口执行；selector笔误、fixture、语言、构建或环境失败不算产品故障。
- 覆盖取消零变化、id不复用、enabled沿用、层级保持、追加位置、重复导入累加与Core持久化，并完成trace/evidence与销毁验证。
- 导入输入文件必须由本workflow的真实Export产生；出现测试自建输入文件即视为该条Green无效。
