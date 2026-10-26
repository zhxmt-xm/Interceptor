> 返回 [Settings 索引](README.md)

### 3.4 上游代理：Windows WPAD

<a id="windows-wpad-research"></a>
#### Windows WPAD 实现与平台边界

**最小接入**

- 复用[Windows helper](../../../packages/platform-capabilities/src/system-proxy/windows/helper.cs)，新增只读`discover-wpad`命令。
  使用`WinHttpDetectAutoProxyConfigUrl(WINHTTP_AUTO_DETECT_TYPE_DHCP | WINHTTP_AUTO_DETECT_TYPE_DNS_A)`；
  Windows先尝试DHCP，没有发现URL再尝试DNS。成功仅返回`{ pacUrl: string }`，不下载或执行PAC，不写系统代理。
  C#按Unicode读取原生返回值，并用`GlobalFree`释放；不新增可执行文件、npm依赖或提权入口。
- WindowsSystemProxyService新增独立发现方法，Main的
  [SystemProxyService](../../../packages/platform-capabilities/src/system-proxy/entry.ts)仅增加Windows分派。
  对外继续使用PlatformCapabilitiesService现有上游API；macOS源码、既有执行分支、协议和测试不改，
  不为统一内部接口迁移macOS发现代码。Windows显式`wpad`、System仅Auto Detect、接管和Core代际同步
  使用同一条Windows发现链路，操作状态和Core应用复用现有业务。
- System仍从`readUpstreamSource()`取得接管前原配置，不从Interceptor已写入的8888反推上游。
  保留现有显式PAC和固定代理优先级；仅Auto Detect且无启用的显式代理/PAC时发现，
  把发现结果转换为临时`pac+<url>`运行配置并保留原bypass，不把发现URL写回WinINet或journal。
  偏好仍只保存`{ mode: 'wpad' }`或`{ mode: 'system' }`，重启重新发现，不持久化旧网络的发现URL。
- 发现URL复用[上游参数校验](../../../packages/core-protocol/src/upstream.ts)：仅HTTP/HTTPS、无内嵌凭据和fragment，
  再执行既有listener回环检查。Core继续下载、编译和逐请求选路；
  [现有命令](../../../apps/proxy-core/src/proxy-core/core-application.ts)在`upstream.applySettings`和
  `proxy.setUpstream`中都先预检PAC，前者验证成功后才保存偏好和切换路线。
  不用`WinHttpGetProxyForUrl`替换Core的PAC求值，不新增Renderer、Preload或Core命令。
- `WinHttpGetIEProxyConfigForCurrentUser`读取的是配置，不负责发现缺失的PAC URL，不能代替上述发现API；
  本项也不把当前默认LAN接管范围改成另一套active-connection配置来源。
  `DetectAutoProxyUrl`同样可以发现，但采用WinHTTP可复用其明确的Unicode、错误码及系统禁用策略契约，
  无需自己拼DNS搜索域、发送DHCP报文或解析注册表中的连接配置字节。

**与macOS的关系和分离**

- Main的`discoverPacUrl()`按平台分派：Windows使用原生WinHTTP，macOS通过
  `helperService.macosHelperServiceClient`调用`macos/discover-wpad.ts`。原生实现各自在所属平台目录维护。
- 对外统一指PlatformCapabilitiesService已有的`getUpstreamSettings()`与`applyUpstreamSettings()`等业务能力，
  不是强制两端改成新的内部接口。Windows新增`discoverWpadPacUrl(): Promise<string>`，
  既有公共平台代理interface不要求macOS实现新方法；现有Main模式、状态、通知和Core应用不复制。
  现有`WpadDiscoveryInfo { searchDomains, dhcpPacUrl }`虽定义在共用interfaces文件，实际仅服务macOS链路；
  它不是跨平台发现协议，Windows不必伪造这些字段，也不把它扩成大量可选平台字段的统一结构。

| 边界 | 共用什么 | Windows保留什么 | macOS保留什么 |
| --- | --- | --- | --- |
| 上游业务 | 五种mode、草稿/Apply语义、互斥、失败保持、状态通知、Core代际同步 | 不复制第二套业务Service | 不复制第二套业务Service |
| WPAD发现 | 有效PAC URL或明确错误；后续校验与Core应用 | WinHTTP执行DHCP/DNS发现，遵守Windows策略 | Swift读取主网络缓存的DHCP 252及搜索域；TS优先缓存URL，否则用系统resolver查询已有搜索域，不主动请求DHCP租约、不向公共父域递推 |
| System原配置 | owned后不能读取8888作为原上游 | 默认LAN的WinINet六字段快照 | 所有活动network service原快照负责恢复，接管前`effectiveProxies`负责上游；系统已提供自动PAC URL时直接使用 |
| 路由与bypass | Core接受既有`UpstreamProxyConfig`并实际选路 | `proxyUrl`与`noProxy`及既有转换规则 | `httpProxyUrl`/`httpsProxyUrl`、`exceptions`和`excludeSimpleHostnames`；不能压成Windows的单一代理和近似bypass |
| helper与超时 | 调用期间占用同一业务操作，失败明确收尾 | 同包C#短生命周期进程；发现超时只结束本次只读子进程 | 既有Swift常驻服务、socket鉴权和DNS查询期限；不能把Windows超时处理套成停止常驻服务 |
| journal与恢复 | 比较current/original/owned，外部改写后不覆盖 | 既有version/original/owned、路径和WinINet恢复 | 既有original/owned/effectiveProxies、路径和多service条件写入；失联写入仍按原requestId确认，不简化uncertain状态 |

