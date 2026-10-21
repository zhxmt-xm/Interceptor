# 开发指南

本文面向源码开发与维护。产品介绍见 [简体中文](../README.zh-CN.md) / [English](../README.md)，架构设计见 [文档索引](README.md)。

开始改动前先读 [HANDOVER.md](HANDOVER.md) 和 [协作规范](../AGENTS.md)，再按任务查阅相关功能文档。

**命令约定**：均在仓库根目录执行，示例使用 Windows PowerShell。macOS 的 npm 命令相同，原生构建须在对应平台运行。

[初始化](#1-初始化) | [项目分工](#2-项目分工) | [日常开发](#3-日常开发) | [验证](#4-验证) | [打包发布](#5-打包与发布) | [常见问题](#6-常见问题)

<br>

## 1. 初始化

| 环境 | 要求 |
| --- | --- |
| Node.js | `24.18.0` LTS |
| npm | `11.16.0` |
| Windows | 系统 .NET Framework 的 `csc.exe`，用于构建原生 helper |
| macOS | Xcode Command Line Tools，提供 `xcrun swiftc` |

所有 workspace 统一在根目录安装依赖，无需逐个安装：

```powershell
node --version
npm --version

npm install
```

版本约束见 [.nvmrc](../.nvmrc)、[.npmrc](../.npmrc) 和 [package.json](../package.json)。

安装时会通过 `patch-package` 应用仓库已有补丁。第三方补丁不能随意升级或修改；Electron 下载失败时见文末排障。

<br>

## 2. 项目分工

| 部分 | 位置 | 职责 |
| --- | --- | --- |
| Desktop | `apps/desktop/` | Electron Main、Preload、React Renderer、App打包与桌面测试 |
| Platform Capabilities | `packages/platform-capabilities/` | 系统代理、证书、AppContainer、客户端应用原生查询与同包helper |
| Proxy Core | `apps/proxy-core/` | 代理、录制、规则、断点、正文与存储，运行在独立 UtilityProcess |
| Core Protocol | `packages/core-protocol/` | Main/Core 的类型契约与消息校验 |
| Agent Runtime | `packages/agent-runtime/` | 内置 Agent 的会话与 Tool Calling 执行 |
| Tools | `packages/interceptor-tools/` | Agent 与 MCP 共用的 Tool 目录、授权和执行逻辑 |
| MCP Server | `packages/mcp-server/` | 外部 AI 客户端的 MCP transport，已接入 Main |
| 设计稿 | `design-vite/` | 唯一交互设计稿、design token 与参考截图，不进入产品包 |
| Playground | `apps/playground/` | 协议流量与 MCP 人工验收工作台，不进入产品包 |
| 架构与脚本 | `architecture/`、`scripts/` | 功能契约、平台说明与可重复构建工具 |

Renderer 内部按 `app/`、`features/`、`components/`、`theme/` 和 `styles/` 分工。

- Renderer 不访问 Node 或 Electron，只通过 typed `window.interceptor` API 进入 Main。
- 正文和代理业务由 Core 所有。

详细边界见 [进程架构](platform/processes.md) 与 [Renderer 架构](platform/renderer.md)。

<br>

## 3. 日常开发

### 统一命令入口

完成初始化后，在仓库根目录运行：

```powershell
npm start
```

一级菜单为`Development / Test / Build / Release`。只选择目标和必要范围，构建准备自动完成，不要求判断缓存或“已有构建”。执行摘要按列展示操作、目录和命令，注意事项逐条显示；确认默认Yes，仍需按Enter才执行，输入`n`取消。

| 大类 | 逐步选择 |
| --- | --- |
| Development | Desktop / Playground / Design → 确认启动，不再选择启动模式 |
| Test | Typecheck、Unit/Integration、E2E、Parity、Packaged smoke、Artifact audit → 必要的workspace、测试范围、workflow或视图 |
| Build | App应用包 / Installer安装包 → 确认构建 |
| Release | 确认启动 → 发版向导选择源码commit、版本与目标 → 确认CI → 检查通过后自动Publish |

- 选择菜单中的“返回上一级”可以重新选择；最终确认输入`n`回到主菜单，不执行命令。`Ctrl+C`退出。
- 命令顺序执行，任一步失败立即停止后续步骤并以非零状态退出，不自动重试或忽略失败。正常结束后回到主菜单。
- Desktop使用`npm run dev`自动准备运行所需文件；Design直接启动开发预览。菜单不再提供“沿用已有Core”或不同预览模式。
- Unit/Integration测试先构建Core，再以`--no-file-parallelism`运行所选范围；E2E先选择普通验收或逐步截图，再选功能/workflow，自动prepare，不再追问构建方式。截图模式仍执行原业务断言，自动新建`apps/desktop/test-results/workflow-screenshots/<run>/`并输出实际路径；普通测试不清理该独立目录。
- 不提供Guidebook专用workflow、制作或导入菜单。步骤图只是原E2E的可选产物，不绑定Homepage；采用截图作为文档素材前仍须审核隐私、版本和步骤内容。
- Packaged smoke自动打包后运行；Artifact audit先打包再审计资源，不启动Desktop。不要与其他构建、开发实例或依赖产物的测试并行。
- Parity只选择现有视图，自动准备两个页面、采集声明元素、严格逐项比较并生成报告；无需Agent、模型凭据或先运行截图命令。保留主题与尺寸，不修改设计源码来掩盖差异；退出码0/1/2分别表示通过、差异和执行错误。报告在`apps/desktop/test-results/visual-parity/`，不进入Git。Watch、Browser专项、手工设计截图/图片对比、报告查看、单独Core/native构建等低频操作继续使用下文原始命令。
- 原生启动和打包只在相应平台可选。启动App或真实验收前会提示系统代理、证书授权和正常退出要求；向导不替代系统授权或恢复检查。
- Release调用现有`npm run release`，不复制发版逻辑；需要已安装并登录`gh`。启动CI前确认发版计划，CI及完整性检查通过后自动Publish，不再二次询问。
- 原始命令继续保留，CI与非交互环境直接调用它们；也可直接运行`npm run release`进入同一向导。

查看入口说明：

```powershell
npm start -- --help
```

### Desktop

启动完整桌面开发环境：

```powershell
npm run dev
```

该命令依次构建 Core Protocol、Proxy Core 和当前平台的原生 helper，再启动 Vite 与 Electron。

macOS 开发和业务 E2E 共用一个常驻 helper。首次部署或新增开发授权时，由 macOS 请求管理员确认；之后信任已核准的本机 UID，不绑定项目源码、App 构建、Electron 签名或调试状态。HMR、`rs`、修改业务代码和切换测试 profile 不重复安装或申请这项授权。helper 自身构建改变或组件缺失时才需部署；损坏配置报错，不静默覆盖。

生产包使用独立 socket 和 root 保护的 App 身份配置，保留完整签名、资源和运行时校验，不回退到开发入口。开发授权意味着信任该 UID 的本地程序，但只能调用固定代理和公开证书操作，不提供任意 root 命令。证书 admin trust 仍有独立系统权限。实机验证范围见 [Handover](HANDOVER.md)。

| 修改范围 | 生效方式 |
| --- | --- |
| Renderer 组件、样式、主题 | Vite HMR，通常无需重启 |
| Main / Preload | 构建更新后，在 Forge 终端输入 `rs` 并回车重启 |
| Proxy Core / Core Protocol | 重新执行 `npm run build:core`，完成后再 `rs` |
| 原生 helper / 构建配置 | 停止当前开发实例，再执行 `npm run dev` |

Core 已构建且没有变化时，单独启动 Desktop：

```powershell
npm run start --workspace @interceptor/desktop
```

**运行前注意**

- 开发版同样会自动接管系统代理，默认监听 `127.0.0.1:8888`。
- 开发实例、真实 Electron E2E 和 packaged smoke 不得同时运行。
- 结束时正常关闭应用，确认代理恢复后再启动下一项，不要用强杀代替清理。

<br>

### Proxy Core 与共享包

构建 Core Protocol 和 Proxy Core：

```powershell
npm run build:core
```

构建完成后，在 Forge 终端输入 `rs` 重启。Core 由 Desktop 管理，不能直接用 Node 启动；日志以 `[proxy-core]` 前缀转发到 Forge 终端。

共享包按 workspace 单独检查。以 Tools 为例：

```powershell
npm run typecheck --workspace @interceptor/tools
npm run test --workspace @interceptor/tools
```

- 改动公共契约或 Tool 行为时，同时验证受影响的 Desktop、Core、Agent 和 MCP。
- Core 构建会重建 `dist`，不要与依赖产物的集成测试并行。

<br>

### 设计稿

#### 启动开发

```powershell
npm run dev --workspace @interceptor/design-vite
```

打开 Vite 输出的本地地址。设计稿是独立 SPA，不启动 Electron，也不进入 Desktop 安装包。

#### 类型与交互检查

```powershell
npm run typecheck --workspace @interceptor/design-vite
npm run test:interaction --workspace @interceptor/design-vite
```

#### 构建与预览

```powershell
npm run build --workspace @interceptor/design-vite
npm run preview --workspace @interceptor/design-vite
```

`preview` 用于查看构建后的设计稿，不是产品打包。

#### 截图与对比

只更新本次修改的 feature，例如 Capture：

```powershell
node design-vite/shoot.mjs --feature=capture
```

需要更新完整设计矩阵或主题场景时，按需选择：

```powershell
# 全量 feature 截图
npm run shoot --workspace @interceptor/design-vite

# 主题切换场景
node design-vite/shoot-scenes.mjs
```

与已保存的截图基线对比，将示例路径替换为实际基线目录：

```powershell
$baselineDir = 'C:\temp\interceptor-shots-before'
npm run compare --workspace @interceptor/design-vite -- $baselineDir capture
```

**注意**

- 截图和交互测试使用系统 Edge，无需额外安装 Playwright 浏览器。
- 手工截图输出到被Git忽略的`design-vite/shots/`或指定目录，用于设计评审，不是parity输入；不提交全量截图，不为修复产品还原偏差而修改设计源码。
- 组件与 token 以 [设计系统](../design-vite/design-system.md) 为准，截图输出与完整规则见 [设计稿指南](../design-vite/README.md)。

<br>

### Playground

启动协议流量与 MCP 人工验收工作台：

```powershell
npm run playground
```

浏览器入口为 `http://127.0.0.1:4175`，默认打开 Capture Lab。

- Capture Lab：先启动 Desktop，再通过 `127.0.0.1:8888` 观察真实协议流量。
- MCP：使用从 Interceptor 复制的连接配置。

类型、单元 / 集成和浏览器检查：

```powershell
npm run typecheck --workspace @interceptor/playground
npm run test --workspace @interceptor/playground
npm run test:browser --workspace @interceptor/playground
```

前端构建：

```powershell
npm run build --workspace @interceptor/playground
```

Playground 不参与 Desktop 打包。场景说明、凭据边界和人工报告见 [Playground 指南](../apps/playground/README.md)。

<br>

### 调试

Main 与 Core 可以一起调试，浏览器和编辑器任选。Renderer 使用独立的页面 DevTools。

macOS 开发入口允许 Main/Core 调试，复用开发与业务 E2E 的同一份 helper 授权；生产签名和运行时检查不因此关闭。以下 `npm run start` 内部仍调用 Forge，不会改成启动打包 App。

#### Main 与 Proxy Core

**一次启动两个进程的调试**

```powershell
$env:INTERCEPTOR_SOURCEMAPS = '1'
npm run build:core
Remove-Item Env:INTERCEPTOR_SOURCEMAPS -ErrorAction SilentlyContinue

npm run start --workspace @interceptor/desktop -- --inspect-electron
```

前面三行生成 Core 的 TypeScript 源码映射；最后一行开启 Main inspector，Core 自动跟随开启独立的本机端口。不要改用 `npm run dev`，它会重新构建并覆盖这次生成的源码映射。

终端会打印两个 `Debugger listening on ws://...` 地址：带 `[proxy-core]` 前缀的是 Core，另一个是 Main。Core 端口由系统分配，不与 Main 共用。

需要 Main 首行断点时，把最后一个参数换成 `--inspect-brk-electron`。在 Main 中继续执行后，Core 才会启动；Core 不继承首行暂停。

**浏览器调试**

1. Chrome 打开 `chrome://inspect/#devices`；Edge 打开 `edge://inspect/#devices`。
2. 在 `Configure...` 分别添加终端显示的两个 `127.0.0.1:<端口>`。
3. 对 Main 和 Core 目标分别点击 `inspect`，即可同时打开两个 DevTools，在各自 Sources 中断点、单步和查看变量。

**编辑器调试**

- VS Code：分别建立两个 Node.js Attach 配置，连接 Main 和 Core 的端口。
- WebStorm：分别建立两个 `Attach to Node.js/Chrome` 配置，连接这两个端口。

普通启动不会开启这两个调试端口，正式包不跟随开启 Core inspector。Core 重启后需使用终端打印的新地址重新连接。

<br>

#### Renderer

正常启动开发版，在应用窗口按 `Ctrl+Shift+I` 打开内置 DevTools：

```powershell
npm run dev
```

需要从外部浏览器连接时，改用下面的启动方式：

```powershell
npm run build:core
Push-Location apps/desktop
& '..\..\node_modules\.bin\electron-forge.cmd' start -- --remote-debugging-port=9333
Pop-Location
```

在 Chrome / Edge 的 inspect 页面添加 `127.0.0.1:9333`，选择 Renderer 页面。该端口只用于页面调试，不用于 Main / Core。

以上调试仅用于本机开发版。暂停 Core 会暂停代理请求；结束后先继续执行，再正常退出应用，恢复系统代理。

<br>

## 4. 验证

先运行改动范围内最小的测试，再按影响范围扩展。

- 新增行为或修复故障：先取得目标行为的 Red。
- 行为不变的重构：先确认覆盖当前行为的 Green。
- 纯文档修改：只检查事实、链接和格式，不启动应用或打包。

### 类型与单元 / 集成测试

```powershell
# 先完成构建，再运行依赖产物的测试
npm run build:core
npm run typecheck

npm run test --workspace @interceptor/desktop
npm run test --workspace @interceptor/proxy-core -- --no-file-parallelism
```

其他共享包按影响范围选择：

```powershell
npm run test --workspace @interceptor/core-protocol
npm run test --workspace @interceptor/agent-runtime
npm run test --workspace @interceptor/tools
npm run test --workspace @interceptor/mcp-server
```

单包类型检查与持续测试，以 Desktop 为例：

```powershell
npm run typecheck --workspace @interceptor/desktop
npm run test:watch --workspace @interceptor/desktop
```

- Core 全套必须关闭文件并行，且先完成构建；缺少 worker bundle 导致的 skip 不算通过。
- 根命令 `npm run test:unit` 会调用所有声明 `test` 的 workspace，不仅是 Desktop / Core / Protocol；Core 的完整回归仍使用上面的串行命令。
- 测试命令后可接 `-- <测试路径>` 缩小范围。

<br>

### 真实 Electron E2E

构建本地 production bundle，并运行真实 Electron workflow：

```powershell
npm run test:e2e:workflow
```

仅准备 bundle，不运行 workflow：

```powershell
npm run e2e:prepare-local --workspace @interceptor/desktop
```

**验收边界**

- 使用测试拥有的 App，不附着开发窗口。两平台默认使用未打包 Electron 和本地 production bundle；macOS 通过 Renderer CDP 驱动并复用开发 helper。签名生产包由 packaged smoke 或显式产物路径独立验收。
- 必须通过真实 UI 操作，原生文件对话框和证书授权不能用 mock 或业务 API 替代。
- 最终检查 trace、证据、进程销毁、8888 释放与系统副作用恢复。

执行条件、定向运行方式和 Inventory 见 [E2E 指南](../apps/desktop/tests/e2e-workflow-tests/README.md)。

<br>

### 视觉一致性

```powershell
node apps/desktop/tests/visual-parity/parity.mjs
```

- 功能 UI 改动：运行受影响的视图、主题与状态。
- 共享外壳、全局样式或 design token 改动：运行全量。
- 该套件使用fake Preload和正常UI操作，严格比较声明元素的几何、样式、文本和状态，不采集图片；不能证明所有绘制内容一致，也不能替代真实E2E。

定向参数见 [parity 指南](../apps/desktop/tests/visual-parity/README.md)，全部测试层级与门禁见 [测试架构](platform/testing.md)。

涉及证书信任或 UAC 的验证须先确认人工操作条件，不自动提权。

<br>

## 5. 打包与发布

### 本地应用包

生成当前平台可直接运行的应用包：

```powershell
npm run package
```

该命令依次构建协议、Core、原生 helper 和 Electron 应用。

| 平台 | 产物 |
| --- | --- |
| Windows x64 | `apps/desktop/out/Interceptor-win32-x64/Interceptor.exe` |
| macOS | `apps/desktop/out/Interceptor-darwin-<arch>/Interceptor.app` |

<br>

### 验证应用包

按顺序检查现有产物：

```powershell
# 检查产物结构与安全配置
npm run test:package-audit

# 启动现有应用包，验证功能与退出恢复
npm run test:smoke --workspace @interceptor/desktop

# 审计生产依赖
npm audit --omit=dev
```

**运行前注意**

- 正常关闭开发窗口，释放 8888 并恢复系统代理后，再运行 smoke。
- 上面的 workspace smoke 不重新打包；根命令 `npm run test:smoke` 会先打包。
- 截图矩阵与完整检查范围见 [packaged smoke 指南](../apps/desktop/tests/packaged-smoke/README.md)。

<br>

### 安装器

Windows 在当前 PowerShell 会话准备 WiX，然后生成 MSI：

```powershell
.\scripts\prepare-wix.ps1
npm run make
```

macOS 生成 DMG 和 ZIP：

```powershell
npm run make
```

| 平台 | 安装器输出目录 |
| --- | --- |
| Windows | `apps/desktop/out/make/wix/x64/` |
| macOS | `apps/desktop/out/make/` |

<br>

### 验证安装器

在对应平台选择一项运行：

```powershell
# Windows：安装、启动、升级与卸载
npm run test:installer:windows

# macOS：构建DMG/ZIP，验证helper和ad-hoc签名完整性
npm run test:release:macos
```

原生构建与验收须在对应操作系统进行，不把跨平台 skip 当作验证通过。

<br>

### 正式发布

运行`npm start`并选择`Release`，确认执行摘要后进入发版向导；也可直接运行：

```bash
npm run release
```

先从当前分支最近10个commit选择源码，也可输入短/完整hash查询并确认。所选完整SHA必须存在于GitHub；随后选择版本、平台/架构和包类型，作为workflow输入交给CI。版本由CI构建时注入，tag固定指向所选源码SHA，本地不修改版本、配置、index或HEAD，不commit/push/stash，也不要求工作区干净。

默认macOS x64 DMG/ZIP，也可选macOS arm64或Windows x64 MSI。CI编排工具与产品源码分开记录：产品精确检出所选SHA，编排工具取自运行workflow的版本；不会偷偷改用main源码或跳过旧commit不满足的许可/安全/测试要求。

所有CI构建检查通过后生成tag及draft，CLI核对源码SHA、Release身份与附件完整性后自动Publish，不再等待第二次确认。自动发布不代表实机验收已经通过，缺失证据仍须如实记录。没有本地构建/版本commit或第二轮tag CI。完整选择、hash查询、工具部署前提和GitHub排障步骤见[发版完整操作指南](release-guide.md)。

**访问与历史**

- private仓库也能创建draft和Release，但用户匿名下载与当前固定更新源需要public可读的发布源。仓库可见性必须单独确认，脚本不会自动更改；不因产品没有GitHub登录而将CI token写入产品。
- 删除Release不会自动删除Git tag、commit或已经下载的副本。已发布版本修正使用新tag；启用immutable releases时，即使删除Release，也不能复用原tag名称。不要把删除当成首次发布的回滚保证。
- 未选择Windows时，不要求执行Windows实机验收；选择或自动发布Windows产物不代表其安装、授权和退出恢复已通过，仍须保留独立验证状态。

本机已有签名资质时，Forge仍可使用`WINDOWS_CERTIFICATE_FILE/PASSWORD`或`APPLE_SIGN_IDENTITY`；Apple公证还需`APPLE_ID`、`APPLE_ID_PASSWORD`和`APPLE_TEAM_ID`。它们不是当前macOS CI前提。密钥、密码和证书私钥不得进入仓库或产物。

依赖随包、Fuses、CSP、签名与 CI 细节见 [发布架构](platform/release.md)，更新行为见 [Settings](features/settings.md)。

<br>

### 重新生成图标

修改 [interceptor-icon.svg](../apps/desktop/assets/interceptor-icon.svg) 后执行：

```powershell
.\scripts\generate-icon.ps1
```

复核生成的 PNG / ICO / ICNS，再提交图标改动。

<br>

### 手动检查产物

需要进一步排查最终产物时：

```powershell
# 查看 Electron Fuses
& .\node_modules\.bin\electron-fuses.cmd read --app .\apps\desktop\out\Interceptor-win32-x64\Interceptor.exe

# 查看 ASAR 文件清单
& .\node_modules\.bin\asar.cmd list .\apps\desktop\out\Interceptor-win32-x64\resources\app.asar
```

不要提交 `.vite/`、`out/`、`playwright-report/` 或 `test-results/` 等生成目录；设计基准与已有验收资产按仓库规范保留。

<br>

## 6. 常见问题

### Electron 下载慢或失败

先使用默认网络。确有需要时，仅在当前 PowerShell 会话设置镜像，再重试原来的安装、启动或打包命令：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm install

Remove-Item Env:ELECTRON_MIRROR -ErrorAction SilentlyContinue
```

镜像没有硬编码进仓库；Packager 仍使用锁定的 Electron npm 包所附官方 SHA-256 校验产物。

需要详细打包日志时：

```powershell
$env:DEBUG = 'electron-forge:*,electron-packager,@electron/get*'
npm run package

Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
```

<br>

### 开发窗口空白

先停止 Forge，仅清理生成的 Vite optimizer cache，然后重启；不要删除整个 `node_modules`：

```powershell
Remove-Item -Recurse -Force .\apps\desktop\node_modules\.vite -ErrorAction SilentlyContinue
npm run dev
```

如果只有手动刷新后才显示，检查 Main 是否允许精确 Vite origin 内的 reload，同时拒绝外部导航：

```powershell
npm run test --workspace @interceptor/desktop -- --run src/main/security/tests/unit/trusted-renderer-url.test.ts
```

Vite 可能仅监听 IPv6 localhost，应以终端显示的实际地址为准，不要仅凭 `127.0.0.1` 探测失败判断服务未启动。

<br>

### Windows 出现 Winsock 10108

`WSALookupServiceBegin failed with: 10108` 表示 Chromium 查询旧版 NLA Winsock namespace 失败，不是 Core JavaScript 异常。

- 窗口、Core 和真实网络请求正常：无需处理。
- 系统网络也异常：再检查 NLA、DNS 与 Winsock。
- 不要只为消除该日志运行 `netsh winsock reset`。

<br>

### 8888 被占用或系统代理残留

1. 正常关闭上一个 Interceptor 实例，不并行启动第二个代理或测试。
2. 若强杀后系统代理仍指向 `127.0.0.1:8888`，先恢复原代理设置，再启动新实例。
3. 不要清空不属于本次运行的配置或证书。

接管期间其他代理软件改写系统设置会触发 ownership-lost 保护，Interceptor 不会反复抢回。恢复边界见 [Settings](features/settings.md)。