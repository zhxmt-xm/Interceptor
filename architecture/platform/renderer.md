# 平台架构：Renderer Shell

> 最后更新：2026-09-06
> 范围：跨 feature 的 Renderer 结构——应用外壳、窗口 chrome、冷启动、共享组件库、主题与语言、automation 契约。
> 单个 feature 工作区的内部设计见对应的 `../features/*.md`；视觉取值以 [../../design-vite/design-system.md](../../design-vite/design-system.md) 为准。
>
> Renderer 只通过 `window.interceptor` 意图 API 访问 Main，不触达 Electron / Node / MessagePort。

## 1. App shell

`app/App.tsx` 持有 `themeMode`（light/warm/dark/ember）、Settings section 与全局 `agentPanelOpen`，消费 i18next 当前语言，并直接拥有全高侧栏 + 46px Window Header + `main` + 30px `footer` 的 Grid；按 `ViewId` 注入对应 feature 的 main/statusbar。Agent 打开时 Grid 增加最大 `440px` 右栏，Header 与 footer 跨越 main + Agent 两列，main 同步缩窄而不被覆盖。Grid 以 `minmax(440px,1fr)` 优先保留 main；最小 `880px` 窗口且 Sidebar 展开时 Agent 收缩为 `220px`，不切换 overlay。`app/Sidebar.tsx` 负责导航与底部主题/语言切换器，不再保留单独的 `AppShell` 转发层。Sidebar 的 feature 导航只表达位置与当前选中态，不显示任何业务 badge；待处理数量和告警必须留在对应 feature 的 workbar、内容区或 statusbar。

## 2. 冷启动加载界面

`app/BootScreen/` 在代理链路可用前全屏遮盖 shell，只留共享的 `components/WindowControls/`。它只表达三件必备且全自动的事：`CoreProcessStatus.state` → `CaptureStatus.listening` → `SystemProxyStatus.owned`；阶段存于 `app/bootStore.ts`，由 `bootstrapCapture` 推进。

系统代理**自动接管**（`ensureSystemProxyOwned` 直接调 `enableSystemProxy`），不要求启动时授权；MITM 不属于启动流程。遮盖只属于冷启动（`dismissed` 不可逆），运行期的 Core 重启与 ownership lost 仍由 `ProxyReadinessDialog` 承接，两者不同时显示。

## 3. 自有窗口 chrome

Windows/macOS BrowserWindow 均为 `frame:false`；Renderer 46px Window Header 是 drag region，左侧只保留 no-drag 的侧栏折叠按钮和 feature 名称，右侧依次是全局 Agent toggle 与 Minimize / Maximize-or-restore / Close。Agent toggle 只改变 Renderer Shell 布局；Close 经窄 Preload IPC 进入 `app.quit()` 的 guarded 系统代理恢复与 Core shutdown。

feature 业务命令不进入 Header；Agent toggle 属于全局 Shell 控件。UpdateNotification 是 Header 下方的独立 overlay，不占 Header flex。

## 4. Feature workspaces

`features/{capture,rules,composer,diagnostics,settings}/` 均为 Main/Statusbar + colocated CSS Module，无 Feature Topbar；`features/agent/` 是跨 Workspace 的全局右栏，不是第六个 Workspace。当前 Agent 已实现未配置态、Provider 配置、Chat selector、New/Rename/Delete、Streaming Transcript、reasoning 展开、Composer、Model selector、Context/Session Usage、Stop/Retry 与重启恢复；Configure 深链到 Settings > Agent，导航不会隐式关闭 Panel。Agent/MCP业务Tool共用registry，Settings提供独立授权开关，Tool Call/Result及Ask审批复用Transcript组件；具体能力契约见[../features/tool-capabilities.md](../features/tool-capabilities.md)。`features/breakpoints/` 只保留数据层，UI 已合并进 Capture。各 feature 的业务命令分别位于自己的列表、协议、暂停队列和日志内容工具栏；内容工具栏统一为 `--content-toolbar-height`（44px）。状态统一进入 Statusbar。所有左右分栏复用 1px `Splitter`，抓手为同一 flex 中轴上的 4×40px 子项。

Rules导入弹窗位于App作用域，使其他workspace中的Agent/MCP也能发起同一个用户流程，但业务所有权仍在
`features/rules/`。Main通过窄Preload请求/取消事件传递requestId，`RulesImportActions`统一读取、预览与确认状态，
`RulesImportDialog`复用共享确认组件；RuleList只发起正式导入入口，不再保存第二份预览。完成响应只含公开计数，
Main在边界校验后返回Tool；原解析及确认后原子追加仍归Rules，窗口导航不会隐式丢失正在确认的导入。

WebSocket 帧断点保留在连接自己的 Messages tab：setup 只配置当前 `exchangeId` 的方向、帧类别与超时；
命中后 Inspector 自动切到 Messages，已转发历史帧继续显示，Core snapshot 作为黄色 paused row 追加在列表末尾。
row 下方内嵌专用编辑器，Original message 复用完整 `BodyViewer`，Replacement message 默认 Off，只有用户
显式切到 Text 才发送编辑；binary snapshot 用 hex 展示，ping / pong / close 与 message 共用同一条解决流程。
HTTP breakpoint 仍使用整面板 `BreakpointInspector`，两条路径只共享数据 store 与 resolve 命令，不互相伪装。

