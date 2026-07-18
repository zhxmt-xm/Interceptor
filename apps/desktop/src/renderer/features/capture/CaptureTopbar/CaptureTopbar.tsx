import { Info, Menu, MoreHorizontal, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const capturing = useCaptureStore((state) => state.capturing);
  const setHarDialogOpen = useCaptureStore((state) => state.setHarDialogOpen);

  return (
    <>
      <IconButton icon={Menu} label={t('capture.toggleSidebar')} onClick={onMenu} />
      <button
        type="button"
        className={cx(styles.recording, !capturing && styles.paused)}
        onClick={() => void toggleCapture()}
        aria-pressed={capturing}
      >
        <span className={styles.recordingDot} />
        {capturing ? t('capture.recording') : t('capture.paused')}
      </button>
      <Omnibox />
      <div className={styles.actions}>
        <IconButton icon={Info} label={t('capture.info')} />
        <IconButton icon={Settings} label={t('capture.settings')} />
        <IconButton
          icon={MoreHorizontal}
          label={t('capture.importExport')}
          onClick={() => setHarDialogOpen(true)}
        />
      </div>
    </>
  );
}
