# 代码与实现约定

> 适用于所有产品代码。UI 数值、组件形态与交互状态以 [design-system](../../design-vite/design-system/README.md) 为准；测试与验收见 [testing.md](testing.md)，提交见 [pr-rebase-submit skill](../../.github/skills/pr-rebase-submit/SKILL.md)。
## 一、实现与命名

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

## 二、分层与命令

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

## 三、前端规范

### 设计来源与选型

- 唯一设计稿是 `design-vite/`，组件和 design token 以 [design-vite/design-system/README.md](../../design-vite/design-system/README.md) 为准。
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

## 四、Core module 规范

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
