import { create } from 'zustand';

import type { UpdateStatus } from '../../../../shared/desktop-api';
import type { UpdateViewState } from '../interfaces';

/** Shared Renderer state for Updates Settings, topbar notification and status bar. */
export const useUpdateStore = create<UpdateViewState>((set, get) => ({
  status: null,
  busy: false,
  dismissed: false,
  error: null,
  applyStatus: (status) => set({
    status,
    dismissed: (
      status.state === 'available' || status.state === 'downloaded'
    ) && get().status?.state !== status.state
      ? false
      : get().dismissed,
    error: status.state === 'failed' ? status.message : null,
  }),
  setBusy: (busy) => set({ busy }),
  dismiss: () => set({ dismissed: true }),
  setError: (error) => set({ error }),
}));

/** Update UI actions shared by Settings, notification and App subscription. */
export class UpdateActions {
  /** Check for an update and merge the resulting bounded status. */
  static async check(): Promise<void> {
    await this.run(() => window.interceptor.checkForUpdates());
  }

  /** Download the selected GitHub Release installer after explicit user action. */
  static async download(): Promise<void> {
    await this.run(() => window.interceptor.downloadUpdate());
  }

  /** Cancel the active download; Main removes the partial file and returns to available. */
  static async cancel(): Promise<void> {
    // The download action keeps busy set for its whole duration, so cancel must
    // not go through run(); otherwise the click would be dropped while downloading.
    const store = useUpdateStore.getState();
    store.setError(null);
    try {
      store.applyStatus(await window.interceptor.cancelUpdateDownload());
    } catch (error) {
      store.setError(this.describeError(error));
    }
  }

  /** Ask Main to copy the fixed browser download URL to the system clipboard. */
  static async copyLink(): Promise<void> {
    const store = useUpdateStore.getState();
    store.setError(null);
    try {
      await window.interceptor.copyUpdateDownloadLink();
    } catch (error) {
      store.setError(this.describeError(error));
    }
  }

  /** Open the completely downloaded installer through the operating system. */
  static async openDownloaded(): Promise<void> {
    const store = useUpdateStore.getState();
    if (store.busy) {
      return;
    }
    store.setBusy(true);
    store.setError(null);
    try {
      await window.interceptor.openDownloadedUpdate();
    } catch (error) {
      store.setError(this.describeError(error));
    } finally {
      store.setBusy(false);
    }
  }

  /** Subscribe once at App scope so all update surfaces share one snapshot. */
  static subscribe(): () => void {
    let active = true;
    const apply = (status: UpdateStatus): void => {
      if (active) {
        useUpdateStore.getState().applyStatus(status);
      }
    };
    const unsubscribe = window.interceptor.onUpdateStatusChange(apply);
    void window.interceptor.getUpdateStatus()
      .then(apply)
      .catch((error: unknown) => {
        if (active) {
          useUpdateStore.getState().setError(this.describeError(error));
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }

  /** Execute one update status operation with shared busy/error handling. */
  private static async run(
    operation: () => Promise<UpdateStatus>,
  ): Promise<void> {
    const store = useUpdateStore.getState();
    if (store.busy) {
      return;
    }
    store.setBusy(true);
    store.setError(null);
    try {
      store.applyStatus(await operation());
    } catch (error) {
      store.setError(this.describeError(error));
    } finally {
      useUpdateStore.getState().setBusy(false);
    }
  }

  /** Convert unknown IPC failures to bounded UI text. */
  private static describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}