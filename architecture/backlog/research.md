# 已知缺口与长期候选

> 最后更新：2026-08-07
> 范围：当前**未实现**的能力。分三档——已知缺口（当前架构的确定性欠账）、长期候选（未承诺、需重新设计）、研究备忘（技术策略，不是产品路线）。
>
> 当前真正在推进的工作看 [../HANDOVER.md](../HANDOVER.md)、[idea.md](idea.md) 与 [TODO.md](TODO.md)；本文只是"还没有做什么"的清单。

## 1. 已知缺口

这些是当前实现明确知道的边界，通常有具体的阻塞原因。

| 缺口 | 阻塞原因 |
| --- | --- |
| Local E2E 的 60 条 feature workflow | driver、fixture、automation contract 与验收规格都已就绪，`workflows/` 为空，尚未实现任何一条 |
| HTTP/2 深度 stream 健壮性（streamId / GOAWAY / RST / settings / 背压） | Mockttp 未暴露，需要原生 http2 数据面 |
| WebSocket over HTTP/2（RFC 8441 Extended CONNECT） | 当前只支持 RFC 6455 的 HTTP/1.1 Upgrade |
| gRPC 实时 streaming 增量 framing、message-level 解压、Protobuf descriptor 与 Server Reflection | 当前是完成后的 raw message 展示 |
| h1 下游 → 纯 h2 上游（源站 `allowHTTP1:false`） | Mockttp 返回 403。真实世界罕见的边缘组合，已移除该失败用例并记为限制——"支持 HTTP/2"不等于支持这个组合 |
| 真正零内存流式正文落盘 | 当前经内存缓冲后写内容寻址 Blob，body-data 增量写盘留后续 |
| 每 exchange 的上游 TLS metadata 落库 | Mockttp 未暴露数据面上游 TLS；当前用按需 `tls.probe` 实时探测替代 |
| CA 导出 | 未实现 |
| 上游认证代理（`Proxy-Authorization`） | `proxyUrl` 支持 `http://user:pass@host:port`，但 WinINet 不保存凭据，需要用户手工提供，未验证 |
| macOS 上游代理检测 | 快照按网络服务分开存，多服务（Wi-Fi / 以太网 / VPN）可能各配不同代理，需先定义合并语义 |
| 生产签名 / 公证 | Windows Authenticode、Apple Developer ID 与 notarization 需要仓库外凭据和原生 runner 留证 |

## 2. 长期候选

来自最初的产品方案，至今未实现。**均未承诺，且需要重新设计**——原始表述写于当前架构成型之前，不能直接照搬实施。

- **Replay**：基于捕获会话重放请求。当前 Composer 可手工发送并有 Recent sends，但 Capture → Composer 的复制仍未实现。要做需要先定义：复制哪个请求版本（wire 还是规则改写后）、认证/Cookie 如何处理、是否再次经过 Rules、重放证据怎么记。
- **Reverse Proxy / Port Forwarding**：独立产品线，当前没有任何对应架构、UI 或排期。
- **带身份验证的局域网远程设备捕获**：技术上合理，但与当前 loopback-only 的安全边界冲突很大，必须重做认证、暴露面和威胁模型。
- **macOS 透明捕获（Network Extension）/ Windows WFP 透明捕获**：平台与安全研究方向，不能与普通 feature backlog 混排。
- **RTL（从右到左）布局**：15 种语言已实现，RTL 未实现。

## 3. 研究备忘

技术策略，不是产品路线图。

### 3.1 用 Node 原生模块自建数据面

