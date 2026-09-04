# Settings 与 Updates Workflows

本文件定义 Settings 九个section和Update notification的完整E2E流程。每条workflow独立启动Electron、独占profile/trace；系统代理、CA信任和外部程序操作必须由真实App UI发起。

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
