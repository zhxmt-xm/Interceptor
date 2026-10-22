import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { DiagnosticsRecorder } from '../../core-diagnostics';
import type { InspectionHelloMessage, InspectionSessionCredentials } from '../interfaces';
import { hasFields } from '../utils';
import { CONNECT_TIMEOUT_MS, MAX_INSPECTION_CONTROL_BYTES } from './constants';

/** v2控制连接拥有HTTP/WS会话凭据，不接受v1能力。 */
export class InspectionControlSession {
  /** hello完成前及撤销后都没有数据授权。 */
  private session: InspectionSessionCredentials | null = null;
  /** 只执行一次凭据撤销与连接收尾。 */
  private terminal = false;
  /** hello期限不作用于ready后的业务断点。 */
  private readonly helloTimer: NodeJS.Timeout;

  /** 绑定已认证的WSS，由listener撤销该连接所属数据流。 */
  constructor(
    readonly webSocket: WebSocket,
    private readonly diagnostics: DiagnosticsRecorder,
    private readonly revoke: () => void,
  ) {
    this.helloTimer = setTimeout(() => this.close('hello-timeout'), CONNECT_TIMEOUT_MS);
    webSocket.on('message', (data, binary) => {
      if (this.terminal) return;
      try {
        if (binary || this.session || !Buffer.isBuffer(data) ||
          data.byteLength > MAX_INSPECTION_CONTROL_BYTES) {
          this.close('invalid-control-message');
          return;
        }
        const message: unknown = JSON.parse(data.toString('utf8'));
        if (!validHello(message)) {
          this.close('invalid-control-message');
          return;
        }
        this.session = {
          sessionId: randomUUID(), sessionToken: randomBytes(32).toString('base64url'),
          capabilities: [...message.capabilities],
        };
        clearTimeout(this.helloTimer);
        webSocket.send(JSON.stringify({ type: 'session.ready', protocolVersion: 2, ...this.session }), error => {
          if (error) this.close('ready-send-failed');
        });
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        this.close('invalid-control-message');
      }
    });
    webSocket.on('error', () => this.close('control-network-error'));
    webSocket.once('close', () => this.close('control-closed'));
  }

  /** hello完成后才能取得临时数据授权。 */
  credentials(): InspectionSessionCredentials | null {
    return this.session ? { ...this.session, capabilities: [...this.session.capabilities] } : null;
  }

  /** 撤销授权及数据流，再终止控制连接。 */
  close(reason: string): void {
    if (this.terminal) return;
    this.terminal = true;
    this.session = null;
    clearTimeout(this.helloTimer);
    this.diagnostics.info('android.inspection-session-ended', { attributes: { reason } });
    try {
      this.revoke();
    } finally {
      this.webSocket.terminate();
    }
  }
}

/** HTTP是WS握手的前置能力；只接受已实现且顺序固定的能力组合。 */
function validHello(value: unknown): value is InspectionHelloMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return hasFields(message, ['type', 'protocolVersion', 'appVersion', 'capabilities'])
    && message.type === 'session.hello' && message.protocolVersion === 2
    && typeof message.appVersion === 'string' && message.appVersion.trim().length > 0
    && message.appVersion.length <= 64 && Array.isArray(message.capabilities)
    && message.capabilities[0] === 'http'
    && (message.capabilities.length === 1 ||
      message.capabilities.length === 2 && message.capabilities[1] === 'websocket');
}