- **动机**：吃透 HTTPS 代理的底层——TLS MITM、动态签发站点证书、HTTP/1.1 与 HTTP/2 双向转换、流控与背压。这些是本产品最核心的知识。
- **范围**：用 `node:http`、`node:http2`、`node:tls`、`node:net` 逐步替换 Mockttp 承担的拦截职责，规则/会话/存储/IPC 边界保持不变。
- **现在不做的原因**：学习和实现曲线陡峭，当前阶段优先做出可用产品。而且当前实现已经为 Mockttp 维护了 patch 并围绕其事件模型构建了 Capture/Rules，替换等于重做整个核心数据面。
- **与性能无关**：Mockttp 本身就是纯 TypeScript、构建在同样的 `node:*` 模块之上，自建不会带来数量级性能提升，两者上限都受 Node 运行时限制。自建的价值是掌控与理解。
- **真要做的方法**：以 Mockttp 的实际行为作为「正确性参照物」，一次只用原生实现一个子模块（先 HTTP/1.1，再 HTTP/2），与 Mockttp 对照验证。可用 LLM 辅助生成代码，但必须逐行读懂、自己 debug；MITM 的边界情况（Trailer、GOAWAY、畸形帧、ALPN、证书链、编码组合）需要主动补齐，LLM 默认只给 happy path。

### 3.2 Rust 数据面

- **触发条件**：真实遇到 Node 数据面无法通过的性能门槛，或想借项目系统学习 Rust。**当前没有任何性能基准证明需要它。**
- **技术选型**：Hudsucker 作 MITM 基础，Hyper/Tokio 负责 HTTP 与调度，rustls 负责 TLS，rcgen 负责动态证书。
- **现实成本**：Rust 语言 + Tokio 异步 + 系统级网络编程三重难度叠加；且如 3.1 所述，等于重写整个数据面，不是平滑替换。
- **可复用资产**：持久化格式、Archive 格式、规则模型和传输无关的 Command 语义可作为迁移基础；Electron MessagePort 与 TypeScript Schema 不直接复用，届时按真实约束新增跨语言 Transport 和编码层。

### 3.3 Windows AppContainer、WAM 与 TLS passthrough

> 状态：2026-08-07 完成本机实证、产品实现与自动化数据面验证。Windows owned
> `ProxyOverride` 已不再注入 `*.wvd.microsoft.com`；真实 Windows App 验收由用户执行。

#### 问题不是一层

Windows App / Dev Box 一次连接跨越多个安全主体，不能用一个域名 bypass 或一个 SID 概括：

| 环节 | 本机实际主体 | 与 Interceptor 的关系 |
| --- | --- | --- |
| 资源列表与主界面 | `Windows365.exe` + WebView2 | 普通 WinINet/WebView2 请求可进入 8888 |
| WAM token 获取 | `Microsoft.AAD.BrokerPlugin` AppContainer | 无 loopback exemption 时可能在 Windows 网络隔离层被拦，连接到不了 8888 |
| YubiKey / WebAuthN | 系统认证 provider | 产生认证断言；不等于负责 HTTP 转发或 token 缓存 |
| token / claims | AAD Broker | 网络请求成功后返回给 Windows App / RDP 客户端 |
| 远程桌面传输 | `msrdc.exe` → WVD gateway | 目标客户端拒绝 MITM 时，应走加密 TLS tunnel |

三个经常混淆的配置必须分开：

| 配置 | 生效位置 | 流量是否经过 8888 | 是否解密 |
| --- | --- | --- | --- |
| Windows `ProxyOverride` | system proxy | 否 | 否 |
| AppContainer loopback exemption | Windows 网络隔离 | 允许该容器连接本机 8888 | 不决定 |
| Mockttp `https.tlsPassthrough` | Core TLS 分流 | 是 | 否，只记录 CONNECT/tunnel 元数据 |

`insecureHosts` 不是第四种 passthrough：它仍执行 MITM，只是忽略 **Interceptor → 源站**
的证书错误，不能解决客户端拒绝 Interceptor leaf 证书的问题。

#### 已验证事实

固定系统代理为 `127.0.0.1:8888`，并保持 `*.wvd.microsoft.com` system bypass 不变，完成了
AppContainer exemption 的 A/B/A 对照：

| WVD system bypass | AAD Broker exemption | 结果 |
| --- | --- | --- |
| 有 | 无 | WAM 报 `0xCAA70004 The server or proxy was not found`；token endpoint 失败，交互授权页报 HTTP 404 |
| 有 | 有 | AAD claims token 可取得，RDP 事件出现 `bAcquiredSilently:1` / `errorCode:0x0`，随后连接成功 |
| 有 | 再移除 | 同样复现 `0xCAA70004` 与 HTTP 404 |

