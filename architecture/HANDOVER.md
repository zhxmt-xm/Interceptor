# Task List

> Tracked commit: `84cb3bb5`
> Homepage guidebook: `07645818`

## 维护规则

- 只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 不记录时间线、尝试次数、测试数字、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入 `architecture/features/` 或 `architecture/platform/`。

- **12. 推广方案与逐平台备稿、发布 · 待实现**
  - 目标：确定平台与受众，逐个平台准备完整材料后发布，不停留在渠道建议或通用模板。
  - 候选渠道：V2EX、掘金、B 站、Show HN、Reddit、DEV Community、YouTube、Product Hunt 及开源周刊，按受众和规则筛选，不要求全部发布。
  - 发布前门面：补 `SECURITY.md`、`CONTRIBUTING.md` 与 bug issue 模板；隐藏未使用的 Wiki/Projects/Packages，并核对 Packages 无意外公开包。Homepage Download 当前 302 到 `/releases`，本轮保持，不改平台直链或 UA 跳转。
  - 首轮节奏：只发 V2EX「分享创造」1 帖；48 小时只看 unique visitors、README views、release 页 views、asset 下载增量，不以 clones 或 star 数作唯一指标；不同时发多平台。
  - 扩渠道：首轮有真实下载后再按掘金、即刻/X、少数派/周刊、Reddit/HN 顺序备稿；Product Hunt 单独一轮，不与其他渠道同日发。
  - 素材：README 已用 6 个 feature 的 1440 宽 APNG（中英字幕），总下载约 7MB；首发主视频暂缓，先完成 README 演示闭环。
  - 下一步：先完成 item 19 的 30 秒总览片与门面文件，再定渠道清单并按 V2EX → 掘金/即刻/X → Reddit/HN → 周刊/PH 顺序备稿；正式外发使用已交付教程及 item 11、15 的资料与入口，未验收场景继续按[Guidebook验证范围](features/guidebook.md#6-与当前验证范围的差异)保留边界，本轮不操作外部账号或对外发布。
  - 完成条件：每个选定渠道有最终稿、素材和发布链接；账号或规则阻塞时记原因，继续其他渠道。

- **14. Android USB 流量接入 · blocked**
  - 目标：Android 以 `VpnService` 创建 TUN，经 USB/`adb reverse` 接入 PC；Android 为唯一连接源站，PC 复用 Rules、Breakpoints 与 Capture。
  - 当前阻塞：物理 USB 拔线与重连、ARM64 或真实 16KiB 设备、带 DHCP 搜索域或 NAT64 的专用网络，以及 Windows 重启后的模拟器与最终包验收。
  - 下一步：重启 Windows 后核对加速与模拟器并续验 Windows 流程；连接物理设备后验证拔线/重连与旧请求不重放；具备 ARM64 与专用网络后分别续验。
  - 待修：`capture-{import,export}-menu{-dark}` 场景缺 Android toolbar 按钮，产生位置差异。
  - 约束：正式发版必须指定私有 Release asset、APK SHA-256 与签名证书 SHA-256，拒绝 debug 证书、换签和降级，见[发布架构](platform/release.md#21-android-apk-与-adb-runtime)。缺环境时保持 `blocked`，不伪造 Network 或绕过系统授权。本机环境见[测试文档](platform/testing.md#windows-android-local-environment)。

- **18. Updates 纳入 alpha 并按版本号选择更新 · 代码完成 · 待 E2E**
  - 目标：匿名读取全部 Release 分页，排除 draft，按 SemVer 选择最高有效版本，包括 alpha；相同或更旧版本不提示升级，文案不再限定正式版。
  - 已验证范围：版本选择、分页、失败处理与通知文案的 unit/integration、Desktop typecheck、Updates 浅深主题和状态 parity；当前 Windows packaged App 的真实检查与重启恢复。
  - 当前阻塞：`settings.updates.download-open` 与 `settings.update-notification` 需要可匿名访问且高于当前 `0.1.1-alpha.1` 的 Release 及对应平台安装包；现有最高 alpha 与当前 App 同版，真实检查为 `up-to-date`，下载和通知分支未验收。
  - 下一步：具备更高版本的公开 Release 后，用对应平台 packaged App 续验下载、打开安装器和通知，保留 trace、各代进程退出、8888 释放及系统设置恢复证据。

- **19. 分功能 README 演示 APNG 与中英字幕 · 6 个 feature 完成 · 待 GitHub 验证**
  - 目标：在`apps/desktop/tests/demo-workflow-tests/`建立与E2E平级的独立录制workflow；入口为`npm start → Test → README Demo`，按feature选择，生成README用APNG和中英字幕并覆盖`architecture/assets`固定文件。不进入E2E日常套件，不要求全量维护。
  - 当前步骤：六个workflow用PNG抓帧生成1440×810 APNG，输出目录用本地时间；`npm start` 支持多选、空选返回；APNG自动覆盖固定asset并更新`readme-media.json`；六张已接入英文README。
  - 下一步：确认GitHub实际播放APNG并处理缓存；检查README六张APNG总下载量；菜单多选已在本地实际运行。
  - 约束：只操作真实App；本轮只产出README用APNG，不生成MP4或SRT；不用GIF；APNG必须覆盖固定asset，不新增每轮文件名；Agent/MCP使用本地lab，不接外部账号；ffmpeg和字体按平台检测，缺依赖时明确失败；录制接管系统代理后核对恢复；每个feature单独启动App，多选按顺序执行，不因本项扩大E2E套件。
  - 完成条件：`npm start`可多选feature并生成可播放APNG与中英字幕；同一feature可重复生成并覆盖固定asset；输出目录含APNG、字幕源和manifest；README引用同一路径。

- **20. macOS packaged 刷新保护与 demo 渲染验证 · 待 macOS**
  - 目标：在 macOS packaged App 验证 Cmd+R、F5、Cmd+Shift+R 不 reload，应用菜单无 View/Reload，app/edit/window 菜单正常；开发态 Cmd+R/HMR 保留。
  - 当前：Windows packaged smoke 已覆盖 Ctrl+R/F5/Ctrl+Shift+R；macOS 菜单与快捷键尚未执行；demo 的 PingFang SC/Helvetica Neue 字体和 ffmpeg arm64 二进制尚未验证。
  - 下一步：在 macOS 跑 packaged smoke 的 refresh 断言，检查菜单栏与 Copy/Paste/Quit；跑一个 demo feature，确认字幕字体、1440×810 APNG 和 FFMPEG_PATH；必要时补 arm64 处理。
  - 约束：必须用真实 macOS packaged App，不用 Windows 结果代替；无机器时保持待验证，不伪造。
