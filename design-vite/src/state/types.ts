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
export type BreakpointState = 'request' | 'response' | 'queue' | 'full' | '';
export type BreakpointBodyState = 'loading' | 'ready' | 'replace' | 'file' | 'invalid';
export type BreakpointFileState = 'none' | 'valid' | 'invalid';
export type BreakpointUiState = 'panel' | 'armed' | '';
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
  readonly repair: string;
  readonly update: string;
  readonly githubAuth: string;
  readonly appContainers: string;
  readonly tlsPassthrough: string;
  readonly tlsPatterns: readonly string[] | null;
  readonly tlsRestart: string;
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
  readonly breakpointNotice: 'armed' | '';
  readonly breakpointUi: BreakpointUiState;
  readonly ruleTypography: 'composer' | 'current';
  readonly ctxmenu: TreeContextMenu;
  readonly boot: BootPhase;
  readonly hasFilter: boolean;
}

export type DesignStatePatch = Partial<DesignState>;
export type UpdateDesignState = (patch: DesignStatePatch) => void;