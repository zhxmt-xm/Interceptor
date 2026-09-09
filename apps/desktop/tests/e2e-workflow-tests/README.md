# Desktop Local E2E Workflow Tests

本目录定义并承载 Interceptor **本地未打包 Electron 应用**的完整 Playwright E2E 验收。

Playwright 使用官方 `_electron.launch()` 直接启动测试拥有的 Electron 进程，运行真实 Main、Preload、Renderer、Proxy Core UtilityProcess 与 Worker。测试通过带 `data-automation-id` 的真实 UI 元素完成操作，不使用 Vite-only Renderer、fake Preload、JSDOM 或产品测试后门。

本套件与 [`../packaged-smoke/`](../packaged-smoke/) 共同构成应用完整验收：

- 本目录验证未打包应用的完整生命周期、destroy 和全部 feature workflow；
- `packaged-smoke` 在最终 Forge package 上复跑同一 workflow contract，并追加 production package 安全与资源边界；
- 两个目标共享 workflow 定义和操作契约，不维护两套业务流程。

> 当前状态：本地 Electron driver、逐测试 trace/evidence、fixture、126条Inventory与127份详细workflow规格已建立；管理员MMC原生专项仅保留排除说明，不计入workflow。已实现的spec按owning feature放入`workflows/<feature>/`，Inventory中只有实际取得Red/Green与销毁证据的条目才能标为passed。

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

无法在零 Mock、零 seed 条件下完成的 workflow 保持 `planned/blocked`，不得用低保真替代测试冒充通过。

## 每条 Workflow 独立生命周期

每个 workflow 是一个独立 Playwright `test`，独占 Electron、profile、Core、trace 和 fixture。每份详细文档都从以下内容开始并写到以下内容结束，不引用共享步骤省略生命周期：

1. 创建独立临时 profile 和 loopback fixture；
2. 启动该 workflow 的 trace；
3. `_electron.launch()` 启动一份新的本地 production bundle；
4. 等待 App root、Core Running、真实 PID 和 8888 listener；
5. 从初始 UI 开始执行该 workflow 的连续操作；
6. 保存 `trace.zip`、`final.png`、Main/Renderer 日志和 `metadata.json`；
7. 通过真实Settings/UI恢复该workflow产生的CA/Trust、MITM等持久副作用；普通workflow不手动Restore系统代理；
8. 点击 `shell.window.close`，由Main退出流程恢复仍由Interceptor持有的系统代理；
9. 验证 Main、Renderer、Core、Worker 全退，8888 释放；
10. 删除 profile 和 fixture。

只有同一 workflow 内必须比较连续状态时才复用同一 App，例如 `capture.protocols.with-mitm` 的 Fresh→Generated→Trusted→MITM enabled。

## 被测对象

```text
Electron executable from node_modules
  -> apps/desktop/.vite/build/main.js
  -> real preload.js
  -> real production Renderer bundle
  -> real Proxy Core dist/proxy-core/entry.cjs
  -> real Diagnostics / Archive Worker bundles
```

测试不会先人工运行 `electron-forge start` 再附着。应用及其进程由 test-scoped fixture 创建和销毁。

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
| `shell.window.controls` | 最小化、最大化、恢复 | shared | planned |

详细步骤：[docs/application-shell.md](docs/application-shell.md)

### [Capture](docs/capture.md)

