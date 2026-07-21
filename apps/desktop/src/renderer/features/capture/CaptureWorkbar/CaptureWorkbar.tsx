import { Archive, Download, FileJson, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, type AutomationId } from '../../../../shared/automation-ids';
import { cx, Flyout, IconButton } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import type { CaptureTransferAction } from '../interfaces';
import { toggleCapture } from '../data/useCaptureData';
import { Omnibox } from '../Omnibox/Omnibox';
import styles from './CaptureWorkbar.module.css';

/** Capture content workbar: recording, omnibox and file actions. */
export function CaptureWorkbar(): React.JSX.Element {
  const { t } = useTranslation();
  const capturing = useCaptureStore((state) =>
    state.capturing && state.proxyReadinessIssue === null);
  const setTransferAction = useCaptureStore((state) => state.setTransferAction);
  const [fileMenu, setFileMenu] = useState<'import' | 'export' | null>(null);

  const openTransfer = (action: CaptureTransferAction): void => {
    setFileMenu(null);
    setTransferAction(action);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.captureControls}>
        <button
          type="button"
          className={cx(styles.recording, !capturing && styles.paused)}
          onClick={() => void toggleCapture()}
          aria-pressed={capturing}
          data-automation-id={AUTOMATION_IDS.capture.recordingToggle}
        >
          <span className={styles.recordingDot} />
          <span>{capturing ? t('capture.recording') : t('capture.paused')}</span>
        </button>
      </div>
      <div className={styles.filtering}><Omnibox /></div>
      <div className={styles.inspectorTools}>
        <Flyout
          open={fileMenu === 'import'}
          onOpenChange={(next) => setFileMenu(next ? 'import' : null)}
          placement="bottomRight"
          className={styles.fileMenu}
          content={
            <>
              <FileCommand
                icon={FileJson}
                label={t('capture.importHar')}
                extension=".har"
                automationId={AUTOMATION_IDS.capture.importHar}
                onClick={() => openTransfer('har-import')}
              />
              <FileCommand
                icon={Archive}
                label={t('capture.openCapture')}
                extension=".iarchive"
                automationId={AUTOMATION_IDS.capture.openArchive}
                onClick={() => openTransfer('archive-import')}
              />
            </>
          }
        >
          <span className={styles.fileAnchor}>
            <IconButton
              icon={Upload}
              size="sm"
              label={t('capture.importTraffic')}
              automationId={AUTOMATION_IDS.capture.importMenu}
            />
          </span>
        </Flyout>
        <Flyout
          open={fileMenu === 'export'}
          onOpenChange={(next) => setFileMenu(next ? 'export' : null)}
          placement="bottomRight"
          className={styles.fileMenu}
          content={
            <>
              <FileCommand
                icon={FileJson}
                label={t('capture.exportHar')}
                extension=".har"
                automationId={AUTOMATION_IDS.capture.exportHar}
                onClick={() => openTransfer('har-export')}
              />
              <FileCommand
                icon={Archive}
                label={t('capture.saveCapture')}
                extension=".iarchive"
                automationId={AUTOMATION_IDS.capture.saveArchive}
                onClick={() => openTransfer('archive-export')}
              />
            </>
          }
        >
          <span className={styles.fileAnchor}>
            <IconButton
              icon={Download}
              size="sm"
              label={t('capture.exportTraffic')}
              automationId={AUTOMATION_IDS.capture.exportMenu}
            />
          </span>
        </Flyout>
      </div>
    </div>
  );
}

interface FileCommandProps {
  icon: typeof Archive;
  label: string;
  extension: string;
  automationId: AutomationId;
  onClick(): void;
}

/** One file command inside the Import or Export flyout. */
function FileCommand({
  icon: Icon,
  label,
  extension,
  automationId,
  onClick,
}: FileCommandProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.fileCommand}
      onClick={onClick}
      data-automation-id={automationId}
    >
      <Icon size={16} strokeWidth={1.9} />
      <span>{label}</span>
      <code>{extension}</code>
    </button>
  );
}
