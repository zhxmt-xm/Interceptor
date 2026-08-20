import { Loader2 } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import styles from './FileTransferBusyOverlay.module.css';

const LABEL_BY_OVERLAY = {
  'rules-import-loading': ['Reading rules file…', 'Validating the selected JSON configuration'],
  'rules-export-loading': ['Exporting rules…', 'Writing the JSON configuration to disk'],
  'composer-import-loading': ['Reading collection file…', 'Validating the selected JSON configuration'],
  'composer-export-loading': ['Exporting collection…', 'Writing the JSON configuration to disk'],
} as const;

export function FileTransferBusyOverlay(): React.JSX.Element | null {
  const { state } = useDesignState();
  const labels = LABEL_BY_OVERLAY[state.overlay as keyof typeof LABEL_BY_OVERLAY];
  if (!labels) {
    return null;
  }
  return (
    <div className={styles.fileBusyOverlay}>
      <div className={styles.fileBusyPanel} role="status" aria-live="polite">
        <Loader2 aria-hidden="true" />
        <div>
          <strong>{labels[0]}</strong>
          <span>{labels[1]}</span>
        </div>
      </div>
    </div>
  );
}
