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
