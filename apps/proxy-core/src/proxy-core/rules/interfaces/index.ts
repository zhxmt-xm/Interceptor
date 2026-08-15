import type {
  BreakpointEdit,
  BreakpointHeader,
  CaptureHeaderRuleEffect,
  RuleDefinition,
  WebSocketBreakpointFrame,
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
export type BreakpointResolutionAction = 'continue' | 'drop' | 'timeout';
export type BreakpointState = 'continued' | 'edited' | 'dropped' | 'timed_out' | 'aborted';
export type BreakpointResolutionState = Exclude<BreakpointState, 'aborted'>;
export type BreakpointTimeoutPolicy = 'continue' | 'drop';

export interface BreakpointSnapshot {
  readonly ruleName: string;
  /** 挂起流量所属的 Capture Exchange；未记录（未 Recording 等）时缺省。 */
  readonly exchangeId?: string;
  readonly method?: string;
  readonly url?: string;
  readonly statusCode?: number;
  readonly direction?: 'client-to-server' | 'server-to-client';
  readonly frame?: WebSocketBreakpointFrame;
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
  readonly timeoutPolicy?: BreakpointTimeoutPolicy;
}

export interface PendingBreakpointInfo {
  readonly id: string;
  readonly phase: BreakpointPhase;
  readonly createdAt: number;
  readonly deadline: number;
  readonly snapshot: BreakpointSnapshot;
}

export interface PendingBreakpointEntry extends PendingBreakpointInfo {
  /** HTTP suspension 所属的 Mockttp request ID；WebSocket 消息断点缺省。 */
  readonly requestId?: string;
  readonly timeoutPolicy: BreakpointTimeoutPolicy;
  readonly settle: (outcome: BreakpointOutcome) => void;
  timer: ReturnType<typeof setTimeout> | null;
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

export type RequestEvaluation =
  | {
      readonly kind: 'continue';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly delayMs: number;
    }
  | {
      readonly kind: 'aborted';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
    }
  | {
      readonly kind: 'respond';
      readonly response: SyntheticResponseInit;
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
    };

export type ResponseEvaluation =
  | {
      readonly kind: 'continue';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
      readonly delayMs: number;
    }
  | {
      readonly kind: 'aborted';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly hits: readonly RuleHitRecord[];
      readonly headerEffects: readonly RuleHeaderEffect[];
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