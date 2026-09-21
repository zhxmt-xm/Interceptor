# Main Platform Capabilities

Desktop Main 的平台能力模块。先在 Main 内聚合现有代码和测试，再继续开发 macOS helper；独立 package 的搬迁仍后置，当前本地骨架不属于本阶段提交，见 [Handover](../../../../../architecture/HANDOVER.md)。

## 当前入口

[entry.ts](entry.ts) 定义 `PlatformCapabilitiesService`，集中创建系统代理、系统信任库及 AppContainer 的唯一实例。创建对象不读写系统代理、安装服务或触发授权。

- `systemProxyService`：保持现有 `status / enable / restore / recoverAfterCrash / detectedUpstream` 契约。
- `trustStoreService`：保留 `supported / install / uninstall / isTrusted`，平台原生命令分别位于 Windows/macOS 目录。
- `appContainerService`：保留已有 Windows Network Isolation 行为；macOS 明确不支持，不执行伪造的成功写入。
- `getSupportedCapabilities()`：返回已实现的能力，不随 helper 是否已构建或安装而改变；supported 不是 ready、owned 或 authorized。
- `prepareNativeComponents()`：Main启动时在代理恢复/接管前调用。Windows不增加授权步骤；macOS按Main传入的真实`app.isPackaged`选择生产/开发入口，检查本次配套helper与对应授权，完成后确认服务和客户端写资格。默认严格生产入口，失败不回退到开发。
- Main/CoreRuntime 从同一入口取得客户端应用 helper 的定位函数，原生资源根目录由调用方传入，本目录不导入 Electron。

| 平台 | 当前支持列表 |
| --- | --- |
| Windows | `system-proxy`、`certificate-trust`、`connection-owner`、`application-icon`、`app-container` |
| macOS | `system-proxy`、`certificate-trust` |

macOS 连接归属、图标尚未实现。生效上游检测与基础链式转发已接入，外部改写及特殊网络验收仍按原任务跟踪。

## 结构

```text
platform-capabilities/
  entry.ts
  interfaces/index.ts
  internal/
    errors.ts
    command-runners.ts
    elevated-runner.ts
    client-app.ts
    trust-store-service.ts
    operation-queue.ts
    upstream-probe.ts
    upstream.ts                共享上游摘要与探活目标
  windows/
    system-proxy/              WinINet、journal、上游转换、原生 helper 及测试
    trust-store/entry.ts        Windows certutil 实现
    app-container/             Network Isolation 原生实现及测试
    client-app/                Windows 应用信息/图标原生 helper
  macos/
    helper-client.ts            常驻协议与固定前台trust命令客户端
    utils.ts                    响应校验与共用快照解析
    installation/               首次启动helper部署、原生授权及所属测试
    system-proxy/              SystemConfiguration、journal、原生 helper 及测试
    trust-store/entry.ts        证书安装/卸载业务编排与只读信任检查
    trust-store/native-certificates.swift  原生证书库与前台admin trust操作
  tests/
    unit/
    integration/
```

[interfaces/index.ts](interfaces/index.ts) 集中已归入的平台DTO；CA类型与`SecureStore`仍待从Main interfaces整理。
[internal/errors.ts](internal/errors.ts) 集中 `SystemProxyError`、`SystemProxyJournalError`、`TrustStoreError`、`AppContainerError`，当前保留原类名、错误消息和 `instanceof` 语义，未借重构改变既有失败处理。

## 业务边界

- Main 仍负责 listener/Core 生命周期、退出顺序、用户审批、IPC/MCP/Agent 共用业务方法和状态广播。
- `SystemProxyOperationQueue` 的实例仍由 Main 持有；文件聚合不意味着平台层另起一套退出或恢复编排。
- Windows/macOS 的 original、owned、current 比较、journal 位置及回读检查保持。普通 Windows 代理操作不引入服务或新授权步骤。
- CA生成与加密存取由`CertificateService`在Main进程执行；本地证书目录迁移及统一入口整理不纳入本次中间提交。特权helper只接公开证书，不接收私钥。
- Core 的应用归属缓存、Capture 事件和关联逻辑继续留在 [Core ClientAppService](../../../../proxy-core/src/proxy-core/client-app/entry.ts)。
- Renderer 仍通过 Preload 调用 Main，不能导入本模块或直接调用 native helper。

### 谁执行

