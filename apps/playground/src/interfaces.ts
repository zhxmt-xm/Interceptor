import type { PlaygroundMcpCallResult, PlaygroundMcpTool } from './mcp/session';

export type PlaygroundConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type PlaygroundManualStatus = 'not-run' | 'pass' | 'fail' | 'blocked';
export type PlaygroundSection = 'mcp' | 'traffic';

export interface PlaygroundToolRun {
  readonly error?: string;
  readonly result?: PlaygroundMcpCallResult;
  readonly state: 'idle' | 'running' | 'complete' | 'failed' | 'aborted';
  readonly tool?: PlaygroundMcpTool;
}

export interface PlaygroundManualRecord {
  readonly notes: string;
  readonly status: PlaygroundManualStatus;
}