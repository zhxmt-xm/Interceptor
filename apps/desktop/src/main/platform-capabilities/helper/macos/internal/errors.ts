import type { MacosHelperServiceErrorCode, MacosHelperServiceOperation } from '../../interfaces';

export class MacosHelperServiceError extends Error {
  constructor(
    readonly code: MacosHelperServiceErrorCode,
    readonly executionState: 'completed' | 'unknown' = 'unknown',
    readonly operation?: MacosHelperServiceOperation,
  ) {
    super(`macOS helper service request failed: ${code}.`);
    this.name = 'MacosHelperServiceError';
  }

  hasUnconfirmedMutation(): boolean {
    return this.executionState === 'unknown'
      && this.operation !== 'status' && this.operation !== 'system-proxy.read' && this.operation !== 'system-proxy.read-effective'
      && ['certificate-state-uncertain', 'timeout', 'unavailable', 'invalid-response', 'verification-failed'].includes(this.code);
  }
}
