# Interceptor 协作规范

- 通用规则适用于全仓。
- 前端规则用于 UI 代码和设计稿，Core 规则只用于 Core module。

## 一、协作与授权

### 沟通与暂停

- 用中文沟通，优先用短列表，一条只讲一件事。
	- 独立规则放一级列表，说明、例子和例外放在对应规则的子列表。
	- 不把所有条目铺在同一层，也不为缩短列表而合成长段落。
- 用项目中的具体名称说明谁做什么，如 Main、Renderer、`CoreRuntime.request()`、`IPC handler`、`MCP Tool`。
	- 不用抽象术语代替具体代码，不堆砌名词，不写大段解释。
- 代码、命令、路径、API、协议值、配置键和日志原文不翻译。
	- 保留 worktree、commit、diff、Renderer、Preload 等项目常用词。
	- 反引号只用于代码标识和字面值，不用于强调普通文字。
- 持续完成已授权的实现与验证，不自行扩大范围。
	- 后台命令必须取得结果，不能把“正在等待”当作完成。
	- 需要人工处理时，列出失败原因、用户要做的操作和恢复命令。

### 开工与权限

- 新会话和子代理在规划或修改代码前，必须先阅读 [architecture/HANDOVER.md](architecture/HANDOVER.md)。
- 不创建或使用其他 worktree，包括临时 detached worktree。
	- 不另建 clone 或复制仓库来绕过上述限制。
- 保留用户和其他会话的修改，不回滚、覆盖或擅自清理工作区。
- 改 `patches/` 或 `node_modules` 中的第三方行为前，先说明原因、替代方案和影响，取得用户明确批准。
	- 未批准前，只能调研或编写验证测试。

### 按需阅读

- 按任务读取下表中的相关章节。
	- 同一会话内，已读且未变化的内容不重复读。

| 文档 | 何时读取 |
| --- | --- |
| [architecture/README.md](architecture/README.md) | 任务归属不明确，需要定位功能或平台文档时 |
| `architecture/features/*.md` 中的对应功能文档 | 修改功能、命令参数/返回值或用户流程；跨功能时分别读 |
| [architecture/platform/processes.md](architecture/platform/processes.md) | 修改 Main、Preload、Core 的职责、通信、启动/退出或安全检查 |
| [architecture/platform/renderer.md](architecture/platform/renderer.md) | 修改 Renderer 导航、共享组件、主题、语言或公共自动化属性 |
| [architecture/platform/storage.md](architecture/platform/storage.md) | 修改 SQLite、正文文件、录制数据的保存与清理 |
| [architecture/platform/testing.md](architecture/platform/testing.md) | 新增或修改测试、选择验证层级、调整测试设施或执行验证任务时 |
| [architecture/platform/release.md](architecture/platform/release.md) | 涉及构建、打包、runtime dependency、原生 helper、Fuses/CSP、安装器或发布时 |
| [design-vite/design-system.md](design-vite/design-system.md) | 创建、修改或评审 UI 的布局、控件、颜色、字体、尺寸及交互状态时 |
| [design-vite/README.md](design-vite/README.md) | 修改设计稿、添加设计场景或生成设计截图时 |
| [apps/desktop/tests/e2e-workflow-tests/README.md](apps/desktop/tests/e2e-workflow-tests/README.md)、[规格索引](apps/desktop/tests/e2e-workflow-tests/docs/README.md)及对应功能规格 | 修改用户流程，准备、执行或验收真实 E2E |
| [apps/desktop/tests/packaged-smoke/README.md](apps/desktop/tests/packaged-smoke/README.md) | 修改或执行最终打包产物的启动、安全、资源与退出验证时 |
| [apps/desktop/tests/visual-parity/README.md](apps/desktop/tests/visual-parity/README.md) | 验证或修复产品 UI 与设计稿的元素几何、样式和状态差异时 |
| 所属 module 的 README | 修改 Core 或 package 中的模块职责、entry point、依赖或内部结构时 |
| [apps/playground/README.md](apps/playground/README.md) | 开发 Playground，或进行协议流量与 MCP 人工验收时 |
| [README.md](README.md) | 配置开发环境、安装依赖、运行或调试应用、查找常用命令时 |

## 二、实现与命名