- Main：编排安装/撤销、代理接管/恢复、Core配置和状态通知；`CertificateService`在Main生成CA、用`safeStorage`加密私钥，私钥只交Core内存签发叶证书，不交helper。
- macOS常驻root helper：读写系统代理，向System.keychain导入/删除精确公开CA。没有trust/untrust socket命令，不修改授权规则。
- macOS前台helper：同一个已安装二进制，以登录用户身份执行`certificate.trust/untrust`；Security框架请求系统确认。它不是常驻root服务，也不复用安装helper时的管理员批准。
- macOS部署入口：同包helper请求系统确认，获准的固定root操作负责安装、更新、卸载组件；不属于日常代理命令或证书信任授权。
- Windows平台实现：WinINet由一次性native helper读写；证书由提权`certutil`操作Local Machine Root；AppContainer使用已有原生实现。没有macOS式常驻服务，不改变现行命令和授权步骤。
- Core：监听、转发、MITM及叶证书签发；不改系统代理/系统信任，不管理helper部署或恢复journal。

### profile外状态：当前可复用

- 操作系统代理配置：两端都在OS，不在profile。Windows为当前用户WinINet；macOS为系统network service配置。每次接管仍需读取现状，不能把上一次快照永久当作当前值。
- 系统CA与信任：Windows Local Machine Root、macOS System.keychain/admin trust都在OS；同一张CA的系统信任不因切profile消失。产品按精确指纹重新查询，不缓存一个跨profile的`trusted=true`。
- macOS组件与批准：helper、launchd、socket和生产/开发配置在`/Library`固定位置。开发按获准UID复用；生产App身份或helper字节改变仍可能需要更新批准，与profile无关。
- Windows恢复journal：`%LOCALAPPDATA%/Interceptor/system-proxy/journal.json`为用户级固定路径。它是待恢复的临时状态，不是永久保持代理接管的配置。
- 两端随App交付的native程序属于安装资源，不复制到各profile。

### profile内状态：两端业务隔离一致

- `storage/workspace.sqlite`：规则、Composer集合、TLS名单与MITM意图；同profile持久，fresh profile独立。
- `agent/`、`mcp/`、`tool-capabilities/`：业务配置、会话、凭据和Tool授权；凭据仍加密，不能为了复用helper而共享这些目录。
- Renderer偏好、窗口/session状态、更新状态与诊断数据：跟随当前profile。Capture内存和spill属于当前Core代际，不是跨profile复用的数据。

### 当前差距与必要差异

- macOS恢复journal仍在`userData/system-proxy/journal.json`；不同profile找不到上一profile的恢复记录，与Windows用户级路径不一致。当前仅验证同profile崩溃恢复；这是待修差距，本轮未移动路径。
- CA材料当前两端都在`userData/certificates`，不是macOS特有差异。`root-cert.pem`、加密`root-key.enc`、`ca-meta.json`还没有独立于profile的存储；本机同一OS账户长期复用CA是待确认目标，不是已实现能力，也不是给所有用户分发同一私钥。
- macOS缺`connection-owner`、`application-icon`；AppContainer仅适用于Windows，不为macOS提供伪实现。
- macOS证书View只确认启动Keychain Access，尚未验证目标证书窗口；Finder Reveal通过不能替代View。
- WinINet与SystemConfiguration、UAC与macOS系统确认、DPAPI与Keychain是必要原生差异。macOS保存完整service快照和接管前生效上游，按HTTP/HTTPS分别下发；Windows保留原单一上游结构及journal版本，不为形式一致改Windows。
- 仅Auto Detect的上游行为仍不同：Windows现行直连，macOS无显式代理/PAC时拒绝接管，不能宣称WPAD双端一致或已验。

### 聚合与迁移状态

- 已归类：两端系统代理、系统信任库、macOS组件部署与通信、Windows应用信息/图标和AppContainer；目录归类不等于两端全部验收完成。
- 仅本地暂停：CA实现/错误类/9项integration的目录迁移，private package骨架及lockfile；不纳入本轮提交。
- 待整理：CA统一入口/类型、`SecureStore`窄契约、Core原生runner/输出解析、Main中的PEM转CER及系统查看器/管理器选择。
- Main继续拥有操作顺序、`SystemProxyOperationQueue`、上游降级策略和状态广播；`UpstreamProbe`只提供事实，Core保留应用归属缓存与事件。
- Electron的窗口、Dialog、clipboard、`safeStorage`、`shell`适配和各feature凭据格式不搬进root helper。独立package接入、依赖和发布后置，不反向依赖Desktop。

