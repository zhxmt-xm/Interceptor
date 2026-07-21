import type { UpdateStatus } from '../../../shared/desktop-api';
import { DEFAULTS, ENGLISH_UPDATE_LABELS, STORAGE_KEY } from './constants';
import type { PrivacyPreferences } from './interfaces';

/** 从 localStorage 读取偏好并回退默认值；损坏时返回默认。 */
export function loadPreferences(): PrivacyPreferences {
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
export function persistPreferences(preferences: PrivacyPreferences): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // localStorage 不可用时忽略。
  }
}

/** 更新状态标签的默认（英文）翻译回退。 */
function defaultTranslate(key: string): string {
  return ENGLISH_UPDATE_LABELS[key] ?? key;
}

/** Pure update status presentation rules shared across Renderer surfaces. */
export class UpdateFormat {
  /** Return one concise state label. */
  static stateLabel(
    status: UpdateStatus,
    translate: (key: string) => string = defaultTranslate,
  ): string {
    switch (status.state) {
      case 'unsupported': return translate('settings.update.unavailable');
      case 'idle': return translate('settings.update.ready');
      case 'checking': return translate('settings.update.checking');
      case 'available': return translate('settings.update.available');
      case 'downloading': return translate('settings.update.downloading');
      case 'downloaded': return translate('settings.update.downloaded');
      case 'up-to-date': return translate('settings.update.upToDate');
      case 'failed': return translate('settings.update.failed');
    }
  }

  /** Return a semantic StatusBadge tone for one state. */
  static stateTone(
    status: UpdateStatus,
  ): 'green' | 'yellow' | 'red' | 'info' {
    if (status.state === 'failed') {
      return 'red';
    }
    if (status.state === 'unsupported') {
      return 'yellow';
    }
    if (
      status.state === 'checking' ||
      status.state === 'downloading'
    ) {
      return 'info';
    }
    return 'green';
  }

  /** Return bounded progress text for a determinate installer download. */
  static progress(
    status: UpdateStatus,
    locale = 'en',
    waitingLabel = 'Waiting',
  ): string {
    return status.progress === null
      ? waitingLabel
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
          .format(status.progress);
  }

  /** Return downloaded and total installer sizes in compact binary units. */
  static bytes(
    status: UpdateStatus,
    locale = 'en',
    unavailableLabel = 'Size unavailable',
  ): string {
    if (status.totalBytes === null) {
      return unavailableLabel;
    }
    const total = this.fileSize(status.totalBytes, locale);
    return status.downloadedBytes === null
      ? total
      : `${this.fileSize(status.downloadedBytes, locale)} / ${total}`;
  }

  /** Format one non-negative byte count without exposing locale variance. */
  private static fileSize(bytes: number, locale: string): string {
    const format = (value: number, digits: number): string =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
    if (bytes < 1024) {
      return `${format(bytes, 0)} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${format(bytes / 1024, 1)} KB`;
    }
    return `${format(bytes / (1024 * 1024), 1)} MB`;
  }
}
