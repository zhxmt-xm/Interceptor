# 平台架构：依赖随包、打包与产物安全

> 范围：Proxy Core 运行时依赖的随包策略、Electron 打包、安全 Fuses、签名与发布 CI。

## 1. Proxy Core 运行时依赖随包

Core 是被 `utilityProcess.fork` 的独立进程，它的依赖不能靠 Renderer 的 bundling 解决。

- **哪些依赖不内联**：Mockttp 依赖含 WASM（`brotli-wasm`）与原生插件（`tls-impersonate` 的 `.node` prebuilds），WebSocket bridge 直接依赖 `ws`。esbuild 用 `--external:mockttp --external:ws` 保留运行时 `require`。
- **`ws` 必须 external**：由随包的Node模块在UtilityProcess中加载，避免内联依赖阻塞entry初始化。
- **怎么拷**：`scripts/ship-core-deps.mjs` 用 `@vercel/nft` 追踪运行时闭包，按 `node_modules` 结构拷进 `dist/proxy-core/node_modules`；Forge extraResource 递归随包发到 `resources/proxy-core/node_modules`。

`@vercel/nft` 有两处必须绕开的坑：

1. **静态追踪抓不到 `node-gyp-build` 运行时加载的 `.node`**。因此在 nft 之后要对每个随包依赖补拷 `prebuilds/` 与 `build/Release/*.node`（`tls-impersonate` 5 平台 prebuilds 全带）。
2. **拷贝时必须从第一个 `node_modules` 段起保留嵌套结构**。否则会把嵌套的 `finalhandler/node_modules/statuses@1.5.0` 拍平覆盖顶层 `statuses@2.0.2`，导致 `http-errors` 加载崩溃（`statuses.message` undefined）。

## 2. Main 侧的 external 与懒加载

`vite.main.config.ts` 把 `@peculiar/x509` / `reflect-metadata` / `@vscode/sudo-prompt` 标为 `rollupOptions.external`——Electron Vite 用 rolldown 打包 `@peculiar/x509` 时 tslib interop 会触发 `__extends` 崩溃。

external模块在顶层`require`可能阻塞packaged Main与CDP初始化，因此`@vscode/sudo-prompt`和`@peculiar/x509`在对应业务需要时通过`await import`懒加载。

## 3. 身份与安装器