### 实现原则

- 只实现当前需求，每一步都应交付可用功能。
	- 不提前增加用不上的抽象、配置、转发层或临时方案。
- 删除旧实现，不为旧行为保留兼容层、回退路径或迁移代码。
- 优先用现有依赖，先查文档和类型定义。
	- 确需新依赖时选成熟库，不自己重写通用功能。
- 每个 module 只负责自己的功能，控制流程保持直白。
- 在接收外部输入时校验，不为不可能出现的内部情况增加错误处理。
- 产品只能有正式功能，不加测试专用参数、隐藏分支或后门。

### 命名与改名

- 方法名说明具体动作，如 `saveRules()`、`deleteRule()`。
	- 避免含义不明的 `handleRules()`、`processData()`，但不要按单词黑名单机械改名。
- 相反操作分开写，如 `startCapture()` 和 `stopCapture()`，不用 `setCaptureEnabled(boolean)` 合并业务实现。
	- 同一个 UI 开关可以共用一条 IPC/Preload 命令，通过 payload 传值。
	- Main 业务在 Main 分派到启用/停用方法；Core 业务在 Core 分派。
- 同一功能的方法放在一起，public 方法后紧跟它专用的 private helper。
	- 共用 helper 放在该组末尾；成对 public 方法不必直接相邻。
- 实例名使用完整类名的 camelCase，如 `CoreApplication` → `coreApplication`。
	- 类成员、参数、依赖注入和测试中的实例名遵守同一规则。
	- 已能说明角色的名字保留；同类多个实例可叫 `exportHost`、`importHost`。
- Array、Map、Set 按内容命名，如 `ruleIds`、`requestsById`。
- DTO 字段按 API 定义命名，不套用实例命名规则。
	- 例如：实例叫 `ruleService`，返回值仍是 `{ id, enabled }`，不改成 `{ ruleServiceId, ruleServiceEnabled }`。
- 跨文件改名用 Rename Symbol（F2），不批量替换所有同名文本。
	- 字符串和注释中的名称逐处确认、修改，再搜索复核。
	- 不误改文件路径、协议值或无关名称。
- 脚本读写显式用 UTF-8，不依赖默认 ANSI；检查 diff，确认没有乱码或意外修改。

## 三、分层与命令

### 进程边界

- Renderer 不访问 Electron 或 Node。
	- Renderer 通过有类型定义的 `window.interceptor` Preload API 调用 Main。

### Main、IPC、MCP 与 Agent

- 同一业务操作只实现一次，IPC handler、MCP Tool 和 Agent Tool 调用同一个 Main 业务方法。
	- 执行、取消、任务结束和状态通知由这个方法及所属 Service 负责。
	- 参数和返回值可以分别转换，业务步骤不能分别再写一份。
	- 新增 Tool 前，先整理它与 IPC 共用的业务方法。
- IPC handler 负责校验 Renderer 发送者；MCP/Agent 负责授权、审批和结果脱敏。
- Main/Core 完成业务后发出状态通知，Renderer 统一订阅。
	- 不能只在某个 Renderer 弹窗里刷新数据，否则 MCP/Agent 调用后页面可能不更新。
- 模型配置、凭据、Tool 授权、MCP Client 和窗口操作等 IPC，不自动注册成 MCP Tool。

### 意图与状态

- 一个业务操作对应一个命令，命令名和参数名直接说明行为。
	- 不同操作即使修改同一份数据，也用不同命令。
	- 保存配置、启用、停用分别表达，不混成一个操作。
- 独立状态用独立字段，不用 `null`、空数组、可选参数或魔法值暗示另一种操作。
	- 一个字段混合多个状态时，拆开字段，不添加同步副本补救。
	- 编辑前快照、撤销历史、系统代理恢复用的 `original` 等历史数据可以保留。

## 四、测试与验收

### Playground、E2E 与设计辅助代码

- Playground、E2E、`design-vite`、fixture、driver、lab、截图脚本及测试和设计辅助代码是验收工具，不是正式产品代码。
	- 不为这些工具代码或设计稿新增或扩充 unit、integration、Browser 等“测试的测试”。
	- 重构、合并、共享代码或补覆盖率都不能作为例外。
	- 不因本条规则批量删除已有辅助测试。
