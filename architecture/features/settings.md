# Feature: Settings

> 最后更新：2026-09-03
> Main 模块：`apps/desktop/src/main/certificates/`、`system-proxy/`、`updates/`
> Core 模块：`apps/proxy-core/src/proxy-core/capture/entry.ts`
> Renderer 模块：`apps/desktop/src/renderer/features/settings/`

## 1. 职责与边界

Settings 聚合所有需要**操作系统权限**或**跨会话持久化**的配置。

| 子域 | 归属进程 | 内容 |
| --- | --- | --- |
| 证书与 MITM | Main | CA 生成、信任库安装、解密开关、不安全例外 |
| 系统代理 | Main | 接管、恢复、紧急修复、ownership 展示 |
| 更新 | Main | 检查、changelog、手动下载、打开安装器 |
| 存储 | Core | 用量状态、清理 |
| 语言、主题与导出隐私 | Main + Renderer | Main管理设置请求；Renderer应用15种语言、4套主题和3项默认值并保存到localStorage |
| Agent | Main + Renderer | Provider/Credential、持久化Chat、Streaming、Usage、恢复与24项Tool capability双列配置均已实现 |

**核心边界：所有 OS 级操作只在 Main。** Core 不读写系统设置，Renderer 只表达意图。

Settings rail 的最后访问 section 由 App shell 持有。切换到 Capture / Rules / Composer / Diagnostics
不会重置该值，返回 Settings 时仍打开离开前的 section；TLS compatibility、Proxy readiness 等明确的
跨 feature 跳转可以覆盖它，直接打开对应目标 section。面板内未提交的瞬态 dialog 不跨 feature 保留。

Settings rail 的每项都是原生 button，当前项必须通过 `aria-current="page"` 暴露，不以 CSS class 或翻译文案作为状态契约。
真实 Electron `settings.navigation` 从 Certificates 默认态开始，逐项操作九个 section，并用键盘 Enter 激活 Agent；在离开 Settings
后通过普通 workspace 导航返回，证明最后 section 未被 remount 重置。显式 TLS 跳转的覆盖语义由
`capture.navigate-tls-passthrough` 独立验证；两条 workflow 都必须保留 trace、语言无关 DOM 状态、
Main/Core PID、8888 释放与 `gracefulDestroyVerified=true` 证据。

当前 `settings.navigation` 已取得 `aria-current` 与 Agent 原生 button 语义缺失的 Red，再取得真实 Electron Green：九个 section 的
`aria-current` 唯一，App Containers 经 Capture 往返保持，TLS passthrough 经 Rules、Composer、
Diagnostics 往返保持；显式 TLS 跳转继续由 `capture.navigate-tls-passthrough` 验收。Proxy readiness
入口与 TLS 入口一样在 App shell 先覆盖目标 section 再切换 workspace，不为测试注入 readiness 状态。

Capture 的 TLS tunnel Inspector 允许从已确认的`TLS passthrough`连接跳到当前配置项。跳转前读取
TLS passthrough settings，并从当前host的所有覆盖项中选择最具体pattern：exact优先，其次选择suffix
最长的leading wildcard；没有覆盖项时不伪造目标。App一次性切到Settings / TLS passthrough并携带该
pattern，列表加载后将目标滚入可见区域，以accent背景和边框高亮3秒；重复跳转重新计时。高亮只是
Renderer瞬态导航反馈，不写workspace、不进入URL，也不由Main/Core持有。

### 1.1 语言、主题与导出隐私Tool

- `settings_set_language`接受`{ language }`，只允许既有15个语言ID；`settings_set_theme`接受`{ theme }`，只允许`warm/light/ember/dark`。
    - 不增加`auto/system`等模式，不改变首次启动的系统语言匹配、默认主题或现有`localStorage`键。
    - UI与Tool共用明确的Main方法，不在Tool里执行JavaScript、写Renderer Store或直接访问存储。
- `settings_set_export_privacy_defaults`要求显式提供`maskAuthorization`、`maskCookies`、`warnBeforeUnmasked`三个boolean。
    - 只改变后续导出的默认值，不修改已经打开的导出草稿、运行中的任务或既有文件；Archive仍保留完整原生存档。
    - UI单项Switch继续只改变自己的字段，连续操作不能因异步确认丢掉另一个字段。
- Main通过有类型的Preload请求关联一次设置操作，Renderer常驻订阅应用并确认；界面导航不决定是否接收变更。
    - Main处理参数校验、取消、Renderer退出及完成通知；结果只含已应用设置，不含存储路径、请求内部ID或任意错误内容。
    - `UiPreferencesService`登记请求；`UiPreferencesActions`常驻订阅，串行领取并应用，成功写入原localStorage后确认，Main再广播给其他Renderer。
    - 不新建配置文件、双写副本或迁移路径。App只把语言/主题映射到DOM，不再晚于确认重复写存储；持久化失败返回安全失败响应。
    - Deny与预取消无写入；未开始的请求被取消后不能迟到应用。已开始提交的设置完成原操作，不用取消回滚用户状态。
- 三项均为独立Settings change，Agent/MCP各自授权并遵守Ask/Auto。
    - 先取得executor和真实Electron缺失Tool Red；新增Main生命周期与Renderer应用逻辑先由产品测试锁定目标行为。
    - 语言变更在专属`settings.tools.language`验证；主题与隐私在`settings.tools.preferences`验证，其他workflow不为定位控件切换语言。
    - 最终验收覆盖UI原入口、当前已挂载界面、取消/失败、双列撤权、重启持久化和零重放；设置操作不修改系统代理或证书配置。

<a id="ui-preferences-acceptance"></a>
### 1.2 偏好Tool验收（2026-09-07）

- 前置结果：executor21项缺失Tool Red，日志为TEMP下`interceptor-settings-preferences-executor-red-20260907.log`。
    - 真实语言/偏好两条workflow在`5e4fbc31`构建上discovery Red，证据`interceptor-settings-preferences-e2e-red-20260907-203104`；Main/Core `6352/27056`、`37204/20232`均正常退出并恢复宿主。
    - Main测试先于Service创建；首次因模块不存在没有执行任何用例，不能把该日志当作29项行为Red。实现后生命周期29/29。
    - Renderer原Privacy入口未调用Main而Red；新增Actions测试初始模块缺失。摘要3项Red后53/53；保存确认另5项Red后Renderer应用10/10，与Privacy2项和Main合计41/41。
    - 对应日志为`interceptor-ui-preferences-owner-red-20260907.log`、`interceptor-ui-preferences-renderer-red-20260907.log`、`interceptor-settings-preferences-summary-red-20260907.log`、`interceptor-preferences-persistence-red-20260907.log`。
- 五条关联真实流程5/5（2.0分钟），证据`interceptor-preferences-related-green-20260907-210510`。
    - 包含语言、主题/隐私、Settings双列授权、MCP Browser与MCP Desktop；十代Main/Core全部`gracefulDestroyVerified=true`。
    - Settings授权三代为`12772/4696`、`9308/30292`、`4360/23364`；MCP Browser为`43212/27372`；MCP Desktop为`6540/44540`、`13236/24084`。
    - 偏好两代为`8228/36200`、`16740/12028`；语言为`6020/44436`、`41780/16864`。Main/Core/Worker退出、8888释放、完整WinINet/journal恢复。
- 保存确认修正后两条目标流程再跑2/2（52.3秒），最终证据`interceptor-preferences-persistence-green-20260907-211527`。
    - 偏好Main/Core `20840/34860`、`25464/28872`；语言`38236/34080`、`42568/18792`，四代正常销毁及宿主恢复通过。
    - 原Sidebar/Privacy UI、Agent/MCP Ask Deny/Allow/Auto、已挂载界面、连续单字段修改、HAR已开草稿遮罩不变/下次读取新默认值、撤权、重启持久化与Model零重放通过。
    - 语言只在专属流程中改变；两条流程都通过原UI恢复初始偏好。`preferences.json`只保存公开Tool名称和布尔结论。
- 全workspace typecheck、Desktop707/707、Tools347/347、MCP32/32通过。
    - 偏好明暗12视图72 targets、共用TLS fixture16视图96 targets、Settings目录6视图76 targets合计244/244，0 missing/flagged，最大0.6px。
    - 报告位于TEMP，前缀`interceptor-preferences-final-parity-20260907-211811`、`interceptor-preferences-settings-parity-20260907-212106`；保留旧全量parity报告，不扩充设计工具测试。
    - 三项设置生成12张审批/完成设计图；Settings筛选目录2张有实际变化，其余重新生成图保持不变。
