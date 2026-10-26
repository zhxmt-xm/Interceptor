# Feature: Settings

> Main模块：`@interceptor/platform-capabilities`（`packages/platform-capabilities/`）、`updates/`
> Core 模块：`apps/proxy-core/src/proxy-core/capture/entry.ts`
> Renderer 模块：`apps/desktop/src/renderer/features/settings/`

## 目录

| 文档 | 内容 | 何时读 |
| --- | --- | --- |
| [certificates.md](certificates.md) | 证书与 HTTPS MITM：密钥、握手、启用、窄 API | 改证书、MITM 或信任流程时 |
| [system-proxy.md](system-proxy.md) | 系统代理参与者、快照与生命周期 | 改系统代理接管与恢复时 |
| [proxy-platform.md](proxy-platform.md) | 平台实现、AppContainer、兼容风险、跨进程恢复 | 改平台代理或恢复契约时 |
| [upstream-config.md](upstream-config.md) | 上游模式、配置差异与发送适配 | 改上游配置或发送时 |
| [upstream-sending.md](upstream-sending.md) | 三条出网路径、bypass 与可达性 | 改路由或 bypass 时 |
| [upstream-wpad.md](upstream-wpad.md) | Windows WPAD 实现与平台边界 | 改 WPAD 或 PAC 时 |
| [updates.md](updates.md) | 更新检查、下载与通知按钮 | 改更新流程时 |
| [storage.md](storage.md) | 存储状态与 Storage 面板 | 改容量统计或清理时 |
| [language-theme.md](language-theme.md) | 语言、主题与导出隐私偏好 | 改偏好设置时 |
| [agent-tools.md](agent-tools.md) | Settings 暴露给 Agent 的只读 Tool 契约 | 改 Settings Tool 时 |
| [security.md](security.md) | 安全边界汇总与已知风险 | 评审安全边界时 |
| [verification.md](verification.md) | 验收要点 | 准备验收时 |

## 1. 职责与边界

Settings 聚合所有需要**操作系统权限**或**跨会话持久化**的配置。

| 子域 | 归属进程 | 内容 |
| --- | --- | --- |
| 证书与 MITM | Main | CA 生成、信任库安装、解密开关、不安全例外 |
| 系统代理 | Main | 接管、恢复、紧急修复、ownership 展示 |
| 更新 | Main | 检查、changelog、手动下载、打开安装器 |
| 存储 | Core | 用量状态、清理 |
| 语言、主题与导出隐私 | Main + Renderer | Main管理设置请求；Renderer应用15种语言、4套主题和3项默认值并保存到localStorage |
| Agent | Main + Renderer | Provider/Credential、持久化Chat、Streaming、Usage、恢复与Tool capability双列配置 |

**核心边界：所有 OS 级操作只在 Main。** Core 不读写系统设置，Renderer 只表达意图。

Settings rail 的最后访问 section 由 App shell 持有。切换到 Capture / Rules / Composer / Diagnostics
不会重置该值，返回 Settings 时仍打开离开前的 section；TLS compatibility、Proxy readiness 等明确的
跨 feature 跳转可以覆盖它，直接打开对应目标 section。面板内未提交的瞬态 dialog 不跨 feature 保留。

Settings rail 的每项都是原生 button，当前项必须通过 `aria-current="page"` 暴露，不以 CSS class 或翻译文案作为状态契约。
Proxy readiness与TLS入口在App shell先设置目标section，再切换workspace。

Capture 的 TLS tunnel Inspector 允许从已确认的`TLS passthrough`连接跳到当前配置项。跳转前读取
TLS passthrough settings，并从当前host的所有覆盖项中选择最具体pattern：exact优先，其次选择suffix
最长的leading wildcard；没有覆盖项时不伪造目标。App一次性切到Settings / TLS passthrough并携带该
pattern，列表加载后将目标滚入可见区域，以accent背景和边框高亮3秒；重复跳转重新计时。高亮只是
Renderer瞬态导航反馈，不写workspace、不进入URL，也不由Main/Core持有。

<a id="ui-preferences-acceptance"></a>
### 1.1 语言、主题与导出隐私Tool

- `settings_set_language`接受`{ language }`，只允许既有15个语言ID；`settings_set_theme`接受`{ theme }`，只允许`warm/light/ember/dark`。
    - 不增加`auto/system`等模式，不改变首次启动的系统语言匹配、默认主题或现有`localStorage`键。
    - UI与Tool共用明确的Main方法，不在Tool里执行JavaScript、写Renderer Store或直接访问存储。
- `settings_set_export_privacy_defaults`要求显式提供`maskAuthorization`、`maskCookies`、`warnBeforeUnmasked`三个boolean。
    - 只改变后续导出的默认值，不修改已经打开的导出草稿、运行中的任务或既有文件；Archive仍保留完整原生存档。
    - UI单项Switch继续只改变自己的字段，连续操作不能因异步确认丢掉另一个字段。
- Main通过有类型的Preload请求关联一次设置操作，Renderer常驻订阅应用并确认；界面导航不决定是否接收变更。
    - Main处理参数校验、取消、Renderer退出及完成通知；结果只含已应用设置，不含存储路径、请求内部ID或任意错误内容。
    - `UiPreferencesService`登记请求；`UiPreferencesActions`常驻订阅，串行领取并应用，成功写入原localStorage后确认，Main再广播给其他Renderer。
    - 不新建配置文件、双写副本或迁移路径。App只把语言/主题映射到DOM，不再晚于确认重复写存储；持久化失败返回安全失败响应。
    - Deny与预取消无写入；未开始的请求被取消后不能迟到应用。已开始提交的设置完成原操作，不用取消回滚用户状态。
- 三项均为独立Settings change，Agent/MCP各自授权并遵守Ask/Auto。
