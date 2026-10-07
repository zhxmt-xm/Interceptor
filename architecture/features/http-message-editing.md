# Feature: HTTP 消息编辑契约

> 适用入口：HTTP Breakpoint、Rules header/body action、Composer
> 实现边界：`apps/proxy-core/src/proxy-core/rules/`、`proxy/`、`composer/`

## 1. 唯一原则

Interceptor 不替用户决定 HTTP 消息应该是什么样。用户显式修改的字段和值始终优先；系统不自动纠正、不拒绝、不回退、不补齐用户没有要求的字段。

唯一允许系统联动 header 与 body 的情况是：**用户要求 Interceptor 替换 body**。此时新 body 由 Interceptor 提供，必须按用户最终给出的 header 构造；未被用户编辑但原本存在的 `Content-Length` 随最终 body 更新。

状态定义：

| 状态 | 含义 |
| --- | --- |
| `HEADER KEEP` | 字段原值或原本缺失的状态不变 |
| `HEADER UPDATE` | 采用用户显式设置/删除的结果，或因系统替换 body 而更新原本存在的 `Content-Length` |
| `BODY KEEP` | header 后的线上 body 字节完全不变；不 encode/decode/chunk/dechunk |
| `BODY UPDATE` | 使用用户提供的新正文，并按最终 headers 构造线上 body |

正文替换时的职责边界固定为：

```text
Text/File
→ Core 按 Content-Type charset 生成正文 bytes
→ Core 按 Content-Encoding 生成最终 content bytes
→ Core 按编辑意图维护 Content-Length
→ Mockttp/Node 按 Transfer-Encoding 与 H1/H2 协议生成 wire framing
```

- Core 不执行 chunk/dechunk，也不因 `Transfer-Encoding` 调整用户 headers。
- Mockttp patch 只接收 Core 已生成的最终 content bytes并替换原 stream，不再编码正文、计算 `Content-Length` 或修改 `Transfer-Encoding`。
- H1 `chunked` 由 Node 发送层分块；H2 使用 DATA frame。非法或矛盾 header 的底层报错与实际 wire 结果原样记录。

实现必须保留两个正交事实：

```ts
interface HttpMessageEditIntent {
  readonly editedHeaderNames: readonly string[];
  readonly bodyReplacement?:
    | { readonly kind: 'text'; readonly value: string }
    | { readonly kind: 'file'; readonly path: string };
}
```

- `editedHeaderNames` 使用小写字段名，包含显式设置和显式删除；完整最终 header 列表不能替代这份来源信息。
- `bodyReplacement` 缺失表示 `BODY KEEP`，不能因为 header 改动而生成 replacement。
- Text/File 是当前 HTTP Breakpoint 的正式产品能力；新增其他正文模式前必须扩展正式契约。

## 2. 只改 Header

所有行都遵循 `HEADER UPDATE；BODY KEEP`。

| 用户修改的字段 | 处理 |
| --- | --- |
| 普通 header | 只应用用户的设置或删除 |
| `Content-Type` | 不解析、不序列化、不改变 charset 对应的 body 字节 |
| `Content-Encoding` | 不压缩、不解压；多层编码同样不处理 |
| `Content-Length` | 使用用户值；不重算、不截断、不填充 body |
| `Transfer-Encoding` | 只修改字段；不 chunk、不 dechunk |
| 多个字段或矛盾组合 | 逐项采用用户结果，不修正字段关系 |

Mockttp/Node 如果随后自动改写、过滤或拒绝某种组合，那是底层发送链的**实际结果**，不是 Interceptor 的产品决策。测试必须记录该事实；不得提前替用户改变输入来规避结果。

## 3. 只改 Body

Header 均未被用户显式编辑。新 body 的构造顺序是：

```text
用户选择的正文模式
→ Content-Type 中该模式明确使用的参数
→ Content-Encoding
→ 计算原本存在的 Content-Length
→ Transfer-Encoding
```

| 原 header 字段 | 处理 |
| --- | --- |
| `Content-Type` | `HEADER KEEP；BODY UPDATE`：只向明确的正文模式提供 charset/boundary 等参数，不用 media type 猜正文模式 |
| `Content-Encoding` | `HEADER KEEP；BODY UPDATE`：存在则按声明顺序编码，缺失则不编码 |
| `Content-Length` | 原本存在：`HEADER UPDATE；BODY UPDATE`，更新为 content coding 后、transfer coding 前的字节长度；原本缺失：`HEADER KEEP；BODY UPDATE`，不新增 |
| `Transfer-Encoding` | `HEADER KEEP；BODY UPDATE`：存在则交给发送层按协议执行，缺失则不新增；Core 不 chunk/dechunk |
| `Content-Length` 与 `Transfer-Encoding` 同时存在 | `Content-Length` 仍按上条更新，`Transfer-Encoding` 保持并执行；不删除任一字段 |
| `ETag`、`Digest`、`Content-Digest`、`Content-Range`、签名、`Last-Modified` | `HEADER KEEP；BODY UPDATE`：不重算、不删除 |
| 其余普通 header | `HEADER KEEP；BODY UPDATE` |

若原本存在 `Content-Length`、但最终 content 长度不能提前获得，实现可以先生成或暂存最终 content bytes 后再计算；不能擅自改用其他 framing。

## 4. Header 和 Body 都改

先逐项应用用户 header 修改，得到最终 headers；再按最终 headers 构造 replacement body。

