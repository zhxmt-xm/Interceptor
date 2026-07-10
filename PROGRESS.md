# Interceptor 项目进度

> 本文件是整个项目跨 Session 的持续进度记录，不限定某个里程碑。每当任务开始、取得进展、完成验证或遇到阻塞时，都必须同步更新。

## 状态说明

- `已完成`：交付物已实现，并达到当前阶段的验证标准。
- `进行中`：已经开始，必须记录完成比例、已完成内容、剩余内容和阻塞项。
- `未开始`：尚未产生实现进展。
- `已阻塞`：无法继续，必须记录原因和解除阻塞的下一步。

## 项目快照

- 产品：跨平台桌面 HTTP 网络调试代理
- 总体状态：已暂停（用户于 2026-07-11 主动暂停）
- 当前里程碑：M0 项目脚手架与工具链
- 当前工作项：首次 Forge package 的 Copying files 失败诊断
- 最后更新：2026-07-11
- Git 基线：`fa486f3`（产品方案已提交）
- 下一步：恢复后使用 Forge/Packager DEBUG 日志重跑 `npm run package`，定位 `Copying files` 阶段的具体异常；不要重复已通过的方案梳理、类型检查和单元测试。

## 里程碑总览

| 里程碑 | 名称 | 状态 | 进度 | 说明 |
| --- | --- | --- | ---: | --- |
| M0 | 项目脚手架与工具链 | 已暂停 | 58% | 三入口与应用壳已实现；首次 package 的 Vite 构建通过，但 Packager 复制文件失败 |
| M1 | IPC 通信基座 | 未开始 | 0% | 依赖 M0 |
| M2 | 存储层 | 未开始 | 0% | 依赖 M0、M1 的协议基础 |
| M3 | 最小显式代理（HTTP/1.1） | 未开始 | 0% | 依赖 M2 |
| M4 | 会话列表 UI | 未开始 | 0% | 依赖 M3 |
| M5 | CA 与 HTTPS MITM | 未开始 | 0% | 依赖 M3 |
| M6 | HTTP/2 | 未开始 | 0% | 依赖 HTTPS 和代理基础 |
| M7 | 规则引擎 | 未开始 | 0% | 依赖代理与领域模型基础 |
| M8 | 规则 UI 与 Composer | 未开始 | 0% | 依赖 M7 |
| M9 | WebSocket 与 gRPC | 未开始 | 0% | 依赖协议捕获基础 |
| M10 | 导入导出与隐私 | 未开始 | 0% | 尚未排期 |
| M11 | 系统代理适配与恢复 | 未开始 | 0% | 关键发布路径 |
| M12 | 打包发布加固 | 未开始 | 0% | 依赖主要产品能力 |
| M13 | 更新机制 | 未开始 | 0% | 依赖 M12 |

## 已完成步骤

### 2026-07-10

1. 已完成产品方案编写并提交，提交为 `fa486f3 docs: add desktop network debugging proxy plan`。
2. 已阅读产品方案中 M0、总体架构、工程结构、技术栈、Electron 安全、打包和测试章节。
3. 已提取 M0 的五项任务及验收标准：T0.1 脚手架、T0.2 UI 外壳、T0.3 安全基线、T0.4 测试工具链、T0.5 Proxy Core 子进程。
4. 已确认工程采用 monorepo 边界，桌面应用与 Proxy Core 从第一天起保持进程和目录隔离。
5. 已确认 Forge Vite 插件需要独立 main/preload/renderer 构建入口、HMR 全局地址和打包资源路径。
6. 已检查本机 JavaScript 工具链，确认当前终端找不到 `node`、`npm` 和 `npx`。
7. 已建立本文件作为全项目唯一的跨 Session 进度入口。
8. 已通过 Windows Package Manager 安装并验证 Node.js `24.18.0` LTS（Krypton）、npm/npx `11.16.0`，工具链阻塞已解除。

## 进行中步骤

> 暂停说明：以下任务保持“进行中”的真实状态，但当前不执行任何命令或改动。恢复时从“暂停点”继续。

### 暂停点（2026-07-11）

