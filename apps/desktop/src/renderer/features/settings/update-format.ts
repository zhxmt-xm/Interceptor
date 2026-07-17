import type { UpdateStatus } from '../../../shared/desktop-api';

/** Pure update status presentation rules shared across Renderer surfaces. */
export class UpdateFormat {
  /** Return one concise state label. */
  static stateLabel(status: UpdateStatus): string {
    switch (status.state) {
      case 'unsupported': return 'Unavailable';
      case 'idle': return 'Ready';
      case 'checking': return 'Checking';
      case 'available': return 'Available';
      case 'downloading': return 'Downloading';
      case 'downloaded': return 'Downloaded';
      case 'up-to-date': return 'Up to date';
      case 'failed': return 'Failed';
    }
  }

  /** Return a semantic StatusBadge tone for one state. */
  static stateTone(
    status: UpdateStatus,
  ): 'green' | 'yellow' | 'red' | 'info' {
    if (status.state === 'failed') {
      return 'red';
    }
    if (status.state === 'unsupported') {
      return 'yellow';
    }
    if (
      status.state === 'checking' ||
      status.state === 'downloading'
    ) {
      return 'info';
    }
    return 'green';
  }

  /** Return bounded progress text for a determinate installer download. */
  static progress(status: UpdateStatus): string {
    return status.progress === null
      ? 'Waiting'
      : `${Math.round(status.progress * 100)}%`;
  }

  /** Return downloaded and total installer sizes in compact binary units. */
  static bytes(status: UpdateStatus): string {
    if (status.totalBytes === null) {
      return 'Size unavailable';
    }
    const total = this.fileSize(status.totalBytes);
    return status.downloadedBytes === null
      ? total
      : `${this.fileSize(status.downloadedBytes)} / ${total}`;
  }

  /** Format one non-negative byte count without exposing locale variance. */
  private static fileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}