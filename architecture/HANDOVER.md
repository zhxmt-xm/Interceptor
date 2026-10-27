# Task List

> Tracked commit: `02f3172f`
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
  - 素材：README 已用 10 秒 Breakpoints GIF（中英字幕）；首发主视频见 item 19。
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

- **19. 分功能 Demo 视频与中英字幕 · 代码完成 · 待补 rules/composer**
  - 目标：在`apps/desktop/tests/demo-workflow-tests/`建立与E2E平级的独立录制workflow；入口为`npm start → Test → Demo 视频`，按feature选择，输出MP4和中英字幕（可附SRT/GIF）。不进入E2E日常套件，不要求全量维护。
  - 当前步骤：独立Playwright config、CDP抓帧fixture、runner、ASS/SRT/ffmpeg assembly和start菜单入口已就位；`capture`、`breakpoints` 两个feature已生成中英字幕MP4。旧README视频与MP4已删除。
  - 下一步：补`rules`、`composer` feature；在真实终端核对start菜单选择与输出路径；按Windows/macOS验证ffmpeg和字幕字体；确定官网/视频平台托管位置后再更新README或官网链接。
  - 约束：只操作真实App；视频不入库，官网/视频平台托管，README只放GIF或可播放页面链接；ffmpeg和字体按平台检测，缺依赖时明确失败；录制接管系统代理后核对恢复；单feature运行，不因本项扩大E2E套件。
  - 完成条件：`npm start`可选择feature并生成可播放MP4与中英字幕；同一feature可重复生成；输出目录含video、字幕和manifest；README/官网/渠道引用一致。
