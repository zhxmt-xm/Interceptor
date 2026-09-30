// Each case declares design state, real Renderer navigation/actions, and comparison targets.
import { describeReadonlyBody, padReadonlyText } from '../../../../design-vite/src/fixtures/readonlyBodyData.ts';

export const viewport = { width: 1600, height: 900 };
export const designShotsDir = 'design-vite/shots';

const GRPC_LONG_MESSAGE = 'catalog-stream-4281\n' + JSON.stringify({
  requestId: 'catalog-stream-4281',
  region: 'ap-east-1',
  products: Array.from({ length: 18 }, (_, index) => ({
    id: `sku-${1042 + index}`,
    name: `Wireless keyboard ${index + 1}`,
    price: 89.9,
    currency: 'USD',
    available: true,
  })),
  nextPageToken: '',
}, null, 2);

const EXPAND_RULE_TREE_ACTIONS = [
  { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
  { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
  { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
  { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
];

const RULE_SET_APPLIED_TARGETS = [
  {
    name: 'Rule set applied',
    designSelector: '.sv[data-v="rules"] > .g:first-child',
    appSelector: 'div:has(> [data-automation-id="rules.status.state"])',
  },
  {
    name: 'Applied state dot',
    designSelector: '.sv[data-v="rules"] > .g:first-child > .gd',
    appSelector: 'div:has(> [data-automation-id="rules.status.state"]) > span:first-child',
    styleKeys: ['backgroundColor', 'borderRadius'],
  },
];

const HTTPS_SETUP_TITLE_TARGET = {
  name: 'Decrypt HTTPS (MITM)',
  designSelector: '.dlghead > b:text-is("Decrypt HTTPS (MITM)")',
  appSelector: '#https-decryption-title',
  measureText: true,
};

const TLS_PASSTHROUGH_VALUE_TARGET = {
  name: 'TLS passthrough',
  designSelector: 'span:text-is("TLS passthrough")',
  appSelector: 'code:text-is("TLS passthrough")',
  measureText: true,
};

const TLS_TUNNEL_NOTICE_TITLE_TARGET = {
  name: 'HTTPS content is encrypted',
  designSelector: '.tunnel-copy > b',
  appSelector: 'b:text-is("HTTPS content is encrypted")',
  measureText: true,
};

const WEBSOCKET_DIRECTION_TARGETS = [
  {
    name: 'Message direction group',
    designSelector: '.wsbar > .seg',
    appSelector: '[role="radiogroup"]:has([data-automation-id="capture.websocket.direction.all"])',
    styleKeys: ['gap', 'padding', 'borderRadius'],
  },
  {
    name: 'All messages label',
    designSelector: '.wsbar > .seg > :text-is("All")',
    appSelector: '[data-automation-id="capture.websocket.direction.all"]',
    measureText: true,
  },
];

const OPEN_RUNTIME_PROXY_READINESS_ACTIONS = [
  { type: 'clickText', text: 'Proxy & Listener' },
  { type: 'clickRole', role: 'button', name: 'Restore' },
  { type: 'clickRole', role: 'button', name: 'Capture' },
  { type: 'clickRole', role: 'button', name: 'Recording' },
  { type: 'clickRole', role: 'button', name: 'Paused' },
];

const TLS_COMPATIBILITY_EVENTS = [
  {
    generation: 3,
    host: 'rdweb.wvd.microsoft.com',
    reason: 'closed',
    timestamp: 1_000,
  },
  {
    generation: 3,
    host: 'windows365.microsoft.com',
    reason: 'closed',
    timestamp: 2_000,
  },
  {
    generation: 3,
    host: 'afdfp-rdgateway-r0.wvd.microsoft.com',
    reason: 'cert-rejected',
    timestamp: 3_000,
  },
];

const RULES_IMPORT_TARGETS = [
  {
    name: 'Import header',
    designSelector: '.importHeader',
    appSelector: '[data-automation-id="rules.import.dialog"] > header',
  },
  {
    name: 'Import file name',
    designSelector: '.importFileName',
    appSelector: '[data-automation-id="rules.import.file-name"]',
  },
  ...[
    ['Rules count', 1, 'rules.import.rule-count'],
    ['Folders count', 2, 'rules.import.folder-count'],
    ['Enabled count', 3, 'rules.import.enabled-count'],
    ['Skipped count', 4, 'rules.import.skipped-count'],
  ].map(([name, index, automationId]) => ({
    name,
    designSelector: `.importStat:nth-child(${index}) strong`,
    appSelector: `[data-automation-id="${automationId}"]`,
  })),
  {
    name: 'Skipped list',
    designSelector: '.importSkippedList',
    appSelector: '[data-automation-id="rules.import.skipped-list"]',
  },
  'Cancel',
  'Import 6 rules',
];

const COMPOSER_IMPORT_TARGETS = [
  {
    name: 'Import header',
    designSelector: '.collectionImportHeader',
    appSelector: '[data-automation-id="composer.import.dialog"] > header',
  },
  {
    name: 'Import file name',
    designSelector: '.collectionImportFileName',
    appSelector: '[data-automation-id="composer.import.file-name"]',
  },
  ...[
    ['Requests count', 1, 'composer.import.request-count'],
    ['Folders count', 2, 'composer.import.folder-count'],
    ['Skipped count', 3, 'composer.import.skipped-count'],
  ].map(([name, index, automationId]) => ({
    name,
    designSelector: `.collectionImportStat:nth-child(${index}) strong`,
    appSelector: `[data-automation-id="${automationId}"]`,
  })),
  {
    name: 'Skipped list',
    designSelector: '.collectionImportSkippedList',
    appSelector: '[data-automation-id="composer.import.skipped-list"]',
  },
  'Cancel',
  'Import 9 requests',
];

const INSPECTOR_METHOD_TARGET = {
  name: 'Inspector method',
  parity: 'capture-inspector-method',
  styleKeys: ['fontSize', 'fontWeight', 'color', 'backgroundColor', 'borderRadius'],
};

const SETTINGS_PROXY_TARGETS = [
  'Local listener, operating-system routing, ownership and guarded recovery.',
  'Owned',
  'Listener',
  'Listening',
  'Address',
  {
    name: 'Listener address',
    designSelector: '.srow:has(.scap > b:text-is("Address")) .mono2',
    appSelector: 'div:has(> div > b:text-is("Address")) > div > span:text-is("127.0.0.1:8888")',
  },
  'System Proxy',
  'Owned by Interceptor',
  'Current configuration',
  'Bypass',
  'PAC / Auto detect',
  'Recovery',
  'Protected',
];

const CAPTURE_FILTER_CLEAR_TARGETS = [
  {
    name: 'Filter clear all',
    designSelector: '.cfilters-clear',
    appSelector: '[data-parity="capture-filter-clear-all"] button',
    styleKeys: ['color', 'backgroundColor', 'borderTopWidth', 'borderRadius', 'opacity'],
  },
  {
    name: 'Filter clear icon',
    designSelector: '.cfilters-clear > svg',
    appSelector: '[data-parity="capture-filter-clear-all"] button > svg',
    styleKeys: ['color'],
  },
];

const INITIAL_VIEWS = ['light', 'dark'].map((theme) => ({
    id: theme === 'dark' ? 'capture-dark' : 'capture',
    theme,
    mitmActive: false,
    designState: { view: 'capture', theme, sidebar: 'expanded', detail: 'open' },
    designShot: `${theme}/capture/inspector-sidebar-expanded.png`,
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: '/user', index: 0 },
    ],
    targets: [
      'Capture',
      'Rules & Map',
      'Composer',
      {
        name: 'Breakpoint toolbar button',
        designSelector: '.breakctl',
        appSelector: '[data-automation-id="capture.breakpoint-manager"]',
        styleKeys: ['color', 'backgroundColor', 'borderTopWidth', 'borderRadius', 'opacity'],
      },
      {
        name: 'Breakpoint toolbar icon',
        designSelector: '.breakctl > svg',
        appSelector: '[data-automation-id="capture.breakpoint-manager"] > svg',
        styleKeys: ['color'],
      },
      'Diagnostics',
      'Local traffic',
      'Settings',
      'Theme',
      INSPECTOR_METHOD_TARGET,
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector client app', parity: 'capture-inspector-client-app' },
      {
        name: 'General method value',
        designSelector: '.kv > .k:text-is("Request Method") + .v',
        appSelector: 'span:text-is("Request Method") + span',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor'],
      },
      { name: 'Filter panel', parity: 'capture-filter-panel' },
      { name: 'Filter groups', parity: 'capture-filter-groups' },
      { name: 'Filter item all', parity: 'capture-filter-item-all' },
      { name: 'Filter item', parity: 'capture-filter-item' },
      {
        name: 'Filter search',
        designSelector: '.listbar-search .omni',
        appSelector: 'div:has(> input[data-parity="capture-filter-search-value"])',
        styleKeys: ['borderTopWidth', 'borderRadius', 'backgroundColor'],
      },
      ...CAPTURE_FILTER_CLEAR_TARGETS,
      { name: 'List app header', parity: 'capture-list-app-header' },
      { name: 'List app cell', parity: 'capture-list-app-cell' },
      { name: 'List app cell unknown', parity: 'capture-list-app-cell-unknown' },
      { name: 'List path cell', parity: 'capture-list-path-cell' },
      { name: 'List host cell', parity: 'capture-list-host-cell' },
      { name: 'List status header', parity: 'capture-list-status-header' },
      { name: 'List status cell', parity: 'capture-list-status-cell' },
      { name: 'List protocol header', parity: 'capture-list-proto-header' },
      { name: 'List protocol cell', parity: 'capture-list-proto-cell' },
      { name: 'List type header', parity: 'capture-list-type-header' },
      { name: 'List type cell', parity: 'capture-list-type-cell' },
      { name: 'List size header', parity: 'capture-list-size-header' },
      { name: 'List size cell', parity: 'capture-list-size-cell' },
      { name: 'List time header', parity: 'capture-list-time-header' },
      { name: 'List time cell', parity: 'capture-list-time-cell' },
      {
        name: 'Status endpoint',
        designSelector: '.capture-endpoint',
        appSelector: '[data-parity="capture-status-endpoint"]',
      },
      {
        name: 'Status passthrough',
        designSelector: '.capture-passthrough',
        appSelector: '[data-parity="capture-status-passthrough"]',
      },
      'Rule replaced',
      'Rule set',
      'Rule appended',
      'Rule removed',
      'Recording',
    ],
}));

const BREAKPOINT_FILE_BY_PHASE = {
  request: {
    path: 'C:\\parity\\checkout-body.txt',
    name: 'checkout-body.txt',
    size: 51,
    mediaType: 'text/plain',
    preview: { bytes: Array.from(new TextEncoder().encode('{\n  "cartId": "c_9f83a1",\n  "coupon": "WELCOME20"\n}')), truncated: false },
  },
  response: {
    path: 'C:\\parity\\token-response.json',
    name: 'token-response.json',
    size: 2_458,
    mediaType: 'application/json',
    preview: { bytes: Array.from(new TextEncoder().encode(padReadonlyText('{\n  "access_token": "eyJhbGci…",\n  "expires_in": 3600\n}', 2458))), truncated: false },
  },
};

const HTTP_BREAKPOINT_VARIANTS = [
  { variant: 'request-paused', phase: 'request', body: 'loading' },
  { variant: 'request-body-loading', phase: 'request', body: 'loading' },
  { variant: 'request-body-loaded', phase: 'request', body: 'ready' },
  { variant: 'request-body-replace', phase: 'request', body: 'replace' },
  { variant: 'request-body-file-empty', phase: 'request', body: 'file-empty' },
  { variant: 'request-body-file', phase: 'request', body: 'file' },
  { variant: 'response-paused', phase: 'response', body: 'loading' },
  { variant: 'response-body-loaded', phase: 'response', body: 'ready' },
  { variant: 'response-body-replace', phase: 'response', body: 'replace' },
  { variant: 'response-body-file-empty', phase: 'response', body: 'file-empty' },
  { variant: 'response-body-file', phase: 'response', body: 'file' },
];

function httpBreakpointView(theme, { variant, phase, body }) {
  const darkSuffix = theme === 'dark' ? '-dark' : '';
  const isResponse = phase === 'response';
  const designBody = body === 'file-empty' || body === 'file' ? 'file' : body;
  const rendererActions = [
    { type: 'clickText', text: isResponse ? '/v1/token' : '/checkout' },
  ];
  if (body === 'replace') {
    rendererActions.push({ type: 'clickRole', role: 'radio', name: 'Text' });
  }
  if (body === 'file-empty' || body === 'file') {
    rendererActions.push({ type: 'clickRole', role: 'radio', name: 'File' });
  }
  if (body === 'file') {
    rendererActions.push({ type: 'clickRole', role: 'button', name: 'Choose file…' });
  }

  const targets = [
    isResponse ? 'Response paused' : 'Request paused',
    ...(isResponse ? [{
      name: 'Response status input',
      designSelector: 'input[aria-label="Response status"]',
      appSelector: 'input[aria-label="Response status"]',
    }] : []),
    isResponse ? 'Response headers' : 'Request headers',
    {
      name: 'Header name input',
      designSelector: '.headerFieldsEditorRows input[aria-label="Header name"]',
      appSelector: 'input[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]',
    },
    {
      name: 'Header value input',
      designSelector: '.headerFieldsEditorRows input[aria-label="Header value"]',
      appSelector: 'input[data-automation-id^="breakpoints.header."][data-automation-id$=".value"]',
    },
    'Original body',
    ...(body !== 'loading' ? [{
      name: 'Original body ready',
      parity: 'breakpoint-original-ready',
      styleKeys: ['borderTopWidth', 'borderRadius', 'backgroundColor'],
    }] : []),
    'Replacement body',
    body === 'file' ? 'Using file' : 'Using original',
    ...(body === 'loading'
      ? [isResponse ? 'Receiving response body…' : 'Receiving request body…']
      : []),
    ...(body === 'replace'
      ? [{
          name: 'Replacement body editor',
          designSelector: 'textarea[aria-label="Replacement body"]',
          appSelector: 'textarea[aria-label="Replacement body"]',
        }]
      : []),
    ...(body === 'file-empty' ? ['Choose file…'] : []),
    ...(body === 'file' ? [
      BREAKPOINT_FILE_BY_PHASE[phase].name,
      {
        name: 'Short file preview',
        designSelector: '[data-remainder-preview="file"] [data-monaco]',
        appSelector: '[data-automation-id="breakpoints.file.preview"]',
        styleKeys: ['borderTopWidth', 'borderBottomWidth', 'borderRadius', 'backgroundColor'],
      },
      {
        name: 'Short file first line',
        designSelector: '[data-remainder-preview="file"] .view-line:first-child',
        appSelector: '[data-automation-id="breakpoints.file.preview"] .view-line:first-child',
        styleKeys: ['fontSize', 'lineHeight'],
      },
    ] : []),
    isResponse ? 'Rule appended' : 'Rule set',
    'Drop',
    'Continue',
    'Forward edited',
  ];

  return {
    id: variant === 'request-body-loaded' && theme === 'light'
      ? 'breakpoints'
      : `breakpoint-${variant}${darkSuffix}`,
    theme,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      overlay: '',
      detail: 'open',
      breakpoints: 'on',
      breakpointState: phase,
      breakpointBody: designBody,
      breakpointFile: body === 'file' ? 'valid' : 'none',
    },
    designShot: `${theme}/capture/breakpoint-${variant}.png`,
    pausedBreakpoints: true,
    pausedBreakpointPhase: phase,
    breakpointBodyState: `${phase}-${body === 'loading' ? 'loading' : 'ready'}`,
    breakpointFile: body === 'file' ? BREAKPOINT_FILE_BY_PHASE[phase] : null,
    rendererActions,
    targets,
  };
}

const HTTP_BREAKPOINT_VIEWS = ['light', 'dark'].flatMap((theme) =>
  HTTP_BREAKPOINT_VARIANTS.map((variant) => httpBreakpointView(theme, variant)));

const readonlyText = describeReadonlyBody('long', 'none').text;
const HTTP_READONLY_BODY_VIEWS = ['light', 'dark'].flatMap((theme) => [
  ['original-long', 'original', 'none'],
  ['file-long', 'file', 'none'],
  ['text-long', 'text', 'none'],
  ['file-manual', 'file', 'manual-format'],
  ['file-truncated', 'file', 'truncated'],
  ['file-image-limit', 'file', 'image-limit'],
].map(([variant, mode, notice]) => {
  const designActions = [];
  const rendererActions = [{ type: 'clickText', text: '/checkout' }];
  if (mode === 'original') {
    rendererActions.push({
      type: 'assertSelectorVisible',
      selector: '[data-parity="breakpoint-original-ready"] .view-line:nth-child(2) span:text-is("\\"cartId\\"")',
    });
  }
  if (mode !== 'original') {
    designActions.push({ type: 'clickSelector', selector: '.payloadEditor > .collapsibleSection:first-child [role="button"]' });
    rendererActions.push({ type: 'clickSelector', selector: 'button:has(> span:text-is("Original body"))' });
    const select = { type: 'clickRole', role: 'radio', name: mode === 'file' ? 'File' : 'Text' };
    designActions.push(select);
    rendererActions.push(select);
    if (mode === 'file') {
      const choose = { type: 'clickRole', role: 'button', name: 'Choose file…' };
      designActions.push(choose);
      rendererActions.push(choose);
    } else {
      const edit = [
        { type: 'fillLabel', label: 'Replacement body', value: readonlyText },
        ...['ControlOrMeta+End', 'End', 'ArrowRight'].map((key) => ({ type: 'pressLabel', label: 'Replacement body', key })),
        { type: 'typeLabel', label: 'Replacement body', value: '\ncomplete-text-kept-after-preview-end' },
      ];
      designActions.push(...edit);
      rendererActions.push(...edit);
    }
  }
  const file = mode === 'file';
  const image = notice === 'image-limit';
  const targets = [
    'Request paused',
    'Original body',
    'Replacement body',
    'Drop',
    'Continue',
    'Forward edited',
    ...(mode === 'original' ? [{
      name: 'Original JSON key highlighting',
      designSelector: '[data-remainder-preview="original"] .view-line:nth-child(2) span:text-is("\\"cartId\\"")',
      appSelector: '[data-parity="breakpoint-original-ready"] .view-line:nth-child(2) span:text-is("\\"cartId\\"")',
      styleKeys: ['fontSize', 'color'],
    }] : []),
    ...(mode === 'text' ? [{
      name: 'Full Text explanation',
      designSelector: '.payloadEditorCandidateNotice',
      appSelector: 'section:has(textarea[data-automation-id="breakpoints.body"]) > div:has(> svg)',
      styleKeys: ['fontSize', 'lineHeight', 'padding', 'gap', 'backgroundColor'],
    }, {
      name: 'Complete Text input',
      designSelector: 'textarea[aria-label="Replacement body"]:visible',
      appSelector: 'textarea[aria-label="Replacement body"]:visible',
    }] : [{
      name: file ? 'File preview' : 'Original preview',
      designSelector: image ? '.bodyRemainderImageLimit' : `[data-remainder-preview="${file ? 'file' : 'original'}"] [data-monaco]`,
      appSelector: image ? '[data-automation-id="breakpoints.file.selected"] > div:last-child'
        : file ? '[data-automation-id="breakpoints.file.preview"]'
          : '[data-parity="breakpoint-original-ready"] [data-parity="capture-body-preview"]',
      styleKeys: ['borderTopWidth', 'borderBottomWidth', 'borderRadius', 'backgroundColor'],
    }, ...image ? [] : [{
      name: file ? 'File first line' : 'Original first line',
      designSelector: `[data-remainder-preview="${file ? 'file' : 'original'}"] .view-line:first-child`,
      appSelector: file ? '[data-automation-id="breakpoints.file.preview"] .view-line:first-child'
        : '[data-parity="breakpoint-original-ready"] .view-line:first-child',
      styleKeys: ['fontSize', 'lineHeight'],
    }]]),
    ...(file && !image ? [{
      name: 'Complete file explanation',
      designSelector: '.bodyRemainderFileNote',
      appSelector: '[data-automation-id="breakpoints.file.selected"] p:first-child',
      styleKeys: ['fontSize', 'lineHeight', 'padding', 'color'],
    }] : []),
    ...(notice === 'manual-format' || notice === 'truncated' ? [{
      name: 'File format notice',
      designSelector: '[data-remainder-preview="file"] .bodyRemainderNotice',
      appSelector: 'div:has(> [data-automation-id="breakpoints.file.format"])',
      styleKeys: ['fontSize', 'lineHeight', 'padding', 'gap', 'backgroundColor'],
    }] : []),
  ];
  return {
    id: `breakpoint-readonly-${variant}${theme === 'dark' ? '-dark' : ''}`,
    theme,
    freshDesign: true,
    pausedBreakpoints: true,
    pausedBreakpointPhase: 'request',
    breakpointBodyState: 'request-ready',
    readonlyData: { sample: 'long', notice },
    designState: {
      view: 'capture', theme, sidebar: 'collapsed', detail: 'open', overlay: '', scene: 'http',
      breakpointState: 'request', breakpointBody: 'ready', breakpointFile: 'none',
      bodyRemainderSample: 'long', bodyRemainderNotice: notice,
    },
    designShot: `${theme}/capture/breakpoint-request-${variant}.png`,
    designActions,
    rendererActions,
    targets,
  };
}));

const BREAKPOINT_QUEUE_VIEWS = ['light', 'dark'].flatMap((theme) => {
  const darkSuffix = theme === 'dark' ? '-dark' : '';
  const baseDesignState = {
    view: 'capture',
    theme,
    sidebar: 'collapsed',
    overlay: '',
    breakpoints: 'on',
  };
  return [
    {
      id: `breakpoint-queue-head${darkSuffix}`,
      theme,
      designState: {
        ...baseDesignState,
        detail: 'open',
        breakpointState: 'queue',
        breakpointBody: 'loading',
        breakpointQueueSelection: 'http-head',
      },
      designShot: `${theme}/capture/breakpoint-queue-head.png`,
      pausedBreakpoints: true,
      breakpointBodyState: 'request-loading',
      rendererActions: [{ type: 'clickText', text: '/checkout' }],
      targets: [
        {
          name: 'Paused queue status',
          designSelector: '.break-status-count',
          appSelector: '[data-parity="capture-status-breakpoints"]',
        },
        {
          name: 'Queue actions trigger',
          designSelector: 'button[aria-label="Queue actions"]',
          appSelector: '[data-automation-id="breakpoints.queue-menu"]',
        },
      ],
    },
    {
      id: `breakpoint-queue-queued${darkSuffix}`,
      theme,
      designState: {
        ...baseDesignState,
        detail: 'open',
        breakpointState: 'queue',
        breakpointQueueSelection: 'http-queued',
      },
      designShot: `${theme}/capture/breakpoint-queue-queued.png`,
      pausedBreakpoints: true,
      rendererActions: [{ type: 'clickText', text: '/v1/token' }],
      targets: [
        { name: 'Queued detail status', parity: 'breakpoint-queued-banner' },
        { name: 'Queued state', parity: 'breakpoint-queued-state' },
        { name: 'Queued position', parity: 'breakpoint-queued-position' },
      ],
    },
    {
      id: `breakpoint-queue-menu${darkSuffix}`,
      theme,
      designState: {
        ...baseDesignState,
        detail: 'open',
        breakpointState: 'queue',
        breakpointQueueSelection: 'http-head',
      },
      designShot: `${theme}/capture/breakpoint-queue-menu.png`,
      pausedBreakpoints: true,
      designActions: [
        { type: 'clickRole', role: 'button', name: 'Queue actions' },
      ],
      rendererActions: [
        { type: 'clickText', text: '/checkout' },
        { type: 'clickAutomation', automationId: 'breakpoints.queue-menu' },
      ],
      targets: [
        {
          name: 'Queue actions menu',
          designSelector: '.ant-dropdown:visible .ant-dropdown-menu',
          appSelector: '.ant-dropdown:visible .ant-dropdown-menu',
        },
        { name: 'Continue all', parity: 'breakpoint-queue-continue' },
        { name: 'Drop all', parity: 'breakpoint-queue-drop' },
        { name: 'Continue all from this rule', parity: 'breakpoint-queue-continue-rule' },
      ],
    },
  ];
});

export const views = [
  ...['light', 'dark', 'warm', 'ember'].flatMap(theme => [
    ...[false, true].map(resized => ({
      id: `capture-message-grpc-${theme}${resized ? '-resized' : ''}`,
      theme,
      mitmActive: false,
      grpcMessageSource: GRPC_LONG_MESSAGE,
      designState: {
        view: 'capture', theme, sidebar: 'collapsed', overlay: '', detail: 'open',
        scene: 'grpc', tab: 'grpc', grpcMessageSource: GRPC_LONG_MESSAGE,
      },
      designShot: `${theme}/capture/inspector-grpc-long-text${resized ? '-resized' : ''}.png`,
      designActions: [
        { type: 'clickRole', role: 'radio', name: 'Text' },
        ...(resized ? [{ type: 'resizeVertical', selector: '.grpcpayload [data-monaco]', delta: -120 }] : []),
      ],
      rendererActions: [
        { type: 'clickText', text: '/orders.v1.OrderService/Watch' },
        { type: 'clickText', text: 'Messages' },
        { type: 'clickText', text: 'Message 2' },
        { type: 'clickAutomation', automationId: 'capture.inspector.body-mode.default' },
        ...(resized ? [{ type: 'resizeVertical', selector: '[data-automation-id="capture.inspector.body-pane"]', delta: -120 }] : []),
      ],
      targets: [
        { name: 'Capture header', parity: 'window-header-title', measureText: true },
        'Messages', 'Message 2', 'Response message 2',
        {
          name: 'Body toolbar',
          designSelector: '.grpcpayload .bodyViewerToolbar',
          appSelector: '[data-automation-id="capture.inspector.body-view"] > :first-child',
        },
        {
          name: 'Message pane',
          designSelector: '.grpcpayload [data-monaco]',
          appSelector: '[data-automation-id="capture.inspector.body-pane"]',
          styleKeys: ['borderTopWidth', 'borderRadius', 'backgroundColor', 'resize'],
        },
        {
          name: 'Message first line',
          designSelector: '.grpcpayload [data-monaco] .view-lines > :first-child',
          appSelector: '[data-automation-id="capture.inspector.body-pane"] .view-lines > :first-child',
        },
      ],
    })),
    {
      id: `capture-message-websocket-${theme}`,
      theme,
      mitmActive: false,
      designState: {
        view: 'capture', theme, sidebar: 'collapsed', overlay: '', detail: 'open',
        scene: 'websocket', tab: 'messages',
      },
      designShot: `${theme}/capture/inspector-websocket.png`,
      rendererActions: [
        { type: 'clickText', text: '/socket' },
        { type: 'clickText', text: 'Messages' },
        { type: 'clickText', text: '{"buildId":8431,"state":"running","branch":"main"}' },
      ],
      targets: [
        { name: 'Capture header', parity: 'window-header-title', measureText: true },
        'Messages', 'Received text',
        {
          name: 'Body toolbar',
          designSelector: '.wspayload .bodyViewerToolbar',
          appSelector: '[data-automation-id="capture.inspector.body-view"] > :first-child',
        },
        {
          name: 'Message pane',
          designSelector: '.wspayload [data-monaco]',
          appSelector: '[data-automation-id="capture.inspector.body-pane"]',
          styleKeys: ['borderTopWidth', 'borderRadius', 'backgroundColor', 'resize'],
        },
        {
          name: 'Message first line',
          designSelector: '.wspayload [data-monaco] .view-lines > :first-child',
          appSelector: '[data-automation-id="capture.inspector.body-pane"] .view-lines > :first-child',
        },
      ],
    },
  ]),
  ...INITIAL_VIEWS,
  ...['light', 'dark'].flatMap((theme) => {
    const suffix = theme === 'dark' ? '-dark' : '';
    return [
      {
        id: `agent-panel-unconfigured${suffix}`,
        theme,
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'unconfigured',
        },
        designShot: `${theme}/agent-models/panel-unconfigured.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent unconfigured state', parity: 'agent-panel-unconfigured' },
          { name: 'Agent unconfigured icon', parity: 'agent-unconfigured-icon' },
          {
            name: 'Configure Agent button',
            designSelector: '.agentPanelUnconfigured button',
            appSelector: '[data-automation-id="agent.configure"]',
          },
          'Connect a model to start',
          'Add a hosted provider or connect an OpenAI-compatible local model.',
          'Configure Agent',
        ],
      },
      {
        id: `agent-panel-chat${suffix}`,
        theme,
        agentModels: 'configured',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
        },
        designShot: `${theme}/agent-panel/capture-open.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent transcript', parity: 'agent-transcript' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent model selector', parity: 'agent-model-select' },
          { name: 'Agent Context usage', parity: 'agent-context-usage' },
          {
            name: 'Chat selector',
            designSelector: '.agentChatSelector',
            appSelector: '[data-automation-id="agent.chat.selector"]',
          },
          'Help me diagnose repeated 401 responses after token refresh.',
        ],
      },
      {
        id: `agent-panel-capture-tools${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'capture',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
          agentToolTrace: 'capture',
        },
        designShot: `${theme}/agent-models/panel-capture-tools.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'First Tool Call', appSelector: '[data-tool-call-id="call-discover"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'Storage Tool Call', appSelector: '[data-tool-call-id="call-storage"]', designSelector: '[data-tool-name="capture_get_storage_status"]' },
          { name: 'Last Tool Call', appSelector: '[data-tool-call-id="call-detail"]', designSelector: '[data-tool-name="capture_get_exchange"]' },
          'Inspect Capture storage and the latest captured request, then summarize their status.',
          'Capture storage is non-empty. The latest exchange is GET /agent-e2e/traffic with status 200.',
        ],
      },
      {
        id: `agent-panel-body-message-tools${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'body-messages',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
          agentToolTrace: 'body-messages',
        },
        designShot: `${theme}/agent-models/panel-body-message-tools.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'First Tool Call', appSelector: '[data-tool-call-id="call-discover-body-messages"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'Body Tool Call', appSelector: '[data-tool-call-id="call-body"]', designSelector: '[data-tool-name="capture_get_exchange_body"]' },
          { name: 'WebSocket Tool Call', appSelector: '[data-tool-call-id="call-ws"]', designSelector: '[data-tool-name="capture_list_websocket_messages"]' },
          { name: 'gRPC Tool Call', appSelector: '[data-tool-call-id="call-grpc"]', designSelector: '[data-tool-name="capture_list_grpc_messages"]' },
          'Read the JSON response body, WebSocket messages, and gRPC response messages.',
          'The JSON body is ready. WebSocket has 2 messages, and the gRPC response contains 1 message.',
        ],
      },
      {
        id: `agent-panel-breakpoint-tools${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'breakpoints',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
          agentExecutionMode: 'auto',
          agentToolTrace: 'breakpoints',
        },
        designShot: `${theme}/agent-models/panel-breakpoint-tools.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Breakpoints discovery', appSelector: '[data-tool-call-id="call-discover-breakpoints"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'Pending list', appSelector: '[data-tool-call-id="call-list-breakpoints"]', designSelector: '[data-tool-name="breakpoints_list"]' },
          { name: 'HTTP disable', appSelector: '[data-tool-call-id="call-disable-http-breakpoints"]', designSelector: '[data-tool-name="breakpoints_disable_http"]' },
          { name: 'HTTP enable', appSelector: '[data-tool-call-id="call-enable-http-breakpoints"]', designSelector: '[data-tool-name="breakpoints_enable_http"]' },
          { name: 'Breakpoint resolution', appSelector: '[data-tool-call-id="call-continue-breakpoint"]', designSelector: '[data-tool-name="breakpoints_continue"]' },
          'Inspect the waiting request, verify HTTP Breakpoint controls, then continue it.',
          'One request was waiting. HTTP Breakpoints were verified and bp-agent-request continued.',
        ],
      },
      {
        id: `agent-panel-composer-tools${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'composer',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
          agentExecutionMode: 'auto',
          agentToolTrace: 'composer',
          agentToolApproval: 'allowed',
          agentToolApprovalName: 'composer_send_request',
        },
        designShot: `${theme}/agent-models/panel-composer-tools.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent Composer result', parity: 'agent-tool-approval' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Composer discovery', appSelector: '[data-tool-call-id="call-discover-composer"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'TLS probe success', appSelector: '[data-tool-call-id="call-probe-success"]', designSelector: '[data-tool-name="composer_probe_connection"]:nth-of-type(2)' },
          { name: 'TLS probe failure', appSelector: '[data-tool-call-id="call-probe-failure"]', designSelector: '[data-tool-name="composer_probe_connection"]:nth-of-type(3)' },
          'Send the approved request and probe the local TLS endpoint.',
          'The request returned 201. TLS negotiated h2 with one certificate.',
        ],
      },
      {
        id: `collection-tools-query${suffix}`,
        theme,
        rendererNav: 'Composer',
        agentModels: 'configured',
        agentSessionState: 'collection',
        designState: { view: 'composer', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured', agentToolTrace: 'collection' },
        designShot: `${theme}/agent-models/panel-collection-tools.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
          { type: 'clickText', text: 'Create repo' },
          { type: 'clickRole', role: 'button', name: 'Send' },
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Collection activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Collection discovery', appSelector: '[data-tool-call-id="collection-discover"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'Collection query', appSelector: '[data-tool-call-id="collection-get"]', designSelector: '[data-tool-name="composer_get_collection"]' },
          'Inspect the saved request Collection without sending any request.',
          'Revision 3 contains 2 requests in 1 folder.',
        ],
      },
      ...['pending', 'allowed'].map((approval) => ({
        id: `collection-tools-${approval}${suffix}`, theme, agentModels: 'configured',
        agentSessionState: `collection-replace-${approval}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: approval, agentToolApprovalName: 'composer_replace_collection', agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-collection-${approval}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Collection approval', parity: 'agent-tool-approval' },
          'composer_replace_collection',
          { name: 'Collection result or effect',
            designSelector: approval === 'pending' ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd' : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: approval === 'pending' ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd' : '[data-automation-id="agent.tools.result.collection-replace"] > span',
          },
        ],
      })),
      {
        id: `settings-tools-query${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'settings',
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open',
          agentProvider: 'configured', agentChat: 'checkout', agentExecutionMode: 'ask', agentToolTrace: 'settings',
        },
        designShot: `${theme}/agent-models/panel-settings-tools.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Settings discovery', appSelector: '[data-tool-call-id="settings-discover"]', designSelector: '[data-tool-name="discover_tools"]' },
          ...[
            'settings_get_core_process_status', 'settings_get_system_proxy_status',
            'settings_get_certificate_status', 'settings_get_tls_insecure_hosts',
            'settings_get_tls_passthrough', 'settings_list_app_containers',
          ].map((name) => ({
            name, appSelector: `[data-tool-call-id="${name}"]`, designSelector: `[data-tool-name="${name}"]`,
          })),
          'Inspect the six Settings states without changing any configuration.',
          'The six Settings queries completed without changes.',
        ],
      },
      {
        id: `agent-panel-diagnostics-tools${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'diagnostics',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
          agentExecutionMode: 'ask',
          agentToolTrace: 'diagnostics',
        },
        designShot: `${theme}/agent-models/panel-diagnostics-tools.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent panel header', parity: 'agent-panel-header' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Diagnostics discovery', appSelector: '[data-tool-call-id="diagnostics-discover"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'Diagnostics query', appSelector: '[data-tool-call-id="diagnostics-query"]', designSelector: '[data-tool-name="diagnostics_query"]' },
          { name: 'Diagnostics result', appSelector: '[data-summary-kind="diagnostics"]', designSelector: '[data-tool-name="diagnostics_query"] div > span:last-child' },
          { name: 'Recent query', appSelector: '[data-tool-call-id="diagnostics-recent"]', designSelector: '[data-tool-name="diagnostics_get_recent"]' },
          { name: 'Recent result', appSelector: '[data-automation-id="agent.tools.result.diagnostics-recent"]', designSelector: '[data-tool-name="diagnostics_get_recent"] div > span:last-child' },
          { name: 'Trace query', appSelector: '[data-tool-call-id="diagnostics-trace"]', designSelector: '[data-tool-name="diagnostics_get_trace"]' },
          { name: 'Trace result', appSelector: '[data-automation-id="agent.tools.result.diagnostics-trace"]', designSelector: '[data-tool-name="diagnostics_get_trace"] div > span:last-child' },
          'Inspect successful Composer diagnostics without exposing request secrets.',
          'Four successful Composer diagnostic records are available in newest-first order.',
        ],
      },
      {
        id: `agent-panel-rules-tools${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'rules',
        designState: {
          view: 'rules',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
          agentToolTrace: 'rules',
        },
        designShot: `${theme}/agent-models/panel-rules-tools.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'shell.workspace.rules' },
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Rules discovery', appSelector: '[data-tool-call-id="call-discover-rules"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'Rule tree result', appSelector: '[data-tool-call-id="call-get-rules"]', designSelector: '[data-tool-name="rules_get_tree"]' },
          { name: 'Rule hits result', appSelector: '[data-tool-call-id="call-get-rule-hits"]', designSelector: '[data-tool-name="rules_get_hits"]' },
          'Read the current Rule tree and its real Capture hit counts.',
          'Revision 1 contains 1 enabled Rule with 1 captured hit.',
        ],
      },
      {
        id: `agent-panel-rules-result${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'rules-result',
        designState: {
          view: 'rules',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'checkout',
          agentToolTrace: 'rules',
          agentToolApproval: 'allowed',
          agentToolApprovalName: 'rules_replace_tree',
        },
        designShot: `${theme}/agent-models/panel-rules-result.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'shell.workspace.rules' },
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent Tool activity', parity: 'agent-query-tool-trace' },
          { name: 'Agent Tool result', parity: 'agent-tool-approval' },
          { name: 'Agent composer', parity: 'agent-composer' },
          'rules_replace_tree',
          'Revision 2 applied',
          'Revision 2 is now applied with the approved Rule effect.',
        ],
      },
      {
        id: `agent-panel-tool-approval${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'approval',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentExecutionMode: 'ask',
          agentToolApproval: 'pending',
          agentToolApprovalName: 'capture_stop_recording',
          agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-tool-approval.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Agent Tool approval', parity: 'agent-tool-approval' },
          'capture_stop_recording',
          'Pause capture without stopping the proxy.',
        ],
      },
      {
        id: `transfer-jobs${suffix}`, theme, agentModels: 'configured', agentSessionState: 'transfer-jobs',
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentChat: 'checkout', agentToolTrace: 'transfer-jobs', agentToolApproval: '', agentExecutionMode: 'ask',
        },
        designShot: `${theme}/agent-models/panel-transfer-jobs.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Transfer activity', parity: 'agent-query-tool-trace' },
          { name: 'Transfer discovery', appSelector: '[data-tool-call-id="transfer-discover"]', designSelector: '[data-tool-name="discover_tools"]' },
          { name: 'Running transfer', appSelector: '[data-tool-call-id="transfer-get"]', designSelector: '[data-tool-name="capture_get_transfer_job"]:nth-child(2)' },
          { name: 'Missing transfer', appSelector: '[data-tool-call-id="transfer-missing"]', designSelector: '[data-tool-name="capture_get_transfer_job"]:nth-child(3)' },
          'Inspect the current transfer jobs without exposing local file information.',
          'The Archive is running. The other job was not found in the current Core process.',
        ],
      },
      ...['pending', 'allowed'].map((stage) => ({
        id: `transfer-cancel-${stage}${suffix}`, theme, agentModels: 'configured', agentSessionState: `transfer-cancel-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage, agentToolApprovalName: 'capture_cancel_transfer_job', agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-transfer-cancel-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Transfer cancel approval', parity: 'agent-tool-approval' },
          'capture_cancel_transfer_job',
          {
            name: 'Transfer cancel result or effect',
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-automation-id="agent.tools.result.call-transfer-cancel"] > span',
          },
        ],
      })),
      ...['har', 'archive'].flatMap((format) => ['export', 'import'].flatMap((direction) => ['pending', 'allowed', 'canceled'].map((stage) => ({
        id: `${format}-${direction}-${stage}${suffix}`, theme, agentModels: 'configured', agentSessionState: `${format}-${direction}-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
          agentToolApprovalName: `capture_${direction}_${format}`,
          agentHarExportStarted: stage !== 'canceled', agentHarImportStarted: stage !== 'canceled', agentToolTrace: '',
          agentArchiveExportStarted: stage !== 'canceled', agentArchiveImportStarted: stage !== 'canceled',
        },
        designShot: `${theme}/agent-models/panel-${format}-${direction}-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: `${format} approval`, parity: 'agent-tool-approval' },
          `capture_${direction}_${format}`,
          {
            name: `${format} result or effect`,
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : `[data-automation-id="agent.tools.result.call-${format}-${direction}"] > span`,
          },
        ],
      })))),
      ...['pending', 'allowed', 'canceled'].map((stage) => ({
        id: `body-export-${stage}${suffix}`, theme, agentModels: 'configured', agentSessionState: `body-export-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
          agentToolApprovalName: 'capture_export_body', agentBodyExportStarted: stage !== 'canceled', agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-body-export-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Body export approval', parity: 'agent-tool-approval' },
          'capture_export_body',
          {
            name: 'Body export result or effect',
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-automation-id="agent.tools.result.call-body-export"] > span',
          },
        ],
      })),
      ...['pending', 'allowed', 'canceled'].map((stage) => ({
        id: `diagnostics-export-${stage}${suffix}`, theme, agentModels: 'configured',
        agentSessionState: `diagnostics-export-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
          agentToolApprovalName: 'diagnostics_export', agentDiagnosticsExportStarted: stage !== 'canceled', agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-diagnostics-export-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Diagnostics export approval', parity: 'agent-tool-approval' },
          'diagnostics_export',
          {
            name: 'Diagnostics export result or effect',
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-automation-id="agent.tools.result.call-diagnostics-export"] > span',
          },
        ],
      })),
      ...['continue-queue', 'drop-queue', 'continue-rule'].flatMap((action) => ['pending', 'allowed'].map((stage) => ({
        id: `breakpoint-batch-${action}-${stage}${suffix}`, theme, agentModels: 'configured',
        agentSessionState: `breakpoint-batch-${action}-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage,
          agentToolApprovalName: `breakpoints_${action.replaceAll('-', '_')}`, agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-breakpoints_${action.replaceAll('-', '_')}-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Breakpoint batch approval', parity: 'agent-tool-approval' },
          `breakpoints_${action.replaceAll('-', '_')}`,
          {
            name: 'Breakpoint batch result or effect',
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-automation-id="agent.tools.result.call-breakpoint-batch"] > span',
          },
        ],
      }))),
      ...['export', 'import'].flatMap((action) => ['pending', 'allowed', 'canceled'].map((stage) => ({
        id: `collection-${action}-${stage}${suffix}`, theme, agentModels: 'configured',
        agentSessionState: `collection-${action}-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
          agentToolApprovalName: `composer_${action}_collection`, agentToolTrace: '',
          agentCollectionExported: stage !== 'canceled', agentCollectionImported: stage !== 'canceled',
        },
        designShot: `${theme}/agent-models/panel-collection-${action}-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Collection file approval', parity: 'agent-tool-approval' },
          `composer_${action}_collection`,
          {
            name: 'Collection file result or effect',
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-automation-id="agent.tools.result.call-collection-transfer"] > span',
          },
        ],
      }))),
      ...['pending', 'allowed', 'canceled'].map((stage) => ({
        id: `rules-import-${stage}${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: `rules-import-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
          agentToolApprovalName: 'rules_import', agentRulesImported: stage !== 'canceled', agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-rules-import-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Rules import approval', parity: 'agent-tool-approval' },
          'rules_import',
          {
            name: 'Rules import result or effect',
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-automation-id="agent.tools.result.call-rules-import"] > span',
          },
        ],
      })),
      ...['pending', 'allowed', 'canceled'].map((stage) => ({
        id: `rules-export-${stage}${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: `rules-export-${stage}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
          agentToolApprovalName: 'rules_export', agentRulesExported: stage !== 'canceled', agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-rules-export-${stage}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Rules export approval', parity: 'agent-tool-approval' },
          'rules_export',
          {
            name: 'Rules export result or effect',
            designSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-parity="agent-tool-approval"] > span:last-child > span',
            appSelector: stage === 'pending'
              ? '[data-parity="agent-tool-approval"] dl > div:last-child > dd'
              : '[data-automation-id="agent.tools.result.call-rules-export"] > span',
          },
        ],
      })),
      ...[
        'settings_enable_app_container', 'settings_disable_app_container', 'settings_enable_all_app_containers', 'settings_disable_all_app_containers',
      ].flatMap((name) => ['pending', 'allowed'].map((approval) => ({
        id: `app-container-tools-${name}-${approval}${suffix}`,
        theme, agentModels: 'configured', agentSessionState: `app-containers-settings-${name}-${approval}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: approval, agentToolApprovalName: name, agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-${name}-${approval}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'AppContainer approval', parity: 'agent-tool-approval' },
          name,
          {
            name: 'AppContainer result or effect',
            designSelector: approval === 'allowed'
              ? '[data-parity="agent-tool-approval"] > span:last-child > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
            appSelector: approval === 'allowed'
              ? '[data-automation-id="agent.tools.result.call-app-containers-settings"] > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
          },
        ],
      }))),
      ...[
        'settings_generate_certificate', 'settings_install_certificate', 'settings_uninstall_certificate',
        'settings_delete_certificate', 'settings_reveal_certificate', 'settings_view_certificate', 'settings_open_certificate_manager',
      ].flatMap((name) => ['pending', 'allowed'].map((approval) => ({
        id: `certificate-tools-${name}-${approval}${suffix}`,
        theme, agentModels: 'configured', agentSessionState: `certificates-settings-${name}-${approval}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: approval, agentToolApprovalName: name, agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-${name}-${approval}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Certificate approval', parity: 'agent-tool-approval' },
          name,
          {
            name: 'Certificate result or effect',
            designSelector: approval === 'allowed'
              ? '[data-parity="agent-tool-approval"] > span:last-child > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
            appSelector: approval === 'allowed'
              ? '[data-automation-id="agent.tools.result.call-certificates-settings"] > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
          },
        ],
      }))),
      ...[
        'settings_replace_tls_insecure_hosts', 'settings_replace_tls_passthrough',
        'settings_enable_https_decryption', 'settings_disable_https_decryption',
      ].flatMap((name) => ['pending', 'allowed'].map((approval) => ({
        id: `tls-tools-${name}-${approval}${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: `tls-settings-${name}-${approval}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: approval, agentToolApprovalName: name, agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-${name}-${approval}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'TLS approval', parity: 'agent-tool-approval' },
          name,
          {
            name: 'TLS result or effect',
            designSelector: approval === 'allowed'
              ? '[data-parity="agent-tool-approval"] > span:last-child > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
            appSelector: approval === 'allowed'
              ? '[data-automation-id="agent.tools.result.call-tls-settings"] > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
          },
        ],
      }))),
      ...['settings_set_language', 'settings_set_theme', 'settings_set_export_privacy_defaults'].flatMap((name) => ['pending', 'allowed'].map((approval) => ({
        id: `preferences-${name}-${approval}${suffix}`,
        theme, agentModels: 'configured', agentSessionState: `preferences-settings-${name}-${approval}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: approval, agentToolApprovalName: name, agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-${name}-${approval}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Preference approval', parity: 'agent-tool-approval' },
          name,
          {
            name: 'Preference result or effect',
            designSelector: approval === 'allowed'
              ? '[data-parity="agent-tool-approval"] > span:last-child > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
            appSelector: approval === 'allowed'
              ? '[data-automation-id="agent.tools.result.call-preferences-settings"] > span'
              : '[data-parity="agent-tool-approval"] dl > div:last-child > dd',
          },
        ],
      }))),
      ...['enable', 'restore'].flatMap((action) => ['pending', 'allowed'].map((approval) => ({
        id: `settings-system-proxy-${action}-${approval}${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: `system-proxy-${action}-${approval}`,
        designState: {
          view: 'capture', theme, sidebar: 'collapsed', agentPanel: 'open', agentProvider: 'configured',
          agentExecutionMode: 'ask', agentToolApproval: approval,
          agentToolApprovalName: `settings_${action}_system_proxy`, agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-system-proxy-${action}-${approval}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'System proxy approval', parity: 'agent-tool-approval' },
          `settings_${action}_system_proxy`,
          ...(approval === 'allowed'
            ? [action === 'restore' ? 'System proxy restored' : 'Owned by Interceptor']
            : [action === 'restore'
              ? 'Restore the system proxy configuration saved before Interceptor took ownership.'
              : 'Route system traffic through Interceptor using the active proxy listener.']),
        ],
      }))),
      {
        id: `agent-panel-tool-result${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'approval-result',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentExecutionMode: 'ask',
          agentToolApproval: 'allowed',
          agentToolApprovalName: 'capture_clear',
          agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-tool-result.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Agent Tool result', parity: 'agent-tool-approval' },
          'capture_clear',
          'Exchanges 0 · Bodies 0 · 4 KB',
        ],
      },
      {
        id: `agent-panel-auto${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'auto',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentExecutionMode: 'auto',
          agentToolApproval: '',
          agentToolTrace: '',
        },
        designShot: `${theme}/agent-models/panel-auto.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
        ],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent model selector', parity: 'agent-model-select' },
          { name: 'Agent execution mode', parity: 'agent-execution-mode' },
          { name: 'Agent Context usage', parity: 'agent-context-usage' },
        ],
      },
      {
        id: `agent-panel-new-chat${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: 'empty',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'new',
        },
        designShot: `${theme}/agent-panel/new-chat.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent transcript', parity: 'agent-transcript' },
          { name: 'Agent composer', parity: 'agent-composer' },
          { name: 'Agent send', parity: 'agent-send' },
          'New chat',
        ],
      },
      ...['running', 'stopped', 'failed'].map((turnState) => ({
        id: `agent-panel-turn-${turnState}${suffix}`,
        theme,
        agentModels: 'configured',
        agentSessionState: turnState,
        agentMessage: 'Explain invalid_grant.',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChat: 'sent',
          agentMessage: 'Explain invalid_grant.',
          agentTurnState: turnState,
        },
        designShot: `${theme}/agent-panel/turn-${turnState}.png`,
        rendererActions: [{ type: 'clickAutomation', automationId: 'agent.panel.toggle' }],
        targets: [
          { name: 'Agent panel', parity: 'agent-panel' },
          { name: 'Agent transcript', parity: 'agent-transcript' },
          { name: 'Agent composer', parity: 'agent-composer' },
          'Explain invalid_grant.',
          ...(turnState === 'running'
            ? ['Generating response…']
            : turnState === 'stopped'
              ? ['Response stopped', 'Retry response']
              : ['Model request failed', 'Retry response']),
        ],
      })),
      {
        id: `agent-panel-usage${suffix}`,
        theme,
        agentModels: 'configured',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentUsagePanel: 'open',
        },
        designShot: `${theme}/agent-panel/session-usage.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
          { type: 'hoverSelector', selector: '[data-automation-id="agent.context"]' },
        ],
        targets: [
          { name: 'Session usage popover', parity: 'agent-session-usage-popover' },
          'Cache hit',
          'Cache miss',
          'Output',
        ],
      },
      {
        id: `agent-panel-chat-menu${suffix}`,
        theme,
        agentModels: 'configured',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChatMenu: 'open',
        },
        designShot: `${theme}/agent-panel/chat-menu.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
          { type: 'clickAutomation', automationId: 'agent.chat.selector' },
        ],
        targets: [
          { name: 'Chat menu', parity: 'agent-chat-menu' },
          'Checkout failures',
          'New chat',
          'Rename current chat',
          'Delete current chat',
        ],
      },
      {
        id: `agent-panel-model-menu${suffix}`,
        theme,
        agentModels: 'configured',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentModelMenu: 'open',
        },
        designShot: `${theme}/agent-models/panel-model-menu.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
          { type: 'clickSelector', selector: '[data-parity="agent-model-select"]' },
          { type: 'assertSelectorVisible', selector: '[data-parity="agent-model-menu"]' },
          { type: 'clickAutomation', automationId: 'agent.message.input' },
          { type: 'assertTextHidden', text: 'Model for this chat' },
          { type: 'assertSelectorVisible', selector: '[data-parity="agent-model-select"][aria-expanded="false"]' },
          { type: 'assertSelectorVisible', selector: '[data-automation-id="agent.message.input"]:focus' },
          { type: 'clickSelector', selector: '[data-parity="agent-model-select"]' },
          { type: 'clickAutomation', automationId: 'shell.workspace.rules' },
          { type: 'assertTextHidden', text: 'Model for this chat' },
          { type: 'assertSelectorVisible', selector: '[data-parity="agent-model-select"][aria-expanded="false"]' },
          { type: 'clickAutomation', automationId: 'shell.workspace.capture' },
          { type: 'clickSelector', selector: '[data-parity="agent-model-select"]' },
          { type: 'assertInsideViewport', selector: '[data-parity="agent-model-menu"]' },
        ],
        targets: [
          { name: 'Model menu', parity: 'agent-model-menu' },
          'Model for this chat',
          {
            name: 'DeepSeek V4 Flash',
            designSelector: '[data-parity="agent-model-menu"] [role="option"][aria-selected="true"] strong',
            appSelector: '[data-parity="agent-model-menu"] [role="option"][aria-selected="true"] strong',
          },
          'Qwen3 Max',
          'Agent settings…',
        ],
      },
      ...['rename', 'delete'].map((dialogMode) => ({
        id: `agent-panel-${dialogMode}-chat${suffix}`,
        theme,
        agentModels: 'configured',
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          agentPanel: 'open',
          agentProvider: 'configured',
          agentChatDialog: dialogMode,
        },
        designShot: `${theme}/agent-panel/${dialogMode}-chat.png`,
        rendererActions: [
          { type: 'clickAutomation', automationId: 'agent.panel.toggle' },
          { type: 'clickAutomation', automationId: 'agent.chat.selector' },
          { type: 'clickAutomation', automationId: `agent.chat.${dialogMode}` },
        ],
        targets: [
          {
            name: 'Chat dialog',
            designSelector: '.agentChatDialog',
            appSelector: '[data-automation-id="agent.chat.dialog"]',
          },
          dialogMode === 'rename' ? 'Rename chat' : 'Delete chat?',
          'Cancel',
          dialogMode === 'rename' ? 'Save chat title' : 'Confirm delete chat',
        ],
      })),
      {
        id: `settings-agent-unconfigured${suffix}`,
        theme,
        rendererNav: 'Settings',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'unconfigured',
        },
        designShot: `${theme}/agent-models/settings-agent-unconfigured.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
        ],
        targets: [
          { name: 'Agent settings', parity: 'agent-model-settings' },
          { name: 'Agent settings empty state', parity: 'agent-settings-empty' },
          { name: 'Agent settings empty icon', parity: 'agent-settings-empty-icon' },
          { name: 'Agent settings empty copy', parity: 'agent-settings-empty-copy' },
          'Configure model providers and defaults used by Agent.',
          'No models configured',
          'Add a hosted provider or connect an OpenAI-compatible local model to start a chat.',
          'Add provider',
          { name: 'Tool capabilities', parity: 'agent-tool-capabilities' },
        ],
      },
      {
        id: `settings-agent-provider-menu${suffix}`,
        theme,
        rendererNav: 'Settings',
        designShot: `${theme}/agent-models/settings-provider-menu.png`,
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'unconfigured',
        },
        designActions: [
          { type: 'clickSelector', selector: '[data-parity="window-header-title"]' },
          { type: 'clickRole', role: 'button', name: 'Add provider' },
        ],
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'agent.models.add' },
        ],
        targets: [
          {
            name: 'Provider type menu',
            designSelector: '.ant-dropdown:visible .ant-dropdown-menu',
            appSelector: '.ant-dropdown:visible .ant-dropdown-menu',
          },
          {
            name: 'DeepSeek menu item',
            designSelector: '.ant-dropdown:visible .ant-dropdown-menu-item:nth-child(1)',
            appSelector: '.ant-dropdown:visible .ant-dropdown-menu-item:nth-child(1)',
          },
          {
            name: 'Custom menu item',
            designSelector: '.ant-dropdown:visible .ant-dropdown-menu-item:nth-child(2)',
            appSelector: '.ant-dropdown:visible .ant-dropdown-menu-item:nth-child(2)',
          },
        ],
      },
      {
        id: `settings-agent-configured${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
        },
        designShot: `${theme}/agent-models/settings-agent.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
        ],
        targets: [
          { name: 'Agent settings', parity: 'agent-model-settings' },
          {
            name: 'Configured models section',
            designSelector: '.modelSettingsSection',
            appSelector: '[data-automation-id="agent.models.list"] > section',
          },
          {
            name: 'Configured models header',
            designSelector: '.modelSettingsSectionHeader',
            appSelector: '[data-automation-id="agent.models.list"] > section > header',
          },
          {
            name: 'DeepSeek model row',
            designSelector: '[data-configured-model="deepseek"]',
            appSelector: '[data-automation-id="agent.model.row.provider-deepseek"]',
          },
          {
            name: 'Custom model row',
            designSelector: '[data-configured-model="qwen"]',
            appSelector: '[data-automation-id="agent.model.row.provider-qwen"]',
          },
          'Configured models',
          'DeepSeek V4 Flash',
          'Qwen3 Max',
          'Add provider',
          'Default',
          'Set default',
          { name: 'Tool capabilities', parity: 'agent-tool-capabilities' },
          {
            name: 'Tool capabilities header',
            designSelector: '.toolCapabilitiesHeader',
            appSelector: '[data-automation-id="agent.tools.capabilities"] > header',
          },
          {
            name: 'First Tool row',
            designSelector: '[data-tool-capability="capture_get_proxy_status"]',
            appSelector: '[data-automation-id="agent.tools.row.capture_get_proxy_status"]',
          },
          ...['capture', 'rules', 'composer', 'breakpoints', 'diagnostics', 'settings'].map((groupId) => ({
            name: `${groupId} Tool group`,
            designSelector: `[data-tool-group="${groupId}"]`,
            appSelector: `[data-automation-id="agent.tools.group.${groupId}"]`,
          })),
        ],
      },
      {
        id: `settings-tools-capabilities${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        designState: {
          view: 'settings', theme, sidebar: 'expanded', settings: 'agent', agentProvider: 'configured',
          agentToolSearch: 'settings_', agentDisabledTools: ['settings_get_certificate_status'],
          mcpDisabledTools: ['settings_get_tls_passthrough'],
        },
        designShot: `${theme}/agent-models/settings-tool-capabilities-settings.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'fillAutomation', automationId: 'agent.tools.search', value: 'settings_' },
          { type: 'clickAutomation', automationId: 'agent.tools.agent.settings_get_certificate_status' },
          { type: 'clickAutomation', automationId: 'agent.tools.mcp.settings_get_tls_passthrough' },
        ],
        targets: [
          { name: 'Agent settings', parity: 'agent-model-settings' },
          { name: 'Tool capabilities', parity: 'agent-tool-capabilities' },
          { name: 'Settings group', designSelector: '[data-tool-group="settings"]', appSelector: '[data-automation-id="agent.tools.group.settings"]' },
          ...[
            'settings_get_core_process_status', 'settings_get_system_proxy_status',
            'settings_get_certificate_status', 'settings_generate_certificate', 'settings_install_certificate',
            'settings_uninstall_certificate', 'settings_delete_certificate', 'settings_reveal_certificate',
            'settings_view_certificate', 'settings_open_certificate_manager', 'settings_get_tls_insecure_hosts',
            'settings_get_tls_passthrough', 'settings_list_app_containers', 'settings_enable_app_container',
            'settings_disable_app_container', 'settings_enable_all_app_containers', 'settings_disable_all_app_containers',
          ].map((name) => ({
            name, designSelector: `[data-tool-capability="${name}"]`, appSelector: `[data-automation-id="agent.tools.row.${name}"]`,
          })),
        ],
      },
      {
        id: `settings-agent-tool-capabilities-filtered${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          agentToolSearch: 'exchange',
          agentDisabledTools: ['capture_get_exchange'],
        },
        designShot: `${theme}/agent-models/settings-tool-capabilities-filtered.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'agent.tools.agent.capture_get_exchange' },
          { type: 'fillAutomation', automationId: 'agent.tools.search', value: 'exchange' },
        ],
        targets: [
          { name: 'Agent settings', parity: 'agent-model-settings' },
          { name: 'Tool capabilities', parity: 'agent-tool-capabilities' },
          {
            name: 'Filtered Tool row',
            designSelector: '[data-tool-capability="capture_get_exchange"]',
            appSelector: '[data-automation-id="agent.tools.row.capture_get_exchange"]',
          },
          'Tool capabilities',
          'Exchange detail',
          'capture_get_exchange',
        ],
      },
      {
        id: `settings-mcp-running${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        mcpState: 'running',
        mcpClientConfigured: true,
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          mcpServerState: 'running',
          mcpEndpointAssigned: true,
          mcpClientLabel: 'VS Code',
          mcpClientExecutionMode: 'ask',
        },
        designShot: `${theme}/agent-models/settings-mcp-running.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
        ],
        targets: [
          { name: 'MCP server', parity: 'mcp-server-settings' },
          {
            name: 'MCP server header',
            designSelector: '.mcpServerHeader',
            appSelector: '[data-automation-id="mcp.server.root"] > header',
          },
          {
            name: 'MCP endpoint row',
            designSelector: '.mcpEndpointCopy',
            appSelector: '[data-automation-id="mcp.server.endpoint"]',
          },
          {
            name: 'MCP client row',
            designSelector: '.mcpClientRow',
            appSelector: '[data-automation-id="mcp.client.row.mcp-client-vscode"]',
          },
          'http://127.0.0.1:43127/mcp',
          'VS Code',
        ],
      },
      {
        id: `settings-mcp-conflict${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        mcpState: 'endpoint-conflict',
        mcpClientConfigured: true,
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          mcpServerState: 'conflict',
          mcpEndpointAssigned: true,
          mcpClientLabel: 'VS Code',
        },
        designShot: `${theme}/agent-models/settings-mcp-conflict.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
        ],
        targets: [
          { name: 'MCP server', parity: 'mcp-server-settings' },
          {
            name: 'MCP conflict',
            designSelector: '.mcpEndpointConflict',
            appSelector: '[data-automation-id="mcp.server.root"] [role="alert"]',
          },
          'Port unavailable',
          'Change endpoint',
        ],
      },
      {
        id: `settings-mcp-add-client${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        mcpState: 'running',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          mcpServerState: 'running',
          mcpEndpointAssigned: true,
          mcpClientDialog: 'add',
        },
        designShot: `${theme}/agent-models/settings-mcp-add-client.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'mcp.client.add' },
        ],
        targets: [
          {
            name: 'MCP client dialog',
            designSelector: '.mcpClientDialog',
            appSelector: '[data-automation-id="mcp.client.dialog"]',
          },
          'Add MCP client',
          'Client name',
          'Create client',
          'Cancel',
        ],
      },
      {
        id: `settings-mcp-regenerate${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        mcpState: 'running',
        mcpClientConfigured: true,
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          mcpServerState: 'running',
          mcpEndpointAssigned: true,
          mcpClientLabel: 'VS Code',
          mcpClientDialog: 'regenerate',
        },
        designShot: `${theme}/agent-models/settings-mcp-regenerate.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'mcp.client.regenerate.mcp-client-vscode' },
        ],
        targets: [
          {
            name: 'MCP regenerate dialog',
            designSelector: '.mcpClientConfirmationDialog',
            appSelector: '[data-automation-id="mcp.client.regenerate.dialog"]',
          },
          'Regenerate MCP credential',
          'Regenerate credential',
          'Cancel',
        ],
      },
      {
        id: `mcp-tool-approval${suffix}`,
        theme,
        mcpApproval: true,
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          mcpToolApproval: 'pending',
        },
        designShot: `${theme}/agent-models/mcp-tool-approval.png`,
        targets: [
          {
            name: 'MCP Tool approval',
            designSelector: '.mcpToolApprovalDialog',
            appSelector: '[data-automation-id="mcp.approval.root"]',
          },
          'Approve MCP Tool call',
          'capture_stop_recording',
          'Deny Tool call',
          'Allow Tool call',
        ],
      },
      {
        id: `settings-agent-custom-dialog${suffix}`,
        theme,
        rendererNav: 'Settings',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'unconfigured',
          agentProviderDialog: 'custom',
          agentProviderDialogMode: 'add',
          agentProviderDialogTarget: '',
        },
        designShot: `${theme}/agent-models/settings-custom-dialog.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'agent.models.add' },
          { type: 'clickAutomation', automationId: 'agent.models.add.openai-compatible' },
        ],
        targets: [
          {
            name: 'Provider dialog',
            designSelector: '[data-parity="model-provider-dialog"]',
            appSelector: '[role="dialog"]:has([data-automation-id="agent.provider.dialog"])',
          },
          {
            name: 'Provider dialog header',
            designSelector: '.modelProviderDialogHeader',
            appSelector: '[data-automation-id="agent.provider.dialog"] > header',
          },
          {
            name: 'Provider dialog body',
            designSelector: '.modelProviderDialogBody',
            appSelector: '[data-automation-id="agent.provider.dialog"] > div',
          },
          {
            name: 'Provider dialog footer',
            designSelector: '.modelProviderDialogFooter',
            appSelector: '[data-automation-id="agent.provider.dialog"] > footer',
          },
          {
            name: 'Provider field control',
            parity: 'model-provider-field-control',
            styleKeys: [],
          },
          'OpenAI-compatible provider',
          'Profile name',
          'Base URL',
          {
            name: 'API key',
            designSelector: '.modelProviderField:has(input[aria-label="API key"]) > span:first-child',
            appSelector: 'label:has([data-automation-id="agent.provider.api-key"]) > span:first-child',
          },
          'Model ID',
          'Context window',
          'Maximum output',
          'Test connection',
          {
            name: 'Cancel',
            designSelector: '[data-parity="model-provider-dialog"] > footer .btn:has-text("Cancel")',
            appSelector: '[data-automation-id="agent.provider.dialog"] > footer button:has-text("Cancel")',
          },
          'Save provider',
        ],
      },
      {
        id: `settings-agent-deepseek-dialog${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          agentProviderDialog: 'deepseek',
          agentProviderDialogMode: 'edit',
          agentProviderDialogTarget: 'deepseek',
        },
        designShot: `${theme}/agent-models/settings-deepseek-dialog.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'agent.model.edit.provider-deepseek' },
        ],
        targets: [
          {
            name: 'Provider dialog',
            designSelector: '[data-parity="model-provider-dialog"]',
            appSelector: '[role="dialog"]:has([data-automation-id="agent.provider.dialog"])',
          },
          {
            name: 'Provider dialog header',
            designSelector: '.modelProviderDialogHeader',
            appSelector: '[data-automation-id="agent.provider.dialog"] > header',
          },
          {
            name: 'Provider dialog body',
            designSelector: '.modelProviderDialogBody',
            appSelector: '[data-automation-id="agent.provider.dialog"] > div',
          },
          {
            name: 'Provider dialog footer',
            designSelector: '.modelProviderDialogFooter',
            appSelector: '[data-automation-id="agent.provider.dialog"] > footer',
          },
          'DeepSeek',
          'Profile name',
          {
            name: 'Endpoint',
            designSelector: '[data-parity="model-provider-dialog"] label > span:first-child:text-is("Endpoint")',
            appSelector: '[data-automation-id="agent.provider.dialog"] label > span:first-child:text-is("Endpoint")',
          },
          'API key',
          'Model ID',
          'Test connection',
          {
            name: 'Cancel',
            designSelector: '[data-parity="model-provider-dialog"] > footer .btn:has-text("Cancel")',
            appSelector: '[data-automation-id="agent.provider.dialog"] > footer button:has-text("Cancel")',
          },
          'Save changes',
        ],
      },
      {
        id: `settings-agent-custom-edit-dialog${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          agentProviderDialog: 'custom',
          agentProviderDialogMode: 'edit',
          agentProviderDialogTarget: 'qwen',
        },
        designShot: `${theme}/agent-models/settings-custom-edit-dialog.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'agent.model.edit.provider-qwen' },
        ],
        targets: [
          {
            name: 'Provider dialog',
            designSelector: '[data-parity="model-provider-dialog"]',
            appSelector: '[role="dialog"]:has([data-automation-id="agent.provider.dialog"])',
          },
          {
            name: 'Provider dialog body',
            designSelector: '.modelProviderDialogBody',
            appSelector: '[data-automation-id="agent.provider.dialog"] > div',
          },
          {
            name: 'Provider dialog footer',
            designSelector: '.modelProviderDialogFooter',
            appSelector: '[data-automation-id="agent.provider.dialog"] > footer',
          },
          {
            name: 'Remove key checkbox',
            designSelector: '.modelCredentialChoice input',
            appSelector: '[data-automation-id="agent.provider.remove-api-key"]',
            styleKeys: [],
          },
          'Remove saved API key',
          'Test connection',
          {
            name: 'Cancel',
            designSelector: '[data-parity="model-provider-dialog"] > footer .btn:has-text("Cancel")',
            appSelector: '[data-automation-id="agent.provider.dialog"] > footer button:has-text("Cancel")',
          },
          'Save changes',
        ],
      },
      {
        id: `settings-agent-remove-provider${suffix}`,
        theme,
        rendererNav: 'Settings',
        agentModels: 'configured',
        designState: {
          view: 'settings',
          theme,
          sidebar: 'expanded',
          settings: 'agent',
          agentProvider: 'configured',
          agentRemoveModelTarget: 'qwen',
        },
        designShot: `${theme}/agent-models/settings-remove-model.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickText', text: 'Agent' },
          { type: 'clickAutomation', automationId: 'agent.model.remove.provider-qwen' },
        ],
        targets: [
          {
            name: 'Remove Provider dialog',
            designSelector: '.agentRemoveModelDialog',
            appSelector: '[role="dialog"]:has([data-automation-id="agent.remove-provider.dialog"])',
          },
          'Remove Qwen3 Max',
          'Existing chats using this model will switch to the next configured model.',
          'Confirm remove model',
        ],
      },
    ];
  }),
  ...HTTP_BREAKPOINT_VIEWS,
  ...HTTP_READONLY_BODY_VIEWS,
  ...BREAKPOINT_QUEUE_VIEWS,
  ...['light', 'dark'].flatMap((theme) => ['loading', 'empty', 'error'].map((messageState) => ({
    id: `capture-websocket-messages-${messageState}${theme === 'dark' ? '-dark' : ''}`,
    theme,
    websocketMessagesState: messageState,
    designState: {
      view: 'capture', theme, sidebar: 'collapsed', overlay: '', detail: 'open',
      scene: 'websocket', tab: 'messages', breakpointState: '', websocketMessagesState: messageState,
    },
    designShot: `${theme}/capture/websocket-messages-${messageState}.png`,
    rendererActions: [{ type: 'clickText', text: '/socket' }, { type: 'clickText', text: 'Messages' }],
    targets: [
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector status', parity: 'capture-inspector-status' },
      'Messages',
      { name: 'Message state', parity: 'websocket-message-state' },
    ],
  }))),
  ...['light', 'dark'].map((theme) => ({
    id: theme === 'dark' ? 'capture-websocket-dark' : 'capture-websocket',
    theme,
    mitmActive: false,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      detail: 'open',
      scene: 'websocket',
      tab: 'messages',
    },
    designShot: `${theme}/capture/inspector-websocket.png`,
    rendererActions: [
      { type: 'clickText', text: '/socket' },
      { type: 'clickText', text: 'Messages' },
      {
        type: 'clickText',
        text: '{"buildId":8431,"state":"running","branch":"main"}',
      },
    ],
    targets: [
      { name: 'Capture header', parity: 'window-header-title', measureText: true },
      INSPECTOR_METHOD_TARGET,
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector status', parity: 'capture-inspector-status' },
      'Messages',
      {
        name: 'Message breakpoint button',
        designSelector: '.ws-breakpoint-control-host button',
        appSelector: '[data-automation-id="capture.websocket.breakpoint.toggle"]',
        styleKeys: ['color', 'backgroundColor', 'borderTopWidth', 'borderRadius'],
      },
      'Received text',
      'Binary',
    ],
  })),
  ...['light', 'dark'].map((theme) => ({
    id: `statusbar-upstream-down${theme === 'dark' ? '-dark' : ''}`,
    theme,
    designState: { view: 'capture', theme, sidebar: 'collapsed', upstream: 'down' },
    designShot: `${theme}/capture/statusbar-upstream-down.png`,
    upstreamDown: true,
    mitmActive: false,
    targets: [
      {
        name: 'Status endpoint',
        designSelector: '.capture-endpoint',
        appSelector: '[data-parity="capture-status-endpoint"]',
      },
      {
        name: 'Status passthrough',
        designSelector: '.capture-passthrough',
        appSelector: '[data-parity="capture-status-passthrough"]',
      },
      { name: 'Status upstream', parity: 'capture-status-upstream' },
    ],
  })),
  ...['light', 'dark'].flatMap((theme) => {
    const rendererOpenMessages = [
      { type: 'clickText', text: '/socket' },
      { type: 'clickText', text: 'Messages' },
    ];
    const designState = {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      overlay: '',
      detail: 'open',
      scene: 'websocket',
      tab: 'messages',
    };
    const suffix = theme === 'dark' ? '-dark' : '';
    return [
      {
        id: `capture-websocket-breakpoint-setup${suffix}`,
        theme,
        designState: {
          ...designState,
          breakpointState: '',
          websocketBreakpoint: 'setup',
          websocketBreakpointDirection: 'both',
          websocketBreakpointFrames: ['message'],
        },
        designShot: `${theme}/capture/websocket-breakpoint-setup.png`,
        rendererActions: [
          ...rendererOpenMessages,
          { type: 'clickRole', role: 'button', name: 'Enable message breakpoint' },
        ],
        targets: [
          {
            name: 'WebSocket breakpoint popover',
            designSelector: '.ant-popover:visible .ant-popover-container',
            appSelector: '.ant-popover:visible .ant-popover-container',
          },
          {
            name: 'WebSocket breakpoint setup',
            parity: 'websocket-breakpoint-setup',
          },
          { name: 'Direction row', parity: 'websocket-breakpoint-direction-row' },
          { name: 'Frames row', parity: 'websocket-breakpoint-frames-row' },
          { name: 'Actions row', parity: 'websocket-breakpoint-actions-row' },
          'Pause messages on this connection',
          'Direction',
          'Frames',
          'Cancel',
          'Enable breakpoint',
        ],
      },
      {
        id: `capture-websocket-breakpoint-enabled${suffix}`,
        theme,
        designState: {
          ...designState,
          breakpointState: '',
          websocketBreakpoint: 'enabled',
          websocketBreakpointDirection: 'both',
          websocketBreakpointFrames: ['message'],
        },
        designShot: `${theme}/capture/websocket-breakpoint-enabled.png`,
        rendererActions: [
          ...rendererOpenMessages,
          { type: 'clickRole', role: 'button', name: 'Enable message breakpoint' },
          { type: 'clickRole', role: 'button', name: 'Enable breakpoint' },
        ],
        targets: [
          'Messages',
          ...WEBSOCKET_DIRECTION_TARGETS,
          'Sent',
          'Received',
          {
            name: 'Armed WebSocket breakpoint',
            designSelector: 'button[aria-label="Disable message breakpoint"]',
            appSelector: 'button[aria-label="Disable message breakpoint"]',
          },
        ],
      },
      {
        id: `capture-websocket-breakpoint-paused${suffix}`,
        theme,
        designState: {
          ...designState,
          breakpointState: 'websocket',
          breakpointBody: 'ready',
          breakpointQueueSelection: 'websocket-head',
          websocketBreakpoint: 'enabled',
          websocketBreakpointDirection: 'both',
          websocketBreakpointFrames: ['message'],
          websocketMessageDirection: 'sent',
          websocketMessagePayload: 'text',
        },
        designShot: `${theme}/capture/websocket-breakpoint-queue-head.png`,
        pausedWebSocketBreakpoint: true,
        rendererActions: [{ type: 'clickText', text: '/socket' }],
        targets: [
          'Messages',
          ...WEBSOCKET_DIRECTION_TARGETS,
          {
            name: 'Armed WebSocket breakpoint',
            designSelector: 'button[aria-label="Disable message breakpoint"]',
            appSelector: 'button[aria-label="Disable message breakpoint"]',
          },
          'Sent message paused',
          'Both directions',
          'Original message',
          'Replacement message',
          'Using original',
          'The original message will be forwarded unchanged.',
          'Drop',
          'Continue',
          'Forward edited',
        ],
      },
      {
        id: `capture-websocket-breakpoint-queue-head${suffix}`,
        theme,
        designState: {
          ...designState,
          breakpointState: 'websocket',
          breakpointBody: 'ready',
          breakpointQueueSelection: 'websocket-head',
          websocketBreakpoint: 'enabled',
          websocketBreakpointDirection: 'both',
          websocketBreakpointFrames: ['message'],
          websocketMessageDirection: 'sent',
          websocketMessagePayload: 'text',
        },
        designShot: `${theme}/capture/websocket-breakpoint-queue-head.png`,
        pausedWebSocketBreakpoint: true,
        rendererActions: [{ type: 'clickText', text: '/socket' }],
        targets: [
          {
            name: 'WebSocket history row',
            designSelector: '.wsrows > .wsrow:first-child',
            appSelector: '[data-automation-id^="capture.websocket.frame."]',
            styleKeys: ['height', 'borderBottomWidth'],
          },
          {
            name: 'WebSocket paused frame list',
            designSelector: '.wsrows',
            appSelector: 'div:has(> div > div > div > [data-automation-id="breakpoints.pending.bp-websocket-message"])',
            styleKeys: ['height', 'borderRadius', 'borderWidth'],
          },
          {
            name: 'WebSocket queue head',
            designSelector: '[data-breakpoint-id="bp-ws-head"]',
            appSelector: '[data-automation-id="breakpoints.pending.bp-websocket-message"]',
          },
          {
            name: 'WebSocket queued frame',
            designSelector: '[data-breakpoint-id="bp-ws-queued"]',
            appSelector: '[data-automation-id="breakpoints.pending.bp-websocket-queued"]',
          },
          {
            name: 'Queue actions trigger',
            designSelector: 'button[aria-label="Queue actions"]',
            appSelector: '[data-automation-id="breakpoints.queue-menu"]',
          },
          {
            name: 'WebSocket pause context',
            designSelector: '[data-breakpoint-component="context"]:has-text("Sent message paused")',
            appSelector: 'div:has(> span:text-is("Sent message paused"))',
            styleKeys: ['display', 'gap', 'minHeight', 'padding', 'alignItems'],
          },
          {
            name: 'WebSocket pause phase',
            designSelector: '[data-breakpoint-component="context"] > span:first-child',
            appSelector: 'span:text-is("Sent message paused")',
            styleKeys: ['fontSize', 'fontWeight', 'lineHeight'],
          },
        ],
      },
      {
        id: `capture-websocket-breakpoint-queue-queued${suffix}`,
        theme,
        designState: {
          ...designState,
          breakpointState: 'websocket',
          breakpointBody: 'ready',
          breakpointQueueSelection: 'websocket-queued',
          websocketBreakpoint: 'enabled',
          websocketBreakpointDirection: 'both',
          websocketBreakpointFrames: ['message'],
          websocketMessageDirection: 'sent',
          websocketMessagePayload: 'text',
        },
        designShot: `${theme}/capture/websocket-breakpoint-queue-queued.png`,
        pausedWebSocketBreakpoint: true,
        rendererActions: [
          { type: 'clickText', text: '/socket' },
          {
            type: 'clickAutomation',
            automationId: 'breakpoints.pending.bp-websocket-queued',
          },
        ],
        targets: [
          {
            name: 'WebSocket queue head',
            designSelector: '[data-breakpoint-id="bp-ws-head"]',
            appSelector: '[data-automation-id="breakpoints.pending.bp-websocket-message"]',
          },
          {
            name: 'WebSocket queued frame',
            designSelector: '[data-breakpoint-id="bp-ws-queued"]',
            appSelector: '[data-automation-id="breakpoints.pending.bp-websocket-queued"]',
          },
          { name: 'WebSocket queued detail', parity: 'websocket-breakpoint-queued' },
        ],
      },
    ];
  }),
  ...['light', 'dark'].flatMap((theme) =>
    ['request-text', 'request-file', 'response-text', 'response-file'].map((bodyRuleEffect) => {
      const response = bodyRuleEffect.startsWith('response-');
      return {
        id: `capture-body-effect-${bodyRuleEffect}${theme === 'dark' ? '-dark' : ''}`,
        theme,
        bodyRuleEffect,
        designState: {
          view: 'capture',
          theme,
          sidebar: 'collapsed',
          overlay: '',
          detail: 'open',
          scene: 'http',
          tab: response ? 'response' : 'request',
          bodyPreview: 'json',
          bodyRuleEffect,
          breakpointState: '',
        },
        designShot: `${theme}/capture/body-effect-${bodyRuleEffect}.png`,
        rendererActions: [
          { type: 'clickText', text: '/user' },
          { type: 'clickText', text: response ? 'Response' : 'Request' },
        ],
        targets: [
          { name: 'Body effect marker', parity: 'capture-body-effect-marker' },
          { name: 'Body effect source', parity: 'capture-body-effect-source' },
          { name: 'Body version bar', parity: 'capture-body-effect-version-bar' },
          ...(response
            ? [{ name: 'Original unavailable', parity: 'capture-body-effect-unavailable' }]
            : []),
          {
            name: 'Body effect viewer',
            designSelector: '[data-parity="body-viewer-design"]',
            appSelector: '[data-parity="capture-body-view"]',
          },
        ],
      };
    }),
  ),
  ...['light', 'dark'].map((theme) => ({
    id: theme === 'light' ? 'capture-request-json' : 'capture-request-json-dark',
    theme,
    mitmActive: false,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'expanded',
      detail: 'open',
      tab: 'request',
    },
    designShot: `${theme}/capture/inspector-request-expanded.png`,
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: '/user' },
      { type: 'clickText', text: 'Request' },
    ],
    targets: [
      'Capture',
      'Local traffic',
      {
        name: 'Request line heading',
        designSelector: '.collapsibleSectionHeader:has-text("Request line")',
        appSelector: '[data-automation-id="capture.inspector.section.request-line"]',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color'],
      },
      {
        name: 'Query heading',
        designSelector: '.collapsibleSectionHeader:has-text("Query String Parameters")',
        appSelector: '[data-automation-id="capture.inspector.section.query-parameters"]',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color'],
      },
      {
        name: 'Empty query text',
        designSelector: '.emptyv:text-is("No query parameters on this request.")',
        appSelector: 'div:text-is("No query parameters on this request.")',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color'],
      },
      {
        name: 'Request body heading',
        designSelector: '.collapsibleSectionHeader:has-text("Request Payload")',
        appSelector: '[data-automation-id="capture.inspector.section.request-body"]',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color'],
      },
      {
        name: 'Request body metadata',
        designSelector: '.collapsibleSectionHeader :text-is("json · 63 B")',
        appSelector: '[data-automation-id="capture.inspector.section.request-body"] > span:last-of-type',
        styleKeys: ['fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color'],
      },
      { name: 'Request body view', parity: 'capture-body-view' },
    ],
  })),
  ...['light', 'dark'].map((theme) => ({
    id: theme === 'light' ? 'capture-timing' : 'capture-timing-dark',
    theme,
    mitmActive: false,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      detail: 'open',
      tab: 'timing',
    },
    designShot: `${theme}/capture/inspector-timing.png`,
    rendererActions: [
      { type: 'clickText', text: '/user' },
      { type: 'clickText', text: 'Timing' },
    ],
    targets: [
      {
        name: 'Waiting (TTFB)',
        designSelector: '.tlrow:first-child .tlp',
        appSelector: 'span:text-is("Waiting (TTFB)")',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color'],
      },
      {
        name: '118 ms',
        designSelector: '.tlrow:first-child .tlt',
        appSelector: 'span:text-is("118 ms")',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color'],
      },
      {
        name: 'Response bodies',
        designSelector: '.tlrow:last-child .tlp',
        appSelector: 'span:text-is("Response bodies")',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color'],
      },
      {
        name: '24 ms',
        designSelector: '.tlrow:last-child .tlt',
        appSelector: 'span:text-is("24 ms")',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color'],
      },
    ],
  })),
  {
    id: 'capture-cookies',
    theme: 'light',
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'expanded',
      tab: 'cookies',
    },
    designShot: 'light/capture/inspector-cookies.png',
    rendererActions: [
      { type: 'clickText', text: '/user' },
      { type: 'clickText', text: 'Cookies' },
    ],
    targets: [
      '_device_id',
      'logged_in',
      '_gh_sess',
    ],
  },
  ...['light', 'dark'].map((theme) => ({
    id: theme === 'dark' ? 'capture-grpc-dark' : 'capture-grpc',
    theme,
    mitmActive: false,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      detail: 'open',
      scene: 'grpc',
      tab: 'grpc',
    },
    designShot: `${theme}/capture/inspector-grpc.png`,
    rendererActions: [
      { type: 'clickText', text: '/orders.v1.OrderService/Watch' },
      { type: 'clickText', text: 'Messages' },
      { type: 'clickText', text: 'Message 2' },
    ],
    targets: [
      INSPECTOR_METHOD_TARGET,
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector status', parity: 'capture-inspector-status' },
      'Messages',
      'Response',
      'Message 2',
      'gzip compressed',
      'Response message 2',
      'No descriptor loaded. Payload is shown as raw binary.',
    ],
  })),
  {
    id: 'capture-tunnel',
    theme: 'light',
    mitmActive: false,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'collapsed',
      detail: 'open',
      scene: 'tunnel',
      tab: 'tunnel',
    },
    designShot: 'light/capture/inspector-tunnel.png',
    rendererActions: [{ type: 'clickText', text: 'accounts.google.com' }],
    targets: [
      INSPECTOR_METHOD_TARGET,
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector status', parity: 'capture-inspector-status' },
      'TLS tunnel',
      TLS_TUNNEL_NOTICE_TITLE_TARGET,
      'Decrypt HTTPS (MITM)',
      TLS_PASSTHROUGH_VALUE_TARGET,
      'No local CA was generated or trusted. Only connection metadata is stored.',
    ],
  },
  {
    id: 'capture-tunnel-dark',
    theme: 'dark',
    mitmActive: false,
    designState: {
      view: 'capture',
      theme: 'dark',
      sidebar: 'collapsed',
      detail: 'open',
      scene: 'tunnel',
      tab: 'tunnel',
    },
    designShot: 'dark/capture/inspector-tunnel.png',
    rendererActions: [{ type: 'clickText', text: 'accounts.google.com' }],
    targets: [
      INSPECTOR_METHOD_TARGET,
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector status', parity: 'capture-inspector-status' },
      'TLS tunnel',
      TLS_TUNNEL_NOTICE_TITLE_TARGET,
      'Decrypt HTTPS (MITM)',
      TLS_PASSTHROUGH_VALUE_TARGET,
      'No local CA was generated or trusted. Only connection metadata is stored.',
    ],
  },
  {
    id: 'capture-tunnel-mitm-active',
    theme: 'light',
    mitmActive: true,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'collapsed',
      detail: 'open',
      scene: 'tunnel',
      tab: 'tunnel',
      mitm: 'active',
    },
    designShot: 'light/capture/inspector-tunnel-mitm-active.png',
    rendererActions: [{ type: 'clickText', text: 'accounts.google.com' }],
    targets: [
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector status', parity: 'capture-inspector-status' },
      'TLS tunnel',
      TLS_TUNNEL_NOTICE_TITLE_TARGET,
      { name: 'View passthrough pattern', parity: 'tls-tunnel-view-passthrough' },
      'MITM active',
      TLS_PASSTHROUGH_VALUE_TARGET,
      'MITM is active for new connections. Reconnect this client to inspect its HTTPS traffic.',
    ],
  },
  {
    id: 'capture-tunnel-mitm-active-dark',
    theme: 'dark',
    mitmActive: true,
    designState: {
      view: 'capture',
      theme: 'dark',
      sidebar: 'collapsed',
      detail: 'open',
      scene: 'tunnel',
      tab: 'tunnel',
      mitm: 'active',
    },
    designShot: 'dark/capture/inspector-tunnel-mitm-active.png',
    rendererActions: [{ type: 'clickText', text: 'accounts.google.com' }],
    targets: [
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      { name: 'Inspector status', parity: 'capture-inspector-status' },
      'TLS tunnel',
      TLS_TUNNEL_NOTICE_TITLE_TARGET,
      { name: 'View passthrough pattern', parity: 'tls-tunnel-view-passthrough' },
      'MITM active',
      TLS_PASSTHROUGH_VALUE_TARGET,
      'MITM is active for new connections. Reconnect this client to inspect its HTTPS traffic.',
    ],
  },
  {
    id: 'capture-tunnel-mitm-navigation',
    theme: 'light',
    mitmActive: true,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'collapsed',
      detail: 'open',
      scene: 'tunnel',
      tab: 'tunnel',
      mitm: 'active',
    },
    designShot: 'light/capture/inspector-tunnel-mitm-active.png',
    rendererActions: [{ type: 'clickText', text: 'accounts.google.com' }],
    targets: [
      { name: 'View passthrough pattern', parity: 'tls-tunnel-view-passthrough' },
    ],
  },
  ...['light', 'dark'].map((theme) => ({
    id: `capture-tls-passthrough-target${theme === 'dark' ? '-dark' : ''}`,
    theme,
    mitmActive: true,
    tlsTunnelHost: 'afdfp-rdgateway-r0.wvd.microsoft.com',
    tlsPassthroughHosts: ['*.wvd.microsoft.com'],
    designState: {
      view: 'settings',
      theme,
      sidebar: 'expanded',
      overlay: '',
      settings: 'tls-passthrough',
      tlsPassthrough: 'ready',
      tlsPatterns: ['*.wvd.microsoft.com'],
      tlsPassthroughTargetHost: 'afdfp-rdgateway-r0.wvd.microsoft.com',
      tlsPassthroughTargetPattern: '*.wvd.microsoft.com',
      tlsPassthroughTargetSequence: 1,
      tlsPassthroughTargetExpires: false,
    },
    designShot: `${theme}/settings/tls-passthrough-target.png`,
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: 'afdfp-rdgateway-r0.wvd.microsoft.com' },
      {
        type: 'clickAutomation',
        automationId: 'capture.tls-tunnel.view-passthrough-pattern',
      },
    ],
    targets: [
      { name: 'TLS passthrough target row', parity: 'tls-passthrough-target-row' },
    ],
  })),
  {
    id: 'https-setup',
    theme: 'light',
    freshProfile: true,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'expanded',
      overlay: 'https-setup',
      scene: 'tunnel',
      tab: 'tunnel',
      https: 'fresh',
    },
    designShot: 'light/https-setup/dialog.png',
    rendererActions: [
      { type: 'clickText', text: 'accounts.google.com' },
      { type: 'clickRole', role: 'button', name: 'Decrypt HTTPS (MITM)' },
    ],
    targets: [
      HTTPS_SETUP_TITLE_TARGET,
      { name: 'HTTPS connection diagram', designSelector: '.https-setup .chain', appSelector: '[data-automation-id="capture.https-setup.connection-chain"]', styleKeys: [] },
      'Root Certificate Authority',
      'No CA generated yet',
      'Generate',
      'Install to local trust store',
      'Install…',
      'waiting for trust installation',
      'Cancel',
      'Start decrypting',
    ],
  },
  {
    id: 'https-setup-dark',
    theme: 'dark',
    freshProfile: true,
    designState: {
      view: 'capture',
      theme: 'dark',
      sidebar: 'expanded',
      overlay: 'https-setup',
      scene: 'tunnel',
      tab: 'tunnel',
      https: 'fresh',
    },
    designShot: 'dark/https-setup/dialog.png',
    rendererActions: [
      { type: 'clickText', text: 'accounts.google.com' },
      { type: 'clickRole', role: 'button', name: 'Decrypt HTTPS (MITM)' },
    ],
    targets: [
      HTTPS_SETUP_TITLE_TARGET,
      { name: 'HTTPS connection diagram', designSelector: '.https-setup .chain', appSelector: '[data-automation-id="capture.https-setup.connection-chain"]', styleKeys: [] },
      'Root Certificate Authority',
      'Generate',
      'Install to local trust store',
      'Start decrypting',
    ],
  },
  {
    id: 'https-setup-ready',
    theme: 'light',
    freshProfile: true,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'expanded',
      overlay: 'https-setup',
      scene: 'tunnel',
      tab: 'tunnel',
      https: 'ready',
    },
    designShot: 'light/https-setup/ready.png',
    rendererActions: [
      { type: 'clickText', text: 'accounts.google.com' },
      { type: 'clickRole', role: 'button', name: 'Decrypt HTTPS (MITM)' },
      { type: 'clickRole', role: 'button', name: 'Generate' },
      { type: 'clickRole', role: 'button', name: 'Install…' },
    ],
    targets: [
      HTTPS_SETUP_TITLE_TARGET,
      { name: 'HTTPS connection diagram', designSelector: '.https-setup .chain', appSelector: '[data-automation-id="capture.https-setup.connection-chain"]', styleKeys: [] },
      'Root Certificate Authority',
      'Generated',
      'Install to local trust store',
      'Trusted',
      'Ready',
      'Start decrypting',
    ],
  },
  {
    id: 'import-export',
    theme: 'light',
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'expanded',
      overlay: 'import-export',
      transfer: 'har-export',
    },
    designShot: 'light/import-export/export-har.png',
    rendererActions: [
      {
        type: 'clickText',
        text: '/user',
      },
      {
        type: 'clickRole',
        role: 'button',
        name: 'Export',
      },
      {
        type: 'clickRole',
        role: 'menuitem',
        name: 'Export HAR .har',
      },
    ],
    targets: [
      {
        name: 'Export HAR',
        designSelector: '.dlghead > .transfer-har-export',
        appSelector: '#har-transfer-title',
        measureText: true,
      },
      {
        name: 'HAR warning',
        designSelector: '.dlg .wnote.transfer-har-only',
        appSelector: '[role="dialog"] header + div > div:first-child',
        styleKeys: ['fontSize', 'color', 'backgroundColor', 'borderRadius', 'padding', 'gap'],
      },
      {
        name: 'All traffic',
        designSelector: '.ritem .rc > b:text-is("All traffic")',
        appSelector: '[role="dialog"] strong:text-is("All traffic")',
        measureText: true,
      },
      'Current filter',
      'Selected request',
      'Mask authorization tokens',
      'Mask cookies & Set-Cookie',
      'Strip request/response bodies',
    ],
  },
  {
    id: 'import-export-dark',
    theme: 'dark',
    designState: {
      view: 'capture',
      theme: 'dark',
      sidebar: 'expanded',
      overlay: 'import-export',
      transfer: 'har-export',
    },
    designShot: 'dark/import-export/export-har.png',
    rendererActions: [
      { type: 'clickText', text: '/user' },
      {
        type: 'clickRole',
        role: 'button',
        name: 'Export',
      },
      {
        type: 'clickRole',
        role: 'menuitem',
        name: 'Export HAR .har',
      },
    ],
    targets: [
      {
        name: 'Export HAR',
        designSelector: '.dlghead > .transfer-har-export',
        appSelector: '#har-transfer-title',
        measureText: true,
      },
      {
        name: 'HAR warning',
        designSelector: '.dlg .wnote.transfer-har-only',
        appSelector: '[role="dialog"] header + div > div:first-child',
        styleKeys: ['fontSize', 'color', 'backgroundColor', 'borderRadius', 'padding', 'gap'],
      },
      {
        name: 'All traffic',
        designSelector: '.ritem .rc > b:text-is("All traffic")',
        appSelector: '[role="dialog"] strong:text-is("All traffic")',
        measureText: true,
      },
      'Current filter',
      'Selected request',
      'Mask authorization tokens',
      'Mask cookies & Set-Cookie',
      'Strip request/response bodies',
    ],
  },
  ...['light', 'dark'].flatMap((theme) => ['export', 'import'].map((menu) => ({
    id: `capture-${menu}-menu${theme === 'dark' ? '-dark' : ''}`,
    theme,
    mitmActive: false,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      overlay: '',
      fileMenu: menu,
    },
    designShot: `${theme}/capture/${menu}-menu.png`,
    rendererActions: [
      { type: 'clickAutomation', automationId: `capture.${menu}-menu` },
    ],
    targets: [
      ...(menu === 'export'
        ? [
            { label: 'Export HAR', automationId: 'capture.transfer.har-export' },
            { label: 'Save Capture', automationId: 'capture.transfer.archive-save' },
          ]
        : [
            { label: 'Import HAR', automationId: 'capture.transfer.har-import' },
            { label: 'Open Capture', automationId: 'capture.transfer.archive-open' },
          ]).flatMap(({ label, automationId }) => [
        {
          name: `${label} item`,
          designSelector: `.file-command:has(> span:text-is("${label}"))`,
          appSelector: `[data-automation-id="${automationId}"]`,
          styleKeys: ['padding', 'borderRadius', 'backgroundColor'],
        },
        {
          name: label,
          designSelector: `.file-command > span:text-is("${label}")`,
          appSelector: `[data-automation-id="${automationId}"] > span`,
          measureText: true,
        },
        {
          name: `${label} extension`,
          designSelector: `.file-command:has(> span:text-is("${label}")) > code`,
          appSelector: `[data-automation-id="${automationId}"] > code`,
          styleKeys: ['fontSize', 'color', 'backgroundColor', 'borderWidth', 'borderRadius', 'padding'],
        },
      ]),
    ],
  }))),
  {
    id: 'capture-request-rule-menu',
    theme: 'light',
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'expanded',
      requestMenu: '',
    },
    designShot: 'light/capture/request-rule-menu.png',
    designActions: [
      { type: 'contextMenuSelector', selector: '.list-scroll .row', index: 0 },
    ],
    rendererActions: [
      { type: 'clickText', text: '/user' },
      // 选中后 Inspector 打开，path 列被压缩到 0 宽而不可点，改用同一行的 method 徽章右键。
      { type: 'contextMenuText', text: 'GET', index: 0 },
    ],
    targets: [
      {
        name: 'Request rule menu',
        designSelector: '.ant-dropdown:visible',
        appSelector: '.ant-dropdown:visible',
      },
      'Create rule for this request',
      { name: 'Rewrite header row', parity: 'request-rule-header' },
      { name: 'Breakpoint row', parity: 'request-rule-breakpoint' },
    ],
  },
  {
    id: 'capture-breakpoint-create-menu',
    theme: 'light',
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'collapsed',
      requestMenu: '',
      breakpointState: '',
    },
    designShot: 'light/capture/breakpoint-create-menu.png',
    designActions: [
      { type: 'contextMenuSelector', selector: '.list-scroll .row', index: 0 },
      { type: 'mouseOverSelector', selector: '.ant-dropdown-menu-submenu-title' },
    ],
    rendererActions: [
      { type: 'contextMenuText', text: 'POST', index: 0 },
      {
        type: 'assertSelectorVisible',
        selector: '[data-automation-id="capture.create-rule.http-2.header"]',
      },
      {
        type: 'assertSelectorVisible',
        selector: '[data-automation-id="capture.create-rule.http-2.breakpoint"]',
      },
      { type: 'hoverText', text: 'Breakpoint' },
      { type: 'emitCaptureEvents', count: 40 },
      {
        type: 'assertInsideViewport',
        selector: '.ant-dropdown:visible, .ant-dropdown-menu-submenu-popup:visible',
      },
    ],
    targets: [
      {
        name: 'Request rule menu',
        designSelector: '.ant-dropdown:visible',
        appSelector: '.ant-dropdown:visible',
      },
      {
        name: 'Breakpoint submenu',
        designSelector: '.ant-dropdown-menu-submenu-popup:visible',
        appSelector: '.ant-dropdown-menu-submenu-popup:visible',
      },
      'Create rule for this request',
      'Create breakpoint from request',
      'This endpoint',
      'This path prefix',
      'This host',
      'Custom breakpoint…',
    ],
  },
  {
    id: 'capture-request-menu-dismiss',
    theme: 'light',
    designState: { view: 'capture', theme: 'light', sidebar: 'collapsed' },
    designShot: 'light/capture/framed.png',
    designActions: [{ type: 'hoverText', text: 'Application' }],
    rendererActions: [
      { type: 'contextMenuText', text: 'POST', index: 0 },
      { type: 'hoverText', text: 'Breakpoint' },
      { type: 'clickText', text: 'Application' },
      { type: 'assertTextHidden', text: 'Create rule for this request' },
      { type: 'assertTextHidden', text: 'Create breakpoint from request' },
    ],
    targets: ['Application'],
  },
  {
    id: 'capture-rule-filter',
    theme: 'light',
    rendererNav: 'Rules & Map',
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'expanded',
      detail: 'open',
      ruleFilter: 'rule-auth',
    },
    designShot: 'light/capture/rule-filter-auth.png',
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickRole', role: 'button', name: 'Expand folder', index: 1 },
      { type: 'clickText', text: 'Rewrite auth header' },
      { type: 'clickRole', role: 'button', name: 'Show matching requests' },
      { type: 'clickText', text: 'Application' },
    ],
    targets: [
      {
        name: 'Rule filter option',
        designSelector: '[data-parity="capture-rule-option-rule-auth"]',
        appSelector: '[data-parity="capture-filter-item"]:has-text("Rewrite auth header")',
        styleKeys: ['fontSize', 'fontWeight', 'color', 'backgroundColor'],
      },
      ...CAPTURE_FILTER_CLEAR_TARGETS,
      { name: 'Inspector host', parity: 'capture-inspector-host' },
      'Rule appended',
    ],
  },
  {
    id: 'capture-rule-filter-disabled',
    theme: 'light',
    noRuleHits: true,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'collapsed',
      overlay: '',
      filterGroup: 'rule',
      ruleOptions: 'empty',
    },
    designShot: 'light/capture/rule-filter-disabled.png',
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickRole', role: 'button', name: 'Rule' },
    ],
    targets: [
      'No rule has matched captured traffic yet.',
    ],
  },
  ...['light', 'dark'].map((theme) => ({
    id: `capture-body-preview-limited${theme === 'dark' ? '-dark' : ''}`,
    theme,
    largeTextBody: true,
    mitmActive: false,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      overlay: '',
      detail: 'open',
      tab: 'response',
      bodyPreview: 'limited',
    },
    designShot: `${theme}/capture/body-limited.png`,
    rendererActions: [
      { type: 'clickText', text: '/user' },
      { type: 'clickText', text: 'Response' },
      { type: 'assertSelectorVisible', selector: '[data-parity="capture-body-preview"] .view-line:nth-child(2) span:text-is("html")' },
    ],
    targets: [
      'Showing the first 2 MiB of 12 MiB. The full body remains captured for export.',
      {
        name: 'Limited body preview',
        designSelector: '.bpane[data-pane="code"] > [data-monaco="fill"]',
        appSelector: '[data-parity="capture-body-preview"]',
        styleKeys: ['borderWidth', 'borderRadius', 'backgroundColor'],
      },
      {
        name: 'Limited body code line',
        designSelector: '.bpane[data-pane="code"] .view-line:first-child',
        appSelector: '[data-parity="capture-body-preview"] .view-line:first-child',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight'],
      },
      {
        name: 'Limited body note',
        designSelector: '.bodynote:visible',
        appSelector: '[data-parity="capture-body-view"] > div:has(> svg)',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'padding', 'gap', 'backgroundColor'],
      },
    ],
  })),
  ...['light', 'dark'].map((theme) => ({
    id: `capture-body-media-save${theme === 'dark' ? '-dark' : ''}`,
    theme,
    largeBody: true,
    mitmActive: false,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      overlay: '',
      detail: 'open',
      tab: 'response',
      bodyPreview: 'media',
    },
    designShot: `${theme}/capture/body-media.png`,
    rendererActions: [
      { type: 'clickText', text: '/user' },
      { type: 'clickText', text: 'Response' },
    ],
    targets: [
      { name: 'Media body', parity: 'capture-media-body' },
      ...[
        ['Media icon', '> span:first-of-type', '> div > span:first-of-type', ['width', 'height']],
        ['Media type', '> b', '> div > div > b', ['fontSize', 'fontWeight', 'lineHeight']],
        ['Media size', '> span:nth-of-type(2)', '> div > div > span:first-of-type', ['fontSize', 'fontWeight', 'lineHeight']],
        ['Media reason', '> span:nth-of-type(3)', '> div > div > span:last-child', ['fontSize', 'fontWeight', 'lineHeight']],
      ].map(([name, designTarget, appTarget, styleKeys]) => ({
        name,
        designSelector: `[data-parity="capture-media-body"] ${designTarget}`,
        appSelector: `[data-parity="capture-media-body"] ${appTarget}`,
        styleKeys,
      })),
      'Save body',
    ],
  })),
  {
    id: 'proxy-not-ready',
    theme: 'light',
    proxyEnableFails: true,
    rendererNav: 'Settings',
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'expanded',
      overlay: 'proxy-not-ready',
    },
    designShot: 'light/proxy-not-ready/dialog.png',
    rendererActions: OPEN_RUNTIME_PROXY_READINESS_ACTIONS,
    targets: [
      'Proxy not ready',
      'System Proxy off',
      'Cancel',
      'Proxy & Listener',
      'Enable',
    ],
  },
  {
    id: 'proxy-not-ready-settings',
    theme: 'light',
    proxyEnableFails: true,
    rendererNav: 'Settings',
    designState: {
      view: 'settings',
      theme: 'light',
      sidebar: 'expanded',
      overlay: '',
      settings: 'proxy',
    },
    designShot: 'light/settings/proxy.png',
    rendererActions: [
      ...OPEN_RUNTIME_PROXY_READINESS_ACTIONS,
      { type: 'clickRole', role: 'button', name: 'Proxy & Listener' },
    ],
    targets: [
      'Proxy & Listener',
    ],
  },
  ...['light', 'dark'].flatMap((theme) => {
    const suffix = theme === 'dark' ? '-dark' : '';
    return [
      {
        id: `rules-breakpoint-action${suffix}`,
        theme,
        rendererNav: 'Rules & Map',
        designState: {
          view: 'rules',
          theme,
          sidebar: 'expanded',
          overlay: '',
          ruleBreakpointAction: 'visible',
        },
        designShot: `${theme}/rules/breakpoint-action.png`,
        rendererActions: [
          { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
          { type: 'clickAutomation', automationId: 'rules.row.rule-checkout' },
        ],
        targets: [
          { name: 'Breakpoint action', parity: 'rule-breakpoint-action' },
          { name: 'Phase row', parity: 'rule-breakpoint-phase-row' },
          'Phase',
        ],
      },
    ];
  }),
  ...['light', 'dark'].flatMap((theme) => [
    {
      id: `rules-import-confirm-${theme}`,
      theme,
      rendererNav: 'Rules & Map',
      designState: { view: 'rules', theme, sidebar: 'expanded', overlay: 'rules-import' },
      designShot: `${theme}/rules/import-confirm.png`,
      rendererActions: [{ type: 'clickRole', role: 'button', name: 'Import rules' }],
      targets: RULES_IMPORT_TARGETS,
    },
    {
      id: `rules-import-loading-${theme}`,
      theme,
      rendererNav: 'Rules & Map',
      fileOperationDelayMs: 5_000,
      designState: { view: 'rules', theme, sidebar: 'expanded', overlay: 'rules-import-loading' },
      designShot: `${theme}/rules/import-loading.png`,
      rendererActions: [{ type: 'clickRole', role: 'button', name: 'Import rules' }],
      targets: [{
        name: 'File busy panel',
        designSelector: '.fileBusyPanel',
        appSelector: '[data-automation-id="rules.import.busy"] > div',
      }],
    },
    {
      id: `rules-export-loading-${theme}`,
      theme,
      rendererNav: 'Rules & Map',
      fileOperationDelayMs: 5_000,
      designState: { view: 'rules', theme, sidebar: 'expanded', overlay: 'rules-export-loading' },
      designShot: `${theme}/rules/export-loading.png`,
      rendererActions: [{ type: 'clickRole', role: 'button', name: 'Export rules' }],
      targets: [{
        name: 'File busy panel',
        designSelector: '.fileBusyPanel',
        appSelector: '[data-automation-id="rules.export.busy"] > div',
      }],
    },
  ]),
  ...['light', 'dark'].map((theme) => ({
    id: `rules-action-tag-overflow-${theme}`,
    theme,
    rendererNav: 'Rules & Map',
    designState: { view: 'rules', theme, sidebar: 'expanded', overlay: '' },
    designShot: `${theme}/rules/action-tag-overflow.png`,
    designActions: [{
      type: 'hoverSelector',
      selector: '[data-action-overflow="true"] .actionTagOverflow',
    }],
    rendererActions: [
      ...EXPAND_RULE_TREE_ACTIONS,
      {
        type: 'hoverSelector',
        selector: '[data-automation-id="rules.action-overflow.rule-dispute"]',
      },
    ],
    targets: [
      {
        name: 'Overflow Rule row',
        designSelector: '.rrule:has([data-action-overflow="true"])',
        appSelector: '[data-automation-id="rules.row.rule-dispute"]',
      },
      {
        name: 'First inline action tag',
        designSelector: '[data-action-overflow="true"] > .rchip:nth-child(1)',
        appSelector: '[data-automation-id="rules.action-chip.inline.rule-dispute.0"]',
      },
      {
        name: 'Second inline action tag',
        designSelector: '[data-action-overflow="true"] > .rchip:nth-child(2)',
        appSelector: '[data-automation-id="rules.action-chip.inline.rule-dispute.1"]',
      },
      {
        name: 'Action tag overflow',
        designSelector: '[data-action-overflow="true"] > .actionTagOverflow',
        appSelector: '[data-automation-id="rules.action-overflow.rule-dispute"]',
      },
      {
        name: 'Action tag Tooltip',
        designSelector: '.ant-tooltip:visible',
        appSelector: '.ant-tooltip:visible',
      },
      ...[0, 1, 2, 3].map((index) => ({
        name: `Tooltip action tag ${index + 1}`,
        designSelector: `.ant-tooltip:visible .rchip:nth-child(${index + 1})`,
        appSelector: `[data-automation-id="rules.action-chip.overflow.rule-dispute.${index}"]`,
      })),
    ],
  })),
  {
    id: 'rules-add-action',
    theme: 'light',
    rendererNav: 'Rules & Map',
    designState: {
      view: 'rules',
      theme: 'light',
      sidebar: 'expanded',
      ruleList: 'tree-url',
      pop: true,
    },
    designShot: 'light/rules/add-action.png',
    rendererActions: [
      ...EXPAND_RULE_TREE_ACTIONS,
      { type: 'clickRole', role: 'button', name: 'Add action' },
    ],
    targets: [
      {
        name: 'Add action menu',
        designSelector: '.apop',
        appSelector: '.ant-popover:visible',
      },
    ],
  },
  {
    id: 'rules-select-dropdown',
    theme: 'light',
    rendererNav: 'Rules & Map',
    designState: {
      view: 'rules',
      theme: 'light',
      sidebar: 'expanded',
      ruleList: 'tree-url',
      ruleSelect: 'open',
    },
    designShot: 'light/rules/select-dropdown.png',
    rendererActions: [
      ...EXPAND_RULE_TREE_ACTIONS,
      { type: 'clickRole', role: 'combobox', name: 'Condition field' },
    ],
    targets: [
      {
        name: 'Condition field menu',
        designSelector: '.rule-select-pop',
        appSelector: '.ant-select-dropdown:visible',
      },
    ],
  },
  ...['light', 'dark'].map((theme) => ({
    id: theme === 'light' ? 'composer' : 'composer-dark',
    theme,
    rendererNav: 'Composer',
    designState: { view: 'composer', theme, sidebar: 'expanded' },
    designShot: `${theme}/composer/framed.png`,
    designActions: [
      { type: 'clickSelector', selector: '.ccol [data-grp="github-repos"] .citem:has-text("Create repo")' },
      { type: 'hoverSelector', selector: '.app' },
    ],
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickRole', role: 'button', name: 'Collapse folder', index: 2 },
      { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
      { type: 'clickText', text: 'Create repo' },
      { type: 'clickRole', role: 'button', name: 'Send' },
    ],
    targets: [
      {
        name: 'Collection panel',
        designSelector: '.ccol',
        appSelector: '[data-automation-id="composer.collection"]',
      },
      {
        name: 'GitHub folder row',
        designSelector: '.ccol [data-grp="github"] > .cgrp-h',
        appSelector: '[data-automation-id="composer.collection.folder.collection-github"]',
      },
      {
        name: 'Repositories folder row',
        designSelector: '.ccol [data-grp="github-repos"] > .cgrp-h',
        appSelector: '[data-automation-id="composer.collection.folder.collection-repositories"]',
      },
      {
        name: 'Create repo row',
        designSelector: '.ccol [data-grp="github-repos"] .citem.on',
        appSelector: '[data-automation-id="composer.collection.request.collection-create-repo"]',
      },
      ...[
        { method: 'GET', requestId: 'collection-list-repos' },
        { method: 'POST', requestId: 'collection-create-repo' },
      ].map(({ method, requestId }) => ({
        name: `Collection ${method} badge`,
        designSelector: `.ccol [data-grp="github-repos"] .citem .m:text-is("${method}")`,
        appSelector: `[data-automation-id="composer.collection.request.${requestId}"] > span:first-child`,
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderRadius'],
      })),
      {
        name: 'Document POST badge',
        designSelector: '.cdoc .m.post',
        appSelector: '[role="tab"][aria-selected="true"] > span:first-child',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderRadius'],
      },
      {
        name: 'Request URL',
        designSelector: '[data-parity="composer-url"]',
        appSelector: 'div:has(> input[data-automation-id="composer.url"])',
      },
      {
        name: 'Send',
        designSelector: '[data-parity="composer-send"]',
        appSelector: '[data-automation-id="composer.send"]',
      },
      {
        name: 'Headers tab',
        designSelector: '[data-ctab="headers"]',
        appSelector: '[data-automation-id="composer.tab.headers"]',
      },
      {
        name: 'Response body tab',
        designSelector: '[data-crtab="body"]',
        appSelector: '[data-automation-id="composer.response-tab.body"]',
      },
      '201 Created',
    ],
  })),
  ...['light', 'dark'].flatMap((theme) => [
    {
      id: `composer-import-confirm-${theme}`,
      theme,
      rendererNav: 'Composer',
      designState: { view: 'composer', theme, sidebar: 'expanded', overlay: 'composer-import' },
      designShot: `${theme}/composer/import-confirm.png`,
      rendererActions: [{ type: 'clickRole', role: 'button', name: 'Import collection' }],
      targets: COMPOSER_IMPORT_TARGETS,
    },
    {
      id: `composer-import-loading-${theme}`,
      theme,
      rendererNav: 'Composer',
      fileOperationDelayMs: 5_000,
      designState: { view: 'composer', theme, sidebar: 'expanded', overlay: 'composer-import-loading' },
      designShot: `${theme}/composer/import-loading.png`,
      rendererActions: [{ type: 'clickRole', role: 'button', name: 'Import collection' }],
      targets: [{
        name: 'File busy panel',
        designSelector: '.fileBusyPanel',
        appSelector: '[data-automation-id="composer.import.busy"] > div',
      }],
    },
    {
      id: `composer-export-loading-${theme}`,
      theme,
      rendererNav: 'Composer',
      fileOperationDelayMs: 5_000,
      designState: { view: 'composer', theme, sidebar: 'expanded', overlay: 'composer-export-loading' },
      designShot: `${theme}/composer/export-loading.png`,
      rendererActions: [{ type: 'clickRole', role: 'button', name: 'Export collection' }],
      targets: [{
        name: 'File busy panel',
        designSelector: '.fileBusyPanel',
        appSelector: '[data-automation-id="composer.export.busy"] > div',
      }],
    },
  ]),
  ...['light', 'dark'].map((theme) => ({
    id: `composer-folder-selected-${theme}`,
    theme,
    rendererNav: 'Composer',
    designState: { view: 'composer', theme, sidebar: 'expanded' },
    designShot: `${theme}/composer/collection-folder-selected.png`,
    designActions: [
      {
        type: 'clickSelector',
        selector: '.ccol [data-grp="github-repos"] > .cgrp-h .cgrp-namebtn',
      },
      { type: 'hoverSelector', selector: '.app' },
    ],
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickRole', role: 'button', name: 'Collapse folder', index: 2 },
      { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
      { type: 'clickText', text: 'Create repo' },
      { type: 'clickRole', role: 'button', name: 'Send' },
      {
        type: 'clickSelector',
        selector: '[data-automation-id="composer.collection.folder.collection-repositories"] button[aria-pressed]',
      },
      { type: 'hoverSelector', selector: 'body' },
    ],
    targets: [
      {
        name: 'Selected folder row',
        designSelector: '.ccol [data-grp="github-repos"] > .cgrp-h',
        appSelector: '[data-automation-id="composer.collection.folder.collection-repositories"]',
        styleKeys: ['fontWeight', 'color', 'backgroundColor', 'boxShadow'],
      },
      {
        name: 'Selected folder name',
        designSelector: '.ccol [data-grp="github-repos"] > .cgrp-h .cgrp-n',
        appSelector: '[data-automation-id="composer.collection.folder.collection-repositories"] button[aria-pressed] > span',
        measureText: true,
      },
      {
        name: 'Selected folder count',
        designSelector: '.ccol [data-grp="github-repos"] > .cgrp-h .cgrp-c',
        appSelector: '[data-automation-id="composer.collection.folder.collection-repositories"] > span',
      },
      {
        name: 'Selected folder chevron',
        designSelector: '.ccol [data-grp="github-repos"] > .cgrp-h .cgrp-chev',
        appSelector: '[data-automation-id="composer.collection.folder.collection-repositories"] button[aria-expanded] svg',
        styleKeys: ['color'],
      },
      {
        name: 'Open request row',
        designSelector: '.ccol [data-grp="github-repos"] .citem:has-text("Create repo")',
        appSelector: '[data-automation-id="composer.collection.request.collection-create-repo"]',
        styleKeys: ['fontSize', 'fontWeight', 'color', 'backgroundColor'],
      },
      {
        name: 'Open request name',
        designSelector: '.ccol [data-grp="github-repos"] .citem:has-text("Create repo") .citem-n',
        appSelector: '[data-automation-id="composer.collection.request.collection-create-repo"] > span:last-child',
        measureText: true,
      },
    ],
  })),
  {
    id: 'composer-response-headers',
    theme: 'light',
    rendererNav: 'Composer',
    designState: {
      view: 'composer',
      theme: 'light',
      sidebar: 'expanded',
      composerResponseTab: 'headers',
    },
    designShot: 'light/composer/response-headers.png',
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickRole', role: 'button', name: 'Collapse folder', index: 2 },
      { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
      { type: 'clickText', text: 'Create repo' },
      { type: 'clickText', text: 'Repositories' },
      { type: 'clickRole', role: 'button', name: 'Send' },
      {
        type: 'clickSelector',
        selector: '[data-automation-id="composer.response-tab.headers"]',
      },
    ],
    targets: [
      {
        name: 'Response headers section',
        designSelector: '[role="button"]:has-text("Response Headers")',
        appSelector: '[data-automation-id="composer.response-section.response-headers"]',
      },
      {
        name: 'Request headers section',
        designSelector: '[role="button"]:has-text("Request Headers")',
        appSelector: '[data-automation-id="composer.response-section.request-headers"]',
      },
    ],
  },
  ...['light', 'dark'].map((theme) => ({
    id: theme === 'dark' ? 'settings-dark' : 'settings',
    theme,
    rendererNav: 'Settings',
    designState: { view: 'settings', theme, sidebar: 'expanded', settings: 'certificates' },
    designShot: `${theme}/settings/framed.png`,
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickAutomation', automationId: 'settings.section.certificates' },
    ],
    targets: [
      'Root Certificate Authority',
      'Trust status',
      'HTTPS interception',
      'Generated',
      'Trusted',
      'MITM active',
      'Show in file manager',
      'Regenerate',
      'Add host',
      'api.internal.local',
    ],
  })),
  ...['ready', 'confirm', 'empty', 'unavailable'].flatMap((state) => ['light', 'dark'].map((theme) => ({
    id: `settings-storage-${state}${theme === 'dark' ? '-dark' : ''}`,
    theme,
    rendererNav: 'Settings',
    mitmActive: false,
    storageUsage: {
      sessionCount: 1, exchangeCount: state === 'empty' ? 0 : 18, bodyCount: state === 'empty' ? 0 : 31,
      databaseBytes: 0, blobBytes: state === 'empty' ? 0 : 2_516_582, totalBytes: state === 'empty' ? 0 : 2_516_582,
    },
    storageUnavailable: state === 'unavailable',
    designState: { view: 'settings', theme, sidebar: 'collapsed', settings: 'storage', mitm: 'inactive',
      storageStatus: state === 'unavailable' ? 'unavailable' : 'ready', storageOperation: 'idle',
      storageCleared: state === 'empty', storageConfirming: state === 'confirm' },
    designShot: `${theme}/settings/${state === 'ready' ? 'storage' : `storage-${state}`}.png`,
    rendererActions: [
      { type: 'clickAutomation', automationId: 'settings.section.storage' },
      ...(state === 'confirm' ? [{ type: 'clickAutomation', automationId: 'settings.storage.clear' }] : []),
    ],
    targets: [
      { name: 'Storage heading', designSelector: '[data-review-panel="storage"] > header', appSelector: 'header:has(> h2:text-is("Storage"))', styleKeys: ['gap'] },
      { name: 'Storage title', designSelector: '[data-review-panel="storage"] > header > h2', appSelector: 'header > h2:text-is("Storage")', measureText: true },
      { name: 'Refresh', designSelector: '[data-review-panel="storage"] button[aria-label="Refresh"]', appSelector: '[data-automation-id="settings.storage.refresh"]', styleKeys: ['padding', 'borderRadius', 'color'] },
      'Captured data is kept locally until you clear it or exit.',
      'Usage',
      ...(state === 'unavailable' ? ['Storage status', 'Storage usage could not be read.', 'Unavailable'] : [
        'Captured body data', 'Captured content in memory and temporary files.',
        { name: 'Captured bytes', designSelector: '[data-storage-summary="bytes"] .mono2', appSelector: '[data-automation-id="settings.storage.blob-bytes"]' },
        'Contents',
        ...[
          {label: 'Sessions', id: 'session-count'}, {label: 'Exchanges', id: 'exchange-count'}, {label: 'Stored bodies', id: 'body-count'},
        ].flatMap(({label, id}) => [label, {name: `${label} count`, designSelector: `[data-storage-count="${label}"] .mono2`, appSelector: `[data-automation-id="settings.storage.${id}"]`}]),
      ]),
      'Maintenance',
      { name: 'Clear caption', designSelector: '[data-review-panel="storage"] b:text-is("Clear capture")', appSelector: 'b:text-is("Clear capture")', measureText: true },
      'Same as Clear in the Capture list. Removes captured requests and their bodies together.',
      'Saved files and recording state are unchanged. This cannot be undone.',
      ...(state === 'confirm' ? ['Cancel', 'Confirm clear'] : ['Clear capture…']),
    ],
  }))),
  {
    id: 'settings-proxy',
    theme: 'light',
    rendererNav: 'Settings',
    designState: {
      view: 'settings',
      theme: 'light',
      sidebar: 'expanded',
      settings: 'proxy',
    },
    designShot: 'light/settings/proxy.png',
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: 'Proxy & Listener' },
    ],
    targets: SETTINGS_PROXY_TARGETS,
  },
  {
    id: 'settings-proxy-dark',
    theme: 'dark',
    rendererNav: 'Settings',
    designState: {
      view: 'settings',
      theme: 'dark',
      sidebar: 'expanded',
      settings: 'proxy',
    },
    designShot: 'dark/settings/proxy.png',
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: 'Proxy & Listener' },
    ],
    targets: SETTINGS_PROXY_TARGETS,
  },
  ...['light', 'dark'].map((theme) => ({
    id: `settings-app-containers${theme === 'dark' ? '-dark' : ''}`,
    theme,
    rendererNav: 'Settings',
    designState: {
      view: 'settings',
      theme,
      sidebar: 'expanded',
      settings: 'app-containers',
      appContainers: 'ready',
    },
    designShot: `${theme}/settings/app-containers.png`,
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: 'AppContainer access' },
    ],
    targets: [
      'Choose which Windows app containers may connect to local proxy listeners.',
      'Administrator approval is required for every change.',
      'An enabled container can reach every loopback service on this PC, not only Interceptor at 127.0.0.1:8888. Access remains enabled after Interceptor exits.',
      {
        name: 'AppContainer search',
        designSelector: '[data-app-container-search]',
        appSelector: 'input[aria-label="Search Windows app containers"]',
      },
      '0 enabled · 4 containers',
      'Windows app containers',
      'SID is the stable identity',
      {
        name: 'AppContainer row',
        designSelector: '.appcontainer-row:has(b:text-is("Microsoft AAD Broker Plugin"))',
        appSelector: '[data-exempt]:has(b:text-is("Microsoft AAD Broker Plugin"))',
        styleKeys: ['padding', 'gap', 'borderBottomWidth'],
      },
      'Microsoft AAD Broker Plugin',
      'Windows SSO · Recommended',
      {
        name: 'AppContainer package name',
        designSelector: '.appcontainer-package:text-is("Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy")',
        appSelector: ':text-is("Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy")',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight'],
      },
      'S-1-15-2-1910091885-1573563583-1104941280-2418270861-3411158377-2822700936-2990310272',
      {
        name: 'AppContainer switch',
        designSelector: '[data-app-container-toggle]',
        appSelector: '[role="switch"]',
        styleKeys: ['backgroundColor', 'borderRadius', 'opacity'],
      },
      'Disable all',
      'Enable all',
      'Newly installed or first-run app containers appear after Refresh. Interceptor never enables every container automatically.',
    ],
  })),
  ...['light', 'dark'].flatMap((theme) => ([
    {
      id: `settings-app-container-enable-all${theme === 'dark' ? '-dark' : ''}`,
      theme,
      rendererNav: 'Settings',
      designState: {
        view: 'settings',
        theme,
        sidebar: 'expanded',
        settings: 'app-containers',
        appContainers: 'ready',
        overlay: 'app-container-enable-all',
      },
      designShot: `${theme}/settings/app-container-enable-all.png`,
      rendererActions: [
        { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
        { type: 'clickText', text: 'AppContainer access' },
        { type: 'clickAutomation', automationId: 'settings.app-containers.enable-all' },
      ],
      targets: [
        'Enable all app containers?',
        '4 app containers',
        'This grants access to every loopback port on this PC and persists after Interceptor exits.',
        'Cancel',
        'Continue to Windows approval',
      ],
    },
    {
      id: `settings-app-container-disable-all${theme === 'dark' ? '-dark' : ''}`,
      theme,
      rendererNav: 'Settings',
      designState: {
        view: 'settings',
        theme,
        sidebar: 'expanded',
        settings: 'app-containers',
        appContainers: 'ready',
        overlay: 'app-container-disable-all',
      },
      designShot: `${theme}/settings/app-container-disable-all.png`,
      rendererActions: [
        { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
        { type: 'clickText', text: 'AppContainer access' },
        { type: 'clickAutomation', automationId: 'settings.app-containers.enable-all' },
        { type: 'clickAutomation', automationId: 'settings.app-containers.enable-all-confirm' },
        { type: 'clickAutomation', automationId: 'settings.app-containers.disable-all' },
      ],
      targets: [
        'Disable all app containers?',
        '4 app containers',
        'Apps that depend on local loopback access may stop working until they are enabled again.',
        'Cancel',
        'Continue to Windows approval',
      ],
    },
  ])),
  {
    id: 'tls-compatibility-dialog-add',
    theme: 'light',
    tlsPassthroughHosts: [],
    rendererNav: 'Settings',
    designState: {
      view: 'settings',
      theme: 'light',
      sidebar: 'collapsed',
      overlay: '',
      settings: 'tls-passthrough',
      tlsPassthrough: 'ready',
      tlsPatterns: TLS_COMPATIBILITY_EVENTS.map((event) => event.host),
      tlsCompatibility: '',
    },
    designShot: 'light/tls-compatibility/after-add.png',
    rendererActions: [
      { type: 'clickText', text: 'TLS passthrough' },
      { type: 'emitTlsCompatibility', events: TLS_COMPATIBILITY_EVENTS },
      { type: 'clickRole', role: 'button', name: 'Add 3 patterns' },
    ],
    targets: [
      'Passthrough host patterns',
      {
        name: 'TLS host rows',
        designSelector: '[data-tls-host-pattern]',
        appSelector: '[data-parity^="tls-host-"]',
      },
    ],
  },
  ...['light', 'dark'].map((theme) => ({
    id: `settings-tls-passthrough${theme === 'dark' ? '-dark' : ''}`,
    theme,
    rendererNav: 'Settings',
    designState: {
      view: 'settings',
      theme,
      sidebar: 'expanded',
      settings: 'tls-passthrough',
      tlsPassthrough: 'ready',
      tlsPatterns: ['*.wvd.microsoft.com'],
      tlsCompatibility: '',
    },
    designShot: `${theme}/settings/tls-passthrough.png`,
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: 'TLS passthrough' },
    ],
    targets: [
      'Keep end-to-end TLS for clients that cannot use HTTPS interception while retaining tunnel metadata.',
      'Hostname or wildcard',
      'Add',
      'Passthrough host patterns',
      'Matched before HTTPS interception',
      {
        name: 'TLS passthrough host',
        designSelector: '.tls-host-name > code',
        appSelector: '[data-parity="tls-host-*.wvd.microsoft.com"] code',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight'],
      },
      {
        name: 'Windows 365 · Recommended',
        designSelector: '.tls-host-name > .recommended',
        appSelector: '[data-parity="tls-host-*.wvd.microsoft.com"] code + span',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight', 'backgroundColor'],
      },
      'End-to-end TLS tunnel; request paths, headers, and bodies remain encrypted.',
      'Passthrough traffic still crosses Interceptor and follows the configured upstream proxy. Only CONNECT and tunnel metadata are visible.',
    ],
  })),
  ...['light', 'dark'].map((theme) => ({
    id: `tls-compatibility-dialog${theme === 'dark' ? '-dark' : ''}`,
    theme,
    tlsCompatibilityEvents: TLS_COMPATIBILITY_EVENTS,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      overlay: 'tls-compatibility',
      tlsCompatibility: 'closed',
      tlsCompatibilityHosts: TLS_COMPATIBILITY_EVENTS.map((event) => event.host),
    },
    designShot: `${theme}/tls-compatibility/dialog.png`,
    targets: [
      'TLS interception may be incompatible',
      'The following hosts failed during intercepted TLS handshakes. Each host is preselected on its own; pick a wildcard instead if the whole domain should skip interception.',
      {
        name: 'rdweb.wvd.microsoft.com',
        parity: 'tls-compatibility-host-rdweb.wvd.microsoft.com',
      },
      {
        name: 'TLS compatibility hostname',
        designSelector: '.tls-compatibility-copy > code',
        appSelector: '[data-parity="tls-compatibility-host-rdweb.wvd.microsoft.com"] > div > code',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight'],
      },
      {
        name: 'TLS compatibility reason',
        designSelector: '.tls-compatibility-copy > span',
        appSelector: '[data-parity="tls-compatibility-host-rdweb.wvd.microsoft.com"] > div > span',
        styleKeys: ['fontSize', 'fontWeight', 'lineHeight'],
      },
      {
        name: 'TLS compatibility pattern',
        designSelector: '.tls-pattern-choice',
        appSelector: '[data-parity="tls-compatibility-host-rdweb.wvd.microsoft.com"] label',
        styleKeys: ['gap', 'alignItems'],
      },
      {
        name: 'windows365.microsoft.com',
        parity: 'tls-compatibility-host-windows365.microsoft.com',
      },
      {
        name: 'afdfp-rdgateway-r0.wvd.microsoft.com',
        parity: 'tls-compatibility-host-afdfp-rdgateway-r0.wvd.microsoft.com',
      },
      'Saved patterns apply to new connections immediately and do not interrupt current proxy traffic. TLS passthrough settings will open so you can review the list.',
      'Not now',
      'Add 3 patterns',
    ],
  })),
  ...['checking', 'available', 'downloading', 'downloaded', 'up-to-date', 'failed', 'unsupported'].flatMap((updateState) =>
    ['light', 'dark'].map((theme) => ({
      id: `settings-updates-${updateState}${theme === 'dark' ? '-dark' : ''}`,
      theme,
      updateState,
      rendererNav: 'Settings',
      designState: {
        view: 'settings',
        theme,
        sidebar: 'expanded',
        settings: 'updates',
        update: updateState,
      },
      designShot: `${theme}/settings/updates-${updateState}.png`,
      rendererActions: [
        { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
        { type: 'clickText', text: 'Updates' },
      ],
      targets: [
        'Stable releases from GitHub. Downloads start only when you choose.',
        'Version',
        'Delivery',
        'Current application',
        '0.1.0',
        {
          name: 'Latest GitHub release',
          designSelector: 'b:text-is("Latest GitHub release")',
          appSelector: 'b:text-is("Latest GitHub release")',
          measureText: true,
        },
        'Release source',
        'Check policy',
        'Download policy',
        ...(updateState === 'checking' ? ['Check', 'Reading the latest stable release metadata'].map((name) => ({
          name,
          designSelector: `:text-is("${name}")`,
          appSelector: `:text-is("${name}")`,
          measureText: true,
        })) : []),
        ...(['available', 'downloaded'].includes(updateState) ? [
          {
            name: 'Update notification',
            designSelector: '.unotice',
            appSelector: '[role="status"]:has(b:text-is("' + (updateState === 'available' ? 'Update available' : 'Installer downloaded') + '"))',
            styleKeys: ['padding', 'gap', 'backgroundColor', 'borderRadius'],
          },
          {
            name: updateState === 'available' ? 'Update available' : 'Installer downloaded',
            designSelector: `.uncap:visible > b`,
            appSelector: '[role="status"]:has(b:text-is("' + (updateState === 'available' ? 'Update available' : 'Installer downloaded') + '")) b',
            measureText: true,
          },
          {
            name: 'Update notification action',
            designSelector: '.unotice > .btn:visible',
            appSelector: '[role="status"]:has(b:text-is("' + (updateState === 'available' ? 'Update available' : 'Installer downloaded') + '")) > button:first-of-type',
            styleKeys: ['fontSize', 'fontWeight', 'padding', 'gap', 'borderRadius', 'color', 'backgroundColor'],
          },
        ] : []),
        ...(updateState === 'available' ? ['Download update', '0.1.1 changelog'] : []),
        ...(updateState === 'downloading' ? [
          {
            name: 'Download settings row',
            designSelector: '.srow.update-progress-row',
            appSelector: 'div:has(> div > b:text-is("Download"))',
            styleKeys: ['borderBottomWidth', 'padding'],
          },
          ...['Download', 'Signed installer from GitHub Releases'].map((name) => ({
            name,
            designSelector: `:text-is("${name}")`,
            appSelector: `:text-is("${name}")`,
            measureText: true,
          })),
          '0.1.1 changelog',
        ] : []),
        ...(updateState === 'downloaded' ? ['Open installer', '0.1.1 changelog'] : []),
        ...(updateState === 'up-to-date' ? ['Up to date', 'Current', 'Update action'] : []),
        ...(updateState === 'failed' ? ['Failed', 'Last update action', 'Retry available'] : []),
        ...(updateState === 'unsupported' ? ['Unavailable', 'Release checks unavailable', 'Development'] : []),
      ],
    }))),
  {
    id: 'breakpoints-off',
    theme: 'light',
    breakpointsEnabled: false,
    breakpointManagerRules: true,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'collapsed',
      overlay: '',
      detail: 'closed',
      breakpoints: 'off',
    },
    designShot: 'light/capture/breakpoints-off.png',
    targets: [
      {
        name: 'Breakpoint toolbar button',
        designSelector: '.breakctl',
        appSelector: '[data-automation-id="capture.breakpoint-manager"]',
        styleKeys: ['backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'color'],
      },
      {
        name: 'Breakpoint toolbar icon',
        designSelector: '.breakctl svg',
        appSelector: '[data-automation-id="capture.breakpoint-manager"] svg',
        styleKeys: ['color', 'strokeWidth'],
      },
    ],
  },
  {
    id: 'breakpoint-manager',
    theme: 'light',
    breakpointManagerRules: true,
    designState: {
      view: 'capture',
      theme: 'light',
      sidebar: 'collapsed',
      overlay: '',
      detail: 'closed',
      breakpoints: 'on',
      breakpointPanel: 'open',
    },
    designShot: 'light/capture/breakpoint-manager.png',
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Breakpoint manager' },
    ],
    targets: [
      'Breakpoints',
      '2 enabled · 0 paused',
      'Break on match',
      'Advanced rules',
      'Breakpoint rules',
      'Checkout endpoint',
      'Token API',
      'View rule',
    ],
  },
  ...['light', 'dark'].map((theme) => ({
    id: theme === 'light'
      ? 'breakpoint-created-message'
      : 'breakpoint-created-message-dark',
    theme,
    designState: {
      view: 'capture',
      theme,
      sidebar: 'collapsed',
      overlay: '',
      detail: 'closed',
      breakpointMessage: 'created',
    },
    designShot: `${theme}/capture/breakpoint-created-message.png`,
    designActions: [
      { type: 'hoverText', text: 'Breakpoint created' },
    ],
    rendererActions: [
      { type: 'contextMenuText', text: 'GET', index: 0 },
      { type: 'hoverSelector', selector: '.ant-dropdown-menu-submenu-title' },
      { type: 'clickText', text: 'This endpoint' },
      { type: 'hoverText', text: 'Breakpoint created' },
    ],
    targets: [
      {
        name: 'Breakpoint created message',
        designSelector: '.ant-message-notice',
        appSelector: '.ant-message-notice',
      },
      'Breakpoint created',
      {
        name: 'Undo button',
        designSelector: '.ant-message-notice .ant-btn-primary',
        appSelector: '.ant-message-notice .ant-btn-primary',
      },
      {
        name: 'Close button',
        designSelector: '.ant-message-notice .ant-btn-text',
        appSelector: '.ant-message-notice .ant-btn-text',
      },
    ],
  })),
  {
    id: 'breakpoint-created-message-undo',
    theme: 'light',
    designState: { view: 'rules', theme: 'light', sidebar: 'expanded' },
    designShot: 'light/rules/framed.png',
    rendererActions: [
      { type: 'contextMenuText', text: 'GET', index: 0 },
      { type: 'hoverSelector', selector: '.ant-dropdown-menu-submenu-title' },
      { type: 'clickText', text: 'This endpoint' },
      { type: 'clickRole', role: 'button', name: 'Undo' },
      { type: 'assertTextHidden', text: 'Breakpoint created' },
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickRole', role: 'button', name: 'Rules & Map' },
      { type: 'assertTextHidden', text: 'Breakpoint · api.github.com/user' },
    ],
    targets: RULE_SET_APPLIED_TARGETS,
  },
  {
    id: 'diagnostics',
    theme: 'light',
    rendererNav: 'Diagnostics',
    designState: { view: 'diagnostics', theme: 'light', sidebar: 'expanded' },
    designShot: 'light/diagnostics/framed.png',
    rendererActions: [{ type: 'clickRole', role: 'button', name: 'Toggle sidebar' }],
    targets: [
      'core · core:echo',
      'main · rules:apply',
      'Process',
      'Level',
      'Outcome',
    ],
  },
  {
    id: 'shell-v2-capture-dark',
    theme: 'dark',
    designState: { view: 'capture', theme: 'dark', sidebar: 'expanded', detail: 'open' },
    designShot: 'dark/capture/inspector-sidebar-expanded.png',
    rendererActions: [
      { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
      { type: 'clickText', text: '/user' },
    ],
    targets: [
      { name: 'Capture header', parity: 'window-header-title', measureText: true },
      'Recording',
      { name: 'Inspector host', parity: 'capture-inspector-host' },
    ],
  },
  {
    id: 'shell-v2-capture-collapsed',
    theme: 'light',
    designState: { view: 'capture', theme: 'light', sidebar: 'collapsed', detail: 'open' },
    designShot: 'light/capture/inspector-sidebar-collapsed.png',
    rendererActions: [
      { type: 'clickText', text: '/user' },
    ],
    targets: [
      { name: 'Capture header', parity: 'window-header-title', measureText: true },
      'Recording',
      { name: 'Inspector host', parity: 'capture-inspector-host' },
    ],
  },
  ...[
    ['rules', 'Rules & Map', 'Rules', ['Rule set applied', 'Stub /v1/user']],
    ['composer', 'Composer', 'Composer', ['Protocol', 'Send']],
    ['settings', 'Settings', 'Settings', ['Root Certificate Authority']],
    ['diagnostics', 'Diagnostics', 'Diagnostics', ['Process', 'Level', 'Outcome']],
  ].map(([feature, rendererNav, title, featureTargets]) => ({
    id: `shell-v2-${feature}-dark`,
    theme: 'dark',
    rendererNav,
    designState: {
      view: feature,
      theme: 'dark',
      sidebar: 'expanded',
      ...(feature === 'settings' ? { settings: 'certificates' } : {}),
      ...(feature === 'rules' ? { ruleList: 'tree-url' } : {}),
    },
    designShot: feature === 'rules'
      ? 'dark/rules/tree-url.png'
      : `dark/${feature}/framed.png`,
    designActions: feature === 'composer'
      ? [
          { type: 'clickSelector', selector: '.ccol [data-grp="github-repos"] .citem:has-text("Create repo")' },
          { type: 'hoverSelector', selector: '.app' },
        ]
      : [],
    rendererActions: feature === 'rules'
      ? EXPAND_RULE_TREE_ACTIONS
      : feature === 'composer'
        ? [
            { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
            { type: 'clickRole', role: 'button', name: 'Collapse folder', index: 2 },
            { type: 'clickRole', role: 'button', name: 'Expand folder', index: 0 },
            { type: 'clickText', text: 'Create repo' },
            { type: 'clickRole', role: 'button', name: 'Send' },
          ]
        : [
            { type: 'clickRole', role: 'button', name: 'Toggle sidebar' },
            ...(feature === 'settings'
              ? [{ type: 'clickAutomation', automationId: 'settings.section.certificates' }]
              : []),
          ],
    targets: feature === 'rules'
      ? [
          {
            name: 'Mock folder row',
            designSelector: '.rtree [data-rgrp="mock"] > .rgrp-h',
            appSelector: '[data-automation-id="rules.folder-row.rule-folder-mock"]',
          },
          {
            name: 'Stub rule row',
            designSelector: '.rtree [data-rgrp="mock"] > .rgrp-b > .rrule:first-child',
            appSelector: '[data-automation-id="rules.row.rule-stub"]',
          },
          ...RULE_SET_APPLIED_TARGETS,
        ]
      : feature === 'composer'
        ? [
            {
              name: 'Collection panel',
              designSelector: '.ccol',
              appSelector: '[data-automation-id="composer.collection"]',
            },
            {
              name: 'Create repo row',
              designSelector: '.ccol [data-grp="github-repos"] .citem.on',
              appSelector: '[data-automation-id="composer.collection.request.collection-create-repo"]',
            },
            {
              name: 'Send',
              designSelector: '[data-parity="composer-send"]',
              appSelector: '[data-automation-id="composer.send"]',
            },
            {
              name: 'Response body tab',
              designSelector: '[data-crtab="body"]',
              appSelector: '[data-automation-id="composer.response-tab.body"]',
            },
            '201 Created',
          ]
      : [
          { name: `${title} header`, parity: 'window-header-title', measureText: true },
          'Capture',
          'Local traffic',
          ...featureTargets,
        ],
  })),
];
