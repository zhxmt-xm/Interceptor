import { CaptureService } from '../../../capture/entry';
import { CoreDiagnostics } from '../../../core-diagnostics';
import { CaptureEventQueue } from '../../../proxy/internal/capture-event-queue';
import type { InspectionBodyChunk, InspectionHttpMessage } from '../../interfaces/inspection';
import type { InspectionWebSocketMessage } from '../../interfaces/websocket';
import { HttpRecording } from '../../internal/http-recording';

/** 通道时序测试只替换录制行为；真实存储由http-recording.test覆盖。 */
export class ObservedHttpRecording extends HttpRecording {
  /** 已交给录制层的wire消息。 */
  readonly messages: InspectionHttpMessage[] = [];
  /** 已消费的手机正文块。 */
  readonly chunks: InspectionBodyChunk[] = [];
  /** 实际结算调用次数。 */
  settledCount = 0;
  /** 只在需要帧断点的通道测试中提供可关联身份。 */
  captureId: string | undefined;
  /** WS原文观测，真实BodyStore另由录制集成测试验证。 */
  readonly frames: Array<{ message: InspectionWebSocketMessage; content: Uint8Array; timestamp: number }> = [];
  /** 最近一次应用确认的计数。 */
  traffic = { requestBytes: 0, responseBytes: 0 };

  /** 允许共享RuleService测试使用明确的Capture身份。 */
  override get captureExchangeId(): string | undefined { return this.captureId; }

  /** 继承生产录制类型，不启动文件存储。 */
  constructor() {
    super(new CaptureService(), new CaptureEventQueue(), {
      sessionId: 'unused',
      recording: false,
      appId: 'android:observed',
      appName: 'Android · Observed',
    }, new CoreDiagnostics());
  }

  /** 观察消息次序。 */
  override async recordMessage(message: InspectionHttpMessage): Promise<void> {
    this.messages.push(message);
  }

  /** 规则计算本身不改变这些通道测试的观测数据。 */
  override async recordRuleOutcome(): Promise<void> {}

  /** 观察正文消费。 */
  override async recordChunk(chunk: InspectionBodyChunk): Promise<void> {
    this.chunks.push(chunk);
  }

  /** 只记录与正式Capture相同的应用消息，不混入控制帧。 */
  override async recordWebSocketFrame(
    message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }>, content: Uint8Array, timestamp: number,
  ): Promise<number | undefined> {
    if (message.frame !== 'text' && message.frame !== 'binary') return undefined;
    this.frames.push({ message: structuredClone(message), content: Uint8Array.from(content), timestamp });
    return this.frames.length;
  }

  /** 观察实际应用计数。 */
  override async updateWebSocketTraffic(requestBytes: number, responseBytes: number): Promise<void> {
    this.traffic = { requestBytes, responseBytes };
  }

  /** 记录通道是否履行收尾责任。 */
  override async settle(): Promise<void> {
    this.settledCount++;
  }
}
