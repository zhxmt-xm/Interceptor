# Settings 与 Updates Workflows

本文件定义 Settings 六个section和Update notification的完整E2E流程。每条workflow独立启动Electron、独占profile/trace；系统代理、CA信任和外部程序操作必须由真实App UI发起。

<a id="settings-navigation"></a>
## `settings.navigation`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence，启动trace/Electron，等待App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认System Proxy仍未owned且系统设置未修改。
2. 点击 `shell.workspace.settings`；检查Settings rail六个section可用且默认选中Certificates。
3. 点击 `settings.section.proxy`，等待真实listener/system proxy状态。
4. 点击 `settings.section.certificates`，等待CA/trust/insecure hosts状态。
5. 点击 `settings.section.appearance`，检查明确的未实现占位。
6. 点击 `settings.section.storage`、`settings.section.privacy`、`settings.section.updates`，逐项等待真实状态。
7. 选择 AppContainer access，切换到 Capture，再返回 Settings，确认仍打开 AppContainer access；随后通过明确导航返回 Certificates，确认 section 和 scroll/layout 稳定。
8. 保存evidence并Close。
9. 验证进程/8888销毁。
10. 删除profile。

### 预期效果

六个section通过Settings rail真实导航；跨 feature 返回时保留最后访问 section；Proxy/Certificates/Storage/Updates使用真实后端；Appearance不伪造未实现功能；Header/Main/statusbar一致。

<a id="settings-app-containers-enable-all"></a>
## `settings.app-containers-enable-all`

**状态**：planned
**策略**：os-side-effect；headed；Windows

### Steps

1. 创建独立 profile/evidence，启动 Electron，等待 App/Core/8888/readiness；点击 `capture.readiness.cancel`，确认 System Proxy 未修改。
2. 进入 Settings → App Containers，等待真实枚举，确认 enabled 项置顶并记录 enabled/total。
3. 点击 `settings.app-containers.enable-all`，确认 dialog 显示将新增 exemption 的准确数量、系统范围与一次 UAC 说明。
4. 点击 Cancel，确认未调用 helper，列表和计数不变。
5. 再次打开并确认，App 只发起一次原生 UAC；用户完成授权。
6. 等待 helper 一次 read-modify-write 与读回校验完成，确认全部当前 AppContainer 为 enabled、计数为 total/total、按钮 disabled。
7. 确认 helper 保留枚举外已有 exemption SID，且失败时 UI 保留原 snapshot 并显示错误。
8. 保存 trace/evidence，关闭 App；验证 Main/Core/8888 完整销毁并删除 profile。

### 预期效果

一次用户交互对应一条 Main 命令和一次 UAC；所有当前 AppContainer 原子加入 exemption，不发生 Renderer 循环、重复提权或部分成功。

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

<a id="settings-proxy-mitm-persistence"></a>
## `settings.proxy-mitm.persistence`

**状态**：passed
**策略**：os-side-effect；headed；Windows

### Steps

1. 创建 fresh profile 和第一份 evidence；启动第一代 Electron，等待 App/Core/8888/bootstrap 完成，确认 Recording、WinINet 等于第一份 ownership journal 的 `owned`，且 `original != owned`。快照只在内存比较，不进入 evidence。
2. 只通过 Settings UI 依次 Generate、Install CA 并完成真实 UAC；开启 MITM，在 Certificates 添加 `localhost` 例外，在 TLS passthrough 添加 `127.0.0.2`。
3. 确认 journal 为 `phase=owned`；不打开会渲染原 proxy server、bypass 与 PAC 的 Proxy 面板。
4. 由测试环境异常终止第一代 Main，不点击产品 Close/Restore；确认第一代 Main/Core 退出、8888 释放，journal 与 owned WinINet 仍保留。
5. 使用同一 profile 启动第二代 Electron。Main 必须在创建 Renderer/Core 前消费旧 journal 并精确恢复 `original`；随后正常 bootstrap 再次接管并创建新 journal。新旧 journal 的 `createdAt` 必须不同，`original` 必须完全相同，最终 UI 为 Recording。
6. 确认证书文件仍为第一代生成的同一 SHA-1、当前处于有效期内，并由只读 `certutil -verifystore` 确认仍受 LocalMachine Root 信任。
7. 进入 Certificates，确认 MITM switch 仍开启且 `localhost` 例外仍存在；进入 TLS passthrough，确认 `127.0.0.2` pattern 仍存在。断言只使用公共 automation ID、DOM 状态和只读 OS 比较。
8. 通过 Settings UI 删除 `127.0.0.2` passthrough 与 `localhost` 例外，关闭 MITM，Uninstall 并 Delete CA；确认测试 CA 不再受信任且 profile 无 CA。
9. 保存两代 trace、final screenshot、Main/Renderer 日志和脱敏 persistence evidence；点击第二代 `shell.window.close`。
10. 验证第二代 Main/Core、8888 完整销毁，WinINet 仍精确等于步骤1快照，journal 不存在并删除 profile。

### 预期效果

异常退出只留下可验证的 ownership journal；下次 Main 先安全交还原系统代理，再由新一代 bootstrap 正常接管，不把旧 owned 值误当作新的 original。CA身份、有效期、系统信任、MITM用户意图、TLS passthrough与源站例外均跨进程保持；本workflow不替代`capture.protocols.with-mitm`的数据面验收。

### 证据

- retrospective Red：修复前`c978915`第二代`settings.certificates.mitm-toggle`为`false`，而证书身份/有效期/信任、journal original与最终清理均已通过。
- 当前Green：`1/1`通过；第一代Main/Core PID `44740/25312`为`abruptDestroyVerified=true`，第二代`24740/33656`为`gracefulDestroyVerified=true`。
- Green脱敏证据中证书同一性、有效期、系统信任、MITM意图、insecure host、passthrough host、original恢复、journal清理与测试CA删除全部为`true`；结束后8888、Interceptor进程与本轮CA均为0，原系统代理与网络恢复。

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
