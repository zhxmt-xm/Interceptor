import { create } from 'zustand';

import type { ToolCapabilitySettingsSnapshot } from '../../../../shared/desktop-api';

interface ToolCapabilitySettingsState {
  readonly snapshot: ToolCapabilitySettingsSnapshot | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  setSnapshot(snapshot: ToolCapabilitySettingsSnapshot): void;
  setLoading(loading: boolean): void;
  setBusy(busy: boolean): void;
  setError(error: string | null): void;
}

/** Owns the latest Main-returned Tool capability settings snapshot. */
export const useToolCapabilitySettingsStore = create<ToolCapabilitySettingsState>((set) => ({
  snapshot: null,
  loading: false,
  busy: false,
  error: null,
  setSnapshot: (snapshot) => set({ snapshot, error: null }),
  setLoading: (loading) => set({ loading }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

/** Executes Tool capability settings intents and merges only successful snapshots. */
export class ToolCapabilitySettingsActions {
  static #snapshotGeneration = 0;

  /** Loads the complete Main-owned Tool capability settings snapshot. */
  static async load(): Promise<void> {
    const snapshotGeneration = ++this.#snapshotGeneration;
    const store = useToolCapabilitySettingsStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const snapshot = await window.interceptor.getToolCapabilitySettings();
      if (snapshotGeneration === this.#snapshotGeneration) {
        useToolCapabilitySettingsStore.getState().setSnapshot(snapshot);
      }
    } catch (error) {
      if (snapshotGeneration === this.#snapshotGeneration) {
        useToolCapabilitySettingsStore.getState().setError(this.#describeError(error));
      }
      throw error;
    } finally {
      if (snapshotGeneration === this.#snapshotGeneration) {
        useToolCapabilitySettingsStore.getState().setLoading(false);
      }
    }
  }

  /** Disables one Tool only for the internal Agent. */
  static async disableAgentTool(toolName: string): Promise<void> {
    await this.#runSnapshot(() => window.interceptor.disableAgentTool(toolName));
  }

  /** Enables one Tool only for the internal Agent. */
  static async enableAgentTool(toolName: string): Promise<void> {
    await this.#runSnapshot(() => window.interceptor.enableAgentTool(toolName));
  }

  /** Disables one Tool only for MCP clients. */
  static async disableMcpTool(toolName: string): Promise<void> {
    await this.#runSnapshot(() => window.interceptor.disableMcpTool(toolName));
  }

  /** Enables one Tool only for MCP clients. */
  static async enableMcpTool(toolName: string): Promise<void> {
    await this.#runSnapshot(() => window.interceptor.enableMcpTool(toolName));
  }

  /** Runs one snapshot mutation without overlapping another Settings write. */
  static async #runSnapshot(
    operation: () => Promise<ToolCapabilitySettingsSnapshot>,
  ): Promise<void> {
    const store = useToolCapabilitySettingsStore.getState();
    if (store.busy) {
      throw new Error('Another Tool capability settings operation is already running.');
    }
    store.setBusy(true);
    store.setError(null);
    try {
      const snapshot = await operation();
      this.#snapshotGeneration += 1;
      const currentStore = useToolCapabilitySettingsStore.getState();
      currentStore.setSnapshot(snapshot);
      currentStore.setLoading(false);
    } catch (error) {
      useToolCapabilitySettingsStore.getState().setError(this.#describeError(error));
      throw error;
    } finally {
      useToolCapabilitySettingsStore.getState().setBusy(false);
    }
  }

  /** Converts unknown IPC failures to bounded UI text. */
  static #describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}