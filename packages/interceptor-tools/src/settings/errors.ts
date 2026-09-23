export type PlatformOperation =
  | 'helper.prepare'
  | 'certificate.prepare' | 'certificate.generate' | 'certificate.install'
  | 'certificate.uninstall' | 'certificate.delete' | 'certificate.view'
  | 'certificate.reveal' | 'certificate.sync'
  | 'https-decryption.enable' | 'https-decryption.disable'
  | 'system-proxy.enable' | 'system-proxy.restore' | 'system-proxy.recover'
  | 'system-proxy.update-upstream' | 'system-proxy.status'
  | 'app-container.enable' | 'app-container.disable'
  | 'app-container.enable-all' | 'app-container.disable-all';

export class PlatformOperationInProgressError extends Error {
  readonly code = 'operation_in_progress';

  constructor(readonly operation: PlatformOperation) {
    super(`operation_in_progress: ${operation}`);
    this.name = 'PlatformOperationInProgressError';
  }
}