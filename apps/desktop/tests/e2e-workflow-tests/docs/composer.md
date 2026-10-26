# Composer Workflows

## 原流程与可选步骤截图

只保留原Composer workflow，普通模式与`--screenshots`模式使用同一份操作和断言。

- `collection-tree-interactions.workflow.ts`保留目录、自动保存和分栏，补同一真实文档的Basic/Bearer/None及显式Authorization、JSON/Text/Form/None、Query同名值、字段启停/删除、Recent sends真正重发，以及同级切换/排序和节点删除。认证值只由自有loopback接受；不使用真实账号。

- 重命名后立即卸载的debounce边界之间不插入截图。编辑、菜单、字段选择不得隐式Send；只有显式Send增加源站请求。

- `response-section-collapse.workflow.ts`复用同一响应补Cookies、Timing/Connection、Tree/Raw/Hex、Copy、全屏及响应分栏；格式化仅由原`body-formatting.workflow.ts`维护。

- `body-formatting.workflow.ts`保留HTML/JavaScript自动格式化、CSS手动Format、XML失败原文与文档缓存；新增大JSON的Copy恰为2MiB、前缀符合实际响应且Format disabled。
  - Copy先确认真实成功反馈，再读取剪贴板并等反馈自然收起；不拍遮住内容的累计Copied提示。CSS原文、手动Format和回切恢复均通过真实键盘滚到末尾，确认`.a`规则可见后截图，不仅用剪贴板后缀代替可见结果。回切对象为同一CSS请求，不是HTML请求。

- `tools-collection.workflow.ts`保留Tool读写零隐式发送，重启后仅由用户明确Send一次，检查保存的method/protocol、Header启停、Query、JSON及Auth字节。

- `collection-import`与`tools-transfer`继续负责产品Export→Import、真实原生取消/确认、全新身份、Auto仍需确认及重启。截图清单只在退出及宿主恢复后形成，不再需要录像或字幕。
  - Collection文件Tool的审批保持在Composer，不展示无关Capture流量；退出前仍回到不含测试敏感字段的Capture，并通过真实Keyword只显示本次路径范围。调用、审批、字段脱敏和文件断言保持原步骤，不清理日常数据或修改系统流量。

