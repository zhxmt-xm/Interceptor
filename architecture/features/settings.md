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
| 语言与主题 | Renderer | 15 种语言、4 套主题 |
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
| `current == original`、外部修改零写入、恢复失败保留 journal | Windows/macOS Service unit 与 journal integration | 产品分支已验证；外部修改尚无真实 OS 交互 E2E |
| 启动失败先恢复代理再清理其他服务 | `application-shutdown` unit | 属无法由正常用户路径稳定制造的故障分支，不用故障注入冒充 E2E |
| Promise 队列严格串行且前序失败不阻塞后续 | `operation-queue` unit | 队列本身已验证；Core 故障与用户 Enable/退出竞争尚无真实 Electron E2E |
| Core 异常退出后的自动 Restore 与新 Core 生命周期 | packaged smoke 会重启 Core，但按本仓定义不属于真实 E2E | 待专项真实 Electron workflow |
| macOS 三态 journal 与多 network service 恢复 | macOS Service unit、journal integration；Windows package 不执行 Swift helper | 待真实 macOS Electron、Authorization 与系统副作用证据 |

因此当前只能称为“Windows 跨 profile 崩溃恢复主路径 E2E 完成”；不能称为上述全部流程均已真实 E2E。

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

认证代理（需要 `Proxy-Authorization`）尚未验证：`proxyUrl` 支持 `http://user:pass@host:port` 形式，但 WinINet 不保存凭据，需要用户手工提供。

### 3.7 Proxy 与 MITM 跨进程恢复契约

系统代理 ownership 与 TLS 用户配置使用两种不同的恢复语义：

- Windows 系统代理 journal 在异常退出后保留首次 `original/owned`。产品只支持同一时间一个 App；下次 Main 在创建 Renderer 和 Core 前比较 `current`，等于 `owned` 时直接加载快照，等于 `original` 时清 journal，其他值保持零 WinINet 写入并清除失效 journal。正常退出时精确恢复首次 `original`。
- TLS passthrough、源站证书例外与 HTTPS 解密开关是跨会话用户配置。新 Core 从 `workspace.sqlite` 读回配置；Main 在 Core ready 后读回解密意图，并按「CA 仍受信任且用户开启」重新下发 CA 与解密状态。

真实 Electron 验收顺序运行两次 App 生命周期。第一代由正常 bootstrap 接管系统代理，再只能通过 Settings UI 生成并安装 CA、开启 MITM、添加 TLS passthrough 与源站例外，随后由测试环境异常终止。第二代启动必须在创建 Renderer/Core 前消费共享 journal，并在不改写 WinINet 的情况下加载同一 `original/owned`，最终 UI 仍是 Recording/owned。流程结束前必须通过 UI 删除测试配置、关闭 MITM、卸载并删除 CA，再验证两代 Main/Core 全退、8888 释放且系统代理等于首次 `original`。测试只在内存比较 OS 与 journal 快照，不把原始 proxy server、bypass 或 PAC 写入 trace、日志或附件，也不打开会渲染这些字段的 Proxy 面板。实际MITM数据面归`capture.protocols.with-mitm`验收，不由本workflow代替。

## 4. 更新

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
- [ ] Windows外部程序改写代理后保持零系统写入，并清除失效journal的真实OS交互证据。
- [ ] Windows Core故障自动Restore与用户Enable/退出竞争的真实Electron证据。
- [ ] macOS真实Electron crash/relaunch、Authorization与系统副作用恢复证据。
- [ ] 更新下载的 SHA-256 与 size 校验失败时不保留文件。
- [ ] 15 种语言切换后无页面溢出，持久化生效。
- [ ] 存在 PAC 或上游代理时 Enable 有明确提示而非静默断网。
