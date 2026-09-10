import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import {
  BODY_PREVIEW_MAX_BYTES,
  type GrpcMessageSide,
  type GrpcMessageSummary,
} from '../../../../shared/desktop-api';
import { Count, IconButton, sizeLabel } from '../../../components';
import { readCompleteBody } from '../data/readCompleteBody';
import { payloadClipboardText } from '../utils';

import { BodyView } from './BodyView';
import styles from './GrpcMessagePayload.module.css';

export interface GrpcMessagePayloadProps {
  message: GrpcMessageSummary;
  side: GrpcMessageSide;
  bodyHash: string;
  contentType: string | undefined;
  exchangeId: string;
}

/** 展开一条 gRPC 消息后的正文区；`+json` 编码按 JSON 呈现，其余按二进制。 */
export function GrpcMessagePayload({
  message,
  side,
  bodyHash,
  contentType,
  exchangeId,
}: GrpcMessagePayloadProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const json = contentType
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
    .endsWith('+json');

  const copyPayload = (): void => {
    void readCompleteBody(
      bodyHash,
      message.payloadOffset,
      Math.min(message.payloadLength, BODY_PREVIEW_MAX_BYTES),
    ).then((chunk) =>
      navigator.clipboard.writeText(
        payloadClipboardText(chunk.bytes, json === true, message.payloadLength > BODY_PREVIEW_MAX_BYTES),
      ),
    );
  };

  return (
    <div className={styles.payload}>
      <div className={styles.payloadHead}>
        <b>
          {t(
            side === 'request'
              ? 'capture.requestMessage'
              : 'capture.responseMessage',
            { index: message.index + 1 },
          )}
        </b>
        <Count>
          {json ? t('capture.rawJson') : t('capture.rawProtobufLabel')} ·{' '}
          {sizeLabel(message.payloadLength, i18n.language)}
        </Count>
        <IconButton
          icon={Copy}
          label={t('capture.copyPayload')}
          size="sm"
          onClick={copyPayload}
          automationId={AutomationIdFactory.grpcPayloadCopy(
            exchangeId,
            side,
            message.index,
          )}
        />
      </div>
      <BodyView
        body={{
          bodyHash,
          mediaType: json ? 'application/json' : 'application/octet-stream',
          encodedSize: message.payloadLength,
          truncated: message.truncated,
          decodeStatus: 'ok',
        }}
        compact
        fullscreenTitle={t('capture.payload')}
        offset={message.payloadOffset}
      />
    </div>
  );
}