因此，对本机这条 WAM 登录路径，AAD Broker 的 loopback exemption 是必要条件。它不验证
YubiKey、不创建凭据，也不保证认证成功；它只让 Broker 能连接本机代理，完成授权码兑换、
refresh token 或 claims token 等网络步骤。

另一个独立对照：保留 AAD Broker exemption，但移除 WVD system bypass 后，claims token 仍以
`0x0` 成功，Core 随即对 `www.wvd.microsoft.com` / `windows365.microsoft.com` 记录连续
`tls.client-error: reset`，RDP 以 `0x3000008` 断开。这证明认证成功与 gateway 拒绝 MITM 是两个问题。

`ecs.office.com/` 的 503 不是根因：直连与经 8888 对同一裸根路径均收到同样的 Microsoft
`503 Service Unavailable` 响应。Bilibili 重新验证后登录态正常，也没有证据支持通用 Cookie
转发故障。

#### 目标流程

```mermaid
sequenceDiagram
		participant User as User
		participant UI as App shell / Settings
		participant Main as AppContainerService
		participant Win as Windows Network Isolation
		participant Client as Windows App / Broker
		participant Core as Mockttp
		participant Origin as Origin

		User->>UI: 打开 AppContainer access
		UI->>Main: listAppContainers()
		Main->>Win: EnumAppContainers + GetConfig
		Win-->>UI: AppContainer + SID + exempt 状态
		User->>UI: 为目标应用开启 exemption
		UI->>Main: setLoopbackExemption(SID, true)
		Main->>Win: 提权 read-modify-write + verify

		Client->>Core: CONNECT / TLS ClientHello
		alt host 在 tlsPassthrough 列表
				Core->>Origin: 原始 TLS tunnel
				Origin-->>Client: 端到端 TLS
		else 默认尝试 MITM
				Core-->>Client: Interceptor leaf certificate
				alt 客户端接受
						Core->>Origin: 解密后转发
				else cert-rejected / reset / closed
						Core-->>UI: 去重后的全局兼容性事件
						UI-->>User: 任意工作区显示多 host 列表 dialog
						User->>UI: Add all hosts
						UI->>Core: 一次 revision replace 批量保存列表
						UI-->>User: 导航到 TLS Settings 并提示重启后生效
						Note over Client,Core: 已失败连接不可恢复；下次连接生效
				end
		end
```

#### AppContainer exemption manager

不复用 Capture 的“已安装应用索引”，直接采用 Fiddler WinConfig 与开源 Loopback Exemption
Manager 使用的 Windows 官方 Network Isolation API：

1. `NetworkIsolationEnumAppContainers` 枚举当前已创建的 AppContainer；每项直接返回
	 `appContainerSid`、`userSid`、Package Family Name、显示名、package full name、binaries、
	 capabilities 与 working directory。
2. `NetworkIsolationGetAppContainerConfig` 读取已允许 loopback 的 SID 集合。
3. UI 以 SID 为稳定主键，提供搜索、单项开关与刷新。AAD Broker 只能作为“Windows SSO”
	 推荐项，不能代表所有认证 plugin，也不应自动开启。
4. 修改操作在提权 helper 内重新读取完整集合，只增删目标 SID，再调用
	 `NetworkIsolationSetAppContainerConfig`；必须保留其他工具写入的未知 SID。
5. 调用后再次读取验证；枚举结果用 `NetworkIsolationFreeAppContainers` 释放，GetConfig 返回的
	 SID 内存按官方要求释放。

读取可用普通权限；修改需要 UAC。exemption 是持久 OS 配置，且允许目标容器访问 **全部**
loopback 服务而不只是 8888，因此不默认“豁免全部”。新安装或首次创建的容器不会出现在旧快照中，
每次打开面板与保存前都要重新枚举。用户显式开启的 exemption 不随 Interceptor 退出自动撤销，
否则每次启动都会再次弹 UAC；关闭开关时再显式移除。

