import type {
  HeaderBag,
  RuleBodyEffect,
  RuleHeaderEffect,
  RuleHitRecord,
} from '../../rules/interfaces';

/** replacement已经按最终headers编码，不包含HTTP transfer framing。 */
export type HttpInterceptionBody =
  | { action: 'keep' }
  | { action: 'replace'; content: Uint8Array };

export type HttpInterceptionCommonDecision =
  | { action: 'bypass' }
  | { action: 'abort'; mode: 'close' | 'reset' }
  | { action: 'aborted' };

export type HttpInterceptionRequestDecision =
  | HttpInterceptionCommonDecision
  | {
      action: 'intercept';
      method: string;
      url: string;
      headers: HeaderBag;
      editedHeaderNames: string[];
      body: HttpInterceptionBody;
      delayMs: number;
    }
  | {
      action: 'respond';
      statusCode: number;
      headers: HeaderBag;
      body: Extract<HttpInterceptionBody, { action: 'replace' }>;
    };

export type HttpInterceptionResponseDecision =
  | HttpInterceptionCommonDecision
  | {
      action: 'intercept';
      statusCode: number;
      headers: HeaderBag;
      editedHeaderNames: string[];
      body: HttpInterceptionBody;
      delayMs: number;
    };

export interface HttpInterceptionResult<Decision> {
  decision: Decision;
  hits: readonly RuleHitRecord[];
  headerEffects: readonly RuleHeaderEffect[];
  bodyEffect?: RuleBodyEffect;
}
