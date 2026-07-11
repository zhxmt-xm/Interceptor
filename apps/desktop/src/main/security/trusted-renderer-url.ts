import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface TrustedRendererUrlOptions {
  devServerUrl: string | undefined;
  packagedRendererPath: string;
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

    if (candidate.protocol !== 'file:') {
      return false;
    }

    return (
      path.normalize(fileURLToPath(candidate)) ===
      path.normalize(options.packagedRendererPath)
    );
  } catch {
    return false;
  }
}