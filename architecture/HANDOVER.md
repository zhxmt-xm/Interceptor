# Task List

> Tracked commit: `822734cd`

## 维护规则

- Handover只记录未完成任务的目标、当前阻塞、下一步和必要运行约束。
- 禁止记录执行时间线、尝试次数、测试数字、失败重试、提交推送过程、完成总结或证据流水。
- 任务完成后立即从本文件删除；稳定行为写入`architecture/features/`或`architecture/platform/`，改动说明写入对应`commit-changes/`文件。

- **8. Windows 实机验收 · 待验收**
  - 目标：在Windows实机验证CA/UAC、系统代理/AppContainer、TLS/H2/gRPC、原生导入导出、平台helper、上游代理/WPAD、最终产物与退出恢复。
  - 阻塞：当前没有可用的Windows实机验收环境；macOS结果不能替代Windows发布门禁。
  - 下一步：具备Windows实机及授权后执行[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)，确认进程、8888、代理、journal和证书恢复。

- **12. macOS上游代理配置（含WPAD） · blocked**
  - 目标：提供System、Direct、Manual、PAC、WPAD五种上游模式，并保持Settings与Capture入口、持久化、运行状态及退出恢复一致。
  - 阻塞：TLS passthrough向PAC传入错误scheme，按协议选路的HTTPS上游可能被误判为HTTP；纯DHCP Option 252网络尚未验收。
  - 约束：仅推进macOS，固定保留Mockttp；用户优先避免新增本地patch带来的风险，不以实施成本较低为由推荐修改第三方源码。当前不新增或修改第三方patch，不改PAC条件、用户headers、目标协议或测试输入规避问题；不以运行时替换第三方方法冒充无patch。修改系统网络前必须取得明确授权并准备独立回滚。
  - 下一步：依据[替代库评估](backlog/research.md#upstream-library-assessment)聚焦正式发布的PAC/HTTP Agent兼容替代；确认它能取得正确TLS协议和实际端口，不能假设更换下游自动修复上游传参。Axios等发送层迁移不属于默认实施范围；未验证前保持blocked，不承诺换库零风险。具备受控DHCP网络和恢复条件后完成Option 252验收。

- **13. 按commit发版与首个Release · blocked**
  - 目标：从已推送的源码commit选择版本和原生目标，通过CI构建、验收并发布首个Release。
  - 阻塞：尚未以当前源码commit `822734cd`重新运行完整Release CI；`v0.1.1-alpha.0`尚未创建。
  - 约束：不修改本地版本、配置或历史来迁就发版；不创建空Release，不用旧产物或旧CI结果证明新源码。
  - 下一步：运行`npm run release`选择`822734cd`；CI全量Green后完成安装包、授权、packaged smoke和退出恢复验收。

- **17. PAC明文HTTP代理的raw-header兼容 · blocked**
  - 目标：PAC选择HTTP代理时保留真实目标、Host、重复headers、非默认端口及POST正文，不静默改成直连。
  - 阻塞：Mockttp与proxy-agent发送链仍不能同时保证目标回退和原始headers保真，正式上游修复尚不可用。
  - 约束：保留Mockttp，优先使用正式代理库替代而不是自行维护HTTP/PAC Agent补丁；没有本项故障依据的HTTPS/SOCKS Agent不连带更换。
  - 下一步：核对HTTP Agent替代和PAC Agent依赖绑定、真实Mockttp接入及完整行为；若必须变更传参表示或扩大为发送层迁移，先说明差异并取得确认。不得把同底层包装、强制CONNECT或改名后的运行时补丁当作等价无风险替代；当前不新增第三方patch或自建代理绕过。
