import { create } from 'zustand';

import type { GitHubAuthStatus } from '../../../../shared/desktop-api';
import type { GitHubAuthViewState } from '../interfaces';

/** Renderer-visible GitHub authorization state; tokens remain inaccessible in Main. */
export const useGitHubAuthStore = create<GitHubAuthViewState>((set) => ({
  status: null,
  busy: false,
  error: null,
  applyStatus: (status) => set({ status, error: null }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

/** Narrow UI actions for GitHub Device Flow authorization. */
export class GitHubAuthActions {
  /** Start Device Flow; Main opens GitHub and continues polling in the background. */
  static async signIn(): Promise<void> {
    await this.run(() => window.interceptor.signInWithGitHub());
  }

  /** Reopen the fixed GitHub Device Flow page for the active one-time code. */
  static async openAuthorizationPage(): Promise<void> {
    const store = useGitHubAuthStore.getState();
    if (store.busy) {
      return;
    }
    store.setBusy(true);
    store.setError(null);
    try {
      await window.interceptor.openGitHubAuthorization();
    } catch (error) {
      store.setError(this.describeError(error));
    } finally {
      useGitHubAuthStore.getState().setBusy(false);
    }
  }

  /** Delete encrypted local authorization and reset private update access. */
  static async signOut(): Promise<void> {
    await this.run(() => window.interceptor.signOutFromGitHub());
  }

  /** Subscribe once at App scope so Settings follows background Device Flow polling. */
  static subscribe(): () => void {
    let active = true;
    const apply = (status: GitHubAuthStatus): void => {
      if (active) {
        useGitHubAuthStore.getState().applyStatus(status);
      }
    };
    const unsubscribe = window.interceptor.onGitHubAuthStatusChange(apply);
    void window.interceptor.getGitHubAuthStatus()
      .then(apply)
      .catch((error: unknown) => {
        if (active) {
          useGitHubAuthStore.getState().setError(this.describeError(error));
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }

  /** Execute one status-returning authorization operation. */
  private static async run(
    operation: () => Promise<GitHubAuthStatus>,
  ): Promise<void> {
    const store = useGitHubAuthStore.getState();
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
      useGitHubAuthStore.getState().setBusy(false);
    }
  }

  /** Convert unknown IPC failures to bounded UI text. */
  private static describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}