# Task List

> Tracked commit: `dbb03c34`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`，改动说明写入对应`commit-changes/`文件。

- **8. Windows 实机验收 · 待验收**
  - 目标：在Windows实机验证CA/UAC、系统代理/AppContainer、TLS/H2/gRPC、原生导入导出、平台helper、上游代理/WPAD、最终产物与退出恢复。
  - 阻塞：当前没有可用的Windows实机验收环境；macOS结果不能替代Windows发布门禁。
  - 下一步：具备Windows实机及授权后执行[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)，确认进程、8888、代理、journal和证书恢复。

- **13. 按commit发版与首个Release · 进行中：Release CI与下载产物验收**
  - 目标：从已推送的源码commit选择版本和原生目标，通过CI构建、验收并发布首个Release。
  - 当前：源码`dbb03c34886ec780f053c9208a53479fdfe1eee0`包含全库稳定依赖升级、SSE补丁、固定1秒中断正文收尾及Playground两方向错误GOAWAY入口。[本轮CI](https://github.com/zhxmt-xm/Interceptor/actions/runs/38056782529)通过代码检查，但产物审计拒绝ASAR中的旧版本；尚无tag、draft或Publish。
  - 当前边界：既有Mockttp补丁迁移到4.6.3；Forge 8的Main/Preload使用`.cjs`正式入口，E2E准备使用公开VitePlugin生产构建hook，HTTPS代理按ESM加载。全workspace类型与代码测试、Core/worker、两套SPA、Browser/设计交互、完整parity及主要真实流程已验证；生产依赖审计已清除旧CI阻塞，CI下载产物仍须独立验证。
  - 当前步骤：本机可执行的Rules导入导出、Settings及正文滚轮边界已按原driver验证，最新package/audit及默认路径smoke已通过。H2集成改为等待CaptureService真实释放采集关联，最终全workspace检查已通过；不修改1秒窗口或增加测试超时。后台显示候选与实验程序已清理，生产显示/聚焦逻辑不变。
  - 当前步骤：`apps/desktop/forge.config.ts`同时向`readPackageJson`和`packagerConfig.appVersion`传递发版版本，配置回归、类型检查、实际alpha App/ASAR、DMG/ZIP审计及smoke已验证；源码manifest与lockfile逐字保持不变。不改第三方或版本审计，追加一次item 13的配置修正提交，不改写已推送源码，再以新SHA重跑CI。
  - 当前边界：SSE补丁在Mockttp通用错误入口增加`response.destroyed && !response.writableFinished`判断，停止向已中断响应追加未发送的错误正文；Core固定1秒收尾保留。普通错误边界、真实HTTP/SSE与H2/gRPC/TLS/Playground及退出恢复已验证；不以Core删除错误字符串、丢弃全部迟到数据或放宽断言代替。CI下载产物仍须独立验收，不能由本地package代替。
  - 实机约束：Main/Core与测试子进程已退出，8888、系统代理与journal已恢复；不通过强杀跳过恢复。新构建如再次要求钥匙串密码或系统授权，必须在真实系统弹窗处理，不绕过safeStorage或Gatekeeper。开发工具链的DMG、extract-zip、patch-package依赖公告仍单独保留，不能把生产审计通过写成所有依赖无告警。
  - 验收限制：AppContainer顺序、批量写入及写入Tool依赖Windows API；Bilibili登录探针依赖Windows UI Automation与已登录Edge，macOS缺少上述运行条件。证书生命周期专项要求空共享CA目录，不能删除日常CA凑前提；DNS/DHCP WPAD与真实MCP Host需要各自的额外环境。上述范围独立保留，不能改写为通过。
  - 约束：不修改本地版本、配置或历史来迁就发版；不创建空Release，不用旧产物或旧CI结果证明新源码。
  - 下一步：CI Green后核对draft资产的版本、架构和SHA-256，完成实际浏览器下载、安装、系统授权和退出恢复，再在现有Release向导确认Publish。不跳过审计，不擅自增加第三方补丁行为或更改仓库可见性。
