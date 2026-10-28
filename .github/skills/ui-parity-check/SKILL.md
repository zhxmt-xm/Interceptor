---
name: ui-parity-check
description: "Verify implemented React UI against the design SPA using standalone, strict element-data comparison. USE WHEN: after porting or changing feature UI; when spacing, alignment, sizes, fonts, styles or states differ; when adding parity scenes. Uses fake Preload and normal Renderer UI interactions, compares declared geometry/styles/states without tolerance or inferred offset, and writes JSON/Markdown reports without screenshots or Agent involvement. DO NOT use for creating mockups or runtime/business debugging."
---

# UI Parity Check（设计稿一比一还原验证）

用一个**可独立运行的配置驱动 harness**把 React 实现和 `design-vite/` 设计稿放进同一状态，严格比较声明元素的几何、样式、文本和状态。程序自动采集、比较并生成报告，不依赖Agent、模型凭据或截图。

## 何时使用

- 把某个 feature 从设计稿落地成 React 后,核对还原度。
- 用户反馈"和设计稿不一样"——间距、尺寸、对齐、字体、颜色。
- 往验证套件里新增一个已实现的屏幕。

## 方法论(两条,缺一不可)

1. **自实现为主,Ant 只用于交互难点。** 设计稿的 CSS Modules 95% 是纯 CSS——把每个值 1:1 搬进 colocated `*.module.css`,用语义组件承载。Ant Design 只用于 Splitter 拖拽 / Popover / Dropdown / Tooltip,且经 ConfigProvider tokens/props 控制,**绝不 hack `.ant-*`**。要精确的地方都是自己的 CSS,才不会被 Ant 卡住。
2. **对比闭环(本 harness)。** 实现 → 独立运行 → 查看异常报告 → 在已授权范围修正 → 重跑。未授权的产品/设计差异只记录，不能为通过而改设计、删除目标或放宽规则。

## Harness

- 目录:`apps/desktop/tests/visual-parity/`，其中`parity.mjs`是独立runner、`parity.config.mjs`是场景配置、`fake-interceptor.mjs`是完整fake Preload API。Parity代码不得放进业务Renderer；报告写入Git忽略的`apps/desktop/test-results/visual-parity/`。
- 普通用户从`npm start → Test → Parity`选择场景即可完成准备、采集、比较、报告和退出，不需要先运行Agent、启动页面或生成截图。CI可直接调用同一runner。
- 运行(仓库根):
  ```
  node apps/desktop/tests/visual-parity/parity.mjs            # 全部 view
  node apps/desktop/tests/visual-parity/parity.mjs --view=capture
  ```
- 它逐项采集并比较：
  1. `getBoundingClientRect()`得到的内容画布内`x/y/width/height`。
  2. 默认`fontFamily/fontSize/fontWeight/letterSpacing/color`，或目标明确声明的`styleKeys`。
  3. 可见性、声明的DOM/ARIA状态、文本和滚动数据。
- 原始值严格比较，任何非零差异都报告；不使用1px容差、epsilon或中位数整体偏移。设计页只去除额外卡片装饰，不根据测量差值调整布局。
- 正常验收两侧视口及内容画布都是1600×900，设计页移除画布外评审留白；采集前核对画布、主题和声明的侧栏状态。菜单使用同一记录与行内位置触发，双方均验证弹层进入可视区域；需要滚动的场景通过真实UI操作回到一致阅读位置，不对读数做偏移补偿。
- 前提不满足时按设计稿或Renderer侧记录场景错误并退出2，不把未正确定位的菜单当作有效几何差异；中文报告优先列出失败侧和具体场景，未比较目标不计入checked。
- 候选DOM节点去重后必须唯一。缺失、歧义、相邻帧测量不稳定和读取错误不能算通过；按逻辑控件配对，不比较整棵DOM树。
- 面向人的输出用中文：终端显示范围、结论和最多10条具体差异；`report.md`按文件列出对应控件/主题、设计值、Renderer值及偏移或增减，不只写笼统“不一致”。只有相同文件内字段和原始值等信息完全相同的差异才合并位置。路径、控件标识和原始日志保留原文；`report.json`保留全部原始记录，不生成PNG。
- 文件关联来自Renderer的CSS Modules来源与实际控件/最近容器规则，状态或文本问题可链接同名组件。只能称为定位入口，不能把关联文件认定为根因；无法确定时明确提示并给出场景配置入口。
- 全量运行持续显示批次进度，父进程只准备一次两个页面服务；设计预览使用独占临时构建，不能依赖可能被其他构建覆盖的共享dist。每批浏览器独立，父进程异步等待，退出清理本次资源。
- 退出码0为已声明检查全部通过，1为差异/缺失/歧义/不稳定，2为配置/执行/清理/报告错误；未运行范围单独列明。
- SIGINT/SIGTERM中断分别为130/143；报告保留已取得结果，不把未运行部分或正在进行的进度写成通过。
- 依赖Playwright、系统Edge与Vite。设计侧复用`design-vite/tools/design-preview.mjs`构建和启动preview；手工设计图片比较属于另一工具。