- 用户要求先暂停，已停止后续构建、诊断和代码修改。
- 最近一次完整通过的检查：Desktop/Proxy Core 根级 typecheck、3 条 Vitest 单元测试、`git diff --check`。
- 首次 `npm run package` 的结果：Proxy Core build 通过；Forge Vite main、preload、renderer 三个生产 Bundle 全部通过；Electron Packager 在 `Packaging for x64 on win32 → Copying files` 阶段失败，未生成可启动的 `out` 产物。
- 生产 Renderer HTML 已生成到 `apps/desktop/.vite/renderer/main_window/index.html`，检查确认生产 CSP 含 `connect-src 'none'`，脚本和样式均使用本地相对资源。
- 已创建 packaged Playwright smoke 测试并通过 TypeScript 检查，但因为 Forge package 尚未成功，测试尚未运行。
- 原计划用 `DEBUG=electron-forge:*,electron-packager` 重跑 package 获取被 spinner 隐藏的具体异常；该诊断命令在用户暂停时取消，未产生新结果。
- 恢复后的第一条命令（PowerShell）：`$env:Path = 'C:\Program Files\nodejs;' + $env:Path; $env:DEBUG = 'electron-forge:*,electron-packager'; npm run package`
- 首要排查假设：`packagerConfig.extraResource` 指向 sibling workspace 的 Core 目录，可能与 npm workspace 下 Packager 的复制/路径边界有关。必须先看 DEBUG 异常再改配置，不凭假设修改。

### 下一步计划

按以下顺序执行。前一步没有通过时不扩大范围，修复后重跑同一个检查。

#### 1. 定位 Forge Copying files 失败

- 目标：取得首次 package 失败时被 spinner 隐藏的完整异常、源路径和目标路径。
- 首条命令：`$env:Path = 'C:\Program Files\nodejs;' + $env:Path; $env:DEBUG = 'electron-forge:*,electron-packager'; npm run package`
- 重点检查：`packagerConfig.extraResource` 是否允许复制 `apps/desktop` 外的 `apps/proxy-core-node/dist/proxy-core`；是否存在 ASAR、workspace root 或 Windows 路径相关限制。
- 判定标准：日志明确指出一个具体失败操作，不以“可能是路径问题”作为结论。

#### 2. 对复制失败做最小修复

- 目标：只修复日志证明的 Packager 路径或资源准备问题，不改动已经通过构建的 Main/Preload/Renderer 代码。
- 优先方案：若 Packager 不接受 sibling workspace 资源，则在 package 前把 Core 产物复制到 Desktop 内部的临时资源目录，再让 `extraResource` 指向该目录；临时目录必须加入 `.gitignore`，复制动作必须可重复且失败即中止。
- 备选方案：若根因是配置相对目录解析，则只改为基于 `forge.config.ts` 绝对路径的正确资源路径。
- 验证命令：`npm run package`。
- 完成标准：Forge 的 Vite 构建、Copying files、Preparing native dependencies、Finalizing package 和 postPackage hooks 全部成功，并生成 Windows x64 可执行产物。

#### 3. 检查打包产物结构与安全边界

- 目标：确认开发态成功没有掩盖 packaged path 或依赖泄漏。
- 必查项：
  - `Interceptor.exe` 存在。
  - `resources/proxy-core/index.cjs` 存在，且路径与 `process.resourcesPath` 解析一致。
  - Renderer 生产 HTML 使用本地相对 JS/CSS，并包含 `connect-src 'none'` 的 CSP。
  - 最终运行资源不包含 Forge CLI、`node-gyp`、旧 `tar` 等开发工具链。
  - Electron Fuses 已应用：RunAsNode、`NODE_OPTIONS`、CLI inspect 被禁用，ASAR integrity 与 OnlyLoadAppFromAsar 开启。
- 完成标准：路径、安全配置和运行依赖均符合方案；发现偏差先修复 package 配置，再运行 smoke。

#### 4. 运行 Packaged Playwright smoke

- 命令：`npm run test:smoke --workspace @interceptor/desktop`。根脚本 `npm run test:smoke` 会重新 package，只有需要完整复验时使用。
- 已有断言：应用壳可见、Workspace 导航可见、Renderer 中 `process`/`require` 不存在、Preload 仅暴露两个 API、生产 CSP 生效、Core 进入 healthy 并显示 PID、暗色主题可切换、900×600 布局可见、关闭应用后 Core PID 不存活。
- 产物：保留 1280×800 与 900×600 两张 Playwright 截图用于 Review。
- 完成标准：smoke 全部通过，无残留 Interceptor/Core 进程；失败时优先修复同一行为并重跑该测试。

#### 5. 验证开发启动与 HMR

- 目标：补齐 T0.1 中不能由 package smoke 代替的 Dev Server 验收。
- 启动命令：`npm run dev`，该命令先构建 Core，再由 Forge Vite 启动 Electron。
- 检查项：开发窗口正常显示、Core 状态变为 healthy、Renderer 控制台没有 CSP/资源错误；修改一处仅开发可见的 Renderer 文本或样式后页面无整应用重启即更新，再撤销该探针改动。
- 完成标准：main/preload/renderer 三入口开发启动成功，Renderer HMR 有实际变更证据，退出后不残留 Core。