## 5. 共享组件库

`components/` 是扁平库，每个组件独立子目录（`Component.tsx` + `Component.module.css`）；含 Flyout（portal 锚定弹层）、ThemeSwitcher、LanguageSwitcher（侧栏底部）。`Tabs` 在容器放不下时把尾部项收进 `…` Flyout（隐藏测量层 + `ResizeObserver`），保证面板头高度固定。

- `IconButton`可按调用点提供`--icon-button-hover-background`与`--icon-button-hover-color`，未提供仍使用`--hover`/`--text`。WebSocket消息断点用它保持armed黄色和Ant默认text按钮反馈，不改变共享默认主题；禁用态仍不响应hover。
- `Button`由组件控制图标和独立label的`inline-flex`及`align-items: center`，button再用`justify-content: center`居中内容组。md/compact/sm继续分别为34/32/28px，不在通知等调用方覆盖位置；检查实际父布局规则、内容范围和正常gap，不以字形像素边界或自算矩形中心定义对齐，也不添加独立位移、裁字或行高补偿。
- `Button.icon`接收现有Lucide或Ant Design图标组件，由共享icon槽提供尺寸与7px图文gap；调用方不再把图标混进文字children。图标与loading spinner属于装饰，使用`aria-hidden`，按钮名称来自文字或显式`ariaLabel`；UpdatesPanel保留原GitHub图标和登录动作。

## 6. 共享树交互

Rules 的规则树与 Composer 的 Collection 是同一套交互，数据结构共用 `packages/core-protocol/src/tree.ts`，拖拽共用 `components/share/useTreeDrag`。两边的差异只应该是行的内容，不应该是行为。

### 6.1 拖拽

- 整行 `draggable`，点击与拖拽由浏览器自行仲裁，不自己判定阈值。
- 行按高度四等分：上下两段是「插到该行前/后」，中间两段是「移进该目录」。
- **只禁止拖进自己的子树**（`dragNode.contains(target)`）。拖到祖先目录是合法的「移到上级」，不能拦。
- 悬停折叠目录 500ms 自动展开，不需要先点开再拖。
- 拖动目录时先把它自己折叠：列表不跳动，它的子节点也就不会成为落点。
- 落点线缩进到目标深度；越过 3 级上限的落点直接不给反馈。

### 6.2 搜索

搜索框在两棵树的顶栏，行为完全一致：

| 规则 | 说明 |
| --- | --- |
| 匹配范围 | **只匹配名称**——规则名 / 请求名 / 目录名。URL、matcher 摘要、method 一律不参与 |
| 匹配方式 | 忽略大小写与首尾空格，子串包含 |
| 叶子命中 | 显示该行，名字里的命中片段高亮 |
| 目录命中 | 目录显示且名字高亮，**其下全部内容一并显示**，不再逐条判定 |
| 目录未命中但子孙有命中 | 目录作为路径显示，名字不高亮 |
| 展开状态 | 搜索期间强制展开全部目录；清空搜索后恢复到搜索前的展开状态 |
| 零命中 | 显示占位文案 |

「目录命中就展示全部内容」是有意的：用户搜目录名时想看的是这个分组里有什么，而不是分组里哪些行也恰好重名。

### 6.3 右键菜单

- 目录行尾的 more 按钮与右键**打开同一个菜单**，不做成两套：菜单组件受控 `open`，more 按钮翻转它，右键由 `Dropdown` 自己接管。
- 菜单必须渲染到面板之外的层，否则会被侧栏的 `overflow` 裁掉。共享封装是 `components/TreeContextMenu`（Ant Design `Dropdown` + `trigger={['contextMenu']}` + `popupRender`），落点跟指针走并由 Ant Design 收敛在窗口内。
- `Dropdown` 的 children 必须是**真实 DOM 元素**，注入的 `onContextMenu` 与 ref 才收得到；所以菜单包在行组件内部（`RuleRow` / `RuleFolderRow` / `CollectionTreeNode`），而不是由树节点在外面包一层自定义组件。
- 每一行自己持有 `menuOpen`，整棵树不会因为一个弹层重渲染。
- 目录菜单：Rename / New subfolder / New leaf / Delete；叶子菜单：Rename / Delete（Rules 的规则多一项 Show matching requests，命中数为 0 时禁用）。
- 重命名一律**原地改成输入框**，不弹对话框。

Capture 请求菜单包在稳定的 RequestList 上，而不是虚拟化 RequestRow：右键行只更新目标 summary，
新请求推动列表滚动或回收触发行时 popup 不丢失。一级与 Breakpoint 二级均由 Ant `Dropdown/Menu`
渲染，二级使用 `items[].children` 的原生 hover 行为；`placement="right" + autoAdjustOverflow` 让高菜单
沿垂直副轴贴回窗口并在左右不足时翻转。outside click、Escape、焦点与 submenu 延迟均由 Ant 管理，
不得再用自绘 popup 或受控 `open` 覆盖其关闭状态。

