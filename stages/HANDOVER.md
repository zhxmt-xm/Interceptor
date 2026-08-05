# Interceptor Handover

> 最后更新：2026-08-05
> 只记录接手当前工作的必要信息；已实现架构与历史细节不在这里重复。

## 接手顺序

1. 读本文件，确认当前工作、验证状态和下一动作。
2. 读 [ARCHITECTURE.md](ARCHITECTURE.md)，理解已实现的进程边界、所有权、通信、安全与打包路径。
3. 修改 feature 前读对应的 [../architecture/feature-*.md](../architecture/README.md)。
4. 只有追溯历史时才读 [archived/](archived/)；聊天摘要不是权威来源。

## 当前里程碑

Rules / Composer 共享目录树收尾已完成，详细设计与实现见：

- [../architecture/feature-rules.md](../architecture/feature-rules.md)
- [../architecture/feature-composer.md](../architecture/feature-composer.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)

本轮同时完成：

- Rules 与 Composer 共用 `tree.ts` / `useTreeDrag`，统一 3 级目录限制与动态 automation ID。
- Rules / Composer 15 种语言补齐，旧排序文案删除。
- Visual parity fixture、场景与 packaged smoke 对齐当前 BootScreen、目录树和 Collection 行为。
- `dompurify` / `ip-address` 固定到安全补丁版本，生产依赖 audit 恢复为 0。

## Git 与工作树

- 分支：`main`。
- 本轮起点：`origin/main` 的 `bec5249`。
- 本文件所在提交应包含上述收尾改动并已推送；接手时以以下命令确认实际状态：

```powershell
git status --short --branch
git log -4 --oneline
git diff --check
```

- 不提交 `.vite/`、`out/`、`playwright-report/`、`test-results/` 或未跟踪的 `renderer-shots/*.png`。
- `apps/desktop/tests/visual-parity/parity-report.md` 与 `design/app/shots/` 是保留的验收资产。

## 最近验证

- 四 workspace typecheck：通过。
- Tests：Desktop 180、Proxy Core 241、Protocol 15、MCP 45，共 481 项通过。
- Proxy Core 全套使用 `--no-file-parallelism`，避免大压缩流、真实文件 I/O 与随机端口并行产生 5 秒假超时。
- Visual parity：53 views / 375 targets / 346 matched / 29 missing / 226 flagged / 平均像素差 2.67%。
- 本轮 Rules、Composer 明暗主题与 runtime readiness 场景均 0 missing / 0 flagged。
- Windows x64 package：通过。
- Artifact audit：1,293 files / 391,180,632 bytes，通过。
- 真实 packaged smoke：1/1 通过。
- `npm audit --omit=dev`：0 vulnerabilities。
- 退出后 8888 已释放，WinINet `ProxyEnable=0`、`ProxyServer` 为空。

## 剩余工作

### 下一动作

按 idea 进入 **Breakpoint 交互重构**：

1. 读 [../architecture/feature-breakpoints.md](../architecture/feature-breakpoints.md)。
2. 读 `.github/skills/ui-design-mockup/SKILL.md`。
3. 先在 `design/app/` 定稿交互并出图，再修改 React；不要直接从产品代码开始。

### 独立队列

- Local E2E 仍是 0 条 implemented workflow。第一条必须从 `application.startup.ready` 开始，只通过公共 automation ID 操作真实 App UI；保存 trace/evidence 并验证 destroy 后才能改 Inventory 状态。
- Visual parity 仍有 29 missing / 226 flagged，主要属于 Capture、Settings、Updates 的既有场景债务；完整明细见 `parity-report.md`。
- 首个真实 tag release 仍缺仓库外 Windows 签名证书、Apple Developer ID、公证凭据与真实 macOS runner 证据。

## 风险与边界

- 系统代理由 Main 所有。开发实例与 smoke 都使用 8888，不能并行运行。
- 若进程被强杀并遗留 `127.0.0.1:8888`，先恢复 WinINet，再继续测试。
- `patches/mockttp+4.5.0.patch` 提供 headers 阶段钩子与 trailer 事件；升级 Mockttp 必须人工 review patch 并重跑真实 Core/package 测试。
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
- 已完成实现同步到 `ARCHITECTURE.md` 或对应 `architecture/feature-*.md`，不要复制到这里。
- 历史流水放 `stages/archived/`，不要继续堆叠在本文件。
