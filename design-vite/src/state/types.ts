export type DesignView = 'capture' | 'rules' | 'composer' | 'settings' | 'diagnostics' | 'playground';
export type DesignTheme = 'warm' | 'light' | 'ember' | 'dark';
export type SidebarState = 'expanded' | 'collapsed';
export type DetailState = 'open' | 'closed';
export type FixtureOverlay =
  | 'https-setup'
  | 'import-export'
  | 'proxy-not-ready'
  | 'body-full'
  | 'app-container-confirm'
  | 'app-container-enable-all'
  | 'app-container-disable-all'
  | 'tls-compatibility'
  | 'rules-import'
  | 'composer-import'
  | 'rules-import-loading'
  | 'rules-export-loading'
  | 'composer-import-loading'
  | 'composer-export-loading'
  | '';
export type InspectorTab =
  | 'headers'
  | 'request'
  | 'response'
  | 'timing'
  | 'cookies'
  | 'tls'
  | 'messages'
  | 'grpc'
  | 'tunnel';
export type ComposerTab = 'query' | 'headers' | 'body' | 'auth';
export type ComposerResponseTab = 'body' | 'headers' | 'cookies' | 'timing';
export type BodyType = 'none' | 'json' | 'text' | 'form';
export type BodyPreview =
  | 'json'
  | 'tree'
  | 'tree-menu'
  | 'raw'
  | 'hex'
  | 'code'
  | 'formatting'
  | 'limited'
  | 'format-off'
  | 'image'
  | 'image-large'
  | 'binary'
  | 'form'
  | 'md'
  | 'md-split'
  | 'md-source'
  | 'media';
export type BodyKind = 'json' | 'code' | 'limited' | 'image' | 'image-large' | 'binary' | 'form' | 'md' | 'media';
export type BodyMode = 'default' | 'tree' | 'raw' | 'hex' | 'split' | 'source';
export type BodyState = 'menu' | 'busy' | 'format-off' | '';
export type BodyRuleEffectState =
  | 'request-text'
  | 'request-file'
  | 'response-text'
  | 'response-file'
  | '';
export type BreakpointState =
  | 'request'
  | 'response'
  | 'websocket'
  | 'websocket-upgrade-request'
  | 'websocket-upgrade-response'
  | 'queue'
  | '';
export type BreakpointBodyState = 'loading' | 'ready' | 'replace' | 'file';
export type BreakpointFileState = 'none' | 'valid';
export type BreakpointUiState = 'panel' | 'message' | '';
export type BreakpointQueueSelection = 'http-head' | 'http-queued' | 'websocket-head' | 'websocket-queued';
export type WebSocketBreakpointState = 'disabled' | 'setup' | 'enabled';
export type WebSocketBreakpointDirection = 'both' | 'sent' | 'received';
export type WebSocketBreakpointFrame = 'message' | 'ping' | 'pong' | 'close';
export type WebSocketMessageDirection = 'sent' | 'received';
export type WebSocketMessagePayload = 'text' | 'binary' | 'ping' | 'pong' | 'close';
export type WebSocketUpgradeResponse = 'accepted' | 'mock-error';
export type TreeContextMenu = 'composer-item' | 'composer-folder' | 'rules-root' | 'rules-rule' | 'rules-folder' | '';
export type BootPhase = 'core' | 'listener' | 'proxy' | 'ready' | 'error' | '';
export type AgentPanelState = 'closed' | 'open';
export type AgentProviderState = 'configured' | 'unconfigured';
export type AgentProviderDialogState = 'deepseek' | 'custom' | '';
export type AgentProviderDialogMode = 'add' | 'edit';
export type AgentModelId = 'deepseek' | 'qwen' | 'added';
export type AgentDefaultModel = AgentModelId;
export type AgentCurrentModel = AgentModelId;
export type AgentChatState = 'checkout' | 'new' | 'sent';
export type AgentTurnState = 'idle' | 'running' | 'stopped' | 'failed';
export type AgentExecutionMode = 'ask' | 'auto';
export type AgentToolApprovalState = 'pending' | 'allowed' | 'denied' | '';
export type AgentToolTraceState = 'body-messages' | 'traffic' | '';
export type McpServerState = 'disabled' | 'running' | 'conflict';
export type McpClientDialogState = 'add' | 'regenerate' | 'revoke' | '';
export type McpToolApprovalState = 'pending' | '';
export type PlaygroundSection = 'capture' | 'mcp';
export type PlaygroundCallState = 'complete' | 'approval' | 'error';
export type PlaygroundManualStatus = 'not-run' | 'pass' | 'fail' | 'blocked';

export interface AgentProviderProfileState {
  readonly displayName: string;
  readonly profileName: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelId: string;
  readonly contextWindow: string;
  readonly maximumOutput: string;
}

