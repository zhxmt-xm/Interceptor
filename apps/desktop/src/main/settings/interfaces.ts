import type { UiPreferenceAppliedChange, UiPreferenceChange } from '../../shared/ui-preferences';

export interface PendingUiPreferenceChange {
  readonly change: UiPreferenceChange;
  readonly abortSignal: AbortSignal | undefined;
  readonly cancel: () => void;
  readonly resolve: (change: UiPreferenceAppliedChange) => void;
  readonly reject: (reason: unknown) => void;
  phase: 'waiting' | 'applying';
}