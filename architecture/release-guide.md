# 一次命令连续发版

只运行一次：

```bash
npm run release
```

**不再选择“先保存、再构建、再演练”等阶段，也不需要退出后重新运行命令。** 选好配置并确认后，同一个进程连续完成检查、提交发版配置、推送、CI演练、tag和草稿；等你完成实机验收并确认，再继续Publish。

## 1. 开始前的条件

- 业务代码已经审阅并提交，工作区干净。命令不会把原有未提交代码或其他人的修改一起提交。
- Node/npm及项目依赖已经按[开发指南](development.md)准备好。
- 官方GitHub CLI `gh`已经安装、登录，并具有该仓库的Actions与tag推送权限。
- 使用已有分支，不在detached HEAD上运行；命令不会创建分支或worktree。
- 测试失败仍然会中断发版，不能靠一条命令绕过。当前阻塞见[Handover](HANDOVER.md)。

GitHub CLI只在第一次使用该开发机时准备。macOS已有Homebrew时：

```bash
brew install gh
gh auth login --scopes workflow
gh auth status
```

登录选择GitHub.com和浏览器登录，按提示完成验证码授权；不要把验证码或token写入仓库或发到聊天。Windows可通过`winget install --id GitHub.cli --exact`安装，其他方式见[官方说明](https://cli.github.com/)。

这是维护者的开发工具，不是产品内GitHub登录，也不是Apple或Windows签名账号。首次部署这套工具时，须先审阅并提交其代码；推送由后续`[3/7]`统一执行，不需要另起一次手动push。GitHub只能在这次push完成后读取新的workflow。

## 2. 运行后只选择发版配置

`↑/↓`移动，`Space`勾选，`Enter`确认。

依次选择：

1. 版本更新方式。
2. 平台和CPU架构，可以多选。
3. 每个macOS目标的DMG、ZIP或两者；Windows固定为MSI。

以当前版本`0.1.0`为例：

| 版本选择 | 自动得到 |
| --- | --- |
| 沿用当前版本 | `0.1.0`，用于首次发布 |
| Patch | `0.1.1` |
| Minor | `0.2.0` |
| Major | `1.0.0` |
| 预发布 + beta | `0.1.1-beta.0`，当前仅用于macOS |
| 指定版本 | 输入的合法SemVer，不带`v`前缀 |

版本只计算、写入一次；后续构建、CI和tag都使用同一个版本，不会重复递增。

| 可选目标 | 包类型 | 原生CI runner |
| --- | --- | --- |
| macOS Intel / x64 | DMG、ZIP | `macos-15-intel` |
| macOS Apple Silicon / arm64 | DMG、ZIP | `macos-15` |
| Windows / x64 | MSI | `windows-2025` |

- 两个macOS架构分别生成包，不是universal。不提供Linux或Windows arm64。
- MSI只接受不含预发布/build metadata的版本，数字段上限为`255.255.65535`，不截断版本。
- macOS内置更新只接受同架构DMG；只选ZIP会明确提示其仅适合手动分发。
- 多选目标会增加CI运行量，仍受GitHub Actions额度与计费约束。

## 3. 总确认一次，然后自动往下走

屏幕按“发版信息”和“构建目标”分列显示版本、仓库、分支、起始commit、平台、架构、包类型及runner；自动提交文件逐行列出，不混成一长段。

开始和最终Publish两处Yes/No确认均默认Yes，显示`(Y/n)`，按Enter继续；需要取消时输入`n`。默认Yes不跳过确认提示。开始确认前没有写入文件或调用GitHub，不需要单独的预览命令。

确认后，终端按下面的顺序显示进度。这些是自动执行的阶段，不是要你反复选择的菜单：

| 进度 | 命令自动做什么 |
| --- | --- |
| `[1/7]` | 用npm更新Desktop版本及lockfile，保存目标配置 |
| `[2/7]` | 构建Core，运行typecheck、现有unit/integration；构建并审计本机对应目标，其他架构交给原生CI |
| `[3/7]` | 仅提交本次生成的三个发版文件，推送当前分支 |
| `[4/7]` | 启动同commit的CI演练，给出链接并等待结果 |
| `[5/7]` | 演练成功后创建、推送annotated tag，等待tag CI生成draft |
| `[6/7]` | 给出草稿链接，保持终端等待你完成实机验收 |
| `[7/7]` | 你确认验收通过后，重新核对草稿附件，再Publish并确认GitHub状态 |

自动提交范围只有：

- `apps/desktop/package.json`：唯一的产品版本来源。
- `package-lock.json`：对应版本元数据。
- `.github/release-config.json`：平台、架构和包类型，不重复保存版本。

版本/配置没有变化时沿用现有commit。检查期间出现其他修改、分支变化或发版文件被改动时，流程停止，不夹带、不覆盖、不回滚。

普通分支push不会创建Release。CI演练也不会创建tag或Release；只有后续tag CI生成draft。同名tag已存在时明确停止，不删除或覆盖。

本机安装包归集到`apps/desktop/out/release/<platform>-<arch>/`。CI只上传本轮选择的文件，逐项核对数量、类型、大小和SHA-256；诊断文件不进入Release assets。

## 4. 草稿验收与最后确认

命令走到`[6/7]`时不要关闭终端：

1. 打开命令给出的草稿链接，以维护者身份从GitHub实际下载安装包。
2. 核对版本、CPU架构和文件完整性；不要只用开发目录里的App替代。
3. macOS将App复制到Applications后启动；ZIP先解压再复制。
4. 对来源与完整性可信的应用，按系统提供的`Privacy & Security → Open Anyway`流程放行。企业策略可能不允许；不要全局关闭Gatekeeper或删除quarantine制造通过。
5. 按产品正常提示完成helper/CA授权，并执行对应平台的packaged smoke、必要功能与安装生命周期验收。
6. 确认Main/Core/Worker退出、8888释放、系统代理恢复、证书状态符合验收基线。常驻helper按独立授权范围处理。
7. 回到同一个终端，在“实机验收全部通过，现在Publish？”提示中确认。此处也默认Yes；尚未通过时输入`n`，不要直接按Enter。

确认后，命令检查草稿及附件是否在验收期间发生变化；一致才继续Publish。选No则保留draft并结束，不会发布。

原生系统授权和真实验收不能由脚本代替，这是流程中必须由人完成的确认，不是另一个命令入口。详细边界见[packaged smoke说明](../apps/desktop/tests/packaged-smoke/README.md)。

## 5. 只有排障时才需要手动打开CI页面

正常发版由命令自动启动和跟踪CI，不需要你手动点一次演练。需要查看日志或恢复失败运行时：

1. 登录GitHub，打开[仓库](https://github.com/zhxmt-xm/Interceptor)。
2. 点顶部`Actions`，再点左侧`Release artifacts`；也可直接打开[workflow页面](https://github.com/zhxmt-xm/Interceptor/actions/workflows/release-artifacts.yml)。
3. 按命令给出的链接、时间和commit找到本轮运行。
4. 红色job点进去，展开失败步骤查看日志；成功运行的`Artifacts`区域可以下载安装包。
5. `interceptor-release-<目标>`是安装包，`interceptor-diagnostics-<目标>`是诊断。
6. 需要手动演练时，点`Run workflow`，在`Use workflow from`选已推送配置的分支，`request_id`留空，再点绿色`Run workflow`。
7. 手动演练中`Prepare draft Release`显示`Skipped`是正常的，不会创建Release。
8. 恢复同一次失败运行时，进入其详情页，选择`Re-run jobs → Re-run all jobs`；源码或配置变了就用新版本，不移动旧tag。

看不到按钮时检查登录账号、写权限、Actions是否启用，以及workflow是否已推送到默认分支。private仓库404不代表需要公开仓库。

## 6. 中断与限制

- 开始确认前取消：不修改文件，不发起GitHub操作。
- 检查失败：保留实际错误及已生成的版本/配置，不自动commit、删除或回滚；先检查Source Control并处理失败。
- push失败：本地commit或tag可能已创建，查看终端最后成功阶段，恢复网络/权限后推送同一对象，不重复打tag或force push。
- 停止本地等待：GitHub上已经启动的运行可能仍继续，使用输出的链接查看；需要停止远端时使用`Cancel workflow`。
- 实机验收未完成或失败：选择No，保留草稿，不Publish。
- 发布状态不明确：先检查Release页面，不盲目重复发版。
- 仓库可见性不会改变。private仓库即使Publish仍是private，匿名下载需要另行确认公开发布源。
- 删除Release不能撤回已下载副本，也不自动删除tag/commit；immutable Release删除后不能复用其tag名称。

当前检查结果与未完成验收统一记录在[Handover](HANDOVER.md)，本指南不代表已经发版。
