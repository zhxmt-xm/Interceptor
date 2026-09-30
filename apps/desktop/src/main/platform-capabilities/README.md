# Main Platform Capabilities

Desktop Main的平台能力模块，负责系统代理、证书、AppContainer、客户端应用和原生helper；独立package的迁移范围见[Handover](../../../../../architecture/HANDOVER.md)。

## 当前入口

[entry.ts](entry.ts)定义`PlatformCapabilitiesService`，私有组合Certificate、System Proxy、AppContainer、Client App和helper唯一实例。Main在成员声明处创建一个readonly平台对象，直接调用方法并接收结果/error和状态通知，不使用require/getter检查层，也不持有子service。构造仅组装对象；窗口显示后才调用`prepare()`开始原生操作。CoreRuntime、MainDiagnostics、safeStorage和Electron shell适配由Main注入，平台流程留在所属entry class。

- 证书公开方法：`getCertificateInfo / generateCertificate / installCertificate / uninstallCertificate / deleteCertificate / revealCertificate / viewCertificate / openCertificateManager`；唯一内部CertificateService管理材料、TrustStore、MITM意图与Core同步。Windows DER/PEM与macOS前台helper保持各自实现。
- 系统代理公开方法：`getSystemProxyStatus / enableSystemProxy / restoreSystemProxy`；内部SystemProxyService拥有listener检查、操作状态、journal、Core upstream同步和探活。
- AppContainer公开方法：`listAppContainers / enableAppContainer / disableAppContainer / enableAllAppContainers / disableAllAppContainers`；内部单项/批量写入共用同组互斥，保留Windows Network Isolation与UAC命令，macOS明确不支持。
- `getSupportedCapabilities()`：按业务module名称返回支持列表，不把Trust Store、连接归属或图标拆成平级capability；helper是内部执行设施，不列为业务能力。supported不随helper是否已构建或安装改变，也不是ready、owned或authorized。
- `prepare()`顺序完成helper组件检查、异常退出journal读取和共享CA准备；helper准备忙时不能重复调用或退出。Windows不增加授权步骤，macOS按真实`app.isPackaged`选择生产/开发入口，失败不回退到开发。
- 生产`deployment-status`只做部署发现：校验应用身份、Hardened Runtime/entitlements及所有架构的主可执行文件，再核对受保护组件、配置和socket；不重复扫描bundle资源。此结果不授权写入，`HelperService.prepare()`随后必须取得服务端完整App准入；`inspect-application`、请求安装和root安装仍使用完整资源/内嵌代码校验，不缓存信任或改变30秒请求期限。
- 生产socket的完整资源校验由常驻服务启动同一受保护helper的短生命周期`verify-code-signature <absolute-code-path> <cdhash-requirement>`子进程；路径取自已认证的SecCode，requirement取自受保护配置，不接收socket payload中的路径或校验结果。子进程执行原Security API的身份、strict、nested、all-architectures及no-network检查，正常退出0后服务才继续；身份/运行时保护、系统写入和结束记录仍由常驻服务负责。该只读CLI不开放为socket命令，不缓存任何验证结果，用进程隔离避免长期分配历史拖慢大可执行文件校验。
- `synchronizeCore / updateCoreProcessStatus / assertCanQuit / stop`封装平台相关生命周期；Main只调用，不实现恢复去重、Core配置或module忙状态。
- `getClientAppIcons / loadClientAppIcons`由[client-app/entry.ts](client-app/entry.ts)的ClientAppService管理真实缓存及helper读取；CoreRuntime仍复用无状态`resolveClientAppHelperPath`。Main只转发图标通知，本目录不导入Electron运行时。
- 平台业务API不接收AbortSignal。Agent/MCP在调用前检查取消，已开始操作必须完成或失败收尾；原生超时/断线不直接证明操作结束。用户冲突立即报错，不排队、不重放。
- 已发送socket写入失去终态回复时，客户端只查询原requestId的结束记录；匹配原ID和操作后，仍返回原错误，由所属module回读或回滚再释放占用。普通status不作为证明，缺记录或确认失败保持unknown，也不重发写入。

| 平台 | 当前支持列表 |
| --- | --- |
| Windows | `system-proxy`、`certificates`、`client-app`、`app-container` |
| macOS | `system-proxy`、`certificates` |

macOS 连接归属、图标尚未实现。生效上游检测与基础链式转发已接入，外部改写及特殊网络验收仍按原任务跟踪。

