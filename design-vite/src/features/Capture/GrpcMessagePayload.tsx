import { Copy } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { BodyViewerDesign } from '../../components/BodyViewerDesign/BodyViewerDesign';
import { formatHexDump } from '../../components/BodyViewerDesign/utils';
import { IconButton } from '../../components/IconButton/IconButton';
import { useDesignState } from '../../state/useDesignState';
import styles from './GrpcMessagePayload.module.css';

const VIEW_OPTIONS = ['Text', 'Hex'];

// hex dump 用 U+00A0 隔开 offset 与字节，避免折行时贴在一起
const HEX_DUMP = [
  '00000000\u00a0 1f 8b 08 00 00 00 00 00 00 03 e3 62 e1 60 4a 2d',
  '00000010\u00a0 ca 2f 2d 29 2e 51 48 ce cf 2b 49 cd 2b 01 00 7a',
  '00000020\u00a0 63 98 31 18 00 00 00',
].join('\n');

export function GrpcMessagePayload(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const [host, setHost] = useState<Element | null>(null);
  const [view, setView] = useState('Hex');
  const source = state.grpcMessageSource ?? HEX_DUMP;
  const bytes = state.grpcMessageSource === null ? undefined : new TextEncoder().encode(source);
  const hex = bytes ? formatHexDump(bytes, 16) : HEX_DUMP;
  const payloadLength = bytes?.byteLength;
  const payloadSize = payloadLength === undefined
    ? '1.2 KB'
    : payloadLength < 1024 ? `${payloadLength} B` : `${(payloadLength / 1024).toFixed(1)} KB`;

  useLayoutEffect(() => {
    setHost(document.querySelector('.grpcpayload'));
  }, []);

  useLayoutEffect(() => {
    if (!host || payloadLength === undefined) return;
    const messageSize = host.previousElementSibling?.querySelector('.grpcsize');
    const messageOffset = host.previousElementSibling?.querySelector('.grpcoffset');
    const nextOffset = host.nextElementSibling?.querySelector('.grpcoffset');
    if (!messageSize || !messageOffset || !nextOffset) return;
    const previousSize = messageSize.textContent;
    const previousOffset = nextOffset.textContent;
    const payloadOffset = Number.parseInt(messageOffset.textContent!.slice(2), 16);
    messageSize.textContent = payloadSize;
    nextOffset.textContent = `@ 0x${(payloadOffset + payloadLength + 5).toString(16).padStart(4, '0')}`;
    return () => {
      messageSize.textContent = previousSize;
      nextOffset.textContent = previousOffset;
    };
  }, [host, payloadLength, payloadSize]);

  if (!host) return null;
  return createPortal(
    <div className={styles.grpcMessagePayload}>
      <div className={styles.grpcMessagePayloadHead}>
        <b>Response message 2</b>
        <span>{`raw protobuf · ${payloadSize}`}</span>
        <IconButton label="Copy message" icon={<Copy aria-hidden="true" />} onClick={bytes ? () => void navigator.clipboard.writeText(source) : undefined} />
      </div>
      <BodyViewerDesign
        ariaLabel="Response message view"
        resizable
        value={view}
        modes={VIEW_OPTIONS}
        meta={bytes ? `application/octet-stream · ${payloadSize}` : 'application/octet-stream'}
        source={source}
        hex={hex}
        bytes={bytes}
        language="plaintext"
        onModeChange={setView}
        onFullscreen={() => updateState({ overlay: 'body-full' })}
      />
    </div>,
    host,
  );
}
