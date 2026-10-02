/** The peer ended TLS without completing an HTTP/2 response. */
export class H2UpstreamIncompleteError extends Error {
  /** Stable failure code shared by forwarding, Composer and Core diagnostics. */
  readonly code = 'ERR_H2_UPSTREAM_INCOMPLETE';

  /** Describe a transport failure without exposing request data. */
  constructor() {
    super('Upstream TLS ended before the HTTP/2 response completed.');
    this.name = 'H2UpstreamIncompleteError';
  }
}
