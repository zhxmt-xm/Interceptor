/** AppContainer enumeration or helper contract failure. */
export class AppContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppContainerError';
  }
}
