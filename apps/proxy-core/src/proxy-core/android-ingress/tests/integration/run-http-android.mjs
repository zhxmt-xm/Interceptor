import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createPrivateKey, webcrypto, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import {
  createSecureServer as createHttp2Server, createServer as createCleartextHttp2Server, constants as http2Constants,
} from 'node:http2';
import { TLSSocket } from 'node:tls';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { generateCACertificate } from 'mockttp';
import { WebSocketServer } from 'ws';
import {
  BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension,
  KeyUsageFlags, KeyUsagesExtension, SubjectAlternativeNameExtension, X509CertificateGenerator,
} from '@peculiar/x509';

const { values } = parseArgs({ options: {
  serial: { type: 'string' }, 'android-repo': { type: 'string' },
  'evidence-dir': { type: 'string' }, adb: { type: 'string', default: 'adb' },
  'emulator-origin': { type: 'boolean', default: false },
} });
assert(values.serial && values['android-repo'] && values['evidence-dir'],
  'Specify --serial, --android-repo and --evidence-dir; build both debug APKs first.');
const directory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const evidence = path.resolve(values['evidence-dir']);
await mkdir(evidence, { recursive: true });
const scratch = await mkdtemp(path.join(os.tmpdir(), 'interceptor-http-android-'));
const appId = 'com.zhxmt.interceptor.android';
const adb = (...args) => execFileSync(values.adb, ['-s', values.serial, ...args], {
  encoding: 'utf8', timeout: 15_000,
});
async function openReverseListener(hostPort) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const devicePort = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  // 显式端口使host登记与后续remove使用同一key。 / Use the same explicit key for host registration and removal.
  adb('reverse', '--no-rebind', `tcp:${devicePort}`, `tcp:${hostPort}`);
  return devicePort;
}
const pin = certificate => `sha256/${createHash('sha256')
  .update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64')}`;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const cleanupFailures = [];
const recordings = [];
const webSocketRecords = [];
const originWebSocketServers = [];
const originWebSocketPeers = new Set();
const originHttp2Sessions = new Set();
const http2SessionEvidence = [];
const http2SessionRecords = new WeakMap();
let server;
let plainServer;
let http2Server;
let cleartextHttp2Server;
let androidIngressService;
let captureService;
let ingressPort;
let child;
let instrumentation;
let reversePort;
let reverseOriginPort;
let reversePlainOriginPort;
let reverseHttp2OriginPort;
let reverseCleartextHttp2OriginPort;
let breakpointQueue;
let poll;
let labFailure;
let runFailure;
let output = '';
let settled = 0;
let approvals = 0;
let nativeTlsApprovals = 0;
let webSocketApprovals = 0;
let webSocketSettings = null;
let cancelSignalled = false;
let nativePendingSignalled = false;
let nativeWebSocketPendingSignalled = false;
let nativeHttp2PendingSignalled = false;
let http2BreakpointApprovals = 0;
let http2OriginAttempts = 0;
let originAttempts = 0;
let originClientCertificates = 0;
const originRequests = [];
const http2OriginRequests = [];

