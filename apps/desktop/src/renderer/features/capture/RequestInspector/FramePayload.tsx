import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import {
  BODY_PREVIEW_MAX_BYTES,
  type WebSocketFrameSummary,
} from '../../../../shared/desktop-api';
import { Count, IconButton, sizeLabel } from '../../../components';
import { readCompleteBody } from '../data/readCompleteBody';
import { payloadClipboardText } from '../utils';

import { BodyView } from './BodyView';
import styles from './FramePayload.module.css';

export interface FramePayloadProps {
  frame: WebSocketFrameSummary;
  exchangeId: string;
}

/** 展开一帧后的正文区：方向、大小、复制与正文预览。 */
export function FramePayload({
  frame,
  exchangeId,
}: FramePayloadProps): React.JSX.Element {
  const { i18n, t } = useTranslation();

  const copyPayload = (): void => {
    if (!frame.payload?.bodyHash) {
      return;
    }
    void readCompleteBody(
      frame.payload.bodyHash,
      0,
      Math.min(frame.payload.encodedSize, BODY_PREVIEW_MAX_BYTES),
    ).then((chunk) =>
      navigator.clipboard.writeText(
        payloadClipboardText(chunk.bytes, frame.opcode === 1),
      ),
    );
  };

  return (
    <div className={styles.payload}>
      <div className={styles.payloadHead}>
        <b>
          {frame.direction === 'client-to-server'
            ? t('capture.sent')
            : t('capture.received')}{' '}
          {frame.opcode === 1
            ? t('capture.text').toLocaleLowerCase(i18n.language)
            : t('capture.binary').toLocaleLowerCase(i18n.language)}
        </b>
        <Count>
          {sizeLabel(frame.payloadSize, i18n.language)} ·{' '}
          {t('capture.messageNumber', { sequence: frame.seq })}
        </Count>
        <IconButton
          icon={Copy}
          label={t('capture.copyPayload')}
          size="sm"
          onClick={copyPayload}
          automationId={AutomationIdFactory.websocketPayloadCopy(
            exchangeId,
            frame.seq,
          )}
        />
      </div>
      {frame.payload ? (
        <BodyView body={frame.payload} compact />
      ) : (
        <div className={styles.empty}>{t('capture.payloadNotRetained')}</div>
      )}
    </div>
  );
}
