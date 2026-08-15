# Breakpoints Workflows

本文件定义 Breakpoints 工作区的完整 E2E 流程。每条 workflow 独立启动 Electron、独占 profile/trace，并通过真实Rules breakpoint action、Core queue和客户端连接验证。

<a id="breakpoints-toggle"></a>
## `breakpoints.toggle`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin，启动trace/Electron，等待App/Core/8888/readiness；检查Break on match=true、queue/selection/draft为空。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建含Breakpoint action的规则并Apply。
3. 点击 `shell.workspace.breakpoints`，确认 `breakpoints.toggle` 初始状态。
4. 点击toggle关闭Break on match，切到Capture后通过8888发送匹配请求。
5. 确认请求未进入paused queue并正常完成。
6. 返回Breakpoints，确认toggle状态未被轮询反弹；点击toggle重新开启。
7. 再发匹配请求，确认进入queue；通过Continue unmodified释放。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

全局Break on match开关真实同步Core；关闭时Breakpoint action立即continue，开启时请求真实挂起；跨workspace状态稳定。

<a id="breakpoints-queue-select"></a>
## `breakpoints.queue-select`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和可延迟响应的HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查queue/selection/draft为空。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建并Apply request breakpoint规则。
3. 测试客户端通过8888发送匹配请求并保持等待。
4. 点击 `shell.workspace.breakpoints`，等待paused count=1和动态 `breakpoints.row.<breakpointId>`。
5. 检查row的phase、method、URL、ruleName和倒计时。
6. 点击该row。
7. 验证Editor加载同一snapshot的headers/body和deadline；通过Continue unmodified释放客户端。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

真实请求在Core等待；queue metadata与Rule/请求一致；选择后Editor展示同一不可变snapshot；倒计时和选择稳定。

<a id="breakpoints-continue-unmodified"></a>
## `breakpoints.continue-unmodified`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和记录收到header/body的HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Breakpoints空态。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建request breakpoint并Apply。
3. 客户端发送带固定header/body的匹配请求；进入Breakpoints并点击动态row。
4. 不编辑任何字段，点击 `breakpoints.continue-unmodified`。
5. 等待row从queue移除、paused count=0、客户端收到200。
6. 从origin记录确认header/body未变化。
7. 在Capture打开最终Exchange，确认completed且内容为原始值。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Continue unmodified只释放等待，不改字节；queue/Core/client/Capture终态一致。

<a id="breakpoints-execute-edited"></a>
## `breakpoints.execute-edited`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和能记录 raw request headers/body 的HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Breakpoints空态。
2. 确认冷启动自动进入Recording；若当前尚未Recording，才点击recording toggle并通过readiness Enable完成接管。随后通过Rules UI创建request Breakpoint action，启用规则后Apply。
3. **Header-only**：客户端发送带固定body、`Content-Type`、`Content-Length`和普通header的请求；选择动态row，保持Replacement=Off，通过动态 `breakpoints.header.<headerId>.name/value` 修改普通header与`Content-Type`，点击 `breakpoints.execute-edited`。
4. 验证origin收到用户最终headers，body bytes与客户端发送值完全一致；客户端完成，Capture记录实际转发结果。
5. **Body-only**：客户端再次发送匹配请求；不编辑任何header，选择Text replacement并通过 `breakpoints.body` 输入新正文，点击Execute edited。
6. 验证origin收到新正文；原本存在且未编辑的`Content-Length`按最终content bytes更新，原本缺失的字段不新增，其余headers保持。
7. **Header+Body**：客户端第三次发送匹配请求；选择Text replacement，同时把`Content-Encoding`改成`gzip`且不编辑原`Content-Length`，点击Execute edited。
8. 验证origin收到`Content-Encoding: gzip`、可gunzip为用户新正文，继承的`Content-Length`更新为gzip后字节长度；Capture反映实际转发headers/body。
9. 为每一段保存origin observation、客户端结果、最终Capture状态与截图/trace；进入Proxy点击Restore，确认non-owned并Close。
10. 验证Main/Core退出、8888释放、系统代理恢复；关闭origin并删除profile。

