# Diagnostics Workflows

本文件定义 Diagnostics 工作区的完整 E2E 流程。每条 workflow 独立启动 Electron、独占 profile/trace，并通过真实 App 操作产生诊断记录。

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
