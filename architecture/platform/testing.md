# 平台架构：测试分层

> 最后更新：2026-09-18
> 范围：三套互不替代的测试层，以及它们的边界与当前实现状态。

## 1. 三层职责

| 层 | 位置 | 驱动方式 | 职责 |
| --- | --- | --- | --- |
| 单元 / 集成 | 各 workspace 的 `tests/` | Vitest（`environment: node`） | 纯逻辑、真实 worker_threads、真实 `node:sqlite`、真实 HTTP/2 |
| E2E workflow | `apps/desktop/tests/e2e-workflow-tests/` | Windows `_electron.launch()`；macOS未打包Electron+Renderer CDP，可显式选择签名产物 | 从真实 App UI 出发的端到端 workflow |
| Packaged smoke | `apps/desktop/tests/packaged-smoke/` | 最终 package + CDP | 打包产物的综合验证 |
| 设计一致性 | `apps/desktop/tests/visual-parity/` | 测试目录内 fake Preload | Renderer 与 `design-vite/` 的几何/像素一致性 |
| 人工验收工具 | `apps/playground/` | Browser手动点击 + Node Traffic Lab | 最新MCP全部详情、逐Tool人工结论与可控协议流量；不替代任何自动层 |

**三套测试职责独立，不能互相冒充覆盖。**

## 2. Local E2E driver

- **平台启动driver**：Windows继续用`_electron.launch()`启动未打包production bundle，prepare复用Forge Vite配置；macOS默认spawn同一项目的未打包Electron，以Renderer CDP驱动相同workflow。两者都由测试拥有进程，不附着人工Forge实例；协议/Core/native按正式构建顺序准备，业务E2E不要求每次package。
- **平台差异归属**：业务workflow共用操作、输入和结果。helper读取、journal位置、窗口准备、超时、故障观察/profile选择及独立系统权限检查归driver/fixture的Windows/Macos方法，不把macOS适配扩成Windows业务步骤。Windows保留WinINet六字段宿主比较、JSON证据比较和原恢复顺序；macOS完整结构比较与admin trust检查独立执行。
- **macOS窗口与日志**：业务E2E由driver按配置准备真实窗口，常规`macos`项目保持1600x900；只有body-fill滚轮边界用独立`macos-scroll-boundary`项目的1600x800，两者互斥匹配。等待System Events就绪并验证DOM尺寸，不改变Windows窗口或产品布局。macOS日志使用profile内0600文件继承给子进程，避免runner结束后保留App遭遇pipe EPIPE；日志附加前仍扫描敏感内容，证据保持有界。正常结束删除profile；恢复未完成保留profile及私有日志。
- **macOS helper**：开发与业务E2E按`app.isPackaged=false`共用获准UID的开发socket，不核准每次App构建，不因新profile/HMR/rs/重编译业务代码重新安装。原生构建按源码、工具链、签名参数及产物哈希缓存，helper自身变更才更新组件。生产App仍使用独立严格鉴权；`INTERCEPTOR_E2E_MACOS_APP_PATH`只供driver显式选择已有签名App，非产品参数，设置它时直接运行Playwright，不运行prepare。最终package仍须独立audit/smoke，开发Green不替代生产安全证据。
- **统一安全 Renderer origin**：Main 只要没有 `MAIN_WINDOW_VITE_DEV_SERVER_URL` 就安装 `PackagedRendererProtocol`，因此 local production bundle 与最终 package 都从 `interceptor://app/index.html` 加载；开发 HMR 仍使用精确 Vite origin。该条件不依赖 `app.isPackaged`，但可信导航与 CSP 边界不放宽。
- **生命周期与证据**：`fixtures/runtime/local-electron-driver.ts` 为每个测试创建独立临时 `userData`，启动 BrowserContext trace，等待真实 Renderer/Core/8888 listener，并在 workflow 后保存 `trace.zip`、`final.png`、Main/Renderer 日志和 PID/端口 metadata；产品 Close 后验证 Main/Core 退出与 8888 可重新 bind。macOS主动crash后立即落该代证据，避免同profile下一代清理日志造成缺失；原生退出用Command+Q，Windows保留Alt+F4。强制关闭只在宿主保护允许时兜底，不能作为正常退出或E2E成功证明。
- **共享CA验收**：普通workflow及smoke先只读检查已由产品初始化的用户级CA，结束保留材料和系统信任；不把共享CA复制进profile。首次初始化专项允许产品启动生成/授信，破坏性专项要求空共享目录并保存完整Root/admin trust基线。仅测试fixture声明范围，不给产品增加专用路径或开关；Windows首次窗口等待允许新CA UAC完成，业务/系统代理原生契约不变。
- **失败时保留特权profile**：调用`preserveUserDataOnFailure()`的workflow，在Playwright实际状态为`failed`、`timedOut`或`interrupted`时必须保留profile，不能仅判断`await use(driver)`是否抛错；任何清理或宿主guard错误也必须保留。判定归`fixtures/runtime/workflow-profile-retention.ts`，unit覆盖状态与错误组合。CA清理按本轮身份和真实信任状态等待正式UI，不以按钮瞬时不可见当作已清理。
- **零 Mock / 零 seed输入边界**：测试操作通过公共 automation ID 进入真实 App UI，再走 Preload/Main/Core/Storage/Proxy/Worker；测试侧只拥有loopback origin/client、证据与清理。导入文件必须由同一workflow先经产品Export真实产生，测试只能只读核验并重新选择，不得自行构造业务输入。`fixtures/ui/windows-file-dialog.ts`用Windows UI Automation定位真实Open/Save Dialog，再用真实鼠标键盘选择路径，不改写dialog返回值；`apps/playground/server/scenarios/traffic-lab.ts`提供共享协议服务与随机origin port，但被测Proxy listener保持产品默认`127.0.0.1:8888`。**禁止 `page.evaluate(window.interceptor.*)` 代替业务操作。**
- **fixture分类与协议归属**：`runtime/` 管进程与profile，`ui/` 管真实控件驱动，`safety/` 管宿主恢复，`agent/` 管模型模拟；已有辅助单测随所属目录保留。`trafficLab`为每条workflow统一拥有Playground的HTTP、WebSocket和按需TLS服务，场景运行与细粒度控制共享origin。E2E可直接使用Node流量API；Browser Playground只在页面或Browser MCP流程需要时启动。详细边界见[fixtures说明](../../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)。

