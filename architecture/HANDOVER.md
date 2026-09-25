# Interceptor Handover

> Tracked commit: `2eaaaf87`（第4项收尾提交前基线；原已提交部分为`0033f9ab`，本交接与收尾代码同次提交）
> Branch: `main`
> 最后更新：2026-09-26

**用户于2026-09-26 01:13授权将第4项CA产品范围与启动阻塞修正合为一个收尾commit并push main；不改写已推送历史，不推进第5/6项或正文设计。交接只记录结论、缺口与证据入口，不追加流水账。**

## 当前状态

- 第4项CA产品范围已取得最终验收：原生失联收尾、证书生命周期/取消、Agent/MCP/TLS、并发拒绝及宿主恢复通过；新包已部署且smoke通过。原第2/3/7项关闭范围不变，第5/6项及正文设计未推进。
- 本次提交前`main`与本地`origin/main`基线均为`2eaaaf87`。接手时6个未提交文件均保留并整合；本轮另修改native helper的只读签名校验执行方式及所属测试/文档，未改依赖或其他item。
- 接手的[local-electron-driver.ts](../apps/desktop/tests/e2e-workflow-tests/fixtures/runtime/local-electron-driver.ts)与[macos-certificate-authorization.ts](../apps/desktop/tests/e2e-workflow-tests/fixtures/ui/macos-certificate-authorization.ts)已由真实启动、人工授信、取消及relaunch验收。额外尝试的300秒无人确认场景提前完成授权，实际为初始化/复用Green；driver的300秒超时catch未触发，不宣称工具所有分支均已覆盖。
- 本次收尾统一包含原有[fixture README](../apps/desktop/tests/e2e-workflow-tests/fixtures/README.md)、[settings.md](features/settings.md)、[第4项原报告](../commit-changes/202609241020_main_ca_unknown-write-boundary.html)及本交接，连同native、fixture、所属测试和平台文档共15个文件；沿用原报告，不另拆文档或测试commit。
- 平台实现基线为`218295b0`，对应[平台报告](../commit-changes/202609240135_main_shared-ca_startup.html)；后续保存剩余工作区进度的提交对应独立[工作区报告](../commit-changes/202609240150_docs_workspace_progress.html)。两份均为9月24日，每个commit各有自己的报告，不共用、不覆盖。GitHub候选的四张图只放在工作区报告中，不额外生成预览报告。
- 最终宿主：日常CA已通过正常启动重建并授信，当前指纹`D74D4BFB3C3708511A755AC6CD905840B464B255`；原日常CA与失败自产CA均经产品清理，其他3张Root/admin trust保持。App/Main/Core/Worker全退，完整代理恢复、无journal、8888释放，仅保留获准常驻helper。

## Task List