export interface DesignState {
  readonly view: DesignView;
  readonly theme: DesignTheme;
  readonly sidebar: SidebarState;
  readonly lang: string;
  readonly overlay: FixtureOverlay;
  readonly tab: InspectorTab;
  readonly detail: DetailState;
  readonly filters: 'open' | 'closed';
  readonly filterGroup: string;
  readonly filterActive: string;
  readonly search: string;
  readonly tip: string;
  readonly pop: boolean;
  readonly pop2: 'theme' | 'lang' | '';
  readonly composerTab: ComposerTab;
  readonly composerResponseTab: ComposerResponseTab;
  readonly composer: 'empty' | 'sending' | '';
  readonly collection: 'open' | 'closed';
  readonly collectionRename: string;
  readonly composerHistory: 'open' | '';
  readonly agentPanel: AgentPanelState;
  readonly agentProvider: AgentProviderState;
  readonly agentProviderDialog: AgentProviderDialogState;
  readonly agentProviderDialogMode: AgentProviderDialogMode;
  readonly agentProviderDialogTarget: AgentModelId | '';
  readonly agentModelMenu: 'open' | '';
  readonly agentDefaultModel: AgentDefaultModel;
  readonly agentCurrentModel: AgentCurrentModel;
  readonly agentChat: AgentChatState;
  readonly agentChatTitle: string;
  readonly agentChatDialog: 'rename' | 'delete' | '';
  readonly agentTurnState: AgentTurnState;
  readonly agentChatMenu: 'open' | '';
  readonly agentMessage: string;
  readonly agentUsagePanel: 'open' | '';
  readonly agentExecutionMode: AgentExecutionMode;
  readonly agentToolApproval: AgentToolApprovalState;
  readonly agentToolTrace: AgentToolTraceState;
  readonly agentCheckoutExecutionMode: AgentExecutionMode;
  readonly agentCheckoutToolApproval: AgentToolApprovalState;
  readonly agentDeepSeekProfile: AgentProviderProfileState;
  readonly agentQwenProfile: AgentProviderProfileState;
  readonly agentAddedProfile: AgentProviderProfileState | null;
  readonly agentRemovedModels: readonly AgentModelId[];
  readonly agentRemoveModelTarget: AgentModelId | '';
  readonly agentToolSearch: string;
  readonly agentDisabledTools: readonly string[];
  readonly mcpDisabledTools: readonly string[];
  readonly mcpServerState: McpServerState;
  readonly mcpEndpointAssigned: boolean;
  readonly mcpClientLabel: string;
  readonly mcpClientExecutionMode: AgentExecutionMode;
  readonly mcpClientDialog: McpClientDialogState;
  readonly mcpConfigCopied: boolean;
  readonly mcpCredentialGeneration: number;
  readonly mcpToolApproval: McpToolApprovalState;
  readonly playgroundSection: PlaygroundSection;
  readonly playgroundSelectedTool: string;
  readonly playgroundSelectedScenario: string;
  readonly playgroundRequestDraft: string;
  readonly playgroundCaptureDetailWidth: number;
  readonly playgroundMcpDetailWidth: number;
  readonly playgroundCallState: PlaygroundCallState;
  readonly playgroundManualStatus: PlaygroundManualStatus;
  readonly bodyType: BodyType;
  readonly settings: string;
  readonly update: string;
  readonly githubAuth: string;
  readonly appContainers: string;
  readonly tlsPassthrough: string;
  readonly tlsPatterns: readonly string[] | null;
  readonly tlsHostInput: string;
  readonly tlsPassthroughTargetHost: string;
  readonly tlsPassthroughTargetPattern: string;
  readonly tlsPassthroughTargetSequence: number;
  readonly tlsPassthroughTargetExpires: boolean;
  readonly tlsCompatibility: string;
  readonly tlsCompatibilityHosts: readonly string[] | null;
  readonly https: string;
  readonly mitm: string;
  readonly systemProxy: string;
  readonly upstream: string;
  readonly copy: string;
  readonly transfer: string;
  readonly recording: string;
  readonly fileMenu: string;
  readonly ruleSelect: string;
  readonly requestMenu: string;
  readonly ruleFilter: string;
  readonly ruleOptions: string;
  readonly scene: string;
  readonly bodyPreview: BodyPreview;
  readonly bodyKind: BodyKind;
  readonly bodyMode: BodyMode;
  readonly bodyState: BodyState;
  readonly bodyRuleEffect: BodyRuleEffectState;
  readonly breakpoints: 'on' | 'off';
  readonly breakpointState: BreakpointState;
  readonly breakpointBody: BreakpointBodyState;
  readonly breakpointFile: BreakpointFileState;
  readonly breakpointPanel: 'open' | '';
  readonly breakpointMessage: 'created' | '';
  readonly breakpointUi: BreakpointUiState;
  readonly breakpointQueueSelection: BreakpointQueueSelection;
  readonly breakpointQueueMenu: 'open' | '';
  readonly ruleBreakpointAction: 'visible' | '';
  readonly websocketBreakpoint: WebSocketBreakpointState;
  readonly websocketBreakpointDirection: WebSocketBreakpointDirection;
  readonly websocketBreakpointFrames: readonly WebSocketBreakpointFrame[];
  readonly websocketMessageDirection: WebSocketMessageDirection;
  readonly websocketMessagePayload: WebSocketMessagePayload;
  readonly websocketUpgradeResponse: WebSocketUpgradeResponse;
  readonly ruleTypography: 'composer' | 'current';
  readonly ctxmenu: TreeContextMenu;
  readonly boot: BootPhase;
  readonly hasFilter: boolean;
}

export type DesignStatePatch = Partial<DesignState>;
export type UpdateDesignState = (patch: DesignStatePatch) => void;