- 修改 Playground、E2E 及其辅助代码时，直接跑受影响的 Playground 场景或已有真实 E2E。
	- 核对实际协议流量、产品行为和退出恢复；按需执行 typecheck 或 build。
- 修改设计稿时，直接预览受影响场景、生成设计截图并检查布局和交互状态，不另写设计稿或截图工具的测试。
- 下文 TDD、前置 Red 和补测试要求只用于正式产品代码，不用于测试设施或设计稿。
	- 产品的业务测试、真实 E2E 和退出恢复要求不变。
	- 产品 Renderer 与设计稿之间的 parity 验收保留，不扩展为设计工具自身的测试。

### 测试驱动开发

- 改业务代码前，先明确目标行为、命令参数/返回值和受影响的测试。
	- 不先写实现，再补测试证明自己写对了。
- 修改用户流程前，先更新对应的 `architecture/features/*.md` 和 `apps/desktop/tests/e2e-workflow-tests/docs/*.md`。
	- 文档写清数据格式、完整操作步骤、预期结果和所需证据。

| 改动 | 修改代码前 | 修改代码后 |
| --- | --- | --- |
| 新增行为、改变数据格式、修复故障 | 测试因目标行为未实现而 Red | 同组测试 Green |
| 行为和数据格式不变，现有测试足够 | 说明覆盖哪些行为，确认基线 Green | 同组测试 Green |
| 行为和数据格式不变，现有测试不足 | 先补当前行为的测试，确认基线 Green | 重构后同组测试 Green |

- 用户流程修改前，按 unit/integration → 真实 E2E 的顺序取得上表要求的结果，再改业务代码。
	- 修改后按同一顺序复跑。
	- 测试全绿不代表覆盖充分；行为不变的重构不人为制造 Red。
- selector、fixture、UAC、构建或环境失败不算产品 Red。
- 历史 Red 只引用已保存的真实证据；没有就明确记录缺口。
	- 不为补历史 Red 创建 worktree、回滚修改或故意制造故障。

### 真实 E2E

- 使用 `apps/desktop/tests/e2e-workflow-tests/workflows/<feature>/*.workflow.ts` 启动真实 Electron。
	- 通过真实 UI 操作，使用该流程实际需要的 Preload、Main、Core UtilityProcess、listener、storage 和 origin。
	- 纯 UI 操作不强行调用无关进程或服务。
- 设计稿 Playwright、fake Preload parity、Renderer/Store 测试、Core integration、packaged smoke 都不能替代真实 E2E 或退出恢复证据。
- 产品弹窗真实点击；Open/Save Dialog、UAC 等原生窗口使用真实键鼠。
	- 不改写原生窗口返回值，不注入 Store，不直接调用业务 API 或产品后门代替 UI。
- 不预造业务输入；导入文件必须由同一 workflow 先通过产品 Export 生成，再 Import。
	- 非法结构、越界层级和损坏字节由所属模块的 unit test 覆盖，不在 E2E 中造文件。
- 保持应用当前语言，不为测试切换语言。
	- 翻译文本只在独立 i18n workflow 中验证。
- 定位和断言使用公共 `data-automation-id`、协议值、DOM 状态属性或测试自产数据。
	- 不用显示文案、翻译后的 `aria-label` 或 CSS class 定位业务控件。
- `.workflow.ts` 按准备、用户操作、业务断言、证据、清理分块。
	- 每块前写简短的中英文成对注释，说明目的，不逐行复述代码。

### 验证与完成状态

- 开发时只跑最小相关检查，不在每次小改后跑全套。
	- 纯文档修改只检查条款、链接和格式。
- 产品代码交付前，完成受影响范围的 typecheck、unit/integration test。
	- 修改共享代码时，也验证调用它的代码；不拿无关测试代替目标行为验证。
- 修改进程、安全、打包、资源或 runtime dependency 时，提前跑 package → artifact audit → packaged smoke。
	- 正式版本交付前，跑全 workspace 检查和上述打包检查。
	- 局部逻辑改动不必每次重新打包。
	- packaged smoke 使用已有截图矩阵，不另建一套。
- UI 改动跑受影响视图、主题和交互状态的 parity。
	- 共享外壳、全局样式或 design token 改动跑全量 parity。
