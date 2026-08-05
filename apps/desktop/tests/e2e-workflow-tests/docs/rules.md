# Rules Workflows

本文件定义 Rules 工作区的完整 E2E 流程。每条 workflow 都独立启动 Electron、独占 profile/trace，并通过真实 Rules UI、Preload、Core RuleStore 与 Proxy data plane 验证。

<a id="rules-load-search-select"></a>
## `rules.load-search-select`

**状态**：planned
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

<a id="rules-create-edit-delete"></a>
## `rules.create-edit-delete`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 点击 `shell.workspace.rules`，检查revision=0、rules=[]、dirty=false、selection=null并记录row count。
3. 点击 `rules.create`，确认新rule自动选中、dirty=true、Apply可用。
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

**状态**：planned
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
3. 通过 `rules.create-folder` 建两级目录，把三条规则分别放在根和目录中。
4. 直接拖动动态 `rules.row.<ruleId>` 到另一规则行的上/下四分之一区域，确认前后插入语义与 DFS 顺序。
5. 拖动动态 `rules.folder-row.<folderId>` 到另一目录中，确认整个子树一起移动；尝试落入自身子树或形成第 4 级目录，确认没有落点且树不变。
6. 在第三级目录打开 `rules.folder-menu.<folderId>`，确认 New subfolder disabled；在 `rules.search` 输入过滤条件，确认拍平结果行 `draggable=false`，清空搜索后恢复。
7. 点击 `rules.apply`；离开并返回Rules，确认Core重新加载后的列表顺序和priority与UI一致。
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
3. 观察validation变为可应用状态，确认 `rules.apply` enabled。
4. 点击 `rules.apply`；保存过程中确认按钮disabled/显示Applying。
5. 等待成功，确认revision+1、dirty=false、statusbar Rule set applied。
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
