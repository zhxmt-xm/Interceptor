# http-interception

`HttpInterceptionService`接收已校验HTTP请求/响应副本，复用Core唯一`RuleService`与
`HttpMessageService`，返回bypass、修改、构造响应、阻断或取消结果及审计。
不接收Socket、Mockttp对象或原始TCP，不发起源站请求，不拥有第二套规则/断点队列。

- `entry.ts`直接定义Service。
- `interfaces/`定义与传输无关的决定，正文明确keep/replace。
- `tests/unit/`覆盖副本隔离、请求/响应规则、编码、断点与取消。
- delay由实际发送端应用，不在决定入口等待。replacement为按最终headers编码后的content bytes。
- 每次求值使用独立内部ID，只取消该求值的断点；设备来源由已认证入口关联，不接受客户端伪造本机request ID。
- 已有桌面`ProxyService`保留原转发路径；CoreApplication把本Service与Android v2入口、正式Capture装配在一起，仍只计算决定，不在PC发送源站请求。请求/响应断点携带当前有效的Capture ID，暂停或Clear后的交互不伪造身份。Core命令/真实WSS组件验证不等于Main设备管理或手机VPN可用。
- 具体双端消息、应用确认和状态约束见[协议](../../../../../../Interceptor-Android/architecture/features/inspection-protocol.md)。
