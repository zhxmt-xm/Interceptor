export interface PayloadPreviewMetadata {
  readonly totalBytes: number;
  readonly previewBytes: number;
  readonly truncated: boolean;
  readonly showAutoFormatNotice?: boolean;
}

export const PAYLOAD_PREVIEW_BYTES = 2 * 1024 * 1024;
export const PAYLOAD_AUTO_FORMAT_BYTES = 1024 * 1024;
export const PAYLOAD_IMAGE_PREVIEW_BYTES = 16 * 1024 * 1024;

export function formatPayloadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const divisor = bytes < 1024 * 1024 ? 1024 : 1024 * 1024;
  const value = bytes / divisor;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${divisor === 1024 ? 'KiB' : 'MiB'}`;
}
