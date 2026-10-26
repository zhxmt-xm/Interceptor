# Task List

> Tracked commit: `462618e5`
> Homepage guidebook: `83999b9`

## 维护规则

- 只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 不记录时间线、尝试次数、测试数字、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入 `architecture/features/` 或 `architecture/platform/`。

- **12. 推广方案与逐平台备稿、发布 · 待实现**
  - 目标：确定平台与受众，逐个平台准备完整材料后发布，不停留在渠道建议或通用模板。
  - 候选渠道：V2EX、掘金、B 站、Show HN、Reddit、DEV Community、YouTube、Product Hunt 及开源周刊，按受众和规则筛选，不要求全部发布。
  - 下一步：先定渠道与帖子清单，再按顺序备稿、核对社区规则、确认授权后发布。
  - 完成条件：每个选定渠道有最终稿、素材和发布链接；账号或规则阻塞时记原因，继续其他渠道。

- **14. Android USB 流量接入 · blocked**
  - 目标：Android 以 `VpnService` 创建 TUN，经 USB/`adb reverse` 接入 PC；Android 为唯一连接源站，PC 复用 Rules、Breakpoints 与 Capture。
  - 当前阻塞：物理 USB 拔线与重连、ARM64 或真实 16KiB 设备、带 DHCP 搜索域或 NAT64 的专用网络，以及 Windows 重启后的模拟器与最终包验收。
  - 下一步：重启 Windows 后核对加速与模拟器并续验 Windows 流程；连接物理设备后验证拔线/重连与旧请求不重放；具备 ARM64 与专用网络后分别续验。
  - 待修：`capture-{import,export}-menu{-dark}` 场景缺 Android toolbar 按钮，产生位置差异。
  - 约束：正式发版必须指定私有 Release asset、APK SHA-256 与签名证书 SHA-256，拒绝 debug 证书、换签和降级，见[发布架构](platform/release.md#21-android-apk-与-adb-runtime)。缺环境时保持 `blocked`，不伪造 Network 或绕过系统授权。本机环境见[测试文档](platform/testing.md#windows-android-local-environment)。

- **17. E2E 契约、workflow 与用户教程对齐 · 进行中**
  - 目标：逐项把验收契约对应到可执行 workflow 的输入、操作和断言，再对应用户教程；稳定契约留在 [E2E README](../apps/desktop/tests/e2e-workflow-tests/README.md) 与 `docs/`。
  - 运行约束：运行 E2E 前执行 `env -u ELECTRON_RUN_AS_NODE`；E2E 在前台运行，后台 job 的 stdio 会把测试超时拖成看起来像 runner 卡死。
  - 当前进度：Phase 1 已完成并有 Windows 真实 E2E 证据；Phase 2 未开始；macOS 与 packaged smoke 未跑。
  - **Phase 2 · 三条新 workflow**（先核对 spec 已写清输入、步骤和断言）
    - `application.lifecycle.profile-isolation`：A/B 两 profile 的主题、语言、Rules、Capture 互不串，切换只影响当前 profile。
    - `shell.appearance.language`：15 语言矩阵的 UI 文案、布局不溢出、跨重启持久化。
    - `capture.list.virtual-scroll`：超出 viewport/overscan 的有限 DOM row、滚动选择、跨 workspace 保持、追加请求的跟随行为。
  - **Phase 3 · 核对已有覆盖**：按 E2E Inventory 的 44 条契约（Shell 5、Capture 12、Rules 7、Composer 3、Breakpoints 6、Diagnostics 4、Settings 7）逐条核对是否已有 workflow 与断言，产出“契约 → workflow → 已断言/缺口”映射，只补真实缺口，不重复开发。
  - **Phase 4 · Homepage 教程**：`guidebook-coverage.md` 补 `shell.guidebook.online`、`shell.guidebook.i18n` 并把契约数改为 149；中英文 `workspace.md` 补 App 内 Guidebook 入口、阅读与搜索、图片、主题/语言同步、刷新/Retry、浏览器出口；改动现有截图来源 workflow 时同步 `screenshot-publication.json`。
    - 截图发布契约：`breakpoints/execute-edited.workflow.ts` 与 `mcp/streamable-http.workflow.ts` 的截图步骤与标题已变，`screenshot-publication.json` 仍锁旧 `workflowSha256` 与 checkpoint 序列；必须在 macOS 重跑教程截图并更新契约后再发布，未完成前不重发这两组图。
    - Composer URL 文案：中英文 `composer.md` 仍要求“只填 scheme 后部分、不要重复粘贴协议”；产品现已支持粘贴完整 URL 并整体替换 scheme，需同步改文案。
    - Diagnostics 文案：`guidebook-coverage.md` 把 `diagnostics.pagination` 链到 `#filters`；教程未说明 Load earlier 的旧记录插到列表顶部（按钮在底部），需补说明并改链接。
    - 教程缺口：`composer.send-failure`、`breakpoints.execute-edited` 的 replace/set/remove 与 add/remove header、`rules.apply-conflict` 的 stale Apply 尚无教程步骤。
  - `blocked`：`settings.updates.download-open` 与 `settings.update-notification` 需可匿名访问的新 Release 和对应平台 packaged App。
  - 待确认：切出 Composer 再返回时组件重新挂载会把 Collection/Response 重置为初始尺寸，是否写入 `composer.resize` 契约。
  - 交付前：Main 退出、Renderer、Rules/Diagnostics 改动需跑 package → artifact audit → packaged smoke；macOS 未跑。
  - 下一步：Phase 2 先核对三条 spec，再按 `application.lifecycle.profile-isolation` → `shell.appearance.language` → `capture.list.virtual-scroll` 实现并跑真实 E2E；Phase 4 先处理文案与 coverage 链接，截图契约等 macOS 轮次。
