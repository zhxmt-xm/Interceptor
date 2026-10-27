import { describe, expect, it } from 'vitest';

import { DownloadRateMeter } from '../../download-rate';

describe('DownloadRateMeter', () => {
  it('reports nothing until two samples are available', () => {
    const meter = new DownloadRateMeter();

    expect(meter.sample(0, 10_000_000, 0)).toEqual({
      bytesPerSecond: null,
      etaSeconds: null,
    });
  });

  it('derives bytes per second and the remaining time', () => {
    const meter = new DownloadRateMeter();
    meter.sample(0, 10_000_000, 0);

    expect(meter.sample(2_000_000, 10_000_000, 2_000)).toEqual({
      bytesPerSecond: 1_000_000,
      etaSeconds: 8,
    });
  });

  it('smooths a sudden speed change instead of jumping to it', () => {
    const meter = new DownloadRateMeter();
    meter.sample(0, 10_000_000, 0);
    meter.sample(2_000_000, 10_000_000, 2_000);

    expect(meter.sample(4_000_000, 10_000_000, 3_000)).toEqual({
      bytesPerSecond: 1_300_000,
      etaSeconds: 5,
    });
  });

  it('reports no remaining time when no bytes arrive', () => {
    const meter = new DownloadRateMeter();
    meter.sample(0, 10_000_000, 0);
    meter.sample(1_000_000, 10_000_000, 1_000);

    expect(meter.sample(1_000_000, 10_000_000, 2_000)).toEqual({
      bytesPerSecond: 700_000,
      etaSeconds: 13,
    });
  });

  it('clears its samples on reset', () => {
    const meter = new DownloadRateMeter();
    meter.sample(0, 10_000_000, 0);
    meter.sample(1_000_000, 10_000_000, 1_000);

    meter.reset();

    expect(meter.sample(9_000_000, 10_000_000, 2_000)).toEqual({
      bytesPerSecond: null,
      etaSeconds: null,
    });
  });
});