- **稳定身份/版本**：Desktop `0.1.0`，`com.zhxmt.interceptor` 作为 Bundle ID / AppUserModelId；Windows executable 为 `asInvoker`。MSI 固定 UpgradeCode，x64、per-user，不把 auto-update feature 耦合进安装器。
- **Windows maker**：Forge WiX maker + 固定校验的 portable WiX 3.14.1；`make` 产出 MSI。可选 `WINDOWS_CERTIFICATE_FILE/PASSWORD` 同时签 app 与 MSI。生命周期 smoke 构建两版，验证 install → launch → major-upgrade → launch → uninstall。
- **macOS maker**：无身份时使用ad-hoc签名并启用Hardened Runtime；`optionsForFile`仅对App bundles应用[本地entitlements](../../apps/desktop/assets/macos-local-app-entitlements.plist)，允许JIT和无Team ID内嵌库加载，不开放DYLD注入、get-task-allow或关闭执行页保护。原生helper不使用该override。有`APPLE_SIGN_IDENTITY`时使用默认Hardened Runtime、entitlements和身份校验；公证凭据齐全才提交并staple。两种构建共用Fuses、sandbox与CSP，不改Gatekeeper或授权数据库；ad-hoc不等于Developer ID或公证。
- **原生helper**：`@interceptor/platform-capabilities`拥有原生源码和构建；Windows使用系统.NET Framework的`csc.exe`，macOS使用`xcrun swiftc`。Desktop调用package的`build:native`，Forge将`packages/platform-capabilities/dist`内的`system-proxy`、`app-container`、`client-app`复制到原有同名resources目录。macOS helper使用package内固定identifier、Hardened Runtime和独立空entitlements，不继承Electron的JIT/设备权限。构建按源码、工具链、签名参数和产物hash缓存，缓存不进入App资源。
- **macOS首次启动组件**：helper随App交付，Main检查部署并按需请求本机管理员授权，仅安装helper、root保护配置和launchd，不移动App或要求独立`.pkg`。生产按App配套签名身份核准；开发/业务E2E使用独立UID授权，不绑定每次App构建。两个socket共用服务，helper不独立下载或升级。[部署规则](../../packages/platform-capabilities/README.md#首次启动部署)。
- **完整资源校验**：常驻服务复用同一受保护helper二进制启动只读`verify-code-signature`子进程，包内无需新增可执行资源；校验仍包含签名身份、strict/nested/all-architectures及no-network，失败不能授权系统写入。该入口变化随原helper构建、签名、部署和产物验收一起交付。

## 4. 产物安全

- **Renderer origin**：production 从固定的 `interceptor://app/index.html` 加载。协议只服务 Renderer root 内的 GET 文件，standard/secure/fetch/stream/code-cache，禁止 CSP bypass / Service Worker / CORS；可信导航逐项比较 scheme/authority/path。
- **Fuses**：`@electron/fuses` 2.1.3 在 packageAfterCopy、平台签名前以 strict all-fuses 写入 Electron 43 全九项；RunAsNode / NodeOptions / CLI inspect / file extras 关闭，cookie encryption / ASAR integrity / only-ASAR / WasmTrapHandlers 开启。
- **产物最小化**：Main/Preload production 与 Core release 默认 0 source maps；artifact audit 拒绝 maps/env/tests/source，验证 ASAR、Worker、native helper、Fuses 和签名策略，**不设文件数或体积门槛**。

## 5. 许可随包

- 自有代码采用根目录`LICENSE`中的Apache-2.0，版权归属见`NOTICE`；自有workspace声明相同SPDX标识，`private: true`继续防止误发npm，与GitHub仓库可见性无关。
- Forge将`LICENSE`与`NOTICE`复制到App的Resources。Main、Preload和Renderer使用Vite已有的`build.license`收集各自内联依赖的许可；Core同时根据esbuild输入和nft运行时闭包收集原始许可/归属声明，随Core资源交付。
- 第三方代码继续遵守各自许可，不因Interceptor采用Apache-2.0而改写第三方许可；Electron自带许可和Chromium notices保留。artifact audit核对自有许可、元数据及生成的依赖许可声明。
- 少数npm tarball未附许可正文；`third-party-licenses/sources.json`按准确包名、版本和SPDX记录已核对的上游正文、README许可段落及来源。Core构建只对这些已登记版本补入声明；依赖升级后缺失许可正文或SPDX不一致时直接失败，不能以通用许可模板或空文本代替版权声明。

## 6. 交互配置与发布 CI

- `npm run release`只有一条连续流程：选择配置并总确认后，自动更新版本、检查、本机目标构建、提交生成配置并push、CI演练、tag和draft，最后等待实机验收确认再Publish。删除阶段菜单和单独预览入口，总确认前取消不会修改文件或访问GitHub。版本唯一来源为Desktop package.json，由npm联动lockfile；目标归`.github/release-config.json`，版本只递增一次。
- `scripts/release-config.mjs`统一校验配置、生成原生矩阵及资产数量；macOS x64对应`macos-15-intel`，macOS arm64对应`macos-15`，Windows x64对应`windows-2025`。默认仅macOS x64 DMG/ZIP；不接受空选择、重复目标、错误包类型或未实现架构，不宣称universal。MSI拒绝预发布/build metadata及超出Windows Installer版本段范围的值。
- `scripts/release-build.mjs`只在匹配平台/架构的原生主机调用Forge公开`api.make()`和所选makers，检查返回的版本、架构和包类型，再复用artifact audit及macOS签名检查。macOS还用`lipo -verify_arch`核对App与helper。归集目录为`out/release/<target-id>`，文件名包含版本、平台和架构；上传时只取本轮版本，不能混入旧make输出。
- 所有actions固定commit SHA。无付费签名Secrets要求；macOS保留ad-hoc与Hardened Runtime、strict/nested签名完整性，Windows为未签名安装器。原生helper、Fuses/CSP、ASAR与许可校验不因免证书而放宽。
- 执行前要求工作区干净并使用维护者自己的gh认证。检查通过后，只提交本次生成的Desktop版本、lockfile和发版目标配置；检查期间出现其他文件、HEAD/分支/origin变化或生成文件被修改时停止，不覆盖或夹带。push后以新的固定commit连续运行CI演练和tag流程；workflow_dispatch用唯一request ID关联本轮运行，停止本地等待不代表取消远端。
- 分支`workflow_dispatch`只生成Actions artifacts；`v<semver>` tag必须与提交中的Desktop版本一致，构建后只创建**draft Release**，预发布SemVer同步设置prerelease。发布job通过`GH_REPO`指定当前仓库，只允许更新未发布draft，不覆盖已发布版本。
- Release资产数量和类型从配置计算，不固定为2或3；逐项将GitHub返回的大小和SHA-256与本轮本地文件对比。诊断文件使用独立artifact，**绝不混入Release assets**。
- 托管runner只证明构建与上述自动检查。需要已初始化共享CA、已登录桌面、原生系统授权的packaged smoke，以及浏览器下载后的Gatekeeper/SmartScreen、真实安装生命周期和退出恢复，在对应平台实机执行。它们不是托管CI的passed项目，证据未齐不得Publish draft；Windows产物仍须满足其独立门禁。
- 命令给出draft链接并在同一终端等待维护者实机验收，确认后重新核对Release身份、附件名称/大小/digest/更新时间，再执行Publish并读取GitHub状态确认；未确认则保留draft。draft不提供匿名更新。失败保留Actions日志与诊断，重跑仅可更新draft；已发布版本修正使用新tag，不以删除Release或移动tag代替版本管理。

客户端匿名更新与Release CI相互独立。产品不包含GitHub登录或token，不发送Authorization；CI的`GITHUB_TOKEN`只用于当前仓库的draft/资产操作，不进入产物。private仓库允许Release但不提供匿名读取；发布流程不自动公开仓库或改变固定更新源。404或请求失败正常显示failed，下载规则见[Settings](../features/settings.md#4-更新)。首个真实tag与安装验收状态见[Handover](../HANDOVER.md)。

macOS内置更新仍只接受同架构DMG；ZIP-only选择会在向导、Release notes和[操作指南](../release-guide.md)中明确提示其仅用于手动分发，不自动扩展Updater协议。
