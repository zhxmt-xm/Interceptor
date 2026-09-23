# @interceptor/platform-capabilities

Interceptor 内部的平台能力 package，规划统一系统代理、系统证书信任、客户端应用查询和 Windows AppContainer 管理的调用边界。

## 当前状态与执行顺序

- 当前只有 workspace 元数据、目录占位和本文规划，没有运行入口、Service 实现、依赖或执行脚本。
- Desktop、Core、Preload 和 Renderer 尚未引用本包；现有实现继续工作，不通过空方法或假的 `supported` 列表冒充已接入。
- 用户已调整顺序：现有平台代码先聚合到 [Main platform-capabilities](../../apps/desktop/src/main/platform-capabilities/README.md)，在该目录继续开发macOS helper；本包仍不接入，之后再搬迁已验证模块。
- 优先在现有位置跑通 macOS 的 system proxy 和 cert/trust 代码及真实验收，再做本包的迁移与整理。
- 本文描述目标结构，不代表代码、特权服务、安装流程或测试已经实现。实际进度和证据以 [Handover](../../architecture/HANDOVER.md) 为准。

本 package 使用 `private: true`，仅作为 npm workspace 内部依赖。独立 package 不意味着独立发行、安装或更新；原生组件仍随 App 同包交付、同次安装和升级。

## 目标与非目标

### 目标

- 对外提供语义明确的平台能力入口，集中选择 Windows/macOS 实现，减少调用方分散的 `process.platform` 判断。
- 统一公共参数、返回值、能力标识及错误结构，保留平台真实差异，不把不同平台结果强行改成相同文本。
- 明确区分能力是否支持、组件是否就绪、操作是否已授权，以及业务当前状态。
- 复用现有实现、依赖和测试，保持 Windows 产品行为与 E2E 契约不变。
- 让 Main 和 Core 按既有进程职责使用原生能力，不依赖 Electron 才能加载本包。

### 非目标

- 不重写 Core 的代理转发、TLS 解密、Capture、Rules 或存储模块。
- 不把证书生成、CA 私钥管理、所有系统查询统一提升为管理员操作。
- 不新增通用 `execute(command)`、任意 shell、任意文件读写或 Renderer 直连原生服务的接口。
- 不建设插件系统、动态能力注册框架、独立 updater、项目公私钥体系或旧实现兼容层。
- 不以拆包名义提前增加新能力、放宽授权、替换 E2E 被测实现或修改发布签名门禁。

## 职责边界

| 能力 | 本包计划负责 | 继续由现有业务负责 |
| --- | --- | --- |
| System proxy | 原生配置读取、loopback 接管、完整快照和 journal、按 ownership 恢复、平台上游配置提取 | Main 决定何时启动 listener、接管、恢复、退出，以及向 Core 同步 upstream |
| Certificate trust | 系统证书库安装、卸载、实际信任状态查询和原生错误解释 | CA 生成、有效期和轮换策略、私钥安全存储、TLS 解密与配置通知 |
| Client app | 原生连接归属查询、公开应用元信息和图标读取 | Core 的查询缓存、Capture 事件和记录更新；Main 的图标缓存和 Renderer 投影 |
| AppContainer | Windows 枚举、单项/批量 loopback exemption 的原生读写与验证 | Main 的用户操作、Agent/MCP 审批、Renderer 的列表和确认交互 |
| Native component | 平台通信、组件就绪检查、同包资源的定位契约 | App 整体安装/升级、退出协调、用户授权入口及最终产物分发 |

### 进程边界

- Main 仍是系统代理与证书操作的业务编排者；IPC、Agent Tool 和 MCP Tool 调用同一个 Main 方法。
- `SystemProxyOperationQueue` 的 FIFO 与退出协调继续由 Main 管理，不在 package 或 helper 再复制一条业务流程。
- Core 只使用其现有职责所需的客户端应用查询，不因为引用本包而承担系统代理或证书库写入。
- Renderer 仍通过 typed Preload API 调用 Main，不导入本包或访问 Electron/Node。
- package 的类型边界不是安全沙箱；若接入特权服务，调用方身份和允许操作仍必须在服务端验证。

