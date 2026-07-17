interface TrustedRendererUrlOptions {
  devServerUrl: string | undefined;
  packagedRendererUrl: string;
}

export function isTrustedRendererUrl(
  candidateUrl: string,
  options: TrustedRendererUrlOptions,
): boolean {
  try {
    const candidate = new URL(candidateUrl);

    if (options.devServerUrl) {
      return candidate.origin === new URL(options.devServerUrl).origin;
    }

    const packaged = new URL(options.packagedRendererUrl);
    return candidate.protocol === packaged.protocol &&
      candidate.host === packaged.host &&
      candidate.username === packaged.username &&
      candidate.password === packaged.password &&
      candidate.pathname === packaged.pathname;
  } catch {
    return false;
  }
}