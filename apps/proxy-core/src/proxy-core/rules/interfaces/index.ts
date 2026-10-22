import type {
  BreakpointEdit,
  BreakpointHeader,
  BreakpointQueueKey,
  CaptureHeaderRuleEffect,
  RuleDefinition,
  WebSocketBreakpointFrame,
  WebSocketFrameDirection,
} from '@interceptor/core-protocol';

/** HTTP header 多值集合，形态兼容 Mockttp headers。 */
export type HeaderBag = Record<string, string | string[] | undefined>;

export interface RequestMatchInput {
  readonly method: string;
  readonly url: string;
  readonly host: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: HeaderBag;
  readonly mime?: string;
}

export interface ResponseMatchInput {
  readonly statusCode: number;
  readonly headers: HeaderBag;
  readonly mime?: string;
}

export interface MatchContext {
  readonly request: RequestMatchInput;
  readonly response?: ResponseMatchInput;
}

export type CompiledMatcher = (context: MatchContext) => boolean;

export interface MutableRequestState {
  method: string;
  url: string;
  headers: HeaderBag;
  /** Header names explicitly set or removed by product rules or breakpoint editing. */
  editedHeaderNames?: Set<string>;
  body?: string | Uint8Array;
}

export interface MutableResponseState {
  statusCode: number;
  headers: HeaderBag;
  /** Header names explicitly set or removed by product rules or breakpoint editing. */
  editedHeaderNames?: Set<string>;
  body?: string | Uint8Array;
}

export interface SyntheticResponseInit {
  readonly statusCode: number;
  readonly headers: HeaderBag;
  readonly body?: string | Uint8Array;
}

export interface ActionSummary {
  readonly action: string;
  readonly detail: string;
}

export type ActionOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'mutated'; readonly summary: ActionSummary }
  | {
      readonly kind: 'respond';
      readonly response: SyntheticResponseInit;
      readonly summary: ActionSummary;
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly summary: ActionSummary;
    }
  | {
      readonly kind: 'delay';
      readonly ms: number;
      readonly summary: ActionSummary;
    };

export type BreakpointPhase = 'request' | 'response' | 'websocket';
export type BreakpointResolutionAction = 'continue' | 'drop';
export type BreakpointState = 'continued' | 'edited' | 'dropped' | 'aborted';
export type BreakpointResolutionState = Exclude<BreakpointState, 'aborted'>;

export interface BreakpointSnapshot {
  readonly ruleName: string;
  /** 挂起流量所属的 Capture Exchange；未记录（未 Recording 等）时缺省。 */
  readonly exchangeId?: string;
  readonly method?: string;
  readonly url?: string;
  readonly statusCode?: number;
  readonly direction?: 'client-to-server' | 'server-to-client';
  readonly frame?: WebSocketBreakpointFrame;
  /** 当前应用消息已写入Capture时分配的frame sequence；控制帧缺省。 */
  readonly webSocketFrameSequence?: number;
  readonly opcode?: 1 | 2;
  readonly bodyFormat?: 'text' | 'hex';
  readonly headers: BreakpointHeader[];
  /** 此刻是否能看到原始正文；HTTP 头部阶段断点为 false。 */
  readonly bodyAvailable: boolean;
  readonly body?: string;
  /** 仅 WebSocket close 帧：对端给出的 close code。 */
  readonly closeCode?: number;
}

export interface BreakpointOutcome {
  readonly state: BreakpointState;
  readonly edit?: BreakpointEdit;
}

/** WS内容副本和已有Capture关联，不携带socket或源站执行能力。 */
export interface WebSocketMessageInput {
  readonly exchangeId?: string;
  readonly url: string;
  readonly direction: WebSocketFrameDirection;
  readonly frame: WebSocketBreakpointFrame;
  readonly content: Uint8Array;
  readonly isBinary: boolean;
  readonly closeCode?: number;
}

/** 本机bridge和Android副本共用的决定，协议端各自执行转发或取消。 */
export type WebSocketEvaluation =
  | { readonly kind: 'bypass' }
  | { readonly kind: 'drop' }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'replace'; readonly content: Uint8Array; readonly closeCode?: number };

export interface PendingBreakpointInfo {
  readonly id: string;
  readonly phase: BreakpointPhase;
  readonly queueKey: BreakpointQueueKey;
  /** 触发HTTP断点的Rule；WebSocket帧断点没有Rule。 */
  readonly ruleId?: string;
  readonly createdAt: number;
  readonly snapshot: BreakpointSnapshot;
}

export interface PendingBreakpointEntry extends PendingBreakpointInfo {
  /** HTTP suspension所属的内部request ID；本机与协议副本各自独立，WS消息缺省。 */
  readonly requestId?: string;
  readonly settle: (outcome: BreakpointOutcome) => void;
}

export interface BreakpointSuspension {
  readonly id: string;
  readonly outcome: Promise<BreakpointOutcome>;
}

export interface RuleHitRecord {
  readonly ruleId: string;
  readonly ruleRevision: number;
  readonly phase: 'request' | 'response';
  readonly action: string;
  readonly summary: string;
}

/** 单次 header action 产生的可展示值；按规则执行顺序保留。 */
export interface RuleHeaderEffect {
  readonly ruleId: string;
  readonly phase: 'request' | 'response';
  readonly effect: CaptureHeaderRuleEffect;
  readonly name: string;
  readonly value: string;
}

/** 单次正文替换的最终写入者；后执行的 Rule 或 Breakpoint 覆盖前者。 */
export interface RuleBodyEffect {
  readonly ruleId: string;
  readonly phase: 'request' | 'response';
  readonly effect: 'replace';
  readonly source: 'text' | 'file';
}

export type RequestEvaluation =
  | {
      readonly kind: 'continue';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly bodyEffect?: RuleBodyEffect;
      readonly delayMs: number;
    }
  | {
      readonly kind: 'aborted';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly bodyEffect?: RuleBodyEffect;
    }
  | {
      readonly kind: 'respond';
      readonly response: SyntheticResponseInit;
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly bodyEffect?: RuleBodyEffect;
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly bodyEffect?: RuleBodyEffect;
    };

export type ResponseEvaluation =
  | {
      readonly kind: 'continue';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly bodyEffect?: RuleBodyEffect;
      readonly delayMs: number;
    }
  | {
      readonly kind: 'aborted';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly bodyEffect?: RuleBodyEffect;
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly bodyEffect?: RuleBodyEffect;
    };

export interface BreakpointHitInfo {
  readonly id: string;
  readonly phase: BreakpointPhase;
  readonly exchangeId?: string;
}

export interface RuleServiceOptions {
  readonly onBreakpointHit?: (info: BreakpointHitInfo) => void;
}

export interface CompiledRule {
  readonly rule: RuleDefinition;
  readonly matcher: CompiledMatcher;
}