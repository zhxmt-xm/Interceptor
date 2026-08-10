# 平台架构：Renderer Shell

> 最后更新：2026-08-05
> 范围：跨 feature 的 Renderer 结构——应用外壳、窗口 chrome、冷启动、共享组件库、主题与语言、automation 契约。
> 单个 feature 工作区的内部设计见对应的 `../features/*.md`；视觉取值以 [../../design-vite/design-system.md](../../design-vite/design-system.md) 为准。

> Renderer 只通过 `window.interceptor` 意图 API 访问 Main，不触达 Electron / Node / MessagePort。

## 1. App shell

`app/App.tsx` 持有 `themeMode`（light/warm/dark/ember），消费 i18next 当前语言，并直接拥有全高侧栏 + 46px Window Header + `main` + 30px `footer` 的 Grid；按 `ViewId` 注入对应 feature 的 main/statusbar。`app/Sidebar.tsx` 负责导航与底部主题/语言切换器，不再保留单独的 `AppShell` 转发层。

## 2. 冷启动加载界面

`app/BootScreen/` 在代理链路可用前全屏遮盖 shell，只留共享的 `components/WindowControls/`。它只表达三件必备且全自动的事：`CoreProcessStatus.state` → `CaptureStatus.listening` → `SystemProxyStatus.owned`；阶段存于 `app/bootStore.ts`，由 `bootstrapCapture` 推进。

系统代理**自动接管**（`ensureSystemProxyOwned` 直接调 `enableSystemProxy`），不要求启动时授权；MITM 不属于启动流程。遮盖只属于冷启动（`dismissed` 不可逆），运行期的 Core 重启与 ownership lost 仍由 `ProxyReadinessDialog` 承接，两者不同时显示。

## 3. 自有窗口 chrome

Windows/macOS BrowserWindow 均为 `frame:false`；Renderer 46px Window Header 是 drag region，左侧只保留 no-drag 的侧栏折叠按钮和 feature 名称，右侧固定 Minimize / Maximize-or-restore / Close 三按钮。Close 经窄 Preload IPC 进入 `app.quit()` 的 guarded 系统代理恢复与 Core shutdown。

业务命令不进入 Header；UpdateNotification 是 Header 下方的独立 overlay，不占 Header flex。

## 4. Feature workspaces

`features/{capture,rules,composer,breakpoints,diagnostics,settings}/` 均为 Main/Statusbar + colocated CSS Module，无 Feature Topbar。各 feature 的业务命令分别位于自己的列表、协议、暂停队列和日志内容工具栏；内容工具栏统一为 `--content-toolbar-height`（44px）。状态统一进入 Statusbar。所有左右分栏复用 1px `Splitter`，抓手为同一 flex 中轴上的 4×40px 子项。

## 5. 共享组件库

`components/` 是扁平库，每个组件独立子目录（`Component.tsx` + `Component.module.css`）；含 Flyout（portal 锚定弹层）、ThemeSwitcher、LanguageSwitcher（侧栏底部）。`Tabs` 在容器放不下时把尾部项收进 `…` Flyout（隐藏测量层 + `ResizeObserver`），保证面板头高度固定。

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

### 6.4 正文全屏

- `components/BodyFullscreen` 是共享的 1060×660 弹层（Ant Design `Modal`，`closable={false}` + 自绘 head，点遮罩关闭），头部是标题 + MIME/尺寸 chip + Copy + Close。
- 全屏与内联**共用同一份内容**：`BodyViewer` / Composer `BodyPane` 各自算出一份 `content`，按 `fullscreen` 决定放进弹层还是留在原位，不复制第二份 Monaco。
- 全屏态下工具条隐藏 Copy 与 Fullscreen（头部已提供），只留 Format。
- 只有传了 `fullscreenTitle` 的调用点才有全屏入口：Capture 请求/响应正文、WebSocket 帧、gRPC 消息、Composer 请求/响应正文。

## 7. Automation 契约

`apps/desktop/src/shared/automation-ids.ts` 是稳定 `data-automation-id` 的唯一来源，集中定义静态 ID、Core-owned 动态行前缀与 `AutomationIdFactory`。共享 Button/Input/Select/Switch/Tabs/Segmented/Splitter 等组件只透传可选 automation ID，不包含测试状态；Shell、Capture、Rules 目录树与 Composer Collection 已接线到同一公共契约。

**禁止在 Renderer 增加 E2E-only setter、隐藏 IPC 或直接业务调用入口。**

## 8. 主题与语言

四套时段主题由 `theme/theme.ts` + `styles/global.css` 驱动。

`renderer/i18n/` 用 `i18next` + `react-i18next` 注册 15 个本地静态完整 catalog。**首次启动由 `matchSystemLanguage(navigator.languages)` 跟随系统语言**（中文按 Hans/Hant 分流、`pt*` 统一到 `pt-BR`、其余按基础语言降级），匹配不到才回退英语；用户手选后的值写入 `localStorage` 并由 `resolveLanguageId` 精确解析。切换同步 Ant `ConfigProvider.locale`、`html lang`、localStorage 与 `Intl` 格式。

Renderer 经受限的 `setUiLanguage` Preload 意图把 15 值枚举同步给 Main，Main 只用内存状态本地化自己持有的 HAR/archive/Diagnostics 文件对话框，**不把路径或通用 IPC 暴露给 Renderer**。

## 9. 验收要点

- 六视图双主题、900×600 与四语言状态共 42 张截图，无页面级溢出。
- 多语言 smoke 在真实 Windows package 中逐项切换 15 种语言，验证持久化、UI 文案与页面无溢出。
- catalog 契约测试校验完整主 key、插值与 CLDR 多复数。
