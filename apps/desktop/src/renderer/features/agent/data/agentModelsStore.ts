import { create } from 'zustand';

import type {
  AgentModelsSnapshot,
  AgentProviderDraft,
  AgentProviderVerification,
} from '../../../../shared/desktop-api';

interface AgentModelsState {
  readonly snapshot: AgentModelsSnapshot | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  setSnapshot(snapshot: AgentModelsSnapshot): void;
  setLoading(loading: boolean): void;
  setBusy(busy: boolean): void;
  setError(error: string | null): void;
}

/** Owns the one Renderer-visible redacted Provider snapshot. */
export const useAgentModelsStore = create<AgentModelsState>((set) => ({
  snapshot: null,
  loading: false,
  busy: false,
  error: null,
  setSnapshot: (snapshot) => set({ snapshot, error: null }),
  setLoading: (loading) => set({ loading }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

/** Executes typed Provider intents and merges only successful public snapshots. */
export class AgentModelsActions {
  static #snapshotGeneration = 0;

  /** Load encrypted Provider metadata through Main without receiving credentials. */
  static async load(): Promise<void> {
    const snapshotGeneration = ++this.#snapshotGeneration;
    const store = useAgentModelsStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const snapshot = await window.interceptor.getAgentModels();
      if (snapshotGeneration === this.#snapshotGeneration) {
        useAgentModelsStore.getState().setSnapshot(snapshot);
      }
    } catch (error) {
      if (snapshotGeneration === this.#snapshotGeneration) {
        useAgentModelsStore.getState().setError(this.describeError(error));
      }
      throw error;
    } finally {
      if (snapshotGeneration === this.#snapshotGeneration) {
        useAgentModelsStore.getState().setLoading(false);
      }
    }
  }

  /** Test one draft without changing the persisted snapshot. */
  static async testConnection(
    draft: AgentProviderDraft,
  ): Promise<AgentProviderVerification> {
    return this.run(() => window.interceptor.testAgentProviderConnection(draft));
  }

  /** Persist one exact previously verified draft. */
  static async saveVerified(verificationId: string): Promise<void> {
    await this.runSnapshot(() => window.interceptor.saveVerifiedAgentProvider(verificationId));
  }

  /** Select the default model for future Chats. */
  static async setDefault(providerId: string): Promise<void> {
    await this.runSnapshot(() => window.interceptor.setDefaultAgentModel(providerId));
  }

  /** Remove one Provider and merge Runtime's repaired default. */
  static async remove(providerId: string): Promise<void> {
    await this.runSnapshot(() => window.interceptor.removeAgentProvider(providerId));
  }

  /** Execute one non-snapshot Provider operation under the shared busy state. */
  private static async run<T>(operation: () => Promise<T>): Promise<T> {
    const store = useAgentModelsStore.getState();
    if (store.busy) {
      throw new Error('Another Agent Provider operation is already running.');
    }
    store.setBusy(true);
    store.setError(null);
    try {
      return await operation();
    } catch (error) {
      store.setError(this.describeError(error));
      throw error;
    } finally {
      useAgentModelsStore.getState().setBusy(false);
    }
  }

  /** Execute one snapshot-returning Provider operation. */
  private static async runSnapshot(
    operation: () => Promise<AgentModelsSnapshot>,
  ): Promise<void> {
    const snapshot = await this.run(operation);
    this.#snapshotGeneration += 1;
    const store = useAgentModelsStore.getState();
    store.setSnapshot(snapshot);
    store.setLoading(false);
  }

  /** Convert unknown IPC failures to bounded UI text. */
  private static describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
