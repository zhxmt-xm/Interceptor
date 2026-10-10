# Task List

> Tracked commit: `8887f167`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`，改动说明写入对应`commit-changes/`文件。

- **8. Windows 实机验收 · 待验收**
  - 目标：在Windows实机验证CA/UAC、系统代理/AppContainer、TLS/H2/gRPC、原生导入导出、平台helper、上游代理/WPAD、最终产物与退出恢复。
  - 阻塞：当前没有可用的Windows实机验收环境；macOS结果不能替代Windows发布门禁。
  - 下一步：具备Windows实机及授权后执行[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)，确认进程、8888、代理、journal和证书恢复。

- **13. 按commit发版与首个Release · 待Release CI/产物验收**
  - 目标：从已推送的源码commit选择版本和原生目标，通过CI构建、验收并发布首个Release。
  - 当前：ExchangeTracker已实现固定1秒迟到观测窗口，立即标记aborted且不延长网络结束时间；CaptureService的writer所有权与网络终态分离，Clear/Session删除/退出可取消回收。Core回归、真实H2及macOS打包验收已验证；Playground已提供客户端/源站错误GOAWAY手动场景、部分正文与独立恢复证据，真实Browser到Electron Capture及共用H2/gRPC/TLS链路已验证。Release必须选用包含上述修复的源码commit，不能使用旧源码`8887f167`或旧CI当作新修复的发行证据。边界见[Capture](features/capture.md#h2错误goaway)，操作见[Playground](../apps/playground/README.md#手动复现h2中断正文)。
  - 约束：不修改本地版本、配置或历史来迁就发版；不创建空Release，不用旧产物或旧CI结果证明新源码。
  - 下一步：选择包含修复的新源码commit运行完整Release CI；Green后验收实际下载的alpha安装包，再发布`v0.1.1-alpha.0`（macOS x64 DMG/ZIP）。1秒是尽力保留策略，不宣称精确排空上游通知；本轮未改第三方补丁、网络转发或UI布局。
