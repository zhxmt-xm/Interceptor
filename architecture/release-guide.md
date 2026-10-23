# 按指定commit发版

运行`npm start`并选择`Release`，确认执行摘要后进入发版向导；也可直接运行：

```bash
npm run release
```

流程为：**选择源码commit → 选择版本和目标 → 指定已签名Android APK → 确认 → CI检出指定SHA并构建/tag/draft → 核对源码及附件完整性 → 自动Publish**。

本地工作区可以保留未提交修改。命令不会修改本地版本或配置，不commit、push、stash、checkout、清理文件或改变HEAD；未提交内容不会进入安装包。

## 1. 一次性前提

- 项目依赖已经按[开发指南](development.md)安装。
- 官方GitHub CLI `gh`已安装并登录，账号有仓库和Actions权限。
- 需要发布的源码commit已经存在于GitHub。只有本地有而尚未推送时，命令明确拒绝，不自动上传、不改用main。
- 默认分支已经部署支持`source_sha`、`version`、`targets`及Android APK三项身份输入的Release workflow。修改本机脚本不会自动更新GitHub工作流；更新发版工具时，先审阅、提交并推送工具和workflow，再运行发版命令。
- Android私有仓库已发布同一轮正式签名APK，并准备：
  - GitHub Release asset ID；
  - 完整APK SHA-256；
  - APK签名证书SHA-256。
- Desktop仓库Actions secret `INTERCEPTOR_ANDROID_RELEASE_TOKEN`只授予读取`zhxmt-xm/Interceptor-Android` Release asset的最小权限；token不输入本地向导、不写日志或产物。缺secret、摘要不符、debug证书或换签时CI在Desktop构建前停止。

