# Interceptor Handover

> Tracked commit: `4422a697`
> Branch: `main`
> 最后更新：2026-09-16

## Task List

- [ ] **blocked · VS Code Copilot MCP互操作**：Host基础MCP协议与产品要求的`2026-07-28`不匹配；需Host支持后按[MCP矩阵](features/mcp.md)复验。
- [ ] **待验证 · HTTP Execute edited wire correctness**：H1/H2的`Content-Length`、`content-encoding`、`transfer-encoding`与framing矩阵由原负责session继续。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
- [ ] **待实现/待验证 · macOS系统代理**：多network service上游代理的合并语义与检测待实现；crash/relaunch、Authorization和系统设置恢复需在macOS验收。[详情](features/settings.md#36-已知兼容风险)。
- [ ] **待验证 · WPAD**：尚缺纯Auto Detect环境验收；仅启用Auto Detect、没有显式代理或PAC URL时按直连处理。[详情](features/settings.md#34-上游代理链式转发-已实现仅-windows)。
- [ ] **待验收 · 首个真实 tag release**：签名、公证配置及Windows/macOS CI产物发布仍需完成验收。[发布说明](platform/release.md)。
- [ ] **待验证 · H2源站正常GOAWAY**：源站以`NO_ERROR`通知关闭连接时，验证既有stream收尾、新请求换用上游连接及Capture记录；客户端正常GOAWAY不代替此方向。[现有覆盖](features/capture.md#h2-range与多stream集成)。
- [ ] **待实现/待验证 · H2事件诊断**：复用现有Diagnostics列表、筛选和详情，不另建H2页面；仍缺生产原始帧事件及可靠的请求关联，涉及Mockttp/patch的采集改动按当前要求暂缓。[范围](features/diagnostics.md#h2事件采集范围)。

## Constraints

- 当前开发环境为Windows；macOS原生helper、Authorization、签名和公证须在macOS执行。
- 开发实例、真实Electron E2E和packaged smoke共用`8888`及WinINet，不能并行；测试须由宿主guard管理进程和系统代理恢复。
- 原生Open/Save、证书授权等流程需要可交互桌面；UAC提示由本机用户处理，不能无人值守代输凭据。
- 现存stash `wip: Windows App WVD gateway bypass`必须保留。

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
