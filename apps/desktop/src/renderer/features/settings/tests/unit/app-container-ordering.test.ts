import { describe, expect, it } from 'vitest';

import type { AppContainerAccessInfo } from '../../../../../shared/desktop-api';
import { listVisibleAppContainers } from '../../utils';

describe('listVisibleAppContainers', () => {
  it('stably places enabled containers before disabled containers without mutating input', () => {
    const containers = [
      appContainer('disabled-a', false),
      appContainer('enabled-a', true),
      appContainer('disabled-b', false),
      appContainer('enabled-b', true),
    ];

    expect(listVisibleAppContainers(containers, '')).toEqual([
      containers[1],
      containers[3],
      containers[0],
      containers[2],
    ]);
    expect(containers.map(({ appContainerSid }) => appContainerSid)).toEqual([
      'disabled-a',
      'enabled-a',
      'disabled-b',
      'enabled-b',
    ]);
  });

  it('filters every identity field after ordering and preserves the ordered subsequence', () => {
    const containers = [
      appContainer('disabled-match', false, {
        displayName: 'Shared Identity',
      }),
      appContainer('enabled-other', true),
      appContainer('enabled-match', true, {
        packageFamilyName: 'Microsoft.Shared_123',
      }),
      appContainer('disabled-other', false),
    ];

    expect(listVisibleAppContainers(containers, '  SHARED  ')).toEqual([
      containers[2],
      containers[0],
    ]);
    expect(listVisibleAppContainers(containers, 'enabled-match')).toEqual([
      containers[2],
    ]);
  });
});

function appContainer(
  appContainerSid: string,
  exempt: boolean,
  overrides: Partial<AppContainerAccessInfo> = {},
): AppContainerAccessInfo {
  return {
    appContainerSid,
    packageFamilyName: null,
    displayName: null,
    description: null,
    packageFullName: null,
    exempt,
    ...overrides,
  };
}