Intel Mac使用官方[GitHub CLI Release](https://github.com/cli/cli/releases/latest)中的`macOS_amd64.zip`；`amd64`适用于Intel x86_64，不是arm64。Homebrew已将Intel macOS列为Tier 3，不需要为了gh新装Homebrew。

核对官方checksum并解压，在包含`bin/gh`的解压目录中安装：

```bash
sudo install -m 755 ./bin/gh /usr/local/bin/gh
gh --version
gh auth login --scopes workflow
gh auth status
```

Apple Silicon可使用官方`macOS_arm64.zip`或受支持的Homebrew；Windows可通过`winget install --id GitHub.cli --exact`安装。登录需要你本人完成浏览器授权，验证码和token不要写入仓库或聊天。

## 2. 选择源码commit

启动后首先显示**当前分支最近10个commit**，最新一条在前，默认当前HEAD。每条显示：

```text
短SHA       日期          提交说明
d274c2f8   2026-10-04    fix(capture): count requests in filter group badges
...
输入hash查询并选择其他commit
```

- `↑/↓`移动，`Enter`选中。
- 选中后显示完整40位SHA、时间和提交说明。
- 列表少于10个提交时，只显示实际存在的提交。
- 这是当前分支可达历史，不是“远端main最新版本”，也不包含未提交修改。

### 查询列表之外的commit

1. 选择列表最后的`输入hash查询并选择其他commit`。
2. 输入4至40位十六进制hash，可以是短hash或完整SHA，不是分支名、tag名或命令。
3. 工具先查本地Git对象；本地没有时查询当前GitHub仓库。
4. 短hash不唯一、指向非commit对象或查询失败时，会显示错误并返回选择，不会猜测另一个commit。
5. 核对查询结果的完整SHA、时间和说明，在`使用这个commit发版？`处确认。
6. 不采用结果时选No，回到最近10条列表。

无论从列表还是hash查询选择，后续都会向GitHub核对完整SHA。所选commit不可访问时中止，而不是改成另一个分支。

## 3. 选择版本和安装包

版本是这次构建的输入，不写回本机`package.json`。基准取“所选commit的Desktop版本”和“GitHub已有版本tag”中的较新版本，支持：

| 选择 | 以基准0.1.0为例 |
| --- | --- |
| 使用尚未占用的基准版本 | 0.1.0 |
| Patch | 0.1.1 |
| Minor | 0.2.0 |
| Major | 1.0.0 |
| 预发布 + beta | 0.1.1-beta.0，macOS与Windows均支持 |
| 指定版本 | 输入未使用的合法SemVer |

已有版本不能复用。预发布会设置GitHub prerelease标识，不进入稳定版更新。

| 目标 | 包类型 | 原生CI runner |
| --- | --- | --- |
| macOS Intel / x64 | DMG、ZIP | macos-15-intel |
| macOS Apple Silicon / arm64 | DMG、ZIP | macos-15 |
| Windows / x64 | EXE、MSI、ZIP | windows-2025 |

- `Space`勾选，`Enter`确认，可以选择多个目标和包类型。
- 两个macOS架构分别出包，不是universal。不提供Linux或Windows arm64。
- Windows支持alpha/beta/rc，但不接受build metadata；数字段上限为255.255.65535。App、tag、安装目录及附件名称保留完整SemVer，MSI内部由现有`electron-wix-msi`转换为`major.minor.patch.0`，EXE固定版本字段使用同一个数字版本。例如`0.1.1-alpha.1`的系统安装器版本是`0.1.1.0`，这不改变GitHub的Pre-release标记。
- 同一基础版本的alpha/beta/rc在Windows Installer中具有相同数字版本；现有MSI模板允许同版本升级，不识别预发布序号的先后。应按完整SemVer核对所装版本，不声称MSI会阻止同基础版本的旧alpha覆盖新alpha。
- Windows三种格式共用同一应用构建；EXE是NSIS离线引导包，内嵌并启动本轮同一MSI，不维护另一套应用安装、升级或卸载记录。MSI仍是内置更新使用的安装格式；EXE和ZIP供手动分发，ZIP不是单文件版。
- EXE需要Windows CI中的NSIS 3.11和7-Zip；CI核对内嵌MSI与单独MSI的SHA-256，不能只把应用exe改名当安装器。NSIS启动MSI保留原生安装UI及退出码，不自行提权、不静默安装、不强制重启。
- macOS内置更新只接受同架构DMG；ZIP-only只能手动分发。
- 任意可访问commit都能查询和选择，但不保证每个旧快照都能通过当前构建、许可、安全和测试门禁；不为旧快照跳过检查或注入业务修复。
- 选择Desktop目标后，向导要求输入Android Release asset ID、APK SHA-256和签名证书SHA-256；三项原样显示在最终摘要。CI只下载该asset并逐项复核，不查找“latest”或按文件名猜测APK。

## 4. 核对摘要并开始

摘要分列显示仓库、**源码commit**、源码日期、发版版本、tag、工作流分支、Android APK三项身份和构建目标。

**源码commit与工作流分支不是同一概念：**

- 源码SHA决定安装包中的产品代码和最终tag指向。
- 默认分支只提供本轮CI编排脚本；它的HEAD不替换你选中的源码。
- GitHub运行页面显示的workflow commit可能不同，Summary会同时列出`Product commit`和`Workflow tooling commit`。

启动CI前的确认默认Yes，显示`(Y/n)`。按Enter即授权检查通过后自动Publish，输入`n`取消；后续不再询问Publish。开始前可能已查询Git/GitHub元数据，但不会写本地文件或启动构建/tag/发布。

## 5. 后续仍是一条连续流程

**本地不是先打包再上传。** 本地命令查询并收集发版参数、派发CI、等待结果、核对产物并自动发布；GitHub runner检出选定源码SHA，安装依赖、测试、构建安装包并上传。Release job从同次CI的artifact取得安装包，再创建tag和draft。本地`out/`里的已有安装包不会被上传。

| 进度 | 程序行为 |
| --- | --- |
| `[1/3]` | 传入固定源码SHA、版本、目标，启动一次CI并等待 |
| `[2/3]` | CI成功后核对tag源码、Release身份及附件名称、大小、digest和更新时间 |
| `[3/3]` | 无需再次确认，直接Publish并读取GitHub状态确认成功 |

CI原生job在同一工作目录精确检出所选SHA。为避免旧commit缺少新版发版工具，仅将发版脚本、EXE引导模板与产物校验工具保存到runner临时目录，再检出源码；不复制整个产品仓库或创建额外worktree。工具不进入App。

构建版本通过环境变量注入。CI构建前后检查源码SHA和源码树，不能把测试造成的文件改动混入包。所有目标检查通过后，CI在GitHub创建指向该SHA的tag及draft；本地不创建tag，也不再进行“本地版本commit → 推tag → 第二轮CI”。

Release正文由workflow中的模板生成，按Source、Downloads、Installation、Validation分组列出，使用`--notes-file`保留Markdown换行。Source commit来自本轮选择的源码SHA，短标签链接到完整commit；Downloads逐项列出已选择的平台及格式。安装与验证边界是仓库维护的说明，不是GitHub自动撰写。`--generate-notes`继续追加GitHub生成的变更记录或Full Changelog链接。修改模板只影响新建草稿，不自动改写已发布Release。

你可以继续在本地开发；这不会改变本轮选定的SHA。若源码commit还没推送或新版workflow还没部署，必须先解决，不自动推送其他工作。

## 6. 实机验收与验证边界

自动Publish不等于实机验收通过。以下检查仍需在对应平台执行，未执行、失败或受阻的范围继续记录在Handover，不因Release已发布改写为passed。

1. 打开命令给出的Release链接；private仓库需要以有权限的账号登录GitHub。
2. 展开`Assets`，下载匹配版本、架构的DMG/ZIP/EXE/MSI；不要下载`Source code`压缩包。
3. macOS将App复制到Applications后启动，ZIP先解压。只对来源及完整性可信的应用使用系统提供的`Open Anyway`；不要全局关闭Gatekeeper或删除quarantine制造通过。
4. 按产品正常流程完成helper/CA授权，以及所选平台的packaged smoke、安装生命周期与必要功能验收。
5. 正常退出，确认进程和8888释放、系统代理恢复、证书状态符合验收基线；不把原代理一律清空。
   Windows额外核对EXE正常安装及取消、MSI与EXE交叉升级/卸载、ZIP解压后启动与退出；EXE只启动MSI，系统应用列表不应出现第二套引导器卸载项。解压ZIP仍遵循正常helper/CA授权，不能称为无需系统权限。
6. 保存各平台实际验收结果与限制；命令不再等待这些操作，也不要求输入第二次Publish确认。

CLI在自动Publish前仍会再次检查tag指向及附件是否变化；发现变化、CI失败或发布请求失败时明确中止。中断本地命令可能留下draft，不得把它当作已经发布。

仓库可见性不会改变。private仓库允许内部发版，但匿名下载需要另行确认公开发布源；公开前须核对源码和历史中的敏感内容。

## 7. GitHub页面只用于查看或恢复

正常流程不需要手动触发CI、创建tag或上传包。

- 打开命令提供的运行链接，或进入`Actions → Release artifacts`，按追踪ID定位本次运行。
- 红色job点进去查看第一个失败步骤；Summary可核对固定产品SHA和编排SHA。
- 同一请求失败后，可在其页面使用`Re-run jobs → Re-run all jobs`；重跑不能移动已有tag或覆盖已发布Release。
- 如果源码、版本或目标需要变化，应重新选择并使用未占用版本，不能修改已发布tag。
- 现在的workflow_dispatch就是按commit的发版任务，成功会创建tag和draft，**不再是旧版“不创建Release的演练”**。
- 停止本地等待不会取消已启动的远端运行，需要取消时在GitHub使用`Cancel workflow`。

实际CI、平台和安装验收状态见[Handover](HANDOVER.md)。本机选择/查询成功不代表CI或发布已经通过。