### 依赖方向

```text
Renderer -> Preload -> Desktop Main -> platform-capabilities -> Windows/macOS APIs
                         |
                         +-> CoreRuntime -> Proxy Core -> client-app native queries
```

- 本包不导入 `apps/desktop`、`apps/proxy-core`、Electron、Renderer Store 或产品启动入口。
- Main 解析 Electron 的资源目录，将明确的路径/运行配置传入；Core 沿现有配置链获得查询所需资源，不自行猜测 Electron 目录。
- 平台 DTO 由本包定义；现有 Core RPC、Preload DTO 在相应边界映射，不能为了复用类型让本包反向依赖 App。
- 平台 API 与现有依赖足够时不增加依赖。只有真实需要两个生产实现的共同能力才定义行为 interface，不复制 class 全部方法签名。
- 导入本包、创建对象和查询能力列表都不得隐式安装服务、请求授权或改变系统配置。

## 目录

### 本次建立的骨架

```text
platform-capabilities/
  package.json
  README.md
  src/
    interfaces/
    internal/
    windows/
    macos/
  tests/
    unit/
    integration/
```

空目录通过 `.gitkeep` 跟踪。当前不创建空 Service、错误类或测试；没有源码时也不添加假 build/test 脚本。第一批产品代码迁入时再按仓库约定加入 TypeScript、Vitest 配置和真实的入口声明。

### 迁移后的目标结构

```text
src/
  entry.ts                      定义并导出 PlatformCapabilitiesService
  interfaces/index.ts           公共 DTO、能力标识与真实公共契约
  internal/errors.ts            统一的 PlatformCapabilityError
  windows/
    entry.ts                    Windows 能力组合与实现选择
    system-proxy/               WinINet、Windows 快照与 journal
    trust-store/                Windows 证书库
    client-app/                 连接归属、应用身份与图标
    app-container/              Windows Network Isolation
    native/                     对应原生源码与构建入口
  macos/
    entry.ts                    macOS 能力组合与实现选择
    system-proxy/               多 network service、快照与 journal
    trust-store/                System Keychain 与信任策略
    client-app/                 按实际完成范围接入，不提前宣称支持
    native/                     原生源码、通信及同包组件
tests/
  unit/                         能力选择、状态、错误、纯逻辑
  integration/                  原生进程、文件、journal、实际平台读取
```

上述实现文件和子目录按迁移阶段建立，不在骨架阶段批量创建占位实现。只有去除真实重复后才增设共享 helper；Windows/macOS 的原生通信机制不必为了目录对称而相同。

## 对外契约规划

### 一个入口，保留独立动作

`PlatformCapabilitiesService` 是调用方的公共入口，负责平台选择、支持性检查及公共结果/错误转换；实际原生操作仍按能力放在平台目录内，不把所有实现塞进一个 class。

以下方法名是规划，不是当前可用 API。迁移时与现有业务逐项对齐，不因此改动既有 IPC/Preload/MCP 命令。

| 能力组 | 拟提供的明确动作 | 契约要求 |
| --- | --- | --- |
| Capability discovery | `getSupportedCapabilities()`、组件只读状态查询 | 无系统写入、不弹授权、不启动安装 |
| System proxy | `getSystemProxyStatus()`、`enableSystemProxy()`、`restoreSystemProxy()`、`recoverSystemProxyAfterCrash()` | 只允许 loopback listener；返回真实 owned/ownershipLost 和恢复结果 |
| Upstream | 原接管快照的上游配置查询 | 明确配置模式；不把未实现或无法判定等同于直连 |
| Trust store | `getCertificateTrust()`、`installCertificateTrust()`、`uninstallCertificateTrust()` | 证书身份明确；已存在不代表受信任；结果不含私钥 |
| Client app | `lookupConnectionOwners()`、`readApplicationInfo()`、`readApplicationIcon()` | 普通可读信息使用普通权限；缺信息不伪造，也不阻断网络转发 |
| AppContainer | `listAppContainers()`、`enableAppContainer()`、`disableAppContainer()`、单独的批量启用/停用方法 | Windows 专属；保存未知 SID 的既有配置，不用 boolean 合并业务实现 |