- **4. CA 操作与 E2E · CA范围已验收；正文子项待确认（暂停）**
	- CA产品范围的实现、测试、验收证据和原报告按用户授权纳入本次收尾commit。`0033f9ab`保留为原已推送中间commit，不amend；本项只剩暂停的正文子项，不为验收子步骤拆commit。
	- 当前实现：失联写入仅查询原ID/操作的结束记录，仍返回原错误，由原module回读/回滚并释放占用，不重放；未发送、未确认或已有CA不清理。生产完整资源校验由同一受保护helper的短生命周期只读子进程执行，身份、strict/nested/all-architectures及no-network检查保留。
	- 最终验证：原生新入口2项Red后，平台315通过/2 Windows native跳过、全workspace类型及最终Desktop复查通过；package、artifact audit、严格签名、11条不同真实E2E及共享CA首次初始化的额外1次运行、smoke 1/1均通过。前置失败、3次冲突前提失败和恢复证据保留，不改写为Green。
	- 启动结论：旧常驻进程完整校验31.304/33.617秒；采样定位到Security扫描后的`free_medium → madvise`。新helper约一小时生产运行期间已保存去重60次完整校验837–1714ms，无30秒超时；此数值不是整个App启动耗时，不宣称已查明macOS分配器内部成因。证据前缀`/tmp/interceptor-item4-resume-20260925-`，详细矩阵见[Settings](features/settings.md#item4-resumed-acceptance)。
	- 边界：helper每端点只留最近128个结束请求的ID/操作名；重启/淘汰/缺记录或前台授权异常不能推断结束。不自动重放、不放宽产品期限、不缓存信任。
	- 正文子项暂停：只读预览2 MiB、完整且不超过1 MiB自动格式化、1–2 MiB可手动格式化，截断不格式化；图片独立16 MiB。Text完整编辑，File只预览但使用完整文件；初始高度、内滚动和resize不影响完整保存/导出/发送。产品未实现；本次仅保存已有compact正文、resize及自定义gRPC设计候选，不改正式shots、不视为定稿。
- **5. macOS journal 收尾 · blocked（外部环境）**
	- 当前：[journal](../apps/desktop/src/main/platform-capabilities/system-proxy/macos/journal.ts)跨profile恢复复验Green。生产超时已定位并修复：完整资源校验37.4秒超过30秒，同一签名API只读对照为Background26.99秒、普通6.27秒；不反推历史14:09缺失的耗时证据。
	- 当前步骤：实际launchd策略取得Background的Red后，仅将ProcessType改为Interactive并由用户核准部署；实装plist与运行中的spawn type均为Interactive。平台回归262通过、2项Windows native跳过，最新package、artifact audit、严格签名、生产helper workflow 1/1和packaged smoke 1/1均通过；完整鉴权及30秒期限不变。本轮按用户授权与第1–4项合并保存进度，以下外部验收不标为通过。
	- 外部环境缺口：特殊VPN/TUN、动态网络切换及ClashX联调仍需对应环境，不由普通loopback结果代替。
	- 当前步骤：不改产品journal逻辑；补临时home下真实删除默认profile后重建journal实例的文件集成，以及service增加/删除时Restore和跨代Recover零覆盖的状态机检查。原32项与新增5项共37/37通过，Desktop类型通过。锁屏期间不运行真实Electron或修改宿主网络，外部场景仍未验。
- **6. 删除产品 GitHub 登录 · 待确认**
	- 当前：已从当前设计SPA重新生成`updatesWithoutSignIn`浅/深色前后图，逐字重加载字体，画布1600×900，并实际点击检查/下载到available/downloaded；[本项预览](../commit-changes/202609241039_ui_updates_remove-signin-preview.html)逐处红框说明。已请求用户确认，但当前不可响应；产品OAuth/Token及登录门槛未删，正式shots不改。
	- 下一步：用户确认设计后再实现、验收；保留匿名更新，不碰个人Git/CI凭据或远端仓库可见性。
	- 更新验收缺口：通知的真实下载/打开安装器流程尚缺专属E2E，需可用的新Release与签名包；其他按钮验收不代替。
- **8. Windows 实机验收 · 待验收**
	- 当前：未执行，由用户回Windows后验收；macOS通过或native skip不能替代。
	- 下一步：按下方[Windows复验表](#windows-复验)执行，并核对真实UAC、原生窗口、系统设置与进程恢复。
	- 排除范围：用户已排除Manager管理员MMC原生专项；保留Manager功能、逻辑及UI检查，不把排除项记为通过。
- **9. VS Code Copilot MCP互操作 · blocked**：Host协议与`2026-07-28`不匹配，待Host支持后按[MCP矩阵](features/mcp.md)复验。
	- 验收缺口：VS Code与Claude双Host同读Capture、正式Tool中间进度SSE仍需对应真实场景；不为旧Host增加legacy兼容，也不制造假进度流。
- **10. HTTP Execute edited wire correctness · 待验证**：由原session继续H1/H2的长度、编码和framing矩阵。[规格](../apps/desktop/tests/e2e-workflow-tests/docs/breakpoints.md#breakpoints-execute-edited)。
	- 已确认缺口：H1 request replacement把继承chunked改为Content-Length；response replacement产生Content-Length与Transfer-Encoding共存。H1/H2四类header的request/response矩阵未齐，已有UI/effect结果不能代替wire正确性。
- **11. 平台能力 package 整理 · 待确认**：本次仅保存独立workspace元数据、规划README、目录占位和lockfile，未增加入口、实现或生产引用。实际迁移仍后置；原生runner、证书系统工具及支持边界待整理，macOS连接归属/图标未实现。[职责](../apps/desktop/src/main/platform-capabilities/README.md#业务边界)。
- **12. WPAD · 待验证**：缺纯Auto Detect环境验收，Windows现行无显式代理/PAC时直连。[详情](features/settings.md#34-上游代理链式转发)。
- **13. 首个真实 tag release · 待验收**：签名、公证及Windows/macOS发布产物待验。[发布说明](platform/release.md)。
- **14. H2源站正常GOAWAY · 待验证**：验证源站`NO_ERROR`后的stream收尾、上游新连接与Capture记录。[覆盖](features/capture.md#h2-range与多stream集成)。
- **15. H2事件诊断 · 待实现/待验证**：缺生产原始帧和请求关联，Mockttp/patch采集暂缓；复用Diagnostics，不另建页面。[范围](features/diagnostics.md#h2事件采集范围)。
- **16. 共享代码全量复验 · 待验证**
	- 当前：Main/Preload/Renderer启动、每代Page handler、HTTPS fixture、公共HTTP转发和导入取消调用方均受影响；macOS仅有可执行子集结果，Windows未验。
	- 当前步骤：HTTP snapshot fixture与Tunnel重复标题的selector均已按真实契约修正，当前406/406无missing/flagged（402项有效结果复用、4项复跑）；不改产品/设计或阈值。签名包首次授权、取消、证书生命周期和当前smoke通过；Windows及各item剩余范围仍未验，本项是交付检查，不另拆feature commit。
	- 暂停验收源码已保存：HTTPS弹窗的`transitionName=""`及逐帧定位workflow尚未取得真实定位Green，workflow仍按fresh CA断言Generate，和当前共享CA基线不一致，恢复执行前须修正；Bilibili复用CA与gRPC Copy/焦点诊断未复跑，不以保存代码计passed。
- **17. 文档整理 · 待审阅**
	- 当前：22份`architecture/`压缩与导航改动按用户授权保存为中间进度，不登记文档整理完成；完整原文仍在平台基线`218295b0`，可用`git show 218295b0:architecture/features/settings.md`等精确回读。
	- 剩余：逐项承接被删的独有验证事实和证据，重点为Settings、Capture、Tool capabilities及TODO；保留69项Tool/68项真实E2E的历史范围、Manager原生验收排除、各次Red/Green/trace和明确风险，不把链接替代当前状态判断所需的事实。当前源码和设计契约也须复核，不能因文字更短而当成无害整理。

## Constraints

- `16CEB8D0990CCC29FA7313B7F85F1167B227C26C`与`3C2E5F2AC71BDB4E82AA47AA49E79276D3EACDD5`是已经按授权处理过的历史CA，不是当前身份。恢复第4项只通过产品处理重新核对后的本轮日常CA及专项自产CA；其他Root、历史CA、ClashX与helper卸载不在范围。
- 历史日常CA `3C2E5F2AC71BDB4E82AA47AA49E79276D3EACDD5`、`B705FBDEF2397E85DAE3605550B916A0EA946ED6`及失败自产`54B224ABC1D2C88BBDB2B43396A5EBC4DC8B023C`均已按精确身份经产品清理。当前日常CA为`D74D4BFB3C3708511A755AC6CD905840B464B255`，普通workflow/smoke保留它；其他Root保持，未复制或注入材料。
- 接手时6个未提交修改已保留、审阅并整合进本次15文件收尾范围，不回滚或覆盖其他工作，不重写已有commit。已有证据不删除，未验证或暂停范围不因提交而标passed。
- 12份原保护文件的内容保持，现按授权纳入checkpoint；7份stash不得重复apply/drop。原保护清单：`/tmp/interceptor-macos-resource-check-20260922-preserved.json`。
- macOS App/E2E/smoke共用`8888`与系统代理，必须串行，结束核对完整宿主恢复。其余通用规则依[AGENTS.md](../AGENTS.md)，不在这里重复。

## Verification

只保留当前结论；产物身份、前置Red、失败与恢复记录见[Settings证据索引](features/settings.md#platform-verification-evidence)。

| 范围 | 当前结论 | 未覆盖或限制 |
| --- | --- | --- |
| 共享CA（原第2项） | 跨profile与删除profile后保留1/1，材料/信任和退出恢复通过 | Windows实机留第8项 |
| 证书验收 | 新包直接生命周期、Agent/MCP六项及原生窗口、TLS、取消回滚、启动取消、Quit/Delete冲突均Green | driver的300秒人工等待超时catch未触发；不冒充产品取消缺口或全分支覆盖 |
| 当前macOS产物 | 新helper已部署且包内一致；11条不同真实E2E与额外首次初始化运行通过，smoke 1/1；已保存60次完整校验837–1714ms | Windows实机留第8项；本轮未恢复其他暂停流程 |
| UI parity | 406/406，无missing/flagged；402复用、4重跑，修正前后PNG一致 | 没有修改产品、设计或阈值 |
| 类型/回归 | workspace类型及最终Desktop类型通过；第4项平台315通过、2项Windows native跳过 | 其他有效基线见证据索引；Core的2项framing失败及Windows实机缺口保留，未跑无关全套 |
| 最后宿主核验 | 新日常CA受信任；其他Root/admin trust保持、完整代理恢复、App/Core/Worker全退、无journal、8888释放 | `/tmp/interceptor-item4-resume-20260925-daily-restore.json`及trace、`final-host.json`；仅获准常驻helper保留 |

本轮证据已另存持久副本：`/Users/zhxmt/.copilot/session-state/df17625e-cb60-4ece-a735-8d703667fab6/files/item4-acceptance-summary.json`；同目录`item4-acceptance-20260926.tar.gz`保留原始Red、失败、Green与trace，SHA-256为`ba3f9ee81b6aae05a96d6bfdb69fba76fbe2ffff0cf46d87bd8c0e9e0d9937f8`。最终逐项核对12次成功运行、11条不同workflow的trace存在及每代退出metadata，未将失败记录算入。

## Windows 复验

仅供第8项执行。下面workflow路径相对[workflows目录](../apps/desktop/tests/e2e-workflow-tests/workflows/)，`{a,b}`表示两份文件；具体步骤依现有[规格](../apps/desktop/tests/e2e-workflow-tests/docs/README.md)。

| 分组 | 用例 | 重点 |
| --- | --- | --- |
| CA/启动/View | `settings/{certificate-startup,tools-certificates,tools-tls}.workflow.ts` | 首窗先于UAC、取消、跨profile/safeStorage复用、坏材料保留、卸载/删除及真实View关窗；就绪120秒、证书操作30秒、普通操作15秒，先终态后清理 |
| 代理/AppContainer | `settings/{tools-system-proxy,system-proxy-crash-recovery,app-container-bulk-access,tools-app-containers,app-container-ordering}.workflow.ts` | 单项/批量UAC、冲突/Quit立即拒绝、无重放、完整WinINet/exemption恢复 |
| 协议/交互 | `capture/{tls-scenarios,http2-scenarios,grpc-scenarios,navigate-tls-passthrough}.workflow.ts`；`settings/{tls-compatibility,proxy-mitm-persistence}.workflow.ts`；`agent/body-messages.workflow.ts` | 首请求源站例外、Edge证书校验、Raw/Copy长度及hash、每代Page；取消背景host默认选择，Capture discovery精确17项 |
| 导入/只读 | `composer/{collection-import,tools-transfer}.workflow.ts`；`rules/{import-tree,tools-import}.workflow.ts`；`settings/tools-readonly.workflow.ts` | 真实signal、原生/预览Cancel与Confirm、退出取消、重启零重放；六项无审批查询及CA不变 |
| 构建/路径 | `build:native`及平台所属测试；[Client App](../apps/proxy-core/src/proxy-core/client-app/tests/unit/service.test.ts)、[Transfer](../apps/proxy-core/src/proxy-core/transfer/tests/unit/job-manager.test.ts)、[Windows文件窗口fixture](../apps/desktop/tests/e2e-workflow-tests/fixtures/ui/tests/unit/windows-file-dialog.test.ts) | 共用runner、8 MiB枚举、certutil/UAC、Windows路径解析；不使用macOS skip替代 |
| 产物/全量 | 全部适用workflow及[packaged smoke](../apps/desktop/tests/packaged-smoke/startup.spec.ts) | ready门禁、精确Preload白名单、Core重启、截图矩阵、系统设置/进程恢复 |

## 恢复命令

当前helper已经部署且日常CA就绪，不为重复验收更新组件或清理日常CA。后续证书专项若需要空材料，须重新确认当前身份与清理范围。其他具体命令查[测试说明](platform/testing.md)和[证书规格](../apps/desktop/tests/e2e-workflow-tests/docs/settings-updates.md)。

```sh
open -n -a "$PWD/apps/desktop/out/Interceptor-darwin-x64/Interceptor.app" --args --user-data-dir="$(mktemp -d /tmp/interceptor-helper-approval.XXXXXX)"
npm run test:smoke --workspace @interceptor/desktop
```

本轮合并commit后立即push；后续仍按获准item交付。直连失败时可用`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`，不修改全局Git或系统代理。

## References

- [协作与提交规则](../AGENTS.md)
- [测试分层与命令](platform/testing.md)
- [功能与平台文档索引](README.md)
