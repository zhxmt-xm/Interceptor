import { describe, expect, it } from 'vitest';

import { AbortableAttempts } from '../../src/app/abortable-attempts';

describe('AbortableAttempts', () => {
  it('aborts older attempts and lifecycle invalidation rejects late completion', () => {
    const abortableAttempts = new AbortableAttempts();
    const first = abortableAttempts.start();
    const second = abortableAttempts.start();

    expect(first.signal.aborted).toBe(true);
    expect(abortableAttempts.isCurrent(first.id)).toBe(false);
    expect(abortableAttempts.isCurrent(second.id)).toBe(true);

    abortableAttempts.invalidate();

    expect(second.signal.aborted).toBe(true);
    expect(abortableAttempts.isCurrent(second.id)).toBe(false);
  });

  it('manual abort keeps the attempt current so the caller can show aborted state', () => {
    const abortableAttempts = new AbortableAttempts();
    const attempt = abortableAttempts.start();

    abortableAttempts.abortCurrent();

    expect(attempt.signal.aborted).toBe(true);
    expect(abortableAttempts.isCurrent(attempt.id)).toBe(true);
  });
});