## 结构

```text
platform-capabilities/
  entry.ts
  interfaces/index.ts
  internal/
    command-runners.ts          shared run / runElevated，sudo-prompt仅按需加载
  certificates/
    entry.ts                    CertificateService：材料与信任唯一入口
    interfaces/
    internal/                   既有TrustStore分派和errors
    windows/                    certutil
    macos/                      helper信任调用、native-certificates.swift
    tests/
  system-proxy/
    entry.ts                    SystemProxyService：平台选择与业务入口
    interfaces/
    internal/                   upstream、probe、errors；无操作queue
    windows/                    WinINet、journal、native helper及tests
    macos/                      SystemConfiguration、journal及tests
    tests/
  app-container/
    entry.ts                    AppContainerService
    interfaces/
    internal/errors.ts
    windows/                    Network Isolation native helper/build
    tests/
  client-app/
    entry.ts                    ClientAppService图标缓存及无状态helper定位
    windows/                    应用图标、helper定位及native build
  helper/
    entry.ts                    HelperService：组件准备与调用资格
    interfaces/
    macos/
      helper-client.ts
      utils.ts
      internal/errors.ts
      installation/             既有部署实现与tests
      native/                   helper入口、transport/authentication、build
    tests/
  tests/unit/                   平台组合契约
```

[interfaces/index.ts](interfaces/index.ts)只保留平台组装与shared execution/`SecureStore`契约，业务DTO归各module的`interfaces/`。errors已按module归位，类名、错误消息和`instanceof`语义保持；根级混合errors和独立elevated-runner已删除，不保留旧路径转发。

`commandRunner.run()`使用`execFile`，`runElevated()`使用现有Windows UAC路径；Certificate与AppContainer复用同一个elevation实现，AppContainer的8MiB输出上限保持。macOS系统写入仍交native helper，不因runner合并转向sudo-prompt。state默认保存在所属entry class的private property，局部逻辑用private method；不新增独立state/manager/lifecycle文件。

## 业务边界

- Main负责App/Core生命周期、用户审批、IPC安全、通知和error显示；平台业务只通过一个PlatformCapabilitiesService对象调用。
- Certificate/SystemProxy/Core同步、upstream探活、必要恢复和各组互斥属于平台module。SystemProxyOperationQueue已删除，必要失败恢复只等待已开始操作，不缓存用户命令。
- Windows/macOS 的 original、owned、current 比较及回读检查保持；macOS journal已改用户级目录，Windows原路径不变。普通Windows代理操作不引入服务或新授权步骤。
- CA生成与加密存取由`CertificateService`在Main进程执行，类型归平台模块；特权helper只接公开证书，不接收私钥。共享目录不随profile切换，现有证书命令作用于共享材料，普通退出不删。
- Core 的应用归属缓存、Capture 事件和关联逻辑继续留在 [Core ClientAppService](../../../../proxy-core/src/proxy-core/client-app/entry.ts)。
- Renderer 仍通过 Preload 调用 Main，不能导入本模块或直接调用 native helper。

### 谁执行

- Main：调用平台启动/退出入口并转发通知；平台module在Main进程执行。CertificateService生成CA、用safeStorage加密私钥，通过内部TrustStore完成安装/撤销/删除并同步Core；私钥只交Core内存签发叶证书，不交helper。
- macOS常驻root helper：读写系统代理，向System.keychain导入/删除精确公开CA。没有trust/untrust socket命令，不修改授权规则。
- macOS前台helper：同一个已安装二进制，以登录用户身份执行`certificate.trust/untrust`；Security框架请求系统确认。`certificate.view`另用SecurityInterface的`SFCertificatePanel`只读显示公开DER，关闭信任编辑；真实窗口显示且控件证书字节匹配后回复`{ sha256, opened: true }`，关闭或调用App退出时结束前台进程。后台root socket不开放View，参数不接受路径/私钥。
- macOS部署入口：同包helper请求系统确认，获准的固定root操作负责安装、更新、卸载组件；不属于日常代理命令或证书信任授权。
- Windows平台实现：WinINet由一次性native helper读写；证书由提权`certutil`操作Local Machine Root；AppContainer使用已有原生实现。没有macOS式常驻服务，不改变现行命令和授权步骤。
- Core：监听、转发、MITM及叶证书签发；不改系统代理/系统信任，不管理helper部署或恢复journal。

