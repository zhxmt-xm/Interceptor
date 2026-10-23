import type { RuleBodyEffect, RuleHeaderEffect, RuleHitRecord } from '../../rules/interfaces';
import type { BodyRefInput, CaptureBodySide } from '../../capture/interfaces';
import type { BodyWriter } from '../../capture/internal/body-writer';
import type { InspectionHeaders, InspectionHttpMessage } from './inspection';

/** 由当前Recording所有者提供的录制时间切面，不从设备wire身份推导。 */
export interface InspectionRecordingOptions {
  sessionId: string;
  recording: boolean;
  appId: string;
  appName: string;
}

/** PC已计算的规则结果，实际效果等待Android应用确认。 */
export interface InspectionRuleOutcome {
  hits: readonly RuleHitRecord[];
  headerEffects: readonly RuleHeaderEffect[];
  bodyEffect?: RuleBodyEffect;
}

/** 一次已校验阶段的待应用决定与规则证据。 */
export interface RecordedHttpStage {
  phase: CaptureBodySide;
  decision: Extract<InspectionHttpMessage, { type: 'http.decision' }> | null;
  outcome: InspectionRuleOutcome | null;
  applied: boolean;
}

/** 正文的存储所有权，与wire流控状态分开。 */
export interface RecordedHttpBody {
  phase: CaptureBodySide;
  role: 'original' | 'applied';
  writer: BodyWriter;
  headers: InspectionHeaders;
  ended: boolean;
  truncated: boolean;
  trailers: InspectionHeaders;
  reference: BodyRefInput | null;
  finishing: Promise<void> | null;
}
