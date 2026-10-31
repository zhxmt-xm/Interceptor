import { describe, expect, it } from 'vitest';

import type { CaptureExchangeSummary } from '../../../../../shared/desktop-api';
import { canReplayExchange } from '../../utils';

/** 构造一条只带测试关心字段的摘要。 */
function summary(overrides: Partial<CaptureExchangeSummary> = {}): CaptureExchangeSummary {
  return {
    id: 'ex-1',
    method: 'GET',
    secure: false,
    protocol: 'HTTP/1.1',
    state: 'completed',
    startedAt: 1,
    requestBytes: 0,
    responseBytes: 0,
    ...overrides,
  };
}

describe('canReplayExchange', () => {
  it('allows HTTP/1.x and HTTP/2 rows once the request is no longer uploading', () => {
    expect(canReplayExchange(summary())).toBe(true);
    expect(canReplayExchange(summary({ protocol: 'HTTP/1.0' }))).toBe(true);
    expect(canReplayExchange(summary({ protocol: 'HTTP/2' }))).toBe(true);
    expect(canReplayExchange(summary({ state: 'response-streaming' }))).toBe(true);
    expect(canReplayExchange(summary({ state: 'aborted' }))).toBe(true);
    expect(canReplayExchange(summary({ state: 'failed' }))).toBe(true);
  });

  it('rejects WebSocket, tunnel and in-flight uploads', () => {
    expect(canReplayExchange(summary({ protocol: 'ws' }))).toBe(false);
    expect(canReplayExchange(summary({ protocol: 'WebSocket' }))).toBe(false);
    expect(canReplayExchange(summary({ protocol: 'TLS tunnel' }))).toBe(false);
    expect(canReplayExchange(summary({ state: 'pending' }))).toBe(false);
    expect(canReplayExchange(summary({ state: 'request-complete' }))).toBe(false);
  });
});