- Windows package、artifact audit（1,294 files / 392,925,601 bytes）、packaged smoke1/1（41.5秒）通过。
    - 日志`interceptor-preferences-package-20260907.log`、`interceptor-preferences-artifact-audit-20260907.log`；smoke证据`interceptor-preferences-smoke-20260907-211651`。
    - 新增7个窄Preload API均列入安全白名单；设置请求/确认不注册为业务Tool，只有三项明确设置命令对外。
    - 依赖及锁文件未变，复用`interceptor-har-delivery-production-audit-20260907.json`零漏洞结果，不声称本轮重新查询。
- 本组后代码58/73、完整自动验收54/73；Settings代码15/26、完整11/26，registry/recipe58项、116个开关，Developer人工结论0/58。
    - TLS清理、证书/AppContainer特权步骤、Updates和macOS独立原生验收仍未完成，不由上述结果替代。

## 2. 证书与 HTTPS MITM

### 2.1 三对密钥

| 密钥对 | 持有者 | 用途 |
| --- | --- | --- |
| CA 密钥对 | 本应用生成 | 私钥签发 leaf，公钥装信任库验签 |
| leaf 密钥对 | Mockttp 按 host 现造并缓存 | 与客户端的会话 |
| 源站真实密钥对 | 真实网站 | 代理与源站的会话 |

**CA 私钥经 `safeStorage`（DPAPI/Keychain）加密存盘，只在 Main 与 Core 内存中流转，绝不进 Renderer、日志或导出。**

### 2.2 握手时序

```mermaid
sequenceDiagram
    autonumber
    participant C as 客户端
    participant TS as 系统信任库
    participant P as 代理 · 持 CA 私钥
    participant O as 源站

    Note over P,TS: 一次性准备
    Note over P: 生成 CA 密钥对，私钥加密存盘
    P->>TS: 安装 CA 证书到受信任根

    Note over C,O: 每次 HTTPS 请求
    C->>P: CONNECT host:443
    Note over P: 现造 leaf 密钥对<br/>用 CA 私钥签发 host 证书
    P-->>C: 出示 leaf 证书
    C->>TS: 读取 CA 公钥
    Note over C: 验签通过，域名匹配
    C->>P: 协商会话密钥
    Note over C,P: 会话密钥①

    P->>O: 代理作为客户端另开 TLS
    O-->>P: 出示真实证书
    Note over P: 用系统公共 CA 验证
    Note over P,O: 会话密钥②

    C->>P: 请求，密钥①加密
    Note over P: 解密为明文，可抓包改包
    P->>O: 密钥②重新加密转发
    O-->>P: 响应，密钥②加密
    P-->>C: 密钥①重新加密回发
```

> 密钥交换细节：TLS 1.2 + RSA 时客户端用 leaf 公钥加密预主密钥、代理用 leaf 私钥解密；TLS 1.3 / ECDHE 时会话密钥由临时 DH 生成（前向保密），leaf 私钥只用来签握手、客户端用 leaf 公钥验签。**两种情况下客户端信任 leaf 都取决于用信任库里的 CA 公钥验签成功。**

### 2.3 启用流程

```mermaid
sequenceDiagram
    autonumber
    participant UI as Renderer
    participant Main as DesktopApplication
    participant Cert as CertificateService
    participant Trust as TrustStoreService
    participant Runtime as CoreRuntime
    participant Proxy as ProxyService

    Note over UI: 用户在 Tunnel 面板点击 HTTPS Setup
    UI->>Main: generateCertificate
    Main->>Cert: generate()
    Note over Cert: 懒加载 @peculiar/x509<br/>避免阻塞 Main 启动
    Cert->>Cert: RSA 2048 / SHA-256 Root CA
    Cert->>Cert: safeStorage 加密私钥

    UI->>Main: installCertificate
    Main->>Trust: install()
    Note over Trust: sudo-prompt 提权<br/>Windows certutil -addstore Root<br/>macOS security add-trusted-cert
    Trust-->>Main: 结果

    UI->>Main: setHttpsDecryption(true)
    Main->>Main: 检查 isTrusted 且 mitmEnabled
    Main->>Runtime: tls.useCertificate（下发 CA 材料）
    Runtime->>Proxy: useCertificate(ca)
    Main->>Runtime: tls.startDecryption
    Runtime->>Proxy: startHttpsDecryption()
    Note over Proxy: listener 仍挂旧证书才原端口重建<br/>getLocal({ https, http2: true })
```

**证书与解密开关正交**：`tls.useCertificate` 只记录当前可用的 CA 材料，`tls.startDecryption` /
`tls.stopDecryption` 只切换是否 MITM。停止解密时全部 host 退回隧道、证书永不出示，因此
卸载信任或删除 CA 都不必立刻换 listener。Main 侧只有 CA 已安装信任**且** `mitmEnabled` 开启时
才发 `tls.startDecryption`，否则发 `tls.stopDecryption`。

Main 启动时先从 Core 读回 `tls.getDecryptionPreference`，再按「CA 已信任 且 用户开启」决定是否真的
解密。持久化的是**用户意图**，不是运行态：`tls.saveDecryptionPreference` 只在用户拨开关时写，
CA 不可用而发出的 `tls.stopDecryption` 不会擦掉它。

**信任库是 local-machine 而非 current-user**，因此本机全部用户与进程（含浏览器）统一信任。`TrustStoreService` 用 `@vscode/sudo-prompt` 提权执行安装/卸载，检测则不需提权：

| 操作 | Windows | macOS |
| --- | --- | --- |
| 安装 | `certutil -addstore -f Root`（去掉 `-user`） | `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain` |
| 检测 | `certutil -verifystore Root <sha1>` | `security find-certificate` |

按 SHA-1 thumbprint 精确定位；`execFile` 不经 shell。注入 `ElevatedRunner`（默认 `sudoPromptRunner`）+ `CommandRunner` 便于 mock 单测。

### 2.4 窄 API

`getCertificateStatus`、`generateCertificate`、`installCertificate`、`uninstallCertificate`、`deleteCertificate`、`revealCertificate`、`viewCertificate`、`openCertificateManager`、`getInsecureHosts`、`setInsecureHosts`、`setHttpsDecryption`。

Main 组装的 `CertificateInfo` 含 `path` 与 `mitmEnabled`，**私钥不出 Main**。

## 3. 系统代理

### 3.1 参与者、快照与不变量

| 参与者 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| Renderer | 通过窄 Desktop API 请求 Enable、Restore 和只读 Status | 不访问 WinINet、SystemConfiguration 或 journal |
| `DesktopApplication`（Main） | 产品内唯一的系统代理流程编排者；决定何时恢复、何时退出，并同步 Core upstream 与 Renderer 状态 | 不把代理快照写入日志或发给 Renderer |
| `SystemProxyOperationQueue`（Main 内存） | 按调用先后顺序执行启动恢复、Enable、Restore、Core 故障恢复与退出恢复 | 不保存 PID，不写磁盘，不是跨进程锁 |
| 平台 `SystemProxyService` | 读取 `current`、比较完整快照、调用 native helper 写入并回读验证 | 不管理 Core 生命周期或 Renderer |
| Proxy Core UtilityProcess | 监听 `127.0.0.1:8888`，接收 Main 下发的 upstream 并转发流量 | 不读取或修改系统代理，不读 journal |
| crash journal | 保存崩溃恢复需要的 `version/original/owned` | 不保存 owner、PID、启动时间、instance ID 或阶段状态 |
| 操作系统 | 保存当前实际生效的代理配置 `current` | 不知道哪个 App “拥有”代理 |

三个比较值的含义：

| 值 | 产生时间 | 内容 |
| --- | --- | --- |
| `original` | Interceptor 接管前 | Windows 为 flags、Proxy Server、Bypass、PAC、Auto Detect 等完整 WinINet 快照；macOS 为全部活动 network service 的完整代理字典 |
| `owned` | 写系统代理前 | 根据 `original` 计算出的 Interceptor loopback 配置，目标为当前 Core listener |
| `current` | 每次恢复判定时 | Main 通过平台 helper 当场读取的操作系统实际配置 |

文档中的 `current == owned`、`current == original` 都表示完整快照逐字段相等，不表示 PID、进程或文件的所有权。

Windows journal 固定为 `%LOCALAPPDATA%/Interceptor/system-proxy/journal.json`，不随 Electron
`userData`、开发模式、packaged App 或 E2E `--user-data-dir` 改变；macOS journal 位于当前
`userData/system-proxy/journal.json`。两平台都先把临时文件完整写入并同步，再原子 rename。
产品前提是同一时间只运行一个 Interceptor App，不处理两个 App 的竞争。

### 3.2 生命周期流程

#### 正常启动与崩溃重启

