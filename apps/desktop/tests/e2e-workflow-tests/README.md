# Desktop Local E2E Workflow Tests

本目录定义并承载 Interceptor 的真实 Playwright 用户流程验收。

Windows使用官方`_electron.launch()`启动未打包production bundle；macOS默认spawn未打包Electron并通过Renderer CDP连接，与Forge共用已核准本机UID的开发helper。显式选择签名App时仍走严格生产鉴权，保留产物全部Fuses。两平台运行真实Main、Preload、Renderer、Core与Worker，通过公共`data-automation-id`操作UI，不使用fake Preload、状态注入或产品后门。

本套件与 [`../packaged-smoke/`](../packaged-smoke/) 共同构成应用完整验收：

- 本目录验证上述平台目标的用户流程、独立生命周期和destroy；
- `packaged-smoke`另行验证最终package的安全、资源、启动和退出边界，当前综合smoke不等于已经复用了全部workflow；
- 两个目标共享 workflow 定义和操作契约，不维护两套业务流程。

> 当前状态：本地 Electron driver、逐测试 trace/evidence、fixture及Inventory已建立，详细workflow规格见[规格索引](docs/README.md)；管理员MMC原生专项仅保留排除说明，不计入workflow。已实现的spec按owning feature放入`workflows/<feature>/`，Inventory只有满足对应前置测试及Green/销毁证据的条目才能标passed；仅补既有行为覆盖不人为制造Red。

## 零 Mock 硬性原则

**所有 workflow 的业务操作必须经过真实 App。**

- Arrange、Act 和业务 Assert 都通过公共 `data-automation-id` 操作真实 UI；
- UI 后必须走真实 Preload、Main IPC、Core RPC、Storage、Proxy、Worker 与本地网络数据面；
- 禁止 fake Preload、mock `window.interceptor`、mock Main/Core service、Zustand/React state 注入、直接写 SQLite/Store；
- 禁止用 `page.evaluate(() => window.interceptor.someBusinessAction())` 代替按钮、输入、菜单或对话框；
- 禁止通过 `ElectronApplication.evaluate()` 改写 dialog、TrustStore、系统代理或更新状态；
- 禁止 DEV/E2E-only Renderer setter、隐藏 IPC、任意文件路径 API 或测试专用产品参数；
- CA、Trust、MITM、系统代理、HAR/Archive/Diagnostics transfer 都必须由真实 App UI 发起；
- UAC、macOS Authorization、Open/Save Dialog 等 App 外原生 UI 由真实键鼠操作完成，测试不得改写其返回值，也不得传递或记录密码；
- **禁止 seed**：业务输入不得由测试直接构造。导入类 workflow 的输入文件必须由同一 workflow 先通过产品 UI 真实产生（例如先 Export 再 Import），不得由测试写一份文件冒充用户数据；
- 产品路径无法产生的输入（结构非法的文件、越界层级、损坏字节）不属于 E2E 范畴，下沉到 owning 模块的 unit 测试；
- 测试侧只允许创建真实 loopback origin/client、证据采集与进程清理。

共享CA：普通workflow在App启动前只读检查用户级CA已生成且受信任；由开发者先通过正常产品启动初始化，不复制材料或写测试seed。普通准备/清理不Generate/Install/Uninstall/Delete，只修改本profile的MITM/TLS配置。首次初始化使用`certificate-startup.workflow.ts`；破坏性证书专项用`certificateLifecycleTest`且启动前共享目录必须为空，只清理本轮产品生成的CA。Windows CA启动行为同步，原certutil/UAC及系统代理原生命令保持。

无法在零 Mock、零 seed 条件下完成的 workflow 保持 `planned/blocked`，不得用低保真替代测试冒充通过。

## 每条 Workflow 独立生命周期

每个 workflow 是一个独立 Playwright `test`，独占 Electron、profile、Core、trace 和 fixture。每份详细文档都从以下内容开始并写到以下内容结束，不引用共享步骤省略生命周期：

1. 创建独立临时 profile 和 loopback fixture；
2. 启动该 workflow 的 trace；
3. Windows以`_electron.launch()`、macOS以Electron+Renderer CDP启动独立的真实进程；
4. 等待 App root、Core Running、真实 PID 和 8888 listener；
5. 从初始 UI 开始执行该 workflow 的连续操作；
6. 保存 `trace.zip`、`final.png`、Main/Renderer 日志和 `metadata.json`；
7. 通过真实Settings/UI恢复该workflow产生的CA/Trust、MITM等持久副作用；普通workflow不手动Restore系统代理；
8. 两平台都点击 `shell.window.close`，不打开macOS菜单Quit或主动前置App，由Main退出流程恢复仍由Interceptor持有的系统代理；
9. 验证 Main、Renderer、Core、Worker 全退，8888 释放；
10. 删除 profile 和 fixture。

只有同一 workflow 内必须比较连续状态时才复用同一 App，例如 `capture.protocols.with-mitm` 的 Fresh→Generated→Trusted→MITM enabled。

## 被测对象

```text
Electron executable from node_modules
  -> apps/desktop/.vite/build/main.cjs
  -> real preload.cjs
  -> real production Renderer bundle
  -> real Proxy Core dist/proxy-core/entry.cjs
  -> real Diagnostics / Archive Worker bundles
```

测试不会先人工运行 `electron-forge start` 再附着。应用及其进程由 test-scoped fixture 创建和销毁。

