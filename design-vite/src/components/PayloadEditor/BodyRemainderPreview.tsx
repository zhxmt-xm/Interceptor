import { CodeXml, ImageOff, Info, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { IconButton } from '../IconButton/IconButton';
import { MonacoFixture } from '../MonacoFixture/MonacoFixture';
import {
  formatPayloadBytes,
  PAYLOAD_AUTO_FORMAT_BYTES,
  PAYLOAD_IMAGE_PREVIEW_BYTES,
  PAYLOAD_PREVIEW_BYTES,
  type PayloadPreviewMetadata,
} from './utils';
import styles from './BodyRemainderPreview.module.css';

interface BodyRemainderPreviewProps {
  readonly mediaType: string;
  readonly metadata?: PayloadPreviewMetadata;
  readonly onFormat: (source: string) => void;
  readonly source: string;
  readonly variant: 'original' | 'file';
}

export function BodyRemainderPreview({ mediaType, metadata, onFormat, source, variant }: BodyRemainderPreviewProps): React.JSX.Element {
  const [formatFailed, setFormatFailed] = useState(false);
  const totalBytes = metadata?.totalBytes ?? new TextEncoder().encode(source).byteLength;
  const previewBytes = metadata?.previewBytes ?? totalBytes;
  const truncated = metadata?.truncated === true;
  const formatAvailable = !truncated && mediaType === 'application/json'
    && totalBytes > PAYLOAD_AUTO_FORMAT_BYTES && totalBytes <= PAYLOAD_PREVIEW_BYTES;
  const size = formatPayloadBytes(totalBytes);
  const message = formatFailed ? 'Formatting failed. The original content is unchanged.'
    : metadata?.showAutoFormatNotice && !truncated && totalBytes <= PAYLOAD_AUTO_FORMAT_BYTES
      ? `Complete body · ${size}. Automatically formatted (up to 1 MiB).`
    : formatAvailable
      ? `Complete body · ${size}. Use Format for bodies between 1 and 2 MiB.`
      : truncated ? `Previewing ${formatPayloadBytes(previewBytes)} of ${size}. Truncated previews cannot be formatted.` : '';

  if (mediaType.startsWith('image/') && totalBytes > PAYLOAD_IMAGE_PREVIEW_BYTES) {
    return (
      <div className={styles.bodyRemainderImageLimit} data-remainder-preview={variant}>
        <ImageOff aria-hidden="true" />
        <b>{mediaType} · {size}</b>
        <p>Above the separate 16 MiB image preview limit. The image is not loaded.</p>
        {variant === 'file' ? <small>Forward edited still uses the complete selected file.</small> : null}
      </div>
    );
  }

  return (
    <div className={styles.bodyRemainderPreview} data-remainder-preview={variant}>
      {variant === 'file' ? (
        <p className={styles.bodyRemainderFileNote}>
          Preview only. Forward edited uses the complete selected file, not the visible preview.
        </p>
      ) : null}
      {message ? (
        <div className={styles.bodyRemainderNotice} data-warning={truncated || formatFailed || undefined} role={formatFailed ? 'alert' : 'status'}>
          {truncated || formatFailed ? <TriangleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
          <span>{message}</span>
          {formatAvailable || truncated ? (
            <IconButton
              disabled={truncated}
              icon={<CodeXml aria-hidden="true" />}
              label="Format preview"
              onClick={() => {
                let formatted: string;
                try {
                  formatted = JSON.stringify(JSON.parse(source), null, 2);
                } catch (error) {
                  if (!(error instanceof SyntaxError)) throw error;
                  setFormatFailed(true);
                  return;
                }
                setFormatFailed(false);
                onFormat(formatted);
              }}
            />
          ) : null}
        </div>
      ) : null}
      <MonacoFixture
        className={variant === 'file' ? styles.bodyRemainderFileCode : styles.bodyRemainderOriginalCode}
        language={variant === 'original' && /(?:application\/json|\+json)(?:;|$)/i.test(mediaType) ? 'json' : 'plaintext'}
        preset="box"
        resizable
        source={source}
      />
    </div>
  );
}
