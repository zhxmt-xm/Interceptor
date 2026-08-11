import { Copy, Maximize } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CollapsibleSection } from '../../components/CollapsibleSection/CollapsibleSection';
import { IconButton } from '../../components/IconButton/IconButton';
import { MonacoFixture } from '../../components/MonacoFixture/MonacoFixture';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { useDesignState } from '../../state/useDesignState';
import styles from './WebSocketMessagePayload.module.css';

const VIEW_OPTIONS = ['Pretty', 'Raw', 'Hex'].map((option) => ({ value: option, label: option }));

const PAYLOAD = '\n{\n  "buildId": 8431,\n  "state": "running",\n  "branch": "main"\n}\n';

export function WebSocketMessagePayload(): React.JSX.Element | null {
  const { updateState } = useDesignState();
  const [host, setHost] = useState<Element | null>(null);
  const [open, setOpen] = useState(true);
  const [view, setView] = useState('Pretty');

  useLayoutEffect(() => {
    setHost(document.querySelector('.wspayload'));
  }, []);

  if (!host) return null;
  return createPortal(
    <div className={styles.webSocketMessagePayload}>
      <CollapsibleSection
        badge={{ label: '54 B · message 3', tone: 'neutral' }}
        open={open}
        title="Received text"
        onOpenChange={setOpen}
      >
        <div className={styles.webSocketMessagePayloadToolbar}>
          <SegmentedControl
            ariaLabel="Received text view"
            value={view}
            options={VIEW_OPTIONS}
            onChange={setView}
          />
          <span className={styles.webSocketMessagePayloadSpacer} />
          <IconButton
            label="Open fullscreen"
            icon={<Maximize aria-hidden="true" />}
            onClick={() => updateState({ overlay: 'body-full' })}
          />
          <IconButton label="Copy message" icon={<Copy aria-hidden="true" />} />
        </div>
        <MonacoFixture
          className={styles.webSocketMessagePayloadCode}
          language="json"
          preset="box"
          source={PAYLOAD}
        />
      </CollapsibleSection>
    </div>,
    host,
  );
}
