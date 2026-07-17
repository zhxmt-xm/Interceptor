import { create } from 'zustand';

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

interface PrivacyState extends PrivacyPreferences {
  /** 更新单个隐私偏好并持久化。 */
  setPreference<K extends keyof PrivacyPreferences>(
    key: K,
    value: PrivacyPreferences[K],
  ): void;
}

const STORAGE_KEY = 'interceptor.privacy';

const DEFAULTS: PrivacyPreferences = {
  maskAuthorization: true,
  maskCookies: true,
  warnBeforeUnmasked: true,
};

/** 从 localStorage 读取偏好并回退默认值；损坏时返回默认。 */
function loadPreferences(): PrivacyPreferences {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULTS;
    }
    const parsed = JSON.parse(raw) as Partial<PrivacyPreferences>;
    return {
      maskAuthorization: parsed.maskAuthorization ?? DEFAULTS.maskAuthorization,
      maskCookies: parsed.maskCookies ?? DEFAULTS.maskCookies,
      warnBeforeUnmasked: parsed.warnBeforeUnmasked ?? DEFAULTS.warnBeforeUnmasked,
    };
  } catch {
    return DEFAULTS;
  }
}

/** 持久化偏好；写入失败静默忽略（隐私偏好丢失不影响功能）。 */
function persistPreferences(preferences: PrivacyPreferences): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // localStorage 不可用时忽略。
  }
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  ...loadPreferences(),
  setPreference(key, value) {
    set({ [key]: value } as Partial<PrivacyState>);
    const { maskAuthorization, maskCookies, warnBeforeUnmasked } = get();
    persistPreferences({ maskAuthorization, maskCookies, warnBeforeUnmasked });
  },
}));
