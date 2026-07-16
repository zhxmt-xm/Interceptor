import { Info, Menu, MoreHorizontal, Settings } from 'lucide-react';

import { cx, IconButton } from '../../../components';
import { useCaptureStore } from '../captureStore';
import { toggleCapture } from '../useCaptureData';
import { Omnibox } from '../Omnibox/Omnibox';
import styles from './CaptureTopbar.module.css';

export interface CaptureTopbarProps {
  onMenu?: () => void;
}

/** Capture topbar: sidebar toggle, recording chip, omnibox and quick actions. */
export function CaptureTopbar({ onMenu }: CaptureTopbarProps): React.JSX.Element {
  const capturing = useCaptureStore((state) => state.capturing);
  const setHarDialogOpen = useCaptureStore((state) => state.setHarDialogOpen);

  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <button
        type="button"
        className={cx(styles.recording, !capturing && styles.paused)}
        onClick={() => void toggleCapture()}
        aria-pressed={capturing}
      >
        <span className={styles.recordingDot} />
        {capturing ? 'Recording' : 'Paused'}
      </button>
      <Omnibox />
      <div className={styles.actions}>
        <IconButton icon={Info} label="Info" />
        <IconButton icon={Settings} label="Settings" />
        <IconButton
          icon={MoreHorizontal}
          label="Import or export HAR"
          onClick={() => setHarDialogOpen(true)}
        />
      </div>
    </>
  );
}
