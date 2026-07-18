import { describe, expect, it } from 'vitest';

import {
  INSPECTOR_TABS,
  TLS_TUNNEL_INSPECTOR_TABS,
  retainInspectorTab,
} from '../data';

describe('Inspector tab retention', () => {
  it('preserves a valid tab when selecting another request of the same type', () => {
    expect(retainInspectorTab('request', INSPECTOR_TABS, 'headers')).toBe('request');
    expect(retainInspectorTab('cookies', INSPECTOR_TABS, 'headers')).toBe('cookies');
  });

  it('falls back only when the selected request cannot display the current tab', () => {
    expect(retainInspectorTab('request', TLS_TUNNEL_INSPECTOR_TABS, 'tunnel'))
      .toBe('tunnel');
  });
});