try {
  if (values['emulator-origin']) {
    assert.equal(adb('shell', 'getprop', 'ro.kernel.qemu').trim(), '1',
      '--emulator-origin requires an Android emulator');
  }
  // 准备真实双端组件与临时身份。 / Prepare real components and ephemeral identities.
  await build({
    stdin: { contents: [
      "export { HttpChannel } from '../../internal/http-channel';",
      "export { AndroidIngressService } from '../../entry';",
      "export { HttpInterceptionService } from '../../../http-interception/entry';",
      "export { HttpMessageService } from '../../../http-message/entry';",
      "export { RuleService } from '../../../rules/entry';",
      "export { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';",
      "export { CoreDiagnostics } from '../../../core-diagnostics';",
      "export { CaptureService } from '../../../capture/entry';",
      "export { CaptureEventQueue } from '../../../proxy/internal/capture-event-queue';",
      "export { HttpRecording } from '../../internal/http-recording';",
      "export { initializeRuntime } from '../../../constants';",
    ].join('\n'), resolveDir: directory, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', target: 'node24',
    outfile: path.join(scratch, 'runtime.cjs'),
    plugins: [{ name: 'existing-runtime', setup(builder) {
      builder.onResolve({ filter: /^(ws|mockttp|pac-proxy-agent)$/ }, ({ path: name }) => ({
        path: require.resolve(name), external: true,
      }));
    } }],
  });
  const runtime = require(path.join(scratch, 'runtime.cjs'));
  runtime.initializeRuntime([`--data-dir=${path.join(scratch, 'capture')}`]);
  captureService = new runtime.CaptureService();
  await captureService.initialize();
  await captureService.ensureSession({ id: 'android-lab', name: 'Android protocol lab',
    startedAt: Date.now(), captureMode: 'android', appVersion: '0.1.0' });
  const captureEventQueue = new runtime.CaptureEventQueue();
  breakpointQueue = new runtime.BreakpointQueue();
  const ruleService = new runtime.RuleService(breakpointQueue);
  ruleService.setRuleSet({ revision: 1, nodes: [
    { kind: 'rule', id: 'inspect', name: 'Inspect', priority: 1, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/inspect' }],
      actions: [
        { type: 'header', phase: 'request', op: 'set', name: 'x-pc-rule', value: 'applied' },
        { type: 'breakpoint', phase: 'request' }, { type: 'status', statusCode: 202 },
        { type: 'body', phase: 'response', format: 'text', content: 'pc-edited-response' },
      ] },
    { kind: 'rule', id: 'synthetic', name: 'Synthetic', priority: 2, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/synthetic' }],
      actions: [{ type: 'synthetic', statusCode: 200, headers: [], body: 's'.repeat(32769) }] },
    { kind: 'rule', id: 'cancel', name: 'Cancel', priority: 3, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/cancel' }],
      actions: [{ type: 'breakpoint', phase: 'request' }] },
    { kind: 'rule', id: 'replace-request', name: 'Replace request', priority: 4, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/replace' }],
      actions: [{ type: 'body', phase: 'request', format: 'text', content: 'q'.repeat(32769) }] },
    { kind: 'rule', id: 'early-replaced', name: 'Early replaced', priority: 5, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/early-replaced' }],
      actions: [{ type: 'body', phase: 'request', format: 'text', content: 'q'.repeat(4 * 1024 * 1024) },
        { type: 'status', statusCode: 202 }, { type: 'body', phase: 'response', format: 'text', content: 'pc-early-response' }] },
    { kind: 'rule', id: 'native-tls', name: 'Native TLS', priority: 6, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/native-tls' },
        { type: 'host', mode: 'exact', value: 'native.example.test' }],
      actions: [{ type: 'header', phase: 'request', op: 'set', name: 'x-native-tls', value: 'applied' },
        { type: 'breakpoint', phase: 'response' }, { type: 'status', statusCode: 202 },
        { type: 'body', phase: 'response', format: 'text', content: 'pc-native-tls' }] },
    { kind: 'rule', id: 'native-pending', name: 'Native pending', priority: 7, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/native-pending' }],
      actions: [{ type: 'breakpoint', phase: 'request' }] },
    { kind: 'rule', id: 'native-authority', name: 'Native HTTP authority', priority: 10, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/native-authority' },
        { type: 'host', mode: 'exact', value: 'http-authority.example.test' }],
      actions: [{ type: 'status', statusCode: 203 },
        { type: 'body', phase: 'response', format: 'text', content: 'pc-native-authority' }] },
    { kind: 'rule', id: 'websocket-handshake', name: 'WebSocket handshake', priority: 11, enabled: true,
      matchers: [{ type: 'path', mode: 'regex', value: '^/origin/native-ws(?:s|-pending)?$' }],
      actions: [
        { type: 'header', phase: 'request', op: 'set', name: 'x-pc-ws-request', value: 'applied' },
        { type: 'header', phase: 'response', op: 'set', name: 'x-pc-ws-response', value: 'applied' },
      ] },
    { kind: 'rule', id: 'native-http2-headers', name: 'Native H2 headers', priority: 12, enabled: true,
      matchers: [{ type: 'path', mode: 'regex', value: '^/origin/native-h2-' },
        { type: 'host', mode: 'exact', value: 'h2-authority.example.test' }],
      actions: [
        { type: 'header', phase: 'request', op: 'set', name: 'x-pc-h2-request', value: 'applied' },
        { type: 'header', phase: 'response', op: 'set', name: 'x-pc-h2-response', value: 'applied' },
      ] },
    { kind: 'rule', id: 'native-http2-paused', name: 'Native H2 paused', priority: 13, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/native-h2-paused' }],
      actions: [{ type: 'breakpoint', phase: 'request' }, { type: 'status', statusCode: 202 },
        { type: 'body', phase: 'response', format: 'text', content: 'pc-h2-response' }] },
    { kind: 'rule', id: 'native-http2-early', name: 'Native H2 early', priority: 14, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/native-h2-early' }],
      actions: [{ type: 'breakpoint', phase: 'response' }, { type: 'status', statusCode: 202 },
        { type: 'body', phase: 'response', format: 'text', content: 'pc-h2-early' }] },
    { kind: 'rule', id: 'native-http2-pending', name: 'Native H2 pending', priority: 15, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/native-h2-pending' }],
      actions: [{ type: 'breakpoint', phase: 'request' }] },
    { kind: 'rule', id: 'native-http2-rewrite', name: 'Native H2 address rewrite', priority: 16, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: '/origin/native-h2-rewrite' }],
      actions: [{ type: 'breakpoint', phase: 'request' }] },
    ...['native-block', 'native-tls-block'].map((name, index) => ({
      kind: 'rule', id: name, name, priority: 8 + index, enabled: true,
      matchers: [{ type: 'path', mode: 'exact', value: `/origin/${name}` }],
      actions: [{ type: 'block', mode: 'reset' }],
    })),
  ] });
  const httpInterceptionService = new runtime.HttpInterceptionService(ruleService, new runtime.HttpMessageService());
  const apk = path.resolve(values['android-repo'], 'app/build/outputs/apk');
  adb('install', '-r', path.join(apk, 'debug/app-debug.apk'));
  adb('install', '-r', path.join(apk, 'androidTest/debug/app-debug-androidTest.apk'));
  adb('shell', 'run-as', appId, 'rm', '-f', 'cache/pc-inspection-device.der',
    'cache/pc-inspection-session.json', 'cache/pc-inspection-session.pending', 'cache/pc-inspection-cancel-ready',
    'cache/pc-inspection-native-cancel-ready', 'cache/pc-inspection-native-pending-ready', 'cache/pc-inspection-native-ws-pending-ready',
    'cache/pc-inspection-native-h2-fast-received', 'cache/pc-inspection-native-h2-pending-ready');
  child = spawn(values.adb, ['-s', values.serial, 'shell', 'am', 'instrument', '-w', '-r',
    '-e', 'class', 'com.zhxmt.interceptor.android.inspection.PcHttpInspectionTest',
    '-e', 'pcInspection', 'true', `${appId}.test/androidx.test.runner.AndroidJUnitRunner`],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  instrumentation = once(child, 'exit');
  const identityDeadline = Date.now() + 20_000;
  while (!adb('shell', 'run-as', appId, 'ls', 'cache').split(/\s+/).includes('pc-inspection-device.der')) {
    assert(child.exitCode === null, output);
    assert(Date.now() < identityDeadline, 'Android did not publish its public identity');
    await pause(100);
  }
  const deviceCertificate = new X509Certificate(execFileSync(values.adb,
    ['-s', values.serial, 'exec-out', 'run-as', appId, 'cat', 'cache/pc-inspection-device.der'],
    { timeout: 15_000 }));
  const identity = await generateCACertificate();
  const keyAlgorithm = { name: 'ECDSA', namedCurve: 'P-256' };
  const originCaKeys = await webcrypto.subtle.generateKey(keyAlgorithm, true, ['sign', 'verify']);
  const originKeys = await webcrypto.subtle.generateKey(keyAlgorithm, true, ['sign', 'verify']);
  const validity = { notBefore: new Date(Date.now() - 60_000), notAfter: new Date(Date.now() + 86_400_000) };
  const originCa = await X509CertificateGenerator.createSelfSigned({
    ...validity, name: 'CN=Android origin lab CA', keys: originCaKeys,
    extensions: [new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true)],
  }, webcrypto);
  const originCertificate = await X509CertificateGenerator.create({
    ...validity, subject: 'CN=Android origin lab', issuer: originCa.subject,
    publicKey: originKeys.publicKey, signingKey: originCaKeys.privateKey,
    extensions: [new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension([{ type: 'ip', value: '127.0.0.1' }, { type: 'dns', value: 'native.example.test' }])],
  }, webcrypto);
  const originKey = createPrivateKey({
    key: Buffer.from(await webcrypto.subtle.exportKey('pkcs8', originKeys.privateKey)), format: 'der', type: 'pkcs8',
  }).export({ type: 'pkcs8', format: 'pem' });
  assert.notEqual(pin(new X509Certificate(Buffer.from(originCa.rawData))), pin(new X509Certificate(identity.cert)));
  // 源站采用独立CA及主机校验，不获取设备控制身份。 / Use independent origin trust and hostname verification, without device identity.
  const serveOrigin = (request, response) => {
    originAttempts++;
    const raw = request.socket instanceof TLSSocket ? request.socket.getPeerCertificate().raw : undefined;
    if (raw) originClientCertificates++;
    if (!['/origin/inspect', '/origin/replace', '/origin/early', '/origin/early-replaced',
      '/origin/reuse-1', '/origin/reuse-2', '/origin/native-early', '/origin/native-cancel',
      '/origin/native-tls', '/origin/native-authority', '/origin/native-h2-rewritten'].includes(request.url) || raw) {
      response.writeHead(403).end();
      return;
    }
    const chunks = [];
    const record = { url: request.url, httpVersion: request.httpVersion, headers: request.headers,
      tlsServerName: request.socket.servername, chunks, complete: false };
    originRequests.push(record);
    const early = ['/origin/early', '/origin/early-replaced', '/origin/native-early',
      '/origin/native-tls', '/origin/native-authority'].includes(request.url);
    const cancelling = request.url === '/origin/native-cancel';
    request.on('data', chunk => {
      chunks.push(chunk);
      if (early && !response.headersSent) response.writeHead(413, { 'content-length': 3 }).end('no!');
      if (cancelling && chunks.length === 1) adb('shell', 'run-as', appId, 'touch', 'cache/pc-inspection-native-cancel-ready');
    });
    request.on('error', error => { if (!(early || cancelling) || error.code !== 'ECONNRESET') labFailure = error; });
    request.on('end', () => {
      record.complete = true;
      if (early || cancelling) return;
      if (request.url === '/origin/inspect') {
        response.writeHead(200, { 'content-type': 'text/plain', trailer: 'X-Origin-Tag, X-Origin-Empty' });
        response.write('unmodified-origin-response');
        response.addTrailers([['X-Origin-Tag', 'one'], ['x-origin-tag', 'two'], ['X-Origin-Empty', '']]);
        response.end();
      } else if (request.url === '/origin/native-h2-rewritten') {
        response.end('rewritten-h1');
      } else {
        response.end(request.url === '/origin/replace' ? 'replacement-ok' : request.url.endsWith('1') ? 'one' : 'two');
      }
    });
  };
  server = createServer({
    key: originKey, cert: [originCertificate.toString('pem'), originCa.toString('pem')].join('\n'),
    requestCert: true, rejectUnauthorized: false, ALPNProtocols: ['http/1.1'],
  }, serveOrigin);
  plainServer = createHttpServer(serveOrigin);
  const observeOrigin = operation => {
    try { operation(); } catch (error) {
      labFailure = error;
      child.kill('SIGTERM');
    }
  };
  // 独立Node H2源站只接收Android出站。 / The independent Node H2 origin receives only Android-owned requests.
  http2Server = createHttp2Server({
    key: originKey, cert: [originCertificate.toString('pem'), originCa.toString('pem')].join('\n'),
    requestCert: true, rejectUnauthorized: false,
  });
  cleartextHttp2Server = createCleartextHttp2Server();
  for (const [origin, secure] of [[http2Server, true], [cleartextHttp2Server, false]]) {
    origin.on('connection', () => { http2OriginAttempts++; });
    origin.on('session', session => {
      const record = { id: http2SessionEvidence.length + 1, secure, peerGoaway: [],
        transportEnded: false, transportClosed: false, closed: false };
      http2SessionEvidence.push(record);
      http2SessionRecords.set(session, record);
      originHttp2Sessions.add(session);
      session.socket.on('end', () => { record.transportEnded = true; });
      session.socket.on('close', () => { record.transportClosed = true; });
      session.on('goaway', (code, lastStreamId) => record.peerGoaway.push({ code, lastStreamId }));
      session.on('close', () => {
        record.closed = true;
        originHttp2Sessions.delete(session);
      });
      session.on('error', error => observeOrigin(() => { throw error; }));
    });
    origin.on('stream', (stream, headers) => observeOrigin(() => {
      const url = headers[':path'];
      assert(['/origin/native-h2-paused', '/origin/native-h2-fast', '/origin/native-h2-early',
        '/origin/native-h2-goaway', '/origin/native-h2-clear'].includes(url));
      assert.equal(secure, url !== '/origin/native-h2-clear');
      assert.equal(stream.session.socket instanceof TLSSocket, secure);
      assert.equal(headers['x-pc-h2-request'], 'applied');
      const tlsServerName = stream.session.socket.servername;
      if (secure) {
        assert.equal(stream.session.alpnProtocol, 'h2');
        assert.equal(tlsServerName, 'native.example.test');
        if (stream.session.socket.getPeerCertificate().raw) originClientCertificates++;
      }
      const record = { url, secure, sessionId: http2SessionRecords.get(stream.session).id, streamId: stream.id,
        headers, tlsServerName, chunks: [], complete: false, responded: false, reset: null };
      http2OriginRequests.push(record);
      const early = url === '/origin/native-h2-early';
      const goaway = url === '/origin/native-h2-goaway';
      stream.on('close', () => { record.reset = stream.rstCode; });
      stream.on('error', error => {
        record.error = error.code;
        if (!(early || goaway) || !['ERR_HTTP2_STREAM_ERROR', 'ECONNRESET'].includes(error.code)) {
          observeOrigin(() => { throw error; });
        }
      });
      stream.on('data', chunk => observeOrigin(() => {
        record.chunks.push(Buffer.from(chunk));
        if (early && !record.responded) {
          record.responded = true;
          stream.respond({ ':status': 413, 'content-length': 3 });
          stream.end('no!', () => observeOrigin(() => {
            if (!stream.closed && !stream.destroyed) stream.close(http2Constants.NGHTTP2_NO_ERROR);
          }));
        }
      }));
      stream.on('end', () => observeOrigin(() => {
        record.complete = true;
        if (early || goaway) return;
        const paused = url === '/origin/native-h2-paused';
        const bytes = Buffer.from(paused ? 'h'.repeat(70001) : secure ? 'fast-h2' : 'clear-h2');
        record.responded = true;
        stream.respond({ ':status': 200, 'content-length': bytes.length, trailer: 'x-h2-origin' }, { waitForTrailers: true });
        stream.once('wantTrailers', () => observeOrigin(() => {
          stream.sendTrailers({ 'x-h2-origin': paused ? 'paused' : secure ? 'fast' : 'clear' });
        }));
        stream.end(bytes);
      }));
      if (goaway) {
        // Node treats zero as the last processed stream, not as an explicit refusal of all streams.
        assert(stream.id > 1, 'GOAWAY needs a positive last-stream ID below the current stream');
        record.goawayLastStreamId = stream.id - 2;
        const session = stream.session;
        session.goaway(http2Constants.NGHTTP2_NO_ERROR, record.goawayLastStreamId);
        session.close();
      }
    }));
  }
  // 源站WS只接收Android实际连接，帧与控制回应仍经过PC决定。 / Origin WS receives only Android connections; all frames still require PC decisions.
  for (const [origin, compressed] of [[plainServer, false], [server, true]]) {
    const webSocketServer = new WebSocketServer({
      server: origin, perMessageDeflate: compressed ? { threshold: 0 } : false, autoPong: false,
    });
    originWebSocketServers.push(webSocketServer);
    webSocketServer.on('connection', (socket, request) => observeOrigin(() => {
      originWebSocketPeers.add(socket);
      const record = { path: request.url, compressed, messages: [], ping: [], pong: [], closeCode: null };
      webSocketRecords.push(record);
      const size = compressed ? 70001 : 40001;
      assert(['/origin/native-ws', '/origin/native-wss', '/origin/native-ws-pending'].includes(request.url));
      assert.equal(request.headers['x-pc-ws-request'], 'applied');
      assert.equal(socket.protocol, 'interceptor-lab-v2');
      assert.equal(socket.extensions.includes('permessage-deflate'), compressed);
      if (request.socket instanceof TLSSocket) {
        assert.equal(request.socket.servername, 'native.example.test');
        assert.equal(request.socket.getPeerCertificate().raw, undefined);
      }
      socket.on('message', (data, binary) => observeOrigin(() => {
        const content = Buffer.from(data);
        assert.notEqual(record.path, '/origin/native-ws-pending', 'A pending WS message reached the origin');
        if (binary) {
          assert.equal(record.messages.length, 1);
          assert.deepEqual(content, Buffer.from(Array.from({ length: size }, (_, index) => index % 251)));
          socket.send(content, { binary: true });
          socket.ping('server-probe');
        } else {
          assert.equal(record.messages.length, 0);
          assert.equal(content.toString('utf8'), 'pc-origin');
          socket.send('drop-from-origin');
          socket.send('s'.repeat(size));
        }
        record.messages.push({ binary, byteLength: content.length, sha256: createHash('sha256').update(content).digest('hex') });
      }));
      socket.on('ping', data => observeOrigin(() => {
        assert.equal(data.toString('utf8'), 'probe');
        record.ping.push(data.toString('utf8'));
        socket.pong(data);
      }));
      socket.on('pong', data => observeOrigin(() => {
        assert.equal(data.toString('utf8'), 'server-probe');
        record.pong.push(data.toString('utf8'));
      }));
      socket.on('error', error => {
        if (record.path === '/origin/native-ws-pending' && error.code === 'ECONNRESET') return;
        labFailure = error;
        child.kill('SIGTERM');
      });
      socket.once('close', code => {
        record.closeCode = code;
        originWebSocketPeers.delete(socket);
      });
    }));
  }
  /** 观察真实录制，不替换Capture业务或消费确认。 */
  class LabHttpRecording extends runtime.HttpRecording {
    /** 供wire与Capture事实对照的测试观测。 */
    record = { captureExchangeId: this.exchangeId, messages: [], chunks: [], frames: [] };

    /** 同一lab Recording使用正式存储与事件队列。 */
    constructor() {
      super(captureService, captureEventQueue, { sessionId: 'android-lab', recording: true }, new runtime.CoreDiagnostics());
      recordings.push(this.record);
    }

    /** 先完成正式metadata消费，再保留wire观测。 */
    async recordMessage(message, sender) {
      await super.recordMessage(message, sender);
      this.record.messages.push({ message, sender });
      if (message.type === 'http.upgraded') {
        webSocketSettings = { exchangeId: this.exchangeId, direction: 'both', frames: ['message', 'ping', 'pong', 'close'] };
      }
    }

    /** 先完成实际存储，再保留测试字节。 */
    async recordChunk(chunk) {
      await super.recordChunk(chunk);
      this.record.chunks.push(chunk);
    }

    /** 观测已保存的原始WS内容，不替换帧存储。 */
    async recordWebSocketFrame(message, content, timestamp) {
      const sequence = await super.recordWebSocketFrame(message, content, timestamp);
      this.record.frames.push({ message, content: Buffer.from(content), sequence });
      return sequence;
    }

    /** 统计通道收尾调用，实际提交与清理由产品完成。 */
    async settle() {
      await super.settle();
      settled++;
    }
  }
  androidIngressService = new runtime.AndroidIngressService(httpInterceptionService, ruleService, () => webSocketSettings,
    () => new LabHttpRecording(), new runtime.CoreDiagnostics());
  ingressPort = (await androidIngressService.start({ identity, devicePin: pin(deviceCertificate) })).port;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => plainServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => http2Server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => cleartextHttp2Server.listen(0, '127.0.0.1', resolve));
  reversePort = await openReverseListener(ingressPort);
  reverseOriginPort = await openReverseListener(server.address().port);
  reversePlainOriginPort = await openReverseListener(plainServer.address().port);
  if (!values['emulator-origin']) {
    reverseHttp2OriginPort = await openReverseListener(http2Server.address().port);
    reverseCleartextHttp2OriginPort = await openReverseListener(cleartextHttp2Server.address().port);
  }
  const nativeOriginPorts = {
    nativeTlsPort: values['emulator-origin'] ? server.address().port : reverseOriginPort,
    nativeHttpPort: values['emulator-origin'] ? plainServer.address().port : reversePlainOriginPort,
    h2OriginPort: values['emulator-origin'] ? http2Server.address().port : reverseHttp2OriginPort,
    h2CleartextOriginPort: values['emulator-origin'] ? cleartextHttp2Server.address().port : reverseCleartextHttp2OriginPort,
  };
  const reverseMappings = [
    { role: 'inspection', devicePort: reversePort, hostPort: ingressPort },
    { role: 'tls-origin', devicePort: reverseOriginPort, hostPort: server.address().port },
    { role: 'http-origin', devicePort: reversePlainOriginPort, hostPort: plainServer.address().port },
    ...(reverseHttp2OriginPort ? [{ role: 'h2-origin', devicePort: reverseHttp2OriginPort, hostPort: http2Server.address().port }] : []),
    ...(reverseCleartextHttp2OriginPort
      ? [{ role: 'h2-cleartext-origin', devicePort: reverseCleartextHttp2OriginPort, hostPort: cleartextHttp2Server.address().port }] : []),
  ];
  const listedMappings = adb('reverse', '--list').trim().split(/\r?\n/);
  for (const mapping of reverseMappings) {
    assert(listedMappings.some(line => line.endsWith(` tcp:${mapping.devicePort} tcp:${mapping.hostPort}`)),
      `Missing reverse mapping for ${mapping.role}`);
  }
  await writeFile(path.join(evidence, 'adb-reverse.json'), JSON.stringify(reverseMappings, null, 2), 'utf8');
  execFileSync(values.adb, ['-s', values.serial, 'shell', 'run-as', appId, 'tee', 'cache/pc-inspection-session.pending'], {
    input: JSON.stringify({ pcPin: pin(new X509Certificate(identity.cert)), port: reversePort,
      originPort: reverseOriginPort, ...nativeOriginPorts,
      emulatorOriginHost: values['emulator-origin'] ? '10.0.2.2' : undefined,
      originCa: Buffer.from(originCa.rawData).toString('base64') }),
    stdio: ['pipe', 'ignore', 'pipe'], timeout: 15_000,
  });
  adb('shell', 'run-as', appId, 'mv', 'cache/pc-inspection-session.pending', 'cache/pc-inspection-session.json');

  // 真实断点放行与取消；PC不代发源站请求。 / Resolve and cancel real breakpoints without PC forwarding.
  poll = setInterval(() => {
    try {
      const pending = breakpointQueue.list()[0];
      if (!pending) return;
      if (pending.snapshot.url.endsWith('/origin/native-h2-paused')) {
        assert(!http2OriginRequests.some(request => request.url === '/origin/native-h2-paused'));
        if (adb('shell', 'run-as', appId, 'ls', 'cache').split(/\s+/).includes('pc-inspection-native-h2-fast-received')) {
          breakpointQueue.resolve(pending.id, 'continue');
          http2BreakpointApprovals++;
        }
      } else if (pending.snapshot.url.endsWith('/origin/native-h2-early')) {
        breakpointQueue.resolve(pending.id, 'continue');
        http2BreakpointApprovals++;
      } else if (pending.snapshot.url.endsWith('/origin/native-h2-rewrite')) {
        assert(!originRequests.some(request => request.url === '/origin/native-h2-rewritten'));
        breakpointQueue.resolve(pending.id, 'continue', {
          url: `http://127.0.0.1:${reversePlainOriginPort}/origin/native-h2-rewritten`,
        });
        http2BreakpointApprovals++;
      } else if (pending.snapshot.url.endsWith('/origin/native-h2-pending')) {
        if (!nativeHttp2PendingSignalled) {
          nativeHttp2PendingSignalled = true;
          adb('shell', 'run-as', appId, 'touch', 'cache/pc-inspection-native-h2-pending-ready');
        }
      } else if (pending.snapshot.url.endsWith('/origin/native-ws-pending')) {
        if (!nativeWebSocketPendingSignalled) {
          nativeWebSocketPendingSignalled = true;
          adb('shell', 'run-as', appId, 'touch', 'cache/pc-inspection-native-ws-pending-ready');
        }
      } else if (/\/origin\/native-wss?$/.test(pending.snapshot.url)) {
        assert(['message', 'ping', 'pong', 'close'].includes(pending.snapshot.frame));
        if (pending.snapshot.frame === 'message' && pending.snapshot.opcode === 1) {
          if (pending.snapshot.direction === 'client-to-server') {
            breakpointQueue.resolve(pending.id, 'continue', { body: 'pc-origin' });
          } else if (pending.snapshot.body === 'drop-from-origin') {
            breakpointQueue.resolve(pending.id, 'drop');
          } else {
            breakpointQueue.resolve(pending.id, 'continue', { body: 'pc-phone' });
          }
        } else breakpointQueue.resolve(pending.id, 'continue');
        webSocketApprovals++;
      } else if (pending.snapshot.url.endsWith('/origin/inspect')) {
        assert.equal(originRequests.length, 0, 'Origin was reached before PC decision');
        breakpointQueue.resolve(pending.id, 'continue', {
          headers: [...pending.snapshot.headers, { name: 'x-pc-breakpoint', value: 'approved' }],
          editedHeaderNames: ['x-pc-breakpoint'],
        });
        approvals++;
      } else if (pending.snapshot.url.endsWith('/origin/native-tls')) {
        breakpointQueue.resolve(pending.id, 'continue');
        nativeTlsApprovals++;
      } else if (pending.snapshot.url.endsWith('/origin/native-pending') && !nativePendingSignalled) {
        nativePendingSignalled = true;
        adb('shell', 'run-as', appId, 'touch', 'cache/pc-inspection-native-pending-ready');
      } else if (pending.snapshot.url.endsWith('/origin/cancel') && !cancelSignalled) {
        cancelSignalled = true;
        adb('shell', 'run-as', appId, 'touch', 'cache/pc-inspection-cancel-ready');
      }
    } catch (error) {
      labFailure = error;
      child.kill('SIGTERM');
    }
  }, 25);
  const deadline = setTimeout(() => {
    labFailure = new Error('Android/PC HTTP protocol lab timed out');
    child.kill('SIGTERM');
  }, 60_000);
  let exit;
  try { exit = await instrumentation; } finally { clearTimeout(deadline); }
  await writeFile(path.join(evidence, 'android-instrumentation.log'), output, 'utf8');
  if (labFailure) throw labFailure;
  assert.equal(exit[0], 0, output);
  assert.match(output, /OK \(1 test\)/);
  await androidIngressService.stop();
  await Promise.all([...originHttp2Sessions].map(session => once(session, 'close', { signal: AbortSignal.timeout(5000) })));
  if (labFailure) throw labFailure;
  const releasedPort = net.createServer();
  await new Promise((resolve, reject) => {
    releasedPort.once('error', reject);
    releasedPort.listen(ingressPort, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => releasedPort.close(error => error ? reject(error) : resolve()));

  // 核对真实字节、应用确认、终态及资源。 / Verify actual bytes, applications, terminal states and resources.
  assert.equal(approvals, 1);
  assert.equal(nativeTlsApprovals, 1);
  assert.equal(webSocketApprovals, 22);
  assert.equal(originAttempts, 11);
  assert.equal(originRequests.length, 11);
  assert.equal(http2BreakpointApprovals, 3);
  assert.equal(http2OriginAttempts, 5);
  assert.equal(http2OriginRequests.length, 5);
  assert.equal(http2OriginRequests.filter(request => !request.secure).length, 1);
  assert.equal(http2SessionEvidence.length, 5);
  assert(http2SessionEvidence.every(record => record.transportEnded && record.transportClosed && record.closed));
  for (const request of http2OriginRequests) {
    const port = request.secure ? nativeOriginPorts.h2OriginPort : nativeOriginPorts.h2CleartextOriginPort;
    assert.equal(request.headers[':authority'], `h2-authority.example.test:${port}`);
    assert.equal(request.headers[':scheme'], request.secure ? 'https' : 'http');
    assert.equal(request.tlsServerName, request.secure ? 'native.example.test' : undefined);
  }
  const rewrittenHttp2Origin = originRequests.find(request => request.url === '/origin/native-h2-rewritten');
  assert.equal(rewrittenHttp2Origin.httpVersion, '1.1');
  assert.equal(rewrittenHttp2Origin.headers['x-pc-h2-request'], 'applied');
  assert.equal(originRequests.filter(request => request.url === '/origin/native-h2-rewritten').length, 1);
  const http2Early = http2OriginRequests.find(request => request.url === '/origin/native-h2-early');
  assert.deepEqual(Buffer.concat(http2Early.chunks), Buffer.from('x'));
  assert.equal(http2Early.reset, http2Constants.NGHTTP2_NO_ERROR);
  const http2Goaway = http2OriginRequests.find(request => request.url === '/origin/native-h2-goaway');
  assert.equal(http2Goaway.goawayLastStreamId, http2Goaway.streamId - 2);
  assert(http2Goaway.goawayLastStreamId > 0);
  assert.equal(http2Goaway.responded, false);
  assert.equal(http2OriginRequests.filter(request => request.url === '/origin/native-h2-goaway').length, 1);
  assert.equal(originClientCertificates, 0);
  assert.equal(webSocketRecords.length, 3);
  const closingDeadline = Date.now() + 5000;
  while (originWebSocketPeers.size && Date.now() < closingDeadline) await pause(25);
  assert.equal(originWebSocketPeers.size, 0);
  for (const record of webSocketRecords) {
    const pending = record.path === '/origin/native-ws-pending';
    assert.equal(record.closeCode, pending ? 1006 : 1000);
    assert.equal(record.messages.length, pending ? 0 : 2);
    assert.deepEqual(record.ping, pending ? [] : ['probe']);
    assert.deepEqual(record.pong, pending ? [] : ['server-probe']);
  }
  await writeFile(path.join(evidence, 'websocket-origin.json'), JSON.stringify(webSocketRecords, null, 2), 'utf8');
  assert.equal(originRequests[0].headers['x-pc-rule'], 'applied');
  assert.equal(originRequests[0].headers['x-pc-breakpoint'], 'approved');
  const expected = Buffer.from(Array.from({ length: 70001 }, (_, index) => index % 251));
  assert.deepEqual(Buffer.concat(originRequests[0].chunks), expected);
  assert.deepEqual(Buffer.concat(originRequests.find(request => request.url === '/origin/replace').chunks), Buffer.from('q'.repeat(32769)));
  assert.deepEqual(Buffer.concat(originRequests.find(request => request.url === '/origin/early').chunks), Buffer.from('x'));
  assert.deepEqual(Buffer.concat(originRequests.find(request => request.url === '/origin/native-early').chunks), Buffer.from('x'));
  assert.deepEqual(Buffer.concat(originRequests.find(request => request.url === '/origin/native-cancel').chunks), Buffer.from('x'));
  const nativeTlsOrigin = originRequests.find(request => request.url === '/origin/native-tls');
  assert.equal(nativeTlsOrigin.headers['x-native-tls'], 'applied');
  assert.deepEqual(Buffer.concat(nativeTlsOrigin.chunks), Buffer.from('x'));
  const authorityOrigin = originRequests.find(request => request.url === '/origin/native-authority');
  assert(authorityOrigin.headers.host.startsWith('http-authority.example.test:'));
  assert.equal(authorityOrigin.tlsServerName, 'native.example.test');
  assert.deepEqual(Buffer.concat(authorityOrigin.chunks), Buffer.from('x'));
  const earlyOrigin = originRequests.find(request => request.url === '/origin/early-replaced');
  assert(Buffer.concat(earlyOrigin.chunks).length < 4 * 1024 * 1024);
  assert.equal(earlyOrigin.complete, false);
  assert.equal(originRequests.filter(request => request.complete).length, 5);
  const observed = recordings.find(record => record.messages.some(({ message }) =>
    message.type === 'http.request' && message.request.url.endsWith('/origin/inspect')));
  const uploadId = observed.messages.find(({ message }) => message.type === 'body.open'
    && message.phase === 'request' && message.role === 'applied').message.bodyId;
  assert.deepEqual(Buffer.concat(observed.chunks.filter(chunk => chunk.bodyId === uploadId).map(chunk => Buffer.from(chunk.payload))), expected);
  const originalResponseId = observed.messages.find(({ message }) =>
    message.type === 'body.open' && message.phase === 'response' && message.role === 'original').message.bodyId;
  assert.deepEqual(observed.messages.find(({ message }) =>
    message.type === 'body.end' && message.bodyId === originalResponseId).message.trailers,
  [['X-Origin-Tag', 'one'], ['x-origin-tag', 'two'], ['X-Origin-Empty', '']]);
  assert.deepEqual(Buffer.concat(observed.chunks.filter(chunk => chunk.bodyId === originalResponseId)
    .map(chunk => Buffer.from(chunk.payload))), Buffer.from('unmodified-origin-response'));
  const appliedResponseId = observed.messages.find(({ message }) =>
    message.type === 'body.open' && message.phase === 'response' && message.role === 'applied').message.bodyId;
  assert.deepEqual(observed.messages.find(({ message }) =>
    message.type === 'body.end' && message.bodyId === appliedResponseId).message.trailers, []);
  assert.deepEqual(Buffer.concat(observed.chunks.filter(chunk => chunk.bodyId === appliedResponseId)
    .map(chunk => Buffer.from(chunk.payload))), Buffer.from('pc-edited-response'));
  assert.equal(breakpointQueue.size, 0);
  for (const name of ['early', 'early-replaced', 'native-early', 'native-tls', 'native-authority']) {
    const record = recordings.find(record => record.messages.some(({ message }) =>
      message.type === 'http.request' && message.request.url.endsWith(`/origin/${name}`)));
    const appliedId = record.messages.find(({ message }) =>
      message.type === 'body.open' && message.phase === 'request' && message.role === 'applied').message.bodyId;
    const stopped = record.messages.find(({ message }) => message.type === 'body.stopped' && message.bodyId === appliedId).message;
    assert.equal(stopped.reason, 'early-response');
    assert.equal(stopped.byteLength, Buffer.concat(record.chunks.filter(chunk => chunk.bodyId === appliedId)
      .map(chunk => Buffer.from(chunk.payload))).length);
    assert(record.messages.some(({ message }) => message.type === 'exchange.completed'));
    assert(!record.messages.some(({ message }) => message.type === 'exchange.cancel'));
  }
  const nativeCancelled = recordings.find(record => record.messages.some(({ message }) =>
    message.type === 'http.request' && message.request.url.endsWith('/origin/native-cancel')));
  assert.equal(nativeCancelled.messages.find(({ message }) => message.type === 'exchange.cancel').message.reason, 'client-closed');
  assert(!nativeCancelled.messages.some(({ message }) => message.type === 'exchange.completed'));
  const nativePending = recordings.find(record => record.messages.some(({ message }) =>
    message.type === 'http.request' && message.request.url.endsWith('/origin/native-pending')));
  assert.equal(nativePending.messages.find(({ message }) => message.type === 'exchange.cancel').message.reason, 'client-closed');
  for (const path of ['/origin/native-block', '/origin/native-tls-block']) {
    const record = recordings.find(record => record.messages.some(({ message }) =>
      message.type === 'http.request' && message.request.url.endsWith(path)));
    assert.deepEqual(record.messages.find(({ message }) => message.type === 'http.decision').message.decision,
      { action: 'abort', mode: 'reset' });
    assert(record.messages.some(({ message }) => message.type === 'http.applied'));
    assert(!record.messages.some(({ message }) => message.type === 'exchange.completed'));
  }
  const http2Records = recordings.filter(record => record.messages.some(({ message }) =>
    message.type === 'http.request' && new URL(message.request.url).pathname.startsWith('/origin/native-h2-')));
  assert.equal(http2Records.length, 7);
  for (const record of http2Records) {
    const request = record.messages.find(({ message }) => message.type === 'http.request').message.request;
    assert.equal(request.httpVersion, '2');
    assert(request.headers.every(([name]) => !name.startsWith(':')));
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith('-goaway') || pathname.endsWith('-pending')) {
      assert.equal(record.messages.find(({ message }) => message.type === 'exchange.cancel').message.reason,
        pathname.endsWith('-goaway') ? 'upstream-failed' : 'client-closed');
      assert(!record.messages.some(({ message }) => message.type === 'exchange.completed'));
    } else {
      assert(record.messages.some(({ message }) => message.type === 'exchange.completed'));
      assert(!record.messages.some(({ message }) => message.type === 'exchange.cancel'));
      const role = phase => record.messages.find(({ message }) =>
        message.type === 'body.open' && message.phase === phase && message.role === 'applied').message.bodyId;
      if (pathname.endsWith('-early')) {
        const bodyId = role('request');
        const stopped = record.messages.find(({ message }) => message.type === 'body.stopped' && message.bodyId === bodyId).message;
        assert.equal(stopped.byteLength, 1);
      }
      const appliedId = role('response');
      const ended = record.messages.find(({ message }) => message.type === 'body.end' && message.bodyId === appliedId).message;
      assert.deepEqual(ended.trailers, pathname.endsWith('-fast') ? [['x-h2-origin', 'fast']]
        : pathname.endsWith('-clear') ? [['x-h2-origin', 'clear']] : []);
    }
  }
  assert.equal(recordings.length, 25);
  assert.equal(recordings.filter(record => record.messages.some(({ message }) => message.type === 'exchange.completed')).length, 17);
  assert.equal(recordings.filter(record => record.messages.some(({ message }) => message.type === 'exchange.cancelled')).length, 6);
  const captureDetails = [];
  for (const record of recordings) {
    const detail = await captureService.getExchangeDetail(record.captureExchangeId);
    assert(detail, 'Every accepted request must have a real Capture exchange');
    const request = record.messages.find(({ message }) => message.type === 'http.request').message;
    assert.notEqual(detail.summary.id, request.exchangeId);
    assert.equal(detail.url, request.request.url);
    for (const phase of ['request', 'response']) {
      const applied = record.messages.find(({ message }) => message.type === 'body.open'
        && message.phase === phase && message.role === 'applied');
      if (!applied) continue;
      const bodyId = applied.message.bodyId;
      const bytes = Buffer.concat(record.chunks.filter(chunk => chunk.bodyId === bodyId).map(chunk => Buffer.from(chunk.payload)));
      const body = phase === 'request' ? detail.requestBody : detail.responseBody;
      assert(body, 'Actual applied copies must be readable from Capture');
      assert.equal(body.encodedSize, bytes.length);
      if (bytes.length) {
        assert(body.bodyHash);
        assert((await captureService.readBodyRange(body.bodyHash, 0, bytes.length)).equals(bytes));
      }
      const ended = record.messages.find(({ message, sender }) => sender === 'android'
        && (message.type === 'body.end' || message.type === 'body.stopped') && message.bodyId === bodyId);
      assert.equal(body.truncated, !ended || ended.message.type === 'body.stopped');
      const effect = phase === 'request' ? detail.requestBodyEffect : detail.responseBodyEffect;
      if (effect?.originalState === 'available') {
        const original = record.messages.find(({ message }) => message.type === 'body.open'
          && message.phase === phase && message.role === 'original').message;
        const originalBytes = Buffer.concat(record.chunks.filter(chunk => chunk.bodyId === original.bodyId)
          .map(chunk => Buffer.from(chunk.payload)));
        assert.equal(effect.originalBody.encodedSize, originalBytes.length);
        assert((await captureService.readBodyRange(effect.originalBody.bodyHash, 0, originalBytes.length)).equals(originalBytes));
      }
    }
    captureDetails.push(detail);
  }
  assert.equal(captureDetails.filter(detail => detail.summary.state === 'completed').length, 17);
  assert.equal(captureDetails.filter(detail => detail.summary.state === 'aborted').length, 8);
  const http2Capture = captureDetails.filter(detail => new URL(detail.url).pathname.startsWith('/origin/native-h2-'));
  assert.equal(http2Capture.length, 7);
  assert(http2Capture.every(detail => detail.summary.protocol === 'h2'));
  const pausedHttp2 = http2Capture.find(detail => detail.url.endsWith('/origin/native-h2-paused'));
  assert.equal(pausedHttp2.summary.statusCode, 202);
  assert.equal(pausedHttp2.responseBodyEffect.originalState, 'available');
  assert.equal(pausedHttp2.responseBodyEffect.originalBody.encodedSize, 70001);
  assert((await captureService.readBodyRange(pausedHttp2.responseBodyEffect.originalBody.bodyHash, 0, 70001))
    .equals(Buffer.from('h'.repeat(70001))));
  assert.deepEqual(pausedHttp2.responseTrailers, []);
  await writeFile(path.join(evidence, 'http2-capture.json'), JSON.stringify(http2Capture, null, 2), 'utf8');
  const webSocketEvidence = [];
  for (const detail of captureDetails.filter(item => item.summary.protocol === 'ws')) {
    const record = recordings.find(item => item.captureExchangeId === detail.summary.id);
    const pending = detail.url.endsWith('/origin/native-ws-pending');
    const size = detail.url.endsWith('/origin/native-wss') ? 70001 : 40001;
    const frames = await captureService.queryWebSocketFrames({ exchangeId: detail.summary.id, limit: 20 });
    assert.equal(frames.hasMore, false);
    assert.equal(frames.items.length, pending ? 1 : 5);
    const originalFrames = record.frames.filter(frame => ['text', 'binary'].includes(frame.message.frame));
    assert.equal(originalFrames.length, frames.items.length);
    for (const frame of frames.items) {
      const original = originalFrames.find(item => item.sequence === frame.seq);
      assert(original);
      assert.equal(frame.direction, original.message.direction);
      assert.equal(frame.payloadSize, original.content.length);
      assert(frame.payload?.bodyHash);
      assert((await captureService.readBodyRange(frame.payload.bodyHash, 0, original.content.length)).equals(original.content));
    }
    assert(detail.summary.ruleIds.includes('websocket-handshake'));
    if (!pending) {
      assert.equal(detail.summary.requestBytes, size + 26);
      assert.equal(detail.summary.responseBytes, size + 25);
      assert.equal(originalFrames[0].content.toString('utf8'), 'c'.repeat(size));
      assert(originalFrames.some(frame => frame.content.toString('utf8') === 'drop-from-origin'));
      assert(originalFrames.some(frame => frame.content.toString('utf8') === 's'.repeat(size)));
    }
    webSocketEvidence.push({ exchangeId: detail.summary.id, url: detail.url, state: detail.summary.state,
      requestBytes: detail.summary.requestBytes, responseBytes: detail.summary.responseBytes, frames: frames.items });
  }
  assert.equal(webSocketEvidence.length, 3);
  await writeFile(path.join(evidence, 'websocket-capture.json'), JSON.stringify(webSocketEvidence, null, 2), 'utf8');
  const inspectedCapture = captureDetails.find(detail => detail.url.endsWith('/origin/inspect'));
  assert.equal(inspectedCapture.summary.statusCode, 202);
  assert(inspectedCapture.summary.ruleIds.includes('inspect'));
  assert.equal(inspectedCapture.responseBodyEffect.originalState, 'available');
  assert.deepEqual(inspectedCapture.responseTrailers, []);
  const authorityCapture = captureDetails.find(detail => detail.url.endsWith('/origin/native-authority'));
  assert.equal(new URL(authorityCapture.url).hostname, 'http-authority.example.test');
  assert.equal(authorityCapture.summary.statusCode, 203);
  assert(authorityCapture.summary.ruleIds.includes('native-authority'));
  for (const pathname of ['/origin/native-block', '/origin/native-tls-block']) {
    const blocked = captureDetails.find(detail => detail.url.endsWith(pathname));
    assert.equal(blocked.errorCode, 'android-rule-reset');
    assert(blocked.summary.ruleIds.length > 0);
  }
  const captureEvents = captureEventQueue.drain(100);
  assert.equal(captureEvents.length, 25);
  assert(captureEvents.every(event => ['completed', 'aborted'].includes(event.summary.state)));
  await writeFile(path.join(evidence, 'capture-details.json'), JSON.stringify(captureDetails, null, 2), 'utf8');
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({
    androidKeystore: true, mutualTlsPinned: true, adbReverse: true, actualPcHttpChannel: true,
    nativeOriginTransport: values['emulator-origin'] ? 'emulator-host' : 'adb-reverse',
    androidOwnedHttpRequests: originRequests.length + http2OriginRequests.length,
    originAttempts: originAttempts + http2OriginAttempts, pcForwardedRequests: 0, requestBytes: expected.length,
    ruleApplied: true, breakpointApprovals: approvals, responseReplaced: true, syntheticBytes: 32769,
    pendingBreakpoints: breakpointQueue.size, drainedChannels: recordings.length, listenerPortReleased: true, settled,
    formalV2Control: true, serverIssuedCredentials: true, productionCapture: true,
    capturedExchanges: captureDetails.length, captureEvents: captureEvents.length,
    actualAppliedCaptureBytes: true, originalBodyRuleEvidence: true,
    androidLocalCaTls: true, androidHttp1ResponseSocket: true, originalResponseTrailers: true,
    androidHttp1UpstreamCodec: true, androidHttp1ResponseExecutor: true,
    androidHttp1OriginConnection: true, independentOriginCa: true, originHostnameVerified: true, originClientCertificates,
    androidHttp1ExchangeExecutor: true, earlyUploadStop: true, requestReplacement: true,
    simultaneousRequestResponseReplacement: true, sequentialClientConnection: true,
    androidNativeIpHttpExchange: true, nativeUploadReadStopped: true, nativePeerResetCancelledExchange: true,
    nativeTlsSniHttpExchange: true, nativeTlsResponseBreakpointApprovals: nativeTlsApprovals,
    nativeHttpAuthorityIndependentOfSni: true, originalTlsServerNamePreserved: true,
    productionNativeConnectionLifecycle: true,
    nativeResetBeforeOrigin: true, nativeTlsResetBeforeOrigin: true, nativePendingBreakpointCancelled: true,
    androidOwnedWebSocketConnections: webSocketRecords.length, nativeWebSocket: true, nativeWebSocketTls: true,
    webSocketCompression: true, webSocketBreakpointApprovals: webSocketApprovals,
    webSocketOriginalCaptureFrames: 11, webSocketAppliedTraffic: true, nativeWebSocketPendingReset: true,
    nativeHttp2Tls: true, http2OriginRequests: http2OriginRequests.length, http2BreakpointApprovals,
    nativeHttp2Cleartext: true, http2AddressRewriteToHttp1: true,
    http2ParallelBreakpointIsolation: true, http2NativePeerReset: true, http2EarlyResponsePrefix: 1,
    http2GoawayWithoutReplay: true, http2TrailersPreserved: true, http2Capture: http2Capture.length,
    vpnService: false, electron: false, productionPairing: false,
  }, null, 2), 'utf8');
} catch (error) {
  runFailure = error;
  throw error;
} finally {
  // 只清理本轮资源，恢复失败必须显式报告。 / Clean owned resources and report recovery failures.
  if (poll) clearInterval(poll);
  const clean = async operation => { try { await operation(); } catch (error) { cleanupFailures.push(error); } };
  await clean(() => writeFile(path.join(evidence, 'http2-origin.json'), JSON.stringify(http2OriginRequests.map(record => ({
    ...record, chunks: record.chunks.map(bytes => ({ byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })),
  })), null, 2), 'utf8'));
  await clean(() => writeFile(path.join(evidence, 'http2-sessions.json'), JSON.stringify(http2SessionEvidence, null, 2), 'utf8'));
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await clean(() => instrumentation);
  }
  if (androidIngressService) await clean(() => androidIngressService.stop());
  if (captureService) await clean(() => captureService.dispose());
  breakpointQueue?.closeAll();
  for (const socket of originWebSocketPeers) socket.terminate();
  for (const webSocketServer of originWebSocketServers) {
    await clean(() => new Promise((resolve, reject) => webSocketServer.close(error => error ? reject(error) : resolve())));
  }
  if (server) await clean(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  if (plainServer) await clean(() => new Promise((resolve, reject) => plainServer.close(error => error ? reject(error) : resolve())));
  for (const session of originHttp2Sessions) session.destroy();
  if (http2Server) await clean(() => new Promise((resolve, reject) => http2Server.close(error => error ? reject(error) : resolve())));
  if (cleartextHttp2Server) await clean(() => new Promise((resolve, reject) => cleartextHttp2Server.close(error => error ? reject(error) : resolve())));
  if (reversePort) await clean(() => adb('reverse', '--remove', `tcp:${reversePort}`));
  if (reverseOriginPort) await clean(() => adb('reverse', '--remove', `tcp:${reverseOriginPort}`));
  if (reversePlainOriginPort) await clean(() => adb('reverse', '--remove', `tcp:${reversePlainOriginPort}`));
  if (reverseHttp2OriginPort) await clean(() => adb('reverse', '--remove', `tcp:${reverseHttp2OriginPort}`));
  if (reverseCleartextHttp2OriginPort) await clean(() => adb('reverse', '--remove', `tcp:${reverseCleartextHttp2OriginPort}`));
  await clean(() => adb('shell', 'run-as', appId, 'rm', '-f', 'cache/pc-inspection-device.der',
    'cache/pc-inspection-session.json', 'cache/pc-inspection-session.pending', 'cache/pc-inspection-cancel-ready',
    'cache/pc-inspection-native-cancel-ready', 'cache/pc-inspection-native-pending-ready', 'cache/pc-inspection-native-ws-pending-ready',
    'cache/pc-inspection-native-h2-fast-received', 'cache/pc-inspection-native-h2-pending-ready'));
  await clean(() => rm(scratch, { recursive: true }));
  if (output) await clean(() => writeFile(path.join(evidence, 'android-instrumentation.log'), output, 'utf8'));
  if (cleanupFailures.length) throw new AggregateError(
    runFailure ? [runFailure, ...cleanupFailures] : cleanupFailures, 'HTTP protocol lab cleanup failed');
}
console.log('HTTP_PROTOCOL_INTEROP_PASSED');
