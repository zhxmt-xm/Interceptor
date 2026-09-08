# Settings 与 Updates Workflows

本文件定义 Settings 九个section和Update notification的完整E2E流程。每条workflow独立启动Electron、独占profile/trace；系统代理、CA信任和外部程序操作必须由真实App UI发起。

<a id="settings-tools-language"></a>
## `settings.tools.language`

**状态**：passed
**策略**：shared；专属i18n流程；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，保留当前系统匹配语言并从DOM读取当前`lang`；通过Settings配置Provider和MCP Client。
2. Agent Ask discovery必须披露`settings_set_language`；使用不同于初始语言的正式ID，Deny不改变语言，Allow更新当前已挂载页面与`html lang`。
3. Agent Auto切换到另一正式语言，结果只含生效language ID；从Sidebar原语言菜单切换，验证同一Main方法和常驻Renderer应用路径。
4. 关闭Agent权限，旧Chat调用被拒绝且语言不变；MCP独立验证Ask Deny/Allow与Auto，当前页面不需重开或刷新。
5. 关闭MCP权限，旧连接不再披露/执行Tool；正常退出，同profile重启验证最后语言和双列授权保留、Model请求零重放。
6. 经原UI恢复本流程初始语言，保存脱敏trace/evidence；两代Main/Core/Worker退出、8888释放、完整WinINet/journal恢复后清理profile。

### 预期与证据

