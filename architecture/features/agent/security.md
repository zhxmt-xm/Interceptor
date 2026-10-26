> 返回 [Agent 索引](README.md)

## 11. 凭据、隐私与故障隔离

- DeepSeek API Key 只在 Main 使用 `safeStorage` 加密，Renderer 只见 `configured` 和脱敏尾号；
- Session Item payload 加密后写入 `agent.sqlite`，数据库不保存 API Key；
- 用户输入和发送给 Model 的 Tool Result 都视为已经离开本机，UI 必须明确当前是远程 Model；
- Authorization、Cookie、Set-Cookie、凭据 query 和已知 secret 字段默认遮罩；
- 默认发送脱敏内容；用户可以为当前 Session 明确选择发送原始内容，选择后不再逐次阻止；
- Agent 失败、数据库失败或 DeepSeek 不可用只影响 Agent 工作区，不停止 listener、不修改系统代理；
- Diagnostics 默认不记录 Prompt、正文、API Key、完整 Tool arguments 或 Model response；
- 应用退出先取消 active Turn、持久化 outcome，再进入既有系统代理恢复与 Core shutdown 流程。