```mermaid
sequenceDiagram
     autonumber
     participant UI as Renderer
     participant Main as DesktopApplication
     participant Queue as SystemProxyOperationQueue
     participant Svc as SystemProxyService
     participant Journal as crash journal
     participant OS as 操作系统代理
     participant Core as Proxy Core

     Note over Main: App A 正常冷启动
     Main->>Queue: recoverAfterCrash
     Queue->>Svc: 启动恢复
     Svc->>OS: 读取 current
     Svc->>Journal: 读取
     Note over Svc,OS: 无 journal 时返回未接管，零系统代理写入
     Main->>Core: 启动8888 listener
     UI->>Main: Capture bootstrap 请求 Enable
     Main->>Queue: 排入 Enable
     Queue->>Core: 确认 listener host/port
     Queue->>Svc: enable(host, port)
     Svc->>OS: 读取完整 original
     Svc->>Journal: 原子保存 version/original/owned
     Svc->>OS: 写入 owned 并回读验证
     Svc-->>Main: owned status + detected upstream
     Main->>Core: 下发 original 推导出的 upstream

     Note over Main,Core: App A 异常终止；OS 与 journal 仍保留 owned/original
     Note over Main: App A 完全退出后顺序启动 App B
     Main->>Queue: recoverAfterCrash
     Queue->>Svc: 启动恢复
     Svc->>OS: 读取 current
     Svc->>Journal: 读取首次 original/owned
     Note over Svc,OS: current == owned，只加载快照与 upstream，零系统代理写入
     Main->>Core: 启动新8888 listener并重新下发 upstream
     Note over UI: status 已为 owned，不把8888重记为 original
```

#### 正常退出与启动失败

```mermaid
sequenceDiagram
     autonumber
     participant Electron
     participant Main as DesktopApplication
     participant Gate as ApplicationActionGate
     participant Queue as SystemProxyOperationQueue
     participant Svc as SystemProxyService
     participant Services as Agent/MCP/Core等服务

     alt 正常退出
          Electron->>Main: before-quit
          Main->>Main: quitting = true，阻止直接退出
          Main->>Gate: 拒绝新IPC并排空已接受命令
          Main->>Queue: 排入最终 Restore
          Queue->>Svc: 按判定表恢复
          alt 恢复成功或无需写入
                Main->>Services: 逐项停止
                Main->>Electron: app.quit
          else 写入或回读验证失败
                Svc-->>Main: 抛错并保留 journal
                Main->>Gate: 恢复命令与 Agent，取消退出并报错
          end
     else onReady 启动中途失败
          Main->>Main: quitting = true
          Main->>Queue: 把 Restore 作为第一项清理任务
          Queue->>Svc: 按判定表恢复
          Note over Main,Svc: 恢复失败时保留 journal 并警告，但 App 已无法继续
          Main->>Services: 无论单项清理是否失败都继续停止其余服务
          Main->>Electron: app.quit
     end
```

正常退出可以在代理恢复失败后继续运行，因此取消退出且不先停止 Core；启动失败表示 App 已经无法继续，
所以即使代理恢复失败也会保留 journal、警告用户并继续销毁其余服务。这是两条流程最重要的差异。

Core 从 `running` 进入 `unresponsive/restarting` 时，Main 只把一个自动 Restore 排入同一队列；重复状态通知
不会重复排队。用户 Enable/Restore、启动恢复、Core 故障恢复和退出恢复严格 FIFO，前一项结束后下一项才读取
新的 `current`。单项失败不堵塞后续；`quitting=true` 后不再接受新的 Core 故障恢复。该队列只解决单 Main
进程内事件交错，不提供多 App 互斥。

所有启动恢复、用户 Restore、Core 故障恢复和退出恢复最终使用同一判定表：

| 当场比较结果 | 启动 `recoverAfterCrash()` | Restore、Core 故障或退出 |
| --- | --- | --- |
| 无 journal | 返回未接管，零系统代理写入 | 若内存也无快照则返回未接管，零系统代理写入 |
| `current == owned` | 加载 `original/owned`，保留 journal，零系统代理写入 | 写回 `original`，回读验证成功后删除 journal |
| `current == original` | 只删除已完成使命的 journal | 只删除 journal，不重复写 `original` |
| `current` 与两者都不同 | 视为用户或外部程序已修改；零系统代理写入并删除失效 journal | 同样零系统代理写入并删除失效 journal，报告 `externally-modified` |
| helper 写入或回读验证失败 | 抛错；不把恢复当作成功 | 抛错并保留 journal；正常退出因此取消，启动失败清理则继续退出 |

#### 当前验证边界

| 流程 | 当前证据 | 结论 |
| --- | --- | --- |
| Windows 首次接管、App A 强杀、App B 跨 profile 加载 `current == owned`、B 正常退出恢复首次 `original` | 真实 Electron `settings.system-proxy.crash-recovery` | 已取得 Red/Green 与完整销毁证据 |
| Windows journal 恢复后的 CA、MITM、TLS 用户配置跨进程保持 | 真实 Electron `settings.proxy-mitm.persistence` | 已取得 Green 与完整销毁证据 |
| `current == original`、外部修改零写入、恢复失败保留 journal | Windows/macOS Service unit 与 journal integration | owning边界已完成；外部程序改写不是产品用户flow，不用测试脚本改WinINet冒充E2E |
| 启动失败先恢复代理再清理其他服务 | `application-shutdown` unit | 属无法由正常用户路径稳定制造的故障分支，不用故障注入冒充 E2E |
| Promise 队列严格串行且前序失败不阻塞后续 | `operation-queue` unit + 真实Electron `application.lifecycle.core-restart` | 队列unit Green；Core故障后的重新接管及第二次故障与Close竞争Green |
| Core 异常退出后的自动 Restore 与新 Core 生命周期 | 真实Electron `application.lifecycle.core-restart` | Retrospective Red与当前Green、真实请求、两代PID及完整销毁证据已取得 |
| macOS 三态 journal 与多 network service 恢复 | macOS Service unit、journal integration；Windows package 不执行 Swift helper | 待真实 macOS Electron、Authorization 与系统副作用证据 |

Windows系统代理崩溃恢复已完成：跨profile App crash/relaunch、Core-only crash/restart、第二次Core故障与正常退出竞争均有真实Electron证据；不可由正常产品路径制造的边界保留在owning unit/integration。macOS实机验收独立跟踪。

**窄 Desktop API**：`getSystemProxyStatus`、`enableSystemProxy`、`restoreSystemProxy`。Main 日志不包含 snapshot。

### 3.3 平台实现

| 平台 | 机制 |
| --- | --- |
| Windows | `windows/helper.cs`，当前用户 WinINet per-connection API，读写 flags/Proxy Server/Bypass/PAC URL/Auto Detect，广播 settings changed |
| macOS | `macos/helper.swift`，Authorization Services + SystemConfiguration，枚举当前 Network Set 全部活动 service，单 session 内 set/commit/apply |

只允许 loopback listener。

### 3.4 上游代理链式转发 [已实现，仅 Windows]

接管系统代理后所有流量都进 Interceptor，若仍直连源站，必须经公司 PAC、VPN 或认证代理才能出网的环境会在接管期间**完全断网**。因此接管前读到的配置会原样接到上游。

```mermaid
sequenceDiagram
    autonumber
    participant UI as Settings
    participant Main as DesktopApplication
    participant Svc as WindowsSystemProxyService
    participant Core as ProxyService
    participant Up as 上游代理

    UI->>Main: systemProxy:enable
    Main->>Svc: enable(host, port)
    Svc->>Svc: 读取 original，toUpstreamProxyConfig(original, self)
    Svc-->>Main: status
    Main->>Core: proxy.setUpstream { upstream }
    Note over Core: 存进 ProxyService，不重启监听器

    Core->>Up: CONNECT origin:port
    Up-->>Core: 200 Connection Established
```

转换规则（`windows/system-proxy-upstream.ts`，纯函数 + 14 项单测）：

| 原配置 | 上游 `proxyUrl` |
| --- | --- |
| PAC 脚本（`PROXY_TYPE_AUTO_PROXY_URL` + `pacUrl`） | `pac+<pacUrl>`，PAC 求值交给 Mockttp 内置的 `pac-proxy-agent` |
| 显式代理 `host:port` | `http://host:port` |
| 分方案列表 `http=a;https=b` | 取 https，缺失回退 http |
| 仅 `socks=host:port` | `socks5://host:port` |
| 仅 Auto Detect（WPAD） | 无（没有可传给 proxy-agent 的 URL），按直连处理 |

`bypassList` 转成 curl 风格 `noProxy`；Windows 专有的 `<local>` 展开为 `localhost` / `127.0.0.1`。**不能展开出裸 `::1`**：`matchesNoProxy` 按 `host:port` 切分候选项，裸 IPv6 会被切成空 host，而空 host 匹配一切，结果是每个请求都判定为 bypass，上游形同虚设。

