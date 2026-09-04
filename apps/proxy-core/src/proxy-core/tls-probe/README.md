# tls-probe

**只握手的 TLS 探测。** 对目标建立一次 TLS 连接，读取协议版本、密码套件、ALPN 协商结果与完整证书链，**不发送任何应用数据**。

## 主类

`TlsProbeService`（`entry.ts`），唯一方法 `probe(host, port, timeoutMs, abortSignal?)`。

## 细节

- `servername` 设为 host，ALPN 提供 `h2` / `http/1.1`
- `rejectUnauthorized: false`——探测的目的就是看清对端出示了什么，不是验证它
- 沿 `issuerCertificate` 链收集完整证书（去重防环、上限 10 张），每张取 subject / issuer / 有效期 / 序列号 / SHA-256 指纹
- 仅在调用方显式提供 `timeoutMs` 时设置期限
- 调用方取消时立即销毁TLS socket并返回稳定取消结果
- 网络错误以 `ok: false` 返回，不抛异常

## 依赖

无跨模块依赖。
