const startedAt = Date.parse('2026-07-16T12:00:00.000Z');

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
];

const bodyText = {
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
  statusText: 'OK',
  requestMime: 'application/json',
  requestHeaders: [
    { name: 'accept', value: 'application/vnd.github.v3+json' },
    { name: 'accept-encoding', value: 'gzip, deflate, br' },
  ],
  responseHeaders: [
    { name: 'cache-control', value: 'private, max-age=60, s-maxage=60' },
    { name: 'content-type', value: 'application/json; charset=utf-8' },
  ],
  requestTrailers: [],
  responseTrailers: [],
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

const rules = [
  rule('rule-stub', 'Stub /v1/user', 'api.example.com', '/v1/user', { type: 'map-local', path: 'mocks/user.json' }),
  rule('rule-cors', 'Force CORS + JSON', '*.api.com', '/', { type: 'header', phase: 'response', op: 'set', name: 'access-control-allow-origin', value: '*' }),
  rule('rule-staging', 'Redirect to staging', 'prod.example.com', '/', { type: 'map-remote', scheme: 'https', host: 'stg.example.com' }),
  rule('rule-trackers', 'Block trackers', '*.doubleclick.net', '/', { type: 'block', mode: 'reset' }),
  rule('rule-upload', 'Throttle uploads', 'upload.example.com', '/', { type: 'throttle', phase: 'request', bytesPerSecond: 51_200 }),
  rule('rule-checkout', 'Debug checkout', 'shop.example.com', '/checkout', { type: 'breakpoint', phase: 'request', timeoutMs: 30_000, onTimeout: 'continue' }),
  { ...rule('rule-auth', 'Rewrite auth header', 'api.github.com', '/', { type: 'header', phase: 'request', op: 'set', name: 'authorization', value: 'Bearer parity' }), enabled: false },
  rule('rule-payment', 'Mock payment', 'api.stripe.com', '/v1/charges', { type: 'synthetic', statusCode: 200, headers: [{ name: 'content-type', value: 'application/json' }], body: '{"ok":true}' }),
];

const diagnostics = [
  diagnostic(1, 'req-echo', 'core:echo', 'info', 'success', 4),
  diagnostic(2, 'req-rules', 'rules:apply', 'info', 'success', 12),
  diagnostic(3, 'req-body', 'body:decode', 'warn', 'timed_out', 500),
  diagnostic(4, 'req-export', 'export:jsonl', 'error', 'failed', 31),
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
    body: '{"sku":"pro"}',
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
      host: '127.0.0.1',
      port: 8888,
      sessionId: 'parity-session',
      capturedExchanges: sessions.length,
    },
    sessions,
    details: {
      'http-1': httpDetail,
      'ws-fixture': websocketDetail,
      'grpc-fixture': grpcDetail,
    },
    websocketFrames,
    websocketBreakpointsEnabled: true,
    grpcMessages,
    bodies,
  },
  rules: {
    revision: 42,
    rules,
    hits: [128, 512, 44, 1_200, 8, 3, 76, 21].map((count, index) => ({
      ruleId: rules[index].id,
      count,
    })),
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
  storage: {
    sessionCount: 3,
    exchangeCount: 241,
    bodyCount: 182,
    databaseBytes: 2_359_296,
    blobBytes: 18_874_368,
    totalBytes: 21_233_664,
    quotaBytes: 536_870_912,
  },
  composerResponse: {
    ok: true,
    status: 201,
    statusText: 'Created',
    httpVersion: 'h2',
    headers: [{ name: 'content-type', value: 'application/json' }],
    body: Array.from(new TextEncoder().encode('{"id":843102775,"name":"interceptor","full_name":"acme/interceptor","private":true}')),
    bodyTruncated: false,
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
export function installFakeInterceptor({ fixture, theme }) {
  window.localStorage.setItem('interceptor.theme', theme);
  window.localStorage.setItem('interceptor.lang', 'en');
  let captureStatus = { ...fixture.capture.captureStatus };
  let websocketBreakpointsEnabled = fixture.capture.websocketBreakpointsEnabled;
  let ruleRevision = fixture.rules.revision;
  let currentRules = fixture.rules.rules;
  let breakpointItems = fixture.breakpoints.items;
  let breakpointsEnabled = fixture.breakpoints.enabled;
  let insecureHosts = fixture.insecureHosts;
  let storage = fixture.storage;
  let transferJob = null;

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
    queryDiagnostics: async (request = {}) => {
      const filtered = fixture.diagnostics.records.filter((record) =>
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
    getStorageStatus: async () => storage,
    clearStorage: async () => {
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
      captureStatus = { ...captureStatus, listening: true };
      return captureStatus;
    },
    stopCapture: async () => {
      captureStatus = { ...captureStatus, listening: false };
      return captureStatus;
    },
    onCaptureEvents: () => () => undefined,
    querySessions: async () => ({
      items: fixture.capture.sessions,
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
      const source = new Uint8Array(fixture.capture.bodies[bodyId] ?? []);
      const data = source.slice(offset, offset + length);
      return {
        offset,
        data,
        end: offset + data.length >= source.length,
      };
    },
    getCertificateStatus: async () => fixture.certificate,
    generateCertificate: async () => fixture.certificate,
    installCertificate: async () => fixture.certificate,
    uninstallCertificate: async () => ({ ...fixture.certificate, trusted: false }),
    deleteCertificate: async () => ({
      ...fixture.certificate,
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
    setHttpsDecryption: async (enabled) => ({
      ...fixture.certificate,
      mitmEnabled: enabled,
    }),
    getRules: async () => ({ revision: ruleRevision, rules: currentRules }),
    validateRules: async () => ({ valid: true, diagnostics: [] }),
    replaceRules: async (_expectedRevision, rules) => {
      ruleRevision += 1;
      currentRules = rules;
      return { ok: true, revision: ruleRevision };
    },
    getRuleHits: async () => fixture.rules.hits,
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
    probeConnection: async () => ({
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

function diagnostic(sequence, requestId, command, level, outcome, durationMs) {
  return {
    timestamp: `2026-07-16T12:00:0${sequence}.000Z`,
    sequence,
    level,
    traceId: `trace-${sequence}`,
    requestId,
    command,
    phase: 'command.completed',
    durationMs,
    outcome,
  };
}