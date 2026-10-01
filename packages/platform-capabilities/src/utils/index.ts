/** Read an Error name for structured diagnostics. */
export function readErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/** Read an Error message without changing its content. */
export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