| 最终字段 | 处理 |
| --- | --- |
| 普通 header | `HEADER UPDATE；BODY UPDATE`：采用用户最终值 |
| `Content-Type` | `HEADER UPDATE；BODY UPDATE`：只向明确正文模式提供参数 |
| `Content-Encoding` | `HEADER UPDATE；BODY UPDATE`：按最终编码列表处理新正文 |
| 用户删除 `Content-Encoding` | `HEADER UPDATE；BODY UPDATE`：保持缺失，不执行 content coding |
| 用户设置 `Content-Length` | `HEADER UPDATE；BODY UPDATE`：保留用户最终值，不重算、不改变 body 以迎合该值 |
| 用户删除 `Content-Length` | `HEADER UPDATE；BODY UPDATE`：保持缺失 |
| `Content-Length` 未被用户编辑 | 原本存在：`HEADER UPDATE；BODY UPDATE`；原本缺失：`HEADER KEEP；BODY UPDATE` |
| 用户设置 `Transfer-Encoding` | `HEADER UPDATE；BODY UPDATE`：保留最终值，由发送层按协议处理 |
| 用户删除 `Transfer-Encoding` | `HEADER UPDATE；BODY UPDATE`：保持缺失 |
| `Transfer-Encoding` 未被用户编辑 | `HEADER KEEP；BODY UPDATE`：继承原值，由发送层按协议处理 |
| ETag、Digest、Range、签名等 | 用户编辑则 `HEADER UPDATE`，未编辑则 `HEADER KEEP`；均为 `BODY UPDATE` |

不支持的参数或编码原样进入当前发送链；底层产生的编码错误、协议错误或实际 wire 结果原样返回和记录，Interceptor 不选择替代参数或编码。

## 5. Content-Type 细则

`Content-Type` 只为用户已经选择的正文模式提供参数，不能反向选择或校验正文模式。

| 最终 `Content-Type` | `BODY UPDATE` 时的处理 |
| --- | --- |
| `text/*; charset=...` | Text 模式使用明确 charset；其他模式不受此规则影响 |
| `application/json` | 只有结构化 JSON 模式才序列化 JSON；Text 模式仍使用用户原文本 |
| `application/x-www-form-urlencoded` | 只有 Form 模式才执行表单序列化 |
| `multipart/form-data; boundary=abc` | 只有 Multipart 模式才使用 `abc` 构造边界 |
| binary/image/file media type | File 模式保持文件字节，不因 media type 转换 |
| 字段缺失 | 不新增；按用户选择的正文模式产生 body |
| 参数无法识别 | 不猜替代参数，呈现底层实际结果 |

当前 HTTP Breakpoint 只有 Text 与 File replacement：Text 使用其明确支持的字符编码，File 保持文件字节。JSON/Form/Multipart 只有在对应入口拥有正式结构化模式时才应用上表语义。

## 6. 多层 Content-Encoding

字段按编码应用顺序列出。例如：

```http
Content-Encoding: gzip, br
```

替换 body 时：

```text
用户正文 → gzip → Brotli → content bytes
```

接收方按相反顺序解码：

```text
content bytes → Brotli 解压 → gzip 解压 → 原正文
```

若最终还有：

```http
Transfer-Encoding: chunked
```

完整构造顺序为：

```text
正文 → gzip → br → chunked → 网络
```

`Content-Encoding: gzip, gzip` 表示连续 gzip 两次，不得自动简化。只修改该 header 而未替换 body 时，仍是 `HEADER UPDATE；BODY KEEP`，不执行任何编码。

## 7. 测试门禁

### Body effect evidence

Body替换与framing正确性正交：`CaptureBodyRuleEffect`记录最终写入者、Text/File来源与Original可用性，Final正文仍必须遵守本文件的Content-Encoding/framing规则。Request可展示Original与Final；Response Original不可用，不能通过缓冲整个origin response或伪造空正文补齐。effect元数据与实际wire字节分别验证，不能互相替代。

### Core wire tests

请求与响应、H1 与 H2 分别覆盖：

- header-only：`Content-Type` / `Content-Encoding` / `Content-Length` / `Transfer-Encoding` 修改后 body bytes 不由编辑层改变；
- body-only：`Content-Type` 参数、单层与多层 `Content-Encoding`、继承 `Content-Length`、`Content-Length` 缺失、继承 `Transfer-Encoding`；
- header+body：显式设置/删除 `Content-Type` / `Content-Encoding` / `Content-Length` / `Transfer-Encoding`，以及未编辑字段的 KEEP/UPDATE；
- Text 与 File replacement；
- Mockttp/Node 自动处理或报错的实际结果。

### Local E2E

`breakpoints.execute-edited` 必须从真实 App UI 创建规则、触发断点并通过公共 automation ID 编辑，loopback origin 断言实际 headers/body，Capture 断言实际转发结果。E2E 不替代 wire tests，只验证用户意图从 UI 到 Core 的完整传递。

## 8. 当前实现

`HttpMessageService`统一构造Breakpoint、Rule与Composer的replacement content bytes：Text按最终charset编码，
Text/File再按最终`Content-Encoding`逐层编码；代理编辑只在原消息存在且用户未编辑`Content-Length`时更新长度。

Mockttp headers-stage hook接收Core生成的`rawBody`，只替换stream并排空原正文。Request使用`write(rawBody)`后
`end()`，避免`ClientRequest.end(buffer)`绕过最终framing headers自动选择`Content-Length`；Response直接写入
已完成content coding的bytes。patch不再计算CL、执行CE或修改TE。

用户显式删除CL且最终也没有TE的H1正文没有有效framing，或用户同时保留矛盾CL/TE时，Mockttp/Node/origin可以
拒绝该消息；这是用户最终headers的真实发送结果，不由Interceptor补字段规避。
