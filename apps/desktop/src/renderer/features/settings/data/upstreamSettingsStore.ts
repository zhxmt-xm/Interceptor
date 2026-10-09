import { create } from 'zustand';

import type { UpstreamProxyProtocol, UpstreamProxySettings, UpstreamSettingsSnapshot } from '../../../../shared/desktop-api';
import { describeUpstreamFailure, draftFromSettings, settingsFromDraft, upstreamDraftChanged } from '../UpstreamProxyEditor/utils';

export interface UpstreamEditorDraft {
  readonly mode: UpstreamProxySettings['mode'];
  readonly protocol: UpstreamProxyProtocol;
  readonly host: string;
  readonly port: string;
  readonly url: string;
}

interface UpstreamSettingsState {
  readonly snapshot: UpstreamSettingsSnapshot | null;
  readonly draft: UpstreamEditorDraft;
  readonly dirty: boolean;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly popoverOpen: boolean;
  readonly error: UpstreamSettingsSnapshot['error'];
}

export const EMPTY_UPSTREAM_DRAFT: UpstreamEditorDraft = {
  mode: 'system', protocol: 'http', host: '', port: '', url: '',
};

export const useUpstreamSettingsStore = create<UpstreamSettingsState>(() => ({
  snapshot: null, draft: { ...EMPTY_UPSTREAM_DRAFT }, dirty: false,
  loading: false, busy: false, popoverOpen: false, error: null,
}));

/** Coordinate the shared Settings/Capture draft through the normal typed Preload API. */
export class UpstreamSettingsActions {
  private static generation = 0;

  static updateDraft(change: Partial<UpstreamEditorDraft>): void {
    const state = useUpstreamSettingsStore.getState();
    const draft = { ...state.draft, ...change };
    useUpstreamSettingsStore.setState({
      draft, dirty: state.snapshot ? upstreamDraftChanged(draft, state.snapshot.settings) : true, error: null,
    });
  }

  static openPopover(): void {
    useUpstreamSettingsStore.setState({ popoverOpen: true });
  }

  static closePopover(): void {
    useUpstreamSettingsStore.setState({ popoverOpen: false });
  }

  static cancelDraft(): void {
    const state = useUpstreamSettingsStore.getState();
    useUpstreamSettingsStore.setState({
      draft: state.snapshot ? draftFromSettings(state.snapshot.settings, state.draft) : { ...EMPTY_UPSTREAM_DRAFT },
      dirty: false, popoverOpen: false, error: null,
    });
  }

  static subscribe(): () => void {
    const unsubscribe = window.interceptor.onUpstreamSettingsChanged(() => {
      void this.load().catch(error => console.error('[upstream] State refresh failed.', error));
    });
    return () => {
      this.generation += 1;
      unsubscribe();
    };
  }

  static async load(): Promise<void> {
    const generation = ++this.generation;
    useUpstreamSettingsStore.setState({ loading: true });
    try {
      const snapshot = await window.interceptor.getUpstreamSettings();
      if (generation === this.generation) this.mergeSnapshot(snapshot, false);
    } catch (error) {
      if (generation === this.generation) {
        useUpstreamSettingsStore.setState({ error: describeUpstreamFailure(error) });
      }
      throw error;
    } finally {
      if (generation === this.generation) useUpstreamSettingsStore.setState({ loading: false });
    }
  }

  static async apply(): Promise<void> {
    const state = useUpstreamSettingsStore.getState();
    if (state.busy) throw new Error('Another upstream settings operation is already running.');
    const settings = settingsFromDraft(state.draft);
    this.generation += 1;
    useUpstreamSettingsStore.setState({ busy: true, loading: false, error: null });
    try {
      const snapshot = await window.interceptor.applyUpstreamSettings(settings);
      this.generation += 1;
      this.mergeSnapshot(snapshot, true);
    } catch (error) {
      this.generation += 1;
      let reported = describeUpstreamFailure(error);
      try {
        const snapshot = await window.interceptor.getUpstreamSettings();
        this.generation += 1;
        this.mergeSnapshot(snapshot, false);
        reported = snapshot.error ?? reported;
      } catch (refreshError) {
        console.error('[upstream] Could not confirm the state after failed Apply.', refreshError);
      }
      useUpstreamSettingsStore.setState({ error: reported });
      throw error;
    } finally {
      useUpstreamSettingsStore.setState({ busy: false, loading: false });
    }
  }

  private static mergeSnapshot(snapshot: UpstreamSettingsSnapshot, applied: boolean): void {
    const state = useUpstreamSettingsStore.getState();
    const draft = applied || !state.dirty ? draftFromSettings(snapshot.settings, state.draft) : state.draft;
    useUpstreamSettingsStore.setState({
      snapshot, draft, dirty: upstreamDraftChanged(draft, snapshot.settings),
      error: snapshot.error, loading: false,
    });
  }
}