### profile外状态：当前可复用

- 操作系统代理配置：两端都在OS，不在profile。Windows为当前用户WinINet；macOS为系统network service配置。每次接管仍需读取现状，不能把上一次快照永久当作当前值。
- 系统CA与信任：Windows Local Machine Root、macOS System.keychain/admin trust都在OS；同一张CA的系统信任不因切profile消失。产品按精确指纹重新查询，不缓存一个跨profile的`trusted=true`。
- macOS组件与批准：helper、launchd、socket和生产/开发配置在`/Library`固定位置。开发按获准UID复用；生产App身份或helper字节改变仍可能需要更新批准，与profile无关。
- Windows恢复journal：`%LOCALAPPDATA%/Interceptor/system-proxy/journal.json`为用户级固定路径。它是待恢复的临时状态，不是永久保持代理接管的配置。
- macOS恢复journal：`~/Library/Application Support/Interceptor Platform/system-proxy/journal.json`；不放进默认Interceptor profile，格式仍为`original/owned/effectiveProxies`。
- 共享CA材料：Windows `%LOCALAPPDATA%/Interceptor/certificates`，macOS `~/Library/Application Support/Interceptor Platform/certificates`；同OS用户的开发/生产/fresh profile共用，safeStorage密文私钥不分发给其他用户。
- 两端随App交付的native程序属于安装资源，不复制到各profile。

### profile内状态：两端业务隔离一致

- `storage/workspace.sqlite`：规则、Composer集合、TLS名单与MITM意图；同profile持久，fresh profile独立。
- `agent/`、`mcp/`、`tool-capabilities/`：业务配置、会话、凭据和Tool授权；凭据仍加密，不能为了复用helper而共享这些目录。
- Renderer偏好、窗口/session状态、更新状态与诊断数据：跟随当前profile。Capture内存和spill属于当前Core代际，不是跨profile复用的数据。

### 当前差距与必要差异

- CA原profile材料不迁移、不回退读取。共享材料残缺、损坏、过期、指纹或密钥不匹配时保留并报错；只在全部材料不存在时生成，信任就绪后不写文件或重复授信。
- macOS尚不支持`client-app`，即本机连接归属与应用图标；AppContainer仅适用于Windows，不为macOS提供伪实现。
- macOS证书View使用只读系统面板显示目标证书；Finder识别系统返回的已知路径引号，不依赖列表模式，复用窗口不关闭用户已有窗口。
- WinINet与SystemConfiguration、UAC与macOS系统确认、DPAPI与Keychain是必要原生差异。macOS保存完整service快照和接管前生效上游，按HTTP/HTTPS分别下发；Windows保留原单一上游结构及journal版本，不为形式一致改Windows。
- 仅Auto Detect的上游行为仍不同：Windows现行直连，macOS无显式代理/PAC时拒绝接管，不能宣称WPAD双端一致或已验。

### 聚合与迁移状态

- 已归类：两端系统代理、系统信任库、macOS组件部署与通信、Windows应用信息/图标和AppContainer；目录归类不等于两端全部验收完成。
- CA材料、错误类型、测试及SecureStore契约属于Main平台模块；private package未接入运行时。
- 当前模块状态：Certificate/SystemProxy/AppContainer/helper准备各自持有private operation state，ApplicationActionGate平台表与旧queue已删除。Main进程内的HelperService只协调共享原生授权资源；Certificate与AppContainer不能同时发起授权，不需要该资源的SystemProxy操作仍可执行。native helper本身不保存这些业务状态。已确认结束的失败、未知写入与只读请求分别处理，最新真实验收与尚未确认结束的写入限制见下节及Handover。
- SystemProxyService拥有上游降级策略并使用UpstreamProbe；ClientAppService拥有Main侧图标缓存，Core继续保留应用归属缓存与事件。
- Electron的窗口、Dialog、clipboard、`safeStorage`、`shell`适配和各feature凭据格式不搬进root helper。独立package接入、依赖和发布后置，不反向依赖Desktop。

## 原生构建与资源

Desktop 的 `build:native` 已指向本目录，构建结果仍写入原来的 Desktop `dist/system-proxy`、`dist/app-container` 和 `dist/client-app`。Forge 资源目录、helper 文件名、Core fork 参数及运行时资源路径均不因迁移改变。