- 只有代码、依赖、配置、环境和产物仍适用时，才能复用已有结果。
	- 后续改动影响了结论，就复跑受影响的检查。
- 失败、跳过、环境阻塞分别写明原因和未验证范围，不能算通过。
- 命令和运行要求查 [architecture/platform/testing.md](architecture/platform/testing.md) 及测试套件 README，不在这里重复维护。

### 用户流程何时算完成

- 取得该改动要求的前置测试结果和最终 Green。
	- 保存 trace/evidence。
	- 确认 Main/Core/Worker 全部退出，8888 已释放。
	- 确认系统代理、证书等系统设置已恢复。
- 上述检查通过后，才能更新 Inventory、Handover 和完成状态。
	- 缺真实 E2E 前置证据、最终 Green 或退出恢复证据时，只写“代码完成 · 待 E2E”，不写“已完成”或 `passed`。
	- UAC、凭据或平台阻塞写 `blocked`，列出人工操作和恢复命令。

### 测试目录

- Vitest 放在所属模块的 `tests/unit/` 或 `tests/integration/`，文件按行为命名为 `*.test.ts`。
	- 用到真实进程、网络、文件、数据库或 worker 的测试放 `integration/`。
	- helper、fixture、fake 跟使用它的测试放在同一层；跨层需求优先拆分。
	- `tests/` 根目录不放测试或辅助代码，不新增 `tests/shared/`。
- `e2e-workflow-tests/`、`packaged-smoke/`、`installer/`、`visual-parity/` 保持独立，不放进 Vitest 目录。
- workflow 放 `workflows/<feature>/`，文件名只描述行为，不重复功能前缀。
	- 跨功能 workflow 放在主要用户操作所属的功能目录。
	- 公共 driver/lab 放 `fixtures/`，套件根目录不放可执行 workflow。

## 五、前端规范

### 设计来源与选型

- 唯一设计稿是 `design-vite/`，组件和 design token 以 [design-vite/design-system.md](design-vite/design-system.md) 为准。
- UI 设计有改动时，必须先取得用户明确确认。
	- 确认时用清单列出每处改动的页面、组件、具体位置和内容，并提供对应的改动前后截图；新设计提供拟议效果截图。
	- 未确认前只做方案预览，不改产品 UI 或正式设计基准。
- 创建、修改、评审 UI 设计时，使用 `.github/skills/ui-design-mockup/`。
	- 设计变化时同步设计源码；评审截图作为本地产物保留，不维护提交到 Git 的全量截图基准。
- 实现现有设计或修复还原差异时，使用 `.github/skills/ui-parity-check/`。
	- 设计未变，不修改设计源码，更不能改设计掩盖产品偏差。
	- parity 由独立命令严格比较声明的元素数据，不依赖 Agent，不读取或生成截图；不使用容差或整体偏移补偿。报告写入忽略目录，缺失、歧义、测量不稳定和执行错误不能算通过。
	- 布局、间距、尺寸、颜色、字体、圆角和状态按设计一比一实现，不因工具限制接受近似。
- 新设计先检查 Ant Design v6：官方 props → ConfigProvider tokens → `classNames`/`styles`。
	- Ant Design 无法精确匹配时，自写组件和独立 CSS Modules；不修改 `.ant-*` 私有 DOM。
- 按钮、输入框、行和分栏复用 `apps/desktop/src/renderer/components/`，不在功能目录重复实现。
- 控件图标用 Lucide 或已安装的 Ant Design 图标。
	- 自定义 SVG/PNG/ICO/ICNS 只用于产品标识。

### 组件与样式

- `app/` 放导航，`features/` 放功能页面，`components/` 放共享控件，`theme/` 放主题，`styles/` 放全局样式。
- 每个 `.tsx` 只导出一个主组件，只放 JSX 和该组件的 hooks。
	- 子组件也拆成同目录独立文件，不因只被父组件使用就内联定义。
- 纯函数放所属功能的 `utils.ts`；跨功能复用时放 `components/share/`。
- 每个组件使用独立、同名的 `*.module.css`，不跨组件共享样式文件。
	- CSS class 按用途命名，默认用 Vite 原生 CSS Modules。
	- 引入 Tailwind、Less、Sass 或其他设计系统前，先取得批准。