#### 6. 执行 M0 最终验收

- 命令顺序：
  1. `npm run typecheck`
  2. `npm run test:unit`
  3. `npm run package`
  4. `npm run test:smoke --workspace @interceptor/desktop`
  5. `npm audit --omit=dev`
  6. `git diff --check`
- M0 完成标准：T0.1–T0.5 的交付物与验证全部通过；生产依赖保持 0 漏洞；Forge 开发链已知审计风险保留清晰记录；`PROGRESS.md` 更新为 M0 已完成并指向 M1 第一任务。

#### 7. 收尾与下一里程碑

- 将 M0 的最终验证命令、结果、截图位置、关键实现和剩余风险写回本文件。
- 提交 M0 完成代码，不把 `.vite`、`dist`、`out`、Playwright 报告或截图等生成物提交到 Git。
- 下一里程碑从 M1/T1.1 开始：定义版本化 Protobuf handshake、command/correlation、event、query、body range、rule lifecycle 与 health schema；不要直接复用 M0 的临时 parent-port 消息作为持久协议。

### M0 / T0.1 项目脚手架

- 状态：进行中
- 进度：45%
- 已完成：
  - 完成技术栈、monorepo 目录和 main/preload/renderer 构建入口设计。
  - 安装 Node.js `24.18.0` LTS 和 npm `11.16.0`。
  - 确认 npm workspaces 作为 monorepo 包管理基础。
  - 创建根 workspace、Desktop 包和 Proxy Core 包的第一版清单。
  - 精确锁定 Electron、Forge、Vite、React、Ant Design、Vitest、Playwright、TypeScript、类型和字体依赖。
  - 通过严格安装检查发现并修正 `@electron/fuses` peer dependency 冲突。
  - 修正后完成 `npm install`，生成 lockfile；安装 594 个包并审计 597 个包。
  - 确认 Forge `8.0.0-alpha.5` 起支持 Fuses 2.x，但稳定版尚不支持；决定留在稳定 Forge 7.11.2 + Fuses 1.8.0。
  - 创建 Proxy Core 严格 TypeScript 配置和独立 CommonJS 入口，首次构建通过。
  - 实现可测试的 Main 侧 Core Supervisor，3 条生命周期单元测试通过。
  - 完成依赖审计分层：生产依赖 0 漏洞，23 个问题均来自 Forge 开发工具链。
  - 配置 Forge/Vite main、preload、renderer 三入口和 Core `extraResource` 打包路径。
  - 完成 UtilityProcess 适配、安全 BrowserWindow、IPC sender 校验和窄 Preload API；Desktop typecheck 通过。
  - 完成 Ant Design v6 桌面应用壳、亮暗主题、Core 状态栏和开发/生产分离 CSP；Renderer typecheck 通过。
  - 根级 Desktop/Core typecheck、完整 Vitest 单元测试和 diff whitespace 检查均通过。
- 剩余：
  - 审阅安装报告中的 23 个依赖漏洞（3 low、20 high），区分生产与开发依赖影响。
  - 创建 Desktop 与 Proxy Core 源码入口。
  - 配置 Forge/Vite/TypeScript 并验证构建和 HMR。
- 阻塞：无。

## M0 剩余步骤

| 任务 | 状态 | 当前进展 | 剩余工作 | 完成标准 |
| --- | --- | --- | --- | --- |
| T0.1 项目脚手架 | 进行中 | workspace、依赖、三构建入口和 Core 打包资源路径已配置；Desktop/Core 分别通过类型检查或构建 | 创建 Renderer 入口；验证 Forge build、开发窗口和 HMR | main/preload/renderer 三入口就绪，开发窗口可启动且 HMR 生效 |
| T0.2 UI 应用壳 | 进行中 | Toolbar、Workspace Sidebar、Session/Inspector Content、Status Bar 和亮暗主题已实现并通过 typecheck | 启动应用做视觉/交互检查；Playwright 验证主题切换与布局 | 完整外壳可见，亮色/暗色可切换 |
| T0.3 安全基线 | 进行中 | sandbox/contextIsolation/webSecurity、禁 Node、权限/导航/弹窗/下载拒绝、sender 校验、窄 Preload API 和环境分离 CSP 均已实现 | 打包 smoke 断言 Renderer 无 Node 全局与 API 边界；检查生产 CSP | Renderer 无 Node.js 全局，危险导航和权限被拒绝 |
| T0.4 测试工具链 | 进行中 | Vitest 已配置，Supervisor 的 3 条单元测试通过 | 配置 Playwright Electron smoke 并验证打包产物 | 单测通过，打包产物启动 smoke 通过 |
| T0.5 Proxy Core 骨架 | 进行中 | Core 控制循环、Supervisor 和 UtilityProcess 适配已接通；生命周期单测和 Desktop typecheck 通过 | 打包运行并验证健康状态、崩溃重启与应用退出无残留 | 生命周期自动化测试通过，应用退出不残留 core 进程 |

