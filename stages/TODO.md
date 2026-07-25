## Todo list

### Capture（2026-07-25 已完成）
1. [x] Capture request 右键按 11 种 Action type 创建 exact-URL Rule 草稿；Capture 支持 Rule 多选过滤；Rules 可一键回到 Capture 查看命中请求；Detail Rule marker 可直达 Rule detail。
2. [x] Rule marker 与前值间距统一为 `4px`。 ![alt text](image.png)
3. [x] KV 去掉 `22px` 最小高度，统一使用 `18px` 行盒。 ![alt text](image-1.png)
4. [x] KV text 与 Rule marker 使用同一垂直中线。 ![alt text](image-2.png)
5. [x] Copy button 改为 `18×18px`，取消右移与下沉。 ![alt text](image-3.png)
6. [x] BYD 页面中的 `67 MB MP4` 是页面主动发起的真实 `206 video/mp4` 媒体请求，不是 `index.html` Body 串线。 ![alt text](image-4.png)
7. [x] Core 继续完整保留 Body；文本/HTML/JSON、WebSocket、gRPC 最多预览前 `1 MiB`，viewport 最大 `320px`；gzip/br 超限显示明文前缀，不再显示压缩乱码。
8. [x] `video/*` / `audio/*` 不读取、不显示 Hex，改为由 Main Save Dialog + Core 流式任务保存完整正文。
9. [x] 修复 MITM 下 BYD 大唐 EV 大视频 Range 取消后刷新出现 `ERR_HTTP2_PROTOCOL_ERROR`：仅可能命中响应 Rule 的请求进入 Mockttp `beforeResponse` 缓冲，其余 H2 响应保持流式转发。
10. [x] 当前 Capture 没有任何 Rule 命中时，Add filter 中的 Rule 字段禁用且不打开空菜单。