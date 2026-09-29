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
- **原生helper**：Windows使用系统.NET Framework的`csc.exe`，macOS使用`xcrun swiftc`；Forge将`dist/system-proxy`复制到`resources/system-proxy`。macOS helper使用固定identifier、Hardened Runtime和独立空entitlements，不继承Electron的JIT/设备权限。构建按源码、工具链、签名参数和产物hash缓存，缓存不进入App资源。
- **macOS首次启动组件**：helper随App交付，Main检查部署并按需请求本机管理员授权，仅安装helper、root保护配置和launchd，不移动App或要求独立`.pkg`。生产按App配套签名身份核准；开发/业务E2E使用独立UID授权，不绑定每次App构建。两个socket共用服务，helper不独立下载或升级。[部署规则](../../apps/desktop/src/main/platform-capabilities/README.md#首次启动部署)。
- **完整资源校验**：常驻服务复用同一受保护helper二进制启动只读`verify-code-signature`子进程，包内无需新增可执行资源；校验仍包含签名身份、strict/nested/all-architectures及no-network，失败不能授权系统写入。该入口变化随原helper构建、签名、部署和产物验收一起交付。

## 4. 产物安全

- **Renderer origin**：production 从固定的 `interceptor://app/index.html` 加载。协议只服务 Renderer root 内的 GET 文件，standard/secure/fetch/stream/code-cache，禁止 CSP bypass / Service Worker / CORS；可信导航逐项比较 scheme/authority/path。
- **Fuses**：`@electron/fuses` 2.1.3 在 packageAfterCopy、平台签名前以 strict all-fuses 写入 Electron 43 全九项；RunAsNode / NodeOptions / CLI inspect / file extras 关闭，cookie encryption / ASAR integrity / only-ASAR / WasmTrapHandlers 开启。
- **产物最小化**：Main/Preload production 与 Core release 默认 0 source maps；artifact audit 拒绝 maps/env/tests/source，验证 ASAR、Worker、native helper、Fuses 和签名策略，**不设文件数或体积门槛**。

## 5. 发布 CI

GitHub Actions Windows/macOS 原生 job，所有 actions 固定 commit SHA；签名材料只从 Secrets 进入临时文件/keychain。tag 构建验收后发布 MSI/DMG/ZIP 到同一 GitHub Release 并用 `--generate-notes` 生成 changelog；测试诊断使用独立 artifact，**绝不混入 Release assets**。

客户端更新鉴权与Release CI相互独立。Device Flow Client ID可以随包，client secret、private key和PAT不得进入源码或产物；客户端授权与下载规则见[Settings](../features/settings.md#4-更新)。

历史观测与产物适用范围见[Core依赖/Main启动证据](../features/settings.md#settings-core-bundle-history)及[macOS平台历史](../features/settings.md#macos-validation-history)；旧体积、ad-hoc或smoke结果不替代当前产物验收。