macOS原生构建使用固定`com.zhxmt.interceptor.platform-capabilities`签名identifier、Hardened Runtime和空entitlements；本地Forge打包使用相同参数，保证同一组件的CDHash与字节一致。缓存按Swift源码、编译器/SDK、架构、部署目标、签名参数和产物SHA-256检查，业务Main/Renderer改动不会重建helper。缓存保存在Desktop `dist`根，不进入随包`system-proxy`目录。Developer ID构建仍使用正式身份与时间戳，不冒充ad-hoc开发身份。

```sh
npm run build:native --workspace @interceptor/desktop
npm run typecheck --workspace @interceptor/desktop
npm run test --workspace @interceptor/desktop -- src/main/platform-capabilities
```

原生 Windows 测试必须在 Windows 运行；Mac 上的 skip 不计通过。真实 Electron E2E 和 packaged smoke 继续使用原产品操作和独立宿主恢复 guard，不能用本模块测试代替。

原生集成可直接复验完整App内已经签名的helper。下面的环境变量仅由测试读取，不是产品参数，也不替换E2E中的helper；测试仍禁止root且不写系统设置。在仓库根执行：

```sh
INTERCEPTOR_NATIVE_SERVICE_HELPER_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app/Contents/Resources/system-proxy/macos-proxy-helper" npm run test --workspace @interceptor/desktop -- src/main/platform-capabilities/helper/tests/integration/native-service.test.ts
```

## macOS 服务协议

[macos/system-proxy/native-service.swift](helper/macos/native/native-service.swift)的`serve`入口由launchd管理。Main通过[macos/helper-client.ts](helper/macos/helper-client.ts)调用固定命令：

| 命令 | 参数 | 结果 |
| --- | --- | --- |
| `status` | 无 | processId、privileged、clientAuthorizedForWrites、capabilities |
| `system-proxy.read` | 无 | 全部活动network service的完整快照 |
| `system-proxy.read-effective` | 无 | `SCDynamicStoreCopyProxies`返回的系统生效代理字典 |
| `system-proxy.replace` | expectedSnapshot、replacementSnapshot | 条件写入并回读后的完整快照 |
| `certificate.import` | 公开DER的base64、SHA-256 | 精确指纹及present=true |
| `certificate.remove` | 同一公开DER及SHA-256 | 精确指纹及present=false |
| `request.get-completion` | 原写请求的`requestId` | `{ requestId, state: "completed", operation }`或`{ requestId, state: "unknown" }` |

- 同一服务进程按独立受保护配置提供两个Unix socket。生产`service.sock`每个连接核验内核peer audit token、UID、精确CDHash及canonical可执行路径；开发`development.sock`只核验内核UID，不绑定源码、项目目录、Electron签名或调试状态。协议不接受客户端自报环境切换鉴权。
- launchd使用`ProcessType=Interactive`：Main同步等待这个服务的启动检查和系统操作，Background的CPU/I/O限流会使完整资源验证超出30秒客户端期限；Unix socket不能触发Adaptive的XPC调度提升。空闲时仍等待socket，不增加业务轮询或信任缓存。
- 生产`status`写资格与所有写命令另外验证完整App资源、内嵌代码、全部架构和Hardened Runtime，拒绝可调试或可注入进程；普通公开代理读取不重复扫描整包资源。开发允许获准用户的本地代码调用固定能力，不保证隔离同用户恶意程序。App可以由用户拥有，不要求root拥有或移动整个App。
- 严格校验字段、版本和256KiB单帧边界。代理条件写在同一SystemConfiguration事务中比对完整expected，冲突不覆盖外部修改；journal和退出恢复归Main进程的SystemProxyService。
- 生效代理读取与恢复快照分开；macOS journal只存`original/owned/effectiveProxies`，无版本或兼容读取。Core接收HTTP/HTTPS路由和原绕过规则；外部网络验收范围见Handover。
- 常驻服务只操作固定System.keychain，精确匹配公开DER，不接收CA私钥；Keychain读写禁止弹交互窗口。CertificateService负责CA生成/safeStorage及安装/回滚编排，导入不等于受信任。
- 服务正常结束清除自己的socket；崩溃重启只清理归属正确、ECONNREFUSED且inode未变的残留端点，快速断连不会以SIGPIPE终止服务。
- 开发与生产使用同一套命令/参数校验/条件写入，授权不同不增加通用执行或任意文件访问能力。普通用户原生集成验证两入口的准入、拒绝和非root写入失败，不替代真实App、系统授权和恢复验收，最新结果见[Handover](../../../../../architecture/HANDOVER.md)。
- 结束查询与普通只读命令一样先通过该socket的UID/代码身份检查，不提供系统写权限。每个生产/开发端点实例在发送写请求的成功或失败回复前，仅记录最近128个已结束请求的ID和操作名；不保存参数、证书、代理快照或信任结论。记录不跨实例重启或端点共享，缺失/淘汰返回unknown，不推断“从未执行”或“已经停止”。

