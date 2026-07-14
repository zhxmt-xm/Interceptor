import { Info, Menu, MoreHorizontal, Settings } from 'lucide-react';

import { IconButton } from '../../../components';
import { Omnibox } from '../Omnibox/Omnibox';
import styles from './CaptureTopbar.module.css';

export interface CaptureTopbarProps {
  onMenu?: () => void;
}

/** Capture topbar: sidebar toggle, recording chip, omnibox and quick actions. */
export function CaptureTopbar({ onMenu }: CaptureTopbarProps): React.JSX.Element {
  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <div className={styles.recording}>
        <span className={styles.recordingDot} />
        Recording
      </div>
      <Omnibox />
      <div className={styles.actions}>
        <IconButton icon={Info} label="Info" />
        <IconButton icon={Settings} label="Settings" />
        <IconButton icon={MoreHorizontal} label="More" />
      </div>
    </>
  );
}
