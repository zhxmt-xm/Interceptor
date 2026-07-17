import type { UpdateStatus } from '../../shared/desktop-api';

export interface UpdateService {
  start(): void;
  status(): UpdateStatus;
  check(): Promise<UpdateStatus> | UpdateStatus;
  download(): Promise<UpdateStatus>;
  openDownloaded(): Promise<void>;
  onStatusChange(listener: (status: UpdateStatus) => void): () => void;
  stop(): void;
}