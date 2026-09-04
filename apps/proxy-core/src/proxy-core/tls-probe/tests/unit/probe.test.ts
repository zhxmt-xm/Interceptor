import { beforeEach, describe, expect, it, vi } from 'vitest';

const tlsMocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock('node:tls', () => ({
  connect: tlsMocks.connect,
}));

import { TlsProbeService } from '../../entry';

beforeEach(() => {
  vi.clearAllMocks();
  tlsMocks.connect.mockReturnValue({
    destroy: vi.fn(),
    on: vi.fn(),
  });
});

describe('TlsProbeService', () => {
  it('does not open a TLS socket when its caller already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(new TlsProbeService().probe(
      '127.0.0.1',
      443,
      1_000,
      abortController.signal,
    )).resolves.toMatchObject({
      ok: false,
      error: 'The TLS probe was cancelled.',
    });
    expect(tlsMocks.connect).not.toHaveBeenCalled();
  });
});