- 本流程专门验证语言设置，不把切换语言当作其他业务workflow的定位手段；所有selector使用公共automation ID。
- 15个合法ID、非法值、取消与Renderer退出由所属产品测试覆盖；不得通过localStorage/Store注入设置。
- 前置Red在`5e4fbc31`构建上discovery缺失，证据`interceptor-settings-preferences-e2e-red-20260907-203104`，Main/Core `6352/27056`正常退出。
- 最终Green与偏好流程联合2/2，证据`interceptor-preferences-persistence-green-20260907-211527`；本流程Main/Core `38236/34080`、`42568/18792`全部`gracefulDestroyVerified=true`，8888与完整WinINet/journal恢复。
- 原UI/Agent/MCP改变语言、撤权、重启与恢复初始语言通过；类型、unit、parity和产物证据见[偏好验收](../../../../../architecture/features/settings.md#ui-preferences-acceptance)。

<a id="settings-tools-preferences"></a>
## `settings.tools.preferences`

**状态**：passed
**策略**：shared；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，保持应用当前语言；经Settings配置Provider与MCP Client，记录当前主题和三个隐私默认值。
2. Agent Ask发现`settings_set_theme`和`settings_set_export_privacy_defaults`；Deny后值不变，Allow后当前主题/已挂载Privacy Switch立即匹配结果。
3. Agent Auto应用另一主题和三项显式boolean，随后打开HAR Export检查默认值；已打开草稿和运行中文件任务不被设置修改。
4. 通过Sidebar原主题菜单及Privacy原Switch修改，验证同一Main流程；连续切换两个独立Privacy字段，不能因迟到确认丢失任一修改。
5. 关闭Agent两项权限，旧Chat无法更改；MCP独立验证Ask Deny/Allow、Auto和跨workspace已挂载UI更新。
6. 关闭MCP权限，旧连接不再披露/执行；正常退出并重启，主题、隐私默认值与权限保持，Model请求和设置操作零重放。
7. 通过原UI恢复初始偏好；保存trace/evidence并正常退出，验证两代Main/Core/Worker全退、8888释放和完整宿主恢复。

### 预期与证据

- Theme只允许四个既有ID；三个Privacy字段独立，Tool要求全量显式boolean。不修改Capture数据、证书或系统代理配置。
- 新Main请求/Renderer应用的取消、失败和退出覆盖属于产品测试，不为workflow/helper新增测试的测试。
- 前置Red在`5e4fbc31`构建上discovery缺失，证据`interceptor-settings-preferences-e2e-red-20260907-203104`，Main/Core `37204/20232`正常退出。
- 最终Green与语言流程联合2/2，证据`interceptor-preferences-persistence-green-20260907-211527`；本流程Main/Core `20840/34860`、`25464/28872`全部`gracefulDestroyVerified=true`，8888与完整WinINet/journal恢复。
- 连续Privacy字段、已开HAR遮罩草稿/下次默认值、原UI与Agent/MCP、撤权及重启持久化通过；详细证据见[偏好验收](../../../../../architecture/features/settings.md#ui-preferences-acceptance)。

<a id="settings-tools-readonly"></a>
## `settings.tools.readonly`

**状态**：passed；unit / integration 与真实 Electron Red/Green 已验证
**策略**：shared；Windows；host-safety-guard；两代真实 Electron

### Steps

1. 创建空 profile/evidence，由宿主 guard 保存 WinINet/journal/进程代际；启动真实 Electron 与本地
	Model/MCP lab，通过公共 automation ID 配置 Provider、创建 Agent Session 和 MCP Client。
2. 通过 Settings 正式 UI 添加测试自产的 TLS insecure host 与 passthrough host；不生成证书、不安装
	信任、不切换系统代理或 AppContainer 豁免。只读记录当前公开状态与系统 exemption 集合用于比较。
3. 经真实 Agent 发送请求并 discovery `settings`，断言六项 query 精确披露；逐项真实调用 Core
	进程、系统代理、证书、insecure hosts、passthrough 和 AppContainer 查询，不出现审批卡。
4. 通过正式 Playground MCP 页面连接 UI 创建的 Client，确认相同六项 Tool 可枚举且逐项执行成功；
	使用协议值、结构化结果与自产 host 验证 Main/Core 真实状态，不以翻译文案定位或判断。
5. 比较查询前后 TLS 配置、证书身份、代理 ownership 与完整 exemption 集合，确认只读无副作用；
	审计 Model 请求、Tool Result、Transcript、截图、trace 与日志，不包含凭据、私钥、本机路径或
	完整系统代理快照。
6. 在 Settings Tool capabilities 搜索并依次关闭六项 Agent 开关，确认后续 discovery 不再披露、
	旧响应中的调用返回 `unknown_tool`，MCP 仍可调用；再关闭六项 MCP 开关，确认 `tools/list`
	与执行入口同步撤权。不得直接改设置文件或注入产品状态。
7. 保存第一代 evidence，通过 `shell.window.close` 正常退出并确认 Main/Core/Worker 全退、8888
	释放、WinINet/journal 恢复；使用同一 profile 启动第二代。
8. 通过正式 UI 确认六项双列关闭状态与 TLS 配置持久化、历史查询结果可读；Model 请求数没有因
	重启增加，查询未自动重放。清除本 workflow 经 UI 产生的 TLS 配置。
9. 保存第二代 evidence/trace/screenshot，正常退出；验证两代 `gracefulDestroyVerified=true`、
	全部测试进程销毁、8888 释放及完整系统副作用恢复后删除 profile。

### 预期效果

Settings 的六项只读能力在 Agent 与 MCP 共享名称、schema、owner 和脱敏结果；查询不请求 Ask/UAC，
不改变系统或配置。独立授权开关即时生效且跨进程恢复，历史结果不会触发重放。

### 证据

- unit Red 必须精确体现六项 registry/executor/adapter 缺失；E2E Red 必须在真实产品启动且 lab
  正常后失败于 Settings discovery/调用缺口，构建、selector 或宿主清理错误不能冒充 Red。
- Green 记录六项 Agent 与 MCP 实际调用、只读前后比较、双列撤权、重启零重放和脱敏审计结论。
- 两代 metadata、trace 与宿主 guard 均须验证完整销毁；没有该证据不得把 Inventory 标为 passed。
- 2026-09-05：实现前真实 Model 共8次请求后，discovery精确返回空数组而非六项；初代Main/Core
	`14724/24236`正常销毁。摘要新增测试先Red于`value`，再由结构化摘要Green。
- 最终同一workflow`1/1`（25.2秒）：Agent/MCP各执行6项；6项Agent旧披露返回`unknown_tool`，
	6项MCP旧选择返回协议`-32602`，目录随后移除；系统代理/exemption逐项不变，TLS配置及双列撤权
	跨重启保持，Model请求增量0，测试TLS配置经UI删除。
- 最终两代Main/Core为`12888/21524`、`41644/22360`，均`gracefulDestroyVerified=true`、8888释放，
	guard验证完整WinINet/journal恢复。证据已在运行package/smoke前独立归档。

<a id="settings-tools-system-proxy"></a>
## `settings.tools.system-proxy`

**状态**：passed；unit / integration 与真实 Electron Red/Green、销毁证据已验证
**策略**：os-side-effect；Windows；host-safety-guard；两代真实 Electron

### Steps

1. 创建空profile与evidence，由外层guard保存宿主WinINet/journal/进程事实；启动真实Electron并确认
	冷启动自动接管，首次journal original只在内存中用于后续比较。通过Settings UI配置本地Model Provider。
2. 默认Ask Chat发现Settings两项系统代理Tool；请求Restore，确认动态影响与owned事实一致，Deny后
	WinINet/journal逐字段不变，Tool Result为`tool_denied`。
3. 再次请求Restore并Allow；返回`restored=true`，系统设置精确等于首次original，journal清除，产品UI
	ownership同步为未接管。继续查询状态不能悄悄重新接管。
4. 请求Enable并Deny，系统设置保持original；再次请求并Allow，确认proxy已owned、新journal.original
	仍等于首次original，Core listener与upstream同步，公开结果不含原始系统配置。
5. 切换Auto，依次Restore、再次Restore和Enable；两项均无审批，重复Restore返回`restored=false /
	reason=not-owned`，最终恢复owned，不用null或同一布尔入口表达正反操作。
6. 通过Settings分别关闭两项Agent开关，旧Chat直接请求两项均返回`unknown_tool`且OS/journal不变；
	关闭两项MCP开关并确认两列独立状态保存，不改底层系统代理。
7. 隐藏敏感Transcript，保存trace/evidence后正常退出第一代；检查全部进程和8888销毁、完整宿主恢复。
	使用同profile启动第二代，冷启动仍自动接管，但Model请求增量0，历史Tool不重放，两项双列关闭状态保留。
8. 保存第二代证据并正常退出，验证两代`gracefulDestroyVerified=true`、完整WinINet/journal恢复与8888释放；
	清理profile。原始快照、Model文本与凭据不进入证据，只保留哈希、计数、协议值和布尔结论。

### 预期效果与证据

两项独立Tool复用正式Main编排，Ask拒绝不写系统，Allow/Auto执行结果与真实系统状态相符；授权、取消和
重启不绕过ownership保护。Red必须精确来自缺少Tool或行为缺口，不接受selector、UAC或环境失败。
Green必须包含审批裁决、两项真实执行、重复Restore、撤权零写入、重启零重放及完整宿主销毁。

2026-09-05：unit13/13从缺失Tool精确Red转Green，真实workflow先Red于两项未披露；摘要随后Red于
`value`再Green。最终与只读/权限workflow联合3/3通过，2次Deny、2次Allow、3次Auto、重复Restore
`not-owned`、首次original哈希保持、两项撤权零写入、同profile冷启动自动接管且Model增量0均通过。
两代Main/Core为`37532/43864`、`41620/2448`，均`gracefulDestroyVerified=true`，8888释放且WinINet/journal
恢复；证据在package/smoke前归档。新增明暗8视图48/48、最大0.5px，Windows package/audit/smoke通过。

<a id="settings-tools-tls"></a>
## `settings.tools.tls`

**状态**：passed；2026-09-08真实E2E及最终CA清理、双代销毁和宿主恢复全部通过
**策略**：privileged UI；Windows；host-safety-guard；两代Electron

### Steps

1. 保存完整宿主状态，创建空profile并启动真实Electron；经UI配置本地Model Provider。四项TLS Tool
	discovery必须可用，不得注入产品状态或直接修改配置文件。
2. 保持Certificates面板打开，请求替换insecure hosts：Ask Deny保持空名单，Allow保存自产host且
	当前面板立即显示；Auto替换/清空后再次验证Core查询与可见列表一致。
3. 保持TLS passthrough面板打开，按当前revision完成Ask Deny/Allow与Auto替换；host被Core规范化、
	当前面板即时刷新；用旧revision请求必须返回conflict且最新配置不变。
4. 未信任CA时启用解密仅保存意图，实际decrypting保持false；经Certificates真实UI生成/安装测试CA，
	如出现UAC由真实键鼠批准，不得重写返回值。确认公开指纹、用户意图和Core有效状态一致。
5. 对启用/停用分别验证Ask Deny/Allow与Auto，证书身份和信任不变；面板开关在Tool成功后立即同步。
	停用后重新启用，留下测试host配置与解密意图用于重启验证。
6. 四项Agent撤权后旧Chat直接调用返回unknown_tool、配置不变；MCP开关独立保存。隐藏敏感文本后
	正常退出第一代，验证Main/Core/Worker和8888销毁，WinINet/journal恢复。
7. 使用同profile启动第二代，确认Model请求增量0、证书身份与TLS配置持久化、四项关闭状态保持，
	历史Tool不重放。通过正式UI删除测试host、停用解密、卸载并删除测试CA。
8. 保存脱敏证据与两代metadata，正常退出并验证测试CA信任已移除、所有进程与8888释放、完整宿主
	状态恢复，最后删除profile。失败时必须保留profile并先经UI清理CA，不得留下系统信任副作用。

### 证据

Red必须精确指向四项缺失或行为缺口，Green记录审批、revision、同步状态、重启零重放与完整清理；
证据不记录私钥、证书路径、完整系统代理配置或Model敏感文本。平台授权不可用时明确blocked及人工步骤。

2026-09-08最终Green：同一workflow `1/1`通过（30.2s），CA生成、安装、卸载和删除均由正式UI自动完成。
两代Main/Core为`11608/44884`、`34820/2212`，两份metadata均`gracefulDestroyVerified=true`；宿主guard
验证完整WinINet/journal与注册进程恢复，8888释放、profile删除。测试前后LocalMachine Root指纹集合完全一致，
没有新增或删除其他证书。trace、两代metadata与日志归档在TEMP下`interceptor-tls-final-e2e-20260908-160438.zip`。
本机账户属于Administrators，但Runner token未提权；UAC策略为`EnableLUA=1 / ConsentPromptBehaviorAdmin=0 /
PromptOnSecureDesktop=0`。产品仍经`TrustStoreService`的正式提权路径执行，未改策略或伪造授权结果。
本轮初次运行停在discovery的路径脱敏断言：旧正则把schema URL中的`s:/`误判为Windows盘符。
补充单词边界后同一workflow Green；原失败不算产品Red，证据已归档至TEMP下
`interceptor-tls-discovery-failure-20260908-160436.zip`。

以下保留历史阻塞与修复证据，不代表当前仍受阻。

2026-09-05：四项发现缺失、摘要value与实际解密状态均已取得Red；executor24/24、刷新store18/18、
摘要/i18n42/42 Green。最终业务断言通过，但面板重载期间清理跳过卸载，LocalMachine Root残留测试CA
`8F5FD8BF6D49BE746862522F6AC616583ED152BB`。两代Main/Core `9740/1936`、`23384/33672`正常销毁，
WinINet/journal恢复，profile因fixture失败识别缺陷被删除。该残留于2026-09-08由Developer在管理员PowerShell运行
`certutil -delstore Root 8F5FD8BF6D49BE746862522F6AC616583ED152BB`清除，再由同一workflow取得上述完整Green；
没有清除其他旧CA，也没有在恢复前重复创建测试CA。

续作已修复清理等待和profile保留：按本轮证书指纹与真实信任状态等待卸载/删除；Playwright实际
`failed/timedOut/interrupted`在fixture use未抛错时也保留特权profile，unit9/9通过。TLS审批错误脱敏和
取消边界补8项Red后executor32/32 Green。当前Desktop485/485、Tools142/142、typecheck、设计交互71/71、
TLS专项16 views / 96 targets / 0 missing / 0 flagged / 最大0.5px与package/audit/smoke通过。
没有重新运行安装CA的workflow，新的清理等待与当前宿主恢复仍须真实复验；上述检查不替代E2E Green。

2026-09-06恢复时已核对5条关联workflow（Settings只读、系统代理、权限持久化、MCP Browser、MCP Desktop）
全部通过，十代Main/Core均`gracefulDestroyVerified=true`；证据归档在TEMP下
`interceptor-tls-adjacent-e2e-20260906`。完整parity238 views / 1,664 targets / 1,630 matched /
34 missing / 305 flagged；TLS专项96/96、0 missing/flagged、最大0.5px。以上不替代本条workflow的
最终CA信任清理；该阶段保持blocked，直到2026-09-08恢复旧残留并取得上述最终Green。

<a id="settings-tools-app-containers"></a>
## `settings.tools.app-containers`

**状态**：passed；owner及真实discovery Red后Green，四项Agent/MCP、面板同步、摘要和双代精确恢复已完成
**策略**：privileged UI；Windows；host-safety-guard；两代Electron

### Steps

1. 保存宿主基线和helper只读返回的完整exemption集合，创建空profile并启动真实Electron；通过UI配置本地Model Provider。
2. Agent发现四项Tool，打开AppContainer面板；单项SID取自产品真实枚举，不伪造SID或预置豁免。
3. Ask逐项Deny保持完整OS集合；Allow分别执行单项启用/停用、全部启用/停用，当前面板不用手动Refresh即显示结果。
4. Agent Auto逐项重复，确认单项不影响其他SID，批量只操作当前枚举且保留枚举外既有豁免；真实原生授权不注入返回值。
5. 通过产品UI创建MCP Client，真实SDK连接；独立覆盖四项Ask Deny/Allow与Auto，结果仅含公开字段，不返回原始helper输出。
6. 关闭四项Agent授权，旧Chat返回unknown_tool而MCP仍可发现；再关闭MCP授权，旧Client调用返回-32602，OS集合不变。
7. 通过正式批量/单项UI恢复初始完整exemption集合，正常退出第一代，验证Main/Core/Worker、8888及WinINet/journal恢复。
8. 同profile启动第二代；四项Agent/MCP开关保持关闭，Model请求增量0，OS豁免集合仍为初始值，没有重放写入或UAC。
9. 保存两代trace、metadata和仅含数量/hash的exemption证据；finally再次经真实UI恢复任何本轮变更，正常退出并验证宿主完全恢复，成功后删除profile。

### 证据

- 2026-09-08最终关联8/8 Green，共14代`gracefulDestroyVerified=true`；本条两代Main/Core为`49008/19980`、`16136/46764`。
- Agent/MCP四项Ask Deny/Allow与Auto、单项/批量范围、独立撤权、挂载UI和typed摘要均通过；每轮Auto使用真实新Chat并重新发现，未修改产品上下文规则。
- 完整exemption集合hash在finally恢复，枚举外SID不变；重启Model请求增量0、WinINet/journal及8888恢复，成功profile删除。证据归档在TEMP下`interceptor-settings-tools-final-e2e-20260908.zip`。
- 本轮在含未提交证书改动的69项worktree验证138个授权开关；证书MMC workflow仍独立blocked，不由本条或packaged smoke代替。
- Red只能来自四项Tool缺失或目标业务缺口；权限、selector或构建失败保持blocked，不算产品Red。
- Green记录四项Agent/MCP调用、两列授权、挂载UI即时同步、单项/批量范围及两代正常销毁。
- 初始与最终完整exemption集合hash必须相同，枚举外SID保持不变；不保存完整机器SID清单、helper路径、凭据或代理配置。

<a id="settings-navigation"></a>
## `settings.navigation`

**状态**：passed
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned且系统设置未修改。
2. 点击 `shell.workspace.settings`；检查 Settings rail 九个 section 可用，且只有 `settings.section.certificates` 具有 `aria-current=page`。
3. 依次点击 Proxy、App Containers、TLS passthrough、Certificates、Appearance、Storage、Privacy、Agent、Updates；每次确认目标项成为唯一 `aria-current=page`，并等待目标面板稳定。Agent section 额外通过键盘聚焦并按 Enter 激活，确认 rail item 使用原生 button 语义。
4. 再次选择 App Containers，点击 `shell.workspace.capture` 离开 Settings，确认 Capture 成为当前 workspace。
5. 通过普通 `shell.workspace.settings` 返回，确认 App Containers 仍是唯一 `aria-current=page`，没有回到默认 Certificates。
6. 选择 TLS passthrough，依次切到 Rules、Composer、Diagnostics 并从每个 workspace 返回 Settings；每次确认 TLS passthrough 仍为当前 section。
7. 确认全程无 Renderer page error，并附加每次离开/返回后的语言无关 `aria-current` 状态。
8. 保存 screenshot、trace、Main/Renderer 日志和 PID/端口 metadata，并点击 `shell.window.close`。
9. 验证 Main、Renderer、Core、Worker 全退，8888 释放且 `gracefulDestroyVerified=true`。
10. 删除 profile。

### 预期效果

九个 section 通过 Settings rail 真实导航；`aria-current` 准确且唯一；跨 feature 普通返回时保留最后访问 section；Proxy/Certificates/Storage/Updates 使用真实后端，Agent 只呈现诚实未配置空态；Appearance 不伪造未实现功能；Header/Main/statusbar 一致。显式 TLS 跨 feature 跳转覆盖当前 section 的语义由独立 `capture.navigate-tls-passthrough` workflow 验收。

### 证据

- `section-navigation-state.json` 记录默认、逐项选择以及每次离开/返回后的 automation ID 与 `aria-current`，不记录翻译文案或 CSS class。
- `trace.zip` 必须可见全部真实点击；`renderer-console.log` 不得包含 page error。
- `metadata.json` 必须记录真实 Main/Core PID、listener `8888` 与 `gracefulDestroyVerified=true`。
- 实现前 Red：真实 Electron 已打开默认 Certificates，视觉 active class 存在，但 `settings.section.certificates` 的 `aria-current` 为 `null`，workflow 精确失败于公共当前页面语义缺失。
- 历史八项基线：`1/1` 通过；当时八个 section 均只有目标项为 `aria-current=page`，App Containers 经 Capture 往返保持，TLS passthrough 经 Rules、Composer、Diagnostics 三次往返保持；Main PID `12304`、Core PID `27200`。
- 当前九项 Green：同一 workflow `1/1` 通过；Certificates 默认态和 Proxy、App Containers、TLS passthrough、Certificates、Appearance、Storage、Privacy、Agent、Updates 逐项选择时，只有目标 automation ID 为 `aria-current=page`。Agent section 先精确 Red 于 clickable `div` 没有 button role，改为原生 button 后通过焦点 + Enter 激活。App Containers 经 Capture 往返保持，TLS passthrough 经 Rules、Composer、Diagnostics 三次往返保持。
- 当前 Main PID `44024`、Core PID `17732`、listener `8888`，`gracefulDestroyVerified=true`，Renderer page error 为 0。

<a id="settings-app-containers-ordering"></a>
## `settings.app-containers.ordering`

**状态**：passed
**策略**：shared；Windows

### Steps

1. 创建独立空 profile/evidence，启动真实 Electron，等待 App/Core/8888/readiness；取消 readiness，不修改系统代理。
2. 进入 Settings → App Containers，等待真实 Windows helper 枚举完成；读取公共 SID 行 automation ID 和 `data-exempt`，不得用显示名、翻译文案或 CSS class 判断顺序。
3. 确认所有 enabled 行连续位于 disabled 行之前；同一状态内保持 helper 的名称顺序。当前宿主必须同时存在 enabled 与 disabled 样本，才可作为 retrospective Red/Green 证据。
4. 从真实行 SID 中选择一个能缩小结果集的搜索值，通过 `settings.app-containers.search` 输入；确认结果是过滤前列表的有序子序列，且仍满足 enabled-first。
5. 清空搜索，确认完整 SID 顺序逐项恢复；全程不得点击单项 switch、Enable all 或确认按钮，不触发 UAC、不改 exemption。
6. 附加 `app-container-ordering.json`，记录过滤前、过滤后和恢复后的 SID/`exempt` 状态；确认 Renderer page error 为 0。
7. 保存 screenshot、trace、Main/Renderer 日志和 metadata；通过 `shell.window.close` 正常关闭 App。
8. 验证 Main、Renderer、Core、Worker 全退，8888 释放且 `gracefulDestroyVerified=true`；删除 profile。

### 预期效果

真实 Windows AppContainer 列表稳定地将 enabled 项置顶，同组顺序不变；搜索只筛选已经排序的列表，清空后不产生重排；只读验收不造成系统副作用。

### 证据

- 实现前 Red：真实 Windows helper integration 返回 `141` 条记录但只有 `138` 个唯一 SID；同一 `settings.app-containers.ordering` workflow 进入面板后，Main 因 `AppContainer helper returned a duplicate SID` 拒绝快照，真实列表完全不可用。Red Main PID `21104`、Core PID `36468`，失败后仍为 `gracefulDestroyVerified=true`且 8888 释放。
- 当前 Green：helper 在 native 枚举边界按 SID 去重，package 内 helper 为 `138 records / 138 unique SIDs`；Main 继续拒绝任何回归的重复 helper JSON。真实 workflow 为 `1/1` Green，初始 `138` 行（`1 enabled / 137 disabled`），enabled 行位于首位，真实 SID 搜索缩小为 `1` 行，清空后 `138` 行逐项恢复。Main PID `34512`、Core PID `33872`、listener `8888`、`gracefulDestroyVerified=true`，Renderer page error 为 0，未触发 UAC或修改 exemption。
- Renderer ordering unit `2/2`、真实 helper integration `1/1`、Main service unit `10/10`，聚焦合计 `13/13`；Desktop 串行全量 `320/320` 与 typecheck 通过。
- AppContainer light/dark parity 各 `13/13 matched / 0 missing / 5` 个既有 flagged，最大 `3.8px`；完整 parity 保持 `137 views / 995 targets / 961 matched / 34 missing / 304 flagged`。
- Windows x64 package 与 artifact audit 通过（`1,294 files / 391,746,994 bytes`），production audit 为 0 漏洞，packaged smoke 最终 `1/1` Green。首次 smoke 的产品断言已通过但清理临时 profile 时遇到一次 Windows `EPERM`；当时无残留进程或 8888 listener，目录随后可删除，原样复跑通过。

<a id="settings-app-containers-bulk-access"></a>
## `settings.app-containers.bulk-access`

**状态**：passed
**策略**：os-side-effect；headed；Windows

### Steps

1. 创建独立 profile/evidence，启动 Electron，等待 App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认 System Proxy 未修改。
2. 进入 Settings → App Containers，等待真实枚举；只读记录测试前完整 exemption SID 集合、当前枚举 SID、当前 enabled SID 与枚举外 exemption，后续不把测试自产状态注入产品。
3. 点击 `settings.app-containers.enable-all`，确认 dialog 的 action/count 与 disabled 数一致；点击公共 Cancel，确认未发命令、列表和 OS 集合逐项不变。
4. 再次打开并点击 `settings.app-containers.enable-all-confirm`；App 只发起一次真实 `runas` 提升。若宿主策略显示 UAC，必须用真实键鼠批准；不得改写 Dialog 返回值。本机策略自动批准时记录 UAC policy。等待一次 read-modify-write 与读回校验，确认当前枚举项全部 enabled，OS 集合精确等于“初始集合 ∪ 当前枚举 SID”，枚举外 exemption 保留。
5. 点击 `settings.app-containers.disable-all`，确认 dialog 的 action/count 等于当前 enabled 数；点击 `settings.app-containers.disable-all-confirm` 并完成一次真实 `runas` 提升。确认当前枚举项全部 disabled，OS 集合精确等于“初始枚举外 exemption”，未移除枚举外 SID。
6. 通过产品正式单项 switch 逐一重新启用步骤2记录的测试前 enabled SID，每项确认并完成真实 UAC；确认最终 UI 与 OS exemption 集合逐项恢复测试前状态。
7. 确认 Enable all 仅在存在 disabled 项时可用，Disable all 仅在存在 enabled 项时可用；失败时保留最后一次成功 snapshot 并显示错误。
8. 附加 `app-container-bulk-access.json`，记录所有 SID 集合的 hash/count、每阶段 UI 状态与恢复结论，不记录本机路径。
9. 保存 trace、screenshot、Main/Renderer 日志和 metadata；通过 `shell.window.close` 正常关闭 App。
10. 验证 Main、Renderer、Core、Worker 全退，8888 释放、`gracefulDestroyVerified=true`，系统 exemption 与测试前逐项相同；删除 profile。

### 预期效果

Enable all 与 Disable all 各自对应一条 Main 命令和一次 UAC；前者原子添加当前 SID，后者原子移除当前 SID，均保留枚举外 exemption。完整真实 flow 最终精确恢复测试前系统状态，不发生 Renderer 循环、隐式全量覆盖或不可逆批量启用。

### 证据

- 实现前 Red：Main service 新用例精确失败于 `disableAllLoopbackExemptions()` 缺失；真实 Electron 在加载实际 AppContainer 列表后、任何系统写入前精确失败于 `settings.app-containers.disable-all` 入口缺失，不是 selector、UAC、构建或 fixture 失败。
- 当前 Green：同一真实 workflow `1/1` 通过。OS exemption 集合按 count/hash 记录为初始 `1 / 1a47…f773` → Enable all 后 `138 / 72bb…d992` → Disable all 后 `0 / e3b0…b855` → 通过正式单项 UI恢复为 `1 / 1a47…f773`；Cancel 前后初始集合不变，`finalRestoredExactly=true`。测试结束后独立 helper 读回仍为初始 hash。
- Dialog 数量分别为 Enable `137`、Disable `138`；两个工具栏按钮均为 `89.333×28px`、`white-space: nowrap`、`scrollWidth 88 ≤ width`、`scrollHeight 27 ≤ height`，无换行或溢出。
- Green metadata：Main PID `49296`、Core PID `43856`、listener `8888`、`gracefulDestroyVerified=true`、Renderer page error 为 0；结束后无 Interceptor/Electron 进程、无 8888 listener。
- 本机真实提升策略为 `EnableLUA=1 / ConsentPromptBehaviorAdmin=0 / PromptOnSecureDesktop=0`：产品确实执行 `runas` elevated helper，但 Windows 按策略自动批准，因此本轮没有可见 UAC 弹窗，测试未注入或改写任何原生 Dialog 结果。
- Main service/i18n 聚焦 `22/22`、Desktop 串行全量 `321/321`、全 workspace typecheck、design build 与 interaction `13/13` 通过。
- Enable/Disable Dialog 明暗四个 parity view 均 `5/5 matched / 0 missing / 0 flagged`，最大 `0.9px`；AppContainer 主页面明暗各 `15/15 matched / 0 missing`，两个批量按钮均在 0.6px 内。完整 parity 为 `141 views / 1019 targets / 985 matched / 34 missing / 304 flagged`，既有 missing/flagged 未增加。
- Windows x64 package、artifact audit（`1,294 files / 391,760,334 bytes`）、production audit 0 漏洞和 packaged smoke `1/1` 通过。

<a id="settings-proxy-enable-restore"></a>
## `settings.proxy.enable-restore`

**状态**：planned
**策略**：os-side-effect；headed

### Steps

1. 创建fresh profile/evidence，启动trace/Electron，等待App/Core/8888和readiness modal；检查System Proxy off、Paused且未owned。
2. 点击 `capture.readiness.open-proxy-settings`，记录初始enabled/owned/server/bypass/PAC/auto-detect/journal。
3. 确认Listener=Listening、Address=8888，点击 `settings.proxy.enable`。
4. 由App真实发起平台授权；本机用户完成授权，测试不输入/记录密码。
5. 等待Owned/Owned by Interceptor和Recording；检查server=8888、bypass/PAC/auto-detect与owned策略一致。
6. 测试客户端使用系统或显式代理发送请求，确认App可记录。
7. 点击 `settings.proxy.restore`。
8. 确认original配置逐字段恢复、owned=false；保存evidence并Close。
9. 验证Main/Core/8888/journal销毁和系统代理不再owned。
10. 删除profile。

### 预期效果

Enable只由用户UI发起；Main精确拥有和记录全部代理字段；Restore仅在current==owned时恢复original，不覆盖外部修改。

<a id="settings-system-proxy-crash-recovery"></a>
## `settings.system-proxy.crash-recovery`

**状态**：passed
**策略**：os-side-effect；headed；Windows；host-safety-guard

### Steps

1. 外层宿主 guard 在任何 Electron 启动前保存完整 WinINet 六字段快照，并确认共享 crash journal 路径、测试进程树和 8888 的初始状态。
2. 使用 fresh profile A 启动 App A，等待真实 Core listener 和自动接管；断言共享 journal 仅包含 version、`original` 与 `owned`，其中 `original` 等于步骤1快照且 `owned` 等于当前 WinINet。
3. 强制终止 App A 的真实进程树，不调用产品 Restore/Close；确认 A 的 Main/Core 全部退出且8888释放，WinINet与journal仍保持A的owned状态。
4. 在 A 完全退出后，使用不同 fresh profile 启动 App B。Main 在创建 Renderer/Core 前读取共享 journal；`current == owned` 时直接加载同一份 `original/owned`，WinINet零写入。
5. 断言 B 读取的 `original/owned` 与 A 完全相同，没有把8888记为`original`；等待 B 的真实 listener、Renderer readiness 和 Recording。
6. 通过公共 `shell.window.close` 正常关闭 B；B 精确恢复 A 首次接管前的完整 WinINet 并清除共享 journal。
7. 外层 guard 硬断言两代 Main/Core/Worker 全部退出、8888 可重新 bind、共享 crash journal 不存在、WinINet 六字段精确等于步骤1快照；保存脱敏 trace/evidence 后才删除两个 profile。
8. 任一业务或 teardown 断言失败时立即停止套件；runner 先关闭归属于测试 Main 的原生 Dialog、杀死已知测试进程树，再按 journal 的 `current/original/owned` 三态恢复并重复全部宿主断言。原始业务错误与恢复错误必须同时保留。

### 预期效果

生产、开发和不同 E2E profile 共享唯一用户级 crash journal；产品只考虑顺序运行的单 App。异常退出不会丢失首次 `original`，下一次 App 直接加载快照，正常退出后完整恢复宿主；外部修改不得被覆盖。

### 证据

- Red 必须是修复前 App B 把遗留8888重记为 `original` 或无法加载首次快照的业务失败；selector、构建、Dialog或宿主清理失败不算 Red。
- Green 必须同时包含A/B快照相同、首次original保持、完整WinINet恢复、共享journal清除、两代进程树销毁和8888释放。
- 实现前 Red：同一 workflow 在 App B 启动后精确失败于首次 `original` 被改写为遗留 8888；外层宿主恢复成功，不是构建、selector 或 teardown 失败。
- 当前 Green：单 App 三字段 journal 上同一 workflow `1/1`通过（16.2秒）。脱敏 evidence 的首次接管、A异常销毁、B加载相同`original/owned`、共享journal路径和B正常销毁六项均为`true`；A Main/Core PID为`30640/39876`，B为`8472/27844`。结束后完整WinINet等于启动前快照，`journal.json`、Electron进程和8888 listener均为0。

<a id="settings-proxy-mitm-persistence"></a>
## `settings.proxy-mitm.persistence`

**状态**：passed
**策略**：os-side-effect；headed；Windows

### Steps

1. 创建 fresh profile 和第一份 evidence；启动第一代 Electron，等待 App/Core/8888/bootstrap 完成，确认 Recording、WinINet 等于第一份 crash journal 的 `owned`，且 `original != owned`。快照只在内存比较，不进入 evidence。
2. 只通过 Settings UI 依次 Generate、Install CA 并完成真实 UAC；开启 MITM，在 Certificates 添加 `localhost` 例外，在 TLS passthrough 添加 `127.0.0.2`。
3. 确认 journal 只包含 `version/original/owned`；不打开会渲染原 proxy server、bypass 与 PAC 的 Proxy 面板。
4. 由测试环境异常终止第一代 Main，不点击产品 Close/Restore；确认第一代 Main/Core/Worker 退出、8888 释放，共享 journal 与 owned WinINet 仍保留。
5. 在第一代完全退出后，使用同一 profile 启动第二代 Electron。Main 必须在创建 Renderer/Core 前读取共享 journal，保持当前8888不变并加载相同`original/owned`，最终UI为Recording。
6. 确认证书文件仍为第一代生成的同一 SHA-1、当前处于有效期内，并由只读 `certutil -verifystore` 确认仍受 LocalMachine Root 信任。
7. 进入 Certificates，确认 MITM switch 仍开启且 `localhost` 例外仍存在；进入 TLS passthrough，确认 `127.0.0.2` pattern 仍存在。断言只使用公共 automation ID、DOM 状态和只读 OS 比较。
8. 通过 Settings UI 删除 `127.0.0.2` passthrough 与 `localhost` 例外，关闭 MITM，Uninstall 并 Delete CA；确认测试 CA 不再受信任且 profile 无 CA。
9. 保存两代 trace、final screenshot、Main/Renderer 日志和脱敏 persistence evidence；点击第二代 `shell.window.close`。
10. 由外层宿主 guard 验证第二代 Main/Core/Worker、8888 完整销毁，WinINet 精确等于步骤1快照，共享 journal 不存在并删除 profile。

### 预期效果

异常退出只留下可验证的用户级 crash journal；下次 Main 直接加载首次 `original`
与当前 `owned`，不把旧 `owned` 值误当作新的 `original`，也不做一次无意义的恢复再接管。
CA 身份、有效期、系统信任、MITM 用户意图、TLS passthrough 与源站例外均跨进程保持；
本 workflow 不替代 `capture.protocols.with-mitm` 的数据面验收。

### 证据

- retrospective Red：修复前`c978915`第二代`settings.certificates.mitm-toggle`为`false`，而证书身份/有效期/信任、journal original与最终清理均已通过。
- 当前Green：单 App 三字段 journal 上同一 workflow `1/1`通过（27.3秒）；第一代Main/Core PID `27820/16504`为`abruptDestroyVerified=true`，第二代`39564/21692`为`gracefulDestroyVerified=true`。
- Green脱敏证据中journal保留、B加载同一journal、首次original/owned保持、证书同一性、有效期、系统信任、MITM意图、insecure host、passthrough host、最终代理恢复、journal清理与测试CA删除16项全部为`true`；结束后8888、Electron进程与本轮CA均为0，完整WinINet恢复到workflow启动前快照。

<a id="settings-certificates-generate-delete"></a>
## `settings.certificates.generate-delete`

**状态**：planned
**策略**：shared

### Steps

1. 创建fresh profile/evidence，启动trace/Electron，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Settings Certificates，确认Not generated、无fingerprint、Install/MITM disabled。
3. 点击 `settings.certificates.generate`。
4. 等待Generated；记录subject、SHA-256 fingerprint、validUntil和公开certificate location。
5. 再次点击Generate/Regenerate，确认fingerprint变化且仍Not installed。
6. 点击 `settings.certificates.delete`。
7. 确认回到Not generated、公开metadata消失、profile内CA cert/key/meta删除。
8. 保存evidence并Close。
9. 验证销毁。
10. 删除profile。

### 预期效果

CA生成/重生成只写当前profile并使用OS secure storage保护私钥；Renderer只看到公开metadata；未信任CA可安全删除。

<a id="settings-certificates-trust"></a>
## `settings.certificates.trust`

**状态**：planned
**策略**：os-side-effect；headed

### Steps

1. 创建fresh profile/evidence，启动trace/Electron，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Certificates，检查Not generated、Not trusted、MITM off；点击Generate，等待Generated/Not installed。
3. 点击 `settings.certificates.install`，由App发起真实UAC/macOS Authorization；用户完成授权。
4. 等待Trusted、本机级说明和MITM switch可用；用系统只读方式确认精确thumbprint存在。
5. 确认MITM仍off，不因Trust自动解密。
6. 点击 `settings.certificates.uninstall`，完成原生授权。
7. 等待Not installed，确认thumbprint从目标信任库移除且其他证书不受影响；点击Delete清profile CA。
8. 保存evidence并Close。
9. 验证销毁和无测试CA残留。
10. 删除profile。

### 预期效果

Trust/Untrust只操作当前CA的精确thumbprint；安装信任不会自动Enable MITM；所有特权操作来自App UI并可完全恢复。

<a id="settings-certificates-https"></a>
## `settings.certificates.https`

**状态**：planned
**策略**：os-side-effect；headed

### Steps

1. 创建fresh profile/evidence和self-signed HTTPS origin；启动trace/Electron，等待App/Core/8888/readiness；检查Certificates为Not generated、MITM off、Proxy未owned。
2. 点击readiness Enable并完成授权，等待Recording；通过App UI Generate并Install CA，完成原生授权；确认Trusted但MITM off。
3. 点击 `settings.certificates.mitm-toggle` 开启MITM，确认MITM active和Proxy仍Owned。
4. 在 `settings.certificates.insecure-host-input` 输入带空格的`localhost`，点击 `settings.certificates.insecure-host-add`。
5. 再次输入重复host，确认不产生重复chip。
6. 发送HTTPS请求，确认upstream self-signed origin因例外可转发并被解密。
7. 点击动态 `settings.certificates.insecure-host-remove.localhost`，确认chip移除；关闭MITM。
8. Uninstall并Delete CA；进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证销毁、系统代理恢复和信任库无残留。
10. 关闭origin并删除profile。

### 预期效果

MITM switch、Trusted状态和Core配置同步；insecure host会trim/去重并可移除；关闭MITM不自动卸载CA；workflow结束完全恢复。

<a id="settings-certificates-external-actions"></a>
## `settings.certificates.external-actions`

**状态**：planned
**策略**：native-ui

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 进入Certificates，检查Not generated且外部actions尚不可用；点击Generate。
3. 点击Reveal certificate的公共automation ID，确认Explorer/Finder打开到公开cert位置。
4. 点击View certificate的automation ID，确认系统证书查看器打开测试CA。
5. 点击Open certificate manager的automation ID，确认Windows cert manager或macOS Keychain Access打开。
6. 检查Renderer API/DOM/trace中没有私钥内容或任意path输入能力。
7. 关闭所有外部窗口，回到App，点击Delete清除CA。
8. 保存evidence并Close。
9. 验证销毁。
10. 删除profile。

### 预期效果

三种外部动作均由App Main发起并打开正确系统工具；仅公开证书暴露给系统；私钥不进入Renderer、日志或trace。

<a id="settings-storage-refresh-clear"></a>
## `settings.storage.refresh-clear`

**状态**：planned
**策略**：os-side-effect

### Steps

1. 创建profile/evidence和HTTP/WS origins，启动trace/Electron，等待App/Core/8888/readiness；检查Storage/Capture初始空态。
2. 点击readiness Enable并完成授权，等待Recording；制造含request/response bodies和WS frames的真实Capture。
3. 进入Settings Storage，点击 `settings.storage.refresh`。
4. 记录session/exchange/body/bytes，确认非零且与可见Capture一致。
5. 点击 `settings.storage.clear`，再点击 `settings.storage.clear-cancel`；确认数值不变。
6. 再次点击Clear，点击 `settings.storage.clear-confirm`。
7. 等待usage更新：Exchange/Body/bytes归零，Session保留1；进入Rules/Diagnostics确认未误删。
8. 进入Proxy点击Restore，确认非owned；保存evidence并Close。
9. 验证spill、进程、8888销毁和系统代理恢复。
10. 关闭origins并删除profile。

### 预期效果

Refresh读取真实Core usage；Clear必须二次确认；Cancel零副作用；Confirm仅删除Capture/Body，不影响RuleSet和Diagnostics。

<a id="settings-privacy-defaults"></a>
## `settings.privacy.defaults`

**状态**：planned
**策略**：os-side-effect

### Steps

1. 创建profile/evidence和含Authorization/Cookie的HTTP origin，启动trace/Electron，等待App/Core/8888/readiness；只检查Privacy三项安全默认值和Capture空态。
2. 点击readiness Enable并完成授权，等待Recording；进入Settings Privacy，记录三项默认switch。
3. 切换 `settings.privacy.mask-authorization`、`settings.privacy.mask-cookies`、`settings.privacy.warn-unmasked`。
4. 返回Capture并制造敏感请求，打开HAR Export。
5. 检查modal中的mask authorization/mask cookies初始值跟随Settings；在未遮罩且warn=true组合下确认敏感警告。
6. 取消导出，进入Proxy点击Restore，确认非owned；保存evidence并Close，但保留profile。
7. 使用同一profile启动第二份Electron/trace，确认三项和HAR modal初始值持久。
8. 恢复安全默认值；本次不需要Capture，点击readiness Cancel；保存evidence并Close。
9. 验证两次销毁。
10. 关闭origin并删除profile。

### 预期效果

Privacy defaults即时持久并真实驱动HAR Export初始状态；风险组合提供明确警告；重启后保持。

<a id="settings-updates-check"></a>
## `settings.updates.check`

**状态**：planned
**策略**：native-ui（local断言unsupported；packaged通过真实 GitHub Device Flow 检查私有 Release）

### Steps

1. 创建profile/evidence，启动local或packaged App的trace/driver，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned。
2. 点击 `shell.workspace.settings`→`settings.section.updates`。
3. 在local未打包目标确认真实unsupported/development状态，不伪造available。
4. packaged fresh profile 确认Sign in required；点击 `settings.updates.github-sign-in`，读取但不记录 `settings.updates.device-code`，确认系统浏览器打开GitHub Device Flow。
5. 用户在GitHub完成授权；等待Connected，确认Renderer/DOM/trace中没有access/refresh token或绝对凭据路径。
6. 点击 `settings.updates.check`，发起固定私有GitHub stable release检查；等待Checking终态为Up-to-date、Available或Failed。
7. 检查current/latest version、private release source、policy、lastCheckedAt和纯文本release notes。
8. 重启同一profile，确认启动时refresh成功且无需再次Device Flow；在可控短过期fixture中确认access到期前只刷新一次并按新过期时间重排，Close后不再请求；点击 `settings.updates.github-sign-out` 后确认密文删除并回到Sign in required。
9. 确认远端body没有HTML执行或资源加载；保存evidence并Close。
10. 验证销毁并删除profile。

### 预期效果

Local诚实显示unsupported；packaged只用当前GitHub身份读取固定私有仓库。token与过期时间只在Main密文中，启动时刷新，并在access到期前5分钟用单timer刷新；非退出刷新失败即清空登录，Close取消timer；状态机和纯文本changelog准确，无远程代码执行。

<a id="settings-updates-download-open"></a>
## `settings.updates.download-open`

**状态**：planned
**策略**：native-ui；仅packaged且存在真实新release时可执行

### Steps

1. 创建profile/evidence，启动packaged App的trace/CDP driver，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned且更新直连不要求接管系统代理。
2. 进入Updates并完成或恢复GitHub授权；点击 `settings.updates.check`，等待真实Available和目标Asset API metadata。
3. 点击 `settings.updates.download`。
4. 观察state=downloading、bytes与progress单调增长，UI不允许重复下载。
5. 等待size和SHA-256校验、fsync和原子rename完成，状态为Downloaded；确认无`.part`残留。
6. 点击 `settings.updates.open-installer`，确认仅打开本次下载成功的MSI/DMG。
7. 取消安装器，不安装/修改当前App；确认当前App仍运行。
8. 保存evidence并Close。
9. 验证App销毁并清测试下载目录。
10. 删除profile。

### 预期效果

下载只由用户点击触发；固定Asset API/size/hash/架构安全边界生效；Bearer不进入Renderer或安装文件；失败清理临时文件；Open不能提交任意path。

<a id="settings-update-notification"></a>
## `settings.update-notification`

**状态**：planned
**策略**：shared（有效available/downloaded仅packaged真实检查）

### Steps

1. 创建profile/evidence，启动packaged App和trace/CDP driver，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned，并检查Header通知只受真实Update状态控制。
2. 通过真实Update check进入Available；确认Header notification出现且不占Header布局/不遮挡窗口控制。
3. 点击notification中的真实navigation/download automation action。
4. 确认Settings Updates和Header notification共享同一状态，不重复创建任务。
5. 等待下载完成进入Downloaded，确认notification文案/action同步。
6. 点击notification的Open installer action并取消安装器。
7. 返回各workspace，确认notification可见性只由available/downloaded控制。
8. 保存evidence并Close。
9. 验证销毁和下载临时文件清理。
10. 删除profile。

### 预期效果

Update notification与Settings共用真实Update store；只在两种状态显示；所有action真实且不会遮挡Shell或创建重复下载。