两平台共用业务workflow；原生读取、窗口、权限、超时与退出观察分派到driver/fixture，不为某一平台改共同流量输入。Windows原路径/断言不被macOS分支替换，现有unit或macOS Green不能证明Windows原生E2E通过。具体边界见[平台fixture分派](fixtures/README.md#平台分派)。

### macOS 开发与生产入口

`e2e:prepare-local`依次构建协议/Core/native和未打包production bundle，默认不执行package。Main按真实`app.isPackaged`选择helper入口，业务E2E和日常Forge开发使用同一个常驻服务及开发授权，信任已核准UID的本机代码。首次部署或添加开发授权由系统请求管理员确认；新App构建、profile、下一条workflow不重复申请该项授权。helper自身变化时更新组件，不安装`.pkg`或搬迁App。Windows原准备路径不变。

Forge 8的准备脚本通过公开`VitePlugin`的`prePackage` hook与其Listr任务构建生产bundle，不读取未导出的
`dist/ViteConfig.js`，也不为拿到bundle额外打包。入口统一为`main.cjs`与`preload.cjs`；此适配不改变窗口焦点策略。

```sh
npm run test:e2e:workflow --workspace @interceptor/desktop -- workflows/settings/helper-startup.workflow.ts
```

同一构建连续验收时直接运行Playwright，不必重复prepare：

```sh
npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/helper-startup.workflow.ts
```

`INTERCEPTOR_E2E_MACOS_APP_PATH`仅在测试driver中选择已构建的签名App，此时Main必须通过生产App路径/CDHash、完整资源和运行时验证，不能回退到开发socket。设置该变量后直接运行Playwright，prepare会拒绝混用产物。packaged smoke和产物安全验收仍独立执行，开发授权不替代生产核准。

每条workflow仍独立profile/trace，系统授权由本机用户处理；常驻helper跨workflow保留，Main/Core/Worker、前台helper子进程和8888仍必须退出恢复。macOS失败清理先确认完整代理已恢复，否则保留App、listener和profile，不再让测试侧重复弹旧代理授权后强杀。证书admin trust由同一已部署helper的前台固定入口执行，仍有独立系统权限；不以Main的security写命令代替。组件卸载不等于业务恢复，整轮结束按已确认的保留/卸载范围处理。新trust成功/取消workflow的实机状态见Inventory，不复用旧Main路径的Green。

macOS业务窗口由driver按项目配置准备：常规场景保持真实1600x900，只有body-fill滚轮边界场景使用1600x800。Windows项目默认尺寸不变，body-fill保留默认尺寸布局检查后，仅在滚动阶段调整本轮真实窗口高度到800px。macOS admin trust前后检查统一在宿主guard；TLS/gRPC/H2保持相同业务步骤。HTTPS弹窗定位已按共享CA前提通过真实验收；共享native文件窗口的14个调用文件、16个场景均完成macOS复验，逐条结果和历史失败见Handover。GoTo使用唯一原生建议项的真实双击，Save/Open及取消真实点击原生按钮，不改输入法、语言或dialog返回值；Windows实机仍归第8项。

### Windows 复验

以下记录Windows item 8的验收范围与各场景实际状态。按用户确认，Windows待验不作为其他item的提交blocker；原生/E2E的未执行、skip及失败仍分别保留，macOS结果不能替代，也不免除发布产物的门禁。Manager管理员MMC原生专项及依赖人工点击的Windows UAC取消专项不在本轮验收范围；产品功能、可自动化的拒绝/取消逻辑与证书安装/卸载/退出恢复测试保留。Bilibili专属登录探针已按用户要求移除，不用第三方登录态作为验收前提，也不将移除记为passed。路径相对[workflows/](workflows/)，`{a,b}`代表两份文件，详细步骤见[规格索引](docs/README.md)。

| 分组 | 用例 | 重点 |
| --- | --- | --- |
| CA/启动/View | `settings/{certificate-startup,tools-certificates,tools-tls}.workflow.ts` | 首窗先于UAC、跨profile/共享CA复用、坏材料保留、卸载/删除及真实View关窗；就绪120秒、证书操作30秒、普通操作15秒，先终态后清理；不要求人工UAC取消专项 |
| 代理/AppContainer | `settings/{tools-system-proxy,system-proxy-crash-recovery,app-container-bulk-access,tools-app-containers,app-container-ordering}.workflow.ts` | 单项/批量UAC、冲突/Quit立即拒绝、无重放、完整WinINet/exemption恢复 |
| 协议/交互 | `capture/{tls-scenarios,http2-scenarios,http2-origin-goaway,grpc-scenarios,navigate-tls-passthrough}.workflow.ts`；`settings/{tls-compatibility,proxy-mitm-persistence}.workflow.ts`；`agent/body-messages.workflow.ts` | 首请求源站例外、暂停响应正常GOAWAY完整排空、Edge证书校验、Raw/Copy长度及hash、每代Page；取消背景host默认选择，Capture discovery精确17项 |
| 导入/只读 | `composer/{collection-import,tools-transfer}.workflow.ts`；`rules/{import-tree,tools-import}.workflow.ts`；`settings/tools-readonly.workflow.ts` | 真实signal、原生/预览Cancel与Confirm、退出取消、重启零重放；六项无审批查询及CA不变 |
| 构建/路径（含原第11项） | `npm run build:native --workspace @interceptor/platform-capabilities`及该package所属测试；[Client App](../../../proxy-core/src/proxy-core/client-app/tests/unit/service.test.ts)、[Transfer](../../../proxy-core/src/proxy-core/transfer/tests/unit/job-manager.test.ts)；Windows文件窗口通过上述原生导入/导出workflow验收 | package开发资源与App同包路径、共用runner、8 MiB枚举、certutil/UAC、Windows路径解析、互斥拒绝与无重放；不使用macOS skip或脚本文本断言替代真实原生操作 |
| 纯Auto Detect/WPAD | [上游契约与证据](../../../../architecture/features/settings.md#windows-wpad-research)；`settings/wpad-failure-preservation.workflow.ts`及`settings/wpad-network.workflow.ts` | 本机原生失败保持；隔离Windows中DNS-only、DHCP-only、双来源优先级分别覆盖WPAD/System，HTTP/TLS选路、App/Core代际和完整恢复已验，不以手填PAC或macOS结果替代 |
| 产物/全量 | 全部适用workflow、[packaged smoke](../packaged-smoke/startup.spec.ts)及[Windows安装器smoke](../installer/windows-installer-smoke.mjs) | ready门禁、精确Preload白名单、Core重启、截图矩阵、签名/资源、安装升级卸载、系统设置/进程恢复 |

## 目录结构

```text
apps/desktop/tests/e2e-workflow-tests/
├─ README.md
├─ docs/
│  ├─ README.md
│  ├─ application-shell.md
│  ├─ capture.md
│  ├─ rules.md
│  ├─ composer.md
│  ├─ breakpoints.md
│  ├─ diagnostics.md
│  └─ settings-updates.md
├─ fixtures/
│  ├─ README.md
│  ├─ runtime/
│  ├─ ui/
│  ├─ safety/
│  └─ agent/
├─ workflows/
│  ├─ capture/
│  │  ├─ breakpoint-menu-hierarchy.workflow.ts
│  │  ├─ clear-facets.workflow.ts
│  │  ├─ detail-body-fill.workflow.ts
│  │  ├─ facet-stable-ordering.workflow.ts
│  │  ├─ facets-clear-menu.workflow.ts
│  │  ├─ filter-group-selection.workflow.ts
│  │  └─ section-collapse.workflow.ts
│  ├─ composer/
│  │  ├─ body-formatting.workflow.ts
│  │  ├─ collection-import.workflow.ts
│  │  ├─ collection-tree-interactions.workflow.ts
│  │  └─ response-section-collapse.workflow.ts
│  ├─ rules/
│  │  ├─ import-tree.workflow.ts
│  │  └─ root-toolbar.workflow.ts
│  └─ breakpoints/
│     ├─ execute-edited.workflow.ts
│     └─ websocket-close.workflow.ts
├─ playwright.config.ts
└─ prepare-local.mjs
```

详细文档索引见 [`docs/README.md`](docs/README.md)。
fixture 职责与协议复用入口见 [fixtures/README.md](fixtures/README.md)。HTTP、HTTPS/H2、WebSocket、
gRPC 与 TLS 流量统一由 [Playground TrafficLab](../../../playground/server/scenarios/traffic-lab.ts) 提供。

## Automation ID 契约

稳定 ID 的唯一来源是 [`../../src/shared/automation-ids.ts`](../../src/shared/automation-ids.ts)。

- 静态控件从 `AUTOMATION_IDS` 取值；
- Core-owned 动态行从 `AutomationIdFactory` 或公共 prefix生成；
- Playwright 通过 `getByAutomationId()` / `getByAutomationIdPrefix()` 定位；
- Automation ID 必须落在实际接收 click/fill/press/drag 的 DOM 元素上；
- Workflow保持应用当前语言，不自动切换；业务交互和断言不得依赖任一语言的显示文本、翻译后`aria-label`或CSS class，只使用automation ID、协议值、DOM状态属性与测试自产数据。翻译文本只在独立i18n workflow验证。
- 需要指定新进程的初始语言环境时，显式设置`INTERCEPTOR_E2E_LOCALE`，例如`en-US`。配置使用标准Playwright `locale`与Electron [`--lang`](https://www.electronjs.org/docs/latest/api/command-line-switches#--lang)，不改系统或日常App的语言，不写localStorage/Store，也不在业务步骤中切换语言。不设置时保持原启动环境；同profile重启仍尊重用户已保存的语言选择。截图清单记录实际App语言，不能用启动参数替代语言核对。
  - macOS同时通过进程启动的`-AppleLanguages`设置Cocoa原生控件的语言，值只在`NSArgumentDomain`生效，不使用`defaults write`或修改系统偏好。原生Save/Open仍由真实键鼠操作；实际截图必须另外核对，不能只看Renderer的`html.lang`判断原生窗口语言。

动态行格式：

```text
capture.request-row.<exchangeId>
capture.websocket.frame.<exchangeId>.<seq>
capture.grpc.message.<exchangeId>.<side>.<index>
rules.row.<ruleId>
rules.folder-row.<folderId>
composer.collection.request.<requestId>
composer.collection.folder.<folderId>
diagnostics.row.<traceKey>
```

## Workflow Inventory

策略说明：

- `shared`：local 与 packaged 均执行；
- `native-ui`：包含真实 Open/Save Dialog 或外部程序；
- `os-side-effect` / `privileged UI`：修改系统代理或信任库，必须 headed 运行并从 UI恢复环境。

### [Application 与 Shell](docs/application-shell.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `application.startup.ready` | 新 profile 启动后首窗、Core 和 listener ready | shared | planned |
| `application.lifecycle.core-restart` | Core被结束后恢复UI/RPC、系统代理并验证故障与退出竞争 | os-side-effect | passed |
| `application.lifecycle.graceful-close` | 产品 Close 完整销毁 Main/Core/Renderer/Worker/listener | shared | planned |
| `application.lifecycle.profile-isolation` | 两个 profile 的持久/临时状态严格隔离 | shared | planned |
| `shell.navigation.workspaces` | 五个 workspace 的 Header/Main/Statusbar 同步切换 | shared | planned |
| `shell.sidebar.collapse` | 折叠态导航可用并可恢复展开 | shared | planned |
| `shell.appearance.theme` | 四主题切换与跨重启持久化 | shared | planned |
| `shell.appearance.language` | 15语言切换、布局与持久化 | shared | planned |
| `shell.guidebook.online` | 在线Guidebook的安全frame、搜索、图片、主题同步、刷新与浏览器出口 | shared | passed |
| `shell.guidebook.i18n` | 独立验证Guidebook语言入口、正文locale同步与初始语言恢复 | shared | passed |
| `shell.window.controls` | 最小化、最大化、恢复 | shared | planned |

详细步骤：[docs/application-shell.md](docs/application-shell.md)

### [Capture](docs/capture.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `capture.recording.pause-resume` | 按请求/握手开始时决定录制，Resume不产生孤立正文 | os-side-effect | passed |
| `capture.proxy-readiness.resolve` | Cancel、Proxy settings、Enable 的授权语义 | os-side-effect | planned |
| `capture.traffic.capture-select` | 真实请求进入列表并按需加载Inspector | shared | planned |
| `capture.inspector.section-collapse` | Inspector详情区独立折叠并暴露正确ARIA关系 | privileged UI | passed |
| `capture.filter.keyword` | Keyword筛选和恢复 | shared | planned |
| `capture.filter.structured` | Method/Status/Host/Type/Duration组合筛选 | shared | planned |
| `capture.filter-group-selection` | Option选择保持facet分组展开 | shared | passed |
| `capture.filter.protocol` | All/H1/H2/WS协议筛选 | shared | planned |
| `capture.facet-stable-ordering` | Facet计数变化不改变首次出现顺序 | privileged UI | passed |
| `capture.clear-facets` | Clear时列表、selection与facet snapshot同步归零 | privileged UI | passed |
| `capture.breakpoint-menu-hierarchy` | Block/Breakpoint同组对齐并可展开二级菜单 | privileged UI | passed |
| `capture.breakpoint-submenu-lifecycle` | 根菜单与Breakpoint二级菜单的hover、翻转和dismiss lifecycle | privileged UI | passed |
| `capture.navigate-tls-passthrough` | 从TLS tunnel跳到最具体的覆盖pattern并短暂高亮 | privileged UI | passed |
| `capture.facets-clear-menu` | Facet顺序、Breakpoint菜单和Clear同步回归 | privileged UI | planned |
| `capture.detail-body-fill` | Detail Response BodyViewer填满剩余高度 | privileged UI | passed |
| `capture.messages.compact-layout` | 普通gRPC/WS短长消息限高、拖拽、内外滚动、窗口缩放、Copy/全屏及205条gRPC分页 | privileged UI | Windows消息布局、拖拽、Copy/分页已验；窗口缩放子步骤保留macOS原记录 |
| `capture.body-preview-limits` | 2MiB预览、1–2MiB手动格式化与截断禁止 | os-side-effect | Windows实机已验；macOS保留原记录 |
| `capture.body.fullscreen` | Request/Response全屏、真实Copy、关闭/再开、Raw/Hex模式保持 | os-side-effect | Windows前置Red→最终Green：URL就绪后显示Copy，标题/General完整URL及JSON/HTML Header hover通过；正常退出与宿主恢复已核对 |
| `capture.list.virtual-scroll` | 大列表虚拟滚动和状态保持 | shared | planned |
| `capture.inspector.body-modes` | Auto/Text/JSON/Hex精确正文 | shared | planned |
| `capture.protocols.without-mitm` | HTTP/WS完整捕获，HTTPS/WSS仅tunnel | shared | planned |
| `capture.protocols.with-mitm` | Trust/MITM前后对比，HTTPS/WSS/H2/gRPC解密 | privileged UI | planned |
| `capture.playground-traffic` | Playground UI自产H1、WebSocket及H2错误GOAWAY流量进入真实Capture | os-side-effect | passed |
| `capture.scenarios.http` | H1 JSON/上传/流式/early response/中断及413完整响应收尾，不改Mockttp | os-side-effect | passed |
| `capture.scenarios.http2` | H2 Headers/trailer/正文、Range及双向错误GOAWAY与CA恢复 | privileged UI | passed |
| `capture.http2-origin-goaway` | 源站正常GOAWAY后放行4 MiB响应，完整hash/trailer/end、新上游session与无重放 | privileged UI | Windows实机已验；macOS保留原记录 |
| `capture.scenarios.bodies` | 十一种正文的实际模式、Raw保真及安全展示 | os-side-effect | passed |
| `capture.scenarios.body-media` | PNG/二进制/音视频原生导出 | native-ui | passed |
| `capture.scenarios.encoding` | 三种正常压缩和损坏gzip/图片 | os-side-effect | passed |
| `capture.scenarios.websocket` | 四种WebSocket的方向、载荷与控制连接 | os-side-effect | passed |
| `capture.scenarios.grpc` | gRPC原场景、单向/双向streaming、半消息、Copy与Pause/Clear | privileged UI | passed |
| `capture.scenarios.tls` | 不解密tunnel与解密H1/H2、完整CA恢复 | privileged UI | passed |
| `capture.inspector.resize` | Inspector splitter与响应式布局 | shared | planned |
| `capture.clear` | 清Exchange/Body并保留Session壳 | shared | planned |
| `capture.transfer.har-roundtrip` | 真实Capture导出HAR、Clear、导回同一文件并验证有损映射/脱敏 | native-ui + os-side-effect | planned |
| `capture.transfer.archive-roundtrip` | 真实Capture全保真保存、Clear、打开同一archive并验证恢复/拒绝损坏输入 | native-ui + privileged UI | planned |
| `capture.tools.transfer-jobs` | 文件任务查询/取消、运行中Alt+F4清理、脱敏与双代销毁 | native-ui + os-side-effect | passed；取消提交点竞态未验 |
| `capture.tools.body-export` | Agent/MCP原生正文保存、编码字节完整性、撤权与双代销毁 | native-ui + os-side-effect | passed |
| `capture.tools.har-transfer` | Agent/MCP原生HAR导出再导入、范围脱敏、追加与双代销毁 | native-ui + os-side-effect | passed |
| `capture.tools.archive-transfer` | Agent/MCP/IPC原生Archive往返、HTTP正文/WS消息、追加与双代销毁 | native-ui + os-side-effect | passed |

详细步骤与协议字段矩阵：[docs/capture.md](docs/capture.md)

### [Rules](docs/rules.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `rules.load-search-select` | 加载、搜索、选择和命中数 | shared | planned |
| `rules.root-toolbar` | 根级新建规则、新建目录与导出入口 | shared | passed |
| `rules.hierarchy-menus-status` | 三级目录、节点菜单、validation、命中与Capture导航 | privileged UI | passed |
| `rules.action-tag-overflow` | 两个行内action tags与完整有序Tooltip | shared | passed |
| `rules.create-edit-delete` | 新建、重命名、启停、删除 | shared | planned |
| `rules.matcher-variants` | 八种matcher及校验 | shared | planned |
| `rules.action-variants` | 11种action及安全校验 | shared | planned |
| `rules.reorder` | 菜单/拖拽排序与priority | shared | planned |
| `rules.validate-apply` | Validate、Apply、revision和持久化 | shared | planned |
| `rules.apply-conflict` | 乐观并发冲突恢复 | shared | planned/blocked |
| `rules.runtime-hit` | 规则真实作用于Proxy数据面 | shared | planned |
| `rules.body-effect-evidence` | Final writer、Original三态、Text/File正文证据与Header effect布局 | native-ui + privileged UI | passed |
| `rules.import-tree` | 真实Save→Open、取消、纯追加、身份重生成与持久化 | native-ui | passed |
| `rules.tools.export` | Agent/MCP审批与原生导出、已保存树/草稿隔离、撤权和双代销毁 | native-ui | passed |
| `rules.tools.import` | Agent/MCP共享导入确认、全新身份追加、草稿持久化与双代销毁 | native-ui | passed |

详细步骤：[docs/rules.md](docs/rules.md)

### [Composer](docs/composer.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `composer.request-edit` | 编辑完整request模型 | shared | planned |
| `composer.collection.tree-interactions` | 三级目录、菜单、选择、重命名与splitter | shared | passed |
| `composer.send-success` | 真实发送与四种response视图 | shared | planned |
| `composer.response.section-collapse` | 响应详情区独立折叠并暴露正确ARIA关系 | shared | passed |
| `composer.response.body-formatting` | code正文自动/手动格式化与失败回退 | shared | passed |
| `composer.send-failure` | URL/网络失败和重试 | shared | planned |
| `composer.history-new` | History加载和New重置 | shared | planned |
| `composer.resize` | Request/Response splitter | shared | planned |
| `composer.collection.import` | 真实Save→Open、取消、字段身份重生成与Core回载 | native-ui | passed |
| `composer.tools.collection` | Agent/MCP集合查询与原子替换、凭据往返、界面同步和双代销毁 | shared | passed |
| `composer.tools.transfer` | Agent/MCP真实导出/导入、原生取消与确认、身份重生成和双代销毁 | native-ui | passed |

详细步骤：[docs/composer.md](docs/composer.md)

### [Breakpoints](docs/breakpoints.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `breakpoints.toggle` | Break on match与Core同步 | shared | planned |
| `breakpoints.queue-select` | 真实pending队列和snapshot | shared | planned |
| `breakpoints.queue-stepping` | HTTP队首、Queued、中间abort与不抢焦点 | privileged UI | passed |
| `breakpoints.queue-isolation` | HTTP/WS隔离、同连接双向队列、独立草稿与精确frame去重 | privileged UI | passed |
| `breakpoints.queue-commands` | queue/rule三条批量命令与原始数据面 | privileged UI | passed |
| `breakpoints.tools.batch` | Agent/MCP三条批量Tool、Rule/queue隔离、原样数据面与双代销毁 | shared | passed |
| `breakpoints.lifecycle-release` | 无timeout等待与Core生命周期aborted释放 | privileged UI | passed |
| `breakpoints.continue-unmodified` | 原样继续 | shared | planned |
| `breakpoints.execute-edited` | Header-only、Body-only、Header+Body、继承chunked四段真实HTTP编辑 | privileged UI | passed |
| `breakpoints.drop` | Drop并终止数据面 | shared | planned |
| `breakpoints.resize` | Capture列表/Inspector splitter | shared | planned |
| `breakpoints.body-preview` | 产品导出File的有界预览、完整文件/Text发送及短File布局联动 | native-ui | Windows大/短File预览与完整文件发送已验；macOS保留原记录 |
| `breakpoints.original-body` | Original限高、2MiB预览与完整原文放行 | os-side-effect | Windows实机已验；macOS保留原记录 |
| `breakpoints.websocket-close` | WebSocket close-code-only编辑 | privileged UI | planned |

详细步骤：[docs/breakpoints.md](docs/breakpoints.md)

### [Diagnostics](docs/diagnostics.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `diagnostics.list-detail` | 真实记录和action timeline | shared | planned |
| `diagnostics.filters` | Process/Level/Outcome过滤 | shared | planned |
| `diagnostics.pagination` | Keyset分页与轮询合并 | shared | planned |
| `diagnostics.export` | 筛选后的脱敏JSONL导出 | native-ui | planned |
| `diagnostics.resize` | List/Detail splitter | shared | planned |
| `diagnostics.tools.queries-export` | Agent/MCP当前快照查询、原生JSONL导出、脱敏与双代销毁 | native-ui | passed |

详细步骤：[docs/diagnostics.md](docs/diagnostics.md)

### [Settings 与 Updates](docs/settings-updates.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `settings.navigation` | 十个Settings section与跨workspace返回保持 | shared | passed |
| `settings.tools.readonly` | Agent/MCP六项Settings只读查询、脱敏、撤权、双代零重放与完整宿主恢复 | shared | passed |
| `settings.tools.system-proxy` | Agent审批/Auto启用与恢复系统代理、首次original保持、撤权和双代零重放 | os-side-effect | passed |
| `settings.tools.tls` | TLS名单与解密意图/有效状态、即时UI同步、撤权、重启和测试CA清理 | privileged UI | passed；Windows PEM方案已实机复验，macOS保留既有记录 |
| `settings.tools.certificates` | Agent/MCP六项证书生命周期与查看、授权、重启及完整CA清理 | native-ui + privileged UI | passed；Windows PEM生命周期与查看已复验，不含macOS-only授权取消专项 |
| `settings.tools.app-containers` | Agent/MCP单项及批量exemption、挂载同步、撤权与双代恢复 | privileged UI | passed |
| `settings.tools.language` | 原UI/Agent/MCP语言设置、独立授权、持久化与双代销毁 | shared | passed |
| `settings.tools.preferences` | 原UI/Agent/MCP主题与Privacy默认值、HAR草稿隔离和双代销毁 | shared | passed |
| `settings.app-containers.ordering` | Enabled稳定置顶且搜索保持顺序 | shared | passed |
| `settings.app-containers.bulk-access` | 对称批量启用/停用并精确恢复AppContainer exemption | os-side-effect | passed |
| `settings.proxy.enable-restore` | 系统代理Enable/Restore ownership | os-side-effect | planned |
| `settings.proxy.upstream` | macOS接续ClashX上游，外部改写后退出/跨profile重启不覆盖新配置 | macOS / external proxy / os-side-effect | passed（ClashX三场景及完整系统代理恢复） |
| `settings.upstream.macos` | System/Direct/Manual/PAC/WPAD双入口、DNS/DHCP选路、重启与完整宿主恢复 | macOS / isolated network / os-side-effect | 当前最终Green；初始整体功能前置Red历史缺证，见[规格](docs/settings-updates.md#settings-upstream-macos) |
| `settings.upstream.windows` | Windows原生WPAD/PAC失败保持，DNS/DHCP、优先级、System Auto Detect和代际恢复 | Windows / isolated network / os-side-effect | passed；负向Red→Green及六条正向/恢复Green，适用范围与历史Red边界见[规格](docs/settings-updates.md#settings-upstream-windows) |
| `settings.system-proxy.crash-recovery` | App A异常退出后由顺序启动的App B加载首次快照并完整恢复 | os-side-effect | passed |
| `settings.proxy-mitm.persistence` | 异常退出后恢复系统代理并跨进程恢复MITM/TLS配置 | os-side-effect | passed |
| `settings.certificates.generate-delete` | CA Generate/Regenerate/Delete | shared | planned |
| `settings.certificates.shared-startup` | 自动准备共享CA，正常退出保留，跨fresh profile复用且不重写材料 | shared / os-side-effect | Windows PEM生成/跨profile复用及删除profile后保留已验；macOS保留既有签名包记录，契约见[Settings](../../../../architecture/features/settings.md#ca与profile生命周期) |
| `settings.certificates.startup-cancel` | 首次原生授权时首窗可见、Quit即时拒绝、取消收尾及同CA正常重启 | macOS / os-side-effect | passed |
| `settings.certificates.trust` | Install/Uninstall本机信任 | os-side-effect | planned |
| `settings.certificates.helper-trust` | macOS两张不同CA直接经前台helper授信/撤销，复用同一常驻组件 | macOS / os-side-effect | passed |
| `settings.certificates.cancel-trust` | 取消helper前台入口的系统确认，由产品撤回新增CA | macOS / os-side-effect | passed |
| `settings.helper-startup` | macOS首次部署及开发/生产入口复用，不覆盖另一份授权 | macOS / os-side-effect | passed |
| `settings.certificates.https` | MITM switch和host例外 | os-side-effect | planned |
| `settings.certificates.external-actions` | Reveal/View；不包含用户排除的管理员MMC原生验收 | native-ui | planned |
| `settings.tls-compatibility` | 真实TLS失败提示、精确host/wildcard选择、滚动、保存与Not now；最终Green，保留样式前置缺口 | privileged UI | planned |
| `settings.storage.refresh-clear` | 单项正文用量、右上Refresh及两处Clear同步、取消和录制状态保持 | os-side-effect | passed |
| `settings.privacy.defaults` | Export隐私默认值与持久化 | os-side-effect | planned |
| `settings.updates.check` | 匿名检查、请求失败重试和同profile重启；无账号API/控件，退出恢复 | native-ui | Windows local不可用状态已验；保留macOS packaged失败路径记录，Windows下载/Open成功链路未验 |
| `settings.updates.download-open` | 真实下载、校验和打开安装器 | native-ui | planned |
| `settings.update-notification` | Header通知与Settings状态同步 | shared | planned |

详细步骤：[docs/settings-updates.md](docs/settings-updates.md)

### [Agent](docs/agent.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `agent.panel.navigation-persistence` | 右侧Panel跨Workspace/Settings保持且只由显式入口关闭 | shared | passed |
| `agent.settings.model-configuration` | 通过Settings配置、验证、切换与删除模型 | shared | passed |
| `agent.chat.streaming-context` | 多轮Streaming、Context/Usage、Stop与Retry | shared | passed |
| `agent.chat.restart-recovery` | Provider、Session、Transcript与Usage跨重启恢复 | shared | passed |
| `agent.tools.settings-capabilities` | 从共享registry配置Agent/MCP Tool开关并跨重启恢复 | shared | passed |
| `agent.tools.capture-discovery` | Agent发现并查询产品UI产生的真实Capture与storage状态 | shared | passed |
| `agent.tools.body-messages` | Agent读取真实HTTP正文、WebSocket frame与gRPC message | privileged UI | passed |
| `agent.tools.execution-modes` | change Tool按Session的ask/auto执行且可恢复 | shared | passed |
| `agent.tools.traffic-control` | Agent启动Recording并清空Capture，所有UI镜像同步收敛 | shared | passed |
| `agent.tools.rules` | Agent读取Rules与命中并按revision替换完整递归Rule tree | privileged UI | passed |
| `agent.tools.breakpoints` | Agent处理真实HTTP/WebSocket pending并验证Ask/Auto/stale | privileged UI | passed |
| `agent.tools.composer` | Agent发送真实直连请求、探测TLS并验证socket取消 | privileged UI | passed |
| `agent.tools.diagnostics` | Agent过滤读取真实Diagnostics记录并验证脱敏与稳定顺序 | shared | passed |

详细步骤：[docs/agent.md](docs/agent.md)

### [MCP](docs/mcp.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `mcp.desktop.streamable-http` | 三版官方Client经loopback HTTP接入、单次取消、授权Tool、同步Rules并跨重启保持状态 | shared | macOS三协议Green；不代表当前开发Host验收 |
| `mcp.settings.protocol-support` | Server关闭/运行时均显示三版协议说明，不提供版本切换器 | shared | Windows实机已验；macOS保留原记录 |
| `mcp.current-host` | 当前开发Agent通过真实Host公开MCP通道调用Tool，fixture核对App裁决与退出 | current-agent interactive | Windows精准筛选、AppContainer、Archive、Recording、系统代理、TLS与macOS English App代表主线Green；共17条workflow完成SDK/Host Green，覆盖20次连接代际、41种Tool与189次调用。合并为54/69项通过、15项未运行；配置、session、App和宿主均按约定清理，不代表其他Host通过 |
| `mcp.browser-playground-cors` | Browser以Bearer跨Origin连接最新MCP并完成query/change调用 | shared | passed |
| `mcp.tools.breakpoints` | 官方MCP Client处理真实HTTP/WebSocket pending | privileged UI | passed |

详细步骤：[docs/mcp.md](docs/mcp.md)

## Workflow 完整性

完整覆盖由显式manifest和reporter管理，不以代码覆盖率代替：

- Inventory中的每个ID必须有测试；
- local与packaged必须执行策略要求的目标；
- workflow不得静默skip；
- 每个执行实例必须生成trace和destroy证据；
- 不允许未登记或重复的workflow ID。

## 测试写法

```ts
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { test, expect } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';

test('composer sends a request', async ({ desktopApp, httpTrafficRunner }) => {
  const { page } = desktopApp;

  await getByAutomationId(
    page,
    AUTOMATION_IDS.shell.workspace.composer,
  ).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url)
    .fill(httpTrafficRunner.url('/composer'));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();

  await expect.poll(() => httpTrafficRunner.observation('/composer')?.method).toBe('GET');
});
```

交互只通过automation ID；结果可以通过UI文本、ARIA状态、真实客户端结果、输出文件、进程和端口断言。

## Trace 与证据

日常使用`npm start → Test → E2E 用户流程测试`，先选“普通验收”或“逐步截图”，再选功能/workflow并确认；不需要手写截图参数。截图模式自动在`apps/desktop/test-results/workflow-screenshots/<run>/`创建独立运行目录并显示路径，普通测试不会清空这些截图。两种模式运行同一份业务步骤和断言；普通模式保留原trace、final.png及退出恢复证据，不生成`step-screenshots/`。

直接调用和CI仍可使用`--screenshots`。不传`--output`时同样自动建立独立目录；显式传入则沿用指定输出位置。命令从仓库根目录执行：

```sh
npm run test:e2e:workflow --workspace @interceptor/desktop -- \
  --screenshots workflows/composer/body-formatting.workflow.ts \
  --output /absolute/path/to/a-new-run
```

`run.mjs`通过上述npm script运行，消费`--screenshots`并在需要时补充独立输出目录，其余参数交给原Playwright配置；使用npm提供的CLI路径逐参数启动Node，不交给Windows shell解释正则或含空格路径。默认先执行已有prepare；macOS设置`INTERCEPTOR_E2E_MACOS_APP_PATH`时使用该签名App并跳过prepare。直接运行Playwright时可设置测试环境变量`INTERCEPTOR_E2E_STEP_SCREENSHOTS=1`并自行指定输出目录；它只配置测试fixture，不进入产品。

- workflow在已完成的操作/断言块后调用`screenshotStep('中文 / English')`。一项可包含同一目的下的多次输入；不是拦截每次click，也不会给任意`test.step()`自动取景。新的用户步骤应在原workflow中明确标记，不新增教程副本。
- 需要教学标注时传入`{ highlights: [{ target: locator, label: '1' }] }`。控件必须属于本次App且完整可见，编号为唯一正整数；工具在原图捕获前后核对真实矩形与`IntersectionObserver`的完整交集，滚动祖先裁切不能仅因矩形仍在App视口内就算可见。比例必须为`1`，不使用容差；需要空间时通过正常折叠或滚动露出控件。按实际PNG与窗口尺寸换算，不向App注入样式。输出保留`step-001.png`，另生成`step-001.annotated.png`及原图/标注图独立摘要和像素坐标。普通模式不加载合成器；原生窗口当前只输出原图，不将Renderer坐标用于原生控件。
- 每个测试输出`step-screenshots/step-001.png`等原始PNG和`manifest.json`；清单记录相对workflow、标题、App版本、平台、实际语言/主题、窗口种类、尺寸、字节数和SHA-256。截图开启时同时保存原workflow文件摘要，执行期间源码变化会失败；`recordScreenshotExample(key, url)`只登记测试拥有的loopback端点，去掉query/hash，不保存凭据，供正文动态端口绑定使用。清单只在原App清理及宿主guard结束后落盘；失败或恢复未通过不能标为`passed`。
- 可选截图的实际耗时单独记入`screenshotOverheadMs`，不占用原workflow的业务总时限；每次取景最多150秒（含首次120秒原生截图器编译），结束后仅按实际经过时间补回业务预算。Locator、网络、原生操作及退出的原有超时不变，截图失败仍使原流程失败，普通模式不调整预算。
- macOS 14+首次使用时以现有Xcode工具链编译`fixtures/ui/window-screenshot.swift`，由`SCScreenshotManager`一次性捕获所属窗口，不启动持续录屏或FFmpeg。每次核对Main PID/代际、唯一窗口及解锁状态，不回退为整屏或其他App。
- 原生Save/Open在真实文件路径已定位后单独截图；取消的截图记录回到App后的状态，不取景尚未定位的个人目录。普通模式仍走相同的原生确认/取消操作。
- Windows普通App步骤使用真实Renderer截图，不宣称包含原生边框；原生Open/Save面板先导航到测试自产目录并把文件名限制为basename，通过owner PID/启动时间与唯一`#32770`窗口核对，再用`PrintWindow`只捕获该窗口。写盘前遮盖导航侧栏和地址breadcrumb，不截桌面、其他应用或个人路径；取消步骤仍拍返回App后的状态。Windows正常无截图workflow保持原入口，完整实机复验仍按Windows矩阵跟踪。
- 普通逐步截图只是私有测试证据，不自动复制或上传。显式选择`npm start → Test → E2E → 教程截图更新并发布 Homepage`才从GitHub读取发布清单并重跑全部自动来源；独立验收的真实Host组明确显示保留、不重拍，不能用SDK替代。截图和映射通过后，使用`gh`的Git Data API创建Homepage commit并非强制推进`main`。不需要本地Homepage或新的Actions流程，不操作App仓库的Git index；Homepage原网站CI在更新后运行，不由此入口等待。来源、隐私、语言和恢复要求不放宽。
- Homepage的`guidebook/screenshot-publication.json`为发布契约：固定`source.key`和`checkpoint.key`映射目标原图/标注文件，全序列检查标题、窗口、主题、尺寸与编号，源文件摘要另行锁定。插入或修改原workflow后必须更新对应契约，保留原checkpoint key；不把新的`step-007`直接当成旧的`step-007`。新运行缺图或有歧义立即停止，不用旧素材补齐。
- `retainedHostGroups`只登记已由真实Host完成并审核的独立图片组，固定manifest摘要并逐文件核对原图、标注、字节及尺寸。其图片不得与自动来源重叠；更新App版本或图片需要重新进行真实Host验收和审核。没有该字段表示没有独立Host组，非法字段或变化的证据不能当作空列表跳过；报告明确记录这些图片未在批量流程重拍。
- 发布运行在`test-results/guidebook-publications/<run>/`保留各原测试证据及schema 2的`publication.json`。向导可选只生成验收、不写远端；全部通过后可在同一入口继续发布该完整目录，前提是远端基线、映射、App和workflow/fixture、各代退出证据摘要仍一致。不复用旧本地仓库模式或部分完成的批次。

每条workflow独立保留：

```text
trace.zip
final.png
renderer-console.log
main-process.log
metadata.json
```

人工回放：

```powershell
npx playwright show-report playwright-report/e2e-workflow-tests
npx playwright show-trace apps/desktop/test-results/e2e-workflow-tests/<result>/trace.zip
```

Trace不得包含真实凭据、CA私钥或真实用户流量。

## 并发与隔离

默认 `workers: 1`。系统代理、信任库、8888 listener和UtilityProcess属于进程/OS级资源；只有全部改为独立资源并经过证明后才能提高并发。

平台专属workflow在创建App/fixture前限定平台：AppContainer仅Windows；macOS helper、Keychain授权、上游/WPAD及macOS窗口专项仅macOS。共享流程使用当前平台driver，未执行平台不记通过。

普通fixture使用loopback origin；privileged workflow必须headed运行，并在Close前通过UI恢复全部系统副作用。

## 命令

```powershell
# 准备本地未打包production bundle
npm run e2e:prepare-local --workspace @interceptor/desktop

# 运行完整本地workflow E2E
npm run test:e2e:workflow --workspace @interceptor/desktop

# 查看报告
npm run test:e2e:workflow:report --workspace @interceptor/desktop
```

## 与其他测试的关系

- Unit/Integration：验证协议、服务、Core数据面和小对象；
- Visual parity：验证设计稿与Renderer像素/几何；
- Packaged smoke：最终production package上的完整workflow与package安全边界；
- Installer：MSI/DMG安装、升级、卸载、签名和公证。

## 修改原则

- Workflow以用户目标命名，不以单个按钮命名；
- 详细步骤按分类维护在`docs/`，主README只维护Inventory与状态；
- 每条workflow必须独立、可重复、可单独回放；
- Fixture负责环境，workflow负责行为；
- Local与packaged核心操作/断言保持一致；
- 新增Renderer feature时同步扩展automation ID、Inventory、分类文档、manifest和测试。