### 预期效果

Header-only不改变body；body-only按继承headers构造新body；header+body按用户最终headers构造新body。三段都经过真实UI/Main/Core/Mockttp/origin，Core state=edited，Capture反映实际转发结果。

### Automation Contract

该 workflow 只允许使用下列公共 automation ID，不以翻译文案、`aria-label`、CSS class 或 `window.interceptor` 代替：

| 交互 | Automation ID |
| --- | --- |
| 开始 Recording / readiness | `capture.recording.toggle`、`capture.readiness.enable` |
| 进入 Rules / 新建规则 | `shell.workspace.rules`、`rules.create` |
| 规则名 | `rules.editor.name` |
| Host matcher 值 | `rules.matcher.<ruleId>.0.value` |
| 删除默认 action | `rules.action.<ruleId>.0.remove` |
| 添加 Breakpoint action | `rules.add-action`、`rules.action.breakpoint` |
| Apply / enable | `rules.apply`、`rules.toggle.<ruleId>` |
| 返回 Capture / 选择 pending exchange | `shell.workspace.capture`、`capture.request-row.<exchangeId>` |
| 编辑 header | `breakpoints.header.<headerId>.name`、`breakpoints.header.<headerId>.value` |
| Replacement 模式 | `breakpoints.replacement.off`、`breakpoints.replacement.text`、`breakpoints.replacement.file` |
| 编辑/提交正文 | `breakpoints.body`、`breakpoints.execute-edited` |
| 恢复系统代理 | `settings.proxy.restore` |

动态 ID 中的 `ruleId`、`exchangeId` 和 `headerId` 只能从对应动态行/控件已经公开的 automation ID 中提取。

<a id="breakpoints-drop"></a>
## `breakpoints.drop`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP/WS origin，启动trace/Electron，等待App/Core/8888/readiness；检查Breakpoints空态。
2. 点击readiness Enable并完成授权，等待Recording；通过Rules UI创建Breakpoint rule并Apply。
3. 客户端发匹配请求并等待；进入Breakpoints选择动态row。
4. 点击 `breakpoints.drop`。
5. 确认row移除、paused count=0。
6. 确认客户端连接按phase失败/关闭，origin未收到被drop的数据。
7. 在Capture检查对应终态/失败事实，不出现伪成功response。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origins并删除profile。

### 预期效果

Drop真实中止目标数据面；请求不继续转发；queue、client和Capture均反映dropped/closed事实。

<a id="breakpoints-continue-all"></a>
## `breakpoints.continue-all`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin，启动trace/Electron，等待App/Core/8888/readiness；检查Breakpoints空态。
2. 点击readiness Enable并完成授权，等待Recording；创建并Apply Breakpoint rule。
3. 并发发送至少三条匹配请求，等待paused count=3。
4. 点击 `breakpoints.continue-all`。
5. 等待所有rows移除和paused count=0。
6. 等待所有客户端收到未修改响应；origin确认三条请求内容未变化。
7. 确认Continue all disabled，Capture三条均completed。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Continue all原子释放当前等待集合，不编辑内容；所有客户端完成，按钮和计数回到空态。

<a id="breakpoints-resize"></a>
## `breakpoints.resize`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin，启动trace/Electron，等待App/Core/8888/readiness；检查Breakpoints空态和初始splitter布局。
2. 点击readiness Enable并完成授权，等待Recording；创建Breakpoint rule并制造一条pending request；进入Breakpoints选择row。
3. 拖动 `breakpoints.splitter` 到queue最小宽度。
4. 检查row metadata、倒计时、Editor headers/body和footer actions可见。
5. 拖到中间，再拖到Editor最小宽度。
6. 编辑一项body但不提交，确认拖动不丢草稿/selection。
7. Continue unmodified释放请求。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Queue和Editor遵守最小宽度；拖动不丢pending选择或草稿；所有操作按钮在边界宽度可用。
