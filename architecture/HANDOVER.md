# Task List

> Tracked commit: `ebd0e889`

- **8. Windows 实机验收 · 待验收**
  - 范围：按[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)验证CA/UAC、系统代理/AppContainer、TLS/H2/gRPC、原生导入导出、平台helper、最终产物与退出恢复；包含已登录Edge的Bilibili流程和纯Auto Detect/WPAD环境。
  - 当前：macOS结果不能替代Windows；只排除Manager管理员MMC原生打开/关闭专项，不排除Manager功能。Windows待验不阻塞其他item已满足自身门禁的提交，但不免除发布门禁。
  - 下一步：具备Windows实机及授权后逐组验收，确认进程、8888、代理、journal和证书恢复。

- **10. HTTP编辑正文framing · blocked（无补丁方案未验证）**
  - 目标：覆盖H1/H2、请求/响应、Text/File及header-only、body-only、header+body，遵守[编辑契约](features/http-message-editing.md)。
  - 当前：chunked请求被补Content-Length并删除chunked，响应可能同时出现Content-Length与Transfer-Encoding；完整wire矩阵未齐。
  - 下一步：只验证正式API、配置或无需调整现有补丁的上游方案，不修改用户headers或重放请求规避缺陷。

- **12. WPAD · blocked（缺纯Auto Detect环境）**
  - 目标：在没有显式代理地址和PAC URL的真实WPAD网络中，核对接管前后流量路径及退出恢复。
  - 当前：Windows无可用上游URL时按直连处理；macOS仅Auto Detect时在接管前拒绝。本机不具备纯WPAD条件，显式代理/PAC结果不能替代。
  - 下一步：取得macOS真实环境后验收；Windows归第8项。此项不代表已承诺新增WPAD发现实现，边界见[Settings](features/settings.md#macos-effective-upstream)。

- **13. 首个真实tag release · 待验收**
  - 范围：真实tag触发CI、Windows签名/MSI、macOS Developer ID/公证/DMG/ZIP、artifact audit、smoke、安装恢复及Release assets；诊断文件不进入发布资产。
  - 当前：Forge makers、签名配置和CI已实现，本地package通过不等于正式签名、公证或tag发布通过。
  - 下一步：准备签名/公证凭据并确认tag，按[发布说明](platform/release.md)验收后发布；发布凭据与产品GitHub登录删除无关。
