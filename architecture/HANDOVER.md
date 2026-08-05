# Interceptor Handover

> 最后更新：2026-08-05
> 只记录接手当前工作的必要信息；已实现架构与历史细节不在这里重复。

## 接手顺序

1. 读本文件，确认当前工作、验证状态和下一动作。
2. 读 [platform/processes.md](platform/processes.md)，理解进程边界、两条通道、故障分类与关键数据结构。
3. 改代码前读对应的 [features/*.md](README.md)；涉及跨 feature 边界时读对应的 `platform/*.md`。
4. [README.md](README.md) 是整个文档目录的索引。

## 当前里程碑

**上游代理链路修复与自愈**已完成，详细设计与实现见：

- [features/settings.md](features/settings.md) § 3.4 上游代理链式转发
- [features/capture.md](features/capture.md) § 8.4 不阻塞捕获管线
- [platform/processes.md](platform/processes.md) 进程与通信

起因是接管系统代理后整机断网。三个彼此独立的缺陷叠加，任一个单独存在都足以让流量绕过公司上游：

1. `<local>` 展开出裸 `::1`，`matchesNoProxy` 把空 host 当作匹配一切 → **所有**请求判定为 bypass，上游被整体跳过。
2. Mockttp `passthroughSocket` 把 `net.connect` 写死 → MITM 关闭时全部 HTTPS 直连。
3. 接管时写回的 bypass 只有 `<local>`，它不匹配 IP 字面量 → 本机与内网流量被推进代理。

本轮完成：

- `patches/mockttp+4.5.0.patch` 纯增量补 `passthroughProxyConfig`，为未解密直通建立 CONNECT 隧道；`--reverse` 后文件哈希与原始一致。
- `websocket-bridge.ts` 注入 `HttpsProxyAgent`，补上第三条出网路径；`https-proxy-agent` 收敛为单一 7.0.6（root 的 5.0.1 无 `connect()`，必须在 proxy-core 显式声明）。
- `UpstreamProbe` 每 1s 探测上游，不可达自动降级直连、恢复后自动升级，只在状态翻转时下发与广播。
- Capture 状态栏新增 `upstream host:port` / `direct`，降级转黄并给提示；15 种语言补齐。
- `appPending` 让 Application 分栏在归属反查期间不再闪 Unknown。
- 设计稿同步：`design/app/` 新增 upstream 状态（on/down/none），删除已废弃的 RULES LIST 切换器，重出 218 张图。

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
- Proxy Core 全套使用 `--no-file-parallelism`，避免大压缩流、真实文件 I/O 与随机端口并行产生 5 秒假超时；跟 desktop 并行跑时 `h2.integration.test.ts` 会假失败。
- 真实链路手工验证：dev 实例接管后经上游 7890 访问外网返回 200，netstat 确认 Core→7890 有连接；关掉上游进程后 1s 内降级直连，重启后自动恢复。
- `npm run build:core`：通过，`https-proxy-agent` v7 已内联进 `entry.cjs`。
- `npm audit --omit=dev`：0 vulnerabilities。
- **本轮未跑**：Visual parity、Windows package、artifact audit、packaged smoke。本轮改了 Main / Preload / IPC 契约，按下节要求必须先补齐再进新功能。
- 上一轮基线（仍适用，未重跑）：Visual parity 53 views / 375 targets / 346 matched / 29 missing / 226 flagged / 平均像素差 2.67%；Artifact audit 1,293 files / 391,180,632 bytes；packaged smoke 1/1。

## 剩余工作

### 下一动作

1. **先补打包链验证**。本轮改了 Main（`main.ts`、`system-proxy/`）、Preload 与 `system-proxy:status-changed` IPC 契约，按本文末尾「涉及打包边界」命令跑 package / artifact audit / smoke。
2. 然后按 idea 进入 **Breakpoint 交互重构**：
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
