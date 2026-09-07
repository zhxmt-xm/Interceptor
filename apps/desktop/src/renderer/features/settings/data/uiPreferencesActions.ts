import type { DesktopUiTheme, UiPreferenceAppliedChange, UiPreferenceChange, UiPreferenceResponse } from '../../../../shared/ui-preferences';
import { i18n } from '../../../i18n/i18n';
import { persistPreferences } from '../utils';
import { usePrivacyStore } from './privacyStore';

export class UiPreferencesActions {
  private active = true;
  private pendingWork = Promise.resolve();

  constructor(private readonly applyTheme: (theme: DesktopUiTheme) => void) {}

  subscribe(): () => void {
    const unsubscribeRequest = window.interceptor.onUiPreferenceChangeRequested((requestId) => {
      this.enqueue(() => this.applyRequest(requestId));
    });
    const unsubscribeChanged = window.interceptor.onUiPreferenceChanged((change) => {
      this.enqueue(async () => { await this.applyChange(change); });
    });
    return () => {
      this.active = false;
      unsubscribeRequest();
      unsubscribeChanged();
    };
  }

  private enqueue(operation: () => Promise<void>): void {
    this.pendingWork = this.pendingWork.then(async () => {
      if (this.active) await operation();
    }).catch(() => { console.warn('Unable to synchronize UI preferences.'); });
  }

  private async applyRequest(requestId: string): Promise<void> {
    const change = await window.interceptor.claimUiPreferenceChange(requestId);
    if (change === null) return;
    let response: UiPreferenceResponse = { status: 'failed' };
    try {
      if (this.active) response = { status: 'applied', change: await this.applyChange(change) };
    } catch {
      response = { status: 'failed' };
    }
    await window.interceptor.completeUiPreferenceChange(requestId, response);
  }

  private async applyChange(change: UiPreferenceChange): Promise<UiPreferenceAppliedChange> {
    if (change.kind === 'language') {
      await i18n.changeLanguage(change.language);
      globalThis.localStorage.setItem('interceptor.language', change.language);
      return change;
    }
    if (change.kind === 'theme') {
      globalThis.localStorage.setItem('interceptor.theme', change.theme);
      this.applyTheme(change.theme);
      return change;
    }
    const current = usePrivacyStore.getState();
    const preferences = {
      maskAuthorization: change.maskAuthorization ?? current.maskAuthorization,
      maskCookies: change.maskCookies ?? current.maskCookies,
      warnBeforeUnmasked: change.warnBeforeUnmasked ?? current.warnBeforeUnmasked,
    };
    persistPreferences(preferences);
    usePrivacyStore.setState(preferences);
    return { kind: 'export-privacy-defaults', ...preferences };
  }
}