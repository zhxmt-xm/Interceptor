import type { ThemeConfig } from 'antd';

export const GUIDE_PREVIEW_OUTLINE = [
  { id: 'preview-recording', title: '开始与暂停录制' },
  { id: 'preview-filters', title: '搜索和组合筛选' },
  { id: 'preview-body', title: '检查正文与预览范围' },
] as const;

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

export type GuideSearchPreviewLocale = 'zh' | 'en';

export interface GuideSearchPreviewResult {
  readonly href: string;
  readonly chapter: string;
  readonly title: string;
  readonly text: string;
}

export const GUIDE_SEARCH_PREVIEW_THEME: ThemeConfig = {
  cssVar: { key: 'guide-search-preview' },
  token: {
    fontFamily: 'var(--font-sans, "Inter", sans-serif)',
    fontSize: 14,
    motion: false,
    colorPrimary: 'var(--accent)',
    colorText: 'var(--text)',
    colorTextHeading: 'var(--text)',
    colorTextSecondary: 'var(--text-2)',
    colorTextTertiary: 'var(--text-3)',
    colorTextQuaternary: 'var(--text-3)',
    colorTextDisabled: 'var(--text-3)',
    colorTextPlaceholder: 'var(--text-3)',
    colorBgContainer: 'var(--panel)',
    colorBgElevated: 'var(--panel)',
    colorBorder: 'var(--border-2)',
    colorFillSecondary: 'var(--hover)',
    borderRadius: 8,
  },
  components: {
    Input: {
      activeBorderColor: 'var(--accent)',
      hoverBorderColor: 'var(--accent)',
      activeShadow: 'none',
    },
    Button: {
      defaultHoverColor: 'var(--accent)',
      defaultHoverBorderColor: 'var(--accent)',
      defaultHoverBg: 'var(--hover)',
    },
    Modal: {
      contentBg: 'var(--panel)',
      headerBg: 'var(--panel)',
    },
  },
};

export const GUIDE_SEARCH_PREVIEW_COPY = {
  zh: {
    trigger: '搜索教程',
    title: '搜索使用指南',
    placeholder: '搜索章节、操作步骤或关键词…',
    scope: '全部章节 · 中文',
    empty: '输入关键词，找到对应的操作。',
    hint: '搜索章节标题、步骤和正文，不搜索图片中的文字。',
    noResults: '没有找到相关内容',
    retry: '试试更短的关键词，或检查拼写。',
    results: '条结果',
    navigate: '选择',
    open: '打开',
    close: '关闭',
    examples: ['证书', '断点', 'HAR'],
  },
  en: {
    trigger: 'Search guide',
    title: 'Search the user guide',
    placeholder: 'Search chapters, steps or keywords…',
    scope: 'All chapters · English',
    empty: 'Find the instructions you need.',
    hint: 'Search chapter titles, steps and text, not text inside images.',
    noResults: 'No matching content',
    retry: 'Try a shorter keyword or check the spelling.',
    results: 'results',
    navigate: 'Select',
    open: 'Open',
    close: 'Close',
    examples: ['certificate', 'breakpoint', 'HAR'],
  },
} as const;

const results = [
  {
    page: 'settings', anchor: 'https-decryption',
    chapter: { zh: 'Settings', en: 'Settings' },
    title: { zh: '准备 CA 并启用 HTTPS 解密', en: 'Prepare a CA and enable HTTPS decryption' },
    text: {
      zh: '若 CA 尚未准备好，按 App 的生成与信任入口完成系统授权。不要自己覆盖证书材料，也不要把系统权限提示当作 GitHub 登录。',
      en: 'If the CA is not ready, use the App’s generation and trust actions and complete system authorization. Do not overwrite certificate material yourself.',
    },
  },
  {
    page: 'troubleshooting', anchor: 'tls',
    chapter: { zh: '常见问题与恢复', en: 'Troubleshooting' },
    title: { zh: 'HTTPS 只显示 TLS tunnel 或客户端报证书错误', en: 'HTTPS is only a tunnel or has a certificate error' },
    text: {
      zh: '区分客户端不信任 Interceptor CA 与源站自身的证书错误。前者需要检查客户端信任，后者应先修复源站证书。',
      en: 'Distinguish client distrust of the Interceptor CA from the origin’s own certificate errors. Check client trust for the former and repair the origin certificate first for the latter.',
    },
  },
  {
    page: 'settings', anchor: 'walkthrough-02-certificates',
    chapter: { zh: 'Settings · 步骤 1', en: 'Settings · Step 1' },
    title: { zh: '检查 CA 的状态与公开指纹', en: 'Inspect the CA state and public fingerprint' },
    text: {
      zh: '打开 Settings → Certificates，检查公开指纹、有效期、Generated 和 Trusted。本例复用已经准备并信任的 CA，不删除现有证书来重新演示首次启动。',
      en: 'Open Settings → Certificates and inspect the public fingerprint, validity, Generated and Trusted states. This example reuses an available trusted CA.',
    },
  },
  {
    page: 'settings', anchor: 'tls-passthrough',
    chapter: { zh: 'Settings', en: 'Settings' },
    title: { zh: 'TLS passthrough', en: 'TLS passthrough' },
    text: {
      zh: '使用证书固定或独立信任库的客户端可能仍需要透传；透传仍经过代理和已配置的上游。',
      en: 'Clients using certificate pinning or independent trust stores may still need passthrough. Passthrough still crosses the proxy and configured upstream.',
    },
  },
  {
    page: 'breakpoints', anchor: '',
    chapter: { zh: 'Breakpoints', en: 'Breakpoints' },
    title: { zh: '暂停、检查，再决定如何继续', en: 'Pause, inspect and decide how to continue' },
    text: {
      zh: '通过断点暂停请求、响应或 WebSocket 消息，检查后再决定如何继续。',
      en: 'Use a breakpoint to pause requests, responses or WebSocket messages before deciding how to continue.',
    },
  },
  {
    page: 'transfer', anchor: '',
    chapter: { zh: '导入导出', en: 'Import and export' },
    title: { zh: '选择导出格式', en: 'Choose an export format' },
    text: {
      zh: '选择 HAR 或 Native Archive 保留调试数据，并在分享前检查敏感信息。',
      en: 'Choose HAR or Native Archive to retain debugging data, and review sensitive information before sharing.',
    },
  },
];

export function searchGuidePreview(query: string, locale: GuideSearchPreviewLocale) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return results.filter((result) => {
    const text = `${result.chapter[locale]} ${result.title[locale]} ${result.text[locale]}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  }).map((result) => ({
    href: `/guide/${result.page}${locale === 'en' ? '?lang=en' : ''}${result.anchor ? `#${result.anchor}` : ''}`,
    chapter: result.chapter[locale],
    title: result.title[locale],
    text: result.text[locale],
  }));
}

export function guidePreviewHighlights(text: string, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return [{ text, matched: false }];
  const expression = new RegExp(`(${terms.join('|')})`, 'gi');
  return text.split(expression).filter(Boolean).map((part) => ({
    text: part,
    matched: query.toLocaleLowerCase().split(/\s+/).includes(part.toLocaleLowerCase()),
  }));
}
