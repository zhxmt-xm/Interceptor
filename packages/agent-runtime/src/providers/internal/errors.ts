/** Identifies a Provider record that is structurally unsafe to retain. */
export class AgentProviderRecordCorruptionError extends Error {
  /** Preserve a stable classification while retaining the original parser failure. */
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = 'AgentProviderRecordCorruptionError';
  }
}
