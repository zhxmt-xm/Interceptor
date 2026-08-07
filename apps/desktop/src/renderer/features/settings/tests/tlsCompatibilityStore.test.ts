import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  InterceptorDesktopApi,
  TlsCompatibilityEvent,
  TlsPassthroughSettingsStatus,
} from '../../../../shared/desktop-api';
import {
  TlsCompatibilityActions,
  useTlsCompatibilityStore,
} from '../data/tlsCompatibilityStore';

const activeSettings: TlsPassthroughSettingsStatus = {
  revision: 4,
  hosts: [],
  restartRequired: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  useTlsCompatibilityStore.setState({
    events: [],
    settingsChangeSequence: 0,
  });
});

const event = (
  host: string,
  timestamp: number,
  reason: TlsCompatibilityEvent['reason'] = 'closed',
): TlsCompatibilityEvent => ({
  generation: 3,
  host,
  reason,
  timestamp,
});

describe('TlsCompatibilityActions', () => {
  it('batches all pending hosts into one replacement and publishes a refresh', async () => {
    const events = [
      event('rdweb.wvd.microsoft.com', 1_000),
      event('windows365.microsoft.com', 2_000),
      event('afdfp-rdgateway-r0.wvd.microsoft.com', 3_000, 'cert-rejected'),
    ];
    const savedSettings: TlsPassthroughSettingsStatus = {
      revision: 5,
      hosts: events.map((item) => item.host),
      restartRequired: true,
    };
    const interceptor = {
      getTlsPassthroughSettings: vi.fn(async () => activeSettings),
      replaceTlsPassthroughSettings: vi.fn(async () => ({
        ok: true as const,
        settings: savedSettings,
      })),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    events.forEach((item) => useTlsCompatibilityStore.getState().apply(item));

    await expect(TlsCompatibilityActions.addHosts(events)).resolves.toEqual({
      ok: true,
      settings: savedSettings,
    });
    expect(interceptor.replaceTlsPassthroughSettings).toHaveBeenCalledOnce();
    expect(interceptor.replaceTlsPassthroughSettings).toHaveBeenCalledWith(
      4,
      events.map((item) => item.host),
    );
    expect(useTlsCompatibilityStore.getState()).toMatchObject({
      events: [],
      settingsChangeSequence: 1,
    });
  });

  it('keeps only the latest signal for each normalized host', () => {
    const first = event('RDWEB.wvd.microsoft.com', 1_000);
    const latest = event('rdweb.wvd.microsoft.com', 2_000, 'cert-rejected');

    useTlsCompatibilityStore.getState().apply(first);
    useTlsCompatibilityStore.getState().apply(latest);
    useTlsCompatibilityStore.getState().apply(event('other.example.com', 3_000));

    expect(useTlsCompatibilityStore.getState().events).toEqual([
      latest,
      event('other.example.com', 3_000),
    ]);
  });

  it('does not write exact hosts already covered by persisted wildcard patterns', async () => {
    const covered = event('rdweb.wvd.microsoft.com', 1_000);
    const uncovered = event('windows365.microsoft.com', 2_000);
    const settings = {
      ...activeSettings,
      hosts: ['*.wvd.microsoft.com'],
      restartRequired: true,
    };
    const interceptor = {
      getTlsPassthroughSettings: vi.fn(async () => settings),
      replaceTlsPassthroughSettings: vi.fn(async () => ({
        ok: true as const,
        settings: {
          revision: 5,
          hosts: ['*.wvd.microsoft.com', uncovered.host],
          restartRequired: true,
        },
      })),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    await TlsCompatibilityActions.addHosts([covered, uncovered]);

    expect(interceptor.replaceTlsPassthroughSettings).toHaveBeenCalledWith(
      4,
      ['*.wvd.microsoft.com', uncovered.host],
    );
  });

  it('keeps newer events that arrive while the displayed batch is saved', async () => {
    const displayed = event('windows365.microsoft.com', 1_000);
    const newerSameHost = event('windows365.microsoft.com', 2_000, 'cert-rejected');
    const anotherHost = event('rdweb.wvd.microsoft.com', 3_000);
    const interceptor = {
      getTlsPassthroughSettings: vi.fn(async () => {
        useTlsCompatibilityStore.getState().apply(newerSameHost);
        useTlsCompatibilityStore.getState().apply(anotherHost);
        return activeSettings;
      }),
      replaceTlsPassthroughSettings: vi.fn(async () => ({
        ok: true as const,
        settings: {
          revision: 5,
          hosts: [displayed.host],
          restartRequired: true,
        },
      })),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useTlsCompatibilityStore.getState().apply(displayed);

    await TlsCompatibilityActions.addHosts([displayed]);

    expect(useTlsCompatibilityStore.getState().events).toEqual([
      newerSameHost,
      anotherHost,
    ]);
  });
});