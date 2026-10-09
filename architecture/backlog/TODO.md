# 风险与能力边界

本文说明问题机制、影响和设计约束，不记录实施状态或测试成绩。执行安排与验收缺口见[Handover](../HANDOVER.md)；功能契约由各[feature文档](../README.md)维护。

## 请求透明性

- Header阶段规则不能等待完整正文。`CallbackMatcher`与completed事件订阅会引入全量缓冲；慢上传、SSE、无限响应、H2 Range和gRPC依赖[Capture的流式链路](../features/capture.md)。
- Execute edited需要同时满足Content-Length、Content-Encoding、Transfer-Encoding与H1/H2 framing规则。UI中的替换成功或effect marker不是wire正确性的证明，见[HTTP消息编辑](../features/http-message-editing.md)。
- HTTP头部断点没有完整原文，`bodyAvailable`与替换意图区分可见性和修改。读取已接收片段只能复用Capture writer，不能另建无界缓存；二进制编辑不能隐式经过UTF-8 replacement。
- Throttle候选需要介入正文流，并覆盖替换正文、`clientRes` finish、trailer、取消及Stop/Clear；头部阶段的delay不等于带宽限制。
- 首字节正常不等于整个请求透明：慢上传、未知长度/chunked、`Expect: 100-continue`、早期`401/413/417`、SSE/无限响应、H2多stream、client abort与origin reset须分别保留时序和wire bytes，不能用有限正文的最终成功推导长连接正确。

## Capture容量与事实

