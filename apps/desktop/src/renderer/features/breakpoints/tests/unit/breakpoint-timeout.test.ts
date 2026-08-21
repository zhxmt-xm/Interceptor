import { describe, expect, it } from 'vitest';

import {
  breakpointTimeoutFromSelection,
  breakpointTimeoutSelection,
} from '../../utils';

describe('breakpoint timeout selection', () => {
  it('maps no timeout and presets to explicit protocol values', () => {
    expect(breakpointTimeoutFromSelection('none', '')).toEqual({ mode: 'infinite' });
    expect(breakpointTimeoutFromSelection('10', '')).toEqual({
      mode: 'finite',
      timeoutMs: 10_000,
    });
    expect(breakpointTimeoutFromSelection('30', '')).toEqual({
      mode: 'finite',
      timeoutMs: 30_000,
    });
    expect(breakpointTimeoutFromSelection('60', '')).toEqual({
      mode: 'finite',
      timeoutMs: 60_000,
    });
  });

  it('maps positive custom whole seconds to a finite timeout', () => {
    expect(breakpointTimeoutFromSelection('custom', '7')).toEqual({
      mode: 'finite',
      timeoutMs: 7_000,
    });
  });

  it.each(['', '0', '-1', '1.5', 'seconds', '9007199254741'])(
    'rejects invalid custom seconds %j',
    (seconds) => {
      expect(breakpointTimeoutFromSelection('custom', seconds)).toBeNull();
    },
  );

  it('maps protocol values back to a preset or custom seconds', () => {
    expect(breakpointTimeoutSelection({ mode: 'infinite' })).toEqual({
      selection: 'none',
      customSeconds: '',
    });
    expect(breakpointTimeoutSelection({ mode: 'finite', timeoutMs: 30_000 })).toEqual({
      selection: '30',
      customSeconds: '30',
    });
    expect(breakpointTimeoutSelection({ mode: 'finite', timeoutMs: 7_000 })).toEqual({
      selection: 'custom',
      customSeconds: '7',
    });
  });
});
