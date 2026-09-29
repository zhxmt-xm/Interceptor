# Interceptor Handover

> Tracked commit: `15c80698`
> Branch: `main`
> 最后更新：2026-09-29

## Task List

- **5. macOS journal · blocked（外部环境）**
  - 跨profile恢复、profile删除重建及service增删37/37通过。剩VPN/TUN、动态网络切换和ClashX实机联调；[已有证据](features/settings.md#item4-resumed-acceptance)不替代这些环境。
- **6. 删除产品 GitHub 登录 · 待确认**
  - 待确认[浅深色前后图](../commit-changes/202609241039_ui_updates_remove-signin-preview.html)；OAuth/Token及正式设计未改。确认后保留匿名更新，不动个人Git/CI凭据。
  - 真实下载、打开安装器仍需可用Release与签名包，其他按钮验收不能替代。
- **8. Windows 实机验收 · 待验收**
  - 按[Windows矩阵](../apps/desktop/tests/e2e-workflow-tests/README.md#windows-复验)核对UAC、原生窗口、系统设置和退出恢复。Manager管理员MMC原生专项已排除，功能、逻辑和UI仍需验证。
- **9. VS Code/Copilot MCP互操作 · blocked（Host协议）**
  - Host与产品`2026-07-28`协议不匹配；双Host同读Capture、正式Tool中间进度SSE未验。待真实VS Code/Claude Host条件满足后按[MCP规格](features/mcp.md#mcp-host-protocol-history)复验，不加legacy兼容或伪造进度。
- **10. HTTP编辑正文framing · blocked（第三方补丁待授权）**
  - 两条chunked测试仍Red：请求被改成Content-Length，响应出现Content-Length与Transfer-Encoding共存。
  - 获准后修复Mockttp补丁的两处无条件Content-Length覆盖，再补齐H1/H2请求/响应矩阵；[问题与证据](features/http-message-editing.md#8-与当前实现的差异)。
- **11. 平台能力package整理 · 待确认**
  - 目前仅有workspace元数据、README、目录和lockfile，无入口或生产引用。迁移范围、原生runner、证书工具和支持边界待确认；macOS连接归属/图标未实现，见[职责](../apps/desktop/src/main/platform-capabilities/README.md#业务边界)。
- **12. WPAD · 待验证**
  - 缺纯Auto Detect环境；Windows无显式代理/PAC时仍直连，见[上游契约](features/settings.md#34-上游代理链式转发)。
- **13. 首个真实tag release · 待验收**
  - 签名、公证及Windows/macOS发布产物待验，按[发布说明](platform/release.md)执行。
- **14. H2源站正常GOAWAY · blocked（第三方生命周期修复待授权）**
  - Node与Electron内嵌Node均复现旧stream缺131072字节、无end/trailer；后续新session正常。定向3通过/1失败，不能标完成；[诊断](features/capture.md#normal-goaway-gap)。
  - 本地[h2.test.ts](../apps/proxy-core/src/proxy-core/proxy/tests/integration/h2.test.ts)尚未提交。获准后修复生命周期，再验完整字节、trailer和无重放，不假补EOF或改全量缓冲。
- **15. H2事件诊断 · 待实现/待验证**
  - 缺生产原始帧与请求关联，Mockttp/patch采集暂缓；复用Diagnostics，不另建页面，见[范围](features/diagnostics.md#h2事件采集范围)。
- **16. 共享改动全量复验 · blocked（Windows及外部场景）**
  - Mac全量parity与最终包验收已通过；剩Windows、已登录Edge的Bilibili流程。HTTPS弹窗定位专项仍按原要求暂停，恢复前须修正fresh CA断言；gRPC Copy/焦点已通过。

## Verification

以下是已保存的验收结果，本次仅整理文档，没有重跑测试。

| 范围 | 当前有效结论 | 详细证据 |
| --- | --- | --- |
| 正文与消息 | `4e766148`已push；全workspace类型、303项相关测试、16条真实E2E通过 | [正文验收](features/capture.md#body-preview-final-acceptance) |
| 最终macOS包 | 授权ready；package/audit/严格签名、两代启动1/1、smoke1/1和16张截图通过 | [产物与退出](features/capture.md#body-preview-final-acceptance) |
| UI parity | 430态3169目标，0 missing/flagged，最大差0.859375px | [分阶段证据](features/capture.md#正文分阶段证据索引) |
| 共享CA与宿主 | 跨profile及删除profile后保留1/1；日常CA、完整代理保持，App全退、8888释放、无journal | [CA验收](features/settings.md#platform-verification-evidence) |
| 文档 | `15c80698`已push；22份核对、40组事实及11锚点承接，244/244链接通过 | [文档验证](README.md#文档整理验证) |

## 运行约束

- 当前仅整理文档；用户要求暂停全部E2E（含packaged smoke）、不启动App，须明确恢复授权后才能执行。
- 保留日常CA `D74D4BFB3C3708511A755AC6CD905840B464B255`、其他Root及获准常驻helper；不凭历史指纹清理，不卸载ClashX或helper。
- Electron/E2E/smoke共用`8888`和系统代理，必须串行；结束核对Main/Core/Worker、端口、journal及系统设置恢复。
- 保留已有7份stash和12份受保护文件，不重复apply/drop；清单为`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- 只有第14项诊断测试保留为未提交代码，不混入其他item；第三方修改仍须明确授权。

## 复验入口（暂停执行）

以下命令仅备查，当前不执行。恢复授权后使用当前最终包串行复验，不重复prepare或改写产物：

```sh
INTERCEPTOR_E2E_MACOS_APP_PATH="$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" npm exec --workspace @interceptor/desktop playwright test -- --config tests/e2e-workflow-tests/playwright.config.ts workflows/settings/helper-startup.workflow.ts --project macos
npm run test:smoke --workspace @interceptor/desktop
```

[测试分层](platform/testing.md) · [功能与平台索引](README.md) · [协作与提交规则](../AGENTS.md)。push直连失败可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。
