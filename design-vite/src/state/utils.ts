import type { BodyPreview, BodyKind, BodyMode, BodyState, BootPhase, DesignState, DesignStatePatch } from './types';

export interface BodyScene {
  readonly kind: BodyKind;
  readonly mode: BodyMode;
  readonly state?: Exclude<BodyState, ''>;
}

export const BODY_SCENES: Readonly<Record<BodyPreview, BodyScene>> = {
  json: { kind: 'json', mode: 'default' },
  tree: { kind: 'json', mode: 'tree' },
  'tree-menu': { kind: 'json', mode: 'tree', state: 'menu' },
  raw: { kind: 'json', mode: 'raw' },
  hex: { kind: 'json', mode: 'hex' },
  code: { kind: 'code', mode: 'default' },
  formatting: { kind: 'code', mode: 'default', state: 'busy' },
  limited: { kind: 'limited', mode: 'default' },
  'format-off': { kind: 'limited', mode: 'default', state: 'format-off' },
  image: { kind: 'image', mode: 'default' },
  'image-large': { kind: 'image-large', mode: 'default' },
  binary: { kind: 'binary', mode: 'default' },
  form: { kind: 'form', mode: 'default' },
  md: { kind: 'md', mode: 'default' },
  'md-split': { kind: 'md', mode: 'split' },
  'md-source': { kind: 'md', mode: 'source' },
  media: { kind: 'media', mode: 'default' },
};

export const BOOT_PHASES: Readonly<Record<Exclude<BootPhase, ''>, Readonly<Record<string, string>>>> = {
  core: { core: 'active', listener: 'pending', proxy: 'pending' },
  listener: { core: 'done', listener: 'active', proxy: 'pending' },
  proxy: { core: 'done', listener: 'done', proxy: 'active' },
  ready: { core: 'done', listener: 'done', proxy: 'done' },
  error: { core: 'failed', listener: 'pending', proxy: 'pending' },
};

export const INITIAL_DESIGN_STATE: DesignState = {
  view: 'capture', theme: 'light', sidebar: 'collapsed', lang: 'en', overlay: '', tab: 'headers', detail: 'open',
  filters: 'open', filterGroup: '', filterActive: '', search: '', tip: '', pop: false, pop2: '',
  composerTab: 'headers', composerResponseTab: 'body', composer: '', collection: 'open', collectionRename: '',
  composerHistory: '', agentPanel: 'closed', agentProvider: 'configured', agentProviderDialog: '', agentProviderDialogMode: 'add', agentProviderDialogTarget: '', agentModelMenu: '',
  agentDefaultModel: 'deepseek', agentCurrentModel: 'deepseek', agentChat: 'checkout', agentChatTitle: 'Checkout failures', agentChatDialog: '', agentTurnState: 'idle', agentChatMenu: '', agentMessage: '', agentUsagePanel: '', agentExecutionMode: 'ask', agentToolApproval: '', agentToolTrace: '', agentCheckoutExecutionMode: 'ask', agentCheckoutToolApproval: '',
  agentDeepSeekProfile: { displayName: 'DeepSeek V4 Flash', profileName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '••••••••••••••••9K4Q', modelId: 'deepseek-v4-flash', contextWindow: '1000000', maximumOutput: '8192' },
  agentQwenProfile: { displayName: 'Qwen3 Max', profileName: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '••••••••••••••••7M2P', modelId: 'qwen3-max', contextWindow: '131072', maximumOutput: '8192' },
  agentAddedProfile: null,
  agentRemovedModels: [], agentRemoveModelTarget: '',
  agentToolSearch: '', agentDisabledTools: [], mcpDisabledTools: [],
  bodyType: 'json', settings: 'certificates', update: 'up-to-date',
  githubAuth: 'signed-in', appContainers: 'ready', tlsPassthrough: 'ready', tlsPatterns: null,
  tlsHostInput: '', tlsPassthroughTargetHost: '', tlsPassthroughTargetPattern: '', tlsPassthroughTargetSequence: 0,
  tlsPassthroughTargetExpires: false,
  tlsCompatibility: '', tlsCompatibilityHosts: null, https: 'fresh', mitm: 'inactive',
  systemProxy: 'on', upstream: 'on', copy: 'hidden', transfer: '', recording: '', fileMenu: '', ruleSelect: '',
  requestMenu: '', ruleFilter: '', ruleOptions: '', scene: 'http', bodyPreview: 'json', bodyKind: 'json',
  bodyMode: 'default', bodyState: '', bodyRuleEffect: '', breakpoints: 'on', breakpointState: 'request', breakpointBody: 'loading',
  breakpointFile: 'none', breakpointPanel: '', breakpointMessage: '', breakpointUi: '', ruleTypography: 'composer',
  breakpointQueueSelection: 'http-head', breakpointQueueMenu: '', ruleBreakpointAction: '',
  websocketBreakpoint: 'disabled', websocketBreakpointDirection: 'both',
  websocketBreakpointFrames: ['message'], websocketMessageDirection: 'sent', websocketMessagePayload: 'text',
  websocketUpgradeResponse: 'accepted', ctxmenu: '', boot: '', hasFilter: false,
};