| Workflow ID | 用户目标 | 策略 | 状态 |
| --- | --- | --- | --- |
| `capture.recording.pause-resume` | 暂停只停止记录，恢复后继续追加 | os-side-effect | planned |
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
| `capture.list.virtual-scroll` | 大列表虚拟滚动和状态保持 | shared | planned |
| `capture.inspector.body-modes` | Auto/Text/JSON/Hex精确正文 | shared | planned |
| `capture.protocols.without-mitm` | HTTP/WS完整捕获，HTTPS/WSS仅tunnel | shared | planned |
| `capture.protocols.with-mitm` | Trust/MITM前后对比，HTTPS/WSS/H2/gRPC解密 | privileged UI | planned |
| `capture.playground-traffic` | Playground UI自产H1与WebSocket流量进入真实Capture | os-side-effect | passed |
| `capture.scenarios.http2` | H2 Headers/trailer/正文及CA恢复 | privileged UI | passed |
| `capture.scenarios.grpc` | 五种gRPC envelope/载荷/trailer | privileged UI | passed |
| `capture.scenarios.tls` | 不解密tunnel与解密H1/H2、完整CA恢复 | privileged UI | passed |
| `capture.scenarios.websocket` | 四种WebSocket的方向、载荷与控制连接 | os-side-effect | passed |
| `capture.scenarios.bodies` | 十一种正文的实际模式、Raw保真及安全展示 | os-side-effect | passed |
| `capture.scenarios.body-media` | PNG/二进制/音视频原生导出 | native-ui | passed |
| `capture.scenarios.encoding` | 三种正常压缩和损坏gzip/图片 | os-side-effect | passed |
| `capture.inspector.resize` | Inspector splitter与响应式布局 | shared | planned |
| `capture.clear` | 清Exchange/Body并保留Session壳 | shared | planned |
| `capture.transfer.har-roundtrip` | 真实Capture导出HAR、Clear、导回同一文件并验证有损映射/脱敏 | native-ui + os-side-effect | planned |
| `capture.transfer.archive-roundtrip` | 真实Capture全保真保存、Clear、打开同一archive并验证恢复/拒绝损坏输入 | native-ui + privileged UI | planned |
| `capture.tools.transfer-jobs` | Agent/MCP文件任务查询、运行中取消、脱敏与双代销毁 | native-ui + os-side-effect | passed |
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
| `rules.body-effect-evidence` | Final writer、Original三态与Text/File正文证据 | native-ui + privileged UI | passed |
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
| `breakpoints.execute-edited` | Header-only、Body-only、Header+Body三段真实HTTP编辑 | privileged UI | planned |
| `breakpoints.drop` | Drop并终止数据面 | shared | planned |
| `breakpoints.resize` | Capture列表/Inspector splitter | shared | planned |
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
| `settings.navigation` | 九个Settings section与跨workspace返回保持 | shared | passed |
| `settings.tools.readonly` | Agent/MCP六项Settings只读查询、脱敏、撤权、双代零重放与完整宿主恢复 | shared | passed |
| `settings.tools.system-proxy` | Agent审批/Auto启用与恢复系统代理、首次original保持、撤权和双代零重放 | os-side-effect | passed |
| `settings.tools.tls` | TLS名单与解密意图/有效状态、即时UI同步、撤权、重启和测试CA清理 | privileged UI | passed |
| `settings.tools.certificates` | Agent/MCP六项证书生命周期与查看、授权、重启及完整CA清理 | native-ui + privileged UI | passed |
| `settings.tools.app-containers` | Agent/MCP单项及批量exemption、挂载同步、撤权与双代恢复 | privileged UI | passed |
| `settings.tools.language` | 原UI/Agent/MCP语言设置、独立授权、持久化与双代销毁 | shared | passed |
| `settings.tools.preferences` | 原UI/Agent/MCP主题与Privacy默认值、HAR草稿隔离和双代销毁 | shared | passed |
| `settings.app-containers.ordering` | Enabled稳定置顶且搜索保持顺序 | shared | passed |
| `settings.app-containers.bulk-access` | 对称批量启用/停用并精确恢复AppContainer exemption | os-side-effect | passed |
| `settings.proxy.enable-restore` | 系统代理Enable/Restore ownership | os-side-effect | planned |
| `settings.system-proxy.crash-recovery` | App A异常退出后由顺序启动的App B加载首次快照并完整恢复 | os-side-effect | passed |
| `settings.proxy-mitm.persistence` | 异常退出后恢复系统代理并跨进程恢复MITM/TLS配置 | os-side-effect | passed |
| `settings.certificates.generate-delete` | CA Generate/Regenerate/Delete | shared | planned |
| `settings.certificates.trust` | Install/Uninstall本机信任 | os-side-effect | planned |
| `settings.certificates.https` | MITM switch和host例外 | os-side-effect | planned |
| `settings.certificates.external-actions` | Reveal/View；不包含用户排除的管理员MMC原生验收 | native-ui | planned |
| `settings.storage.refresh-clear` | Usage、确认和Clear | os-side-effect | planned |
| `settings.privacy.defaults` | Export隐私默认值与持久化 | os-side-effect | planned |
| `settings.updates.check` | Local unsupported；packaged GitHub Device Flow、启动刷新与私有Release检查 | native-ui | planned |
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
| `mcp.desktop.streamable-http` | 外部Host经loopback HTTP接入、授权Tool、同步Rules并跨重启保持状态 | shared | passed |
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
