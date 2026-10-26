> 返回 [Agent 索引](README.md)

## 12. Provider适配

`DeepSeekModelAdapter`通过原生fetch解析Chat Completions SSE、文本、Tool arguments、Usage、cache split和reasoning continuation，规范化HTTP/网络/非法响应错误及replay-safety。Provider通过capability声明Context Window、最大输出及Streaming/Tool/reasoning/cache能力；DeepSeek配置使用1M Context与384k最大输出。

其他Provider接入同一ModelAdapter契约，不复制Agent Loop。自定义OpenAI-compatible endpoint不等于独立Provider专用Adapter。

具体业务Tool的正文归属、分页、Rules revision/Map Local、Composer socket取消和Diagnostics静默查询规则见[能力目录](../tool-capabilities.md)及所属功能文档，不在Agent重复维护第二份业务实现或目录。