export function reduceDesignState(state: DesignState, patch: DesignStatePatch): DesignState {
  let next = { ...state, ...patch };
  if (patch.view !== undefined) {
    next = {
      ...next,
      pop: patch.pop ?? false,
      pop2: patch.pop2 ?? '',
      tip: patch.tip ?? '',
      ruleSelect: patch.ruleSelect ?? '',
      requestMenu: patch.requestMenu ?? '',
      ctxmenu: patch.ctxmenu ?? '',
      search: patch.search ?? '',
      scene: patch.scene ?? 'http',
      tab: patch.tab ?? 'headers',
      composerTab: patch.composerTab ?? 'headers',
      composerResponseTab: patch.composerResponseTab ?? 'body',
      agentUsagePanel: patch.agentUsagePanel ?? '',
      agentChatMenu: patch.agentChatMenu ?? '',
      agentModelMenu: patch.agentModelMenu ?? '',
      detail: patch.tab || patch.scene || patch.detail === 'open' ? 'open' : 'closed',
    };
  }
  // 显式给了 detail 就以它为准，覆盖上面按 tab/scene 的推导。
  if (patch.detail !== undefined) {
    next = { ...next, detail: patch.detail === 'open' ? 'open' : 'closed' };
  }
  if (patch.bodyPreview !== undefined) {
    const bodyPreview = BODY_SCENES[patch.bodyPreview] ? patch.bodyPreview : 'json';
    const bodyScene = BODY_SCENES[bodyPreview];
    next = { ...next, bodyPreview, bodyKind: bodyScene.kind, bodyMode: bodyScene.mode, bodyState: bodyScene.state ?? '' };
  }
  if (patch.bodyMode !== undefined) next = { ...next, bodyState: '' };
  if (next.agentChat === 'checkout' && patch.agentExecutionMode !== undefined) {
    next = { ...next, agentCheckoutExecutionMode: patch.agentExecutionMode };
  }
  if (next.agentChat === 'checkout' && patch.agentToolApproval !== undefined) {
    next = { ...next, agentCheckoutToolApproval: patch.agentToolApproval };
  }
  if (patch.breakpointState !== undefined && patch.breakpointState) {
    next = { ...next, detail: 'open' };
  }
  if (patch.breakpointBody === 'loading') next = { ...next, breakpointFile: 'none' };
  if (patch.breakpointUi !== undefined) {
    next = {
      ...next,
      breakpointPanel: patch.breakpointUi === 'panel' ? 'open' : '',
      breakpointMessage: patch.breakpointUi === 'message' ? 'created' : '',
    };
  }
  if (patch.tlsCompatibility) next = { ...next, overlay: 'tls-compatibility' };
  return next;
}

export function designRootClassName(state: DesignState, baseClassName: string): string {
  return [
    baseClassName.replace(/\b(?:expanded|collapsed|showpop|thopen|lgopen|nodetail|hasfilter)\b/g, '').replace(/\s+/g, ' ').trim(),
    state.sidebar,
    state.pop ? 'showpop' : '',
    state.pop2 === 'theme' ? 'thopen' : '',
    state.pop2 === 'lang' ? 'lgopen' : '',
    state.detail === 'closed' ? 'nodetail' : '',
    state.hasFilter ? 'hasfilter' : '',
  ].filter(Boolean).join(' ');
}