### 6.4 正文全屏

- `components/BodyFullscreen` 是共享的 1060×660 弹层（Ant Design `Modal`，`closable={false}` + 自绘 head，点遮罩关闭），头部是标题 + MIME/尺寸 chip + Copy + Close。
- 全屏与内联**共用同一份内容**：`BodyViewer` / Composer `BodyPane` 各自算出一份 `content`，按 `fullscreen` 决定放进弹层还是留在原位，不复制第二份 Monaco。
- 全屏态下工具条隐藏 Copy 与 Fullscreen（头部已提供），只留 Format。
- 只有传了 `fullscreenTitle` 的调用点才有全屏入口：Capture 请求/响应正文、WebSocket 帧、gRPC 消息、Composer 请求/响应正文。

## 7. Automation 契约

`apps/desktop/src/shared/automation-ids.ts` 是稳定 `data-automation-id` 的唯一来源，集中定义静态 ID、Core-owned 动态行前缀与 `AutomationIdFactory`。共享 Button/Input/Select/Switch/Tabs/Segmented/Splitter 等组件只透传可选 automation ID，不包含测试状态；Shell、Agent Panel、Settings Agent、Capture、Rules 目录树与 Composer Collection 已接线到同一公共契约。

Storage现有Refresh按钮使用`automationId`传入公共ID；Exchange/Body引用数分别通过`settings.storage.exchange-count`、`settings.storage.body-count`及`data-count`暴露原始计数，正文占用通过`settings.storage.blob-bytes`及`data-bytes`暴露原始字节数。属性只在读取成功时存在，显示文本仍按当前语言格式化；不增加业务入口，也不允许以零代替加载失败。真实Pause/Resume workflow使用这些属性验证未录制连接不产生孤立正文。

**禁止在 Renderer 增加 E2E-only setter、隐藏 IPC 或直接业务调用入口。**

## 8. 主题与语言

四套时段主题由 `theme/theme.ts` + `styles/global.css` 驱动。

`renderer/i18n/` 用 `i18next` + `react-i18next` 注册 15 个本地静态完整 catalog。**首次启动由 `matchSystemLanguage(navigator.languages)` 跟随系统语言**（中文按 Hans/Hant 分流、`pt*` 统一到 `pt-BR`、其余按基础语言降级），匹配不到才回退英语；用户手选后的值写入 `localStorage` 并由 `resolveLanguageId` 精确解析。切换同步 Ant `ConfigProvider.locale`、`html lang`、localStorage 与 `Intl` 格式。

语言、主题和导出隐私仍由Renderer与`localStorage`持有；显式修改通过`setUiLanguage`、`setUiTheme`、
`setExportPrivacyDefaults`进入Main的`UiPreferencesService`，与Agent/MCP共用方法。常驻
`UiPreferencesActions`串行领取请求，调用i18n/主题setter并成功持久化后确认；Main广播已应用值到其他Renderer。
App只更新DOM属性，不在确认之后重复写存储。隐私单字段patch按最新已应用值合并，不覆盖连续的独立修改。
原生文件Dialog继续由既有调用提供标题，本组没有把语言配置传到Core或新建Main存储。

## 9. 验收要点

- 2026-09-11旧Shell Settings/Diagnostics深色场景显式展开侧栏，Settings另明确打开Certificates；标题使用已有`measureText`读取DOM Range，不将flex剩余空间当作字宽。复用现有`dark/<feature>/framed.png`，不生成或更新基准。Rules/Composer配置输出不变。
- 两个场景共10/10 matched、0 missing/flagged、最大0.9px，像素差Diagnostics约1.27%、Settings约1.45%。原Diagnostics为2 missing及标题1253.9px宽差；只修验收场景，不声明业务区域或整套parity通过。产品Shell、全局样式和tokens未改，不新增工具自身测试或重跑无关E2E；TEMP前缀`interceptor-shell-scenes-20260911`，报告见[Shell场景修正](../../commit-changes/202609111558_ui_parity_progress.html#shell-scenes)。
- 后续旧Shell Composer去掉多余的目录选择并在设计侧显式选中请求；Diagnostics浅色补展开侧栏和既有framed路径，两场景10/10、最大0.9px。Rules状态的13px误差来自设计测完整状态项、产品仅测内层文字；统一测完整状态项并另测7px圆点后，Undo/深色Shell Rules两场景6/6、最大0.1px。产品和设计源码均未修改，不生成基准，不把旧Shell Rules缺失PNG的n/a算像素通过；TEMP `interceptor-parity-{shell-followup,rules-status}-20260911*`。
- 六视图双主题、900×600 与四语言状态共 42 张截图，无页面级溢出。
- Agent阶段1共36个专项parity view、248个target，`0 missing / 0 flagged`；首层Panel与Settings空态四图
	合计`30/30 matched`，整体最大几何差`0.7px`。
- 多语言 smoke 在真实 Windows package 中逐项切换 15 种语言，验证持久化、UI 文案与页面无溢出。
- catalog 契约测试校验完整主 key、插值与 CLDR 多复数。
