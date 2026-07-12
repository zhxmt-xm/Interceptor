export type CoreProcessState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unresponsive'
  | 'restarting'
  | 'stopping';

export interface CoreProcessStatus {
  state: CoreProcessState;
  pid: number | null;
  restartCount: number;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string;
  detail: string | null;
}

export interface CoreEchoResult {
  value: string;
  handledAt: string;
  traceId: string;
}

export interface CoreDiagnosticRecord {
  timestamp: string;
  sequence: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  requestId?: string;
  command?: string;
  phase: string;
  action?: string;
  durationMs?: number;
  outcome?: 'success' | 'failed' | 'cancelled' | 'timed_out';
  errorCode?: string;
}

export interface CoreDiagnosticTrace {
  traceId: string;
  records: CoreDiagnosticRecord[];
  droppedCount: number;
}

export const DESKTOP_IPC_CHANNELS = {
  coreEcho: 'core:echo',
  coreGetProcessStatus: 'core:get-process-status',
  coreGetTrace: 'core:get-trace',
  coreProcessStatus: 'core:process-status',
} as const;

export interface InterceptorDesktopApi {
  echoCore(value: string): Promise<CoreEchoResult>;
  getCoreProcessStatus(): Promise<CoreProcessStatus>;
  getCoreTrace(traceId: string): Promise<CoreDiagnosticTrace>;
  onCoreProcessStatusChange(
    listener: (status: CoreProcessStatus) => void,
  ): () => void;
}