export function designRootAttributes(state: DesignState): Record<string, string | undefined> {
  const optional = (value: string): string | undefined => value || undefined;
  return {
    'data-theme': state.theme, 'data-view': state.view, 'data-lang': state.lang, 'data-overlay': optional(state.overlay),
    'data-scene': state.scene, 'data-filters': state.filters, 'data-filter-group': optional(state.filterGroup),
    'data-filter-active': optional(state.filterActive), 'data-search': optional(state.search), 'data-tip': optional(state.tip),
    'data-composer': optional(state.composer), 'data-collection': state.collection,
    'data-collection-rename': optional(state.collectionRename), 'data-composer-history': optional(state.composerHistory),
    'data-agent-panel': state.agentPanel, 'data-agent-provider': state.agentProvider,
    'data-agent-provider-dialog': optional(state.agentProviderDialog), 'data-agent-model-menu': optional(state.agentModelMenu),
    'data-agent-provider-dialog-mode': state.agentProviderDialogMode,
    'data-agent-provider-dialog-target': optional(state.agentProviderDialogTarget),
    'data-agent-default-model': state.agentDefaultModel, 'data-agent-current-model': state.agentCurrentModel,
    'data-agent-chat': state.agentChat, 'data-agent-turn-state': state.agentTurnState,
    'data-agent-chat-menu': optional(state.agentChatMenu), 'data-agent-chat-dialog': optional(state.agentChatDialog),
    'data-agent-usage-panel': optional(state.agentUsagePanel), 'data-agent-execution-mode': state.agentExecutionMode,
    'data-agent-tool-approval': optional(state.agentToolApproval), 'data-agent-tool-trace': optional(state.agentToolTrace),
    'data-body-type': state.bodyType, 'data-settings': state.settings, 'data-update': state.update,
    'data-github-auth': state.githubAuth, 'data-app-containers': state.appContainers, 'data-tls-passthrough': state.tlsPassthrough,
    'data-tls-passthrough-target': optional(state.tlsPassthroughTargetPattern),
    'data-tls-compatibility': optional(state.tlsCompatibility),
    'data-https': state.https, 'data-mitm': state.mitm, 'data-system-proxy': state.systemProxy,
    'data-upstream': optional(state.upstream), 'data-copy': state.copy, 'data-transfer': optional(state.transfer),
    'data-recording': optional(state.recording), 'data-file-menu': optional(state.fileMenu),
    'data-rule-select': optional(state.ruleSelect), 'data-request-menu': optional(state.requestMenu),
    'data-rule-filter': optional(state.ruleFilter), 'data-rule-options': optional(state.ruleOptions),
    'data-body-kind': state.bodyKind, 'data-body-mode': state.bodyMode, 'data-body-state': optional(state.bodyState),
    'data-body-rule-effect': optional(state.bodyRuleEffect),
    'data-breakpoints': state.breakpoints, 'data-breakpoint-state': optional(state.breakpointState),
    'data-breakpoint-body': state.breakpointBody, 'data-breakpoint-file': state.breakpointFile,
    'data-breakpoint-panel': optional(state.breakpointPanel),
    'data-breakpoint-queue-selection': state.breakpointQueueSelection,
    'data-breakpoint-queue-menu': optional(state.breakpointQueueMenu),
    'data-rule-breakpoint-action': optional(state.ruleBreakpointAction),
    'data-websocket-breakpoint': state.websocketBreakpoint,
    'data-websocket-breakpoint-direction': state.websocketBreakpointDirection,
    'data-websocket-breakpoint-frames': state.websocketBreakpointFrames.join(','),
    'data-websocket-message-direction': state.websocketMessageDirection,
    'data-websocket-message-payload': state.websocketMessagePayload,
    'data-websocket-upgrade-response': state.websocketUpgradeResponse,
    'data-rule-typography': state.ruleTypography, 'data-ctxmenu': optional(state.ctxmenu), 'data-boot': optional(state.boot),
  };
}