# Settings 与 Updates Workflows

本文件定义 Settings 九个section和Update notification的完整E2E流程。每条workflow独立启动Electron、独占profile/trace；系统代理、CA信任和外部程序操作必须由真实App UI发起。

## `settings.certificates.shared-startup`（两端）

1. 启动前只读保存共享材料是否存在、公开指纹及完整系统Root/admin trust；禁止预造CA。已有材料须可用且受信任，否则先由用户完成产品初始化，不把既有CA当作清理目标。
2. fresh profile启动真实App；先显示启动页和窗口控制，再准备系统组件及共享CA。材料缺失时由Main生成并请求正常系统授权，用户亲自确认；确认窗口出现时必须已有可见App首窗及对应启动阶段，不允许用延长firstWindow等待掩盖顺序错误。启动完成后经Settings Certificates核验可Uninstall，并读取共享目录的公开CA、文件大小/mtime及真实系统信任；profile内不得另存CA。
3. 正常Close，不点击Uninstall/Delete；确认材料和信任保留。另一fresh profile启动后仍为同一指纹、文件大小/mtime不变，Settings可Uninstall，MITM默认关闭；不能用预造文件或测试API代替初始化。
4. 保存两代trace、公开指纹和文件元数据，不读取/导出私钥。若本workflow首次创建CA，最后经产品Uninstall/Delete恢复初始基线；若CA已存在，则完全保留。第二代正常退出并保存证据后删除其临时profile，确认目录确实不存在，再回读共享CA的指纹/size/mtime与系统信任及完整Root集合，均须保持启动前基线；另存`shared-certificate-profile-deletion.json`。Main/Core/Worker全退、8888释放、完整代理/Root/admin trust恢复后才算Green。
5. 材料已有未信任、系统拒绝/取消与损坏保留由产品unit/integration及对应真实原生流程覆盖；Windows UAC和产物验收由Windows item独立后验，不能用macOS结果代替。

<a id="certificate-startup-cancel"></a>

## `settings.certificates.startup-cancel`（macOS）

1. 运行前共享材料必须为空，保存完整System Root/admin trust基线。启动真实App但由该workflow自己等待ready，先确认首窗可见、BootScreen为`certificate`且业务`app.root`尚未挂载，再定位本轮Main的前台helper及唯一授权窗口。
2. 通过真实窗口Close发起退出，要求立即显示`certificate.prepare`冲突，首窗保持且不延后自动退出。保存启动页与冲突截图、trace及公开CA指纹。
3. 对精确归属的原生授权窗口发送Escape；fixture只定位本轮Main的唯一单按钮失败对话框，前置该App后真实发送Enter确认，不改写原生返回值。Main正常退出且没有Core/listener。新增系统公开CA应撤回，Root集合恢复，但本地已生成材料保持同一身份，不能隐式重生成。
4. 使用另一个fresh profile重启，用户正常确认同一CA授信；正式Settings显示同一指纹和可Uninstall，MITM仍关闭。只授权一次，不重放先前拒绝的Quit。
5. 经产品Uninstall/Delete清理专项生成的CA，保存两代trace、取消与复用证据，正常Close；全部进程退出、8888、完整代理和Root/admin trust恢复。测试端的延后ready仅控制driver等待时机，不给产品增加参数或后门。

2026-09-24当前行为验收：签名包首次生成/授权/两代复用1/1在`/tmp/interceptor-item3-20260924-first-ca-startup.json`；本取消专项最终1/1在`/tmp/interceptor-item3-20260924-startup-cancel-final.json`。`startup-cancel-host.json`确认首代Main55783未启动Core，次代Main55936/Core56024使用同一CA正常启动，全部正常退出、Root集合恢复、材料清理、8888释放，两个trace保留。前两次失败是窗口索引与原生错误提示未关闭，恢复记录分别为`startup-cancel-recovery.json`、`startup-cancel-fixed-recovery.json`（同前缀），不算产品Red。新增用例验证既有行为，不能补造原启动实现之前缺失的真实E2E证据。

helper部署前只读检查失败时，启动保留原错误，不产生授权、CA或Core写入，也不保留修改占用阻止Quit。`system-proxy.read-effective`收到完整回复但value格式错误时，typed client须标明completed及只读operation，不误记为未知写入。非法原生回复与不可用组件的组合由所属module测试覆盖；真实E2E不篡改安装资源制造输入。已发送写入后的超时/断线仍必须保守保护，普通status成功不能证明该写入结束。

第4项失联写入验收：传输/原生集成负责丢失终态回复、原ID/操作匹配、缺记录、记录淘汰/重启和查询失败，确认期间仍有原操作占用，失败命令绝不重放；只有精确匹配的结束记录才进入原业务回读/回滚。已确认import失败只撤回安装前不存在的精确公开CA，未确认或已有CA保持。真实UI流程继续覆盖Install/Uninstall/Delete、取消、跨入口状态通知、Quit及宿主恢复，不用fake Preload或篡改安装资源制造故障，也不将正常UI Green冒充断线分支已在E2E触发。

普通TLS workflow复用共享CA后，经UI添加测试origin的源站例外再开启MITM，首笔H1/H2请求即须成功；不靠预热失败请求或listener重建触发新规则。Core集成同时验证撤销例外立即恢复严格校验，端口和Capture会话不变。

证书生命周期、取消及证书/TLS Tools专项使用`certificateLifecycleTest`：启动前只读确认共享目录没有三份材料，保留系统Root基线；经产品清理本轮启动自动生成的CA后再执行原有手工操作断言。已有共享材料时必须在启动App前拒绝，不能删除开发者CA以凑测试前提。普通协议、导航、Reveal和packaged smoke复用已初始化CA，入口先检查就绪；这是测试范围，不是产品隐藏参数。证书Tools保留未信任CA重启时，新契约要求启动补授信但不重放Agent请求。

## `settings.certificates.helper-trust`（macOS，删除自动分支待复验）

2026-09-21目标：删除自动修改授权规则和后台trust/untrust；直接由普通用户前台helper调用Security API，请用户在系统窗口确认。保存Main实际路径日志，操作前后读取`com.apple.trust-settings.admin`并比较包含`created/modified`的完整规则；不能出现自动尝试或回退日志。不增加产品测试参数，Windows原流程不变。旧Green不覆盖此次删除后的产物。