建议新增独立 Main 模块 `app-container/` 与独立 native helper，不把它塞进 WinINet ownership：
前者管理 Windows 沙箱权限，后者只管理 system proxy snapshot/restore。Renderer 继续只经窄 IPC
调用，不接触 SID 配置 API 或提权命令行。

#### Mockttp TLS passthrough list

不需要新增 Mockttp patch。Mockttp 4.5.0 已支持：

```ts
https: {
	key,
	cert,
	tlsPassthrough: [{ hostname: '*.example.com' }],
}
```

名单由用户在 Settings 维护，产品默认列表为空。兼容性事件由 App 壳按 host 去重累积，在任意工作区
显示一个全局列表 dialog；用户选择 Add all hosts 后一次批量持久化并导航到 TLS Settings。已挂载面板
通过 settings change sequence 立即重读。WVD badge 仅推荐
`*.wvd.microsoft.com`，不会自动加入或预置。
不能把 Microsoft 登录全域名放进 system proxy bypass，因为共享域名会让 Edge、Office、Teams 等
所有应用的同域流量也完全绕过 Capture。

Mockttp 在 listener 启动时编译 `tlsPassthrough` pattern，公开 API 不支持动态替换。修改名单只持久化，
不在运行中重建共享 listener；Main 严格比较持久化名单与本进程实际运行名单，有有效差异时提示用户
重启 Interceptor。packaged 重启走既有 guarded shutdown；Forge 开发态保留 Vite/Renderer，只优雅
替换 CoreProcess 代际，避免 `app.relaunch()` 关闭开发服务器造成白屏，也避免为低频设置新增高风险
listener 热切换状态机。失败的 TLS 连接无法原地倒带，重启后仍需客户端重试。passthrough tunnel 继续使用仓库现有
`passthroughProxyConfig` patch：无上游时直连，有上游时仍经上游 CONNECT，不需要针对 Clash 写分支。

Core 已能收到 `tls-client-error` 的 `destination` / SNI host 与
`cert-rejected | reset | closed | no-shared-cipher | handshake-timeout | unknown`。提示策略应：

- 按 `TLS generation + host` 去重，避免一次重试风暴弹几十次；
- `cert-rejected` 可给高置信提示；`reset` / `closed` 只能描述为“可能不兼容 MITM”，不能断言 pinning；
- 永不自动加入名单，由用户确认；
- 用户可在 Settings 删除/添加 wildcard，恢复解密尝试。

#### 持久化与契约

TLS passthrough 是低频全局设置，现由 `WorkspaceService` 持久化，不像 `insecureHosts` 一样只存在
Main 内存。实现包含以下 typed RPC / Desktop API：

- Core protocol：`tls-passthrough.get` / `tls-passthrough.replace` 以 revision 乐观锁承载名单读写；
	`tls.useCertificate` / `tls.startDecryption` / `tls.stopDecryption` 只管 CA 材料与 MITM 开关。
- Main：启动/Core 重启时读取持久配置并随 CA 一起下发；处理 TLS compatibility event。
- Preload：暴露 get/set passthrough hosts 与 AppContainer list/toggle 的窄 API。
- Renderer：按 `ui-design-mockup` 流程实现 Settings 的 TLS passthrough 与 AppContainer access；
	App 壳订阅全局 TLS compatibility event 并显示 dialog，两组设置不能混成一个“bypass”开关。

#### 预计文件级改动

| 范围 | 改动 |
| --- | --- |
| Main `app-container/` | 新建 `AppContainerService`、Windows native helper、只读枚举与提权 mutation runner、单测 |
| Main `system-proxy/` | 已删除 `*.wvd.microsoft.com` 的 `ProxyOverride` 特例，只维护原配置与必要 local bypass |
| Core protocol | AppContainer DTO 的 Desktop 契约；TLS passthrough 配置与兼容性事件契约 |
| Core `proxy/` | `ProxyTlsConfig` 增加 `passthroughHosts`；`getLocal` 传 `tlsPassthrough`；TLS 错误去重上报 |
| Core `workspace/` | 持久化 passthrough host patterns |
| Renderer App / Settings | AppContainer 搜索/开关、passthrough host 列表、全局多 host TLS compatibility dialog、批量保存、即时刷新与待重启提示 |
| 测试 | helper parser/service、IPC、配置持久化、严格运行/持久化名单比较、真实 TLS passthrough、上游 tunnel、Windows A/B smoke |

