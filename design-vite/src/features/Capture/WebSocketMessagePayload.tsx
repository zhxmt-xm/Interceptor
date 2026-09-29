import { Copy } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { BodyViewerDesign } from '../../components/BodyViewerDesign/BodyViewerDesign';
import { formatHexDump } from '../../components/BodyViewerDesign/utils';
import { BodyFullscreenDesign } from '../../components/BodyFullscreenDesign/BodyFullscreenDesign';
import { IconButton } from '../../components/IconButton/IconButton';
import { useDesignState } from '../../state/useDesignState';
import { WebSocketMessageTree } from './WebSocketMessageTree';
import styles from './WebSocketMessagePayload.module.css';

const RAW_PAYLOAD = '{"buildId":8431,"state":"running","branch":"main"}';
const PRETTY_PAYLOAD = JSON.stringify(JSON.parse(RAW_PAYLOAD), null, 2);
const PAYLOAD_BYTES = new TextEncoder().encode(RAW_PAYLOAD);
const HEX_PAYLOAD = formatHexDump(PAYLOAD_BYTES);

export function WebSocketMessagePayload(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const [host, setHost] = useState<Element | null>(null);
  const [view, setView] = useState('Pretty');
  const fullscreen = state.scene === 'websocket' && state.overlay === 'body-full';
  const source = view === 'Pretty' ? PRETTY_PAYLOAD : RAW_PAYLOAD;

  useLayoutEffect(() => {
    setHost(document.querySelector('.wspayload'));
  }, []);

  const body = (
    <BodyViewerDesign
        ariaLabel="Received text view"
      bytes={PAYLOAD_BYTES}
        hex={HEX_PAYLOAD}
        language="json"
        meta="application/json · 54 B"
        modes={['Pretty', 'Tree', 'Raw', 'Hex']}
        onFullscreen={() => updateState({ overlay: 'body-full' })}
        onModeChange={setView}
        onSave={() => {
          const url = URL.createObjectURL(new Blob([RAW_PAYLOAD], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = 'websocket-message.json';
          link.click();
          URL.revokeObjectURL(url);
        }}
        source={source}
        tree={<WebSocketMessageTree source={RAW_PAYLOAD} fullscreen={fullscreen} />}
        value={view}
        codePreset="message"
        fullscreen={fullscreen}
        resizable
      />
  );

  if (!host) return null;
  return createPortal(
    <div className={styles.webSocketMessagePayload}>
      <div className={styles.webSocketMessagePayloadHeader}>
        <b>Received text</b>
        <span className={styles.webSocketMessagePayloadCount}>54 B · message 3</span>
        <IconButton
          label="Copy payload"
          icon={<Copy aria-hidden="true" />}
          onClick={() => void navigator.clipboard.writeText(RAW_PAYLOAD)}
        />
      </div>
      {fullscreen ? (
        <BodyFullscreenDesign
          title="Payload"
          meta="application/json · 54 B"
          onCopy={() => void navigator.clipboard.writeText(view === 'Hex' ? HEX_PAYLOAD : source)}
          onClose={() => updateState({ overlay: '' })}
        >
          {body}
        </BodyFullscreenDesign>
      ) : body}
    </div>,
    host,
  );
}
