/** 保留字段顺序、大小写、重复值和空值的HTTP headers。 */
export type InspectionHeaders = Array<[string, string]>;

export interface InspectionRequest {
  method: string;
  url: string;
  httpVersion: '1.0' | '1.1' | '2';
  headers: InspectionHeaders;
}

export interface InspectionResponse {
  statusCode: number;
  headers: InspectionHeaders;
}

export interface InspectionEnvelope {
  protocolVersion: 2;
  sessionId: string;
  exchangeId: string;
}

export interface InspectionBodyReplacement {
  action: 'replace';
  bodyId: string;
  byteLength: number;
}

export type InspectionBodyDecision = { action: 'keep' } | InspectionBodyReplacement;

export type InspectionCommonDecision =
  | { action: 'bypass' }
  | { action: 'abort'; mode: 'close' | 'reset' };

export type InspectionRequestDecision =
  | InspectionCommonDecision
  | {
      action: 'intercept';
      method: string;
      url: string;
      headers: InspectionHeaders;
      editedHeaderNames: string[];
      body: InspectionBodyDecision;
      delayMs: number;
    }
  | {
      action: 'respond';
      statusCode: number;
      headers: InspectionHeaders;
      body: InspectionBodyReplacement;
    };

export type InspectionResponseDecision =
  | InspectionCommonDecision
  | {
      action: 'intercept';
      statusCode: number;
      headers: InspectionHeaders;
      editedHeaderNames: string[];
      body: InspectionBodyDecision;
      delayMs: number;
    };

export type InspectionCancellationReason =
  | 'user'
  | 'client-closed'
  | 'upstream-failed'
  | 'device-stopped'
  | 'protocol-error';

export type InspectionBodyStopReason = 'early-response' | 'synthetic-response';

export type InspectionHttpMessage = InspectionEnvelope & (
  | { type: 'http.request'; stageId: string; request: InspectionRequest }
  | { type: 'http.response'; stageId: string; response: InspectionResponse }
  | { type: 'http.informational'; statusCode: number; headers: InspectionHeaders }
  | {
      type: 'http.decision';
      stageId: string;
      decisionId: string;
      phase: 'request';
      decision: InspectionRequestDecision;
    }
  | {
      type: 'http.decision';
      stageId: string;
      decisionId: string;
      phase: 'response';
      decision: InspectionResponseDecision;
    }
  | { type: 'http.applied'; stageId: string; decisionId: string }
  | { type: 'http.upgraded'; stageId: string; decisionId: string }
  | { type: 'http.upgrade-ready'; stageId: string; decisionId: string }
  | { type: 'exchange.complete'; requestBytes: number; responseBytes: number }
  | { type: 'exchange.completed' }
  | {
      type: 'exchange.cancel';
      cancellationId: string;
      reason: InspectionCancellationReason;
    }
  | { type: 'exchange.cancelled'; cancellationId: string }
  | {
      type: 'body.open';
      bodyId: string;
      phase: 'request' | 'response';
      role: 'original' | 'applied';
      byteLength: number | null;
    }
  | { type: 'body.ack'; bodyId: string; offset: number }
  | { type: 'body.end'; bodyId: string; byteLength: number; trailers: InspectionHeaders }
  | { type: 'body.stopped'; bodyId: string; byteLength: number; reason: InspectionBodyStopReason }
  | { type: 'body.discard'; bodyId: string }
  | { type: 'body.received'; bodyId: string; byteLength: number }
);

export interface InspectionBodyChunk {
  bodyId: string;
  offset: number;
  payload: Uint8Array;
}

export type InspectionPeer = 'android' | 'pc';
export type InspectionExchangeState = 'active' | 'upgrading' | 'upgraded' | 'completing' | 'completed' | 'aborted' | 'failed';

export interface InspectionHttpStage {
  id: string;
  decisionId: string | null;
  action: InspectionRequestDecision['action'] | null;
  applied: boolean;
}

export interface InspectionBodyState {
  owner: InspectionPeer;
  phase: 'request' | 'response';
  role: 'original' | 'applied' | 'replacement';
  byteLength: number | null;
  offset: number;
  termination: 'open' | 'complete' | 'stopped';
  received: boolean;
  discardRequested: boolean;
}
