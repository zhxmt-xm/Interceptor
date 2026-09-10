import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  BODY_PREVIEW_MAX_BYTES,
  type WebSocketFrameSummary,
} from '../../../../shared/desktop-api';
import { readCompleteBody } from '../data/readCompleteBody';
import { payloadClipboardText } from '../utils';

import styles from './FramePreview.module.css';

export interface FramePreviewProps {
  frame: WebSocketFrameSummary;
}

/** 帧行的单行预览：正文到达前先显示占位描述。 */
export function FramePreview({ frame }: FramePreviewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(
    frame.opcode === 1
      ? t('capture.textMessage', { sequence: frame.seq })
      : t('capture.binaryMessage', { sequence: frame.seq }),
  );

  useEffect(() => {
    const hash = frame.payload?.bodyHash;
    if (!hash || !window.interceptor?.readBody) {
      return;
    }
    const previewTruncated = (frame.payload?.encodedSize ?? 0) > BODY_PREVIEW_MAX_BYTES;
    let active = true;
    void readCompleteBody(
      hash,
      0,
      Math.min(frame.payload?.encodedSize ?? 0, BODY_PREVIEW_MAX_BYTES),
    )
      .then((chunk) => {
        if (active) {
          setPreview(
            payloadClipboardText(chunk.bytes, frame.opcode === 1, previewTruncated).replace(/\s+/g, ' '),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [
    frame.opcode,
    frame.payload?.bodyHash,
    frame.payload?.encodedSize,
    frame.seq,
  ]);

  return <span className={styles.preview}>{preview}</span>;
}