包接入后替代原有平台入口，迁移同一能力时一并更新调用点、移除旧实现，不长期保留两个实现或再增加重复转发的上层 Service。

### supported 与运行状态

- 能力标识按业务命名，例如 `system-proxy`、`certificate-trust`、`connection-owner`、`application-info`、`application-icon`、`app-container`。
- `getSupportedCapabilities()` 返回当前平台已有实现的能力列表，不返回尚未实现的规划项，也不是所有平台能力的空壳集合。
- macOS 不声明 `app-container`；误调用返回明确的 unsupported 错误，不返回假成功或用空数组暗示不支持。
- helper 缺失、被禁用或无法连接属于组件状态，不得导致已实现能力随运行时故障从 supported 列表消失。
- 所需的 `supported`、安装/就绪、授权和业务字段分别表达，不用单一 boolean 或空值混合表示。
- 公共 UI 需要这些信息时由 Main 投影无敏感字段的 DTO；不自动把能力列表注册为 Agent/MCP Tool。

### 错误

- 用统一 `PlatformCapabilityError` 承载稳定的 `code`、`capability`、`operation`，内部保留原始 `cause` 和必要的原生错误码。
- 首批 code 按实际分支建立，至少区分平台不支持、用户取消、权限拒绝、组件不可用、输入非法、操作失败与回读验证失败。
- 不依赖英文错误消息或本地化文本判断业务；对外错误与日志不带原始命令行、代理凭据、完整快照、授权对象或私钥。
- `not-owned`、`externally-modified` 等既有正常恢复结果保持其业务语义，不为统一错误 class 改成异常或成功写入。
- 取消必须尊重操作阶段：尚未执行可以取消，已写入则完成回读并返回真实结果，不能伪造回滚。

## 平台语义必须一致的部分

### 系统代理

- 保留 `original`、`owned`、`current` 的完整快照比较；退出只在仍 owned 时恢复，外部修改不能被覆盖。
- 写入前保存 journal；回读一致后才确认成功；失败保留必要的恢复信息，不在成功响应之前清掉证据。
- Windows 的 WinINet 字段、首次 original、journal 位置及当前用户权限行为保持，不为 macOS 新增常驻 Windows 服务。
- macOS 每个 network service 的代理字典和恢复规则保持完整，不能压缩成一个 endpoint 丢失 PAC、bypass、SOCKS 等配置。
- macOS 上游代理选择语义属于当前 system proxy 工作，不由拆包自行决定；以其先行实现及验收结果为准。
- 若先行 macOS 方案采用特权服务，需先明确 journal 与恢复执行的唯一 owner；不能让 Main 和服务分别保存互不一致的 original 或竞争恢复。

### 证书与信任

- 明确区分证书文件/系统证书库中存在、被系统信任、TLS 解密已启用；不以 `find-certificate` 命中指纹作为完整 trust 结论。
- 保留公开证书的身份校验、信任状态回读和错误原因；不伪造 trust 成功、不关闭证书校验来取得 Green。
- CA 生成与私钥保存留在现有 owner；特权侧只接收其所需的公开证书和身份，不接受任意路径或任意证书删除指令。
- 安装/卸载证书必须保存并验证宿主的原信任状态，不能误删其他 App 或用户的 CA。

### 平台差异

| 能力 | Windows 边界 | macOS 边界 |
| --- | --- | --- |
| Proxy | 当前用户 WinINet | SystemConfiguration，多 network service |
| Trust | Windows 证书库，相关写入可能触发 UAC | System Keychain 与系统信任设置，按真实授权机制执行 |
| AppContainer | 原生 Network Isolation / loopback exemption | 不支持，不造对应实现 |
| Client app | 当前已有 Windows helper | 未接入部分如实声明，不把权限不足和未实现混为一谈 |

