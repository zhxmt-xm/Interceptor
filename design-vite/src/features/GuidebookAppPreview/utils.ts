import type { CSSProperties } from 'react';
import type { GlobalToken } from 'antd';

import type { DesignState, DesignStatePatch } from '../../state/types';
import type { GuideSearchPreviewLocale, GuideSearchPreviewResult } from '../HomepageGuidePreview/utils';

export const GUIDEBOOK_PREVIEW_IMAGE = 'http://127.0.0.1:4175/guidebook/media/v0.1.1-alpha.1/mcp-current-host-english/step-001.annotated.png';

export const GUIDEBOOK_PREVIEW_SCENES = [
  ['overview', '教程目录'], ['article', 'MCP 阅读'], ['loading', '加载中'],
  ['error', '加载失败'], ['search', '搜索'], ['image', '原图预览'],
] as const;

export const GUIDEBOOK_PREVIEW_CHAPTERS = [
  ['getting-started', 'Getting started', '快速开始'],
  ['workspace', 'Workspace', '工作区'],
  ['capture', 'Capture', 'Capture'],
  ['composer', 'Composer', 'Composer'],
  ['rules', 'Rules & Map', 'Rules & Map'],
  ['breakpoints', 'Breakpoints', 'Breakpoints'],
  ['transfer', 'Import & export', '导入与导出'],
  ['settings', 'Settings', 'Settings'],
  ['diagnostics', 'Diagnostics', 'Diagnostics'],
  ['agent', 'Agent', 'Agent'],
  ['mcp', 'MCP', 'MCP'],
  ['tool-permissions', 'Tool permissions', 'Tool 权限'],
  ['tool-reference', 'Tool reference', 'Tool 速查'],
  ['troubleshooting', 'Troubleshooting', '问题排查'],
] as const;

export const GUIDEBOOK_PREVIEW_COPY = {
  en: {
    shell: 'Guidebook', overview: 'Guide directory', online: 'Online guide', open: 'Open in browser',
    search: 'Search guide', chapterLabel: 'CHAPTERS', back: 'Guide directory',
    overviewTitle: 'Find the next step.',
    overviewLead: 'Start with your first request, then explore the tools for inspecting and changing traffic.',
    groupOne: 'Start and inspect', groupTwo: 'Change and automate',
    cardCapture: 'Record traffic, narrow the list and inspect headers, bodies and timing.',
    cardRules: 'Match requests, change messages and pause traffic before it continues.',
    cardAgent: 'Use a configured model with explicit Tool permissions and App approval.',
    cardMcp: 'Connect an external AI host without sharing an identity with other hosts.',
    readMcp: 'Read the MCP guide',
    articleTitle: 'MCP: connect an external AI host',
    articleLead: 'Connect a Host on your computer, inspect a request you control and review changes in the App.',
    connect: 'Connect one Host', approve: 'Review each change', cleanup: 'Finish and revoke access',
    connectBody: 'Create a separate Client in Settings → Agent. Copy its connection configuration into the Host’s secure user-level configuration. Keep credentials out of chat, source code and screenshots.',
    connectStep: 'Keep the Client in Ask, then make a read-only request from the Host. Check the actual result rather than relying on “Running” or a model saying it connected.',
    caption: 'Use the Client row to copy its configuration. The picture shows the App, not the Host’s configuration page.',
    approveBody: 'When the Host requests a change, check the Client, Tool, arguments and effect. Deny keeps the current state; Allow executes that request only.',
    autoBody: 'Auto skips individual App approval for enabled change Tools. It does not bypass Host approval, native file dialogs or system authorization.',
    cleanupBody: 'Revoke the Client when access is no longer needed. Disable MCP Server separately, then remove only that connection from the Host. Other Clients and settings remain unchanged.',
    loadingTitle: 'Loading the guide…', loadingBody: 'Opening the online reading page. Your current workspace stays available.',
    errorTitle: 'The guide could not be loaded',
    errorBody: 'Check your connection and try again. The guide needs a network connection; offline reading is not promised.',
    retry: 'Try again', imageError: 'The example image is unavailable. Start the local Homepage preview before reviewing this candidate.',
  },
  zh: {
    shell: '使用指南', overview: '教程目录', online: '在线教程', open: '在浏览器打开',
    search: '搜索教程', chapterLabel: '章节', back: '教程目录',
    overviewTitle: '找到下一步怎么做。',
    overviewLead: '从第一条请求开始，再按需要查看流量检查、修改和自动化操作。',
    groupOne: '开始与检查', groupTwo: '修改与自动化',
    cardCapture: '录制流量、组合筛选，查看 Header、正文和时序。',
    cardRules: '匹配请求、修改消息，并在流量继续前暂停检查。',
    cardAgent: '使用已配置的模型，并明确 Tool 权限与 App 审批。',
    cardMcp: '接入外部 AI Host，为每个 Host 保留独立身份。',
    readMcp: '阅读 MCP 指南',
    articleTitle: 'MCP：连接外部 AI 客户端',
    articleLead: '连接本机 Host，检查自己控制的请求，并在 App 中核对每次修改。',
    connect: '接入一个 Host', approve: '核对每次修改', cleanup: '结束使用并撤销接入',
    connectBody: '在 Settings → Agent 为当前 Host 创建独立 Client。复制连接配置，保存到 Host 的用户级安全配置位置；不要把凭据放进聊天、源码或截图。',
    connectStep: '保持 Client 为 Ask，再从 Host 发起一条只读请求。核对实际返回，不只凭 Running 或模型说“已连接”判断。',
    caption: '从 Client 行复制连接配置。图片展示的是 App，不是 Host 的配置页。',
    approveBody: 'Host 请求修改时，先核对 Client、Tool、参数与影响。Deny 保持原状态，Allow 只允许这一次请求。',
    autoBody: 'Auto 只省略已启用 change Tool 的逐次 App 审批，不绕过 Host 审批、原生文件窗口或系统授权。',
    cleanupBody: '不再需要访问时撤销 Client，另行关闭 MCP Server，再从 Host 只移除这一项连接。其他 Client 和设置保持不变。',
    loadingTitle: '正在加载教程…', loadingBody: '正在打开在线阅读页。当前工作区仍可使用。',
    errorTitle: '无法加载在线教程',
    errorBody: '请检查网络后重试。教程需要网络连接，不承诺离线阅读。',
    retry: '重试', imageError: '示例图片暂不可用。评审候选前请启动本地 Homepage 预览。',
  },
} as const;