- Exchange summary、headers、Body refs、event queue和Renderer rows没有统一淘汰策略。单正文spill阈值不能限制大量小正文的累计内存，单writer待写上限也不能限制整个Core的RSS。
- Event batch未ACK时，新Exchange仍可进入pending queue；虚拟列表减少DOM，不减少Zustand持有的summary。容量方案需要同时观察Session大小、内存、spill及磁盘余量，不静默丢数据。
- 积压超限或磁盘错误可能保留observed bytes而没有可读bodyRef。空正文、捕获失败、解码失败、预览截断、网络中断和用户取消不能共用一个提示。
- wire encoded bytes、decoded preview bytes与Rule override bytes含义不同。正文完整性结合真实结束/中断事件判断；存在Content-Length时另比较declared与observed，不能仅凭HTTP 200或EOF认定成功。
- H2 stream ID、RST_STREAM、GOAWAY、SETTINGS和取消原因必须来自实际协议观测，不能从HTTP摘要推导。未解密CONNECT只能提供隧道元数据。
- WebSocket单个超大消息仍整体进入`ws` Buffer，Body Store的spill不能消除协议库已经发生的分配。H2 Extended CONNECT不在WebSocket Bridge的支持范围。
- gRPC在途读取使用writer快照和5-byte envelope跳读；半header/payload应等待更多字节，只有正文结束后才判定截断，见[Capture](../features/capture.md#grpc在途正文)。

## Rules与历史证据

- 非空但无法编译的regex、无法解析的JSON body或不存在的Map Local文件可能静默失效。输入完整性、schema合法性和执行可用性是不同检查，不能以“字段已填写”代替错误反馈。
- request与response钩子分别读取规则集，热更新可能使同一Exchange跨revision；response-only matcher与request Action组合也没有可执行的请求阶段。固定revision候选需同时定义改写后的method/URL/headers是否参与响应匹配。
- `ruleIds`与effect `ruleId`不包含命中时的完整RuleDefinition。Rule改名、修改、删除或ID复用后，当前Rule不等于历史证据；Archive也不能据此还原旧定义。
- 历史snapshot候选可保存revision、名称和action摘要，并为删除或导入后不存在的Rule提供只读提示。不能把旧marker静默跳到无关的新Rule。
- Header和Body effect不构成完整执行timeline；query/status/map/delay/block/breakpoint等行为需要各自的事实来源。无实际变化的remove不能冒充wire effect，Rule hit数也不能兼作action执行数或短路数。
- 多Rule的priority、短路及同字段覆盖顺序应能追溯；客户端原始值、Rule中间值、发往origin的最终值、origin响应与发回客户端的值不能混成一份“原始”详情。
- Rules到Capture的导航会替换筛选条件。恢复原筛选、历史Rule标签与草稿未Apply的提示属于交互方案，不能把无命中与未参与执行混为一谈。
- Marker目标未加载与Core查询失败不同于规则已删除，不能用静默无反应掩盖。Clear、Archive import和Core restart后的筛选、selection与scroll需明确恢复/清空边界；`visible of total`、状态栏request count与Rule hits须区分Exchange、匹配请求和Action次数。
- 从Capture创建URL规则时丢弃query和fragment；扩大匹配范围的候选仍需处理秘密参数、重复key、百分号编码和默认端口。草稿冲突的base/local/remote合并应与显式Reload分开设计。

## 正文预览与文件

- 文本解析、Hex构造和Copy的开销不同，不能只按输入字节数估算UI成本。虚拟化限制可见行，不自动限制格式化、字符串生成或全量复制；具体阈值见[Capture正文矩阵](../features/capture.md#103-正文预览渲染矩阵)。
    - 旧16字节/行dump的量化示例是1 MiB展开为65,536行、约4.75 MiB字符串。这只是全量展开成本，不规定当前预览上限，也不表示已虚拟化的Hex仍把整份dump放入DOM。
- 正文MIME归一化与UTF-8解码不足以支持GBK/GB18030、Shift-JIS等charset。完整Content-Type和未知charset回退需要独立契约；预览截断只能暂缓末尾半个UTF-8字符，不能删除真实坏字节。
- 截断的JSON、HTML或XML不是完整文档，不应给出完整格式化或校验结论。unsupported与corrupt content-encoding需分别表达，并保留原始Hex和保存能力。
- 错误或缺失MIME可能让MP4/WebM按普通binary处理。媒体识别候选可结合magic bytes和Content-Disposition，不能仅凭文件扩展名决定解码。
- `206 Partial Content`的Save body保存当前响应Range，不是整份媒体；encoded body与decoded body也不是同一文件。导出方式、扩展名及提示必须表达真实对象。
- Body读取的`TypedArray` view可能共享更大的ArrayBuffer；有界`byteLength`不等于有界IPC传输，需使用独立范围字节。
- BodyView的loading不能表达大文件保存的取消、进度和最终位置。Transfer UI复用候选须保持实际提交点与业务终态，不以关闭弹窗代替取消。
- 原子rename仍受目标占用、只读目录、磁盘满和崩溃影响。失败不得先删除旧文件，临时文件必须由所属任务清理；取消与Clear规则见[Transfer](../features/transfer.md)。
- 正文身份因Clear失效、磁盘/权限错误、用户取消与Core restart须保留不同原因；关闭弹窗、任务已启动和最终文件已提交不是同一状态。
- Clear和关闭互斥不等于完整的body GC引用协议，也不冻结Recording。export stream、独立GC及Archive/HAR并发快照需要明确同一份数据的持有时长。
- TransferJobManager保留终态job会持续增长；有限历史或消费确认方案不得淘汰仍运行或仍被查询的任务。

## HAR与Archive容量

- HAR export按chunk读取后对单个完整body执行`Buffer.concat`、base64和JSON stringify，大正文仍可放大Core内存。流式编码候选要同时保持合法JSON与取消收尾。
- HAR输入的entry、header、URL与body总量，以及Archive的entry数、解压总量和压缩比，都需要明确资源策略；流式读取本身不能阻止磁盘耗尽。
- Native Archive不支持ZIP64，超大Capture受格式限制；Archive包含完整敏感正文且未加密，可选加密属于独立格式方案。

## 系统代理与MITM

- Main被强杀或OS崩溃后，系统代理可能停在8888，直到startup journal recovery或人工恢复。独立repair入口是候选，不能宣称运行中的Main可以处理所有退出方式。
- 外部修改触发ownership lost后，Interceptor不覆盖用户设置；原始、owned和current三份快照的差异需要可理解的恢复指导。
- Windows只接管WinINet；自带网络栈、WinHTTP、Java、curl、容器或WSL可能不走Capture。`<local>` bypass也会让部分本机和无点主机名流量绕过代理。
- Windows纯Auto Detect/WPAD没有可交给proxy-agent的URL时按直连处理；macOS区分原network service的Auto Detect与系统自动提供的PAC URL，没有URL时由Main发现，失败在接管前拒绝，不能混写成两平台均直连。macOS网络服务、VPN/TUN、睡眠唤醒和服务增删可能改变有效上游与ownership，普通loopback不能代表这些环境，见[Settings](../features/settings.md#macos-effective-upstream)。
- 证书pinning、mTLS和独立trust store可能拒绝MITM；客户端TLS passthrough与忽略源站证书错误解决的是不同问题。QUIC/HTTP3/UDP不在HTTP proxy捕获范围，不能假设客户端必然回退H2。
- 更换CA可能重建Mockttp listener并中断活动下载及长连接；仅切换解密开关不必更换listener。旧TLS tunnel不会自动变成MITM，必须重新建立连接。
- per-host源站例外关闭的是该host的证书验证；Root CA信任则具有系统范围影响。提示和授权必须区分这两种安全后果。

### 上游代理验收边界

- 初始五模式功能未保存修改前真实E2E Red；后续PAC故障修复有真实Red与最终Green，但不能据此补造初始历史。
  当前macOS选路、DHCP/DNS发现、重启和退出恢复的实际范围见[Settings](../features/settings.md#upstream-request-adapter)。
- H1对象化不等于任意异常Host与目标不一致、PAC候选间代理认证等组合都已覆盖。
  既有探索结果见[header边界研究](research.md)，当前发送契约以Settings为准；不为关闭已修复的raw-header/TLS问题宣称这些边界全部解决。

## 敏感数据

- `socks`当前固定的`ip-address@10.3.1`存在IPv6 link-local/NAT64识别、跨IP族网段判断和无界错误诊断风险，不能用该版本的地址分类作为完整SSRF或信任边界。升级需同时核对调用方；[上游公告](https://github.com/advisories/GHSA-rpw4-54j3-4h4q)、[NAT64](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc)、[跨IP族](https://github.com/advisories/GHSA-j6r3-76f7-8jcv)、[诊断开销](https://github.com/advisories/GHSA-h3mg-xc3c-68pw)。
- CA私钥由safeStorage加密且不进入Renderer；这不代表Capture内容也被加密或脱敏。
- Capture headers/body与spill包含Authorization、Cookie、PII和上传文件，崩溃后可能留到下次清理。临时目录权限、生命周期和用户主动清理需要分别说明。
- Native Archive包含原始敏感数据；Tool结果脱敏不能替代导出警告。手工输入规则参数同样可能持久化秘密，不能仅靠URL草稿去掉query就认定全部规则安全。
