# Interceptor Handover

> Tracked commit: `2e6acb1c`
> Branch: `main`
> 最后更新：2026-09-15

## Task List

- [ ] **blocked · VS Code Copilot MCP互操作**：Host基础MCP协议与产品要求的`2026-07-28`不匹配；需Host支持后按[MCP矩阵](features/mcp.md)复验。
- [ ] **待验证 · HTTP Execute edited wire correctness**：H1/H2的`Content-Length`、`content-encoding`、`transfer-encoding`与framing矩阵由原负责session继续。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
- [ ] **待确认 · HTTP空Text替换标签**：产品将原文已知时的空Text视为显式清空，设计仍显示`Using original`；需确认对应标签。[详情](features/breakpoints.md#74-header-effect下置布局)。
- [ ] **待设计 · rule detail note**：Rules详情提示是否移到底栏，尚无确认设计。
- [ ] **待确认 · 上游认证配置与SSO**：公司SSO、用户凭据入口及安全保存方式待设计。[详情](features/settings.md#36-已知兼容风险)。
- [ ] **待实现/待验证 · macOS系统代理**：多network service上游代理的合并语义与检测待实现；crash/relaunch、Authorization和系统设置恢复需在macOS验收。[详情](features/settings.md#36-已知兼容风险)。
- [ ] **待验证 · WPAD**：尚缺纯Auto Detect环境验收；仅启用Auto Detect、没有显式代理或PAC URL时按直连处理。[详情](features/settings.md#34-上游代理链式转发-已实现仅-windows)。
- [ ] **待验收 · 首个真实 tag release**：签名、公证配置及Windows/macOS CI产物发布仍需完成验收。[发布说明](platform/release.md)。
- [ ] **待设计/待实现 · Capture总内存预算**：确定小正文、并发writer积压、event ACK队列及Renderer记录的总预算与触顶行为；现有单writer上限不能限制全进程内存。[范围](backlog/TODO.md#13-capture-无界增长)。
- [ ] **待设计/待实现 · Capture磁盘容量保护**：确定spill总量、剩余空间不足及磁盘写入失败时的处理和用户反馈；不默认删除记录或自动暂停。[范围](backlog/TODO.md#13-capture-无界增长)。
- [ ] **待设计/待实现 · Session与记录保留策略**：确定Session、Exchange、正文引用和终态TransferJob的保留期限、容量及清理规则，不清除仍被读取或轮询的数据。[范围](backlog/TODO.md)。
- [ ] **待验证 · H2源站正常GOAWAY**：源站以`NO_ERROR`通知关闭连接时，验证既有stream收尾、新请求换用上游连接及Capture记录；客户端正常GOAWAY不代替此方向。[现有覆盖](features/capture.md#h2-range与多stream集成)。
- [ ] **待设计/待实现 · H2事件诊断**：明确stream ID、RST_STREAM、GOAWAY、SETTINGS及取消原因的采集与展示范围；先确认设计，不在现有UI伪造协议字段。[范围](backlog/TODO.md)。

## Constraints

- 当前开发环境为Windows；macOS原生helper、Authorization、签名和公证须在macOS执行。
- 开发实例、真实Electron E2E和packaged smoke共用`8888`及WinINet，不能并行；测试须由宿主guard管理进程和系统代理恢复。
- 原生Open/Save、证书授权等流程需要可交互桌面；UAC提示由本机用户处理，不能无人值守代输凭据。
- 现存stash `wip: Windows App WVD gateway bypass`必须保留。

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
