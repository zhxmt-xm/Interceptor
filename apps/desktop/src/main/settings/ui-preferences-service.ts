import { randomUUID } from 'node:crypto';

import type { UiPreferenceAppliedChange, UiPreferenceChange } from '../../shared/ui-preferences';
import type { PendingUiPreferenceChange } from './interfaces';
import { readAppliedPreferenceChange, readExportPrivacyDefaultsPatch, readUiLanguage, readUiTheme } from './utils';

export class UiPreferencesService {
  private readonly pendingChangesById = new Map<string, PendingUiPreferenceChange>();

  constructor(
    private readonly requestRendererChange: (requestId: string) => void,
    private readonly publishChange: (change: UiPreferenceAppliedChange, senderId: number) => void,
  ) {}

  async setLanguage(value: unknown, abortSignal?: AbortSignal) {
    const result = await this.requestChange({ kind: 'language', language: readUiLanguage(value) }, abortSignal);
    return { language: result.language };
  }

  async setTheme(value: unknown, abortSignal?: AbortSignal) {
    const result = await this.requestChange({ kind: 'theme', theme: readUiTheme(value) }, abortSignal);
    return { theme: result.theme };
  }

  async setExportPrivacyDefaults(value: unknown, abortSignal?: AbortSignal) {
    const result = await this.requestChange({ kind: 'export-privacy-defaults', ...readExportPrivacyDefaultsPatch(value) }, abortSignal);
    return { maskAuthorization: result.maskAuthorization, maskCookies: result.maskCookies, warnBeforeUnmasked: result.warnBeforeUnmasked };
  }

  private requestChange<Change extends UiPreferenceChange>(
    change: Change,
    abortSignal?: AbortSignal,
  ): Promise<Extract<UiPreferenceAppliedChange, { kind: Change['kind'] }>> {
    abortSignal?.throwIfAborted();
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const cancel = (): void => this.cancelChange(requestId);
      this.pendingChangesById.set(requestId, {
        change, abortSignal, cancel, phase: 'waiting', reject,
        resolve: (applied) => resolve(applied as Extract<UiPreferenceAppliedChange, { kind: Change['kind'] }>),
      });
      abortSignal?.addEventListener('abort', cancel, { once: true });
      try {
        this.requestRendererChange(requestId);
      } catch {
        this.releaseChange(requestId)?.reject(new Error('Unable to change the requested preference.'));
      }
    });
  }

  claimChange(requestId: string): UiPreferenceChange | null {
    const pending = this.pendingChangesById.get(requestId);
    if (pending === undefined || pending.phase !== 'waiting') return null;
    pending.phase = 'applying';
    pending.abortSignal?.removeEventListener('abort', pending.cancel);
    return pending.change;
  }

  completeChange(requestId: string, response: unknown, senderId: number): void {
    if (this.pendingChangesById.get(requestId)?.phase !== 'applying') return;
    const pending = this.releaseChange(requestId)!;
    try {
      const applied = readAppliedPreferenceChange(response, pending.change);
      this.publishChange(applied, senderId);
      pending.resolve(applied);
    } catch {
      pending.reject(new Error('Unable to change the requested preference.'));
    }
  }

  cancelChanges(): void {
    for (const requestId of this.pendingChangesById.keys()) this.cancelChange(requestId);
  }

  private cancelChange(requestId: string): void {
    const pending = this.releaseChange(requestId);
    if (pending === undefined) return;
    pending.reject(pending.abortSignal?.aborted
      ? pending.abortSignal.reason
      : new DOMException('Preference change cancelled.', 'AbortError'));
  }

  private releaseChange(requestId: string): PendingUiPreferenceChange | undefined {
    const pending = this.pendingChangesById.get(requestId);
    if (pending === undefined) return undefined;
    this.pendingChangesById.delete(requestId);
    pending.abortSignal?.removeEventListener('abort', pending.cancel);
    return pending;
  }
}