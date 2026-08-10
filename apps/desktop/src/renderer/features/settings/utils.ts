import type {
  SystemProxyStatus,
  TlsCompatibilityEvent,
  UpdateStatus,
} from '../../../shared/desktop-api';
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

/** 字节数按本地化的 B / KB / MB / GB / TB 折算。 */
export function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) {
    return `${new Intl.NumberFormat(locale).format(bytes)} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)} ${units[unitIndex]}`;
}

/** ISO 时间戳按语言格式化为短日期；无法解析时原样返回。 */
export function formatDate(value: string, locale: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed);
}

/** 把系统代理归属事实映射为一个稳定的语义标签与色调。 */
export function proxyTitleStatus(status: SystemProxyStatus): {
  labelKey: string;
  tone: 'green' | 'yellow' | 'red' | 'info';
} {
  if (!status.supported) {
    return { labelKey: 'settings.unavailable', tone: 'yellow' };
  }
  if (status.ownershipLost) {
    return { labelKey: 'settings.ownershipLost', tone: 'red' };
  }
  if (status.owned) {
    return { labelKey: 'settings.owned', tone: 'green' };
  }
  if (status.enabled) {
    return { labelKey: 'settings.external', tone: 'yellow' };
  }
  return { labelKey: 'settings.direct', tone: 'info' };
}

/** 把未知的 IPC 失败收敛成可展示的一行反馈。 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Cheap UI check; Core performs canonical DNS/IP validation before persistence. */
export function isTlsPassthroughHostDraft(value: string): boolean {
  const host = value.trim();
  return host.length > 0 &&
    !host.includes('://') &&
    !host.includes('/') &&
    !/\s/.test(host);
}

const TLS_COMPATIBILITY_REASON_KEYS: Record<TlsCompatibilityEvent['reason'], string> = {
  'cert-rejected': 'settings.tlsPassthrough.compatibilityCertRejectedReason',
  closed: 'settings.tlsPassthrough.compatibilityClosedReason',
  reset: 'settings.tlsPassthrough.compatibilityResetReason',
  'no-shared-cipher': 'settings.tlsPassthrough.compatibilityNoSharedCipherReason',
  'handshake-timeout': 'settings.tlsPassthrough.compatibilityHandshakeTimeoutReason',
  unknown: 'settings.tlsPassthrough.compatibilityUnknownReason',
};

/** Describe one TLS handshake failure cause in the compatibility dialog. */
export function tlsCompatibilityReasonKey(
  reason: TlsCompatibilityEvent['reason'],
): string {
  return TLS_COMPATIBILITY_REASON_KEYS[reason];
}

/** Match one observed hostname against persisted exact or leading-wildcard patterns. */
export function isTlsPassthroughHostCovered(
  host: string,
  patterns: readonly string[],
): boolean {
  const normalizedHost = host.trim().toLowerCase();
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.trim().toLowerCase();
    if (normalizedPattern === normalizedHost) {
      return true;
    }
    if (!normalizedPattern.startsWith('*.')) {
      return false;
    }
    const suffix = normalizedPattern.slice(1);
    return normalizedHost.length > suffix.length && normalizedHost.endsWith(suffix);
  });
}

/**
 * Derive every passthrough pattern a user could reasonably pick for one observed host:
 * the exact host first, then one wildcard per parent domain.
 * 最宽只到二级域（`*.microsoft.com`）；再宽就是 `*.com` 这种放掉整个顶级域的选项，不提供。
 * 哪一级安全取决于站点，产品不替用户判断，只把候选摆出来由用户勾选。
 */
export function tlsPassthroughPatternChoices(host: string): string[] {
  const labels = host.trim().toLowerCase().split('.');
  const choices = [labels.join('.')];
  for (let index = 1; index <= labels.length - 2; index += 1) {
    choices.push(`*.${labels.slice(index).join('.')}`);
  }
  return choices;
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
      case 'authentication-required': return translate('settings.update.authenticationRequired');
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
    if (status.state === 'authentication-required') {
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
