import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const startedAt = Date.parse('2026-07-16T12:00:00.000Z');

/** 复用设计稿里从系统提取的真实应用图标，保证两侧比较的是同一张位图。 */
const iconsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../design/app/icons',
);
function clientAppIconDataUrl(name) {
  const bytes = readFileSync(path.join(iconsDirectory, `${name}.png`));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
const clientApps = {
  edge: { id: 'app-edge', name: 'Microsoft Edge' },
  node: { id: 'app-node', name: 'Node.js' },
  code: { id: 'app-code', name: 'Visual Studio Code' },
};

const grpcRequestPayload = Array.from(
  new TextEncoder().encode('watch orders for account 42'),
);
const grpcResponsePayloads = [
  Array.from({ length: 37 }, (_, index) => (index * 7 + 3) % 256),
  Array.from({ length: 1_212 }, (_, index) => (index * 13 + 31) % 256),
  Array.from({ length: 82 }, (_, index) => (index * 5 + 11) % 256),
];

function grpcEnvelope(payload, compressed = false) {
  const length = payload.length;
  return [
    compressed ? 1 : 0,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...payload,
  ];
}

const grpcRequestBody = grpcEnvelope(grpcRequestPayload);
const grpcResponseBody = [
  ...grpcEnvelope(grpcResponsePayloads[0]),
  ...grpcEnvelope(grpcResponsePayloads[1], true),
  ...grpcEnvelope(grpcResponsePayloads[2]),
];

function summary({
  id,
  host,
  path,
  protocol,
  statusCode,
  responseMime,
  responseBytes,
  durationMs,
  method = 'GET',
  state = 'completed',
}) {
  return {
    id,
    method,
    secure: protocol === 'h2',
    host,
    path,
    protocol,
    statusCode,
    responseMime,
    state,
    startedAt: startedAt - Number(id.replace(/\D/g, '') || 0) * 1_000,
    durationMs,
    requestBytes: 0,
    responseBytes,
  };
}

const sessions = [
  summary({ id: 'http-1', host: 'api.github.com', path: '/user', protocol: 'h2', statusCode: 200, responseMime: 'application/json', responseBytes: 1_229, durationMs: 142 }),
  {
    id: 'tls-tunnel',
    method: 'CONNECT',
    secure: true,
    host: 'accounts.google.com',
    protocol: 'tls',
    statusCode: 200,
    responseMime: 'application/x-encrypted-tunnel',
    state: 'request-complete',
    startedAt: startedAt - 500,
    requestBytes: 0,
    responseBytes: 0,
  },
  summary({ id: 'http-2', host: 'login.microsoftonline.com', path: '/common/oauth2/v2.0/token', protocol: 'h2', statusCode: 200, responseMime: 'application/json', responseBytes: 3_482, durationMs: 210, method: 'POST' }),
  summary({ id: 'http-3', host: 'cdn.jsdelivr.net', path: '/npm/react@18/umd/react.min.js', protocol: 'h2', statusCode: 304, responseMime: 'application/javascript', responseBytes: 0, durationMs: 18 }),
  summary({ id: 'http-4', host: 'fonts.gstatic.com', path: '/s/inter/v13/UcC.woff2', protocol: 'h2', statusCode: 200, responseMime: 'font/woff2', responseBytes: 43_008, durationMs: 33 }),
  summary({ id: 'http-5', host: 'api.stripe.com', path: '/v1/charges', protocol: 'http/1.1', statusCode: 401, responseMime: 'application/json', responseBytes: 220, durationMs: 89, method: 'POST' }),
  summary({ id: 'http-6', host: 'graph.microsoft.com', path: '/v1.0/me/messages', protocol: 'h2', statusCode: 200, responseMime: 'application/json', responseBytes: 18_432, durationMs: 320 }),
  summary({ id: 'grpc-fixture', host: 'orders.example.com', path: '/orders.v1.OrderService/Watch', protocol: 'h2', statusCode: 200, responseMime: 'application/grpc+proto', responseBytes: grpcResponseBody.length, durationMs: 1_800, method: 'POST' }),
  {
    id: 'ws-fixture',
    method: 'GET',
    secure: false,
    host: 'realtime.example.com',
    path: '/socket',
    protocol: 'ws',
    statusCode: 101,
    state: 'request-complete',
    startedAt,
    requestBytes: 0,
    responseBytes: 0,
  },
  summary({ id: 'http-7', host: 'api.github.com', path: '/repos/acme/app/hooks/1', protocol: 'h2', statusCode: 204, responseBytes: 0, durationMs: 77, method: 'DELETE' }),
  summary({ id: 'http-8', host: 'api.internal.local', path: '/v2/report', protocol: 'h2', statusCode: 500, responseMime: 'application/json', responseBytes: 512, durationMs: 1_200 }),
  summary({ id: 'http-9', host: 'assets.example.com', path: '/app.css', protocol: 'h2', statusCode: 200, responseMime: 'text/css', responseBytes: 8_240, durationMs: 64 }),
  summary({ id: 'http-10', host: 'telemetry.example.com', path: '/v1/events', protocol: 'h2', statusCode: 202, responseMime: 'application/json', responseBytes: 32, durationMs: 91, method: 'POST' }),
];
sessions[0].ruleIds = ['rule-auth'];
// 与设计稿一一对应；api.internal.local 保持无归属，覆盖进程不可读的降级形态。
const clientAppBySessionId = {
  'http-1': clientApps.edge,
  'tls-tunnel': clientApps.edge,
  'http-2': clientApps.edge,
  'http-3': clientApps.edge,
  'http-4': clientApps.edge,
  'http-5': clientApps.node,
  'http-6': clientApps.code,
  'grpc-fixture': clientApps.node,
  'ws-fixture': clientApps.edge,
  'http-7': clientApps.node,
  'http-9': clientApps.edge,
  'http-10': clientApps.edge,
};
sessions.forEach((session, index) => {
  session.startedAt = startedAt + index * 1_000;
  const clientApp = clientAppBySessionId[session.id];
  if (clientApp) {
    session.appId = clientApp.id;
    session.appName = clientApp.name;
  }
});

const bodyText = {
  'http-request-body': '{"name":"interceptor","enabled":true,"limits":{"requests":250}}',
  'ws-body-1': '{"type":"subscribe","channel":"builds"}',
  'ws-body-2': '{"type":"subscribed","channel":"builds"}',
  'ws-body-3': '{"buildId":8431,"state":"running","branch":"main"}',
};
const bodies = {
  ...Object.fromEntries(
    Object.entries(bodyText).map(([id, value]) => [
      id,
      Array.from(new TextEncoder().encode(value)),
    ]),
  ),
  'ws-body-4': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'grpc-request-body': grpcRequestBody,
  'grpc-response-body': grpcResponseBody,
};

// http-1 携带请求正文，摘要的 requestBytes 必须等于线上正文大小。
sessions[0].requestBytes = bodyText['http-request-body'].length;

const frame = (seq, direction, opcode, elapsed, bodyHash, payloadSize, mediaType) => ({
  seq,
  direction,
  opcode,
  timestamp: startedAt + elapsed,
  payloadSize,
  payload: {
    bodyHash,
    mediaType,
    encodedSize: bodies[bodyHash].length,
    truncated: false,
    decodeStatus: 'ok',
  },
});

const websocketFrames = [
  frame(1, 'client-to-server', 1, 0, 'ws-body-1', 39, 'text/plain; charset=utf-8'),
  frame(2, 'server-to-client', 1, 12, 'ws-body-2', 40, 'text/plain; charset=utf-8'),
  frame(3, 'server-to-client', 1, 1_400, 'ws-body-3', 54, 'application/json'),
  frame(4, 'client-to-server', 2, 2_100, 'ws-body-4', 2_867, 'application/octet-stream'),
];

const httpDetail = {
  summary: sessions[0],
  url: 'https://api.github.com/user',
  scheme: 'https',
  port: 443,
  responseStartedAt: sessions[0].startedAt + 118,
  completedAt: sessions[0].startedAt + 142,
  statusText: 'OK',
  requestMime: 'application/json',
  requestHeaders: [
    { name: 'accept', value: 'application/vnd.github.v3+json' },
    { name: 'accept-encoding', value: 'gzip, deflate, br' },
    { name: 'authorization', value: 'Bearer github_pat_11A…' },
    { name: 'user-agent', value: 'Interceptor/1.0.0 (macOS; arm64)' },
    { name: 'cookie', value: '_device_id=8f2a9c1b4e' },
    { name: 'cookie', value: 'logged_in=yes' },
    { name: 'interceptor', value: 'test', ruleEffect: 'append', ruleId: 'rule-auth' },
    { name: 'x-retired', value: 'legacy' },
    { name: 'x-retired', value: 'legacy', ruleEffect: 'remove', ruleId: 'rule-auth' },
  ],
  responseHeaders: [
    { name: 'cache-control', value: 'private, max-age=60, s-maxage=60' },
    { name: 'content-encoding', value: 'gzip' },
    { name: 'content-type', value: 'application/json; charset=utf-8' },
    { name: 'date', value: 'Fri, 10 Jul 2026 12:00:00 GMT' },
    { name: 'server', value: 'GitHub.com' },
    { name: 'strict-transport-security', value: 'max-age=31536000; includeSubDomains' },
    { name: 'set-cookie', value: '_gh_sess=VszN7pQ…9Qb2' },
    { name: 'x-response-rule', value: 'after' },
    { name: 'x-response-rule', value: 'before', ruleEffect: 'replace', ruleId: 'rule-auth' },
    { name: 'x-response-rule', value: 'after', ruleEffect: 'set', ruleId: 'rule-auth' },
  ],
  requestTrailers: [],
  responseTrailers: [],
  requestBody: {
    bodyHash: 'http-request-body',
    mediaType: 'application/json',
    encodedSize: bodyText['http-request-body'].length,
    truncated: false,
    decodeStatus: 'ok',
  },
};

const websocketDetail = {
  summary: sessions.find((session) => session.id === 'ws-fixture'),
  url: 'ws://realtime.example.com/socket',
  scheme: 'ws',
  port: 80,
  statusText: 'Switching Protocols',
  requestHeaders: [],
  responseHeaders: [],
  requestTrailers: [],
  responseTrailers: [],
};

const tunnelDetail = {
  summary: sessions.find((session) => session.id === 'tls-tunnel'),
  url: 'https://accounts.google.com:443',
  scheme: 'https',
  port: 443,
  statusText: 'OK',
  requestHeaders: [],
  responseHeaders: [],
  requestTrailers: [],
  responseTrailers: [],
};

const grpcDetail = {
  summary: sessions.find((session) => session.id === 'grpc-fixture'),
  url: 'https://orders.example.com/orders.v1.OrderService/Watch',
  scheme: 'https',
  port: 443,
  statusText: 'OK',
  requestMime: 'application/grpc+proto',
  requestHeaders: [
    { name: 'content-type', value: 'application/grpc+proto' },
  ],
  responseHeaders: [
    { name: 'content-type', value: 'application/grpc+proto' },
    { name: 'grpc-encoding', value: 'gzip' },
  ],
  requestTrailers: [],
  responseTrailers: [
    { name: 'grpc-status', value: '0' },
    { name: 'grpc-message', value: 'OK' },
  ],
  requestBody: {
    bodyHash: 'grpc-request-body',
    mediaType: 'application/grpc+proto',
    encodedSize: grpcRequestBody.length,
    truncated: false,
    decodeStatus: 'ok',
  },
  responseBody: {
    bodyHash: 'grpc-response-body',
    mediaType: 'application/grpc+proto',
    encodedSize: grpcResponseBody.length,
    truncated: false,
    decodeStatus: 'ok',
  },
};

const grpcMessages = {
  request: [
    {
      index: 0,
      envelopeOffset: 0,
      payloadOffset: 5,
      payloadLength: grpcRequestPayload.length,
      compressed: false,
      truncated: false,
    },
  ],
  response: [
    {
      index: 0,
      envelopeOffset: 0,
      payloadOffset: 5,
      payloadLength: 37,
      compressed: false,
      truncated: false,
    },
    {
      index: 1,
      envelopeOffset: 42,
      payloadOffset: 47,
      payloadLength: 1_212,
      compressed: true,
      truncated: false,
    },
    {
      index: 2,
      envelopeOffset: 1_259,
      payloadOffset: 1_264,
      payloadLength: 82,
      compressed: false,
      truncated: false,
    },
  ],
};

const stubRule = rule('rule-stub', 'Stub /v1/user', 'api.example.com', '/v1/user', { type: 'map-local', path: 'mocks/user.json' });
stubRule.matchers = [
  { type: 'host', value: 'api.example.com', mode: 'exact' },
  { type: 'path', value: '/v1/user', mode: 'prefix' },
  { type: 'method', value: 'GET, POST' },
];
stubRule.actions = [
  { type: 'map-local', path: 'mocks/user.json' },
  { type: 'header', phase: 'response', op: 'set', name: 'access-control-allow-origin', value: '*' },
];

const corsRule = rule('rule-cors', 'Force CORS + JSON', '*.api.com', '/', { type: 'header', phase: 'response', op: 'set', name: 'access-control-allow-origin', value: '*' });
const paymentRule = rule('rule-payment', 'Mock payment', 'api.stripe.com', '/v1/charges', { type: 'synthetic', statusCode: 200, headers: [{ name: 'content-type', value: 'application/json' }], body: '{"ok":true}' });
const refundRule = rule('rule-refund', 'Refund stub', 'api.stripe.com', '/v1/refunds', { type: 'map-local', path: 'mocks/refund.json' });
const disputeRule = rule('rule-dispute', 'Dispute stub', 'api.stripe.com', '/v1/disputes', { type: 'header', phase: 'response', op: 'set', name: 'x-dispute-fixture', value: 'true' });
const stagingRule = rule('rule-staging', 'Redirect to staging', 'prod.example.com', '/', { type: 'map-remote', scheme: 'https', host: 'stg.example.com' });
const authRule = { ...rule('rule-auth', 'Rewrite auth header', 'api.github.com', '/', { type: 'header', phase: 'request', op: 'set', name: 'authorization', value: 'Bearer parity' }), enabled: false };
const trackersRule = rule('rule-trackers', 'Block trackers', '*.doubleclick.net', '/', { type: 'block', mode: 'reset' });
const uploadRule = rule('rule-upload', 'Delay uploads', 'upload.example.com', '/', { type: 'delay', phase: 'request', ms: 1_000 });
const checkoutRule = rule('rule-checkout', 'Debug checkout', 'shop.example.com', '/checkout', { type: 'breakpoint', phase: 'request', timeoutMs: 30_000, onTimeout: 'continue' });
const rules = [
  stubRule,
  corsRule,
  paymentRule,
  refundRule,
  disputeRule,
  stagingRule,
  authRule,
  trackersRule,
  uploadRule,
  checkoutRule,
];
rules.forEach((ruleDefinition, index) => {
  ruleDefinition.priority = (index + 1) * 10;
});
const ruleNodes = [
  {
    kind: 'folder',
    id: 'rule-folder-mock',
    name: 'Mock & stub',
    children: [
      stubRule,
      corsRule,
      {
        kind: 'folder',
        id: 'rule-folder-payments',
        name: 'Payments',
        children: [
          paymentRule,
          {
            kind: 'folder',
            id: 'rule-folder-refunds',
            name: 'Refunds',
            children: [refundRule, disputeRule],
          },
        ],
      },
    ],
  },
  {
    kind: 'folder',
    id: 'rule-folder-staging',
    name: 'Staging switch',
    children: [stagingRule, authRule],
  },
  {
    kind: 'folder',
    id: 'rule-folder-noise',
    name: 'Noise control',
    children: [trackersRule, uploadRule],
  },
  checkoutRule,
];

const createRepoRequest = collectionRequest(
  'collection-create-repo',
  'Create repo',
  'POST',
  'https://api.github.com/user/repos',
  {
    query: [
      { id: 'query-visibility', name: 'visibility', value: 'all', enabled: true },
      { id: 'query-per-page', name: 'per_page', value: '100', enabled: true },
    ],
    headers: [
      { id: 'header-auth', name: 'authorization', value: 'Bearer github_pat_11A…', enabled: true },
      { id: 'header-content-type', name: 'content-type', value: 'application/json', enabled: true },
      { id: 'header-accept', name: 'accept', value: 'application/vnd.github+json', enabled: true },
      { id: 'header-user-agent', name: 'user-agent', value: 'Interceptor/1.0.0', enabled: false },
    ],
    bodyType: 'json',
    bodyText: '{"name":"interceptor","description":"Desktop network debugging proxy","private":true}',
  },
);
const collectionNodes = [
  {
    kind: 'folder',
    id: 'collection-github',
    name: 'GitHub API',
    children: [
      {
        kind: 'folder',
        id: 'collection-repositories',
        name: 'Repositories',
        children: [
          collectionRequest('collection-list-repos', 'List repos', 'GET', 'https://api.github.com/user/repos'),
          createRepoRequest,
          collectionRequest('collection-update-repo', 'Update repo', 'PATCH', 'https://api.github.com/repos/acme/interceptor'),
        ],
      },
      {
        kind: 'folder',
        id: 'collection-users',
        name: 'Users',
        children: [
          collectionRequest('collection-get-user', 'Get user', 'GET', 'https://api.github.com/users/octocat'),
          collectionRequest('collection-followers', 'List followers', 'GET', 'https://api.github.com/users/octocat/followers'),
        ],
      },
    ],
  },
  {
    kind: 'folder',
    id: 'collection-checkout',
    name: 'Checkout service',
    children: [
      collectionRequest('collection-create-order', 'Create order', 'POST', 'https://checkout.internal/orders'),
      collectionRequest('collection-order-status', 'Order status', 'GET', 'https://checkout.internal/orders/8412'),
      collectionRequest('collection-cancel-order', 'Cancel order', 'DELETE', 'https://checkout.internal/orders/8412'),
    ],
  },
  {
    kind: 'folder',
    id: 'collection-scratch',
    name: 'Scratch',
    children: [
      collectionRequest('collection-graphql', 'GraphQL probe', 'POST', 'https://api.github.com/graphql'),
      collectionRequest('collection-healthz', 'Healthz', 'GET', 'http://127.0.0.1/healthz'),
    ],
  },
];

const diagnostics = [
  diagnostic(1, 'req-echo', 'core:echo', 'info', 'success', 4, 'core'),
  diagnostic(2, 'req-rules', 'rules:apply', 'info', 'success', 12, 'main'),
  diagnostic(3, 'req-body', 'body:decode', 'warn', 'timed_out', 500, 'core'),
  diagnostic(4, 'req-export', 'export:jsonl', 'error', 'failed', 31, 'renderer'),
];

const pendingBreakpoints = [
  {
    id: 'bp-checkout',
    phase: 'request',
    createdAt: startedAt,
    deadline: startedAt + 30_000,
    ruleName: 'Debug checkout',
    method: 'POST',
    url: 'shop.example.com/checkout',
    headers: [{ name: 'content-type', value: 'application/json' }],
    bodyAvailable: false,
  },
  {
    id: 'bp-token',
    phase: 'response',
    createdAt: startedAt + 1_000,
    deadline: startedAt + 31_000,
    ruleName: 'Inspect token',
    statusCode: 200,
    url: 'login.microsoftonline.com/token',
    headers: [{ name: 'content-type', value: 'application/json' }],
    body: '{"access_token":"redacted"}',
  },
];

export const fakeInterceptorFixture = {
  capture: {
    coreStatus: {
      state: 'running',
      pid: 4242,
      restartCount: 0,
      startedAt: '2026-07-16T12:00:00.000Z',
      lastHeartbeatAt: '2026-07-16T12:00:01.000Z',
      updatedAt: '2026-07-16T12:00:01.000Z',
      detail: null,
    },
    captureStatus: {
      listening: true,
      recording: true,
      host: '127.0.0.1',
      port: 8888,
      sessionId: 'parity-session',
      capturedExchanges: sessions.length,
    },
    sessions,
    details: {
      'http-1': httpDetail,
      'tls-tunnel': tunnelDetail,
      'ws-fixture': websocketDetail,
      'grpc-fixture': grpcDetail,
    },
    websocketFrames,
    websocketBreakpointsEnabled: true,
    grpcMessages,
    bodies,
    clientAppIcons: [
      { clientAppId: clientApps.edge.id, icon: clientAppIconDataUrl('edge') },
      { clientAppId: clientApps.node.id, icon: clientAppIconDataUrl('node') },
      { clientAppId: clientApps.code.id, icon: clientAppIconDataUrl('code') },
    ],
  },
  rules: {
    revision: 42,
    nodes: ruleNodes,
    hits: [128, 512, 21, 6, 4, 44, 76, 1_200, 8, 3].map((count, index) => ({
      ruleId: rules[index].id,
      count,
    })),
  },
  collection: {
    revision: 7,
    nodes: collectionNodes,
  },
  breakpoints: {
    enabled: true,
    items: pendingBreakpoints,
  },
  diagnostics: {
    records: diagnostics,
    droppedCount: 0,
  },
  certificate: {
    present: true,
    trusted: true,
    supported: true,
    mitmEnabled: true,
    fingerprint: '8A:13:6B:7F:91:5D:4C:AA:42:10:33:BE:61:29:DD:70',
    subject: 'Interceptor Root CA',
    createdAt: '2026-07-10T12:00:00.000Z',
    expiresAt: '2029-07-10T12:00:00.000Z',
    path: 'C:\\Users\\parity\\Interceptor Root CA.pem',
  },
  insecureHosts: ['api.internal.local'],
  appContainers: {
    supported: true,
    containers: [
      {
        appContainerSid: 'S-1-15-2-1910091885-1573563583-1104941280-2418270861-3411158377-2822700936-2990310272',
        packageFamilyName: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy',
        displayName: 'Microsoft AAD Broker Plugin',
        description: 'Windows sign-in broker',
        packageFullName: 'Microsoft.AAD.BrokerPlugin_1000.19580.1000.3_neutral__cw5n1h2txyewy',
        exempt: false,
      },
      {
        appContainerSid: 'S-1-15-2-3168592183-2270013506-0000000000',
        packageFamilyName: 'Microsoft.Windows.CloudExperienceHost_cw5n1h2txyewy',
        displayName: 'Cloud Experience Host',
        description: null,
        packageFullName: 'Microsoft.Windows.CloudExperienceHost_cw5n1h2txyewy',
        exempt: false,
      },
      {
        appContainerSid: 'S-1-15-2-2061759951-0000000000',
        packageFamilyName: 'MicrosoftWindows.Client.WebExperience_cw5n1h2txyewy',
        displayName: 'Windows Web Experience Pack',
        description: null,
        packageFullName: 'MicrosoftWindows.Client.WebExperience_cw5n1h2txyewy',
        exempt: false,
      },
      {
        appContainerSid: 'S-1-15-2-3641434315-0000000000',
        packageFamilyName: 'Microsoft.SecHealthUI_8wekyb3d8bbwe',
        displayName: 'Windows Security',
        description: null,
        packageFullName: 'Microsoft.SecHealthUI_8wekyb3d8bbwe',
        exempt: false,
      },
    ],
  },
  tlsPassthroughSettings: {
    revision: 1,
    hosts: ['*.wvd.microsoft.com'],
  },
  githubAuth: {
    state: 'signed-out',
    login: null,
    userCode: null,
    verificationUri: null,
    expiresAt: null,
    message: null,
  },
  storage: {
    sessionCount: 3,
    exchangeCount: 241,
    bodyCount: 182,
    databaseBytes: 2_359_296,
    blobBytes: 18_874_368,
    totalBytes: 21_233_664,
  },
  update: {
    supported: true,
    state: 'available',
    currentVersion: '0.1.0',
    latestVersion: '0.1.1',
    progress: null,
    downloadedBytes: null,
    totalBytes: 147_324_928,
    releaseNotes: 'Improves capture navigation and release reliability. Plain text only; links and markup are never executed.',
    message: 'A newer installer is available from GitHub Releases.',
    lastCheckedAt: '2026-07-17T12:00:00.000Z',
  },
  composerResponse: {
    ok: true,
    status: 201,
    statusText: 'Created',
    httpVersion: 'h2',
    headers: [{ name: 'content-type', value: 'application/json' }],
    body: Array.from(new TextEncoder().encode('{"id":843102775,"name":"interceptor","full_name":"acme/interceptor","private":true}')),
    totalBytes: 1_229,
    durationMs: 142,
    tls: {
      protocol: 'TLS 1.3',
      cipher: 'TLS_AES_128_GCM_SHA256',
      alpn: 'h2',
      subject: 'api.github.com',
      issuer: 'DigiCert',
      validFrom: '2026-01-01',
      validTo: '2027-01-01',
    },
    remoteAddress: '140.82.112.3:443',
  },
};

/** Installed with page.addInitScript before Renderer code, mirroring Electron Preload. */
export function installFakeInterceptor({
  fixture,
  theme,
  freshProfile = false,
  largeBody = false,
  largeTextBody = false,
  noRuleHits = false,
  mitmActive = true,
  updateState = 'unsupported',
  githubAuthState = 'signed-in',
  proxyReady = true,
  proxyEnableFails = false,
  tlsCompatibilityEvents = [],
  tlsPassthroughHosts = null,
}) {
  window.localStorage.setItem('interceptor.theme', theme);
  window.localStorage.setItem('interceptor.language', 'en');
  if (noRuleHits) {
    fixture.capture.sessions = fixture.capture.sessions.map((summary) => {
      const { ruleIds: _ruleIds, ...withoutRuleIds } = summary;
      return withoutRuleIds;
    });
  }
  if (largeBody) {
    const largeSummary = {
      ...fixture.capture.sessions[0],
      responseMime: 'video/mp4',
      responseBytes: 67 * 1024 * 1024,
    };
    fixture.capture.sessions[0] = largeSummary;
    fixture.capture.bodies['large-response-body'] = Array.from(
      { length: 64 * 1024 },
      (_value, index) => index % 251,
    );
    fixture.capture.details['http-1'] = {
      ...fixture.capture.details['http-1'],
      summary: largeSummary,
      responseBody: {
        bodyHash: 'large-response-body',
        mediaType: 'video/mp4',
        encodedSize: 67 * 1024 * 1024,
        truncated: false,
        decodeStatus: 'ok',
      },
    };
  }
  if (largeTextBody) {
    const largeSummary = {
      ...fixture.capture.sessions[0],
      responseMime: 'text/html; charset=utf-8',
      responseBytes: 12 * 1024 * 1024,
    };
    fixture.capture.sessions[0] = largeSummary;
    fixture.capture.bodies['large-text-response-body'] = Array.from(
      new TextEncoder().encode(
        `<!doctype html><html lang="zh-CN"><head><title>大唐 EV</title></head><body>\n${
          Array.from({ length: 120 }, (_value, index) => `<section>配置参数 ${index + 1}</section>`).join('\n')
        }\n</body></html>`,
      ),
    );
    fixture.capture.details['http-1'] = {
      ...fixture.capture.details['http-1'],
      summary: largeSummary,
      responseBody: {
        bodyHash: 'large-text-response-body',
        mediaType: 'text/html; charset=utf-8',
        encodedSize: 12 * 1024 * 1024,
        truncated: false,
        decodeStatus: 'ok',
      },
    };
  }
  let captureStatus = { ...fixture.capture.captureStatus };
  let captureGeneration = 1;
  let systemProxyStatus = {
    supported: true,
    enabled: proxyReady,
    owned: proxyReady,
    ownershipLost: false,
    proxyServer: proxyReady
      ? 'http=127.0.0.1:8888;https=127.0.0.1:8888'
      : null,
    bypassList: proxyReady ? '<local>' : null,
    pacUrl: null,
    autoDetect: false,
  };
  let certificate = freshProfile
    ? {
        ...fixture.certificate,
        present: false,
        trusted: false,
        mitmEnabled: false,
        fingerprint: null,
        subject: null,
        createdAt: null,
        expiresAt: null,
        path: null,
      }
    : { ...fixture.certificate, mitmEnabled: mitmActive };
  let websocketBreakpointsEnabled = fixture.capture.websocketBreakpointsEnabled;
  let ruleRevision = fixture.rules.revision;
  let currentRuleNodes = fixture.rules.nodes;
  let collectionRevision = fixture.collection.revision;
  let currentCollectionNodes = fixture.collection.nodes;
  let breakpointItems = fixture.breakpoints.items;
  let breakpointsEnabled = fixture.breakpoints.enabled;
  let insecureHosts = fixture.insecureHosts;
  let appContainerSnapshot = {
    ...fixture.appContainers,
    containers: fixture.appContainers.containers.map((appContainer) => ({
      ...appContainer,
    })),
  };
  let tlsPassthroughSettings = {
    ...fixture.tlsPassthroughSettings,
    hosts: [...(tlsPassthroughHosts ?? fixture.tlsPassthroughSettings.hosts)],
  };
  const tlsCompatibilityListeners = new Set();
  window.__emitTlsCompatibility = (events) => {
    events.forEach((event) => {
      tlsCompatibilityListeners.forEach((listener) => listener(event));
    });
  };
  let githubAuthStatus = githubAuthState === 'signed-in'
    ? {
        ...fixture.githubAuth,
        state: 'signed-in',
        login: 'zhxmt-xm',
        message: 'GitHub authorization is stored securely on this device.',
      }
    : githubAuthState === 'authorizing'
      ? {
          ...fixture.githubAuth,
          state: 'authorizing',
          userCode: 'F7D2-9A4C',
          verificationUri: 'https://github.com/login/device',
          expiresAt: '2026-08-07T00:15:00.000Z',
          message: 'Enter the one-time code in GitHub to authorize this device.',
        }
      : githubAuthState === 'failed'
        ? {
            ...fixture.githubAuth,
            state: 'failed',
            message: 'The GitHub authorization code expired. Try again.',
          }
        : { ...fixture.githubAuth };
  const githubAuthListeners = new Set();
  const publishGitHubAuthStatus = () => {
    for (const listener of githubAuthListeners) listener({ ...githubAuthStatus });
  };
  let storage = fixture.storage;
  let transferJob = null;
  let updateStatus = updateState === 'unsupported'
    ? {
        ...fixture.update,
        supported: false,
        state: 'unsupported',
        latestVersion: null,
        progress: null,
        downloadedBytes: null,
        totalBytes: null,
        releaseNotes: null,
        message: 'Release checks run only in packaged Windows and macOS builds.',
      }
    : updateState === 'authentication-required'
      ? {
          ...fixture.update,
          state: 'authentication-required',
          latestVersion: null,
          totalBytes: null,
          releaseNotes: null,
          message: 'Sign in with GitHub to access private releases.',
        }
    : updateState === 'checking'
      ? {
          ...fixture.update,
          state: 'checking',
          latestVersion: null,
          totalBytes: null,
          releaseNotes: null,
          message: 'Checking private GitHub Releases…',
        }
      : updateState === 'up-to-date'
        ? {
            ...fixture.update,
            state: 'up-to-date',
            latestVersion: '0.1.0',
            totalBytes: null,
            releaseNotes: null,
            message: 'Interceptor is up to date.',
          }
        : updateState === 'failed'
          ? {
              ...fixture.update,
              state: 'failed',
              latestVersion: null,
              totalBytes: null,
              releaseNotes: null,
              message: 'GitHub Releases could not be reached. The installed app was not changed.',
            }
          : {
              ...fixture.update,
              state: updateState,
              progress: updateState === 'downloading'
                ? 0.42
                : updateState === 'downloaded'
                  ? 1
                  : null,
              downloadedBytes: updateState === 'downloading'
                ? 61_876_470
                : updateState === 'downloaded'
                  ? fixture.update.totalBytes
                  : null,
              message: updateState === 'downloaded'
                ? 'Interceptor 0.1.1 is downloaded and ready to open.'
                : fixture.update.message,
            };

  window.interceptor = {
    echoCore: async (value) => ({
      value,
      handledAt: '2026-07-16T12:00:00.000Z',
      traceId: 'trace-parity',
    }),
    getCoreProcessStatus: async () => fixture.capture.coreStatus,
    getCoreTrace: async (traceId) => ({
      traceId,
      records: fixture.diagnostics.records,
      droppedCount: fixture.diagnostics.droppedCount,
    }),
    getRecentDiagnostics: async () => fixture.diagnostics,
    reportRendererDiagnostic: async () => undefined,
    getUpdateStatus: async () => updateStatus,
    checkForUpdates: async () => updateStatus,
    downloadUpdate: async () => {
      updateStatus = {
        ...updateStatus,
        state: 'downloaded',
        progress: 1,
        downloadedBytes: updateStatus.totalBytes,
      };
      return updateStatus;
    },
    openDownloadedUpdate: async () => undefined,
    onUpdateStatusChange: () => () => undefined,
    closeApplication: async () => undefined,
    minimizeWindow: async () => undefined,
    toggleMaximizeWindow: async () => true,
    getSystemProxyStatus: async () => systemProxyStatus,
    enableSystemProxy: async () => {
      if (proxyEnableFails) {
        return systemProxyStatus;
      }
      systemProxyStatus = {
        ...systemProxyStatus,
        enabled: true,
        owned: true,
        proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
        bypassList: '<local>',
      };
      return systemProxyStatus;
    },
    restoreSystemProxy: async () => ({
      restored: true,
      status: (systemProxyStatus = {
        ...systemProxyStatus,
        enabled: false,
        owned: false,
        proxyServer: null,
        bypassList: null,
      }),
    }),
    listAppContainers: async () => appContainerSnapshot,
    setAppContainerLoopbackExemption: async (appContainerSid, enabled) => {
      appContainerSnapshot = {
        ...appContainerSnapshot,
        containers: appContainerSnapshot.containers.map((appContainer) =>
          appContainer.appContainerSid === appContainerSid
            ? { ...appContainer, exempt: enabled }
            : appContainer),
      };
      return appContainerSnapshot;
    },
    getTlsPassthroughSettings: async () => tlsPassthroughSettings,
    replaceTlsPassthroughSettings: async (expectedRevision, hosts) => {
      if (expectedRevision !== tlsPassthroughSettings.revision) {
        return { ok: false, reason: 'conflict', message: 'Revision conflict' };
      }
      tlsPassthroughSettings = {
        revision: expectedRevision + 1,
        hosts: [...new Set(hosts.map((host) => host.trim().toLowerCase()))],
      };
      return { ok: true, settings: tlsPassthroughSettings };
    },
    onTlsCompatibilityChange: (listener) => {
      tlsCompatibilityListeners.add(listener);
      tlsCompatibilityEvents.forEach((event) => queueMicrotask(() => listener(event)));
      return () => tlsCompatibilityListeners.delete(listener);
    },
    getGitHubAuthStatus: async () => githubAuthStatus,
    signInWithGitHub: async () => {
      githubAuthStatus = {
        ...fixture.githubAuth,
        state: 'authorizing',
        userCode: 'F7D2-9A4C',
        verificationUri: 'https://github.com/login/device',
        expiresAt: '2026-08-07T00:15:00.000Z',
        message: 'Enter the one-time code in GitHub to authorize this device.',
      };
      publishGitHubAuthStatus();
      return githubAuthStatus;
    },
    openGitHubAuthorization: async () => undefined,
    signOutFromGitHub: async () => {
      githubAuthStatus = { ...fixture.githubAuth };
      publishGitHubAuthStatus();
      return githubAuthStatus;
    },
    onGitHubAuthStatusChange: (listener) => {
      githubAuthListeners.add(listener);
      return () => githubAuthListeners.delete(listener);
    },
    queryDiagnostics: async (request = {}) => {
      const filtered = fixture.diagnostics.records.filter((record) =>
        (!request.process || record.process === request.process) &&
        (!request.level || record.level === request.level) &&
        (!request.outcome || record.outcome === request.outcome) &&
        (!request.traceId || record.traceId === request.traceId) &&
        (!request.command || record.command === request.command) &&
        (request.minDurationMs === undefined ||
          (record.durationMs ?? 0) >= request.minDurationMs) &&
        (request.maxDurationMs === undefined ||
          (record.durationMs ?? 0) <= request.maxDurationMs));
      const offset = Number(request.cursor ?? 0);
      const limit = request.limit ?? 200;
      const records = filtered.slice(offset, offset + limit);
      const nextOffset = offset + records.length;
      return {
        records,
        ...(nextOffset < filtered.length ? { nextCursor: String(nextOffset) } : {}),
        hasMore: nextOffset < filtered.length,
        droppedCount: fixture.diagnostics.droppedCount,
      };
    },
    onCoreProcessStatusChange: () => () => undefined,
    getCaptureUsage: async () => storage,
    clearCapture: async () => {
      storage = {
        ...storage,
        sessionCount: 0,
        exchangeCount: 0,
        bodyCount: 0,
        blobBytes: 0,
        totalBytes: storage.databaseBytes,
      };
      return storage;
    },
    getCaptureStatus: async () => captureStatus,
    startCapture: async () => {
      captureGeneration += 1;
      captureStatus = {
        ...captureStatus,
        listening: true,
        recording: true,
        sessionId: `parity-session-${captureGeneration}`,
        capturedExchanges: 0,
      };
      return captureStatus;
    },
    stopCapture: async () => {
      captureStatus = { ...captureStatus, recording: false };
      return captureStatus;
    },
    onCaptureEvents: () => () => undefined,
    onClientAppIcons: (listener) => {
      // 真实环境里图标由 Main 异步推送；parity 场景一次交付全部。
      queueMicrotask(() => listener(fixture.capture.clientAppIcons));
      return () => undefined;
    },
    querySessions: async (request) => ({
      items: !request.filter?.sessionId || request.filter.sessionId === captureStatus.sessionId
        ? fixture.capture.sessions
        : [],
      hasMore: false,
    }),
    getExchangeDetail: async (exchangeId) =>
      fixture.capture.details[exchangeId] ?? null,
    queryWebSocketFrames: async (request) => {
      const cursor = request.cursor ? Number(request.cursor) : 0;
      const eligible = fixture.capture.websocketFrames.filter(
        (item) =>
          item.seq > cursor &&
          (!request.direction || item.direction === request.direction),
      );
      const items = eligible.slice(0, request.limit);
      return {
        items,
        nextCursor: String(items.at(-1)?.seq ?? cursor),
        hasMore: eligible.length > items.length,
        breakpointsEnabled: websocketBreakpointsEnabled,
      };
    },
    setWebSocketBreakpointsEnabled: async (enabled) => {
      websocketBreakpointsEnabled = enabled;
      return enabled;
    },
    queryGrpcMessages: async (request) => {
      const all = fixture.capture.grpcMessages[request.side];
      const cursor = request.cursor ? Number(request.cursor) : 0;
      const eligible = all.filter((message) => message.index >= cursor);
      const items = eligible.slice(0, request.limit);
      const nextIndex = (items.at(-1)?.index ?? cursor - 1) + 1;
      const bodyId = request.side === 'request'
        ? 'grpc-request-body'
        : 'grpc-response-body';
      return {
        recognized: true,
        side: request.side,
        contentType: 'application/grpc+proto',
        encoding: request.side === 'response' ? 'gzip' : undefined,
        bodyHash: bodyId,
        bodySize: fixture.capture.bodies[bodyId].length,
        items,
        nextCursor: eligible.length > items.length ? String(nextIndex) : undefined,
        hasMore: eligible.length > items.length,
      };
    },
    readBody: async (bodyId, offset, length) => {
      if (largeBody && bodyId === 'large-response-body') {
        throw new Error('Media bodies must not be read into the Renderer.');
      }
      const source = new Uint8Array(fixture.capture.bodies[bodyId] ?? []);
      const data = source.slice(offset, offset + length);
      return {
        offset,
        data,
        end: offset + data.length >= source.length,
      };
    },
    getCertificateStatus: async () => certificate,
    generateCertificate: async () => {
      certificate = {
        ...fixture.certificate,
        trusted: false,
        mitmEnabled: certificate.mitmEnabled,
      };
      return certificate;
    },
    installCertificate: async () => {
      certificate = { ...certificate, present: true, trusted: true };
      return certificate;
    },
    uninstallCertificate: async () => {
      certificate = { ...certificate, trusted: false };
      return certificate;
    },
    deleteCertificate: async () => ({
      ...certificate,
      present: false,
      trusted: false,
      fingerprint: null,
      subject: null,
      createdAt: null,
      expiresAt: null,
      path: null,
    }),
    revealCertificate: async () => undefined,
    viewCertificate: async () => undefined,
    openCertificateManager: async () => undefined,
    getInsecureHosts: async () => insecureHosts,
    setInsecureHosts: async (hosts) => {
      insecureHosts = hosts;
      return insecureHosts;
    },
    setHttpsDecryption: async (enabled) => {
      certificate = { ...certificate, mitmEnabled: enabled };
      return certificate;
    },
    getRules: async () => ({ revision: ruleRevision, nodes: currentRuleNodes }),
    replaceRules: async (_expectedRevision, nodes) => {
      ruleRevision += 1;
      currentRuleNodes = nodes;
      return { ok: true, revision: ruleRevision };
    },
    getRuleHits: async () => fixture.rules.hits,
    getCollection: async () => ({
      revision: collectionRevision,
      nodes: currentCollectionNodes,
    }),
    replaceCollection: async (_expectedRevision, nodes) => {
      collectionRevision += 1;
      currentCollectionNodes = nodes;
      return { ok: true, revision: collectionRevision };
    },
    exportCollection: async () => true,
    exportRules: async () => true,
    sendComposerRequest: async () => ({
      ...fixture.composerResponse,
      body: new Uint8Array(fixture.composerResponse.body),
    }),
    listBreakpoints: async () => ({
      breakpoints: breakpointItems,
      enabled: breakpointsEnabled,
    }),
    resolveBreakpoint: async (breakpointId, action, edit) => {
      breakpointItems = breakpointItems.filter((item) => item.id !== breakpointId);
      return { state: action === 'drop' ? 'dropped' : edit ? 'edited' : 'continued' };
    },
    setBreakpointsEnabled: async (enabled) => {
      breakpointsEnabled = enabled;
      return enabled;
    },
    probeTls: async () => ({
      ok: true,
      protocol: 'TLS 1.3',
      cipher: 'TLS_AES_128_GCM_SHA256',
      alpn: 'h2',
      authorized: true,
      certificates: [],
    }),
    startHarExport: async () => {
      transferJob = {
        id: 'transfer-parity-export',
        kind: 'har-export',
        state: 'running',
        fileName: 'interceptor-2026-07-17.har',
        processed: 0,
        total: fixture.capture.sessions.length,
        startedAt: '2026-07-17T12:00:00.000Z',
        warnings: [],
      };
      return transferJob;
    },
    startBodyExport: async () => null,
    startHarImport: async () => {
      transferJob = {
        id: 'transfer-parity-import',
        kind: 'har-import',
        state: 'running',
        fileName: 'fixture.har',
        processed: 0,
        total: 18,
        startedAt: '2026-07-17T12:00:00.000Z',
        warnings: [],
      };
      return transferJob;
    },
    startArchiveExport: async () => {
      transferJob = {
        id: 'transfer-parity-archive-export',
        kind: 'archive-export',
        state: 'running',
        fileName: 'interceptor-2026-07-17.iarchive',
        processed: 0,
        total: fixture.capture.sessions.length + 1,
        startedAt: '2026-07-17T12:00:00.000Z',
        warnings: [],
      };
      return transferJob;
    },
    startArchiveImport: async () => {
      transferJob = {
        id: 'transfer-parity-archive-import',
        kind: 'archive-import',
        state: 'running',
        fileName: 'fixture.iarchive',
        processed: 0,
        total: 18,
        startedAt: '2026-07-17T12:00:00.000Z',
        warnings: [],
      };
      return transferJob;
    },
    startDiagnosticsExport: async () => {
      transferJob = {
        id: 'transfer-parity-diagnostics-export',
        kind: 'diagnostics-export',
        state: 'running',
        fileName: 'interceptor-diagnostics-2026-07-17.jsonl',
        processed: 0,
        total: 200,
        startedAt: '2026-07-17T12:00:00.000Z',
        warnings: [],
      };
      return transferJob;
    },
    getTransferJob: async () => {
      if (transferJob?.state === 'running') {
        transferJob = {
          ...transferJob,
          state: 'completed',
          processed: transferJob.total,
          completedAt: '2026-07-17T12:00:01.000Z',
        };
      }
      return transferJob;
    },
    cancelTransferJob: async () => {
      if (transferJob) {
        transferJob = { ...transferJob, state: 'cancelled' };
      }
      return transferJob;
    },
  };
}

function rule(id, name, host, path, action) {
  return {
    kind: 'rule',
    id,
    name,
    enabled: true,
    priority: 100,
    matchers: [
      { type: 'host', value: host, mode: 'wildcard' },
      { type: 'path', value: path, mode: 'exact' },
    ],
    actions: [action],
  };
}

function diagnostic(
  sequence,
  requestId,
  command,
  level,
  outcome,
  durationMs,
  process,
) {
  return {
    timestamp: `2026-07-16T12:00:0${sequence}.000Z`,
    sequence,
    level,
    process,
    traceId: `trace-${sequence}`,
    requestId,
    command,
    phase: 'command.completed',
    durationMs,
    outcome,
  };
}

function collectionRequest(id, name, method, url, overrides = {}) {
  return {
    kind: 'request',
    id,
    name,
    method,
    url,
    protocol: 'auto',
    query: [],
    headers: [],
    bodyType: 'none',
    bodyText: '',
    bodyForm: [],
    auth: { type: 'none', token: '', username: '', password: '' },
    ...overrides,
  };
}