`toUpstreamAuthority(upstream)` 从同一份配置里取出 `host:port`（丢弃凭据）供状态栏展示。

#### 三条出网路径都必须接上游

上游不是一个开关，而是三条彼此独立的代码路径，漏掉任何一条，对应流量就会绕过公司代理直连：

| 流量 | 出网点 | 接上游的方式 |
| --- | --- | --- |
| MITM 已解密的 HTTP/HTTPS | Mockttp 规则 | `thenPassThrough({ proxyConfig })` |
| MITM 未解密的 TLS 直通（`tlsInterceptOnly` 未命中） | Mockttp `passthroughSocket` | `passthroughProxyConfig`，见下 |
| WebSocket 转发 | `websocket-bridge.ts` 的 `ws` 客户端 | `HttpsProxyAgent`，命中 `matchesNoProxy` 时不注入 |

Mockttp 的 `passthroughSocket` 把 `net.connect(port, host)` 写死，`proxyConfig` 完全不参与，因此**只要关闭 MITM，全部 HTTPS 都绕过上游**。`patches/mockttp+4.5.0.patch` 为它补一条 `passthroughProxyConfig` 路径：用 proxy-agent 家族建立 CONNECT 隧道，再把客户端连接与隧道对接。改动是纯增量的——`passthroughSocket` 自身保持同步、原有直连分支一行未动，只有配置了上游才转入新的异步分支。PAC 上游需要一个请求桩才能选出正确的 agent，桩的 `upgrade` 头固定为 `websocket`，`PacProxyAgent` 才会选隧道模式而不是明文转发。

#### bypass 要双向维护

- **读**：接管前的 `bypassList` 转成 `noProxy` 下发 Core，命中则直连不进上游。
- **写**：接管时写回系统的 bypass 必须并入 `localhost` / `127.*` / `[::1]` / `<local>`（`withRequiredBypass`），否则本机与内网流量被推进代理。`<local>` 不匹配 IP 字面量，所以三条都要显式列出；`::1` 必须带方括号，裸写会让 `InternetSetPerConnectionOption` 整体写入失败。
- **AVD / Dev Box**：Windows owned bypass 不注入产品域名。拒绝 MITM 的 gateway 应由 Core per-host TLS passthrough 处理，使流量仍经过 Capture 并保留 tunnel metadata；默认 passthrough 列表为空。

#### 上游不可达时自动降级

上游代理进程退出（用户关掉 Clash 之类）后，Interceptor 仍指着一个死端口，全部流量立刻失败。`UpstreamProbe` 在接管期间每 `UPSTREAM_PROBE_INTERVAL_MS`（1s）对上游 `host:port` 做一次 `UPSTREAM_PROBE_TIMEOUT_MS`（500ms）的 TCP 连接：

- 探到不可达：清空 Core 的上游改为直连，Capture 状态栏的 `upstream host:port` 转黄并给出提示。
- 探到恢复：重新下发上游，状态栏复原。

只在状态翻转时才下发与广播，稳态下单次探测约 90µs。PAC 上游没有单一 `host:port` 可探，不纳入监控。状态经 `system-proxy:status-changed` 主动推给 Renderer（`SystemProxyStatus.upstreamProxy` / `upstreamReachable`），状态栏据此显示 `upstream host:port` 或 `direct`。

三个边界条件：

- **绝不把自己当上游**。崩溃残留会让系统代理仍指向 `127.0.0.1:8888`，此时接管前读到的"原有配置"就是我们自己，直接视为无上游，否则形成无限自环。
- **`proxyConfig` 用回调而非固定值**。Mockttp 每次请求求值，因此切换上游不需要重注册规则或重启监听器。
- **Core 重启后必须重新下发**。上游保存在 Core 进程内，`onCoreProcessReady` 与 TLS 材料一同重新下发，否则重启即断网。

Clash 等本机代理应在 Interceptor 接管前启动并启用系统代理，Interceptor 才能把它的 loopback 地址读作上游。若 Clash 在 Interceptor 已 owned 后启动并主动改写 WinINet，guarded ownership 会按外部修改处理并进入 ownership lost；两边不会反复抢写系统设置。

实测（`proxy/tests/integration/upstream.test.ts` / `proxy/tests/integration/websocket-upstream.test.ts`，真实上游代理 + 真实源站）：无上游时直连、配置后经上游 CONNECT 隧道、切换即时生效、`noProxy` 命中时绕过上游、MITM 关闭时直通流量仍走上游隧道、上游不可达时仍正常关闭隧道记录、WebSocket 经上游握手。Mockttp 经上游时统一用 CONNECT 隧道，即使目标是明文 HTTP。

2026-09-09补充现有HTTP Basic能力的本地集成覆盖，未修改产品行为：

- HTTP、HTTPS passthrough、HTTPS MITM和WebSocketBridge均通过带userinfo的`proxyUrl`向上游CONNECT发送Basic认证，包含密码中的URL转义字符。
- HTTP和WebSocket在缺失或错误凭据时被上游拒绝，源站未收到请求，没有直连回退；`noProxy`命中时仍直连且不携带上游认证头。
- 成功认证的源站请求与Capture记录未包含上游凭据；没有连接公司网络、修改WinINet或安装系统证书。
- 两份既有集成测试共22/22 Green（新增10例），Core typecheck通过；这是Node loopback网络验证，真实Electron E2E和浏览器运行均为0，不代表SSO或用户凭据配置流程已验证。
- TEMP证据：`interceptor-upstream-basic-local-green-20260909-230438.zip`，SHA256 `61E4AC2244F12FB0ACC50555F9BB78198C160E53EE2E9CB78AAC8AA6FFC29F9E`；包含三份运行日志、类型结果与四份源码hash。

### 3.5 Windows AppContainer 与 TLS passthrough [已实现，待真实 Windows App 验收]

Windows owned `ProxyOverride` 不再加入 `*.wvd.microsoft.com`，避免 RDP gateway 完全跳过
Interceptor。拒绝 MITM 的 host 改由 Mockttp TLS passthrough 建立原始 tunnel。

Windows App 实测存在两个独立边界：

1. `Microsoft.AAD.BrokerPlugin` 无 loopback exemption 时，WAM token/authorize 请求在 Windows
    网络隔离层失败，无法稳定到达 8888；仅靠 Mockttp host 名单无效。
2. WVD gateway 进入 MITM 后客户端主动 reset；应在 Mockttp 内走原始 TLS tunnel，而不是长期留在
    system `ProxyOverride`。

产品流程是：Settings 通过官方 Network Isolation API 枚举 AppContainer 与 SID，让用户显式开启
loopback exemption；Core 通过 Mockttp `tlsPassthrough` 管理持久化 host patterns；TLS 错误按 TLS
generation + host 去重并广播。App 壳按规范化 host 累积事件，无论当前工作区都显示一个可滚动列表
dialog。dialog 为每个 host 列出多层级候选（精确 host + 逐级父域 wildcard，最宽只到二级域，
不提供 `*.com` 这种一次放掉整个后缀的选项），精确 host 默认勾选、wildcard 默认不选；
哪一级安全取决于站点，产品不替用户判断，只把候选摆出来。主按钮以一次 revision replace 批量
保存未被现有 wildcard 覆盖的 pattern，并导航到
TLS Settings。Store 同时推进 settings change sequence，使已经挂载的 TLS 面板立即重读，旧请求晚返回
也不能覆盖新名单。默认列表为空，WVD badge 只是建议，不会自动保存。
三者的完整证据、技术方案、文件级改动和收益/代价见
[backlog/research.md](../backlog/research.md) § 3.3。`design-vite` 已提供两组独立 Settings 页面、
AppContainer 搜索/刷新/单项开关与 UAC 确认、TLS host pattern 管理、全局兼容性 dialog、invalid / empty 状态，
产品代码与 light / dark visual parity 场景均已实现。Mockttp patch 让 `tlsPassthrough` 接受 getter，
名单每连接求值，因此**保存即对新连接生效**，既不重建共享 listener也不需要重启；在途连接不受
影响。增加后删除、删除后加回、顺序或大小写变化同样不需要任何额外动作。真实 Windows App 登录与 RDP 行为仍需
人工验收。

AppContainer 面板同时提供单项开关、`Enable all` 与对称的 `Disable all`。两个批量命令各自先显示
目标数量、系统范围和后果明确的确认 dialog，再分别发送一条 `enableAllAppContainers()` 或
`disableAllAppContainers()` Preload 意图；Main 每次只启动一次提权 helper。Enable all 将当前枚举的全部
AppContainer SID 与已有 exemption 并集，Disable all 只从已有 exemption 中移除当前枚举 SID；两者都保留
当前枚举之外的既有 exemption，并在一次写回后读回校验。Renderer 不循环调用单项命令，避免多次 UAC 和
中途只成功一部分的状态，也不允许批量启用成为不可逆操作。

