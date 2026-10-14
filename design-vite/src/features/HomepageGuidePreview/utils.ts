export const GUIDE_PREVIEW_CHAPTERS = [
  '快速上手', '工作区与基本操作', 'Capture', 'Composer', 'Rules', 'Breakpoints',
  '导入导出', 'Settings', 'Diagnostics', 'Agent', 'MCP', 'Tool 权限与审批',
  'Tool 操作速查', '常见问题与恢复',
] as const;

export const GUIDE_PREVIEW_GROUPS = [
  { title: '从第一条请求开始', chapters: ['快速上手', '工作区与基本操作', 'Capture'], description: '配置代理、找到请求，读懂 headers、正文与协议消息。' },
  { title: '修改与复现', chapters: ['Composer', 'Rules', 'Breakpoints'], description: '构造请求、改写流量，在转发前检查并作出决定。' },
  { title: '保存与排查', chapters: ['导入导出', 'Settings', 'Diagnostics', '常见问题与恢复'], description: '保留调试数据，管理网络设置，定位问题并正常恢复。' },
  { title: 'AI 辅助调试', chapters: ['Agent', 'MCP', 'Tool 权限与审批', 'Tool 操作速查'], description: '按需连接模型或外部 Host，在明确的权限范围内协作。' },
] as const;
