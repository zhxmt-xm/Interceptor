import type { MacosHelperServiceErrorCode, MacosHelperServiceOperation } from '../../interfaces';

export class MacosHelperServiceError extends Error {
  constructor(
    readonly code: MacosHelperServiceErrorCode,
    readonly executionState: 'completed' | 'unknown' = 'unknown',
    readonly operation?: MacosHelperServiceOperation,
    /** A service frame was handed to a connected socket; this does not prove completion. */
    readonly requestSent = false,
  ) {
    super(`macOS helper service request failed: ${code}.`);
    this.name = 'MacosHelperServiceError';
  }

  hasUnconfirmedMutation(): boolean {
    return this.executionState === 'unknown'
      && this.operation !== 'status' && this.operation !== 'system-proxy.read' && this.operation !== 'system-proxy.read-effective'
      && this.operation !== 'request.get-completion'
      && ['certificate-state-uncertain', 'timeout', 'unavailable', 'invalid-response', 'verification-failed'].includes(this.code);
  }
}