## 步骤实施详情

本节用于代码 Review。每个已开始步骤均记录目标、方案、文件级改动、关键配置、设计理由、验证、风险和剩余项；后续步骤沿用同一结构。

### T0.1 Electron Forge + Vite + React + TypeScript 骨架

#### 目标与边界

- 建立可独立构建的 Electron Desktop 和 Node Proxy Core 两个 workspace。
- 本步骤只建立工程与构建边界，不提前实现代理协议、存储或 IPC 协议。
- Desktop 最终提供 main、preload、renderer 三个入口；Proxy Core 必须保持独立进程和独立构建产物。

#### 实现方案

- 使用 npm workspaces 管理 `apps/*` 与未来的 `packages/*`，根包只负责编排，不承载产品运行时代码。
- Desktop 使用 Electron Forge 官方 Vite 插件，后续分别配置 main、preload、renderer 构建。
- Proxy Core 使用独立 `tsc` 构建，产物目标为 CommonJS，便于由 Electron Main 通过 Node 可执行文件启动。
- 所有直接依赖写精确版本；`.npmrc` 同时启用 `save-exact` 和严格 engine 检查。

#### 文件级改动

| 文件 | 实现详情 | Review 关注点 |
| --- | --- | --- |
| `package.json` | 定义私有根包、`apps/*`/`packages/*` workspaces、Node/npm engine、开发/打包/测试/typecheck 编排脚本；根脚本先构建 Core，再启动或打包 Desktop | 根包不应引入产品运行时依赖；脚本不能让 Proxy Core 隐式耦合 Renderer |
| `apps/desktop/package.json` | 定义 Forge 入口 `.vite/build/main.js`；锁定 Electron 43.1、Forge 7.11、Vite 8.1、React 19.2、Ant Design 6.5、Vitest 4.1、Playwright 1.61 和本地字体 | Forge 与 Vite 插件版本必须一致；运行时依赖和开发依赖分类应清晰 |
| `apps/proxy-core-node/package.json` | 定义独立私有包、CommonJS 产物入口、`build` 与 `typecheck` 脚本 | Core 不得依赖 Electron 或 Renderer 包 |
| `tsconfig.base.json` | 建立共享严格 TypeScript 基线：`strict`、`noImplicitOverride`、`noUncheckedIndexedAccess`、大小写一致和 ES2023 target | 子项目只能按运行环境补充配置，不应放宽安全相关检查 |
| `.npmrc` | 启用 `engine-strict=true` 与 `save-exact=true` | 不允许用宽松依赖范围掩盖工具链漂移 |
| `.nvmrc` | 固定开发基线 Node.js `24.18.0` | CI 和其他开发机应使用同一 LTS 版本 |
| `.gitignore` | 忽略依赖、Forge/Vite/TS 产物、测试报告、日志和环境变量文件 | 不应忽略源代码、lockfile 或进度文档 |

#### 依赖版本与兼容性

| 组件 | 锁定版本 | 已核对约束 |
| --- | ---: | --- |
| Node.js / npm | 24.18.0 / 11.16.0 | 本机已安装并验证；根 `engines` 与 `.nvmrc` 一致 |
| Electron | 43.1.0 | 要求 Node `>=22.12.0`，满足 |
| Electron Forge / Vite Plugin / Fuses Plugin | 7.11.2 | 三个 Forge 包保持同版本；Vite 插件仍为 Experimental，因此精确锁定 |
| Vite / React Plugin | 8.1.4 / 6.0.3 | 均支持 Node `>=22.12.0`；React Plugin peer 要求 Vite 8 |
| React / React DOM | 19.2.7 | 与 Ant Design `react >=18` 约束兼容 |
| Ant Design / Icons | 6.5.0 / 6.3.2 | 满足方案指定的 Ant Design v6 |
| TypeScript / Node Types | 7.0.2 / 24.13.3 | Node 类型与运行时主版本对齐 |
| Vitest / Playwright | 4.1.10 / 1.61.1 | Vitest 支持 Vite 8 和 Node 24；Playwright 要求 Node 18+ |
| IBM Plex Sans / Mono | 5.2.8 / 5.2.7 | 字体随应用本地打包，不依赖远程字体资源 |

#### 已发现并处理的问题

