import { create } from 'zustand';

import type {
  TlsCompatibilityEvent,
  TlsPassthroughReplaceResult,
} from '../../../../shared/desktop-api';
import { isTlsPassthroughHostCovered } from '../utils';

interface TlsCompatibilityState {
  events: TlsCompatibilityEvent[];
  settingsChangeSequence: number;
  apply(event: TlsCompatibilityEvent): void;
  dismiss(expected?: readonly TlsCompatibilityEvent[]): void;
  settingsChanged(): void;
}

const eventIdentity = (event: TlsCompatibilityEvent): string =>
  `${event.generation}:${event.host.trim().toLowerCase()}:${event.timestamp}`;

/** Pending TLS interception compatibility signals for the app-scope dialog. */
export const useTlsCompatibilityStore = create<TlsCompatibilityState>((set) => ({
  events: [],
  settingsChangeSequence: 0,
  apply: (event) => set((state) => {
    const host = event.host.trim().toLowerCase();
    const index = state.events.findIndex(
      (current) => current.host.trim().toLowerCase() === host,
    );
    if (index < 0) {
      return { events: [...state.events, event] };
    }
    if (state.events[index]!.timestamp > event.timestamp) {
      return state;
    }
    const events = [...state.events];
    events[index] = event;
    return { events };
  }),
  dismiss: (expected) => set((state) => {
    if (!expected) {
      return { events: [] };
    }
    const expectedIds = new Set(expected.map(eventIdentity));
    return {
      events: state.events.filter(
        (event) => !expectedIds.has(eventIdentity(event)),
      ),
    };
  }),
  settingsChanged: () => set((state) => ({
    settingsChangeSequence: state.settingsChangeSequence + 1,
  })),
}));

/** App-scope subscription that survives Settings navigation changes. */
export class TlsCompatibilityActions {
  /** Persist all displayed hosts once without dismissing newer concurrent events. */
  static async addHosts(
    events: readonly TlsCompatibilityEvent[],
  ): Promise<TlsPassthroughReplaceResult> {
    const settings = await window.interceptor.getTlsPassthroughSettings();
    const hostsToAdd = [...new Set(
      events
        .map((event) => event.host.trim().toLowerCase())
        .filter((host) => !isTlsPassthroughHostCovered(host, settings.hosts)),
    )];
    if (hostsToAdd.length === 0) {
      const store = useTlsCompatibilityStore.getState();
      store.dismiss(events);
      store.settingsChanged();
      return { ok: true, settings };
    }
    const result = await window.interceptor.replaceTlsPassthroughSettings(
      settings.revision,
      [...settings.hosts, ...hostsToAdd],
    );
    if (result.ok) {
      const store = useTlsCompatibilityStore.getState();
      store.dismiss(events);
      store.settingsChanged();
    }
    return result;
  }

  /** Subscribe once to Main's deduplicated TLS compatibility events. */
  static subscribe(): () => void {
    return window.interceptor.onTlsCompatibilityChange((event) => {
      useTlsCompatibilityStore.getState().apply(event);
    });
  }
}