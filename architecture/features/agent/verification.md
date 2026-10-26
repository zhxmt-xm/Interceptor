> 返回 [Agent 索引](README.md)

## 13. 验证边界

| 层 | 主要证据 |
| --- | --- |
| Runtime unit | Fake Model、Zod、自然 Tool Loop、Step 检查点暂停/恢复、取消竞态、重复 warning、Tool 错误分类、事件顺序 |
| Provider integration | 本地 OpenAI-compatible lab、Streaming、attempt timeout、有限重试、断线后 replay-safety、HTTP 错误、DeepSeek cache Usage / capability 映射 |
| AgentRuntime integration | safeStorage adapter、SQLite、Session CRUD、三桶 Usage 聚合、Context 圆环、pending call 幂等、checkpoint 原子安装、重启恢复、事件 sequence |
| Renderer unit | Session store、Transcript event reducer、Context / Session Usage、cache Token / Rate / coverage 展示、Composer 状态 |
| 真实 E2E | 真实 Electron Chat flow、Provider 配置、两轮 cache split 展示、重启恢复、Tool、Compaction 与审批 |
| Design/Parity | 1600×900 全局 Agent Side Panel、Settings > Agent、Provider Dialog、Model Select、长文本和错误状态 |
| Package/Smoke | 触及 Main / Preload / IPC / safeStorage / SQLite 后完整运行 |

本表描述验收对象，不表示Compaction、Pin、History检索或持久Chat的Continue已实现；候选能力与当前产品边界仍按前文区分。
