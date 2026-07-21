import type { LucideIcon } from 'lucide-react';

import type { UpdateStatus } from '../../../shared/desktop-api';

export interface SettingsSection {
  id: string;
  labelKey: string;
  Icon: LucideIcon;
}

/**
 * 全局隐私偏好（持久化到 localStorage）。
 *
 * 导出对话框以此为默认脱敏项，并据 `warnBeforeUnmasked` 决定是否在导出未脱敏数据前
 * 提示确认。隐私偏好只是 Renderer 视图状态，不放宽 Preload 面，也不进入捕获数据面。
 */
export interface PrivacyPreferences {
  /** 导出默认遮罩 Authorization / Proxy-Authorization 与 URL 令牌。 */
  maskAuthorization: boolean;
  /** 导出默认遮罩 Cookie / Set-Cookie。 */
  maskCookies: boolean;
  /** 导出未脱敏数据前显示警告。 */
  warnBeforeUnmasked: boolean;
}

export interface PrivacyState extends PrivacyPreferences {
  /** 更新单个隐私偏好并持久化。 */
  setPreference<K extends keyof PrivacyPreferences>(
    key: K,
    value: PrivacyPreferences[K],
  ): void;
}

export interface UpdateViewState {
  status: UpdateStatus | null;
  busy: boolean;
  dismissed: boolean;
  error: string | null;
  applyStatus(status: UpdateStatus): void;
  setBusy(busy: boolean): void;
  dismiss(): void;
  setError(error: string | null): void;
}
