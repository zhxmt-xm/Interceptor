# Task List

> Tracked commit: `54603429`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`，改动说明写入对应`commit-changes/`文件。

- **8. Windows 实机验收 · 待验收**
  - 目标：在Windows实机验证CA/UAC、系统代理/AppContainer、TLS/H2/gRPC、原生导入导出、平台helper、上游代理/WPAD、最终产物与退出恢复。
  - 阻塞：当前没有可用的Windows实机验收环境；macOS结果不能替代Windows发布门禁。
  - 下一步：具备Windows实机及授权后执行[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)，确认进程、8888、代理、journal和证书恢复。

- **13. 按commit发版与首个Release · blocked**
  - 目标：从已推送的源码commit选择版本和原生目标，通过CI构建、验收并发布首个Release。
  - 阻塞：尚未以当前源码commit `822734cd`重新运行完整Release CI；`v0.1.1-alpha.0`尚未创建。
  - 约束：不修改本地版本、配置或历史来迁就发版；不创建空Release，不用旧产物或旧CI结果证明新源码。
  - 下一步：运行`npm run release`选择`822734cd`；CI全量Green后完成安装包、授权、packaged smoke和退出恢复验收。
