/** Identifies deterministic Session database/schema corruption that may be quarantined. */
export class AgentSessionStoreCorruptionError extends Error {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = 'AgentSessionStoreCorruptionError';
  }
}
