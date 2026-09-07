import { DESKTOP_UI_LANGUAGES, type DesktopUiLanguage } from '../../shared/desktop-api';
import type { DesktopUiTheme, ExportPrivacyDefaults, UiPreferenceAppliedChange, UiPreferenceChange } from '../../shared/ui-preferences';

export function readUiLanguage(value: unknown): DesktopUiLanguage {
  if (typeof value !== 'string' || !DESKTOP_UI_LANGUAGES.includes(value as DesktopUiLanguage)) {
    throw new Error('Invalid UI language.');
  }
  return value as DesktopUiLanguage;
}

export function readUiTheme(value: unknown): DesktopUiTheme {
  if (value !== 'light' && value !== 'dark' && value !== 'warm' && value !== 'ember') {
    throw new Error('Invalid UI theme.');
  }
  return value;
}

export function readExportPrivacyDefaultsPatch(value: unknown): Partial<ExportPrivacyDefaults> {
  if (!isRecord(value)) throw new Error('Invalid export privacy defaults.');
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !['maskAuthorization', 'maskCookies', 'warnBeforeUnmasked'].includes(key) || typeof value[key] !== 'boolean')) {
    throw new Error('Invalid export privacy defaults.');
  }
  return { ...value } as Partial<ExportPrivacyDefaults>;
}

export function readAppliedPreferenceChange(response: unknown, requested: UiPreferenceChange): UiPreferenceAppliedChange {
  if (!isRecord(response) || response.status !== 'applied' || Object.keys(response).length !== 2 || !isRecord(response.change)) {
    throw new Error('Invalid preference response.');
  }
  const change = response.change;
  if (change.kind !== requested.kind) throw new Error('Invalid preference response.');
  if (requested.kind === 'language') {
    if (Object.keys(change).length !== 2 || change.language !== requested.language) throw new Error('Invalid preference response.');
    return { kind: 'language', language: readUiLanguage(change.language) };
  }
  if (requested.kind === 'theme') {
    if (Object.keys(change).length !== 2 || change.theme !== requested.theme) throw new Error('Invalid preference response.');
    return { kind: 'theme', theme: readUiTheme(change.theme) };
  }
  const { kind, ...values } = change;
  const preferences = readExportPrivacyDefaultsPatch(values);
  if (Object.keys(preferences).length !== 3) throw new Error('Invalid preference response.');
  for (const key of ['maskAuthorization', 'maskCookies', 'warnBeforeUnmasked'] as const) {
    if (requested[key] !== undefined && requested[key] !== preferences[key]) throw new Error('Invalid preference response.');
  }
  return { kind: 'export-privacy-defaults', ...preferences } as UiPreferenceAppliedChange;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}