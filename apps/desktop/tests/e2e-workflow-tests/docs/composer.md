# Composer Workflows

本文件定义 Composer 工作区的完整 E2E 流程。每条 workflow 独立启动 Electron、独占 profile/trace，并使用真实 Composer UI 和本地 origin。

Composer 由 Core 直接出站，不依赖系统代理路由。因此这些 workflow 只验证 Proxy readiness 的相关默认态（listener=8888、System Proxy未owned、UI Paused），随后点击 `capture.readiness.cancel`，并确认未修改系统设置。它们不重复检查无关的 Capture rows、Rules、Breakpoints、Privacy、CA 或 Updates 状态。

<a id="composer-request-edit"></a>
## `composer.request-edit`

**状态**：planned
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

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile、trace与evidence；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 进入Composer，从Collection toolbar新建根目录并在行内input命名；通过目录More菜单连续新建第二、第三层目录，每层记录公共动态ID与行几何。
3. 打开第三层目录菜单，确认New subfolder为disabled；从同一菜单新建request，填入测试自产URL。
4. 对request行发起真实contextmenu，选择Rename并在同一行内input提交；立即切到Rules再返回Composer，越过600ms保存窗口后确认rename与URL仍由Core恢复，且request ID不变。
5. 点击根目录作为新建落点，确认目录`aria-pressed=true`但URL editor仍保留当前request；点击`composer.collection.tree`空白，确认只清目录选择且URL仍不变。
6. 拖动`composer.collection-splitter`，确认Collection宽度线性变化且当前request/目录树保持可用。
7. 附加目录ID、缩进、菜单disabled、remount persistence、selection、URL与splitter几何；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### TDD证据要求

- 当前提交先运行同一workflow；若全部Green，则必须在最接近该交互修复前的历史提交取得retrospective Red，不能把现状Green冒充TDD。
- 有效Red必须来自selection、rename、三级约束、menu或splitter业务缺口；selector、构建、listener或fixture失败不算Red。
- Green必须覆盖同一组UI操作、evidence与完整销毁。

### TDD证据

- Red：rename提交后立即切到Rules再返回Composer，越过两倍600ms保存窗口后Core回载得到`count=0 / name=null / url=null`，证明feature卸载取消了节流保存并让旧快照清空整棵树。
- Green：将`useCollection`同步owner提升到常驻App；同一workflow `1/1`，remount恢复同一request ID、rename与URL；三级目录x坐标`92 / 118 / 144`，第三级New subfolder disabled，目录选择/空白取消不关闭文档，splitter `320→399.5px`。
- 销毁：Main/Core退出、8888释放，`gracefulDestroyVerified=true`。

### 预期效果

目录落点与打开文档正交；行内重命名不替换节点身份；三级限制在菜单和store一致；splitter只改变布局，不改变业务状态。

<a id="composer-send-success"></a>
## `composer.send-success`

**状态**：planned
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

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile、trace和HTTP loopback origin；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 进入Composer，通过`composer.collection.new-request`创建请求，在`composer.url`填写`/e2e/composer/response-section-collapse`并点击`composer.send`；确认真实origin收到GET。
3. 打开`composer.response-tab.headers`，用`composer.response-section.response-headers`与`.request-headers`定位两段；确认初始`aria-expanded=true`，`aria-controls`分别指向`hidden=false`的唯一正文。
4. 依次折叠两段，再重新展开Response Headers；确认同一`aria-controls`正文恢复，每次只切换目标正文的`hidden`与对应按钮的`aria-expanded`，另一段状态保持不变。
5. 保存截图、trace、日志与metadata；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### TDD证据

- Red：静态标题可定位，但没有`aria-expanded`，点击也不具备折叠契约。
- Green：独立折叠与ARIA关系全部通过，workflow `1/1`并保留销毁证据。

### 预期效果

Response Headers、Request Headers、Cookies、Timing与Connection沿用同一可折叠section语义；折叠不销毁正文内部状态，也不依赖当前语言文本定位。

<a id="composer-response-body-formatting"></a>
## `composer.response.body-formatting`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile、trace和HTTP loopback origin；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 通过Composer UI发送小于2 MiB的单行HTML响应；等待自动Format结束，点击公共Copy动作并从系统剪贴板确认正文已分行且内容保持。
3. 新建请求并发送小JavaScript响应；确认自动Format补齐空格且Copy读取当前model。
4. 新建请求并发送2–8 MiB的单行CSS响应；Format前Copy确认原文无换行，点击公共Format动作，等待busy结束后再次Copy并确认已分行。
5. 新建请求并发送无法解析的XML；记录Renderer page errors，点击Format后确认原文逐字节不变、按钮恢复可用且未新增未处理page error。
6. 不再点击Format，切回此前CSS request；Copy必须仍返回该response的4行格式化视图，证明格式化副本按文档隔离且未改写原始body。
7. 附加四段正文摘要、CSS恢复摘要与Renderer错误增量；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### TDD证据要求

