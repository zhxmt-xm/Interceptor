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

macOS 连接归属、图标及上游代理检测仍按原任务跟踪，不因目录迁移而虚报已实现。

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

Main通过`MacosHelperServiceClient.trustCertificate()`/`untrustCertificate()`启动已部署的同一helper，固定命令为`certificate.trust`/`certificate.untrust`。stdin只接收`{ certificate: <公开DER base64>, sha256: <大写SHA-256> }`，限制256KiB输入、64KiB DER，不接受文件路径、私钥、shell或调用方指定的trust域；stdout返回`{ sha256, trusted }`并由客户端核验。

前台helper只在当前登录用户GUI会话中执行，激活自身后调用Security公开API修改`.admin`并回读。它不具备常驻服务的root权限，系统确认由Security框架负责；Main不执行`security add-trusted-cert/remove-trusted-cert`、不请求原生提权、不接触密码。取消以`authorization-cancelled`返回，Main仅撤回本次新增CA；已有CA保留，撤销trust失败时不删系统证书。

不能把安装helper的授权等同于修改admin trust的授权。本机SIP开启时root原生授信实测返回`-60007`；不关闭SIP、修改授权数据库、添加私有entitlement或降到user trust。后台socket不提供trust写命令，也不保留失败回退。前台路径的验证不等于常驻helper免重复确认；开发/生产授信、smoke及业务E2E的当前结果与缺口见[验证记录](../../../../../architecture/HANDOVER.md#verification)。

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