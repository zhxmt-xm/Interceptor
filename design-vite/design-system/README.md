# Interceptor Design System

> 本文件是 Interceptor 桌面端 UI 的**权威视觉规范**,供设计稿(`design-vite/`)与真实落地代码(`apps/desktop`)共同引用。
> 修改视觉语言时先改这里,再同步设计稿与代码。配套流程见 [设计稿指南](../README.md) 与 `ui-design-mockup` skill(`.github/skills/ui-design-mockup/`)。

## 设计语言

- 目标:对标 **Linear / Raycast / Proxyman** 的现代桌面工具——克制、精致、信息密度高但有呼吸感。
- **四套时段主题**(合起来是一天的流转):`warm`(清晨·赤陶)· `light`(中午·靛紫,默认)· `ember`(傍晚·琥珀)· `dark`(夜晚·青绿)。`light`/`warm` 为浅色,`dark`/`ember` 为深色。
- 强调色 `--accent` 每主题不同(靛紫 / 青绿 / 赤陶 / 琥珀);语义色(绿/蓝/黄/红)只用于状态,不参与装饰。
- 图标:统一 **Lucide 线性风格**(stroke 1.9、round cap),`1em` SVG;禁止手绘 inline path 之外的随意图标。
- Model Provider 使用可枚举的品牌 Logo map：已知品牌图形与推荐色来自 `simple-icons`（CC0-1.0），
  仅用于准确标识服务，不改形、不暗示合作；Custom / unknown Provider 使用 Lucide Bot fallback。品牌商标权
  不因图标数据许可而转移，新增品牌时仍需复核对应 brand guideline。
- 字体:`Inter`(界面) + `JetBrains Mono`(URL、header、数值等技术文本);数值列用 `font-variant-numeric: tabular-nums`。
  - 设计侧Inter按400/450/500/600/700、JetBrains Mono按400/500/600离散字重注册，控件仍使用各自550/640等既有声明。Renderer以现有依赖的WOFF2离线提供，Inter保留离散注册，JetBrains Mono按用户确认保留原可变字重注册与字符子集；分别核对实际FontFace和度量，不因设计差异自动改App。

## 目录

| 文档 | 内容 | 何时读 |
| --- | --- | --- |
| [tokens.md](tokens.md) | 颜色 token、排版、尺寸与间距 | 改颜色、字号或间距时 |
| [layout.md](layout.md) | 整体布局与分栏尺寸 | 改外壳或分栏时 |
| [shell.md](shell.md) | 活动栏、主题切换、窗口控制、Boot、状态栏 | 改外壳控件时 |
| [capture-inspector.md](capture-inspector.md) | Inspector、断点、Rules、WebSocket 正文 | 改 Capture 详情区时 |
| [composer-body.md](composer-body.md) | Composer、正文档位、Monaco、预览 | 改 Composer 或正文查看时 |
| [settings-agent.md](settings-agent.md) | Settings、MCP、Agent、Playground | 改 Settings 或 Agent 界面时 |
| [states.md](states.md) | 交互状态与可达性 | 改 hover、focus、禁用等状态时 |

## 与落地代码的关系

- 复杂交互(拖拽 Splitter、Popover/Dropdown 浮层、Tooltip、Tabs、Segmented)优先用 **Ant Design** 组件 + ConfigProvider token 承接。
- Agent当前Chat模型菜单复用统一Flyout：`topLeft`锚定模型按钮，面板宽250px、padding 7px、圆角12px；点击外部关闭且不吞点击，Escape/选择后焦点回到触发按钮。菜单关闭后销毁内容，重开聚焦当前模型；内容超过60vh时内部滚动，不使用手工绝对定位或全局点击监听。
- Ant 无法表达的产品视觉(list 行、method/status 徽标、omni 容器、活动栏、kv)用 **colocated CSS Modules + 上述 token** 一比一还原,不覆盖 `.ant-*` 私有 DOM。
- 详见各阶段文档与 `AGENTS.md` 的样式优先级。
