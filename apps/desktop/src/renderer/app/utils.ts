import type { ThemeMode } from '../theme/theme';
import type { PlatformOperation } from '../../shared/desktop-api';
import type { MessageKey } from '../i18n/english-catalog';

export const PLATFORM_OPERATION_LABEL_KEYS: Record<PlatformOperation, readonly MessageKey[]> = {
  'helper.prepare': ['boot.preparingPlatform'],
  'certificate.prepare': ['boot.preparingCertificate'],
  'certificate.generate': ['settings.certificates', 'settings.generate'],
  'certificate.install': ['settings.certificates', 'settings.install'],
  'certificate.uninstall': ['settings.trustStatus', 'settings.remove'],
  'certificate.delete': ['settings.certificates', 'settings.delete'],
  'certificate.view': ['settings.viewCertificate'],
  'certificate.reveal': ['settings.revealCertificate'],
  'certificate.sync': ['settings.certificates', 'settings.refresh'],
  'https-decryption.enable': ['settings.decryptHttps', 'settings.on'],
  'https-decryption.disable': ['settings.decryptHttps', 'settings.off'],
  'system-proxy.enable': ['settings.systemProxy', 'settings.enable'],
  'system-proxy.restore': ['settings.systemProxy', 'settings.restore'],
  'system-proxy.recover': ['settings.systemProxy', 'settings.recovery'],
  'system-proxy.update-upstream': ['settings.systemProxy', 'settings.refresh'],
  'system-proxy.configure-upstream': ['capture.upstream'],
  'system-proxy.status': ['settings.systemProxy', 'settings.status'],
  'app-container.enable': ['settings.appContainers.title', 'settings.enable'],
  'app-container.disable': ['settings.appContainers.title', 'settings.remove'],
  'app-container.enable-all': ['settings.appContainers.title', 'settings.appContainers.enableAll'],
  'app-container.disable-all': ['settings.appContainers.title', 'settings.appContainers.disableAll'],
};

/** 主题优先取用户上次的选择，没有记录时跟随系统深浅色。 */
export function readInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem('interceptor.theme');
  if (
    stored === 'light'
    || stored === 'dark'
    || stored === 'warm'
    || stored === 'ember'
  ) {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
