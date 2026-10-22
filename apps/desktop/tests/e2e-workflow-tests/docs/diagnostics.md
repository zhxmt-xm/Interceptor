# Diagnostics Workflows

## 原流程与可选步骤截图

Diagnostics只保留原`tools-queries-export.workflow.ts`，截图由同一流程的option开启。

- 原Recent/Trace静默查询、顺序、脱敏、Ask/Auto、真实Save取消/确认和文件过滤保持不变。

- 页内差集在同一流程补充：历史来自真实Composer Send，不写数据库；自有失败连接与404 PAC产生实际结果，按main/error/failed选择、读取时间线、拖动分栏、清空筛选并加载较早历史。

- JSONL由产品导出并核对真实分类，最后回Composer重新发送成功请求。Composer网络失败可以作为正常命令结果返回，diagnostic success不等于HTTP成功。

- 步骤图记录实际PAC错误与原路线、Diagnostics分类/选择/分栏/较早历史、导出入口和保存后状态；Agent记录请求、Recent/Trace结果、Deny/Allow、Save取消与导出任务，MCP记录独立审批和原生Save。原生保存位置由既有file-dialog在确认前记录，不能在未知个人目录截图。所有网络、过滤、文件内容、权限和退出断言保持原流程。

- 不伪造取消/超时记录、不新增不存在的时间线展开控件，不把PNG代替原日志、文件及正常退出断言。

