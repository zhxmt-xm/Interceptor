import {
  AppWindow,
  Database,
  Download,
  Lock,
  LockOpen,
  Palette,
  Shield,
  Wifi,
} from 'lucide-react';

import type { PrivacyPreferences, SettingsSection } from './interfaces';

export const SECTIONS: SettingsSection[] = [
  { id: 'proxy', labelKey: 'settings.nav.proxy', Icon: Wifi },
  { id: 'app-containers', labelKey: 'settings.nav.appContainers', Icon: AppWindow },
  { id: 'tls-passthrough', labelKey: 'settings.nav.tlsPassthrough', Icon: LockOpen },
  { id: 'certificates', labelKey: 'settings.nav.certificates', Icon: Shield },
  { id: 'appearance', labelKey: 'settings.nav.appearance', Icon: Palette },
  { id: 'storage', labelKey: 'settings.nav.storage', Icon: Database },
  { id: 'privacy', labelKey: 'settings.nav.privacy', Icon: Lock },
  { id: 'updates', labelKey: 'settings.nav.updates', Icon: Download },
];

/** 隐私偏好在 localStorage 中的键。 */
export const STORAGE_KEY = 'interceptor.privacy';

/** 隐私偏好默认值：默认全部遮罩并在导出未脱敏数据前警告。 */
export const DEFAULTS: PrivacyPreferences = {
  maskAuthorization: true,
  maskCookies: true,
  warnBeforeUnmasked: true,
};

export const ENGLISH_UPDATE_LABELS: Record<string, string> = {
  'settings.update.unavailable': 'Unavailable',
  'settings.update.authenticationRequired': 'Sign in required',
  'settings.update.ready': 'Ready',
  'settings.update.checking': 'Checking',
  'settings.update.available': 'Available',
  'settings.update.downloading': 'Downloading',
  'settings.update.downloaded': 'Downloaded',
  'settings.update.upToDate': 'Up to date',
  'settings.update.failed': 'Failed',
};
