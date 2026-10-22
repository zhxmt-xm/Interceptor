import https from 'node:https';
import { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
import { WebSocket, WebSocketServer } from 'ws';
import type { AndroidIngressStatus, WebSocketBreakpointSettings } from '@interceptor/core-protocol';
import type { HttpInterceptionService } from '../http-interception/entry';
import type { RuleService } from '../rules/entry';
import type { DiagnosticsRecorder } from '../core-diagnostics';
import type { AndroidIngressAddress, AndroidIngressOptions } from './interfaces';
import type { HttpRecording } from './internal/http-recording';
import { equalSecret, matchesDeviceIdentity, validPin } from './utils';
import { CONNECT_TIMEOUT_MS, MAX_INSPECTION_CONTROL_BYTES, MAX_INSPECTION_EXCHANGES, PING_INTERVAL_MS } from './internal/constants';
import { HttpChannel } from './internal/http-channel';
import { InspectionControlSession } from './internal/inspection-control-session';

/** 单设备v2协议副本入口，不接收原始TCP/DNS或依赖ProxyService。 */
export class AndroidIngressService {
  /** 本设备的回环TLS入口，包括控制和协议副本路径。 */
  private server: https.Server | null = null;
  /** upgrade仅在配对和控制授权校验后执行。 */
  private webSocketServer: WebSocketServer | null = null;
  /** TLS握手中的socket也归listener释放。 */
  private readonly sockets = new Set<Socket>();
  /** 唯一活动控制会话；关闭时立即撤销数据权限。 */
  private control: InspectionControlSession | null = null;
  /** 正在业务处理或关闭收尾的exchange都占用配额。 */
  private readonly channels = new Map<WebSocket, HttpChannel>();
  /** 每个channel实际close与记录结算后的收尾承诺。 */
  private readonly drains = new Set<Promise<void>>();
  /** 心跳窗口只判连接存活，不限制断点。 */
  private readonly awaitingPong = new Set<WebSocket>();
  /** 由listener拥有的控制/数据Ping调度。 */
  private heartbeat: NodeJS.Timeout | null = null;
  /** 防止异步listen期间重复启动或停止。 */
  private starting = false;
  /** 并发stop共享同一收尾结果。 */
  private stopping: Promise<void> | null = null;
  /** 调用方提供唯一决定入口和实际录制消费责任。 */
  constructor(
    private readonly httpInterceptionService: HttpInterceptionService,
    private readonly ruleService: RuleService,
    private readonly getWebSocketBreakpointSettings: () => WebSocketBreakpointSettings | null,
    private readonly createRecording: () => HttpRecording,
    private readonly diagnostics: DiagnosticsRecorder,
  ) {}

  /** 只在已确认设备pin上启动回环mTLS控制与数据入口。 */
  async start(options: AndroidIngressOptions): Promise<AndroidIngressAddress> {
    if (this.server || this.starting || this.stopping) throw new Error('Inspection listener is already active');
    if (!validPin(options.devicePin)) throw new Error('Inspection listener requires a confirmed device pin');
    this.starting = true;
    try {
      const server = https.createServer({
        ...options.identity, minVersion: 'TLSv1.2', requestCert: true, rejectUnauthorized: false,
        handshakeTimeout: CONNECT_TIMEOUT_MS,
      }, (_request, response) => { response.writeHead(404, { Connection: 'close' }).end(); });
      this.server = server;
      server.maxConnections = (MAX_INSPECTION_EXCHANGES + 1) * 2;
      server.headersTimeout = CONNECT_TIMEOUT_MS;
      server.requestTimeout = CONNECT_TIMEOUT_MS;
      server.setTimeout(CONNECT_TIMEOUT_MS, socket => socket.destroy());
      server.on('connection', socket => {
        if (!(socket instanceof Socket)) {
          socket.destroy();
          return;
        }
        this.sockets.add(socket);
        socket.once('close', () => this.sockets.delete(socket));
      });
      const webSocketServer = new WebSocketServer({
        noServer: true, perMessageDeflate: false, clientTracking: false, maxPayload: MAX_INSPECTION_CONTROL_BYTES,
      });
      this.webSocketServer = webSocketServer;
      server.on('upgrade', (request, socket, head) => {
        const isControl = request.url === '/android/v2/control';
        const session = this.control?.credentials();
        if (!(socket instanceof TLSSocket) || this.stopping ||
          !matchesDeviceIdentity(socket.getPeerCertificate().raw, options.devicePin) ||
          !(isControl ? this.control === null :
            request.url === '/android/v2/exchange' && session &&
            typeof request.headers.authorization === 'string' &&
            equalSecret(request.headers.authorization, `Bearer ${session.sessionToken}`)) ||
          !isControl && this.channels.size >= MAX_INSPECTION_EXCHANGES) {
          this.diagnostics.warn('android.inspection-upgrade-rejected');
          socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
          return;
        }
        socket.setTimeout(0);
        webSocketServer.handleUpgrade(request, socket, head, webSocket => {
          webSocket.on('pong', () => this.awaitingPong.delete(webSocket));
          if (isControl) {
            this.control = new InspectionControlSession(webSocket, this.diagnostics, () => {
              this.control = null;
              this.awaitingPong.delete(webSocket);
              for (const channel of this.channels.values()) channel.close();
            });
            return;
          }
          if (!session) {
            webSocket.terminate();
            return;
          }
          let recording: HttpRecording;
          try {
            recording = this.createRecording();
          } catch (error) {
            this.diagnostics.warn('android.inspection-recording-start-failed');
            webSocket.terminate();
            return;
          }
          let resolveDrain!: () => void;
          const drained = new Promise<void>(resolve => { resolveDrain = resolve; });
          this.drains.add(drained);
          const channel = new HttpChannel(webSocket, session.sessionId, session.capabilities, this.httpInterceptionService,
            this.ruleService, this.getWebSocketBreakpointSettings,
            recording, this.diagnostics, () => {
              this.channels.delete(webSocket);
              this.awaitingPong.delete(webSocket);
              this.drains.delete(drained);
              resolveDrain();
            });
          this.channels.set(webSocket, channel);
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
      server.on('error', () => {
        this.diagnostics.error('android.inspection-listener-failed');
        void this.stop().catch(() => this.diagnostics.error('android.inspection-listener-cleanup-failed'));
      });
      this.heartbeat = setInterval(() => this.ping(), PING_INTERVAL_MS);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Inspection listener has no bound address');
      return { host: '127.0.0.1', port: address.port };
    } catch (error) {
      await this.cleanup();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  /** 撤销控制会话、取消所有exchange并等待实际收尾。 */
  async stop(): Promise<void> {
    if (this.starting) throw new Error('Inspection listener is still starting');
    if (!this.stopping) this.stopping = this.cleanup().finally(() => { this.stopping = null; });
    return this.stopping;
  }

  /** 只报告实际listener及已完成hello的控制连接，不返回身份材料或token。 */
  status(): AndroidIngressStatus {
    const address = this.server?.address();
    return {
      listening: this.server?.listening ?? false,
      connected: this.control !== null && this.control.credentials() !== null,
      host: address && typeof address !== 'string' ? '127.0.0.1' : null,
      port: address && typeof address !== 'string' ? address.port : null,
    };
  }

  /** 对控制和数据分别检测Pong，不对规则决定设置deadline。 */
  private ping(): void {
    const control = this.control;
    if (control) {
      if (control.webSocket.readyState !== WebSocket.OPEN || this.awaitingPong.has(control.webSocket)) {
        control.close('control-heartbeat-failed');
      } else {
        this.awaitingPong.add(control.webSocket);
        control.webSocket.ping();
      }
    }
    for (const [socket, channel] of this.channels) {
      if (socket.readyState !== WebSocket.OPEN || this.awaitingPong.has(socket)) {
        channel.close();
      } else {
        this.awaitingPong.add(socket);
        socket.ping();
      }
    }
  }

  /** 先撤销授权，再关闭全部socket，最后等待录制和listener收尾。 */
  private async cleanup(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.control?.close('service-stopped');
    this.control = null;
    for (const channel of this.channels.values()) channel.close();
    for (const socket of this.sockets) socket.destroy();
    const webSocketServer = this.webSocketServer;
    const server = this.server;
    this.webSocketServer = null;
    this.server = null;
    await Promise.all([
      ...this.drains,
      ...(webSocketServer ? [new Promise<void>((resolve, reject) =>
        webSocketServer.close(error => error ? reject(error) : resolve()))] : []),
      ...(server?.listening ? [new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()))] : []),
    ]);
    this.awaitingPong.clear();
  }
}
