import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  InterceptorDesktopApi,
  TlsCompatibilityEvent,
  TlsPassthroughSettings,
} from '../../../../../shared/desktop-api';
import { settingsEnglishMessages } from '../../../../i18n/settings-resources';
import {
  TlsCompatibilityActions,
  useTlsCompatibilityStore,
} from '../../data/tlsCompatibilityStore';
import {
  tlsCompatibilityReasonKey,
  tlsPassthroughCoveringPattern,
  tlsPassthroughPatternChoices,
} from '../../utils';

const activeSettings: TlsPassthroughSettings = {
  revision: 4,
  hosts: [],
};

/** Mockttp 的 failureCause 全集；Core 现在原样上报，UI 必须每种都有文案。 */
const allReasons: TlsCompatibilityEvent['reason'][] = [
  'cert-rejected',
  'closed',
  'reset',
  'no-shared-cipher',
  'handshake-timeout',
  'unknown',
];

describe('tlsCompatibilityReasonKey', () => {
  it.each(allReasons)('describes the %s handshake failure', (reason) => {
    const key = tlsCompatibilityReasonKey(reason);
    expect(settingsEnglishMessages).toHaveProperty(key);
  });

  it('gives every reason its own description', () => {
    const keys = allReasons.map(tlsCompatibilityReasonKey);
    expect(new Set(keys).size).toBe(allReasons.length);
  });
});

describe('tlsPassthroughPatternChoices', () => {
  it('offers the exact host first, then one wildcard per parent domain', () => {
    expect(tlsPassthroughPatternChoices('afdfp-rdgateway-r0.wvd.microsoft.com')).toEqual([
      'afdfp-rdgateway-r0.wvd.microsoft.com',
      '*.wvd.microsoft.com',
      '*.microsoft.com',
    ]);
  });

  it('never offers a top-level wildcard that would release an entire suffix', () => {
    expect(tlsPassthroughPatternChoices('windows365.microsoft.com')).toEqual([
      'windows365.microsoft.com',
      '*.microsoft.com',
    ]);
    expect(tlsPassthroughPatternChoices('example.com')).toEqual(['example.com']);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(tlsPassthroughPatternChoices('  RDWeb.WVD.Microsoft.com ')).toEqual([
      'rdweb.wvd.microsoft.com',
      '*.wvd.microsoft.com',
      '*.microsoft.com',
    ]);
  });
});

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
    const savedSettings: TlsPassthroughSettings = {
      revision: 5,
      hosts: events.map((item) => item.host),
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

    await expect(
      TlsCompatibilityActions.addPatterns(events.map((item) => item.host), events),
    ).resolves.toEqual({
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
    };
    const interceptor = {
      getTlsPassthroughSettings: vi.fn(async () => settings),
      replaceTlsPassthroughSettings: vi.fn(async () => ({
        ok: true as const,
        settings: {
          revision: 5,
          hosts: ['*.wvd.microsoft.com', uncovered.host],
        },
      })),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    await TlsCompatibilityActions.addPatterns(
      [covered.host, uncovered.host],
      [covered, uncovered],
    );

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
        },
      })),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useTlsCompatibilityStore.getState().apply(displayed);

    await TlsCompatibilityActions.addPatterns([displayed.host], [displayed]);

    expect(useTlsCompatibilityStore.getState().events).toEqual([
      newerSameHost,
      anotherHost,
    ]);
  });
});

describe('tlsPassthroughCoveringPattern', () => {
  it('prefers an exact pattern regardless of case or list order', () => {
    expect(tlsPassthroughCoveringPattern(
      'API.Example.com',
      ['*.example.com', 'api.example.com'],
    )).toBe('api.example.com');
  });

  it('uses the most specific matching wildcard regardless of list order', () => {
    expect(tlsPassthroughCoveringPattern(
      'afdfp-rdgateway-r0.wvd.microsoft.com',
      ['*.microsoft.com', '*.wvd.microsoft.com'],
    )).toBe('*.wvd.microsoft.com');
  });

  it('returns null when no persisted pattern covers the host', () => {
    expect(tlsPassthroughCoveringPattern(
      'api.example.com',
      ['*.microsoft.com', '127.0.0.1'],
    )).toBeNull();
  });
});