## 前提条件(接入一个项目时需满足)

- **Renderer 走真实 Preload 契约**:harness 在 `page.goto()` 前用 `addInitScript` 注入完整 fake `window.interceptor`；业务组件照常调用窄 API，不包含 parity fixture、`import.meta.env.DEV` 数据分支或测试 setter。
- **状态通过真实 UI 建立**:主题在导航前写 localStorage，view/选中行/tab/表单通过 Playwright 点击、选择和输入完成；不要暴露 `window.__setView/__setTheme` 之类业务侧测试后门。
- **设计稿是可编程 SPA**:`design-vite/` 暴露 `window.__setState({view,theme,sidebar,…})`，harness 通过 `design-preview.mjs` 起它的 preview server。
- **设计字体必须实际加载**：先按字重调用`document.fonts.load()`，样本同时包含拉丁、数字与汉字，确认`Noto Sans SC Variable`与`JetBrains Mono`返回非空且全部FontFace为loaded，再重新计算Monaco字体。`document.fonts.ready`在下载失败后也会resolve；失败时停止测量，不以fallback产生布局结论，不替换字体或改基准掩盖问题。
- **元素靠明确语义配对**：优先复用唯一文本、现有selector、公共automation ID或`data-parity`；重复控件在配置中限定容器或记录，不通过选第一项规避歧义，不为工具改造批量增加产品属性。

## 加一个新 view(零改 harness)

在 `visual-parity/parity.config.mjs` 的 `views` 里追加，数据放 `visual-parity/fake-interceptor.mjs`，交互写 `rendererNav` / `rendererActions`:
```js
{ id: 'rules', theme: 'light',
  designState: { view: 'rules', theme: 'light', sidebar: 'expanded' },
  rendererNav: 'Rules & Map',
  targets: ['Rules', 'Stub /v1/user', 'Apply changes', /* 唯一文本 */] }
```

## 读输出

- 每条异常包含`view/theme/target/kind/property/expected/actual`，数值差异还包含原始`delta`，不把亚像素差异显示成零。
- `missing/ambiguous/unstable/error`用于区分未找到、定位歧义、不稳定测量和读取错误；另有场景、环境与清理错误。
- `checked/targets`和`unrun`表示实际覆盖，不能把缺失或未执行项算通过。
- 数据通过只证明声明字段一致，不覆盖未配置元素、SVG路径、Canvas绘制或字体栅格化，也不替代真实E2E。

## 已知陷阱(都真实踩过)

1. **行高与实际字体**：`<AntApp>`的`.ant-app`会用token `lineHeight`覆盖body；shell根`.app`当前按用户确认保留原App的`1.23`，不因设计使用`normal`就自动覆盖。两者不等价，不能用近似倍数代替字体度量。先核对实际FontFace和字重注册，再比较几何；当前设计与Renderer加载同一份可变`Noto Sans SC`(`font-weight: 100 900`)，不能照搬历史离散字重或Inter场景的行高经验。
2. **高度链断裂**:`.ant-app` 没有 `height:100%` → `.app{height:100%}` 塌缩成内容高 → app 不填满窗口、`flex:1` 的 spring 失效(底部元素浮空)。→ 给 `<AntApp className>` 设 `height:100%`。
3. **画布边界**：设计页额外卡片装饰在测量前明确去除，两边各自相对内容画布。整体错位仍要报告，不能从目标差值反推并扣除。
4. **字体声明不等于实际字体**：同名字体也不保证资源字节或字重注册相同。Renderer保留原依赖注册的`JetBrains Mono Variable`和可变字重，设计侧仍按400/500/600加载；分别检查实际FontFace，不为消除差异改字体注册或删除声明。相同文字拆成多个文本节点也可能产生逐段舍入差异，应先核对文本结构，不以字距或宽度补偿，也不把数据差异自动当成产品故障。
5. **不能写死尺寸**:客户端可缩放。除固定宽的 sidebar,其余用 `minmax(0,1fr)` / 可拖 splitter;app 靠高度链填满窗口。

## 参考

- 设计稿工作流(维护已确认源码、手工评审):`ui-design-mockup` skill。
- 权威 token:`design-vite/design-system/README.md`。
