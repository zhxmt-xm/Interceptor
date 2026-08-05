# 平台架构：依赖随包、打包与产物安全

> 最后更新：2026-08-05
> 范围：Proxy Core 运行时依赖的随包策略、Electron 打包、安全 Fuses、签名与发布 CI。

## 1. Proxy Core 运行时依赖随包

Core 是被 `utilityProcess.fork` 的独立进程，它的依赖不能靠 Renderer 的 bundling 解决。

- **哪些依赖不内联**：Mockttp 依赖含 WASM（`brotli-wasm`）与原生插件（`tls-impersonate` 的 `.node` prebuilds），WebSocket bridge 直接依赖 `ws`。esbuild 用 `--external:mockttp --external:ws` 保留运行时 `require`。
- **`ws` 必须 external**：内联 `ws` 会让首代 Electron UtilityProcess 在 entry 顶层前阻塞（当时观测 bundle 约 283 KB、Core 停在 `starting`）；external 后 entry 回落约 159 KB，首代 Core 正常 ready/heartbeat。这是已验证的 UtilityProcess 启动陷阱，数字是当时的观测值而非当前基线。
- **怎么拷**：`scripts/ship-core-deps.mjs` 用 `@vercel/nft` 追踪运行时闭包，按 `node_modules` 结构拷进 `dist/proxy-core/node_modules`；Forge extraResource 递归随包发到 `resources/proxy-core/node_modules`。

`@vercel/nft` 有两处必须绕开的坑：

1. **静态追踪抓不到 `node-gyp-build` 运行时加载的 `.node`**。因此在 nft 之后要对每个随包依赖补拷 `prebuilds/` 与 `build/Release/*.node`（`tls-impersonate` 5 平台 prebuilds 全带）。
2. **拷贝时必须从第一个 `node_modules` 段起保留嵌套结构**。否则会把嵌套的 `finalhandler/node_modules/statuses@1.5.0` 拍平覆盖顶层 `statuses@2.0.2`，导致 `http-errors` 加载崩溃（`statuses.message` undefined）。

验证：packaged 真实 exe 启动即 `require('mockttp')`，从隔离的随包 `node_modules` 成功加载并进入 `running`；`npm audit --omit=dev` 0 漏洞。

## 2. Main 侧的 external 与懒加载

`vite.main.config.ts` 把 `@peculiar/x509` / `reflect-metadata` / `@vscode/sudo-prompt` 标为 `rollupOptions.external`——Electron Vite 用 rolldown 打包 `@peculiar/x509` 时 tslib interop 会触发 `__extends` 崩溃。

但 **external 模块的顶层 `require` 会阻塞 packaged Main 与 CDP 启动**。因此 `@vscode/sudo-prompt` 与 `@peculiar/x509` 必须懒加载（用时 `await import`，Main 启动路径不碰）。packaged smoke 验证 CDP 与 Preload 面正常。

## 3. 身份与安装器

- **稳定身份/版本**：Desktop `0.1.0`，`com.zhxmt.interceptor` 作为 Bundle ID / AppUserModelId；Windows executable 为 `asInvoker`。MSI 固定 UpgradeCode，x64、per-user，不把 auto-update feature 耦合进安装器。
- **Windows maker**：Forge WiX maker + 固定校验的 portable WiX 3.14.1；`make` 产出 MSI。可选 `WINDOWS_CERTIFICATE_FILE/PASSWORD` 同时签 app 与 MSI。生命周期 smoke 构建两版，验证 install → launch → major-upgrade → launch → uninstall。
- **macOS maker**：无身份时 ad-hoc；有 `APPLE_SIGN_IDENTITY` 时 Developer ID；身份和三项 notarize 凭据齐全才提交并自动 staple。DMG + ZIP 同时产出，平台 smoke 验证 helper、deep signature、Gatekeeper/stapler（按凭据）。
- **原生 helper**：Windows 用系统 .NET Framework `csc.exe`，macOS 用 `xcrun swiftc`；Forge 按平台把 `dist/system-proxy` 放到 packaged `resources/system-proxy`。

## 4. 产物安全

- **Renderer origin**：production 从固定的 `interceptor://app/index.html` 加载。协议只服务 Renderer root 内的 GET 文件，standard/secure/fetch/stream/code-cache，禁止 CSP bypass / Service Worker / CORS；可信导航逐项比较 scheme/authority/path。
- **Fuses**：`@electron/fuses` 2.1.3 在 packageAfterCopy、平台签名前以 strict all-fuses 写入 Electron 43 全九项；RunAsNode / NodeOptions / CLI inspect / file extras 关闭，cookie encryption / ASAR integrity / only-ASAR / WasmTrapHandlers 开启。
- **产物最小化**：Main/Preload production 与 Core release 默认 0 source maps；artifact audit 拒绝 maps/env/tests/source，验证 ASAR、Worker、native helper、Fuses 和签名策略，**不设文件数或体积门槛**。

## 5. 发布 CI

GitHub Actions Windows/macOS 原生 job，所有 actions 固定 commit SHA；签名材料只从 Secrets 进入临时文件/keychain。tag 构建验收后发布 MSI/DMG/ZIP 到同一 GitHub Release 并用 `--generate-notes` 生成 changelog；测试诊断使用独立 artifact，**绝不混入 Release assets**。