命令、输出清单和显式导入边界见[套件说明](../README.md#trace-与证据)。已有公开PNG及历史验收记录保持原来源，新的运行不会自动替换它们；本节不把未经执行的平台或分支记为通过。

本文件定义 Composer 工作区的完整 E2E 流程。每条 workflow 独立启动 Electron、独占 profile/trace，并使用真实 Composer UI 和本地 origin。

macOS原生文件选择由共享fixture读取完整GoTo路径、真实双击唯一目标建议项，再用原生Save/Open或Cancel按钮完成；不以窗口消失代替文件结果。完整产品输出、预览确认/取消、重启和宿主恢复断言保持，当前输入法与应用语言不切换。

Composer 由 Core 直接出站，不依赖系统代理路由。因此这些 workflow 只验证 Proxy readiness 的相关默认态（listener=8888、System Proxy未owned、UI Paused），随后点击 `capture.readiness.cancel`，并确认未修改系统设置。它们不重复检查无关的 Capture rows、Rules、Breakpoints、Privacy、CA 或 Updates 状态。

<a id="composer-tools-collection"></a>
## `composer.tools.collection`

**策略**：shared；两代真实Electron；host-safety-guard

### Steps

1. 使用独立profile启动真实Electron；经Composer UI建立两条请求和一级目录，编辑URL、enabled字段行、正文
	与测试自产Auth凭据，等待既有自动保存。经Settings UI配置本地Provider，敏感输入不进入trace或产物。
2. Ask Chat先discovery再调用`composer_get_collection`，确认版本、完整树身份、层级、顺序与请求编辑状态；
	无审批和网络请求，Auth/Header/Query/URL凭据已脱敏。
3. 用查询所得树构造名称/字段修改，Ask调用`composer_replace_collection`；审批只显示请求/目录数量，Deny后
	Core、UI和revision不变。再次Allow后当前已挂载Collection立即同步同一批身份与新内容。
4. 切Auto再次替换，确认不出现审批；随后使用旧revision拒绝覆盖。读取/替换往返保持原凭据，不把遮罩落库；
	从当前UI检查真实Auth与字段值，并确认没有隐式Send或Capture记录。
5. 通过Settings关闭Agent两项权限，旧Chat调用被拒绝；MCP权限独立，产品UI创建的MCP Client可读取并在
	自身Ask/Auto规则下替换。MCP撤权后当前连接不再披露或执行两项。
6. 正常关闭首代并验证完整系统恢复；同profile重启后集合、revision和授权设置保持，Model/origin请求增量0。
	记录两代Main/Core/Worker销毁、8888释放、WinINet/journal恢复与脱敏evidence。

### 预期与证据

Red必须来自新Tool缺失或外部替换UI未同步，不能来自selector、凭据或环境问题。完整结构/非法字段、重复ID、
越界目录和不能由产品生成的输入归owning unit。真实流程证明查询静默、审批有效、原子替换、凭据保留、授权
和重启零重放；不得以fake Preload或Core integration代替本条Electron workflow。

- Main保存方法重构保持以上流程不变，前后均须取得同一workflow Green。
	- UI保存通过IPC返回值确认快照，不因自己的变更通知重新加载正在编辑的内容。
	- Tool保存完成后由同一Main方法通知Renderer；不在Tool分派中另写广播步骤。

- 所有测试均等待公开保存状态，不用固定时间掩盖未保存或吞掉Renderer错误。

<a id="composer-tools-transfer"></a>
## `composer.tools.transfer`

**策略**：native-ui；Windows；两代真实Electron

### Steps

1. 空profile启动真实Electron，经Settings配置Provider，Ask Chat发现导出/导入两项。通过Composer UI创建两条请求
	及目录，编辑Header/Query/JSON/Form/Auth并等待自动保存；产品UI Export经真实Save Dialog产生唯一输入文件。
	测试不得直接构造业务文件或写storage。
2. Ask Deny不打开原生Dialog；Allow导出后真实Cancel不生成文件，
	再次Allow选择路径保存，读取产品输出核对完整已保存树。结果仅含exported，不包含路径或内容。
3. Allow导入先取消原生Open，再选同一产品文件并取消预览，均不改revision或集合。再次确认导入后立即追加，
	节点ID与所有Header/Query/Form行ID全部新生成，层级、顺序及凭据保留，不隐式Send。
4. Auto导出仍经真实Save，Auto导入仍经真实Open与预览确认。重复导入继续追加，不覆盖既有集合；自动保存与
	导入确认不能竞态覆盖，前后revision正确推进。
5. 关闭Agent两项权限后旧Chat被拒绝；MCP独立权限开启时使用产品UI创建的Client验证Deny、Allow、原生选择及
	预览取消/确认，再关闭MCP权限并确认旧连接不能继续执行。
6. 正常退出并复用profile重启，集合/授权保持、Model及文件操作零重放。两代Main/Core/Worker全退、8888释放、
	WinINet/journal恢复，完成trace/evidence后才删除产品产生的临时文件和profile。

### 预期与证据

Red必须来自两项Tool尚未实现，不能使用原生Dialog定位失败作为产品Red。业务输入全部经同workflow产品UI
产生；文件级非法输入与取消/保存竞态的内部边界由unit覆盖。所有结果与证据不包含路径、正文、Auth或Token。

<a id="composer-request-edit"></a>
## `composer.request-edit`

**策略**：shared

### Steps

1. 创建本 workflow 独占的空profile、evidence目录和HTTP loopback fixture；只读确认宿主没有遗留的Interceptor system-proxy ownership或测试CA。
2. 启动独占trace，再用 `_electron.launch()` 启动新的Electron和该profile。
3. 等待 `app.root`、Core Running/真实PID和listener `127.0.0.1:8888`；确认readiness显示System Proxy off、UI Paused/Not recording。
4. 点击 `capture.readiness.cancel`，确认modal关闭、System Proxy仍未owned；点击 `shell.workspace.composer`。
5. 只检查Composer相关默认态：method=GET、URL=`https://`、protocol=Auto，`accept:*/*`与`user-agent:Interceptor/1.0`两个headers均enabled，body为空、auth=none、request tab=Headers、response/history为空。
6. 通过 `composer.method` 依次选择GET/POST/PATCH；在 `composer.url` 输入带重复query的loopback URL。
7. 依次点击 `composer.protocol.auto/h1/h2`，确认selected状态后回到Auto。
8. 在Headers tab添加、编辑、disable、删除header；在Query tab添加/编辑/删除参数并确认URL双向同步；在Body tab输入JSON。
9. 在Auth tab依次选择none/bearer/basic并填写token或username/password；切换tabs确认草稿不丢失。
10. 保存 `final.png`、`trace.zip`、Main/Renderer日志和metadata；点击 `shell.window.close`。
11. 验证Main、Renderer、Core、Worker全退且8888释放；关闭HTTP fixture并删除profile。

### 预期效果

Composer的method、URL、protocol、headers、query、body和auth均从默认态通过真实UI编辑；URL/query双向同步；tabs不丢草稿；整个流程不修改系统代理或其他feature状态。

<a id="composer-collection-tree-interactions"></a>
## `composer.collection.tree-interactions`

**策略**：shared

### Steps

1. 创建独立profile、trace与evidence；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 进入Composer，从Collection toolbar新建根目录并在行内input命名；通过目录More菜单连续新建第二、第三层目录，每层记录公共动态ID与行几何。
3. 打开第三层目录菜单，确认New subfolder为disabled；从同一菜单新建request，填入测试自产URL。
4. 对request行发起真实contextmenu，选择Rename并在同一行内input提交；立即切到Rules再返回Composer，越过600ms保存窗口后确认rename与URL仍由Core恢复，且request ID不变。
5. 点击根目录作为新建落点，确认目录`aria-pressed=true`但URL editor仍保留当前request；点击`composer.collection.tree`空白，确认只清目录选择且URL仍不变。
6. 拖动`composer.collection-splitter`，确认Collection宽度线性变化且当前request/目录树保持可用。
7. 核对首层嵌套目录缩进30px、再下一层增加26px；方法标签在40x16px框内以flex双轴center居中文字，标签框与标题中心对齐，文字上下/左右留白差均不超过一个设备像素。附加目录ID、缩进、菜单disabled、remount persistence、selection、URL、splitter与标签文字几何；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### 验收要求

- 新增或修复交互行为时先取得同一workflow的有效Red；行为与数据格式不变且现有覆盖足够时，确认基线Green后再修改并复跑，不回滚或制造历史Red。
- 有效Red必须来自selection、rename、三级约束、menu或splitter业务缺口；selector、构建、listener或fixture失败不算Red。
- Green必须覆盖同一组UI操作、evidence与完整销毁。

### 预期效果

目录落点与打开文档正交；行内重命名不替换节点身份；三级限制在菜单和store一致；splitter只改变布局，不改变业务状态。

<a id="composer-send-success"></a>
## `composer.send-success`

**策略**：shared

### Steps

1. 创建空profile、evidence目录和返回JSON/custom headers/两个cookies的HTTP fixture；确认宿主无遗留Proxy ownership和测试CA。
2. 启动独占trace与新Electron，等待App root、Core Running和8888 listener。
3. 确认readiness=System Proxy off、UI Paused；点击 `capture.readiness.cancel`，确认系统设置未修改；进入Composer。
4. 只检查Composer默认态：GET、`https://`、Auto、两个默认enabled headers、空body/auth/response/history。
5. 通过UI填写POST、fixture URL、`x-interceptor-e2e-request`、JSON body和Basic或Bearer auth。
6. 点击 `composer.send`，确认按钮进入Sending并暂时disabled。
7. 等待200/OK响应，检查duration、bytes、HTTP version、remote address和TLS summary。
8. 依次打开Body/Headers/Cookies/Raw response tabs，验证JSON、custom response header、两个Set-Cookie与Raw status/header/body完全一致。
9. 确认History新增一条真实记录，且System Proxy仍未owned。
10. 保存evidence并点击 `shell.window.close`。
11. 验证进程/8888销毁，关闭fixture并删除profile。

### 预期效果

Composer通过真实Core直接出站；sending和终态准确；四个response视图共享同一真实响应；无需Enable system proxy，也不会产生Capture副作用。

<a id="composer-response-section-collapse"></a>
## `composer.response.section-collapse`

**策略**：shared

### Steps

1. 创建独立profile、trace和HTTP loopback origin；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 进入Composer，通过`composer.collection.new-request`创建请求，在`composer.url`填写`/e2e/composer/response-section-collapse`并点击`composer.send`；确认真实origin收到GET。
3. 打开`composer.response-tab.headers`，用`composer.response-section.response-headers`与`.request-headers`定位两段；确认初始`aria-expanded=true`，`aria-controls`分别指向`hidden=false`的唯一正文。
4. 依次折叠两段，再重新展开Response Headers；确认同一`aria-controls`正文恢复，每次只切换目标正文的`hidden`与对应按钮的`aria-expanded`，另一段状态保持不变。
5. 保存截图、trace、日志与metadata；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### 预期效果

Response Headers、Request Headers、Cookies、Timing与Connection沿用同一可折叠section语义；折叠不销毁正文内部状态，也不依赖当前语言文本定位。

<a id="composer-response-body-formatting"></a>
## `composer.response.body-formatting`

**策略**：shared

### Steps

1. 创建独立profile、trace和HTTP loopback origin；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 通过Composer UI发送完整且不超过1 MiB的单行HTML响应；等待自动Format结束，点击公共Copy动作并从系统剪贴板确认正文已分行且内容保持。
3. 新建请求并发送小JavaScript响应；确认自动Format补齐空格且Copy读取当前model。
4. 新建请求并发送完整1–2 MiB的单行CSS响应；Format前Copy确认原文无换行，点击公共Format动作，等待busy结束后再次Copy并确认已分行。
5. 新建请求并发送无法解析的XML；记录Renderer page errors，点击Format后确认原文逐字节不变、按钮恢复可用且未新增未处理page error。
6. 不再点击Format，切回此前CSS request；Copy必须仍返回该response的4行格式化视图，证明格式化副本按文档隔离且未改写原始body。
7. 发送超过2 MiB的JSON响应；Copy恰好返回2 MiB预览且与真实响应前缀一致，Format必须disabled，不把预览当作完整响应。
8. 附加正文摘要、CSS恢复摘要与Renderer错误增量；截图模式在上述七个检查点保存PNG。正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### 验收要求

- unit必须验证formatter异常返回原文，不向调用方泄漏异常。
- 真实Electron不得出现格式化内容错误或未处理Renderer error；selector、fixture、构建或listener失败不算产品故障。
- 同时覆盖HTML/JavaScript自动格式化、CSS手动格式化、跨文档恢复、XML失败回退、2 MiB预览边界以及完整销毁。

### 预期效果

code正文按语言使用既有formatter；自动与手动路径共享同一结果语义；失败不改正文、不解锁编辑器、不留下busy或未处理Renderer错误。

<a id="composer-send-failure"></a>
## `composer.send-failure`

**策略**：shared

Core 对非法 URL 与网络错误返回 `ok=false`；Renderer 以 `composer.response[data-send-state=failed]` 的错误态显示原因，不生成可切换的响应 tab 或伪成功正文。失败记录仍进入 History（status=0），成功后清除旧错误。

### Steps

1. 创建空 profile/evidence、有效 HTTP fixture，并取得一个当前未监听的 loopback 端口；启动 trace/Electron，等待 App/Core/8888；冷启动 bootstrap 会接管系统代理，本流程不依赖 Capture。
2. 进入 Composer 新建请求：确认 method=GET、protocol=Auto、URL 为空且 Send disabled、`composer.response[data-send-state=empty]`、History 为空。
3. 输入无 scheme 的非法 URL 并点击 Send：等待出现 `data-send-state=failed`，错误文本非空，不存在 `composer.response-tab.*` 与 `composer.response-body`，Send 恢复可用。
4. 输入 `http://127.0.0.1:<未监听端口>/` 再次 Send：同样进入 failed 错误态，不出现响应 tab、状态码或正文。
5. 改为有效 fixture URL 并再次 Send：等待 `data-send-state=ready`、真实 200 与响应正文；旧错误消失，Headers/Cookies/Timing 与 body mode 可用。
6. 打开 `composer.history`：3 条动态 `composer.history-row.<id>` 按发送倒序；最新 `data-ok=true`/`data-status=200`，前两条 `data-ok=false`/`data-status=0`，且都带数值 `data-duration-ms`。
7. 比较三次发送前后的 System Proxy 快照，确认内容未变；进入 Rules 确认没有创建 Rule 行，再返回 Composer。
8. 保存 evidence 并点击 `shell.window.close`。
9. 验证 Main/Core/Worker 退出、8888 释放与系统代理恢复；关闭 fixture、释放未监听端口并删除 profile。

### 预期效果

非法 URL 和网络失败不会产生成功假象、响应 tab 或锁死表单；失败原因可见；修正后可立即重试成功；History 保留每次真实发送的终态；错误只影响当前 Composer 文档。

### 验收要求

- 错误态只按 `composer.response[data-send-state]` 判定，不读翻译文案；History 用动态 row 的 `data-ok`/`data-status`/`data-duration-ms` 判定。
- 必须验证两次失败、一次成功、旧错误清除、Send 恢复、三条 History 终态、未监听端口、System Proxy 未变、Main/Core/Worker 销毁与 8888 释放。
- selector、构建或 fixture 失败不算产品故障。

<a id="composer-history-new"></a>
## `composer.history-new`

**策略**：shared

### Steps

1. 创建空profile/evidence和HTTP fixture；启动trace/Electron，等待App/Core/8888/readiness；检查System Proxy未owned，点击 `capture.readiness.cancel`并确认系统设置未修改。
2. 进入Composer，确认默认history为空、编辑器为GET/`https://`/Auto。
3. 通过UI发送GET请求A和POST+body请求B。
4. 打开History，确认两个动态rows按时间降序且method/URL/status准确。
5. 依次选择A、B，确认method、URL、headers、query、body、auth和各自response完整恢复。
6. 点击 `composer.new`。
7. 确认恢复GET、`https://`、Auto、两个默认enabled headers、空body/auth/response；History中的A/B仍存在。
8. 再加载A，确认New没有删除或串改历史记录。
9. 保存evidence并点击Close。
10. 验证销毁，关闭fixture并删除profile。

### 预期效果

History只保存真实Composer发送；加载恢复完整请求；New重置编辑器和response但不删除history；无系统代理副作用。

<a id="composer-resize"></a>
## `composer.resize`

**策略**：shared

Composer有两个独立splitter：`composer.collection-splitter`是竖直分隔条，拖X改Collection宽度；`composer.splitter`是水平分隔条，拖Y改Response高度。两者都只在容器空间内clamp；窗口缩小时重新clamp，窗口放大后保持当前值、不自动扩张。

尺寸契约：Collection初始320、最小160、最大为Composer主容器宽度减工作区最小宽480再减1；Response初始368、最小160、最大为主容器高度减标签条40、URL行56、请求区最小180与轨道1。工作流以 `app.main` 的实际client尺寸计算上限，不写死像素。

### Steps

1. 创建空profile/evidence和返回大JSON、长header与Cookie的HTTP fixture；启动trace/Electron，等待App/Core/8888；冷启动bootstrap会接管系统代理，本流程不依赖Capture，退出时由Main恢复。
2. 进入Composer：fresh profile没有打开文档，只有Collection与`NoOpenRequest`，`composer.splitter`不存在；点击 `composer.newRequest` 后确认 `composer.collection-splitter`、`composer.splitter`、`composer.url`、`composer.send` 和空`composer.response`出现。
3. 通过UI发送真实请求，等待真实响应正文与header集合。
4. 记录初始几何：`composer.collection`宽320、`composer.response`高368、`app.main`的client宽高。
5. 向左拖动 `composer.collection-splitter` 到最小：Collection宽=160，URL/Send、请求tab、header editor与正文无重叠；继续向左拖宽度不再减小。
6. 拖到中间，再向右拖到最大：Collection宽=`app.main`宽−480−1，工作区仍可用；继续向右拖宽度不再增大。
7. 向下拖动 `composer.splitter` 到最小：Response高=160，请求区仍可用；继续向下拖高度不再减小。
8. 拖到中间，再向上拖到最大：Response高=`app.main`高−40−56−180−1；继续向上拖高度不再增大。
9. 把真实窗口调小到`1200×700`：两个区域分别按新宽高重新clamp，不低过最小值也不超出新上限；恢复`1600×900`后保持clamp后的值，不自动扩张。
10. 把两个splitter恢复到初始320/368；依次打开Response Body/Headers/Cookies/Timing，在Body切换Pretty/Tree/Raw/Hex，确认长header可换行或滚动、各tab与正文控件不重叠、页面无横向溢出。
11. 通过 `composer.newRequest` 建立第二个文档，切回第一个文档：document tab的`aria-selected`与response正文保持，body mode仍可切换。
12. 保存evidence并点击 `shell.window.close`；验证Main/Core/Worker退出、8888释放与系统代理恢复，关闭fixture并删除profile。

### 预期效果

两个splitter分别控制在上下限内且互不影响；请求/响应控件在极限尺寸可用；窗口缩放只触发clamp，恢复后不自动扩张；resize与文档切换不改变业务状态。

### 验收要求

- 每次拖动记录splitter与目标区域的boundingBox，并连续同向拖动验证最小值不再减小、最大值不再增大。
- 上限用同一时刻 `app.main` 的client宽高计算，误差不超过1px；不写死除契约320/160/368/480/40/56/180/1外的像素。
- 窗口调整只通过平台真实BrowserWindow/原生窗口完成，不修改Renderer样式、viewport或注入宽度；selector、构建或fixture失败不算产品故障。
- 必须同时验证两个splitter的上下限、窗口双向缩小与恢复不扩张、tab/body mode/文档切换、系统代理恢复、Main/Core/Worker销毁与8888释放。

<a id="composer-collection-import"></a>
## `composer.collection.import`

**策略**：native-ui

### Steps

1. 创建独立profile/evidence，启动trace与新Electron，等待`app.root`、真实Core PID与`127.0.0.1:8888`；点击`capture.readiness.cancel`并确认系统代理未被修改。
2. 进入Composer，确认Collection为空。通过UI新建两条request并分别填写method、URL与至少一行query/header；再新建一层目录并把第二条拖入。等待600ms节流写入完成。
3. 点击`composer.collection.export`，确认`composer.export.busy`遮罩出现且不可关闭；在真实Save Dialog中用键鼠输入本workflow临时目录下的`.json`路径并确认，等待遮罩消失。测试侧只读解析该文件，断言顶层为`{ nodes }`、目录层级与UI一致、请求字段完整，并记录文件内全部节点与字段行`id`。该文件是本workflow用产品UI真实产生的唯一导入输入。
4. 点击`composer.collection.import`打开真实Open Dialog，确认`composer.import.busy`遮罩存在且底层按钮、Escape、Tab均不可操作；用键鼠选择同一文件并确认。等待`composer.import.dialog`出现，断言其报告的request数与folder数与文件一致。
5. 点击`composer.import.cancel`，直接读取DOM确认`composer.collection.request.*`与`composer.collection.folder.*`数量、顺序与当前打开文档全部未变。
6. 再次导入并点击`composer.import.confirm-apply`；确认写入期间Dialog不可关闭。等待Dialog关闭和revision递增，断言：request总数翻倍；新增节点与字段行`id`均与文件内`id`没有交集；目录层级与文件一致；新增内容整体排在原有节点之后；当前打开的文档与`targetFolderId`不被导入改变。
7. 打开一条新导入的request，确认method、URL、query/header行与步骤2构造的内容逐字段一致，导入保留的是请求内容而非仅节点名。
8. 切出Composer再切回，确认Core回载后的树与新增节点身份一致。
9. 全程只使用公共`data-automation-id`、DOM状态属性与测试自产数据判定，不依赖任一语言的显示文案。
10. 保存trace、截图、导入前后的树快照JSON、日志与metadata；点击`shell.window.close`，验证Main/Core/Worker退出、8888释放并删除profile与临时文件。

### 预期效果

Collection导入与Rules同构：纯新增、节点与字段行`id`全部重新生成、保持文件内层级并追加到根末尾，不覆盖或合并任何本地节点。请求内容逐字段还原，其中`ComposerFieldRow.enabled`作为请求内容原样保留。确认Dialog在写入之前报告计数，取消后集合零变化，确认后经`collection.replace`原子持久化；导入不改变当前打开文档与新建落点。文件读写与确认写入期间均有不可关闭遮罩。因为请求只在用户点Send时执行，导入不产生任何自动网络行为。

### 验收要求

- 必须通过`composer.collection.import`真实入口执行。
- 覆盖取消零变化、id不复用、层级保持、字段还原、打开文档不受影响与Core回载，并完成trace/evidence与销毁验证。
- 导入输入文件必须由本workflow的真实Export产生；出现测试自建输入文件即视为该条Green无效。