真实验收先保存初始完整集合，再执行 Enable→check→Disable→check，最后只通过正式单项 UI恢复初始
enabled SID，并要求最终集合 hash 精确相同。当前证据为 `1→138→0→1`，恢复前后 hash 相同。工具栏两个
批量按钮是不可压缩单行命令；真实 E2E 同时验证 `white-space: nowrap`、28px 盒高与内容无溢出。

AppContainer 列表保持 Main 按名称提供的原始相对顺序，只在 Renderer 做一层稳定分组：所有
`exempt=true` 项置于 `exempt=false` 项之前，同组内不重排。搜索在该稳定分组之后执行，因此过滤结果必须是
完整列表的有序子序列，清空搜索后恢复同一顺序。`settings.app-containers.ordering` 使用真实 Windows helper
只读枚举，通过公共 SID 行 automation ID 与 `data-exempt` 状态验证 DOM 顺序；它不切换 exemption、不触发 UAC，
并必须保留过滤前后 JSON、Main/Core PID、8888 释放与 `gracefulDestroyVerified=true` 证据。

真实 Windows 验收发现 `NetworkIsolationEnumAppContainers` 会为不同用户返回同一 AppContainer SID 的多条
记录；公开 package identity 相同，但 `userSid`、working directory 或 binaries 不同。exemption 命令和 UI
身份都只以 AppContainer SID 为目标，因此 native helper 在枚举边界按 SID 保留一个稳定代表；Main 仍拒绝
任何重复 SID，防止 helper 回归。当前 package helper 为 `138/138` 唯一 SID，真实 Renderer 为
`1 enabled / 137 disabled`，搜索缩小和清空恢复均保持排序；整个只读 flow 不修改 exemption。

现场复核（2026-08-07）：Workspace revision 8 已持久化 4 个 host，Core `tls.reconfigured` 在重启后
记录 `passthroughHosts: 4`，证明保存与应用均成功。重启后不再出现 `www.wvd.microsoft.com` TLS 错误；
后续只有 `aadcdn.msauth.net` / `fonts.gstatic.com` 的低置信 reset，因此“登录成功但 gateway 仍报错”
不能继续归因于这 4 项未生效，需要按新 dialog 收集下一批实际失败 host 或排查非 TLS 层。

### 3.6 已知兼容风险

macOS 尚未接入上游检测：快照按网络服务分开存，多服务（Wi-Fi / 以太网 / VPN）可能各自配不同代理，需先定义合并语义。

覆盖范围限制：Windows 只接管 WinINet，自带网络栈、WinHTTP、Java、curl、容器、WSL 可能不走 Capture。`<local>` bypass 会让 localhost 绕过。

HTTP Basic的`Proxy-Authorization`已按§3.4通过本地集成验证；公司SSO、真实认证环境与用户凭据配置流程仍未验证。`proxyUrl`支持`http://user:pass@host:port`形式，但WinINet不保存凭据，产品凭据入口及安全保存方式仍待设计，不能把Core支持userinfo视为该流程已实现。

### 3.7 Proxy 与 MITM 跨进程恢复契约

系统代理 ownership 与 TLS 用户配置使用两种不同的恢复语义：

- Windows 系统代理 journal 在异常退出后保留首次 `original/owned`。产品只支持同一时间一个 App；下次 Main 在创建 Renderer 和 Core 前比较 `current`，等于 `owned` 时直接加载快照，等于 `original` 时清 journal，其他值保持零 WinINet 写入并清除失效 journal。正常退出时精确恢复首次 `original`。
- TLS passthrough、源站证书例外与 HTTPS 解密开关是跨会话用户配置。新 Core 从 `workspace.sqlite` 读回配置；Main 在 Core ready 后读回解密意图，并按「CA 仍受信任且用户开启」重新下发 CA 与解密状态。

真实 Electron 验收顺序运行两次 App 生命周期。第一代由正常 bootstrap 接管系统代理，再只能通过 Settings UI 生成并安装 CA、开启 MITM、添加 TLS passthrough 与源站例外，随后由测试环境异常终止。第二代启动必须在创建 Renderer/Core 前消费共享 journal，并在不改写 WinINet 的情况下加载同一 `original/owned`，最终 UI 仍是 Recording/owned。流程结束前必须通过 UI 删除测试配置、关闭 MITM、卸载并删除 CA，再验证两代 Main/Core 全退、8888 释放且系统代理等于首次 `original`。测试只在内存比较 OS 与 journal 快照，不把原始 proxy server、bypass 或 PAC 写入 trace、日志或附件，也不打开会渲染这些字段的 Proxy 面板。实际MITM数据面归`capture.protocols.with-mitm`验收，不由本workflow代替。

## 4. 更新

Updates仅保留现有产品UI和Main更新流程，不注册为Agent/MCP Tool，也不列入Tool开发计划。

```mermaid
sequenceDiagram
    autonumber
    participant UI as Renderer
    participant Auth as GitHubAuthService
    participant Main as GitHubReleaseUpdateService
    participant GH as GitHub API
    participant Shell as 系统

    Note over Auth: App 启动读取 safeStorage 密文
    alt refresh token 未过期
        Auth->>GH: refresh_token grant + Client ID
        GH-->>Auth: 新 access/refresh token + expires_in
        Auth->>Auth: 原子替换加密凭据
    else 缺失、过期或刷新失败
        Auth->>Auth: 删除凭据，回到 signed-out
    end

    UI->>Auth: Sign in with GitHub
    Auth->>GH: Device Flow
    GH-->>Auth: access/refresh token + expiration
    Note over Auth: token 与绝对过期时间只留在 Main

    Note over Main: packaged Windows/macOS<br/>启动一次 + 每小时
    Main->>Auth: getAccessToken
    Main->>GH: 固定私有仓库 releases/latest + Bearer
    GH-->>Main: metadata
    Note over Main: 只接受非 draft/非 prerelease SemVer

    Main-->>UI: available + 纯文本 changelog
    Note over UI: React 不用 HTML 渲染

    UI->>Main: downloadUpdate 用户显式触发
    Main->>GH: Release Asset API 流式下载
    Note over Main: 写 <userData>/updates/downloads/.<name>.<uuid>.part
    Main-->>UI: 进度广播
    Main->>Main: 校验声明 size 与 sha256
    Main->>Main: fsync + 原子 rename

    UI->>Main: openDownloadedUpdate 无参数
    Main->>Shell: shell.openPath 仅本进程内成功下载的路径
```

**临时 private 阶段鉴权**：GitHub App Client ID 为公开配置，Device Flow 不嵌入 client secret/private key。GitHub App 只安装到 `zhxmt-xm/Interceptor`，权限为 `Contents: read-only`。App 必须保持 expiring user tokens 开启；OAuth 响应的 `expires_in` / `refresh_token_expires_in` 被换算为绝对时间，与 token 一起经 Electron `safeStorage` 加密保存。每次启动先刷新一次；运行期间只保留一个 timer，按最新 `accessTokenExpiresAt` 提前 5 分钟刷新，成功后用新过期时间重排。refresh token 缺失、过期或任意非退出刷新失败都删除登录态，等待用户重新授权；退出只取消 timer/请求，下次启动重新处理。

**安全校验**：SemVer、draft/prerelease、固定 `api.github.com/repos/zhxmt-xm/Interceptor`、asset ID/name/basename、平台扩展名、显式架构、声明 size、SHA-256。拒绝路径编码逃逸、外域、重复候选；Bearer token 不进入 Renderer、状态、日志、错误文本或安装包。

**Renderer 永远拿不到 URL 或 path。**

九态：`unsupported` / `authentication-required` / `idle` / `checking` / `available` / `downloading` / `downloaded` / `up-to-date` / `failed`。

`GitHubAuthStatus` 只含 state/login/device code/verification URI/expiration/message 等公开授权状态；`UpdateStatus` 只含 `supported` / `state` / `currentVersion` / `latestVersion` / `progress` / `downloadedBytes` / `totalBytes` / `releaseNotes` / `message` / `lastCheckedAt`。Preload 只暴露登录意图、公开 auth status，以及 update get/check/download/openDownloaded；没有 token getter。

**生命周期**：`DesktopApplication` 在创建窗口前恢复并刷新授权，再构造 updater；授权服务随后只按过期时间维护一个 refresh timer。授权布尔态变化会取消旧检查/下载并清除旧 Release 状态。状态分别经 `github-auth:status` 与 `update:status` 广播。退出时停止 Device Flow、token/update timers 与活动下载。packaged Renderer 始终从受保护 ASAR 经 `interceptor://app` 协议加载，**不存在远程代码覆盖层**。