- 颜色、间距、圆角使用共享 design token，不硬编码偏离设计的值。
	- token 通过 ConfigProvider 和 `:root[data-theme]` 下的 CSS 变量提供。
- 全局 CSS 只放重置、根级变量、字体和无障碍媒体查询。
- 产品 UI、Playground 和设计稿需要垂直居中的同行元素，统一由对应的 `flex` / `inline-flex` 容器设置 `align-items: center`。
	- 禁止使用 `baseline` 对齐，包括混排字体、字号、计数、状态文字和图标。
	- 不用字形像素边界或自算矩形中心替代布局规则，不为对齐单独添加 px 位移、margin、padding、行高或文字裁剪。
	- 正常控件尺寸、内容间距和换行行高按设计保留；发现补偿时先修正拥有该行的布局，不擅自改变字体或业务。

### 滚动与尺寸

- 内容溢出时支持滚轮、触控板和键盘滚动；未经用户要求，不隐藏滚动条或关闭滚动。
	- `overflow: hidden` 只用于外壳裁切、图标、圆角裁切和单行省略，不能截掉可滚动内容。
- 内层滚到边界后，继续滚动外层。
	- Monaco 设置 `alwaysConsumeMouseWheel: false` 等对应选项，并用真实滚轮验证内外层滚动。
- 分栏宽度、面板高度只设初始值，拖拽和窗口缩放时按容器空间调整。
	- 行高、控件和弹层保持设计尺寸。
	- 拖拽上限按 `总宽 - 对侧最小宽 - 轨道宽` 计算，不设人为最大值。

## 六、Core module 规范

### 目录与职责

- 每个领域放在 `apps/proxy-core/src/proxy-core/<module>/`。
	- `entry.ts` 直接定义并导出唯一的 `<ModuleName>Service`，不能只 re-export 别处的 class。
- module 名说明具体职责。
	- 内部文件和 class 不重复 module 前缀；遇到 `Store`、`Host`、`Manager` 等泛称时保留必要限定。

| module 与主 class | 职责 |
| --- | --- |
| `capture/` · `CaptureService` | 当前录制的临时 Exchange 和 Body |
| `workspace/` · `WorkspaceService` | `workspace.sqlite` 中的低频应用与功能配置 |
| `tls-probe/` · `TlsProbeService` | TLS 握手探测 |

- module 根目录只放 `entry.ts`、README 和子目录；`host/`、`worker/` 各自有 `entry.ts`。
	- 实现放 `internal/`，类型放 `interfaces/index.ts`，无状态函数放 `utils/index.ts`，测试放 `tests/`。
- 自定义 Error class 统一放 `internal/errors.ts`，不分散或内联定义。
	- 可以有多个自定义错误；没有时不建文件，错误名在模块外也应清楚。
- 模块内使用的 constant 放在 `internal/constants.ts`，跨模块使用的放在 `proxy-core/constants.ts`。

### class 结构与依赖

- 每个 TypeScript 文件最多一个 class；集中定义错误的 `internal/errors.ts` 除外。
- 所有 class 的属性和方法写简短职责注释，包括私有成员和 test helper class。
- 每个 module 只有一个长期实例，其他代码直接依赖负责该功能的具体 class。
- 不用 interface 重复列出某个 class 的全部或部分成员。
	- interface 只定义数据结构，或确有多个生产实现的共同能力。
- test double 继承真实 class，只改测试需要的行为。

### 修改联动

- module README 写清职责、主 class、目录结构和依赖，职责变化时同步更新。
- 改 host/worker 入口文件名时，同步构建脚本、运行时查找逻辑、测试和文档中的产物路径。
	- 修改入口后，执行真实 worker 构建和测试。

## 七、文档与状态

### 文档分工

- 架构和进度放 `architecture/`，从 [architecture/README.md](architecture/README.md) 导航。

| 位置 | 内容 |
| --- | --- |
| `architecture/HANDOVER.md` | 跟踪提交、当前任务、阻塞与验证证据 |
| `architecture/platform/` | 已实现、已验证的进程、通信、存储等设计，不写规划 |
| `architecture/features/` | 功能设计、数据格式和操作约定；未验证目标放“与当前实现的差异” |