- macOS的两条入口须保持区别：显式WPAD总是走其发现逻辑；System优先使用接管前系统生效字典，
  仅Auto Detect且没有已启用PAC/固定代理时才补发现。不能为了和Windows一致，强制System重新走DHCP/DNS，
  丢掉系统已经提供的`http://wpad/wpad.dat`，或把发现结果当作需写回的原网络配置。
- 原生发现算法不承诺逐步一致。macOS只试其提供的搜索域；WinHTTP的接口选择、DNS搜索及缓存由Windows管理，
  不能套用macOS测试来宣称Windows也具有同样的搜索域约束。共同验收的是所选PAC和实际路线正确，
  平台策略及网络报文各自取证。
- 测试按平台责任分开：Windows覆盖WinHTTP发现、Win32错误、进程超时、失败保持、通知和代际同步；
  macOS覆盖DHCP缓存与DNS输入。
  现有macOS专属测试不能通过移除`runIf`或复制整份workflow冒充Windows覆盖；
  共用用户步骤可复用，网络准备、原生读取和退出恢复仍由各自driver/实验环境负责。

**必须一起处理的边界**

- Windows 7及以后，helper读取连接类型使用`INTERNET_PER_CONN_FLAGS_UI`，
  恢复使用`INTERNET_PER_CONN_FLAGS`；六字段快照和journal格式保持一致。
- WinHTTP发现是同步阻塞调用，不能放在Main线程内直接执行。现有`execFile`已隔离到helper，
  Windows新发现命令使用专用`execFile`调用，期限30秒、输出上限64KiB；
  超时后确认本次helper子进程退出再释放操作占用；
  不能只用`Promise.race`留下仍运行的helper，也不能全局改变其他平台写操作的超时和恢复语义。
- 原生失败保留可机器判定的Win32错误码；`ERROR_WINHTTP_AUTODETECTION_FAILED`映射为发现失败，
  其他原生错误、超时和PAC获取/编译错误分别明确报告。不能解析本地化错误文案来分类，
  也不能把任意失败转换为空URL、成功或`proxy.setUpstream(null)`。
  `discover-wpad`成功退出0并在stdout返回`{ pacUrl: string }`；原生发现失败退出1并在stderr返回
  `{ win32Error: integer }`，其中`12180`映射为`WpadNotFoundError`。既有`get/set`契约不变。
- 尊重Windows的`WinHttp\DisableWpad`配置。WinHTTP失败后不自行改用Node DNS/DHCP绕过禁用，
  不自动改注册表、启停系统服务或调整网卡。
- 沿用当前失败约定：显式WPAD和System发现失败均不自动Direct；Apply失败保留旧偏好和旧路线，
  接管前失败不得写系统代理。启用Auto Detect但未部署WPAD的网络也会遇到错误，
  可能阻止自动接管；允许这种System场景回退Direct属于另一个需明确确认的行为变更，本次不改。
- WPAD在Apply、Enable和Core同步时发现，不进行后台网络监听、周期重发现或静默重试。

**Windows验收**

Windows WPAD验收需要获准的隔离网络及恢复保护。网络环境提供DNS、真实DHCP 252、HTTP PAC和报文采集，
不桥接日常局域网；以下场景都从真实Electron UI操作，不以手填PAC替代WPAD。

| 场景 | 前提与关键证据 |
| --- | --- |
| DNS发现 | 不提供DHCP 252；专用搜索域的`wpad`记录和HTTP 80 `/wpad.dat`可用；保留真实DNS查询、PAC获取及PROXY/DIRECT流量 |
| DHCP发现 | 实际DHCP响应提供Option 252，DNS WPAD不可用；保留含252的报文、所选URL、PAC请求与Core实际选路，不能只检查服务端配置 |
| DHCP优先级 | DHCP和DNS提供不同PAC URL及可区分路线，证明使用DHCP；API只返回URL，不能凭调用参数宣称发现来源 |
| System仅Auto Detect | 无启用的显式代理/PAC；核对原始flags、发现结果、两个UI入口和实际上游，不将owned的8888或测试手填URL当作原配置 |
| 失败保持 | 无WPAD、发现超时、PAC不可达和原生失败按所属层验证；已有Manual路线不变，接管失败无系统写入，操作最终解除占用 |
| 重启与恢复 | 同profile回载WPAD、跨profile加载原journal后重新发现、Core重新应用路线；正常Close后核对Main/Core/Worker/helper退出、8888、完整WinINet及实验网络恢复 |

- Windows业务unit/integration与负向workflow规格先取得前置Red，后实现并复跑同组Green；
  正向网络workflow在隔离环境就绪后运行，不补造不存在的正向历史Red。
  [现有Main上游测试](../../../packages/platform-capabilities/src/system-proxy/tests/unit/upstream-settings.test.ts)和
  [现有上游workflow](../../../apps/desktop/tests/e2e-workflow-tests/workflows/settings/upstream-settings.workflow.ts)
  仍限定macOS；不能移除平台保护便宣称已有Windows覆盖。
  纯转换器在没有URL时仍返回`null`，Main现在先通过Windows发现与解析入口准备URL再调用转换器；
  Windows测试覆盖完整链路，不把纯转换器改成网络客户端。
官方依据：
[WinHttpDetectAutoProxyConfigUrl](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpdetectautoproxyconfigurl)、
[DetectAutoProxyUrl](https://learn.microsoft.com/en-us/windows/win32/api/wininet/nf-wininet-detectautoproxyurl)、
[WinHttpGetIEProxyConfigForCurrentUser](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpgetieproxyconfigforcurrentuser)、
[WinINet连接flags读写](https://learn.microsoft.com/en-us/windows/win32/api/wininet/ns-wininet-internet_per_conn_optionw)、
[Windows禁用WPAD](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/disable-http-proxy-auth-features)。
