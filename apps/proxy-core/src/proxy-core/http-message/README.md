# http-message

**HTTP replacement body 构造。** 把 Text/File replacement 按最终 headers 转成 content bytes，并在需要时维护继承的 `Content-Length`。

## 主类

`HttpMessageService`（`entry.ts`）。

## 职责

- Text 按最终 `Content-Type` 的 charset 编码，缺失 charset 时使用 UTF-8。
- File 保留原始文件 bytes。
- 按最终 `Content-Encoding` 的声明顺序逐层编码。
- Body replacement 时，仅更新未被用户编辑且原消息已存在的 `Content-Length`。
- 不执行 `Transfer-Encoding`、chunk/dechunk 或 H1/H2 framing。

## 依赖

- `iconv-lite`：Text charset 编码。
- `http-encoding`：单层 content coding；多层顺序由本模块控制。

- 被依赖：`proxy/`、`composer/`、`http-interception/`