## 3. 当前实现状态

Inventory与详细验收规格位于`e2e-workflow-tests/README.md`与`docs/`，当前可执行数量通过Playwright `--list`确认。已通过项均保留实现前或retrospective Red、当前Green、trace/evidence
与完整销毁门禁。其余条目仍按各自Inventory状态管理（`rules.apply-conflict`保留真实双实例前置blocker）。
只有同一workflow的Red/Green与销毁证据闭环后，才可更新为passed并把同一contract接入packaged driver。

`packaged-smoke/startup.spec.ts`仍是最终package的综合CDP smoke，尚未复用完整Inventory contract。

macOS常驻helper独立于每条workflow的Main/Core，不作为它们的子进程清除；测试结束仍须证明全部App代际、8888和系统代理/证书恢复。整轮组件的保留或卸载按用户授权处理，不能以helper仍运行掩盖App残留，也不能在每条workflow拆除组件破坏跨启动复用验收。Core故障读取完整原代理并观察旧journal代际退出，自动重接管后核验新original/owned不变；两端均使用用户级journal跨profile恢复，Windows原路径/格式保持。

`apps/playground`不是测试Runner。Vitest只覆盖配置解析、Token脱敏、报告完整性和真实socket Traffic Lab；
`mcp.browser-playground-cors`证明真实Electron与系统Edge的Browser → Main → Core链路。24项Tool的Pass / Fail /
Blocked仍必须由Developer在Playground逐项点击并观察产品与origin后填写，不能由自动Green代替。

## 4. 执行约束

- parity使用显式`headless:true`、`--no-proxy-server`的Edge和`windowsHide:true`的Node子进程，不创建可见测试窗口，不调用系统键鼠、前置或置顶。直连仅用于parity浏览器，避免设计/font请求经过被测系统代理，不改App或宿主代理设置。页面内的Playwright DOM操作不需要OS前台焦点；真实Electron窗口恢复、Open/Save和UAC不属于这一层，用户暂停时保留原用例，等待明确通知后执行。
- parity设计页先逐字重加载`Inter`和`JetBrains Mono`并确认得到已加载的FontFace，再重新计算Monaco字体。`document.fonts.ready`本身不代表下载成功；字体不可用时直接报错，不使用fallback生成布局结论，不更换字体或调整像素阈值。
- parity设计页在同一批次复用，每个场景先清理`overlay: ''`、`mcpToolApproval: ''`并重置`mitm: 'inactive'`，再应用自身`designState`；显式浮层和active场景优先。明暗“MITM Tunnel→普通Capture”、“Composer Export loading→选中目录”及MCP审批后的Composer不能残留上一场景的遮罩。不新增工具自身单测，不改变产品MITM或文件操作。
- 字符串parity目标先以设计侧确定测量对象：设计实际为button时，Renderer也量同名可见button，否则两边仍量文字节点。同名按钮优先选择文字内容完全匹配的按钮，避免Cancel误配右上角同名图标；必要时为重复按钮使用明确的footer selector。显式selector与`measureText`不变，不放宽原几何及样式阈值；几何差值用于定位产品/设计差异，不代替实际flex布局规则验收。
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
