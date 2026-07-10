export type CoreLifecycleState =
  | 'stopped'
  | 'starting'
  | 'healthy'
  | 'unhealthy'
  | 'restarting'
  | 'stopping';

export interface CoreStatus {
  state: CoreLifecycleState;
  pid: number | null;
  restartCount: number;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string;
  detail: string | null;
}

export interface InterceptorDesktopApi {
  getCoreStatus(): Promise<CoreStatus>;
  onCoreStatusChange(listener: (status: CoreStatus) => void): () => void;
}