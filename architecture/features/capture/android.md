> 返回 [Capture 索引](README.md)

## Android 协议副本录制

- Core命令与组件接线：CaptureService持有唯一录制开关，Proxy与Android各保留自己的Session。两端复用现有暂停/恢复意图，Android启动不隐式恢复录制；Clear清空全部内容并保留所有活动Session壳，不保留壳下旧请求。
- Android的HttpRecording连接CaptureService和CaptureEventQueue，保存HTTP/WS/H2的Capture记录、正文与规则效果。
- `android.start`携带Main核准的设备来源；Core为完整手机指纹生成稳定`android:<sha256>` appId，并把`Android · <model>`写入正式Capture summary。Renderer的Application facet和Request row对该appId显示Android品牌图标，不把PC代理请求误标成手机来源。
- Main的`AndroidDeviceService`已拥有单设备ADB状态、PC mTLS身份、Core listener、`adb reverse --no-rebind`及精确清理：
  - `reverse --list`只在目标设备ready时核对本轮local/remote端口，不依赖ADB输出中的transport名称；
  - 设备已拔出、offline或unauthorized时先停止Core，再释放本地ownership；不执行`adb kill-server`、`reverse --remove-all`或清理其他映射。
- Desktop已实现APK缺失、升级、同版本修复、签名不符和已安装新版本状态。Main在`adb install -r`前后核对随包APK、设备base APK、版本、完整SHA-256及签名身份；拒绝换签和降级。Capture设备窗口按已确认设计显示安装态、完整双端指纹、通道状态和Android来源。
- 请求头到达就以Core新ID创建Exchange，wire exchangeId不作为全局存储ID。规则效果在Android应用确认后发布；Final来自Android的applied正文副本，不使用PC拟发送的replacement内容代替。
- 同一Exchange的request/response各有独立Original与Final writer；读接口只选Final/当前展示writer。Original按现有BodyRuleEffect绑定；没有正文替换时消费后丢弃额外Original副本，不另留不可查询的Blob。缺失原文明确为unavailable，不将停止前缀或存储失败当完整原文。
- metadata、规则审计、Final trailers、停止前缀与取消分别处理；停止/中断正文保留可读前缀并标记truncated。录制暂停不取消网络；Clear按明确Session同步撤销旧建档资格，再等待IO。正文写入失败保留不可用状态并输出诊断，不谎报保存成功。
- 请求/响应断点都关联实际Capture ID；未录制的交互仍进入断点，但snapshot不带不存在的记录身份。Core停止Android入口会取消对应pending并等待记录结算；全Core退出及RPC失联先排空所有来源再dispose，失败返回fatal/非零退出，不发布成功stopped。