#### 收益与代价

| 方案 | 收益 | 代价 / 风险 |
| --- | --- | --- |
| AppContainer 按应用授权 | 与 Fiddler 同类流程；覆盖任意当前容器；不靠 plugin 名单猜测 | 需要 UAC；用户要理解 loopback 权限；新容器需刷新 |
| Mockttp passthrough | 流量仍经过 8888，可记录 tunnel；不污染全局 system bypass | 看不到 HTTP path/header/body；改名单需重启 Interceptor 后生效 |
| TLS 失败提示而非自动降级 | 不会因偶发 reset 静默失去解密 | 首次失败不可恢复，用户需重试；reset 只能低置信提示 |
| 保留 system domain bypass | 实现最小、连接最稳 | 流量完全不可见；共享域名全局生效；名单持续漂移，不作为目标方案 |

#### “完整应用列表”与 Capture 归属

exemption manager 不需要“完整 Windows 应用列表”：`NetworkIsolationEnumAppContainers` 就是该功能
的权威候选集。Capture 的 `TCP source port → PID → 用户可见应用` 是另一个问题，Windows 没有一个
同时覆盖 Win32、MSI、便携应用、MSIX、系统组件和后台进程的统一 API。

当前 helper 中 `GetExtendedTcpTable`、`QueryFullProcessImageName`、Toolhelp process snapshot、
`GetProcessTimes` 与 Shell icon API 都是公开稳定 API，应保留。较脆弱的是
`CollectPackagedApps()` 直接读取内部 AppModel Package Repository 注册表；候选迁移是
`PackageManager.FindPackagesForUser("")`：

- 好处：官方强类型 API、非默认 PackageVolume、package identity/version/status 语义更稳定；
- 当前用户范围是有意的：机器上仅 staged/provisioned、或只为其他用户注册的包不能以当前用户身份
	启动，不应成为当前用户进程的普通归属候选；
- 代价：SYSTEM/其他用户真正运行的 packaged process 不能仅靠当前用户清单识别；全用户
	`FindPackages()` 需要管理员权限，不应放进抓包热路径；
- 因此不能盲目一换一。实施前先比较“当前 registry 索引 vs FindPackagesForUser vs 实际运行 PID”三组，
	确认 Windows App、AAD Broker、SystemApps、WebView2 祖先与 packaged services 的行为。

Win32 仍需组合 Uninstall、App Paths、开始菜单与 exe version resource；所谓“权威开源完整 app list”
最终也只是封装这些来源，不会消除 Windows 安装模型的多样性。

#### 实施结果与验收

1. Settings 已实现 AppContainer access 与 TLS passthrough 两组独立界面；TLS host 直接保存，有有效差异时显示重启提示。
2. AppContainer helper 已使用官方 API 枚举与修改 exemption，并以 read-modify-write + reread verify
	保留其他工具写入的 SID。
3. TLS passthrough patterns 已持久化并接入 Mockttp；本地 TLS origin 已验证指定 host 仅产生 tunnel
	metadata，其他 host 继续 MITM。
4. TLS compatibility event、按 generation + host 去重、严格待重启判断和失败后重试提示均已接入。
5. system `*.wvd.microsoft.com` bypass 已删除；direct 与上游 CONNECT passthrough 均有自动化覆盖。
6. `FindPackagesForUser` 迁移仍是独立候选，不阻塞本功能。

剩余真实 Windows 验收矩阵至少包括：exemption off/on/off 的 WAM A/B/A、MITM off/on、用户确认加入
WVD passthrough、删除该项后的可诊断失败、普通浏览器仍可解密、无上游 direct、有上游 CONNECT、
App 退出/崩溃后 system proxy guarded restore，以及 package / artifact audit / packaged smoke。