1. 创建独立profile、trace及系统Root/admin trust基线，启动真实Electron并确认helper/listener就绪，记录helper PID及公开能力；既有CA不作为输入或清理目标。
2. 经Settings Certificates真实Generate创建本轮CA，读取公开指纹并确认基线不存在；点击Install，要求系统信任由已部署helper的前台入口完成。若macOS要求确认，验证Main子进程为固定helper的`certificate.trust`，用户在系统窗口亲自确认；成功后产品显示可Uninstall，不修改Preload/Main、原生返回值或授权策略。
3. macOS fixture核对本轮Main的进程代际，不允许Main直接执行`security add-trusted-cert/remove-trusted-cert`。前置Red若出现旧路径，只取消精确属于本轮CA的唯一原生窗口以保护宿主，并明确失败，不能把取消视作安装成功；不得操作无关授权窗口。
4. 只读确认精确CA存在且真实系统信任验证通过，helper PID保持不变，MITM仍关闭；经产品Uninstall撤销trust并删除系统证书，macOS专项为用户系统确认等待最多120秒，Root集合精确恢复，经Delete删除本地材料。Windows超时不变。
5. 重复Generate/Install/Uninstall/Delete，第二张CA指纹必须不同，同一helper仍复用。保存两轮公开指纹、helper身份、系统验证及基线哈希证据；真实Close后由宿主guard验证Main/Core/Worker、8888、完整代理和admin trust恢复。

本轮目标是macOS权限写入和确认归helper，不承诺绕过系统要求的用户认证，不改变Windows原流程；缺前置Red、最终Green或系统恢复证据不得标passed。API拒绝时的已有CA保护及撤销失败不删除由产品unit/native integration覆盖；不得为制造取消场景添加产品测试后门。

2026-09-24续验：用户明确批准通过产品删除原日常CA后，当前签名包的cancel-trust与helper-trust两条2/2通过，记录在`/tmp/interceptor-item4-20260924-certificate-lifecycle.json`及同名trace目录。Main56784/Core56864、Main57319/Core57407均正常退出，两个不同测试CA经产品生成/信任/撤销/删除，常驻helper保持，其他System Root/admin trust恢复、材料与journal清理、8888释放；独立复核为`/tmp/interceptor-items2-7-20260924-pause.json`。此结果不覆盖真正未知写入的可靠解除，也不覆盖Windows实机。