### 前台证书信任入口

Certificate模块通过`MacosHelperServiceClient.trustCertificate()`/`untrustCertificate()`启动同一已部署helper的固定前台CLI，不先请求常驻服务。只接收`{ certificate: <公开DER base64>, sha256: <大写SHA-256> }`，限制256KiB输入、64KiB DER，不接受路径、私钥、shell或调用方指定的trust域；返回`{ sha256, trusted }`并由客户端核验。

前台helper只在当前登录用户GUI会话中执行，激活自身后调用Security公开API修改`.admin`并回读。它不具备常驻服务的root权限，系统确认由Security框架负责；Main不执行`security add-trusted-cert/remove-trusted-cert`、不请求原生提权、不接触密码。取消以`authorization-cancelled`返回，Main仅撤回本次新增CA；已有CA保留，撤销trust失败时不删系统证书。

证书写入结果不确定返回`certificate-state-uncertain`；子进程异常、无效回复或回读失败不重试授信。Main保留公开CA及本地材料，不能把不确定结果当成“证书一定未写入”而盲删。

### 客户端完成状态

- `MacosHelperServiceError.executionState`是Main内部错误分类，原写命令的回复格式保持。未发出socket请求、前台进程正常结束或收到匹配的正式失败回复时为`completed`；已发送写入后的超时/断线或无法关联回复，只有原ID及操作匹配的结束记录能改为completed。前台进程信号终止仍为unknown，不借用socket记录。
- stdin失败先结束前台进程，等退出回调后才结算；View同样等待失败进程退出，正常View仍在真实窗口ACK后返回，不占用用户查看窗口的整个生命周期。
- 错误同时携带已知socket请求名。`status/system-proxy.read/system-proxy.read-effective/request.get-completion`是只读请求，失败不等于有未知系统写入；不把只读检查超时变成永久修改锁。
- 部署和身份检查的CLI只读命令结束后，失败或非法回复也标为`completed`；保留原错误但不占用helper准备组，允许Quit或用户显式重试。安装成功后的就绪回读失败同样不伪装成仍在写入；未确认结束的原生写入保持原保护。
- 已确认结束的Certificate失败在材料保持不变的前提下回读信任、同步Core并通知，之后释放module占用；SystemProxy失败按journal比较完整当前状态并同步实际upstream，保留原错误。未知写入不执行这些可造成误判的清理，也不自动重试或释放占用。
- 只在已发送的`system-proxy.replace/certificate.import/certificate.remove`失联失败后确认一次；正常成功、正式失败回复、只读失败和未发送请求不查询。原请求和确认请求各自遵守30秒期限，确认期间原业务仍占用；查询失败/unknown/错配将原错误与确认错误一起返回，保持保护，不进行无界后台轮询。
- import失联确认结束但尚未请求trust时，只撤回安装前不存在的精确公开CA；已有CA、未知import和已经拒绝的授权不清理。回滚失败同时保留原错误，不能假装操作成功或安全恢复。
- `requestSent`独立记录是否已向服务socket提交帧；连接前失败虽然已结束，但没有发出import，不请求回滚删除。该标记不进入native协议，也不用于判断前台授权进程的完成状态。

不能把安装helper的授权等同于修改admin trust的授权，也不能假定root可绕过系统确认。不提供临时授权规则写入、后台trust/untrust或旧macOS兼容分支，不关闭SIP、使用私有entitlement或改成user trust；当前权限与收尾契约见[Settings](../../../../../architecture/features/settings.md#24-窄-api)。

## 首次启动部署

[macos/installation/helper-deployment.ts](helper/macos/installation/helper-deployment.ts)是Main启动时的组件准备入口；[macos/installation/native-installation.swift](helper/macos/installation/native-installation.swift)负责固定部署动作。

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