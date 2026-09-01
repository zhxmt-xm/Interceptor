# Interceptor Playground

本地Web人工验收工作台。它不接LLM、不进入Interceptor安装包，也不自动把任何Tool标记为通过。

## 启动

从仓库根目录运行：

```powershell
npm run playground
```

打开 `http://127.0.0.1:4175`。同一Node进程提供Vite页面、Traffic Lab API和本地origin；关闭命令后这些端口
一起释放。

Browser组件支持Vite HMR；修改`server/`下的Node代码后需要停止并重新运行`npm run playground`，确保页面与
Traffic Lab使用同一代接口。

## MCP人工验收

1. 启动Interceptor，进入`Settings > Agent > MCP Server`；
2. 开启Server，创建一个Client并保留默认`Ask`；
3. 点击Copy config，把完整JSON粘贴到Playground；
4. 点击Connect。页面固定使用`2026-07-28`，不回退legacy；
5. 左侧目录来自在线`tools/list`。选择Tool后查看title、description、annotations、input/output schema与人工recipe；
6. 手工填写Raw JSON并点击Call Tool；运行中可点击Abort；
7. change Tool在Interceptor里手工Deny或Allow，再对照右侧HTTP交换、SDK result和产品状态；
8. 手工选择Pass / Fail / Blocked并填写备注；
9. 点击Header下载按钮导出脱敏报告。报告包含实时schema hash，不包含Bearer明文。

Token只保存在当前页面内存。刷新、关闭页面或点击Clear configuration都会清除Token；页面不使用
`localStorage`、`sessionStorage`或IndexedDB。

## Traffic Lab

Traffic Lab无需MCP配置。当前四个场景都由Node使用显式代理`127.0.0.1:8888`发送到Playground自有origin：

- `H1 JSON`：结构化JSON响应；
- `H1 upload`：三段定时上传；
- `H1 stream`：三段定时响应与chunk timing；
- `H1 failure`：origin在响应前reset连接。

运行后，中间区显示client结果，右侧显示origin实际收到的method、URL、headers、body，以及client响应与
chunk timing。Developer在Interceptor Capture中对照同一请求，再记录人工结论。

## 边界

- Browser直接访问Interceptor MCP，因此真实覆盖CORS与Bearer；
- Main只处理`/mcp`路由、preflight与Bearer；认证后的协议判断由官方SDK负责；
- Playground不读取Interceptor内部Store，不构造Client记录，也不绕过Ask/Auto、Dialog、UAC或系统权限；
- 自动测试只保护基础设施，不能替代逐项手工点击。