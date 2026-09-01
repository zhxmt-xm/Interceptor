export type TrafficScenarioId = 'h1-json' | 'h1-upload' | 'h1-stream' | 'h1-failure';

export interface TrafficScenarioDescriptor {
  readonly description: string;
  readonly id: TrafficScenarioId;
  readonly title: string;
}

export interface TrafficRequestFact {
  readonly body: string;
  readonly bodyBytes: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: string;
  readonly path: string;
  readonly url: string;
}

export interface TrafficResponseFact {
  readonly body: string;
  readonly chunkTimingsMs: readonly number[];
  readonly headers: Readonly<Record<string, string>>;
  readonly statusCode: number;
}

export interface TrafficScenarioResult {
  readonly attempt: {
    readonly method: string;
    readonly path: string;
    readonly url: string;
  };
  readonly durationMs: number;
  readonly error?: string;
  readonly request: TrafficRequestFact | null;
  readonly response?: TrafficResponseFact;
  readonly scenarioId: TrafficScenarioId;
  readonly startedAt: string;
  readonly state: 'complete' | 'failed';
}