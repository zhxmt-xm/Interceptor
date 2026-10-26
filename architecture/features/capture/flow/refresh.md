> 返回 [Capture 索引](../README.md)｜[调用流程](../README.md)

### 5.6 已登录 HTTPS 页面透明刷新

HTTPS MITM 只改变传输链路，不得改变客户端与 Origin 之间的身份语义。客户端发送的
身份 Cookie 必须完整到达 Origin，Origin 返回的 `Set-Cookie` 必须到达客户端。Capture
只能观察这条链路，不能改变登录语义。

透明性检查以真实浏览器profile中的完整页面及登录入口为准，不注入Cookie、不修改profile、不用旧DOM、CONNECT记录或单独API请求代替页面刷新。证据只记录Cookie名称，不记录凭据值。操作约定见[Capture规格](../../../../apps/desktop/tests/e2e-workflow-tests/docs/capture.md)。