历史前台方案：开发成功/取消各1/1；同一生产产物成功授信/撤销及取消2/2，Main/Core、前台helper、8888、代理与证书恢复已验。证据为`/tmp/interceptor-macos-helper-trust-20260920-production/`及同前缀`-results.json`。后续自动方案已放弃，该旧Green不代表本轮新产物通过；产物范围见[Handover](../../../../../architecture/HANDOVER.md#verification)。

## `settings.certificates.cancel-trust`（macOS，直接前台授权待复验）

当前前置/最终验证：Install直接请求前台helper；真实取消归属本轮的系统窗口，产品先清除本轮CA，再断言恰有一次直接授权日志、没有自动尝试/回退日志，完整授权规则和Root/admin trust均保持基线。窗口或环境失败不计产品Red。

2026-09-21前置Red：`/tmp/interceptor-remove-automatic-trust-20260921-e2e-red/`在真实取消、CA清理和完整规则不变之后，精确失败于直接授权日志为0；旧自动回退日志存在。Main54482/Core54495正常退出，宿主guard通过。新产物已构建/audit，组件更新需用户系统确认，暂不在场；最终取消与成功workflow未运行，不复用历史Green。

2026-09-20前置Red：`/tmp/interceptor-macos-automatic-trust-20260920-e2e-red/`在原生取消、CA清理及规则恢复后，精确失败于自动回退日志为0而非1；Main64346/Core64357正常退出。新版组件尚未核准，production smoke在Renderer前等待超时，最终Green待用户在场；不复用下方旧前台路径结果。

1. 创建独立profile、trace和系统Root/admin trust基线，启动真实Electron并确认常驻helper/listener就绪；通过Settings Generate创建本轮CA并记录公开指纹。
2. 点击Install，macOS fixture只认本轮Main的固定helper子进程及`certificate.trust`参数，核验Main/helper/SecurityAgent的进程代际和唯一授权窗口；不再以Main的`security`子进程冒充helper。
3. 对该窗口真实发送Escape，不读取或输入密码；等待产品Install恢复可操作，MITM仍关闭，新增CA由产品撤回，系统Root集合精确等于基线。
4. 经产品Delete删除本轮本地材料，保存前台helper身份、公开指纹、集合哈希和取消结果；正常Close，由宿主guard确认Main/Core/Worker、8888、完整代理和admin trust恢复。

系统没有实际显示可归属的确认窗口时不能伪造取消结果，也不修改授权缓存或系统策略强迫出现窗口。以下保留各阶段历史结果，不替代此次直接授权路径的最终验证。

以下为旧`settings.certificates.cancel-trust`流程的历史证据，不代表新的helper trust流程通过：

2026-09-18产品unit6 Red后18/18；真实前置`/tmp/interceptor-macos-trust-cancel-20260918-e2e-red/`6.5秒失败于本轮新CA残留，取消和正常Close均真实执行，Red后的单独恢复不算Green。最终`/tmp/interceptor-macos-trust-cancel-20260918-e2e-green/`1/1（5.8秒），公开证书集前后SHA-256一致、本轮CA不存在，Main10805/Core10812的gracefulDestroyVerified=true，代理/admin trust与8888恢复。

2026-09-19同步`8d153821`并排除暂停的弹窗动画后，`/tmp/interceptor-stage-sync-20260919-certificate-cancel/`相同流程1/1通过（6.7秒），产品撤回新增CA、正常退出和完整代理/admin trust恢复。当前package/artifact audit及`/tmp/interceptor-stage-sync-20260919-production-smoke/`1/1（2.5分钟）通过；相关产品回归227 passed、2 Windows native skipped及Desktop类型通过。只登记取消路径passed，成功授信、root卸载/rollback和Windows原生验收不由此替代。

macOS系统代理crash-recovery：App A接管并持久化用户级完整快照，测试精确终止A及子进程，全新profile启动App B，确认同一journal的首次original/owned不变，再正常Close恢复。macOS路径为`~/Library/Application Support/Interceptor Platform/system-proxy/journal.json`，独立于默认profile；crash前先确认实际journal不属于profile。Windows使用两个不同profile和用户级共享journal。两平台均保留真实进程/8888/完整代理恢复证据，helper常驻进程不是App子进程，不随App crash重新授权。

## `settings.helper-startup`（macOS，双入口复用已验证）

1. 保存launchd、代理、CA信任和组件原状态，创建独立profile；业务E2E由driver启动未打包的真实Electron和本项目production bundle，经Renderer CDP操作，与Forge共用开发授权。显式选择签名产物时仍走生产鉴权，Windows driver保持原路径，不使用产品测试参数或fake API。
2. 首次启动由Main检查并部署本次构建的helper，用户仅在系统授权窗口亲自批准；App位置/所有权不变，不打开`.pkg`或系统Installer。开发配置为root保护的`development.json`（`protocolVersion / socketPath / clientUserId`）；出现真实App root前组件必须就绪，否则前置检查失败。
3. 验证Main/Core/listener和组件root所有权，只读核对实际launchd plist为`ProcessType=Interactive`、`UserName=root`、`GroupName=wheel`及`Umask=077`；记录helper PID、inode与配置哈希。服务同步响应Main，不能用Background资源限流拖过现有30秒期限；生产完整资源、内嵌代码、全部架构及运行时校验保持。通过产品Close退出并验证完整代理恢复、进程销毁和8888释放。
4. 同profile启动第二代App，通过Settings UI进入Proxy；helper PID/inode和配置保持，启动不重复部署；保存独立trace和只含摘要的复用证据。第二代经产品Close退出，再验证Main/Core/Worker全退、8888和完整代理恢复。
5. 首次部署的常驻组件在相关macOS验收期间保留以验证跨workflow复用，不能把它当作本轮Main子进程终止；整轮结束需按原安装状态确认保留或通过正式`uninstall-helper`恢复。CA流程仍由对应真实TLS workflow清理系统证书与admin trust，不把此只读流程当作CA验收。
6. 另运行相同workflow的下一轮独立profile并比较helper PID、inode和开发配置哈希，确认开发/App重启与业务E2E复用同一组件；核验生产授权配置未被开发安装覆盖。签名产物的完整资源、运行时拒绝及packaged smoke独立通过，不能用开发宽松入口冒充生产安全验收。

缺Main接入前置Red、最终Green或退出恢复证据不登记passed。签名App构建失败、原生授权不可用或driver连接失败不算产品Red，不通过伪造客户端、Store注入或直接业务API代替UI。

2026-09-18开发入口前置日志：`/tmp/interceptor-development-helper-startup-20260918-red/`真实Main因生产包路径限制返回`invalid-request`，宿主代理未接管、8888释放。开发首次授权另遇authd拒绝Desktop代码路径，保留`/tmp/interceptor-dual-entry-development-e2e-20260918/`的失败，不计为用户取消；授权暂存修复后`/tmp/interceptor-dual-entry-development-e2e-20260918-staged/`两轮四代2/2通过，Main/Core全部gracefulDestroyVerified=true，helper PID7865与配置哈希跨workflow不变。此结果覆盖开发与业务E2E复用，不代替root卸载或生产安全；后者由同轮严格签名/资源原生检查、packaged smoke和实装双socket拒绝证据覆盖，见[Handover](../../../../../architecture/HANDOVER.md)。

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
**策略**：shared；Windows/macOS；host-safety-guard；两代真实 Electron

### Steps

1. 创建空 profile/evidence，由宿主 guard 保存 WinINet/journal/进程代际；启动真实 Electron 与本地
	Model/MCP lab，通过公共 automation ID 配置 Provider、创建 Agent Session 和 MCP Client。
2. 普通workflow复用已就绪的共享CA；证书页显示可用Uninstall但不点击。通过 Settings 正式 UI 添加
	测试自产的 TLS insecure host 与 passthrough host；不生成、授信、卸载或删除证书，不切换系统代理
	或 AppContainer 豁免。只读保存公开CA元数据、当前代理与 exemption 集合用于比较。
3. 经真实 Agent 发送请求并 discovery `settings`，断言六项 query 精确披露；逐项真实调用 Core
	进程、系统代理、证书、insecure hosts、passthrough 和 AppContainer 查询，不出现审批卡。
4. 通过正式 Playground MCP 页面连接 UI 创建的 Client，确认相同六项 Tool 可枚举且逐项执行成功；
	使用协议值、结构化结果与自产 host 验证 Main/Core 真实状态，不以翻译文案定位或判断。证书查询
	必须为`present=true/trusted=true/mitmEnabled=false`，指纹、subject、创建及过期时间精确匹配共享CA元数据。
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

平台只读证据由fixture分派：Windows保留原AppContainer helper的list命令与SID/exemption断言；macOS必须返回`supported=false`及空containers，不调用Windows原生能力或伪造成功。代理查询通过driver使用当前平台helper。六项Tool调用、UI配置、撤权与重启步骤共用，不以平台差异改变业务输入。

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

并发契约：同一真实App经UI创建Auto MCP Client后，同时调用两次`settings_enable_system_proxy`；只能一项成功，另一项立即返回`operation_in_progress`及`system-proxy.enable`并显示现有message提示。两项结束后original/owned保持，新显式重试可执行，之前拒绝的请求不得重放。用例名称`rejects overlapping Enable`；两端共用步骤，trace在读取产品MCP配置时暂停，退出仍由正常Quit和完整宿主guard验证。Core故障恢复是当前操作的必要收尾，不是排队保存用户请求。

**状态**：passed；unit / integration 与真实 Electron Red/Green、销毁证据已验证
**策略**：os-side-effect；Windows；host-safety-guard；两代真实 Electron

macOS续验复用以下相同步骤：系统配置读取使用被测入口配套的SystemConfiguration helper，默认未打包bundle读取Desktop `dist`，显式签名App使用其Resources；journal读取用户级`Interceptor Platform/system-proxy/journal.json`，Windows helper命令和LOCALAPPDATA路径不变。所有比较覆盖完整结构且只输出布尔结果/哈希；macOS仍需独立Green和恢复证据，不能沿用下方Windows记录。

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

两项独立Tool经Main直接调用同一PlatformCapabilitiesService方法，Ask拒绝不写系统，Allow/Auto执行结果与真实系统状态相符；授权、取消和
重启不绕过ownership保护。Red必须精确来自缺少Tool或行为缺口，不接受selector、UAC或环境失败。
Green必须包含审批裁决、两项真实执行、重复Restore、撤权零写入、重启零重放及完整宿主销毁。

调用取消边界：Agent/MCP请求进入Main业务前可拒绝；平台API不接收AbortSignal。操作开始后，即使调用方停止等待，也必须完成native回读与Core同步后才释放模块占用。用户在helper准备、证书或代理操作期间点击Quit，应立即看到当前operation提示，App继续运行；操作结束后不自动退出，需重新点击Quit，再验证完整代理恢复和进程销毁。启动授权期间的Quit需要独立真实窗口证据，不能以unit busy检查代替。

2026-09-05：unit13/13从缺失Tool精确Red转Green，真实workflow先Red于两项未披露；摘要随后Red于
`value`再Green。最终与只读/权限workflow联合3/3通过，2次Deny、2次Allow、3次Auto、重复Restore
`not-owned`、首次original哈希保持、两项撤权零写入、同profile冷启动自动接管且Model增量0均通过。
两代Main/Core为`37532/43864`、`41620/2448`，均`gracefulDestroyVerified=true`，8888释放且WinINet/journal
恢复；证据在package/smoke前归档。新增明暗8视图48/48、最大0.5px，Windows package/audit/smoke通过。

<a id="settings-tools-tls"></a>
## `settings.tools.tls`

**状态**：Windows历史passed；2026-09-26 macOS新签名包1/1，CA清理、双代销毁和宿主恢复通过
**策略**：privileged UI；Windows/macOS；host-safety-guard；两代Electron

macOS只读信任查询使用平台fixture，Windows原certutil参数/输出判断保持。当前macOS证据为`/tmp/interceptor-item4-resume-20260925-certificates-positive.json`及同名目录：四项TLS Tool的Ask/Auto、挂载面板同步、revision冲突、未信任意图、实际解密、撤权和重启零重放均通过；最终经产品清理自产CA，完整Root/admin trust与代理恢复，全部进程退出且8888释放。

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

<a id="settings-tools-certificates"></a>
## `settings.tools.certificates`

**状态**：Windows历史passed；2026-09-26 macOS新签名包六项Agent/MCP、Finder/Viewer真实关窗、双代清理及取消冲突通过；Manager管理员MMC原生专项按用户要求排除
**策略**：native-ui + privileged UI；Windows/macOS；host-safety-guard；两代Electron

可能触发系统确认的Agent Install/Uninstall/Delete复用平台证书等待配置（macOS 120秒、Windows 30秒）；Deny与普通Tool仍使用15秒。finally先确认运行中的Agent进入终态，再关闭本轮窗口、清理CA；前一步不确定时保留材料并报告失败，不在授信仍进行时删除材料。该测试收尾顺序不证明产品多入口并发变更已受保护，也不替代MCP超时/取消的专项验证。

并发验收：由产品生成CA，Agent或MCP Install仍等待真实系统确认时，通过实际Settings UI点击Delete/Generate或切换MITM。Main必须立即拒绝后来的冲突请求，提示当前正在安装证书，公开指纹、材料和Core状态保持；再完成原生确认，原调用才完成，之前拒绝的操作不得稍后执行。同组IPC/Agent/MCP使用同一保护，退出冲突也只拒绝本次退出。保留前置Red、最终Green、原生确认与UI提示的trace/截图、完整Root/admin trust/代理和两代退出证据；不注入Store、不暂停helper或伪造系统确认。

macOS定向用例同在`tools-certificates.workflow.ts`，名称含`rejects overlapping mutations`：从空共享目录启动并清理本轮启动CA，经Generate生成待装CA、通过UI创建Auto MCP Client；Install的真实helper确认窗口存在且原调用未结算时，先实际点击Quit，原空提示区须在5秒内显示`certificate.install`且App保持。随后第二个MCP Delete须在5秒内返回`operation_in_progress`及`certificate.install`，实际UI Delete同样显示该操作标识且材料保持。用例按Main/helper/SecurityAgent进程代际取消自己的原生确认，等待原Install终态，再确认被拒绝Delete/Quit未重放、材料指纹不变；最后经UI删除测试材料，fixture验证完整宿主恢复。原MCP请求允许120秒系统确认，不能把5秒冲突返回期限套到原生写入上。Windows原生取消fixture未实现前该定向用例明确skip，不计Windows通过。

本用例首次启动授信和准备清理的撤销需要正常人工确认；进入业务Install后保持原生窗口不动，由workflow自动取消。先验Quit的新提示，再验Delete，避免等待旧提示自动消失时原生授权已结束；Quit之前仍明确断言原Install尚未结算，不缩短或跳过真实授权。若确认提前完成导致条件消失，记录为验收前提失败，不将正常允许Quit判为busy缺陷。清理分别收尾原请求和产品删除，即使原授权已结束也不重复取消已退出的进程，不因取消失败跳过本轮CA的正常清理。

### Steps

1. 确认共享CA三文件均不存在，捕获宿主基线，创建空profile并启动真实Electron；允许产品完成首次生成/授信，
	再通过Certificates UI清理本轮启动CA，确认未生成且未受信任。通过UI配置本地Model Provider并发现六项证书Tool，不注入Store或伪造材料。
2. Agent以Ask调用Generate并Deny，确认身份、信任和原生窗口均不变；Allow生成CA，当前面板立即显示公开身份。
	Auto在未受信任状态重新生成，确认身份变化、没有旧CA进入信任库，解密意图不变。
3. Agent通过Install完成真实系统授权，确认该CA已进入Windows LocalMachine Root，或macOS System Keychain与admin trust；当前面板显示trusted。
	再次Generate必须拒绝，证书身份及信任不变，不能绕过UI的受信任禁用状态。
4. Agent分别调用Reveal、View；观察真实文件管理器和证书查看器窗口。
	用真实键鼠关闭本轮拥有的窗口，不改写Shell、原生Dialog或UAC结果，不关闭用户原有窗口。
5. Agent执行Uninstall，确认仅移除当前CA信任且材料保留；再次Install后直接Delete，确认先卸载信任再删除材料，
	当前面板回到未生成状态。Ask拒绝与取消分支均不得进入实际写入或打开窗口。
6. 通过正式Settings UI开启MCP并创建本轮Client，用产品产生的Token连接。经MCP复跑六项正向操作、Ask/Auto及
	原生窗口验证；证书和输入均由本workflow的产品操作产生，不自行写文件或种入信任库。
7. 分别关闭六项Agent/MCP授权，确认旧Chat及Client不能再执行，CA、信任、窗口和Model请求没有额外副作用。
	留下未受信任的本轮CA用于重启验证，隐藏敏感文本后正常关闭第一代。
8. 验证第一代Main/Core/Renderer/Worker全退、8888释放及WinINet/journal恢复；使用同profile启动第二代，
	确认同一共享CA身份及Tool授权状态保持；启动为保留的未信任CA补授信，Model请求增量0，不重放Agent/MCP调用或打开重复的查看窗口。
9. 通过正式UI卸载仍存在的本轮信任、删除本轮CA并关闭本轮原生窗口；保存脱敏证据、trace和两代metadata。
	正常退出并验证整个Root指纹集合、WinINet/journal、进程和8888恢复，最后删除profile；失败保留profile。

### 证据

- 2026-09-26 macOS：六项Agent/MCP、各六次Deny、受信任重生成拒绝、四次Finder/Viewer真实打开关闭、十二项入口撤权及重启零重放1/1，证据为`/tmp/interceptor-item4-resume-20260925-certificates-positive.json`及同名目录；两代均正常退出，测试CA清理，完整Root/admin trust与系统代理恢复、8888释放。
- 同轮取消冲突1/1在`/tmp/interceptor-item4-resume-20260925-certificate-conflict-ordered.json`及同名目录：Quit/MCP Delete/UI Delete在授信未结束时拒绝，取消后不重放且材料保持，最终通过产品删除。此前三次因授权先于Quit断言结束而失败的结果保留，不冒充产品Red；首轮精确CA恢复为`/tmp/interceptor-item4-resume-20260925-conflict-recovery-daily-remove.json`，后两轮收尾均已清理。
- 2026-09-09删除MMC原生专项后，本条复跑1/1 Green；两代Main/Core `14248/2888`、`39644/4212`均`gracefulDestroyVerified=true`，Root/CA/WinINet/journal恢复，8888释放、MMC无残留。最新归档为TEMP下`interceptor-certificates-keep-six-green-20260909-142011.zip`，SHA256 `C433C0B4A6A61821F3A437FF22740F6E3F30CDD3784ACBB41CD899A700BC3F7B`。
- 2026-09-09最终Green：本条1/1（54.2s，Runner总计55.9s），两代Main/Core为`47704/19820`、`35384/17472`，均`gracefulDestroyVerified=true`。
- 六项Agent/MCP、各六次Deny、受信任重生成拒绝、四次Explorer/Viewer打开关闭、十二项入口撤权及重启零重放通过；Root集合、WinINet/journal恢复、8888释放，成功profile删除。
- 原关窗驱动在鼠标事件处理前立即释放置顶；改为等待句柄消失后释放，空目录三次连续关窗与真实流程均通过。一次性检查脚本已删除，未修改产品或Windows权限。
- 前次完整证据在TEMP下`interceptor-certificates-six-e2e-green-20260909-002441.zip`；Manager管理员MMC原生要求现已由用户排除，不以本条通过冒充该专项通过。
- 2026-09-08历史：原合并workflow在MMC关闭处被Win32权限拒绝，后面的MCP及重启当时尚未执行，随后拆分验收；原始Red和失败证据继续保留，当前边界以下方用户最新约定为准。
- 原生窗口失败与CA清理已隔离，最新完整尝试Root指纹集合恢复、8888释放；此前一次CA残留通过保留profile及正式UI自动恢复1/1，证据在TEMP下`interceptor-certificates-profile-recovery-20260908.zip`。一次性辅助诊断/恢复流程已删除，不作为永久测试。
- 原七项发现缺失的Red覆盖本六项；不能把selector、UAC、构建或环境失败算产品Red。
- Green记录六项Agent/MCP调用、公开身份、受信任重生成拒绝、面板同步、Explorer/Viewer及其关闭、撤权和重启零重放。
- 保留两代`gracefulDestroyVerified=true`及Root指纹集合前后相同的证据；不记录私钥、Token、实际证书路径或完整代理配置。
- 外部授权或原生窗口交互若确实不可用，记录具体失败和人工恢复方式，不把只读查询或单元测试当成完整验收。

<a id="settings-tools-certificate-manager"></a>
## MMC 原生验收排除说明

**状态**：用户明确排除管理员MMC原生验收；不是passed，不再blocked
**策略**：保留Tool与逻辑测试，不注册MMC原生workflow

### 逻辑验证

- 单元/集成测试覆盖参数、Agent/MCP授权、Ask/Auto审批、撤权、取消、共用Main调用、启动错误和`{ requested: true }`返回值。
- 当前相关回归为证书owner50/50、MCP专项及registry31/31、Agent适配器22/22、动态授权10/10、Session审批/Auto/取消与持久化integration36/36；Tools、MCP、Desktop typecheck通过。
- 以上逻辑不要求逐分支打开真实MMC；通用Agent/MCP持久化、重启和零重放覆盖继续保留。
- 本条不测MMC自身功能，不读写证书；生成、安装、卸载、删除证书的完整真实E2E不变。

### 排除边界

- 2026-09-09用户明确：需要管理员权限的MMC就不做了，其他keep。不再安排一次或多次真实MMC打开、关闭和进程清理，也不要求管理员终端或人工等待。
- `settings.tools.certificate-manager`原生workflow和专用MMC输入/进程辅助代码已删除；不使用`test.skip`冒充通过。
- Manager Tool、Main/IPC/Agent/MCP调用、公开结果、UI摘要、语言、parity和recipe全部保留。
- `settings.tools.certificates`六项真实Agent/MCP流程、Reveal/View原生窗口与完整退出恢复，以及通用授权/重启测试全部保留。

### 证据

- 原生MMC要求已明确排除，不登记新的原生Green；历史失败证据保留，但不再作为Manager交付门禁。
- 逻辑日志在TEMP下`interceptor-manager-logic-20260909.log`、`interceptor-manager-focused-regression-20260909.log`及`interceptor-manager-session-approval-20260909.log`；不冒充新原生Green。
- 原七项发现缺失的真实Red继续保留，不回滚或伪造新的Red；范围调整不改变产品API或Windows授权。
- MMC的`WM_GETTITLEBARINFOEX`返回`messageError=5`、`enabled=true`、Close bounds全0，独立Manager诊断已复现。原trace和日志在TEMP下`interceptor-certificates-mmc-access-denied-20260908.zip`。
- 2026-09-09实测Runner为Medium、MMC为High且Runner UIAccess=0；DWM可读取按钮区域，但不能据此绕过UIPI模拟输入限制。
- 不修改UAC或token、不自动提权、不删除Tool；取消的是管理员MMC专项要求，不把其余六项Green冒充本条原生验收。
- 不再提供或执行管理员MMC恢复命令；保留的六项入口为`npm.cmd run test:e2e:workflow --workspace @interceptor/desktop -- --grep "settings.tools.certificates "`。

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
- 这次2026-09-08关联运行使用69项registry、138个授权开关的worktree，记录不等于当时已提交数量；Manager管理员MMC专项随后由用户明确排除，不由本条或packaged smoke冒充通过。
- Red只能来自四项Tool缺失或目标业务缺口；权限、selector或构建失败保持blocked，不算产品Red。
- Green记录四项Agent/MCP调用、两列授权、挂载UI即时同步、单项/批量范围及两代正常销毁。
- 初始与最终完整exemption集合hash必须相同，枚举外SID保持不变；不保存完整机器SID清单、helper路径、凭据或代理配置。

<a id="settings-navigation"></a>
## `settings.navigation`

**状态**：passed
**策略**：shared

macOS首轮验收仍待Green：保留九个section、键盘和跨workspace往返；App Containers按产品已有unsupported状态检查Search、Enable all、Disable all不出现并截图，不要求Windows专属控件。Windows原断言不变。macOS启动等待boot退出，产品Close后预留120秒供用户处理原生代理恢复授权；不自动批准、不输入密码，实际恢复与进程/8888/journal检查保持。

2026-09-14增加离线字体契约：进入默认Certificates后保存`settings-fonts.json/png`，确认`Inter`只注册设计的400/450/500/600/700、550字重请求实际加载非空FontFace，CSSOM中的字体URL均来自`interceptor://app/`。不切换应用语言，不要求英文显示文案；原九个section、键盘和往返步骤保持。旧注册的真实Red为Inter字重集合空且loadedFaces=0，Main/Core `28472/47860`正常退出/宿主恢复，证据TEMP `interceptor-inter-weights-20260914-e2e-red`；Resource Timing在自定义协议未列出字体，不能用它代替CSSOM与实际FontFace检查。

首次最终运行已读到五个Inter字重、loadedFaces=1和35个本地Inter URL，但URL检查误包含其他字体的合法内嵌`data:`资源，不能算产品Red或整体Green。已将CSSOM筛选限定为Inter，不修改字体资源、CSP或预期本地协议。Main/Core `17424/12864`正常退出；TEMP `interceptor-inter-weights-20260914-e2e-green`保留失败证据，目录名不代表通过。2026-09-15恢复后同一workflow1/1（20.7s）及所有原导航步骤通过，Main/Core `10628/38856`正常退出、宿主guard/trace齐全；当前证据`interceptor-ui-acceptance-20260915-settings`。

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned且系统设置未修改。
2. 点击 `shell.workspace.settings`；检查 Settings rail 九个 section 可用，且只有 `settings.section.certificates` 具有 `aria-current=page`。
3. 依次点击 Proxy、App Containers、TLS passthrough、Certificates、Appearance、Storage、Privacy、Agent、Updates；每次确认目标项成为唯一 `aria-current=page`，并等待目标面板稳定。Agent section 额外通过键盘聚焦并按 Enter 激活，确认 rail item 使用原生 button 语义。
	Updates的`settings.updates.github-sign-in`保持未登录可见态；按钮使用flex、align-items:center和7px gap，GitHub图标在Button独立icon槽，文字label不再包含图标。Button源码的inline-flex作为flex子项时计算为flex，按计算值检查。保存按钮截图；不点击登录，不打开外部浏览器，不把该检查作为真实GitHub授权或通知下载验收。
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

**状态**：原排序流程passed；2026-09-12列表行高代码完成，新增布局断言待E2E
**策略**：shared；Windows

### Steps

1. 由host-safety-guard保存宿主基线，创建独立空profile/evidence并启动真实Electron，等待Core、8888与冷启动系统代理自动接管；保持当前语言，不操作exemption或UAC。
2. 进入 Settings → App Containers，等待真实 Windows helper 枚举完成；读取公共 SID 行 automation ID 和 `data-exempt`，不得用显示名、翻译文案或 CSS class 判断顺序。保存每行名称15px、包名14px行高；存在推荐标签时验证20px框、inline-flex center及与名称的中心差不超过1/devicePixelRatio。
	列表头两段文字由父flex设置align-items:center，并继承该行自然行高，不继承Shell的压缩行高或给说明单独补px；保存列表头截图，再执行原只读排序与搜索流程。
3. 确认所有 enabled 行连续位于 disabled 行之前；同一状态内保持 helper 的名称顺序。当前宿主必须同时存在 enabled 与 disabled 样本，才可作为 retrospective Red/Green 证据。
4. 从真实行 SID 中选择一个能缩小结果集的搜索值，通过 `settings.app-containers.search` 输入；确认结果是过滤前列表的有序子序列，且仍满足 enabled-first。
5. 清空搜索，确认完整 SID 顺序逐项恢复；全程不得点击单项 switch、Enable all 或确认按钮，不触发 UAC、不改 exemption。
6. 附加 `app-container-ordering.json`，记录过滤前、过滤后和恢复后的SID/`exempt`状态及rowLayouts；确认Renderer page error为0。
7. 保存 screenshot、trace、Main/Renderer 日志和 metadata；通过 `shell.window.close` 正常关闭 App。
8. 验证Main、Renderer、Core、Worker全退、8888释放、完整WinINet/journal恢复且`gracefulDestroyVerified=true`；删除profile。

### 预期效果

真实 Windows AppContainer 列表稳定地将 enabled 项置顶，同组顺序不变；搜索只筛选已经排序的列表，清空后不产生重排；只读验收不造成系统副作用。

### 证据

- 2026-09-12布局断言仅预留，用户暂停后未运行前置/最终E2E；以下排序业务与产物证据为历史结果，不外推到新布局。
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

<a id="settings-proxy-upstream"></a>
## `settings.proxy.upstream`（macOS，基础链式转发已验，外部改写待验）

1. 外部ClashX等HTTP代理保持运行，系统HTTP/HTTPS均指向同一loopback端口；不使用TUN替代。无此环境算前置阻塞，不计产品Red。
2. 自动fixture在App启动前只读保存生效上游及完整service快照；独立profile/trace及host guard随后启动真实Electron。
3. 经公共Capture入口核对状态栏仍显示原上游，不把Interceptor的8888当作上游；前置Red应精确失败在此业务断言。
4. 测试客户端经真实8888向`example.com:443`建立CONNECT/TLS，开启正常证书校验，不生成CA、不调用产品API设置上游。
5. 保持TLS连接，核对8888所属Core进程的已建立连接指向原上游端口；Capture必须出现真实目标，不能仅凭网页成功判断链式转发。
6. 通过Settings Restore恢复完整原配置；保存trace、metadata和只含端口/哈希/布尔结果的证据。
7. 正常Close，host guard验证Main/Core/Worker、8888、完整代理与admin trust恢复；不停止或改写外部ClashX。

基础链式转发已有前置Red及开发Green；既有产物smoke 1/1，产物包含本地暂停项，范围见[Handover](../../../../../architecture/HANDOVER.md#verification)。系统授权、外部网络或selector失败不算产品Red。

外部改写场景使用独立App/profile：

1. 只在ClashX和其root helper已运行、开发helper ready且无系统确认窗口时执行。
2. 通过ClashX原生菜单重新应用原代理，再停用系统代理；ClashX进程与监听不退出。
3. 保存外部配置，经产品Close关闭Interceptor，断言退出没有覆盖该配置。
4. 通过ClashX原生菜单重新启用原代理，对照完整基线；宿主guard再核验进程、8888和证书恢复。
5. 仅保存哈希与实际布尔结果；原生入口不可用或需授权时记blocked，不放宽恢复断言。

外部改写当前`blocked`：三次运行未可靠切换ClashX原生菜单，未到业务保护断言；最后一轮完整基线恢复、Main/Core正常退出。证据见[Settings上游结果](../../../../../architecture/features/settings.md#macos-effective-upstream)，不在无人值守时继续尝试；基础链式转发的独立Green保留。

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

macOS接入已有平台driver：同profile journal、完整结构比较及Security只读信任查询。Windows保留原路径、JSON比较、180秒总预算及业务操作顺序；macOS完整授信流程待用户在场复验。

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

macOS验收同时检查公开CA身份、安装前未受信任、正式Install后系统信任及产品状态一致、Uninstall后不再受信任。根CA检查不能仅凭钥匙串中存在指纹；系统的根信任链评估与实际HTTPS叶证书握手分别验收。使用产品在同一workflow生成的CA，不能在E2E预造证书或直接调用TrustStore API；只有缺失信任设置、非法证书等无法由现有UI稳定产生的边界由所属unit/integration验证。

macOS Install的待验收路径先提权导入系统钥匙串，再由普通用户Main启动不带`-k`的`security add-trusted-cert`，Security框架向用户请求admin trust授权；不是以root运行App或修改系统授权规则。成功证据必须同时有匹配证书的系统信任评估、产品状态、真实HTTPS请求和清理后的原证书集合；导入失败不继续trust，导入成功但trust失败不得继续MITM。原`capture.scenarios.tls`是本轮端到端检查入口；系统密码只由本机用户在原生窗口输入，Windows授权路径不变。

macOS Uninstall先清除该CA的admin trust，再删除系统钥匙串内同一指纹证书；前一步失败不能继续删除公开证书而留下无法按证书移除的孤立trust。真实TLS workflow保存`trust-settings-before`/`trust-settings-after`并要求完全恢复，同时保留原证书集合断言、正常产品Close和进程/8888/代理恢复门禁；Windows仍检查原机器级Root集合。

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

macOS只读子范围复用已有共享CA：经UI创建MCP Client并在Ask卡批准Reveal及View；Finder选中的精确路径须为当前`root-cert.pem`，允许复用既有窗口但不关闭它。View必须显示同一公开证书的系统只读详情，核对原生helper进程及证书SHA-256窗口身份，真实关闭后helper退出；不得导入证书、请求trust或修改System/login/admin trust。Windows原生driver原样委托。

窗口收尾：本轮Finder点击真实原生关闭按钮，直接核对精确窗口消失；View额外核对前台helper进程退出。finally同时使用本轮已记录及当前可见窗口，不能因文件选中状态变化漏清理；已关闭窗口或已退出的同代进程允许重复清理，PID代际变化仍拒绝。原有窗口单独计数，保留不等于本轮关闭成功；未经用户明确授权不清理历史窗口。

macOS View由普通用户前台helper的固定`certificate.view`显示`SFCertificatePanel`，禁止编辑信任；Main只传公开DER/SHA-256，不传路径或私钥。

Reveal最终1/1（9.0秒）：精确路径、产品MCP审批、原生关窗、Root/admin trust及退出恢复通过，证据`/tmp/interceptor-macos-certificate-external-20260919-reveal-final/`。前两轮失败目录`/tmp/interceptor-macos-certificate-external-20260919{,-path}/`保留；未修改Windows原生driver或授信断言。

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

**状态**：passed；2026-09-16当前Renderer同一workflow 1/1（16.4s），Main/Core与宿主恢复通过
**策略**：os-side-effect

### Steps

1. 创建独立profile、HTTP origin及evidence，启动trace/Electron，等待App/Core/8888并经正式UI开启Recording；保持当前语言，不安装本流程不需要的CA。
2. 通过真实代理发送自产POST及request/response正文，Capture选择自产行并查看实际Response正文；通过Recording按钮暂停新录制，保持已捕获内容不变。
3. 经Settings导航进入Storage，核对`settings.storage.refresh`位于Storage标题同一行最右侧，按钮30px，只有一个bodyBytes用量、没有数据库或重复磁盘总量。使用公开automation ID及DOM结构断言，不依赖翻译后的显示文本。
4. 记录session/exchange/body/bytes，确认非零；点击右上Refresh，完成后统计仍保持，不产生清理或重放。页面说明Clear与Capture列表共用动作；对应语义及15语言由Renderer测试/catalog检查覆盖。
5. 点击`settings.storage.clear`后点`settings.storage.clear-cancel`，确认数值和原请求行/正文仍保留。
6. 再次Clear并点击`settings.storage.clear-confirm`，等待Exchange/Body/bytes归零、当前Session保持1；返回Capture确认列表与选中Inspector同时清空、Recording仍为paused。
7. 恢复Recording，发送第二条独立请求并看到新行，再暂停；点击Capture列表自己的Clear，返回Storage点击右上Refresh确认同样归零。两个入口不互相残留正文或旧行。
8. 保存前后截图、原始数值、按钮位置及trace；由fixture从正常窗口Close退出，让Main恢复原系统代理，不手动替代退出路径。
9. 核对Main/Core/Worker全部退出、8888释放、WinINet/journal恢复；关闭origin并删除profile，失败保留证据。

### 预期效果

Refresh只读取真实Core usage；统计口径为已提交正文总量，包含内存与临时文件，不是Core RSS或磁盘占用。Settings Clear二次确认、Cancel零副作用；两个入口共用`clearCapture()`并同步清理Capture行/正文/selection，不改变录制状态或导出文件，也不新增任务历史清理、预算配置或自动淘汰策略。

### 验证记录

- Renderer前置3 Red、i18n必需键1 Red，最终所属Settings/i18n84项及Desktop/design-vite类型通过。真实前置Refresh父元素DIV而非HEADER，Main/Core `50796/17116`正常退出；最终`17264/39820`正常退出、trace和宿主guard恢复完整，30x30刷新按钮与标题同排且右缘/中心差为0。
- 当前结果中原正文135 B，Cancel保留；Settings Clear和Capture列表Clear都使Exchange/Body/bytes归零、Session保留1，录制保持paused，新请求仍可抓取。首次复验因Recording仍busy而点击无效，`35864/11428`正常退出；等待公共`aria-busy=false`后完整通过，再以最终CSS复跑，不修改产品录制逻辑。
- 证据TEMP `interceptor-storage-delivery-20260915-e2e-{red,green,final,current}`及同名前缀日志，最终汇总`interceptor-storage-delivery-20260915-current-evidence.json`。八态parity与产品前后图见[Storage功能记录](../../../../../architecture/features/settings.md#storage简化)。本workflow不操纵RuleSet、Diagnostics或导出文件，不额外声称它覆盖这些模块；Clear共享命令与原文件任务互斥保持。

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

<a id="settings-tls-compatibility"></a>
## `settings.tls-compatibility`

**状态**：planned；2026-09-12最终真实1/1及恢复通过，保留暂停期行高前置E2E缺口
**策略**：真实TLS流量与产品UI；host-safety-guard；涉及CA时使用正式授权与清理路径

### Steps

1. 保存完整宿主与Root基线，创建独立profile，启动真实Electron并保持当前语言；由正式Certificates UI确认共享CA就绪并开启本profile的MITM。声明`dismissTlsCompatibilityDialogs: false`，专用弹窗不自动关闭。
2. CONNECT实际目标为loopback origin；五个测试自产多级`.test`域名只用于TLS SNI，不依赖外部DNS。TLS client显式只信任另一份独立CA，真实拒绝代理证书，等待Core/Main兼容性事件显示弹窗；不改系统信任、调用Renderer Store或注入假事件。
3. 使用`settings.tls-compatibility.host-list`及`AutomationIdFactory.tlsCompatibilityHost/Pattern`定位列表、host和候选；验证每个真实host对应一行，主host为11.5px自然行高。列表超过264px时可用滚轮和Home/End访问全部行，后续行不得因累计高度不足提前。候选项默认精确host勾选，父域wildcard不自动选中；保存使用`settings.tls-compatibility.add-selected`。
4. 全部取消候选后主动作禁用；取消范围包括系统背景TLS失败带来的默认选中项，而不只是五个测试host。通过真实checkbox取消，不改Store；重新选择自产两个pattern并精确核对当前选中ID，经正常UI批量保存，Settings显示相同结果。另一次真实提示使用Not now退出，不增加持久化pattern。
5. 保存host/行尺寸、选择状态、背景取消项ID、实际TLS证据和截图；清理本流程添加的pattern与profile内MITM设置，保留共享CA和信任，正常关闭产品，验证Main/Core/Worker退出、8888释放和完整系统代理/journal/Root恢复。

2026-09-12首轮既有行为1/1（17.3s，13940/39212）和unit18/18之后，仅补公共automation ID，业务/视觉不变；ID版1/1（23.6s，3600/41668）。最终显式JSON归档版1/1（27.6s，14788/41168），六次真实`SELF_SIGNED_CERT_IN_CHAIN`、五host行尺寸、默认精确选择、wheel/Home/End、全部取消禁用、两项批量保存与Not now通过，origin应用字节0。三代均正常销毁，CA/Root及完整宿主恢复。

最终TEMP `interceptor-tls-compatibility-20260912-evidence`及同名log包含`tls-compatibility.json`、选择截图、trace和metadata；unit18/18、Desktop类型、三场景parity24/24另存同前缀。暂停期行高修改缺少前置真实E2E，不能以公共ID变更前的Green代替，不回滚或另建worktree补造；Inventory保留planned。

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

2026-09-11通知compact尺寸代码完成，unit10/10、四场景parity64/64及浏览器外框/Dismiss检查通过；2026-09-12补真实Button文字子项的2项Red及17/17 Green、Download/Open组合居中。用户已恢复E2E，共享Button在真实正文/HTTPS流程2/2通过，但不是本workflow的通过证据。当前没有通知专属可执行workflow和公共automation ID；仍需真实packaged新release及GitHub授权，不注入Update store或伪造状态。暂停期前置Red与通知最终Green均缺失，详见[更新通知按钮](../../../../../architecture/features/settings.md#更新通知按钮)。

### Steps

1. 创建profile/evidence，由host-safety-guard保存宿主基线；启动packaged App和trace/CDP driver，等待Core、8888及冷启动系统代理自动接管。保持当前语言，使用能显示通知的窗口宽度，并检查通知只受真实Update状态控制。
2. 通过真实Update check进入Available；确认notification不遮挡窗口控制，动作高32px、水平padding 11px、15px图标和真实文字均居中，两者组合在整个button框内的水平/垂直中心差不超过1/devicePixelRatio；按钮与44px通知栏也居中。保存文字DOM Range和图标/按钮边界，不仅核对CSS声明。Settings页的普通Download按钮仍34px。
3. 经公共automation ID点击通知中的真实Download动作；记录原始尺寸与截图，不以翻译文案或CSS class定位控件。
4. 确认Settings Updates和Header notification共享同一状态，不重复创建任务。
5. 等待下载完成进入Downloaded，确认notification文案/action同步，Open同样使用32px紧凑规格，普通Settings Open installer按钮保持34px。
6. 点击notification的Open installer action并取消安装器。
7. 返回各workspace，确认available/downloaded显示通知、其余状态隐藏；点击Dismiss后通知隐藏但Settings动作仍可用。busy时通知动作禁用，Dismiss不随之禁用。
8. 保存evidence并Close。
9. 验证Main/Core/Worker全退、8888释放、完整WinINet/journal恢复和本次下载临时文件清理。
10. 删除profile。

### 预期效果

Update notification与Settings共用真实Update store；只在两种状态显示；所有action真实且不会遮挡Shell或创建重复下载。