**转 public**：这套登录仅服务当前 private 仓库阶段。开源后删除 `GitHubAuthService`、auth IPC/store/UI 与 `authentication-required`，updater 恢复匿名固定仓库请求；发布资产校验和手动下载流程保留。

## 5. 存储状态

```mermaid
flowchart LR
    UI["Settings Storage 面板"] -->|"capture.status"| App["CoreApplication"]
    App --> Storage["CaptureService.status()"]
    Storage --> Capture["ExchangeStore 统计"]
    Storage --> Body["BodyStore.usageBytes"]
    UI -->|"capture.cleanup"| App
```

报表字段：`sessionCount`、`exchangeCount`、`bodyCount`、`databaseBytes`（Capture 无 SQLite 恒为 0）、`blobBytes`、`totalBytes`。

**已知缺口 [改造中]**：当前没有内存、磁盘与 session 生命周期策略。大量小于阈值的正文全部驻内存，事件队列未 ack 时无上限。需提供用量观测与明确的清理建议，且不得静默丢数据。

## 6. 语言与主题

| 项 | 实现 |
| --- | --- |
| 语言 | 15 种完整本地 catalog，英语默认与回退 |
| 同步范围 | Ant Design `ConfigProvider.locale`、`html lang`、`localStorage`、`Intl` 格式 |
| Main 同步 | 当前未实现；Desktop API没有语言intent，原生文件Dialog不接收Renderer语言设置 |
| 主题 | light / warm / dark / ember 四套时段主题 |
| 驱动 | `theme/theme.ts` ConfigProvider token + `:root[data-theme]` CSS 变量 |

若以后把语言开放为Tool，先增加正式typed intent；Main仍不得因此暴露路径或通用IPC。

## 7. Agent

`Settings > Agent` 是全局Agent配置的唯一入口。阶段1已实现`Configured models`、Provider Add/Edit/Test/Save/
Remove与新Chat默认Model；Provider registry和API Key由Main内`AgentRuntime`经`safeStorage`加密，Renderer只见
脱敏snapshot。

下一阶段在同一Settings section增加两个独立区域：

- `Tool capabilities`：从`packages/interceptor-tools/`已实现registry渲染；每行提供Agent与MCP两个Switch，
    默认全部开启，关闭后只停止向对应入口注册；
- `Execution mode`：Agent按Session、MCP按Client选择`ask`或`auto`，默认`ask`。query Tool开启后直接执行，
    change Tool才读取该模式。

页面不显示架构目录中尚未实现的Tool。完整名称、状态和逐项顺序见
[tool-capabilities.md](tool-capabilities.md)；Provider/Session/Tool Loop所有权见[agent.md](agent.md)，MCP接入见
[mcp.md](mcp.md)。

### 7.1 Settings 只读 Tool 契约（已实现）

本工作项接入六项 query：`settings_get_core_process_status`、`settings_get_system_proxy_status`、
`settings_get_certificate_status`、`settings_get_tls_insecure_hosts`、`settings_get_tls_passthrough`、
`settings_list_app_containers`。六项共用唯一 registry，归 `settings` capability，均只接受空对象；
Agent 与 MCP 默认开放，独立开关立即控制披露与执行，query 不进入 Ask 审批。

- Core 进程状态、系统代理、证书与 AppContainer 查询复用 Main 的正式 owner；TLS 名单复用现有 Core 查询。
    Main 查询不得为接入 Tool 下沉到 Core，也不得扩大 Renderer API 或调用通用 IPC。
- Core 状态只描述进程生命周期，不把 `running` 解释为 listener、TLS 或上游健康。
- 结果只包含公开状态、公开证书身份、配置 host 与 AppContainer SID/名称/豁免状态；不得包含私钥、
    本机文件路径、完整系统代理快照、上游凭据或原生 helper 原始输出。错误同样经过脱敏。
- 查询不得生成或安装证书、修改代理/TLS/豁免、写入配置、打开原生窗口或触发 UAC；AppContainer
    的平台支持状态沿用正式产品契约，不伪造跨平台能力。
- Main 与 Core 共用原始 `AbortSignal`；已取消的调用不得再进入 owner，退出沿现有 Action Gate 与
    Agent/MCP 取消链路排空。关闭 Tool 后的新调用返回 `unknown_tool`，不触达 owner。
- Settings 增加来自 registry 的第六个 feature 分组；名称、query 类型、说明、Agent/MCP 双开关与
    Transcript 摘要同步设计稿、15 种语言、截图及 parity，不维护第二份能力清单。

