# 交互状态

> 返回 [设计系统索引](README.md)

- 文本选择:界面中的所有文本都允许选择与复制，包括 button/nav/tab/switch/segmented 标签，以及 Inspector URL/header/body、Cookie、Diagnostics 与技术值；不得使用 `user-select:none`。
- hover:行、导航与透明图标控件使用 `--hover` 底;带实底的操作按钮按「操作按钮」规范从自身底色计算 hover,不得直接替换成透明 `--hover`。可点图标额外 `--text → --text`/`--accent`。
- selected(list 行):`--sel` + 左竖条。
- active(nav):`--accent-soft` + `--accent`。
- focus-visible:`0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent)`。
- **Rules详情标题**：采用标题式无框input，默认、hover、focus均透明且无边框、阴影或额外装饰，保留文本光标和键盘编辑。字体14px/600，点击区域28px高、水平padding为0；标题行以flex居中，长名称在输入框内部横向滚动，不挤动右侧控件。此行不套用普通表单框或focus-visible外框。
- 过渡:`120–180ms ease`;尊重 `prefers-reduced-motion`。
- **垂直居中统一使用 flex**：产品 UI、Playground 和设计稿中的同行文字、计数、状态、图标、徽标和按钮，都由对应的 `display:flex` / `inline-flex` 容器设置 `align-items:center`；混排字体或字号也不改用 baseline。禁止 `align-items:baseline`、`align-self:baseline` 等基线对齐，不按字形像素边界或自算矩形中心补偿。正常控件尺寸、gap、padding 和换行行高仍遵守组件规格，但不得为凑对齐另加 px 位移、margin、padding、行高或文字裁剪；先修正真正负责这一行的布局，不为对齐擅自换字体。
- loading:与 Core 交互的异步操作(录制开关、导入/导出提交、HTTPS 安装、诊断修复等)在进行中显示旋转 spinner 并阻断重复触发;只替换图标、不改按钮文案。
- tooltip:所有图标按钮统一用 **Ant Design Tooltip** 承载名称提示(取代原生 `title`),`0.4s` 延迟;禁用态用 `disabledTooltip` 说明禁用原因(如无流量可导出)。
- dropdown:Rules 的 `Add condition` / `Add action` 使用 Ant Design Popover `placement="right"` + `autoAdjustOverflow`：优先紧贴按钮右侧并垂直居中，右侧不足时自动翻到左侧，垂直不足时只做边界位移。面板自然高度不滚动；仅当内容高于 `100vh - 16px` 时内部滚动。Select 选项行高 `34px`，列表按内容自然增高到 `320px`，超过后才滚动。
  - 设计稿的`Add action`由`RulesActionPopover`承载并挂到`.app`，不受编辑器裁切；面板宽`250px`、padding `7px`、圆角`12px`，分组标题`10px`且底部padding `5px`。Rewrite body、Synthetic、Block分别使用Lucide的FileText、Reply、Ban；触发按钮、Escape和外部点击负责关闭，不保留旧菜单的手算定位。
