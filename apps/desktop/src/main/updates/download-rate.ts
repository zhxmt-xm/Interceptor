/** Bounded transfer-rate sample exposed with each download status update. */
export interface DownloadRateSnapshot {
  readonly bytesPerSecond: number | null;
  readonly etaSeconds: number | null;
}

/** Smoothed download rate derived only from Main's own byte and clock samples. */
export class DownloadRateMeter {
  /** Previous byte count and timestamp used for the next delta. */
  private previous: { bytes: number; at: number } | null = null;
  /** Exponentially smoothed bytes per second. */
  private smoothed: number | null = null;

  /** Forget one completed or cancelled transfer. */
  reset(): void {
    this.previous = null;
    this.smoothed = null;
  }

  /** Fold one progress sample into the rate and remaining-time estimate. */
  sample(
    downloadedBytes: number,
    totalBytes: number,
    atMs: number,
  ): DownloadRateSnapshot {
    const previous = this.previous;
    this.previous = { bytes: downloadedBytes, at: atMs };
    if (!previous) {
      return { bytesPerSecond: null, etaSeconds: null };
    }
    const elapsedSeconds = (atMs - previous.at) / 1000;
    if (elapsedSeconds > 0) {
      const instantaneous = Math.max(0, downloadedBytes - previous.bytes) / elapsedSeconds;
      this.smoothed = this.smoothed === null
        ? instantaneous
        : instantaneous * 0.3 + this.smoothed * 0.7;
    }
    if (this.smoothed === null) {
      return { bytesPerSecond: null, etaSeconds: null };
    }
    const remainingBytes = Math.max(0, totalBytes - downloadedBytes);
    return {
      bytesPerSecond: Math.round(this.smoothed),
      etaSeconds: this.smoothed > 0 ? Math.ceil(remainingBytes / this.smoothed) : null,
    };
  }
}