命令、输出清单和显式导入边界见[套件说明](../README.md#trace-与证据)。已有公开PNG及历史验收记录保持原来源，新的运行不会自动替换它们；本节不把未经执行的平台或分支记为通过。

<a id="diagnostics-tools-queries-export"></a>
## `diagnostics.tools.queries-export`

**状态**：passed
**策略**：native-ui；Windows；两代真实Electron；host-safety-guard

### Steps

1. 使用独立profile启动真实Electron，通过Settings配置本地Provider；Chat discovery必须披露Trace、Recent
	和Export三项。通过Composer UI发出两次带测试敏感query的本地请求，等Diagnostics UI出现自产记录。
2. Agent在Ask模式查询Recent，确认有界records、顺序、droppedCount及无审批；从正式返回记录取得traceId，
	查询Trace并逐项核对身份，不向Model返回原始URL凭据/正文。重复查询不能自行新增diagnostics记录。
3. Ask请求Export并Deny，不开原生Dialog、不产生文件；Allow后真实Cancel，返回started=false。再次Allow
	选路径并按process/level/outcome过滤启动任务，结果只有公开job、明确started而非completed；只读检查
	实际JSONL输出存在、每行有效且满足过滤，敏感测试文本不出现在文件中。
4. 切Auto再次真实Save并验证输出；打开/保存仍需真实键鼠，不改写Dialog返回值、不注入业务文件。
	通过Settings分别关闭三项Agent权限，旧Chat拒绝调用；MCP权限保持独立。
5. 通过产品UI创建官方MCP Client，执行两项静默查询并验证同一数据，按MCP Ask/Auto执行Export、Deny与
	原生Cancel；撤销MCP三项权限后旧连接不能发现或执行，不重复打开文件Dialog。
6. 正常退出首代，复用profile重启后授权保持、Model/origin/文件操作零重放；记录两代Main/Core/Worker销毁、
	8888释放、完整WinINet/journal恢复和脱敏trace/evidence，再删除产品产生的输出及profile。

### 预期与证据

最小Red必须来自缺失Tool或正式行为缺口，不能来自环境、selector或原生Dialog驱动失败。Core只读与导出模块
已有语义不改；空trace、有界参数、预取消/迟到选择与原子任务错误由对应unit/integration覆盖。Evidence仅保存
记录身份、计数、文件hash与协议结论，不保存原始秘密。人工与macOS验收继续独立，不以Windows结果代替。

<a id="diagnostics-list-detail"></a>
## `diagnostics.list-detail`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 点击 `shell.workspace.diagnostics`，检查相关初态：Process/Level/Outcome均为All(null)、selection=null；记录允许存在的真实Core启动记录keys，不要求列表为空。
3. 通过UI执行唯一URL的Composer发送、`settings.storage.refresh`和Rules Apply，产生可识别的Core/Main记录。
4. 返回Diagnostics，等待真实query返回新增rows；检查每行的process、command、level、outcome、duration。
5. 点击目标动态 `diagnostics.row.<traceKey>`。
6. 检查Detail中的process、trace/request ID、outcome、duration、errorCode。
7. 验证timeline按sequence排序且包含对应action/command completed。
8. 确认步骤2记录与新增记录按真实时间/sequence合并且无静态fixture。
9. 保存evidence并点击Close。
10. 验证进程/8888销毁，关闭origin并删除profile。

### 预期效果

Diagnostics展示真实Core/Main命令链，不使用静态fixture；List与Detail属于同一trace，timeline排序和标识准确。

<a id="diagnostics-filters"></a>
## `diagnostics.filters`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Diagnostics，检查Process/Level/Outcome均为All(null)、selection=null；通过UI产生成功与失败的真实Core/Main/Renderer记录。
3. 进入Diagnostics，循环点击 `diagnostics.filter.process` 覆盖null/core/main/renderer。
4. 循环点击 `diagnostics.filter.level` 覆盖各level。
5. 循环点击 `diagnostics.filter.outcome` 并组合三类filter。
6. 每次检查所有可见rows满足当前组合；无对应真实记录的选项显示空态，当前selection被过滤掉时Detail清空。
7. 等待一次轮询，确认query/refresh本身没有污染列表。
8. 保存evidence并Close。
9. 验证销毁。
10. 删除profile。

### 预期效果

Filter变化触发权威Core query；组合条件准确；selection与轮询合并稳定；Diagnostics查询不会自污染。

<a id="diagnostics-pagination"></a>
## `diagnostics.pagination`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Diagnostics，检查filters=All(null)、selection=null和当前真实startup records；再通过UI重复执行足够多命令，产生超过一页的记录。
3. 进入Diagnostics，记录首页keys和next-cursor对应的UI状态。
4. 点击 `diagnostics.load-earlier`，确认旧records追加在尾部。
5. 在App其他workspace产生一条新记录，返回Diagnostics等待轮询合并到头部。
6. 再次点击Load earlier，确认无重复/跳页且已加载历史不被首页轮询覆盖。
7. 重复直到按钮消失。
8. 保存evidence并Close。
9. 验证销毁。
10. 删除profile。

### 预期效果

Keyset pagination稳定；历史追加、新记录头部合并和去重同时成立；hasMore=false后停止加载。

<a id="diagnostics-export"></a>
## `diagnostics.export`

**状态**：planned
**策略**：native-ui

### Steps

1. 创建profile/evidence、HTTP origin和预定输出目录，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Diagnostics检查filters=All(null)；通过Composer UI向唯一敏感query URL发送请求，产生可识别的真实诊断记录。
3. 进入Diagnostics，通过process/level/outcome automation IDs设定filter。
4. 点击 `diagnostics.export`。
5. 在App真实Save Dialog选择JSONL路径。
6. 等待exporting结束；若失败，检查UI error并不产生/覆盖目标文件。
7. 成功时逐行解析JSONL，检查每行满足filter，敏感键和URL query均已脱敏。
8. 保存evidence并Close。
9. 验证销毁。
10. 删除输出文件、关闭origin并删除profile。

### 预期效果

导出由真实UI/Main dialog/Transfer job完成；输出原子且双层脱敏；Renderer不获得绝对路径。

<a id="diagnostics-resize"></a>
## `diagnostics.resize`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Diagnostics，检查默认splitter宽度、filters=All(null)和selection=null；通过UI产生记录并选择一条动态row。
3. 拖动 `diagnostics.splitter` 到Detail最小宽度。
4. 检查List columns、ID pills和timeline可读。
5. 拖到中间，再拖到List最小宽度。
6. 改变一个filter并加载下一页，确认resize不丢selection/filter/pagination。
7. 检查页面无重叠和横向溢出。
8. 保存evidence并Close。
9. 验证销毁。
10. 删除profile。

### 预期效果

Diagnostics两面板遵守宽度约束；timeline/IDs不重叠；resize不影响查询、选择或分页状态。
