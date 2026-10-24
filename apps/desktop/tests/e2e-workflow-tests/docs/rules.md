# Rules Workflows

## 原流程与可选步骤截图

只保留原Rules workflow。必要的差集补到已有场景，不把整套教程改名或追加为另一批test。

- `root-toolbar.workflow.ts`保留空树、根命令与目录断言，继续使用刚创建的规则核对request/response Header set/append/remove、Query set/remove、Status、Synthetic额外Header、Delay实际阈值、Block两模式与停用恢复、Map Remote和Map Local。Map Local文件只能来自同轮产品Save；仅改Content-Encoding保持原字节，显式Body替换才验证gzip及Content-Length。

- `hierarchy-menus-status.workflow.ts`复用原层级、校验、持久化、命中与导航，补八类AND条件的真实正反例、contains/Aa/exact/regex/MIME wildcard、排序覆盖、搜索、目录重命名/折叠以及非最后规则和空目录删除。

- 当前Release允许Apply无效正则`[`但恒不匹配；最后规则删除后没有Apply入口仍是既有边界，不构造备用规则伪装修复。

- `body-effect-evidence.workflow.ts`保留Original/Final、最终写入者、Text/File和Header effect；HTTPS跨scheme/host/port映射复用`capture/tls-scenarios.workflow.ts`的真实TLS连接。

- `mcp/streamable-http.workflow.ts`在原第二写入者步骤核对未Apply本地草稿、冲突、Core实际remote结果与显式Reload；不直接写Store。原`import-tree`、`tools-import`、`tools-export`继续验证文件与身份。

### Capture 可见结果与正文工具

- 既有客户端请求、origin响应定义、规则输入和网络断言保持不变。完成原网络断言后，再通过真实Capture导航、Keyword和自产请求行检查结果；不为截图再发一条请求，不把Rules编辑器当作Capture结果图。
- Capture请求行的公共选中属性是`aria-pressed`；再次点击已选中的行会取消选择。补图步骤先读取当前属性，仅在未选中时点击，之后仍须断言`aria-pressed=true`；不能删除选择断言或改猜其他aria属性。
- 重复Path按当前请求的公共行ID区分；GET/POST使用协议方法区分。匹配反例必须清除Rule facet限制，不能因只显示命中项而漏掉未命中的请求。
- Header截图显示对应request/response区块及`data-effect`来源；Query使用既有origin echo响应中的`path`证明实际改写，不把Capture保留的入站Query说成最终转发地址。Map Remote检查同一入口exchange的映射响应，不伪造第二条target Capture记录。
- root-toolbar的正文内容通过Raw模式下正式Copy取得并逐字比较完整文本；Monaco DOM的软换行、缩进和分片不能作为响应正文。Query另行核对解析出的完整`path`及remove后的参数缺失，不通过全局剥空白修正断言。
- 所有高亮控件或区块在截图前完整滚入视口。检查后返回进入Capture前选中的同一Rule ID，不改草稿、启用状态、条件或动作顺序。
- 普通Body的Raw、Copy、Fullscreen和Save均操作当前选中的Original/Final。保存副本通过真实Save Dialog产生，核对完整字节后清理，不替代原File replacement步骤使用的源文件。

