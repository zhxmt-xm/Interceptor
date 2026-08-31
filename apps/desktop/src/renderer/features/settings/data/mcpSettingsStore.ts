import { create } from 'zustand';

import type {
  McpApprovalRequest,
  McpDesktopStatus,
} from '../../../../shared/desktop-api';

interface McpSettingsState {
  readonly status: McpDesktopStatus | null;
  readonly approvals: readonly McpApprovalRequest[];
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  setStatus(status: McpDesktopStatus): void;
  addApproval(request: McpApprovalRequest): void;
  removeApproval(approvalId: string): void;
  setLoading(loading: boolean): void;
  setBusy(busy: boolean): void;
  setError(error: string | null): void;
}

/** Owns Renderer-visible MCP endpoint state and pending App-level approvals. */
export const useMcpSettingsStore = create<McpSettingsState>((set) => ({
  status: null,
  approvals: [],
  loading: false,
  busy: false,
  error: null,
  setStatus: (status) => set({ status, error: null }),
  addApproval: (request) => set((state) => ({
    approvals: state.approvals.some((entry) => entry.approvalId === request.approvalId)
      ? state.approvals
      : [...state.approvals, request],
  })),
  removeApproval: (approvalId) => set((state) => ({
    approvals: state.approvals.filter((entry) => entry.approvalId !== approvalId),
  })),
  setLoading: (loading) => set({ loading }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

/** Executes MCP settings intents and merges only successful public state. */
export class McpSettingsActions {
  /** Invalidates stale loads after events or mutations. */
  static #statusGeneration = 0;

  /** Installs the long-lived status and approval event subscriptions. */
  static subscribe(): () => void {
    const unsubscribeStatus = window.interceptor.onMcpStatusChange((status) => {
      this.#statusGeneration += 1;
      useMcpSettingsStore.getState().setStatus(status);
    });
    const unsubscribeApproval = window.interceptor.onMcpApprovalRequest((request) => {
      useMcpSettingsStore.getState().addApproval(request);
    });
    const unsubscribeApprovalSettled = window.interceptor.onMcpApprovalSettled((approvalId) => {
      useMcpSettingsStore.getState().removeApproval(approvalId);
    });
    return () => {
      unsubscribeStatus();
      unsubscribeApproval();
      unsubscribeApprovalSettled();
    };
  }

  /** Loads the current public endpoint state. */
  static async load(): Promise<void> {
    const statusGeneration = ++this.#statusGeneration;
    const store = useMcpSettingsStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const status = await window.interceptor.getMcpStatus();
      if (statusGeneration === this.#statusGeneration) {
        useMcpSettingsStore.getState().setStatus(status);
      }
    } catch (error) {
      if (statusGeneration === this.#statusGeneration) {
        useMcpSettingsStore.getState().setError(this.#describeError(error));
      }
      throw error;
    } finally {
      if (statusGeneration === this.#statusGeneration) {
        useMcpSettingsStore.getState().setLoading(false);
      }
    }
  }

  /** Enables the loopback MCP listener. */
  static enableServer(): Promise<void> {
    return this.#runStatus(() => window.interceptor.enableMcpServer());
  }

  /** Disables the listener without deleting Client credentials. */
  static disableServer(): Promise<void> {
    return this.#runStatus(() => window.interceptor.disableMcpServer());
  }

  /** Explicitly assigns a new unused endpoint. */
  static changeEndpoint(): Promise<void> {
    return this.#runStatus(() => window.interceptor.changeMcpEndpoint());
  }

  /** Creates one independently authenticated MCP Client. */
  static createClient(label: string): Promise<void> {
    return this.#runStatus(() => window.interceptor.createMcpClient(label));
  }

  /** Explicitly rotates one Client's credential. */
  static regenerateClientCredential(clientId: string): Promise<void> {
    return this.#runStatus(() => window.interceptor.regenerateMcpClientCredential(clientId));
  }

  /** Revokes one Client. */
  static revokeClient(clientId: string): Promise<void> {
    return this.#runStatus(() => window.interceptor.revokeMcpClient(clientId));
  }

  /** Switches one Client to Ask. */
  static requireClientApproval(clientId: string): Promise<void> {
    return this.#runStatus(() => window.interceptor.requireMcpClientApproval(clientId));
  }

  /** Switches one Client to Auto. */
  static automaticallyExecuteClientTools(clientId: string): Promise<void> {
    return this.#runStatus(() => window.interceptor.automaticallyExecuteMcpClientTools(clientId));
  }

  /** Copies the complete secret-bearing MCP configuration entirely inside Main. */
  static async copyClientConfiguration(clientId: string): Promise<void> {
    await this.#run(() => window.interceptor.copyMcpClientConfiguration(clientId));
  }

  /** Allows one pending change Tool call. */
  static async allowToolCall(approvalId: string): Promise<void> {
    await this.#settleApproval(approvalId, () => window.interceptor.allowMcpToolCall(approvalId));
  }

  /** Denies one pending change Tool call. */
  static async denyToolCall(approvalId: string): Promise<void> {
    await this.#settleApproval(approvalId, () => window.interceptor.denyMcpToolCall(approvalId));
  }

  /** Resets static sequencing between isolated unit tests. */
  static resetForTests(): void {
    this.#statusGeneration += 1;
  }

  /** Executes one status-returning intent. */
  static async #runStatus(operation: () => Promise<McpDesktopStatus>): Promise<void> {
    const status = await this.#run(operation);
    this.#statusGeneration += 1;
    const store = useMcpSettingsStore.getState();
    store.setStatus(status);
    store.setLoading(false);
  }

  /** Executes one serialized Settings mutation. */
  static async #run<T>(operation: () => Promise<T>): Promise<T> {
    const store = useMcpSettingsStore.getState();
    if (store.busy) throw new Error('Another MCP settings operation is already running.');
    store.setBusy(true);
    store.setError(null);
    try {
      return await operation();
    } catch (error) {
      useMcpSettingsStore.getState().setError(this.#describeError(error));
      throw error;
    } finally {
      useMcpSettingsStore.getState().setBusy(false);
    }
  }

  /** Removes an approval only after Main accepts the verdict. */
  static async #settleApproval(
    approvalId: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
      useMcpSettingsStore.getState().removeApproval(approvalId);
    } catch (error) {
      useMcpSettingsStore.getState().setError(this.#describeError(error));
      throw error;
    }
  }

  /** Converts unknown IPC failures to bounded UI text. */
  static #describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