统一的是业务结果、错误含义和状态通知，不是两端必须使用同一种进程、CLI 或授权界面。

## 原生组件与交付约束

- 不要求付费 Apple Developer Program，不新建项目公私钥体系；ad-hoc 或本机信任不等于 Developer ID/Apple 公证。
- helper 是正式 App 的内部组件，不是 E2E 专用替代实现；本次骨架不表示已批准在本机安装任何服务。
- helper 只随完整 App 同包安装和升级，不独立发布、检查更新、联网下载、自更新或单独维护发布流水线。
- macOS首次启动由Main检查组件，缺失或与本次App配套身份不匹配时，经用户本机授权部署App内附带的helper；后续复用。不要求独立`.pkg`，不移动整个App，不另外下载或运行helper updater。
- helper 具体授权和部署先在 macOS system proxy/cert 工作中验证，之后整体迁入；拆包不再次选择另一套架构。
- 本机信任、调用方身份校验和受保护安装路径是实施前必须明确的安全门槛；不得仅凭进程名、Bundle ID、自报身份或同一用户放行高权限命令。
- 不保存或读取管理员密码，不修改系统免密规则，不以 root 运行整个 App/E2E。
- 日常无需反复授权是产品验收目标，不代表系统隐私权限、用户撤销权限、重装或系统策略变化后永远免确认。
- 原生源码与构建可以归本包，但 Forge/maker、App 更新与最终产物审计仍由 Desktop 负责；不随意改 helper 产物名或查找路径。

## 现有代码迁移来源

| 来源 | 后续处理 |
| --- | --- |
| [Main 创建平台代理 Service](../../apps/desktop/src/main/main.ts) | 将平台对象选择收口到 package；保留 Main 的启动、退出、IPC 和通知编排 |
| [共享 Main interfaces](../../apps/desktop/src/main/interfaces/index.ts) | 只迁出平台专属 DTO 与真实公共契约；其他业务类型保留 |
| [Windows system proxy](../../apps/desktop/src/main/platform-capabilities/windows/system-proxy/entry.ts) / [macOS system proxy](../../apps/desktop/src/main/platform-capabilities/macos/system-proxy/entry.ts) | 在先行代码验证后迁入对应平台目录，连同 journal、原生实现和所属测试 |
| [TrustStoreService](../../apps/desktop/src/main/platform-capabilities/internal/trust-store-service.ts) | 提取系统信任库能力，保留证书生成与 TLS 编排；先修正并验证 macOS trust 语义 |
| [AppContainerService](../../apps/desktop/src/main/platform-capabilities/windows/app-container/app-container-service.ts) | 移入 Windows 实现，保留已有操作、错误与 UAC 边界 |
| [Main client-app helper](../../apps/desktop/src/main/platform-capabilities/windows/client-app/client-app-helper.ts) | 原生图标/应用元信息读取迁入；Electron 资源路径计算留给 Main |
| [Core ClientAppService](../../apps/proxy-core/src/proxy-core/client-app/entry.ts) / [原生查询 utils](../../apps/proxy-core/src/proxy-core/client-app/utils/index.ts) | 只提取原生查询边界；缓存、Capture 关联与事件交付继续留在 Core |

迁移不得顺手修改与当前能力无关的命名、格式、数据结构或产品流程。跨文件符号改名使用 Rename Symbol，路径和协议字符串逐项核对。

## 分阶段计划

