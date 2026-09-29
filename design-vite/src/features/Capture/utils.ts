import type { BodyRemainderNotice, BodyRemainderSample } from '../../state/types';
import { formatPayloadBytes, PAYLOAD_PREVIEW_BYTES, type PayloadPreviewMetadata } from '../../components/PayloadEditor/utils';
import { describeReadonlyBody, readonlyBodyBytes } from '../../fixtures/readonlyBodyData';

export function bodyRemainderFixture(sample: BodyRemainderSample, notice: BodyRemainderNotice) {
  if (sample === 'current' && notice === 'none') return undefined;
  const description = describeReadonlyBody(sample, notice);
  const bytes = readonlyBodyBytes(description);
  const preview = description.kind === 'image' ? new Uint8Array() : bytes.subarray(0, PAYLOAD_PREVIEW_BYTES);
  const truncated = description.kind === 'text' && preview.byteLength < bytes.byteLength;
  const source = new TextDecoder().decode(preview, { stream: truncated });
  const metadata: PayloadPreviewMetadata = {
    totalBytes: bytes.byteLength,
    previewBytes: preview.byteLength,
    truncated,
    showAutoFormatNotice: notice === 'auto-format',
  };
  return {
    source,
    size: formatPayloadBytes(bytes.byteLength),
    metadata,
    mediaType: description.mediaType,
    fileName: description.name,
  };
}