export function guidebookPreviewLocale(lang: string): GuideSearchPreviewLocale {
  return lang.startsWith('zh') ? 'zh' : 'en';
}

export function guidebookPreviewUrl(page: DesignState['guidebookPreviewPage'], locale: GuideSearchPreviewLocale): string {
  return `http://127.0.0.1:4175/guide${page === 'mcp' ? '/mcp' : ''}?lang=${locale}`;
}

export function guidebookPreviewScene(state: DesignState): string {
  if (state.guidebookPreviewSearchOpen) return 'search';
  if (state.guidebookPreviewImageOpen) return 'image';
  if (state.guidebookPreviewLoadState !== 'ready') return state.guidebookPreviewLoadState;
  return state.guidebookPreviewPage === 'overview' ? 'overview' : 'article';
}

export function guidebookPreviewPatch(scene: string): DesignStatePatch {
  if (!GUIDEBOOK_PREVIEW_SCENES.some(([id]) => id === scene)) throw new Error('Unknown Guidebook App preview scene.');
  return {
    view: 'settings', guidebookAppPreview: true,
    guidebookPreviewPage: scene === 'overview' ? 'overview' : 'mcp',
    guidebookPreviewLoadState: scene === 'loading' || scene === 'error' ? scene : 'ready',
    guidebookPreviewSearchOpen: scene === 'search',
    guidebookPreviewSearchQuery: scene === 'search' ? 'MCP' : '',
    guidebookPreviewImageOpen: scene === 'image',
    guidebookPreviewImageError: false,
    guidebookPreviewSection: 'gbp-connect',
  };
}

export function guidebookPreviewHeadings(locale: GuideSearchPreviewLocale): readonly { id: string; title: string }[] {
  const copy = GUIDEBOOK_PREVIEW_COPY[locale];
  return [
    { id: 'gbp-connect', title: copy.connect },
    { id: 'gbp-approve', title: copy.approve },
    { id: 'gbp-cleanup', title: copy.cleanup },
  ];
}

export function guidebookPreviewSearch(query: string, locale: GuideSearchPreviewLocale): readonly GuideSearchPreviewResult[] {
  const value = query.trim().toLocaleLowerCase(locale);
  if (!value) return [];
  const copy = GUIDEBOOK_PREVIEW_COPY[locale];
  return [
    { href: '#gbp-connect', chapter: 'MCP', title: copy.connect, text: copy.connectBody },
    { href: '#gbp-approve', chapter: 'MCP', title: copy.approve, text: copy.approveBody },
    { href: '#gbp-cleanup', chapter: 'MCP', title: copy.cleanup, text: copy.cleanupBody },
  ].filter(result => `${result.chapter} ${result.title} ${result.text}`.toLocaleLowerCase(locale).includes(value));
}

export function guidebookPreviewTokens(token: GlobalToken): CSSProperties & Record<`--gbp-${string}`, string> {
  return {
    '--gbp-space-xs': `${token.paddingXS}px`, '--gbp-space-sm': `${token.paddingSM}px`,
    '--gbp-space': `${token.padding}px`, '--gbp-space-lg': `${token.paddingLG}px`,
    '--gbp-radius': `${token.borderRadius}px`, '--gbp-reading-size': `${token.fontSizeLG}px`,
    '--gbp-heading-size': `${token.fontSizeHeading2}px`,
  };
}
