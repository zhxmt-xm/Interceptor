import type { DesktopUiLanguage } from './desktop-api';

export type DesktopUiTheme = 'light' | 'dark' | 'warm' | 'ember';

export interface ExportPrivacyDefaults {
  readonly maskAuthorization: boolean;
  readonly maskCookies: boolean;
  readonly warnBeforeUnmasked: boolean;
}

export type UiPreferenceChange =
  | { readonly kind: 'language'; readonly language: DesktopUiLanguage }
  | { readonly kind: 'theme'; readonly theme: DesktopUiTheme }
  | ({ readonly kind: 'export-privacy-defaults' } & Partial<ExportPrivacyDefaults>);

export type UiPreferenceAppliedChange =
  | { readonly kind: 'language'; readonly language: DesktopUiLanguage }
  | { readonly kind: 'theme'; readonly theme: DesktopUiTheme }
  | ({ readonly kind: 'export-privacy-defaults' } & ExportPrivacyDefaults);

export type UiPreferenceResponse =
  | { readonly status: 'applied'; readonly change: UiPreferenceAppliedChange }
  | { readonly status: 'failed' };