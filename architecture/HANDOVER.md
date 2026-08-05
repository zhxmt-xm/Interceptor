# Interceptor Handover

> 最后更新：2026-08-05
> 只记录接手当前工作的必要信息；已实现架构与历史细节不在这里重复。

## 接手顺序

1. 读本文件，确认当前工作、验证状态和下一动作。
2. 读 [platform/processes.md](platform/processes.md)，理解进程边界、两条通道、故障分类与关键数据结构。
3. 改代码前读对应的 [features/*.md](README.md)；涉及跨 feature 边界时读对应的 `platform/*.md`。
4. [README.md](README.md) 是整个文档目录的索引。

## 当前里程碑

**Capture / Composer / Rules 交互改进**进行中。需求清单在 [backlog/idea.md](backlog/idea.md) 的「Bugs或改进」一节，共 14 条。

### 设计稿：已定稿

`design/app/` 已按需求改完并重出 218 张 shots。本轮改动：

- Rules 规则行高修回 42px（`9a52780` 删除 RULES LIST 切换器时漏掉了 `tree-url` 的行高，掉回基础值 30px）。
- Rules 顶栏删 Apply 与 More（保存改由 editor 承担），补导出按钮；左树背景改为 `--filter`，与 Composer 一致。
- Inspector 分组可折叠：chevron 靠右，竖线与标题位置不动。顺带修掉 `.app.shell-v2 .scroll .sh::after` 写死 `left: 10px` 导致分隔线一直比竖线偏右的老问题。
- 正文全屏：13 处工具栏加 ⛶（Capture 请求/响应各档位、WS、gRPC、Composer 请求与响应），1060×660 dialog；MIME 去掉 charset 腾位置。
- Composer 树对齐 Rules：侧栏 216→320、行高 30、字号 12.5、间距 4、缩进移到行内、计数列对齐 `.rhit`。
- Composer 顶栏换成搜索框 + 新建/新建目录/导出，与 Rules 同一组图标。
- 两棵树补右键菜单（目录 4 项、叶子 2–3 项），菜单挂在 `.app` 下避免被侧栏裁剪。
- 拖拽逻辑参数化为 `installTreeDrag`，两棵树共用；顺带修了「不能拖到上级目录」——原判定 `node.contains(dragNode)` 把祖先目录整个禁掉了，应为 `dragNode.contains(node)`。
- 两棵树接上搜索过滤与命中高亮，规则见 [platform/renderer.md](platform/renderer.md) § 6.2。

### 产品代码：进行中

已完成：

- `Kv.module.css`：rule effect tag 只有 button 形态才给 `cursor: pointer`。
- `core-protocol/tree.ts`：新增 `parentFolderId`。
- `components/share/treeSearch.ts` + `components/HighlightedName/`：两棵树共用的搜索与命中高亮，规则见 [platform/renderer.md](platform/renderer.md) § 6.2。
- `composerStore`：目录与请求选中互斥；新建落点改为「选目录进目录、选请求跟它平级、都没选放根」；新增 `clearSelection`。
- Composer：顶栏换成搜索框 + 新建/新建目录/导出（图标与 Rules 同一组）；点空白取消选择；目录名与请求名双击原地改名；树接上搜索过滤与高亮；侧栏 216→320，行高 30、字号 12.5、间距 4、缩进移到行内、计数列对齐 `.rhit`。
- Rules：顶栏删 Apply 与 More、补导出；**保存入口移到 editor 头部的 Save 按钮**（顶栏删了 Apply 之后必须有替代入口，否则规则改完无法应用）；搜索由「跨目录拍平 + 匹配 matcher/action JSON」改为「保留树结构 + 只匹配名称」，与 Composer 一致。
- 规则导出链路：`rules:export` 通道 + Main `showSaveDialog` 落盘 + Preload `exportRules`，形态与集合导出一致，不经 Core。
- i18n 15 语言补齐 `rules.exportRules` / `rules.searchEmpty` / `rules.save` / `composer.searchRequests` / `composer.searchEmpty`。

未开始（按优先级）：

1. 两棵树的右键菜单，**用 Ant Design `Dropdown`**（`trigger={['contextMenu']}`，挂 body 上不会被面板裁剪，参考 `RequestRow`）；目录 more 按钮与右键共用同一个菜单。设计稿已画好三个菜单的内容。
2. Rules 创建子规则/子目录跟随选中项（Composer 侧已完成，Rules 的根级按钮仍固定建到根）。
3. Inspector 分组折叠；正文全屏 dialog（设计稿 13 处按钮 + 1060×660 弹层）。
4. `Format 按钮点了没反应` 待诊断——Monaco 的 HTML/CSS 服务与 MIME 判断都是好的，2 MiB 内还会自动格式化，怀疑是「已经格式化过所以看不出变化」，需要在真实 app 里实测。

### 上一轮已完成

上游代理链路修复与自愈，详见 [features/settings.md](features/settings.md) § 3.4。三个叠加根因：`<local>` 展开出裸 `::1` 让 `matchesNoProxy` 匹配一切、Mockttp `passthroughSocket` 写死 `net.connect`、写回的 bypass 缺 IP 字面量。

## Git 与工作树

- 分支：`main`。
- 本轮起点：`origin/main` 的 `1c18647`。
- 本文件所在提交应包含上述收尾改动并已推送；接手时以以下命令确认实际状态：

```powershell
git status --short --branch
git log -4 --oneline
git -c core.whitespace=cr-at-eol diff --check
```

- 仓库是 CRLF 工作区，裸 `git diff --check` 会把行尾 CR 报成 trailing whitespace；用 `-c core.whitespace=cr-at-eol` 才是真实结果。
- 不提交 `.vite/`、`out/`、`playwright-report/`、`test-results/` 或未跟踪的 `renderer-shots/*.png`。
- `apps/desktop/tests/visual-parity/parity-report.md` 与 `design/app/shots/` 是保留的验收资产。

## 最近验证

- 四 workspace typecheck：通过。
- Tests：Desktop 188、Proxy Core 248、Protocol 15、MCP 45，共 496 项通过。
- Proxy Core 全套使用 `--no-file-parallelism`。`upstream-probe.test.ts` 用真实 timer（1s 间隔 + 500ms 超时），跟别的套件抢 CPU 时会假失败，单独跑稳定 5/5。
- Windows x64 package：通过。
- Artifact audit：1,293 files / 391,243,058 bytes，通过。
- 真实 packaged smoke：1/1 通过。修了一处上一轮遗留——`onSystemProxyStatusChange` 没加进 smoke 的 Preload API 期望列表。
- `npm audit --omit=dev`：0 vulnerabilities。
- `git -c core.whitespace=cr-at-eol diff --check`：干净。
- **本轮未跑**：Visual parity。Composer 与 Rules 的 DOM/尺寸都变了，parity 基线需要连同右键菜单一起重出。

## 剩余工作

### 下一动作

1. 接着做产品代码剩余的 4 项（见上「产品代码」小节），右键菜单优先。
2. 全部做完后重出 Visual parity 基线，两棵树的 DOM 与尺寸都变了。
3. 之后按 idea 进入 **Breakpoint 交互重构**：
   1. 读 [features/breakpoints.md](features/breakpoints.md)。
   2. 读 `.github/skills/ui-design-mockup/SKILL.md`。
   3. 先在 `design/app/` 定稿交互并出图，再修改 React；不要直接从产品代码开始。

### 独立队列

- 上游代理仍有两块未验证：**认证代理**（公司 SSO / `Proxy-Authorization`，WinINet 不保存凭据）与 **macOS 上游检测**（快照按网络服务分存，多服务合并语义未定）。
- Visual parity 还没收录新的 upstream 状态栏场景（`statusbar-upstream-down`）。
- Local E2E 仍是 0 条 implemented workflow。第一条必须从 `application.startup.ready` 开始，只通过公共 automation ID 操作真实 App UI；保存 trace/evidence 并验证 destroy 后才能改 Inventory 状态。
- Visual parity 仍有 29 missing / 226 flagged，主要属于 Capture、Settings、Updates 的既有场景债务；完整明细见 `parity-report.md`。
- 首个真实 tag release 仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。

## 风险与边界

- 系统代理由 Main 所有。开发实例与 smoke 都使用 8888，不能并行运行。
- 若进程被强杀并遗留 `127.0.0.1:8888`，先恢复 WinINet，再继续测试。**残留还会让上游静默丢失**：接管前读到的“原有配置”就是自己，`isSelf` 会把它当作无上游，于是真正的公司代理地址就此丢失。
- `patches/mockttp+4.5.0.patch` 提供 headers 阶段钩子、trailer 事件与 `passthroughProxyConfig`（未解密直通走上游 CONNECT 隧道）；升级 Mockttp 必须人工 review patch 并重跑真实 Core/package 测试。
- Forge Vite Plugin 仍是 Experimental；修改 Main、Preload、IPC、Fuses、CSP、Core 生命周期或打包路径后必须重跑 package、artifact audit 与真实 smoke。
- Renderer 只能通过 `window.interceptor` 窄意图 API 访问 Main；正文留在 Core，按有限 range/chunk 读取。
- `UtilityProcess.parentPort` 只承载 lifecycle 与 MessagePort transfer；业务 RPC 只走专用 MessagePort。

## 常用验证

```powershell
npm run typecheck
npm run test --workspace @interceptor/desktop
npm run test --workspace @interceptor/proxy-core -- --no-file-parallelism
npm run test --workspace @interceptor/core-protocol
npm run test --workspace @interceptor/mcp-server
node apps/desktop/tests/visual-parity/parity.mjs
```

涉及打包边界时：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:package-audit --workspace @interceptor/desktop
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
git diff --check
```

## 更新规则

- 只写当前状态、工作树、验证、风险与下一动作。
- 已完成实现同步到 `platform-*.md` 或对应的 `feature-*.md`，不要复制到这里。
- 未承诺的远期方向放 [backlog/research.md](backlog/research.md)，不要堆在本文件。