- Unit Red必须证明formatter异常当前会向调用方抛出，而不是恢复原文。
- Electron Red必须来自真实正文格式化缺口或未处理Renderer error；selector、fixture、构建或listener失败不算Red。
- Green需同时覆盖HTML/JavaScript自动格式化、CSS手动格式化、跨文档恢复、XML失败回退以及完整销毁证据。

### TDD证据

- Unit Red：Monaco formatter与malformed XML分别向调用方抛出，聚焦测试`2 failed / 3 passed`；实现后formatter聚焦`6/6`、BodyViewer/formatter合计`17/17`。
- Electron Red：真实小HTML响应在15秒后仍为单行；补language后流程继续暴露trimmed editor contribution每次创建CodeViewer产生5个`UNKNOWN service` page errors。
- Electron Green：HTML从1行自动格式化为5行；JavaScript补齐函数、赋值与对象空格；2,097,169 B CSS点击Format后从1行变4行，切到其他request再返回仍为同一4行视图；7字节malformed XML逐字节保留；Renderer pageerror增量为0，workflow`1/1`且销毁证据完整。

### 预期效果

code正文按语言使用既有formatter；自动与手动路径共享同一结果语义；失败不改正文、不解锁编辑器、不留下busy或未处理Renderer错误。

<a id="composer-send-failure"></a>
## `composer.send-failure`

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile、evidence、有效HTTP fixture和一个未监听的loopback端口；确认宿主无遗留Proxy ownership/测试CA。
2. 启动trace与新Electron，等待Core Running和8888；点击 `capture.readiness.cancel`并确认System Proxy未owned；进入Composer。
3. 检查Composer默认URL/method/protocol、空response和空history。
4. 输入格式非法URL并点击Send，验证有界validation/error、无假response且Send恢复可用。
5. 输入未监听端口的合法URL再次Send，验证连接失败信息与duration，response区域无伪成功内容。
6. 改为真实fixture URL并再次Send。
7. 验证旧error清除、显示200真实响应，History准确反映发送终态。
8. 确认失败/重试未修改System Proxy，也未创建无关Rules或Breakpoints状态。
9. 保存evidence并点击 `shell.window.close`。
10. 验证进程/8888销毁，关闭fixture、释放端口并删除profile。

### 预期效果

非法URL和网络失败不会产生成功假象或锁死表单；修正后可立即重试成功；错误只影响Composer当前请求状态。

<a id="composer-history-new"></a>
## `composer.history-new`

**状态**：planned
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

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile/evidence和返回大JSON/header集合的HTTP fixture；启动trace/Electron，等待App/Core/8888/readiness；检查System Proxy未owned，点击 `capture.readiness.cancel`并确认系统设置未修改。
2. 进入Composer，确认默认splitter布局、method/URL/Send和空response可见。
3. 通过UI发送真实请求并等待大response。
4. 拖动 `composer.splitter` 到请求面板最小宽度，检查method/URL/Send、tabs、header editor和body无重叠。
5. 拖到中间，再拖到response面板最小宽度。
6. 依次打开Response Body/Headers/Raw，确认CodeMirror和长header正确换行或滚动。
7. 再次发送请求，确认动态内容不改变布局轨道、selection或草稿。
8. 恢复splitter到中间位置，确认窗口状态和Core未变化。
9. 保存evidence并点击Close。
10. 验证销毁，关闭fixture并删除profile。

### 预期效果

Composer splitter遵守两侧最小宽度；请求/响应控件在极限宽度可用；resize只影响布局，不影响业务状态或系统代理。

<a id="composer-collection-import"></a>
## `composer.collection.import`

**状态**：planned
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

### TDD证据要求

- 实现前提交运行同一workflow，必须精确失败于`composer.collection.import`入口不存在。
- 当前提交全部Green，涵盖取消零变化、id不复用、层级保持、字段还原、打开文档不受影响与Core回载，并完成trace/evidence与销毁验证。
- 导入输入文件必须由本workflow的真实Export产生；出现测试自建输入文件即视为该条Green无效。
