import { describe, expect, it } from 'vitest';

import { DESKTOP_IPC_CHANNELS } from '../../../../shared/desktop-api';
import { readShutdownIpcSnapshot } from '../../shutdown-ipc';

describe('readShutdownIpcSnapshot', () => {
  it('serves an empty breakpoint snapshot once shutdown has started', () => {
    expect(readShutdownIpcSnapshot(DESKTOP_IPC_CHANNELS.breakpointList)).toEqual({
      breakpoints: [],
      enabled: false,
    });
  });

  it('leaves other channels to the action gate', () => {
    expect(readShutdownIpcSnapshot(DESKTOP_IPC_CHANNELS.captureGetStatus)).toBeNull();
  });
});