### 交接文档

- Handover 开头写跟踪的 commit hash。
- 所有未完成任务放在一份平铺列表，标明待实现、进行中、待验证、待确认、待验收或 `blocked`。
	- 不另拆“已完成”“worktree”“主任务”“下一动作”等任务列表。
	- 开始和推进 item 时，及时更新当前步骤、具体文件、已验证范围、剩余验证和阻塞，不能只把进度写进 feature 文档。
	- 实现和验证的小步骤留在所属 item 下，不临时拆成新的 item；整个 item 完成后删除该条，证据保留在验证章节和对应 feature 文档。
- 运行约束、验证命令、维护说明单独成节，不写成待办。
- 重排文档时保留已有事实、证据、命令、风险和维护说明。
	- 链接只作补充，不能省略读者判断当前状态所需的信息。

### 待办表格

- 如使用待办表格，`Status` 只用 `✅ 已完成`、`🔄 进行中`、`⏳ 未开始`。
	- 所需阶段和测试全部完成后，`Status` 才能写已完成；缺真实 E2E、人工验收或 UAC 时仍为进行中。
- `Description` 先写目标，再用 `Steps:` 列阶段和当前状态；不适用的阶段不列，同义阶段统一用词。
	- 阶段写清设计、代码、自动验证、开发者人工验收、UAC 或具体阻塞，不用模糊描述代替缺口。
- `TDD` 单独写总体进度及 `Code / Unit / Integration / E2E / Design/Parity` 矩阵。
	- 矩阵使用 `✅` 已完成、`🔄` 部分完成或待验证、`❌` 未完成、`➖` 不适用。
- 用 HTML table，保留 `colgroup`、固定列宽、最小总宽和窄预览横向滚动。
	- 表格内的列表用 `<ul><li>`，不用字符和 `<br>` 模拟。
	- 图片只放 `Description`，并限制宽度。

## 八、提交与交付

### 文档同步

- 完成一个里程碑或用户要求时，更新 Handover 的跟踪 commit、任务状态和相关架构文档。
	- 不确定是否已到该阶段时，先确认。
- [README.md](README.md) 只放稳定介绍、使用开发说明和导航，不写进度。
	- 只有命令或稳定说明变化时才改 README；提交前确认文档与代码一致。

### 提交边界

- 提交须有用户授权，不擅自创建分支。
	- 已提交记录的更正和历史整理按用户明确授权执行，不擅自改写已推送历史。
- 以用户已授权的 Handover item 为提交边界，一个 item 一个 commit，不混入其他工作项。
	- 功能约定、前置测试证据、实现、Green、验收证据和完成状态一起提交。
	- 所需实现、测试和验收完成后再提交；只有用户明确要求时才保存中间进度。
	- bug、样式、测试或验收场景修正只是 item 的子步骤，不能每修一处就新建 commit，也不能事后拆 Handover 来迁就已有 commit。
	- 确需拆分或调整已授权 item 时，先说明边界并取得用户明确确认；不夹带无关清理、改名或格式化，不拆散同一功能的实现和必需测试。
- 每次 commit 成功后立即尝试 push 当前分支；用户要求暂缓推送时除外。
	- push 失败时记录原因和恢复命令，再继续其他可执行的已授权 item，不以网络失败停止整轮任务。

### 执行任务清单

- 用户授权执行清单后，不用每个任务重复询问。
	- 每项通过所需验收后，立即 commit、push，再继续下一项。
	- 不因单项完成就停止整轮任务，不扩大授权范围，不跳过验收。
- 受阻项写清原因，继续其他可执行的已授权任务。
	- 只有用户暂停、需要额外授权或没有可执行任务时才停止。

### 差异审阅

- 每次只展开一个文件或少量同功能文件的 diff。
	- 不展开整仓、整批 staged changes 或大量文件，避免 VS Code 卡顿、崩溃。
- 普通改动先逐文件审阅 staged diff，再提交。
- 改动太多、已影响 VS Code 稳定性时，先完成验证和文档，提交并推送，再逐文件复审。
	- 复审发现问题，先明确其 item 归属和修正方式，不擅自为同一 item 拆出更多 commit 或改写已推送历史；不再展开完整 diff。