import { Copy, Maximize } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CollapsibleSection } from '../../components/CollapsibleSection/CollapsibleSection';
import { IconButton } from '../../components/IconButton/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { useDesignState } from '../../state/useDesignState';
import styles from './GrpcMessagePayload.module.css';

const VIEW_OPTIONS = ['Text', 'Hex'].map((option) => ({ value: option, label: option }));

// hex dump 用 U+00A0 隔开 offset 与字节，避免折行时贴在一起
const HEX_DUMP = [
  '00000000\u00a0 1f 8b 08 00 00 00 00 00 00 03 e3 62 e1 60 4a 2d',
  '00000010\u00a0 ca 2f 2d 29 2e 51 48 ce cf 2b 49 cd 2b 01 00 7a',
  '00000020\u00a0 63 98 31 18 00 00 00',
].join('\n');

export function GrpcMessagePayload(): React.JSX.Element | null {
  const { updateState } = useDesignState();
  const [host, setHost] = useState<Element | null>(null);
  const [open, setOpen] = useState(true);
  const [view, setView] = useState('Hex');

  useLayoutEffect(() => {
    setHost(document.querySelector('.grpcpayload'));
  }, []);

  if (!host) return null;
  return createPortal(
    <CollapsibleSection
      badge={{ label: 'raw protobuf · 1.2 KB', tone: 'neutral' }}
      open={open}
      title="Response message 2"
      onOpenChange={setOpen}
    >
      <div className={styles.grpcMessagePayloadToolbar}>
        <SegmentedControl
          ariaLabel="Response message view"
          value={view}
          options={VIEW_OPTIONS}
          onChange={setView}
        />
        <span className={styles.grpcMessagePayloadSpacer} />
        <IconButton
          label="Open fullscreen"
          icon={<Maximize aria-hidden="true" />}
          onClick={() => updateState({ overlay: 'body-full' })}
        />
        <IconButton label="Copy message" icon={<Copy aria-hidden="true" />} />
      </div>
      <pre className={styles.grpcMessagePayloadHex}>{HEX_DUMP}</pre>
    </CollapsibleSection>,
    host,
  );
}