1. `@fontsource-variable/ibm-plex-mono` 在 npm 中不存在。处理：Sans 使用 variable 包，Mono 改用存在的 `@fontsource/ibm-plex-mono@5.2.7`。
2. 初始选择最新 `@electron/fuses@2.1.3`，但 `@electron-forge/plugin-fuses@7.11.2` 的 peer 要求 `^1.0.0`。严格 `npm install` 以 `ERESOLVE` 失败。处理：锁定最新兼容的 `@electron/fuses@1.8.0`，未使用 `--force` 或 `--legacy-peer-deps`。
3. npm 全量发布元数据表明，Forge `8.0.0-alpha.5` 是首个把 peer 改为 `@electron/fuses ^2.0.0` 的版本，当前 alpha 为 `8.0.0-alpha.10`；所有稳定版仍要求 Fuses 1.x。
4. Forge 8 alpha 的 `plugin-fuses` 精确依赖同版 `plugin-base` 和 `shared-types`，CLI 与 Vite Plugin 也有对应 alpha。因此不能在 Forge 7 中单独升级 Fuses；本项目优先稳定工具链，暂不切换整套 Forge 8 alpha。

#### 验证状态

- 已通过：Node/npm/npx 可执行文件与版本检查。
- 已通过：Electron、Forge、Vite、Vitest、Ant Design 和 Playwright 的 engine/peer metadata 人工核对。
- 已失败并修正：首次 `npm install` 暴露 Fuses 2.x/1.x peer 冲突。
- 已通过：修正后的 `npm install`，新增 594 个包并审计 597 个包，lockfile 已生成。
- 待处理：npm 报告 23 个漏洞（3 low、20 high），需要运行详细 audit 并判断对打包运行时的影响。
- 已通过：根级 TypeScript typecheck 和完整 Vitest 单元测试。
- 尚未执行：Forge package、打包应用启动和 HMR。

#### 已知风险与后续 Review

- Forge Vite 插件仍是 Experimental；每次升级必须重新验证 HMR、sandboxed preload 与 packaged asset path。
- TypeScript 7 为新主版本，后续若 Forge/Vite 类型定义出现兼容问题，优先定位具体类型错误，不放宽整个项目的严格配置。
- 当前只创建清单，Desktop 与 Core 入口尚未落地，因此 T0.1 不能标记完成。

### T0.5 Proxy Core 进程骨架

#### 当前实现

- `apps/proxy-core-node/tsconfig.json` 将 Core 限定为 Node 24 类型、Node16 模块解析、CommonJS `.cjs` 产物和独立 `dist` 目录。
- `apps/proxy-core-node/src/proxy-core/index.cts` 只实现控制面，不包含代理协议逻辑：启动发送 `ready`，每秒发送 `heartbeat`，响应带 correlation ID 的 `health-check`，收到 `shutdown` 后停止定时器、发送 `stopped` 并正常退出。
- Core 通过运行时形状声明访问 UtilityProcess 注入的 `process.parentPort`，因此源码不依赖 Electron 包；若被错误地直接用 Node 启动，会输出明确错误并以非零状态结束。
- 所有父进程消息先执行运行时结构校验；未知消息被忽略，不直接解构不可信输入。
- `apps/desktop/src/main/core/core-supervisor.ts` 以 `CoreProcessHandle` 抽象隔离 Electron：维护期望运行状态、状态快照和订阅，提供 correlation health check、4 秒 heartbeat 失联检测、指数退避重启、优雅 shutdown 与超时 kill。
- `apps/desktop/src/main/core/core-supervisor.test.ts` 使用内存 Fake Process 和 Vitest fake timers，确定性覆盖正常生命周期、250 ms 首次退避重启和 100 ms 停止超时强杀。
- `apps/desktop/src/shared/desktop-api.ts` 定义跨 main/preload/renderer 共用的只读 `CoreStatus` 与窄 `InterceptorDesktopApi`，不暴露进程控制或通用 IPC。
- `apps/desktop/src/main/core/electron-core-process.ts` 将 Electron `UtilityProcess` 映射到 `CoreProcessHandle`；开发态从 sibling workspace 读取 Core，打包态从 `process.resourcesPath/proxy-core/index.cjs` 读取，并为日志增加固定前缀。
- `forge.config.ts` 通过 Packager `extraResource` 把 Core 目录复制为 `resources/proxy-core`，与运行时路径形成可验证约定；同时启用 ASAR 和官方安全 Fuses。

#### Review 关注点