| 阶段 | 工作内容 | 进入下一阶段的条件 |
| --- | --- | --- |
| 0. macOS 先行 | 在现有 Desktop 路径跑通 system proxy 接管/恢复/上游检测与 cert/trust，按已确认范围处理授权和退出 | 对应 unit/integration、真实 Electron E2E、进程/8888/代理/CA 恢复证据齐全；原生/安全变更完成 package、artifact audit、packaged smoke。缺项不得写全量完成 |
| 1. 本次骨架 | private manifest、目录占位、README 和 Handover item | npm workspace 可识别、lockfile 一致、文档链接/格式正确；无业务代码接入 |
| 2. 第一批迁移 | 先迁 system proxy 及 trust 的已验证代码，落地统一入口、DTO、错误和支持列表；同批替换 Main 调用点 | 迁移前说明覆盖并取得基线 Green；迁移后相同范围 Green，公共行为及数据格式不变 |
| 3. 相邻能力 | 迁 AppContainer 与已有 client-app 原生能力；macOS 未实现项继续单独跟踪 | Windows 支持声明与行为不变；macOS 不假报支持；验证 Main 和 Core 的真实调用边界 |
| 4. 构建与收尾 | 原生构建、资源随包、路径、文档统一；删除被替代的旧入口和重复实现 | 两平台相关回归、实际原生产物和恢复证据满足门禁后再关闭 Handover item |

阶段 1 仅做准备，可以先建立；阶段 2 及之后必须等待阶段 0，而不是以创建 package 为由提前重构。

## 验证计划

遵循 [测试分层](../../architecture/platform/testing.md)、[进程边界](../../architecture/platform/processes.md)、[存储](../../architecture/platform/storage.md) 和 [发布门禁](../../architecture/platform/release.md)。

- 本次只有骨架/文档：检查 JSON、workspace 发现、lockfile、目录、链接及 diff；不写辅助代码的测试，不执行会修改系统的 E2E。
- 行为不变的迁移：复用并迁移所属现有 unit/integration，先基线 Green、后同组 Green，不人为制造 Red。
- 新行为、数据格式变化或故障修复：先更新所属 feature 与 E2E 规格，按 unit/integration -> 真实 E2E 取得所需前置结果，再实现及复跑。
- 原生进程、真实文件、journal、系统查询放 `tests/integration/`，纯函数与状态规则放 `tests/unit/`；不新增 `tests/shared/` 或测试根目录 helper。
- Windows 原生功能与真实 E2E 必须在 Windows 验证；在 Mac 上通过可跨平台测试不算 Windows 原生复验。
- 每条相关真实 E2E 独立启动和清理，使用公共 automation ID，不通过注入 Store、直接业务 API、预造导入文件或替换 helper 取得通过。
- 原生构建/通信/资源或安全边界变化时，提前执行 package -> artifact audit -> packaged smoke；这三项不能代替真实 workflow。
- 每轮系统副作用验收保存 trace、结果和恢复证据，确认 Main/Core/Worker 全退、8888 释放、代理和证书状态恢复。
- 失败、平台不适用、跳过和人工阻塞分别记录。缺真实 E2E 或退出恢复证据时只能标记“代码完成，待 E2E”。

## 开始迁移前的检查清单

- [ ] 当前 macOS system proxy 和 cert/trust 优先项完成约定验收，Windows 相关回归范围已明确。
- [ ] Main、Core、package 和原生组件的职责单一，没有新增第二份退出恢复或业务执行流程。
- [ ] 对外方法、能力列表、就绪/授权状态和错误码与真实调用方逐项对齐。
- [ ] 免费本机部署下的调用方信任方案已经确认；没有把 ad-hoc 签名或目录权限当成完整鉴权。
- [ ] 原生资源路径、构建顺序、随包方式和测试 runner 的实际前提已经确认。
- [ ] 迁移按能力逐项替换并移除旧实现，不夹带无关整理或独立 helper 更新机制。

## 骨架检查

仓库根的 `packages/*` 已自动包含本 workspace，当前可通过以下只读命令确认元数据：

```sh
npm pkg get name private --workspace @interceptor/platform-capabilities
```

当前没有可运行的 build/typecheck/test 命令或公开运行时 API；首次实现时才添加真实命令，不用空脚本声称验证通过。