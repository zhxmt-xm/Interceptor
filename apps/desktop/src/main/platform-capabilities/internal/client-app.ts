import { resolveWindowsClientAppHelperPath } from '../windows/client-app/client-app-helper';

export function resolveClientAppHelperPath(
  nativeDirectory: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  switch (platform) {
    case 'win32':
      return resolveWindowsClientAppHelperPath(nativeDirectory);
    default:
      return null;
  }
}