## 原生构建与资源

Desktop 的 `build:native` 已指向本目录，构建结果仍写入原来的 Desktop `dist/system-proxy`、`dist/app-container` 和 `dist/client-app`。Forge 资源目录、helper 文件名、Core fork 参数及运行时资源路径均不因迁移改变。

macOS原生构建使用固定`com.zhxmt.interceptor.platform-capabilities`签名identifier、Hardened Runtime和空entitlements；本地Forge打包使用相同参数，保证同一组件的CDHash与字节一致。缓存按Swift源码、编译器/SDK、架构、部署目标、签名参数和产物SHA-256检查，业务Main/Renderer改动不会重建helper。缓存保存在Desktop `dist`根，不进入随包`system-proxy`目录。Developer ID构建仍使用正式身份与时间戳，不冒充ad-hoc开发身份。

```sh
npm run build:native --workspace @interceptor/desktop
npm run typecheck --workspace @interceptor/desktop
npm run test --workspace @interceptor/desktop -- src/main/platform-capabilities src/main/certificates/tests
```

原生 Windows 测试必须在 Windows 运行；Mac 上的 skip 不计通过。真实 Electron E2E 和 packaged smoke 继续使用原产品操作和独立宿主恢复 guard，不能用本模块测试代替。

原生集成可直接复验完整App内已经签名的helper。下面的环境变量仅由测试读取，不是产品参数，也不替换E2E中的helper；测试仍禁止root且不写系统设置。在仓库根执行：

```sh
INTERCEPTOR_NATIVE_SERVICE_HELPER_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app/Contents/Resources/system-proxy/macos-proxy-helper" npm run test --workspace @interceptor/desktop -- src/main/platform-capabilities/macos/system-proxy/tests/integration/native-service.test.ts
```

## macOS 服务协议

[macos/system-proxy/native-service.swift](macos/system-proxy/native-service.swift)的`serve`入口由launchd管理。Main通过[macos/helper-client.ts](macos/helper-client.ts)调用固定命令：

| 命令 | 参数 | 结果 |
| --- | --- | --- |
| `status` | 无 | processId、privileged、clientAuthorizedForWrites、capabilities |
| `system-proxy.read` | 无 | 全部活动network service的完整快照 |
| `system-proxy.read-effective` | 无 | `SCDynamicStoreCopyProxies`返回的系统生效代理字典 |
| `system-proxy.replace` | expectedSnapshot、replacementSnapshot | 条件写入并回读后的完整快照 |
| `certificate.import` | 公开DER的base64、SHA-256 | 精确指纹及present=true |
| `certificate.remove` | 同一公开DER及SHA-256 | 精确指纹及present=false |

- 同一服务进程按独立受保护配置提供两个Unix socket。生产`service.sock`每个连接核验内核peer audit token、UID、精确CDHash及canonical可执行路径；开发`development.sock`只核验内核UID，不绑定源码、项目目录、Electron签名或调试状态。协议不接受客户端自报环境切换鉴权。
- 生产`status`写资格与所有写命令另外验证完整App资源、内嵌代码、全部架构和Hardened Runtime，拒绝可调试或可注入进程；普通公开代理读取不重复扫描整包资源。开发允许获准用户的本地代码调用固定能力，不保证隔离同用户恶意程序。App可以由用户拥有，不要求root拥有或移动整个App。
- 严格校验字段、版本和256KiB单帧边界。代理条件写在同一SystemConfiguration事务中比对完整expected，冲突不覆盖外部修改；journal和退出恢复仍归Main。
- 生效代理读取与恢复快照分开；macOS journal只存`original/owned/effectiveProxies`，无版本或兼容读取。Core接收HTTP/HTTPS路由和原绕过规则；ClashX基础转发与开发入口恢复已有E2E Green，特殊网络及上游异常仍待联调。
- 常驻服务只操作固定System.keychain，精确匹配公开DER，不接收CA私钥；Keychain读写禁止弹交互窗口。Main保留CA生成/safeStorage及安装/回滚编排，导入不等于受信任。
- 服务正常结束清除自己的socket；崩溃重启只清理归属正确、ECONNREFUSED且inode未变的残留端点，快速断连不会以SIGPIPE终止服务。
- 开发与生产使用同一套命令/参数校验/条件写入，授权不同不增加通用执行或任意文件访问能力。普通用户原生集成验证两入口的准入、拒绝和非root写入失败，不替代真实App、系统授权和恢复验收，最新结果见[Handover](../../../../../architecture/HANDOVER.md)。

