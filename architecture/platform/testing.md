# 平台架构：测试分层

> 最后更新：2026-09-05
> 范围：三套互不替代的测试层，以及它们的边界与当前实现状态。

## 1. 三层职责

| 层 | 位置 | 驱动方式 | 职责 |
| --- | --- | --- | --- |
| 单元 / 集成 | 各 workspace 的 `tests/` | Vitest（`environment: node`） | 纯逻辑、真实 worker_threads、真实 `node:sqlite`、真实 HTTP/2 |
| Local E2E workflow | `apps/desktop/tests/e2e-workflow-tests/` | Playwright `_electron.launch()` | 从真实 App UI 出发的端到端 workflow |
| Packaged smoke | `apps/desktop/tests/packaged-smoke/` | 最终 package + CDP | 打包产物的综合验证 |
| 设计一致性 | `apps/desktop/tests/visual-parity/` | 测试目录内 fake Preload | Renderer 与 `design-vite/` 的几何/像素一致性 |
| 人工验收工具 | `apps/playground/` | Browser手动点击 + Node Traffic Lab | 最新MCP全部详情、逐Tool人工结论与可控协议流量；不替代任何自动层 |

**三套测试职责独立，不能互相冒充覆盖。**

## 2. Local E2E driver

- **Local production driver**：`e2e-workflow-tests/` 使用 Playwright `_electron.launch()` 启动测试拥有的 Electron，**不附着人工 Forge 进程**。`prepare-local.mjs` 复用 Forge Vite entry/config 生成 `.vite/build` 与 `.vite/renderer/main_window` 的 production bundle，不执行 Electron Packager；Core、协议包和 native system-proxy helper 仍走真实构建。
- **统一安全 Renderer origin**：Main 只要没有 `MAIN_WINDOW_VITE_DEV_SERVER_URL` 就安装 `PackagedRendererProtocol`，因此 local production bundle 与最终 package 都从 `interceptor://app/index.html` 加载；开发 HMR 仍使用精确 Vite origin。该条件不依赖 `app.isPackaged`，但可信导航与 CSP 边界不放宽。
- **生命周期与证据**：`fixtures/local-electron-driver.ts` 为每个测试创建独立临时 `userData`，启动 BrowserContext trace，等待真实 Renderer/Core/8888 listener，并在 workflow 后保存 `trace.zip`、`final.png`、Main/Renderer 日志和 PID/端口 metadata；产品 Close 后验证 Main/Core 退出与 8888 可重新 bind，强制关闭只作 finally 兜底。
- **失败时保留特权profile**：调用`preserveUserDataOnFailure()`的workflow，在Playwright实际状态为`failed`、`timedOut`或`interrupted`时必须保留profile，不能仅判断`await use(driver)`是否抛错；任何清理或宿主guard错误也必须保留。判定归`fixtures/workflow-profile-retention.ts`，unit覆盖状态与错误组合。CA清理按本轮身份和真实信任状态等待正式UI，不以按钮瞬时不可见当作已清理。
- **零 Mock / 零 seed输入边界**：测试操作通过公共 automation ID 进入真实 App UI，再走 Preload/Main/Core/Storage/Proxy/Worker；测试侧只拥有loopback origin/client、证据与清理。导入文件必须由同一workflow先经产品Export真实产生，测试只能只读核验并重新选择，不得自行构造业务输入。`fixtures/windows-file-dialog.ts`用Windows UI Automation定位真实Open/Save Dialog，再用真实鼠标键盘选择路径，不改写dialog返回值；`fixtures/loopback-lab.ts`提供随机origin port，但被测Proxy listener保持产品默认`127.0.0.1:8888`。**禁止 `page.evaluate(window.interceptor.*)` 代替业务操作。**

## 3. 当前实现状态

Inventory与详细验收规格位于`e2e-workflow-tests/README.md`与`docs/`。`workflows/`当前有
38条可执行真实Electron workflow；已通过项均保留实现前或retrospective Red、当前Green、trace/evidence
与完整销毁门禁。其余条目仍按各自Inventory状态管理（`rules.apply-conflict`保留真实双实例前置blocker）。
只有同一workflow的Red/Green与销毁证据闭环后，才可更新为passed并把同一contract接入packaged driver。

`packaged-smoke/startup.spec.ts`仍是最终package的综合CDP smoke，尚未复用完整Inventory contract。

`apps/playground`不是测试Runner。Vitest只覆盖配置解析、Token脱敏、报告完整性和真实socket Traffic Lab；
`mcp.browser-playground-cors`证明真实Electron与系统Edge的Browser → Main → Core链路。24项Tool的Pass / Fail /
Blocked仍必须由Developer在Playground逐项点击并观察产品与origin后填写，不能由自动Green代替。

## 4. 执行约束

- **Proxy Core 全套必须 `--no-file-parallelism`**。大压缩流、真实文件 I/O 与随机端口并行会产生 5 秒假超时；与 desktop 并行运行时 `proxy/tests/integration/h2.test.ts` 会假失败。
- **禁止并行运行 `build:core` 与依赖 `dist` 的集成测试**。`build.mjs` 每次先递归删除 `dist`，而真实代理集成测试运行时依赖该目录，并行会导致瞬时 `ECONNRESET`。必须构建完成后再顺序跑测试。
- 集成测试用 `describe.skipIf(!existsSync(workerBundle))` 保护，worker bundle 不存在时整体跳过。

## 5. 常用命令

```powershell
npm run typecheck
npm run test --workspace @interceptor/desktop
npm run test --workspace @interceptor/proxy-core -- --no-file-parallelism
npm run test --workspace @interceptor/core-protocol
npm run test --workspace @interceptor/mcp-server
node apps/desktop/tests/visual-parity/parity.mjs
```

完整 parity 在 `1600×900`、`deviceScaleFactor=2` 下按每批 5 个 view 启动独立 Edge 子进程；每个 view
仍使用独立 BrowserContext。10–20 view 批次会在完整 146-view 运行中形成过高内存峰值，表现为后续
page/context 被浏览器关闭；5-view 批次控制峰值，不改变单个 view 的状态、断言或像素算法。子进程的
browser、Vite 与 design preview 统一在 `finally` 关闭，失败不得遗留测试 server。

涉及 Main / Preload / IPC / Fuses / CSP / 打包边界时追加：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:package-audit --workspace @interceptor/desktop
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
```