验证顺序固定为 owning executor/adapter unit Red → `settings.tools.readonly` 真实 Electron Red →
实现 → 同组 unit Green → 同一 workflow Green。真实流程先经 UI 产生 TLS 配置并查询六项，再分别
撤销 Agent/MCP 权限，正常退出重启检查持久化和零重放；证据必须包含查询前后设置不变、脱敏审计、
Main/Core/Worker 销毁、8888 释放、完整 WinINet 与共享 journal 恢复。详见
[Settings E2E 契约](../../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md#settings-tools-readonly)。

### 7.2 系统代理 Tool 契约（已实现）

`settings_enable_system_proxy`与`settings_restore_system_proxy`是两个独立change意图，只接受空对象。
UI与Tool共用Main正式编排、SystemProxyOperationQueue和三字段journal；不接收Model提供的host、port、
proxy snapshot或路径，不改变冷启动自动接管。

- Enable先确认Core listener可用，再接管系统代理、同步检测到的upstream与探活；Restore按现有ownership
    比较恢复首次original并同步直连状态。未owned或外部修改仍返回正式`restored/reason`，不反抢系统设置。
- Ask执行前以公开supported/enabled/owned生成动态影响；Deny不执行写命令。Auto只省略应用审批，保留
    OS权限。Agent/MCP开关分别控制披露与执行，关闭后旧披露不能绕过授权。
- 结果沿用只读Tool的状态白名单；Restore额外返回`restored`与可选`reason`。审批、结果、错误、日志及
    trace不记录完整WinINet、代理地址/凭据、bypass或PAC。
- 排队尚未开始的操作可取消且不得写OS；开始OS变更后必须完成正式原子编排，不能在半途留下代理与Core
    upstream不一致。退出仍先排空已接受操作，再执行最终Restore。
- 验收通过真实Agent Ask Deny/Allow与Auto切换；比较完整WinINet与首次journal original只在内存中进行。
    真正的Restore之后再Enable必须沿同一产品路径重建journal，不测试注入代理配置。

执行顺序为unit/integration Red → `settings.tools.system-proxy`真实Electron Red → 实现 → 同组Green。
验证两项逐一撤权、恢复结果摘要、正常退出与同profile重启Model零重放、Main/Core/Worker销毁、8888释放、
完整宿主副作用恢复。已有只读六项workflow作为共享Main host和授权回归。

<a id="tls-tool-acceptance"></a>
### 7.3 TLS 配置与解密 Tool 契约（真实E2E已完成）

- 2026-09-08最终复验：`settings.tools.tls`真实Electron workflow `1/1` Green（30.2s）。
    - 测试经正式UI自动生成、安装、卸载和删除CA；测试前后LocalMachine Root指纹集合完全一致，旧残留CA已不存在。
    - 两代Main/Core为`11608/44884`、`34820/2212`，均`gracefulDestroyVerified=true`；宿主guard验证WinINet/journal和全部注册进程恢复，8888释放，profile删除。
    - 四项Ask/Auto、名单规范化、revision冲突、挂载面板刷新、意图/实际解密状态、撤权及重启零重放均通过。
- Green trace、两代metadata及日志已归档至TEMP下`interceptor-tls-final-e2e-20260908-160438.zip`。
- 本轮只修正workflow的Windows盘符正则边界，避免把schema URL的`https://`误判为本地路径；初轮断言失败不是产品Red，证据在TEMP下`interceptor-tls-discovery-failure-20260908-160436.zip`。
- 产品代码、依赖和设计未改，复用此前仍适用的unit/integration、parity和package/audit/smoke结果；完整Tool自动验收更新为58/69，Settings为15/26。

历史恢复过程：

2026-09-05实现与聚焦测试已完成，按用户要求保存未闭环进度。最终真实workflow业务断言通过，但Certificates刷新期间
清理跳过Uninstall，残留本轮CA `8F5FD8BF6D49BE746862522F6AC616583ED152BB`。fixture未依据实际测试失败状态
保留profile，误删了测试材料；该旧残留已于2026-09-08由Developer通过
`certutil -delstore Root 8F5FD8BF6D49BE746862522F6AC616583ED152BB`清除，其他旧证书未改动。
原失败trace与两代metadata仍保留在TEMP下`interceptor-tls-cleanup-failure-preserved`。
此前已修复清理等待条件与profile保留判定：fixture使用Playwright实际失败/超时/中断状态，9/9 unit通过；
清理按本轮证书指纹和真实信任状态等待Uninstall/Delete，不再用瞬时不可见跳过。TLS executor32/32、
Desktop485/485、Tools142/142、Core TLS integration12/12、全workspace typecheck、design interaction71/71、
明暗parity96/96、Windows package/audit/smoke通过；当时未完成的最终CA清理及销毁验收现已由上述真实Green闭环。

四项独立change意图为`settings_replace_tls_insecure_hosts`、`settings_replace_tls_passthrough`、
`settings_enable_https_decryption`、`settings_disable_https_decryption`。前两项只接受完整`hosts`数组，
passthrough额外要求`expectedRevision`；空数组仅表示清空该名单，不表示停用解密。后两项只接受空对象。

- 修改统一经Main正式意图进入Core持久化和即时生效；host规范化及passthrough乐观并发由现有Core owner
    决定。Tool边界拒绝多余字段、非字符串名单和非法revision，不开放路径或任意RPC。
- Main必须在passthrough成功后重读缓存；四项成功后发布窄`tls:settings-changed`事件，使已挂载的证书与
    passthrough面板重读正式查询。UI和Tool复用同一意图，不能各自维护第二套配置或伪造TLS错误事件。
- 解密启用只保存用户意图，实际生效仍要求CA已生成且受信任；不为Tool自动生成或安装CA。返回公开证书
    身份及`mitmEnabled`，并复用Core正式启停返回的`decrypting`，两者不得混淆。停用不删除证书或更改信任库。
- Ask展示当前/目标名单数量和解密状态，Deny不写配置；Auto只省略应用审批。取消在持久变更前拒绝，
    已开始的配置持久化必须完成Core同步，不能留下Main缓存/用户意图和Core不一致。
- 返回值沿正式查询形状，错误不泄露路径或私钥；revision冲突必须显式保留`conflict`，不覆盖新版本。
- unit/integration Red → `settings.tools.tls`真实Electron Red → 实现 → 同组Green。E2E经UI产生CA，
    必要时完成真实OS授权，并在finally经UI移除信任和删除测试CA；证书工作项本身仍独立交付。
    需验证四项Ask/Auto、已挂载UI刷新、host规范化、stale revision、撤权、重启配置恢复及Model零重放，
    最后验证CA信任、WinINet、journal、进程和8888全部恢复。

<a id="certificate-tool-acceptance"></a>
### 7.4 证书 Tool 契约（保留七项Tool，管理员MMC原生验收排除）

- 2026-09-09：六项证书生命周期/查看已完成真实Agent/MCP、Explorer/Viewer关窗与双代恢复；Manager实现、逻辑测试与UI/parity保留，管理员MMC原生验收按用户明确要求排除，不再阻塞。
    - `settings.tools.certificates`为1/1 Green（54.2s，Runner总计55.9s）；两代Main/Core为`47704/19820`、`35384/17472`，均`gracefulDestroyVerified=true`。
    - 六项Agent/MCP成功调用、各六次Deny、受信任重生成拒绝、四次原生窗口打开/关闭、十二项入口撤权及重启Model请求增量0通过。
    - 完整Root指纹集合恢复，测试CA信任和材料自动清理；WinINet/journal恢复、8888释放、成功profile删除，无MMC残留。
    - trace、两代metadata与日志归档在TEMP下`interceptor-certificates-six-e2e-green-20260909-002441.zip`，SHA-256为`B7939C70D90485DB94E61BB943BBD520C4E00CAF7393AE3E92A2DF9261F401EC`。
    - 关窗时保持置顶直到确认句柄消失，再在finally释放；旧实现过早释放置顶。空目录Explorer三次连续验证及上述真实流程均通过，一次性脚本已删除。
- 七项registry、Main命令与IPC共用方法已接线；此前owner50/50、摘要64/64、Tools431/431、Desktop721/721、MCP32/32与全workspace类型结果仍适用，本轮Desktop typecheck再次通过。
    - 前置unit日志在TEMP下`interceptor-certificates-owner-red-20260908.log`；真实Red证据在`interceptor-certificates-discovery-red-20260908.zip`。
    - Explorer与系统证书查看器已在真实Agent流程打开、鼠标关闭并验证句柄消失；Win11 Explorer未暴露`AutomationId="Close"`，驱动使用系统标题栏Close几何，按本轮句柄/进程代际确认所有权，不依赖证书文件在清理后仍存在。
    - MMC的标题栏查询返回Win32 `5`（Access denied），窗口enabled但关闭按钮坐标全0；单独Manager真实调用同样复现，日志在TEMP下`interceptor-certificates-mmc-inspection-20260908.log`。需要具备目标窗口访问权限的E2E Runner，不能绕过权限或跳过原生窗口验收。
    - 窗口与CA清理分别执行；六项已完成最终恢复。旧Manager脚本在关窗失败后未执行后续MCP及双代重启；2026-09-09用户确认按下方Manager专属范围调整，原失败证据保留，不计入已完成验收。
    - 七项摘要经历7条Red后Green，三条窗口请求文案经历3条Red后15语言完整；与AppContainer合并后的摘要64/64、Tools431/431、Desktop721/721、MCP32/32及全workspace typecheck通过。
    - 证书专项parity28 views / 168 targets全部匹配、0 missing/flagged、最大0.5px；其中六项为24 views / 144 targets。此前Windows package、artifact audit及smoke仍适用，产品和设计未再变化；这些结果不替代Manager独立E2E。
- 七项均为`change`，只接受空对象，拒绝路径、证书字节、私钥、指纹覆盖或任意外部程序参数；不增加Preload API。

| Tool | Main命令与共用方法 | 结果 |
| --- | --- | --- |
| `settings_generate_certificate` | `settings.certificate.generate` / `generateCertificate()` | 公开证书状态 |
| `settings_install_certificate` | `settings.certificate.install` / `installCertificate()` | 公开证书状态 |
| `settings_uninstall_certificate` | `settings.certificate.uninstall` / `uninstallCertificate()` | 公开证书状态 |
| `settings_delete_certificate` | `settings.certificate.delete` / `deleteCertificate()` | 公开证书状态 |
| `settings_reveal_certificate` | `settings.certificate.reveal` / `revealCertificate()` | `{ requested: true }` |
| `settings_view_certificate` | `settings.certificate.view` / `viewCertificate()` | `{ requested: true }` |
| `settings_open_certificate_manager` | `settings.certificate-manager.open` / `openCertificateManager()` | `{ requested: true }` |

- 公开证书状态固定为`present/trusted/supported/mitmEnabled/fingerprint/subject/createdAt/expiresAt`；不返回`path`、私钥或helper输出。
- IPC、Agent与MCP调用同一个Main业务方法；四项状态操作完成后同步Core并广播既有`tlsSettingsChanged`，已挂载Certificates面板必须即时更新。
- Generate与UI保持一致：受信任时拒绝重新生成，旧身份和信任不变；未受信任时允许生成或重新生成，不自动安装、不改解密意图。
- Install要求证书已生成，不隐式生成；Uninstall只移除当前profile的证书信任；Delete在仍受信任时先卸载，再删除本地材料，避免孤立信任。
- Reveal/View要求当前证书存在；Manager不依赖当前CA。三项只请求正式系统窗口，`requested`不冒充已完成窗口交互或信任修改。
- Generate与Delete标记为destructive；七项均不开放任意网络或程序执行。Ask摘要只使用操作名和公开状态，Deny、审批前取消及撤权不产生副作用。
- Windows UAC或macOS Authorization沿产品现有路径；不改授权策略。开始写入前检查取消，已开始的操作完成Core同步与通知，不伪造回滚成功。
- `settings.tools.certificates`六项生命周期/查看继续保留Agent/MCP、Ask/Auto、撤权、重启零重放及完整CA/宿主恢复的真实E2E；Manager仅排除下方明确的管理员MMC原生验收，不改变其他功能门禁。

<a id="certificate-manager-acceptance"></a>
#### Manager验收范围（2026-09-09用户明确排除管理员MMC）

- 职责仅为通过`openCertificateManager()`请求打开外部系统管理器；Windows为`certmgr.msc`，macOS为Keychain Access。`{ requested: true }`表示启动请求成功，不表示读写证书或窗口清理成功。
- 单元/集成测试覆盖空参数与非法输入、Agent/MCP授权和审批、撤权、取消、共用Main方法调用、启动错误与安全返回值。
- 不做需要管理员权限的MMC原生打开、关闭和进程清理验收；不再要求“至少一次”或管理员终端。删除`settings.tools.certificate-manager`原生workflow及专用辅助代码，不测试MMC内部功能。
- Manager Tool、Main/IPC/Agent/MCP调用、UI摘要、语言、设计/parity及Playground recipe全部保留。其他六项证书完整真实E2E，以及通用Agent/MCP授权、取消、持久化和重启测试全部保留。
- MMC原生专项是用户明确排除项，不记为passed，也不再作为blocked或交付前置条件；不能把其余逻辑测试改称MMC真实E2E通过。
- 生产保持`asInvoker`，不修改UAC或token、不自动提权，不增加人工等待模式；取消的是测试要求，不是产品打开系统管理器的行为。
- 2026-09-09相关逻辑回归通过：证书owner50/50、MCP专项及registry31/31、Agent适配器22/22、动态授权10/10、Session审批/Auto/取消与持久化integration36/36；Tools、MCP、Desktop typecheck通过。MCP新增11项Manager适配器用例，Agent新增Manager发现/撤权用例；历史发现缺失的Red和其他六项真实E2E证据保持。
- 删除MMC专项后，六项真实E2E复跑1/1 Green：两代Main/Core `14248/2888`、`39644/4212`均正常销毁，CA/Root/WinINet/journal恢复，8888释放、MMC无残留。证据为TEMP下`interceptor-certificates-keep-six-green-20260909-142011.zip`，SHA256 `C433C0B4A6A61821F3A437FF22740F6E3F30CDD3784ACBB41CD899A700BC3F7B`。
- 按用户约定范围，Tool主线69/69已验证：68项保留真实E2E，Manager原生专项排除；用户后续自行查看，不另列人工验收待办或交付门禁。逻辑日志在TEMP下`interceptor-manager-logic-20260909.log`、`interceptor-manager-focused-regression-20260909.log`和`interceptor-manager-session-approval-20260909.log`。
- 历史权限证据保留：Runner为Medium（8192）、MMC为High（12288），UIAccess=0；归档`interceptor-manager-integrity-evidence-20260909-132627.zip`及`interceptor-certificates-mmc-access-denied-20260908.zip`不代表新的通过结果。旧MMC进程`26600`随后已退出，旧CA残留已通过正式UI恢复，详见前一节历史证据。

<a id="app-container-tool-acceptance"></a>
### 7.5 AppContainer Tool 契约（自动验收完成）

- 四项均为独立`change`，复用`AppContainerService`及现有helper，不改Windows权限策略。

| Tool | Main命令 | 参数 |
| --- | --- | --- |
| `settings_enable_app_container` | `settings.app-container.enable` | `{ appContainerSid: string }` |
| `settings_disable_app_container` | `settings.app-container.disable` | `{ appContainerSid: string }` |
| `settings_enable_all_app_containers` | `settings.app-containers.enable-all` | `{}` |
| `settings_disable_all_app_containers` | `settings.app-containers.disable-all` | `{}` |

- 单项SID必须是`S-1-15-2-...`数字子项格式；拒绝非容器SID、任意命令或额外`enabled`字段。启用/停用不是同一条Tool的boolean参数。
- Tool返回`{ supported, containers: [{ appContainerSid, packageFamilyName, displayName, exempt }] }`，不返回helper路径、原始完整exemption集合、binaries或workingDirectory。
- IPC、Agent和MCP调用同一Main方法；Main完成后统一发`app-container:changed`，所有已挂载面板重读正式列表，不只刷新调用方弹窗。
- Ask展示目标数、当前已豁免数及允许访问全部本机loopback、退出后仍保留的影响；Deny、审批前取消和撤权不请求UAC、不写OS。
- Auto只省略应用内审批，仍经正式原生授权。开始写入前检查取消，写入开始后完成helper读回与状态通知，不伪造撤销。
- 批量启停各调用一次helper，保留当前枚举之外的既有SID；单项只修改所选SID。系统状态必须由真实workflow在finally经产品UI恢复到测试前完整集合。
- 实施门禁：owner unit Red、真实`settings.tools.app-containers` Red后实现；Green覆盖Agent/MCP四项、挂载UI、Ask/Auto、撤权与重启零重放、完整exemption/WinINet/journal/进程恢复。

#### 验收证据（2026-09-08）

- 前置owner34/34 Red，真实workflow精确Red于缺少四项Tool；日志分别在TEMP下`interceptor-app-container-owner-red-20260908.log`及`interceptor-app-container-e2e-red-20260908.log`，真实证据归档`interceptor-app-container-discovery-red-20260908.zip`。
- 同组owner34/34 Green，摘要新增4条Red后64/64 Green；当前Tools431/431、Desktop721/721、MCP32/32、全workspace typecheck及Playground Browser5/5通过。
- 最终真实workflow与原批量UI、排序、Settings只读、TLS、全局授权、MCP Browser/Desktop合计8/8 Green。
    - AppContainer两代Main/Core为`49008/19980`、`16136/46764`；8条流程共14代均`gracefulDestroyVerified=true`。
    - 四项Agent/MCP分别覆盖Ask Deny/Allow及Auto、原生授权、单项/批量范围、即时面板同步和数量摘要；两列撤权独立、重启Model增量0。
    - 初始及最终完整exemption集合hash一致，枚举外既有SID保留；WinINet/journal恢复、8888释放，成功profile删除。
    - 归档在TEMP下`interceptor-settings-tools-final-e2e-20260908.zip`，SHA-256为`CA646E05D6C3C0D4F096E5C573331E0AEA21579C4286A538524BDDC6B2D0B7D7`。
- 新Tool parity16 views / 96 targets全匹配、0 missing/flagged、最大0.5px；能力表及Settings查询明暗4 views / 66 targets全匹配、0px。
    - 原面板与批量确认一并复跑；面板保留原报告中相同的明暗各5项flagged、最大3.8px，批量确认0 missing/flagged。未修改CSS，不把既有视觉债务改记为通过。
    - 图片及结构化报告在TEMP下`interceptor-app-container-parity-20260908`与`interceptor-settings-capability-parity-20260908`；16张AppContainer图已提交，两张含Manager行的Settings目录图仍留在worktree，随Manager工作项处理。
- Windows package、artifact audit（1,294 files / 392,939,357 bytes）、production audit 0漏洞与packaged smoke1/1通过；新增`onAppContainersChanged`已进入Preload精确白名单。
- 初轮Auto因长Chat与模拟Provider回复未完成失败；改为经真实UI创建独立Auto Chat并重新discovery，同流程Green，未改变产品上下文限制。该失败不是产品Red。
- 上述8条于2026-09-08在69项registry的worktree验证，记录不代表当时已提交69项。2026-09-09六项证书已独立取得Green，仅Manager仍有MMC权限阻塞；AppContainer Green不替代Manager、人工矩阵或Capture39项的验收。

## 8. 安全边界汇总

| 边界 | 保证 |
| --- | --- |
| CA 私钥 | 只在 Main 与 Core 内存，safeStorage 加密存盘 |
| 文件路径 | 只在 Main 与 Core 之间，Renderer 无 path/readFile/writeFile |
| 更新 URL | 只在 Main，Renderer 无法提交任意 URL |
| 系统代理 | 只在 Main，guarded 写入，日志不含 snapshot |
| Renderer origin | 生产固定 `interceptor://app/index.html` |
| Fuses | Electron 九项 strict 锁定 |

## 8. 已知风险

- Root CA 安装到 local-machine 信任库会影响本机全部用户与进程，安装提示必须明确范围。
- 证书 pinning、mTLS、独立 trust store 的应用会拒绝 MITM，需要 per-host passthrough。
- QUIC/HTTP3 不在当前捕获范围。
- Start/Stop decrypting 会重启 listener，可能中断活动下载、WebSocket、SSE、gRPC。
- `ignoreHostHttpsErrors` 会关闭指定 origin 的证书校验，必须逐 host 明示且避免通配。
- 强杀或 OS crash 会让系统代理暂时停在 8888，直到 journal recovery 或紧急修复。

## 9. 验收要点

- [ ] CA 私钥不出现在 Renderer、日志、导出、packaged smoke 的 API 白名单中。
- [x] Windows App A强杀后，跨profile App B加载首次`original/owned`，正常退出恢复宿主并完整销毁。
- [x] Windows外部程序改写代理后保持零系统写入并清除失效journal，由owning unit/integration验证。
- [x] Windows Core故障自动Restore、重新接管及第二次故障与Close竞争的真实Electron证据。
- [ ] macOS真实Electron crash/relaunch、Authorization与系统副作用恢复证据。
- [ ] 更新下载的 SHA-256 与 size 校验失败时不保留文件。
- [ ] 15 种语言切换后无页面溢出，持久化生效。
- [ ] 存在 PAC 或上游代理时 Enable 有明确提示而非静默断网。