### 前台证书信任入口

Main通过`MacosHelperServiceClient.trustCertificate()`/`untrustCertificate()`直接启动同一已部署helper的固定前台CLI，不先请求常驻服务。只接收`{ certificate: <公开DER base64>, sha256: <大写SHA-256> }`，限制256KiB输入、64KiB DER，不接受路径、私钥、shell或调用方指定的trust域；返回`{ sha256, trusted }`并由客户端核验。

前台helper只在当前登录用户GUI会话中执行，激活自身后调用Security公开API修改`.admin`并回读。它不具备常驻服务的root权限，系统确认由Security框架负责；Main不执行`security add-trusted-cert/remove-trusted-cert`、不请求原生提权、不接触密码。取消以`authorization-cancelled`返回，Main仅撤回本次新增CA；已有CA保留，撤销trust失败时不删系统证书。

证书写入结果不确定返回`certificate-state-uncertain`；子进程异常、无效回复或回读失败不重试授信。Main保留公开CA及本地材料，不能把不确定结果当成“证书一定未写入”而盲删。

不能把安装helper的授权等同于修改admin trust的授权。本机SIP开启时root授信返回`-60007`，真实root修改授权规则另返回`-60005`。已按用户要求删除临时规则写入、恢复记录、启动/卸载恢复以及后台trust/untrust；不为旧macOS保留兼容分支，不关闭SIP、使用私有entitlement或改成user trust。历史实验与本轮验证范围见[验证记录](../../../../../architecture/HANDOVER.md#verification)。

## 首次启动部署

[macos/installation/helper-deployment.ts](macos/installation/helper-deployment.ts)是Main启动时的组件准备入口；[macos/installation/native-installation.swift](macos/installation/native-installation.swift)负责固定部署动作。

1. 通过本次构建的helper检查`missing / outdated / ready / stopped / invalid`。生产比较App构建、UID、路径和helper身份；开发只比较已核准UID和helper自身身份，不比较App构建或profile。ready直接复用；invalid、stopped或未知状态报错，不静默覆盖。
2. 缺失或配套身份改变时，生产调用固定`request-installation`并核验App/同包helper；开发调用`request-development-installation`，先将同一helper暂存到当前用户系统临时目录（0700，文件0500），结束后无论成功/取消均删除。后者避免authd拒绝读取Desktop源码目录中的代码身份。两者激活请求方后调用系统管理员确认，不模拟键鼠或读取密码。
3. 获准后仅复制单个helper到root私有暂存目录，精确验签，再部署到`/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities`（0555）。配置与用户专用socket位于`/Library/Application Support/Interceptor/PlatformHelper/`，launchd配置为`/Library/LaunchDaemons/com.zhxmt.interceptor.platform-capabilities.plist`。
4. 配置和父目录归root且不可被其他用户写入；生产`service.json`记录App路径、UID和核准CDHash，开发`development.json`只记录`protocolVersion / socketPath / clientUserId`。配置0644，socket0600仅归核准用户。新增入口保留另一份授权；代理仍指向本机8888时拒绝替换服务。部署失败恢复旧组件，不复制App、不创建启动链接/pkg收据、不下载或单独更新helper。
5. Main再次核对组件就绪和真实写资格后进入原来的代理恢复、listener启动与自动接管。组件授权取消不重试；admin trust需要交互时由上述前台helper入口发起独立系统确认，不由Main另起security写命令。

开发启动、HMR、rs和业务E2E共用开发授权，不因业务代码重编译或切换profile重复核准。生产App构建改变仍需核准新身份，不能靠开发授权放行生产socket。业务workflow默认以未打包Electron+Renderer CDP执行；显式选择签名App和packaged smoke仍验证生产入口。Windows原生路径不变。

组件需要卸载时，先通过App清理本次CA/trust、正常退出并确认代理恢复，再由用户在本机Terminal执行：

```sh
sudo '/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities' uninstall-helper
```

该命令只清理固定helper、配置、socket和launchd，不删除App、profile或证书，不能代替业务恢复。卸载及失败恢复的最终验收仍以Handover记录为准；没有额外`.pkg`安装步骤。