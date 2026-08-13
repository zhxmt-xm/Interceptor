export type DesignView = 'capture' | 'rules' | 'composer' | 'settings' | 'diagnostics';
export type DesignTheme = 'warm' | 'light' | 'ember' | 'dark';
export type SidebarState = 'expanded' | 'collapsed';
export type DetailState = 'open' | 'closed';
export type FixtureOverlay =
  | 'https-setup'
  | 'import-export'
  | 'proxy-not-ready'
  | 'body-full'
  | 'app-container-confirm'
  | 'tls-compatibility'
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
export type BreakpointState =
  | 'request'
  | 'response'
  | 'websocket'
  | 'websocket-upgrade-request'
  | 'websocket-upgrade-response'
  | 'queue'
  | 'full'
  | '';
export type BreakpointBodyState = 'loading' | 'ready' | 'replace' | 'file';
export type BreakpointFileState = 'none' | 'valid';
export type BreakpointUiState = 'panel' | 'message' | '';
export type WebSocketBreakpointState = 'disabled' | 'setup' | 'enabled';
export type WebSocketBreakpointDirection = 'both' | 'sent' | 'received';
export type WebSocketBreakpointTimeout = 'none' | '10' | '30' | '60';
export type WebSocketBreakpointFrame = 'message' | 'ping' | 'pong' | 'close';
export type WebSocketMessageDirection = 'sent' | 'received';
export type WebSocketMessagePayload = 'text' | 'binary' | 'ping' | 'pong' | 'close';
export type WebSocketUpgradeResponse = 'accepted' | 'mock-error';
export type TreeContextMenu = 'composer-item' | 'composer-folder' | 'rules-rule' | 'rules-folder' | '';
export type BootPhase = 'core' | 'listener' | 'proxy' | 'ready' | 'error' | '';

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
  readonly bodyType: BodyType;
  readonly settings: string;
  readonly update: string;
  readonly githubAuth: string;
  readonly appContainers: string;
  readonly tlsPassthrough: string;
  readonly tlsPatterns: readonly string[] | null;
  readonly tlsHostInput: string;
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
  readonly breakpoints: 'on' | 'off';
  readonly breakpointState: BreakpointState;
  readonly breakpointBody: BreakpointBodyState;
  readonly breakpointFile: BreakpointFileState;
  readonly breakpointPanel: 'open' | '';
  readonly breakpointMessage: 'created' | '';
  readonly breakpointUi: BreakpointUiState;
  readonly websocketBreakpoint: WebSocketBreakpointState;
  readonly websocketBreakpointDirection: WebSocketBreakpointDirection;
  readonly websocketBreakpointTimeout: WebSocketBreakpointTimeout;
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