- 当前 heartbeat 周期固定为 1 秒，Main Supervisor 的失联阈值尚未实现；阈值应明显大于单次 heartbeat 周期，避免短暂主线程繁忙导致误重启。
- `process.exit(0)` 延迟到 `setImmediate`，保证 `stopped` 消息先进入发送队列；Main 仍需有超时后的强制 `kill` 兜底。
- M1 会把临时结构化控制消息迁移到版本化协议和 Named Pipe/UDS；M0 的 UtilityProcess parent port 仅承担进程生命周期控制，不承载网络会话数据。
- Supervisor 默认每次重启延迟按 250 ms、500 ms、1 s 递增并封顶 5 s；当前计数不会在稳定运行后归零，后续可在 M1 加入“稳定窗口”策略。

### T0.3 Electron 安全基线

#### 当前实现

- `BrowserWindow.webPreferences` 明确设置 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`，Preload 使用打包后的本地入口。
- 所有 permission request/check 默认拒绝；禁用 webview attach、新窗口、Renderer 导航、下载和外部 URL 打开入口。
- Main IPC 目前只有 `core:get-status`，并验证 sender URL；Preload 仅暴露 `getCoreStatus` 和 `onCoreStatusChange`，没有通用 send/invoke、文件系统或进程控制 API。
- Forge Fuses 禁用 RunAsNode、`NODE_OPTIONS` 和 CLI inspect 参数，启用 cookie encryption、ASAR integrity 和 OnlyLoadAppFromAsar。

#### 剩余验证

- Renderer `index.html` 尚需加入严格 CSP；开发态只允许本机 Vite HMR 所需连接，生产态不得允许远程资源。
- Packaged Playwright smoke 必须断言 `window.process`、`window.require` 不存在，且 `window.interceptor` 只有两个预期方法。
- 需要检查最终 `resources/app.asar` 不包含 Forge、node-gyp、tar 等开发工具依赖。

### T0.2 Ant Design 应用壳

#### 当前实现

- `src/renderer/app.tsx` 建立固定桌面工具信息架构：52 px Toolbar、216 px Workspace Sidebar、可调整的 Session/Inspector 主区域和 28 px Status Bar。
- Toolbar 使用图标按钮承载 Capture/Pause/Clear/Settings，未实现的产品命令保持 disabled；Filter 使用输入框，主题使用 Segmented 图标控件。
- Capture 工作区使用 Ant Design Splitter，左侧预留 Session 列布局，右侧预留 Inspector Tabs；Rules 与 Composer 提供可切换的无数据工作区，不伪造业务功能。
- Renderer 通过窄 Preload API读取并订阅 CoreStatus，Status Bar 显示 Core 状态、PID、重启次数和错误详情。
- 主题存入 localStorage，并以 `startTransition` 切换；首启跟随系统 `prefers-color-scheme`。Design Tokens 使用中性灰、青绿色操作色、红色录制状态和黄色过渡状态，亮暗算法由 Ant Design 提供。
- 字体全部本地打包：IBM Plex Sans Variable 用于界面，IBM Plex Mono 用于 PID/地址等技术文本；不请求远程 CDN。
- `styles.css` 使用稳定 Grid 尺寸、Splitter 最小宽度、键盘 focus-visible、reduced-motion 和 1040 px 紧凑断点，避免动态状态导致布局跳动。

#### CSP 实现

- `vite.renderer.config.ts` 通过 `transformIndexHtml` 注入环境对应 CSP，源码 HTML 不硬编码 Dev Server 端口。
- 生产 CSP：脚本仅 `'self'`、`connect-src 'none'`、禁止 object/base/form/frame ancestor；仅为 Ant Design CSS-in-JS 保留 `style-src 'unsafe-inline'`。
- 开发 CSP：在生产基线上仅增加 Vite React Refresh 所需 inline script 和 localhost WebSocket 连接；远程 HTTP(S) 资源仍未开放。

#### 类型兼容修正

1. Ant Design v6 的 `theme.cssVar` 不再接受布尔值，改为 `{ prefix: 'interceptor' }`，避免应用间 CSS 变量命名碰撞。
2. TypeScript 7 对 CSS-only package root side-effect import 更严格；Fontsource Sans 改用显式导出 `@fontsource-variable/ibm-plex-sans/index.css`，并加入 Vite client 资源模块声明。

#### 待 Review

- 目前最小窗口为 880×560，属于桌面应用，不承诺手机布局；需要在 880×560、1280×800 和高 DPI 下做截图检查。
- M0 只提供结构与空状态，Capture 命令保持禁用；不能把 UI 占位误判为 M3/M4 业务能力。

### M0 依赖审计

- `npm audit --omit=dev`：生产依赖 75 个，漏洞为 0。
- 完整 `npm audit`：3 low、20 high、0 critical；主要依赖链为 Forge CLI → `@electron/rebuild` / `@electron/node-gyp` → 旧 `tar`，以及 CLI prompts → `external-editor` / `tmp`。
- 这些包仅用于安装、构建和打包，不应出现在最终 app.asar 运行依赖中；Packaged Artifact 后续必须检查这一点。
- Forge 7 当前对这些链条没有完整可用修复；`npm audit fix --force` 会打散精确锁定版本，因此不执行。风险暂按开发工具链隔离，并等待 Forge 稳定版修复。

## 后续未开始步骤

- M1–M13 均未开始；详细任务和依赖以 `桌面网络调试代理完整方案.md` 第二十七章为准。
- 当前关键路径：M0 → M2 → M3 → M5 → M11 → M12 → M13。
- 最早可用路径：M0 → M1 → M2 → M3 → M4，完成后可实时查看 HTTP 流量。

## 关键决策

- 高吞吐代理数据面不进入 Electron Main 或 Renderer；Proxy Core 独立运行。
- Renderer 只通过类型明确、面向意图的 Preload API 获取必要状态，不暴露通用 IPC、文件系统或 Node.js API。
- npm workspaces 作为当前 monorepo 的最小包管理基础；若实际工具链验证不通过，再记录并调整。
- 开发工具链基线采用 Node.js `24.18.0` LTS 与 npm `11.16.0`。
- Electron 工具链采用稳定 Forge `7.11.2` + `@electron/fuses 1.8.0`；Forge 8 alpha 虽支持 Fuses 2.x，但 M0 不承担整套预发布工具链风险。
- UI 采用紧凑、中性、适合重复操作的桌面工具视觉，不直接套用通用后台模板。
- 所有依赖在项目启动阶段精确锁定，并通过受控流程升级。

## 验证记录

| 时间 | 命令或检查 | 结果 | 后续动作 |
| --- | --- | --- | --- |
| 2026-07-10 | 阅读产品方案 M0 及相关架构章节 | 通过；范围、依赖和验收标准已明确 | 开始工程初始化 |
| 2026-07-10 | 查阅 Electron Forge Vite 官方配置 | 通过；确认三类构建入口、HMR 和 packaged path 约束 | 按官方配置创建骨架 |
| 2026-07-10 | `node --version; npm --version; npx --version` | 失败；三个命令均不可用 | 定位或安装 Node.js LTS |
| 2026-07-10 | 使用 `winget` 安装 `OpenJS.NodeJS.LTS` | 通过；官方 Node.js `24.18.0` 安装成功 | 验证可执行文件与版本 |
| 2026-07-10 | `node --version; npm --version; npx --version` | 通过；分别为 `v24.18.0`、`11.16.0`、`11.16.0` | 开始锁定工程依赖并创建脚手架 |
| 2026-07-10 | 首次 `npm install` | 失败；`plugin-fuses@7.11.2` 与 `@electron/fuses@2.1.3` peer 冲突 | 锁定兼容的 `@electron/fuses@1.8.0` 后复验 |
| 2026-07-10 | npm registry engine/peer metadata 检查 | 通过；Node 24 满足 Electron/Forge/Vite/Vitest/Playwright 声明范围 | 创建精确版本清单 |
| 2026-07-10 | 修正后的 `npm install` | 通过；新增 594 包、审计 597 包；报告 3 low/20 high 漏洞 | 审阅详细 audit，不自动执行破坏性修复 |
| 2026-07-11 | 检查所有 `plugin-fuses` 发布版本 | 通过；`8.0.0-alpha.5` 起接受 Fuses 2.x，稳定版均不接受 | 保留 Forge 7.11.2 + Fuses 1.8.0 |
| 2026-07-11 | 检查 Forge 8 alpha 包依赖 | 通过；plugin-fuses 精确依赖同版 Forge 8 alpha 基础包 | 不混用 Forge 7 与 Forge 8 alpha 包 |
| 2026-07-11 | `npm run build --workspace @interceptor/proxy-core-node` | 通过；生成独立 CommonJS Core 产物 | 实现 Main Supervisor 并接入生命周期 |
| 2026-07-11 | `npm audit --omit=dev --json` | 通过；生产依赖 0 漏洞 | 审阅开发工具链风险 |
| 2026-07-11 | 完整 `npm audit --json` | 3 low、20 high，全部位于 Forge/CLI 开发链且当前无稳定版完整修复 | 不强制改写 lockfile；验证问题不进入打包运行时 |
| 2026-07-11 | `vitest run ...core-supervisor.test.ts` | 通过；1 个测试文件、3 条测试全部通过 | 接入 Electron UtilityProcess 并做打包 smoke |
| 2026-07-11 | `npm run typecheck --workspace @interceptor/desktop` | 通过；Forge、UtilityProcess、Main、Preload 和 Supervisor 类型均无错误 | 实现 Renderer/CSP 后重跑全量检查 |
| 2026-07-11 | Renderer 首次 typecheck | 失败；Ant Design v6 `cssVar` 类型与 TypeScript 7 CSS 模块解析不匹配 | 改用 cssVar 配置对象和 Vite client 声明 |
| 2026-07-11 | Renderer 第二次 typecheck | 失败；Fontsource variable 根入口缺少可接受的副作用模块声明 | 改用包内显式 `index.css` export |
| 2026-07-11 | Renderer 修正后 typecheck | 通过；应用壳、主题、状态订阅和 CSP Vite Plugin 类型无错误 | 执行根级检查和 Forge package |
| 2026-07-11 | `npm run typecheck` | 通过；Desktop 与 Proxy Core workspace 均无类型错误 | 执行 Forge package |
| 2026-07-11 | `npm run test:unit` | 通过；1 个测试文件、3 条测试全部通过 | 保留为 M0 单元测试基线 |
| 2026-07-11 | `git diff --check` | 通过；当前全部改动无 whitespace error | 开始打包验证 |
| 2026-07-11 | 首次 `npm run package` | 部分通过；Core 与 Vite 三入口构建成功，Packager 在 `Copying files` 失败，未生成 `out` | 用 DEBUG 日志定位复制异常 |
| 2026-07-11 | Packager DEBUG 重跑 | 已取消；用户要求暂停，未继续执行 | 下一次 Session 从该命令恢复 |

## 变更文件

- `桌面网络调试代理完整方案.md`：完整产品与开发方案，已提交。
- `PROGRESS.md`：全项目进度、验证和跨 Session 交接记录。
- `package.json`：根 npm workspace、工具链约束和跨包脚本。
- `apps/desktop/package.json`：Electron Desktop 运行时、构建、UI 和测试依赖。
- `apps/proxy-core-node/package.json`：独立 Proxy Core 包定义。
- `apps/proxy-core-node/tsconfig.json`：Core 专用 Node/CommonJS 构建配置。
- `apps/proxy-core-node/src/proxy-core/index.cts`：ready/heartbeat/health/shutdown 控制循环。
- `apps/desktop/tsconfig.json`、`vitest.config.ts`：Desktop 严格类型检查和 Node 单测配置。
- `apps/desktop/src/shared/desktop-api.ts`：Renderer 可见的窄状态 API 契约。
- `apps/desktop/src/main/core/core-supervisor.ts`：Core 生命周期、健康和退避重启管理器。
- `apps/desktop/src/main/core/core-supervisor.test.ts`：Supervisor 生命周期单元测试。
- `apps/desktop/forge.config.ts`：Vite 三入口、Core extraResource、ASAR 和 Electron Fuses。
- `apps/desktop/vite.*.config.ts`：Main、Preload、Renderer 的独立 Vite 配置。
- `apps/desktop/src/main/core/electron-core-process.ts`：UtilityProcess 运行时适配和 Core 路径解析。
- `apps/desktop/src/main/main.ts`：安全窗口、应用生命周期、Core Supervisor 和只读 IPC。
- `apps/desktop/src/preload/preload.ts`、`src/renderer/global.d.ts`：窄 Preload API 和 Renderer 类型声明。
- `apps/desktop/index.html`：Renderer 根节点与构建时 CSP 占位符。
- `apps/desktop/src/renderer/main.tsx`、`app.tsx`：React 入口、Ant Design 应用壳、主题和 Core 状态订阅。
- `apps/desktop/src/renderer/styles.css`：桌面工具布局、亮暗产品 Token、响应式约束和可访问性状态。
- `apps/desktop/src/renderer/vite-env.d.ts`：Vite CSS/asset 模块类型声明。
- `tsconfig.base.json`：共享严格 TypeScript 编译基线。
- `.npmrc`：严格 engines 和精确依赖保存策略。
- `.nvmrc`：Node.js LTS 版本基线。
- `.gitignore`：工程产物、报告、日志和本地配置排除规则。
- `package-lock.json`：npm 11 生成的完整依赖锁文件。

## Session 交接规则

1. 新 Session 首先阅读本文件，再按需阅读产品方案中的当前里程碑章节。
2. 从“项目快照”的“下一步”和“进行中步骤”继续，不重复已完成工作。
3. 任务一旦开始，立即把状态改为 `进行中`，写明进度详情。
4. 每次实现或验证取得进展后，同步更新里程碑总览、对应步骤、验证记录、变更文件和下一步。
5. 只有在交付物实现且验证通过后，才把任务标记为 `已完成`。