命令、输出清单和显式导入边界见[套件说明](../README.md#trace-与证据)。已有公开PNG及历史验收记录保持原来源，新的运行不会自动替换它们；本节不把未经执行的平台或分支记为通过。

本文件定义 Rules 工作区的完整 E2E 流程。每条 workflow 都独立启动 Electron、独占 profile/trace，并通过真实 Rules UI、Preload、Core RuleStore 与 Proxy data plane 验证。

内置Agent的`rules_get_tree`、`rules_get_hits`与`rules_replace_tree`纵向流程由
[`agent.tools.rules`](agent.md#agent-tools-rules)拥有。它复用真实Rules UI创建输入与本文件既有revision/hit/effect契约，
但不替代Rules工作区自身的层级、菜单、冲突与编辑器workflow。
外部MCP提交后的Renderer同步由[`mcp.desktop.streamable-http`](mcp.md#mcp-desktop-streamable-http)拥有，使用官方Client
和真实origin验证`rules_get_tree → rules_replace_tree`、revision事件与跨重启恢复。

<a id="rules-load-search-select"></a>
## `rules.load-search-select`

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

**策略**：shared

### Steps

1. 创建独立profile/evidence，启动trace与新Electron，等待`app.root`、真实Core PID和`127.0.0.1:8888`可连接。
2. Driver 等待冷启动系统代理接管收敛：正常自动接管时直接进入Recording；只有接管失败或ownership lost出现readiness时才dismiss，测试不重复查找或点击该dialog。
3. 点击`shell.workspace.rules`，确认初始tree为空，并检查`rules.toolbar.create`、`rules.toolbar.create-folder`和`rules.toolbar.export`三个命令可见；空tree时Export必须disabled。
4. 点击`rules.toolbar.create`，等待动态`rules.row.<ruleId>`出现并被选中，确认dirty状态和detail editor可见；此时Export必须enabled。
5. 点击`rules.toolbar.create-folder`，等待动态`rules.folder-row.<folderId>`出现，确认rule与folder都保留且新folder进入原地命名状态。
6. 通过真实UI确认Recording，在刚创建的规则填写`E2E action variants`、Host `127.0.0.1`、Path `/e2e/rules/actions`；请求Header为`x-e2e-action: from-rule`，启用并Apply。
7. 保留request/response Header set/append/remove的原请求与origin/client断言；每次通过Capture筛选并选中该次请求，展开对应Headers区块，核对字段、值和来源标记后截图，再返回同一Rule。
8. 保留`entry=original → entry=rewritten`以及remove的原网络断言。Capture Request展示入站Query，Response展示同一请求的origin echo `path`：分别为`/e2e/rules/actions/query-set?entry=rewritten`和`/e2e/rules/actions/query-remove`；截图后回到Rule继续。
9. Status `418`、Synthetic `503`及其Header/Body、Delay `500`毫秒、Block reset/close和停用恢复各自在既有网络断言之后查看Capture。状态与失败查看Headers/General，Synthetic查看其响应Header与正文，Delay查看Timing；不改变原延迟阈值或阻断断言。
10. Map Remote保留原入口到`remote-target`的origin断言，并在Capture查看该exchange的`mapped-target-body`；Map Local仍只使用同轮产品Save的`rule-map-source.json`，分别检查缺失文件`404`和修正后`200`/文件正文。
11. 仅改`content-encoding: gzip`时查看Capture响应Header与未转换正文/解码提示；显式Body替换后查看真实解码内容及长度。保持原gzip解压、Content-Length和最终停用恢复断言。
12. 全程只使用公共`data-automation-id`、`aria-pressed`、`disabled`、协议值及DOM状态，不使用翻译后的文案定位，也不通过API或Store注入选中项。
13. 保存trace、步骤截图、Main/Renderer日志与metadata；点击`shell.window.close`，验证Main/Core/Worker退出、8888释放、系统代理恢复并删除profile。

### 预期效果

Rules根级高频命令始终在Collection toolbar可见；新建落点与现有selection语义一致，根右键菜单仍是辅助入口；空tree不能导出，出现节点后Export恢复可用。

### 验收要求

- 三个`rules.toolbar.*`命令及创建状态必须由真实UI验证；selector、fixture、语言、构建或环境失败不算产品故障。
- 所有Capture截图必须能对应同次已断言的自产请求；字段改写、Query echo、状态、Timing、阻断和映射不能只保留Rules配置截图。
- 同一workflow完成trace/evidence与销毁验证。

<a id="rules-hierarchy-menus-status"></a>
## `rules.hierarchy-menus-status`

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
9. 在目标Rule facet下显式选中`/e2e/rules/hierarchy-status`，查看请求Header `x-rules-e2e: active`。截图后清除facet限制，点击Header的Rule来源标记返回原Rule ID，并核对选中状态。
10. 增加Method、Path、URL、Query、request Header、Status和response MIME，与Host组成八类AND；效果动作改为response Header。保持原GET/POST网络输入与断言，每次在Capture选中对应协议方法的自产行，核对GET响应含`active`、POST无此Header。
11. 保留contains、Aa大小写、exact、无效/有效regex和`application/*`的所有原请求及断言；每次查看该次新Capture行的response Headers并截图。相同Path的后一次请求不能误选前一次结果。
12. 保留嵌套规则与根规则对`x-rules-e2e`的竞争输入：顺序调整前为`root`、调整后为`nested`；分别在已断言的请求中查看request Headers和来源，再返回此前打开的同一Rule。删除竞争规则后的`nested`结果也使用对应新请求检查。
13. 保留规则名称搜索、目录rename/collapse、非最后规则删除、规则移回根级和空目录分支删除，并Apply最终树。
14. 附加目录/rule ID、status状态、revision、hit count、Capture来源与导航证据；正常Close，由Main恢复系统代理，并验证Main/Core/Renderer退出、8888释放和profile删除。

### 验收要求

- unit验证含未填写项的RuleSet调用`applyRules()`时不发出`replaceRules`。
- 真实Electron中新建不完整rule时status=invalid且Apply禁用；selector、构建、listener、UAC或fixture失败不算产品故障。
- 同时覆盖三级树/menu/selection/status/Apply/reload/hit/navigation流程及完整销毁。
- AND、匹配模式和priority的Capture画面来自各自已完成的原请求，反例不能套用正例行；检查后Rule身份与编辑状态不变。

### 预期效果

树组织、editor打开项、节点命令、validation、持久化、命中数与Capture导航共享同一rule身份；invalid草稿不能进入Core。

<a id="rules-action-tag-overflow"></a>
## `rules.action-tag-overflow`

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

**策略**：native-ui + privileged UI

### Steps

1. 创建独立profile、trace与可记录request/response body的loopback origin，启动真实Electron并通过UI开始Recording。
2. 通过Rules UI创建request Breakpoint；发送带非空原文的POST，经Capture选择Text replacement并Forward edited，确认origin收到Final，Capture marker绑定breakpoint rule、source=Text，默认Final，Original/Final可双向切换，marker可导航回Rules。
3. 停用Breakpoint，通过Rules UI创建只包含Body action的request Text rule并Apply；发送明确的chunked POST，确认origin收到Final并保留chunked、没有Content-Length，Capture marker绑定普通rule，Original/Final分别可读。不再加入旧的Transfer-Encoding删除绕行，否则会把正文场景变成无framing的不同输入。
   - 选择Original，切到Raw，Copy并读取真实剪贴板核对`{"stage":"regular-original"}`；打开Fullscreen检查同一正文，关闭后Original和Raw仍保持。
   - 通过正文Save和真实Save Dialog保存`body-effect-regular-request-original.json`，读取完整字节核对Original；选择Final后对`{"stage":"regular-final"}`重复Raw、Copy、Fullscreen和Save，文件名为`body-effect-regular-request-final.json`。
   - 保存并截图后仍保留所选版本；点击Body来源标记返回该普通Rule ID，再执行原停用步骤。副本不作为后续File replacement输入。
4. 创建response Text body rule并Apply；origin返回chunked正文，确认客户端和Capture都是Final，marker绑定该rule、source=Text，Original control disabled且状态为unavailable。
   - 只操作可用的Final，核对Raw、Copy、Fullscreen及`body-effect-regular-response-final.json`的完整内容都是`{"stage":"response-final"}`，保留Original不可用状态；截图后返回同一Rule。
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
   - 原网络断言结束后，在Capture Headers选择对应request/response区块，显示`x-effect-layout`与真实set/append来源；点击Header来源标记返回同一Rule ID，核对选中状态和editor名称，再执行原停用步骤。
5. 两阶段均完成后停用测试规则，保存trace/metadata并正常Close；fixture验证Main/Core/Worker、8888、WinINet和journal恢复。

### 预期效果

Body marker只来自真实Rule/Breakpoint replacement；Request能检查Original与Final，Response明确Original unavailable；Text/File、request/response、最终写入者与Rules导航一致，不泄漏本地文件路径。

### 验收要求

- 实现前同一workflow必须因`requestBodyEffect/responseBodyEffect`与Inspector marker/version controls不存在而Red，不能用selector、fixture、原生Dialog或构建失败代替。
- unit/integration先验证RuleService最终写入者、Breakpoint Text/File、Capture存储、Native Archive与HAR边界，再执行同一矩阵对应的真实Electron workflow并核对销毁。
- Header布局只改变显示；修改产品CSS前先确认断点编辑/Store基线，再以真实UI几何断言验证目标差异，不把selector或环境失败算Red。
- 正文工具和Header返回均在既有网络断言之后真实点击，不更换请求/响应输入、不改写Open/Save返回值。新增步骤真实运行前，不将旧Green或静态typecheck当作这些画面的验收结果。

<a id="rules-tools-export"></a>
## `rules.tools.export`

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
