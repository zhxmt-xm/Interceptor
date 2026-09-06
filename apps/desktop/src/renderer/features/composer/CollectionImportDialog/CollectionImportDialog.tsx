import { App } from 'antd';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { FileTransferBusyOverlay, ImportConfirmDialog } from '../../../components';
import { collectionImportActions } from '../data/collectionImportActions';
import { useCollectionImportStore } from '../data/collectionImportStore';
import styles from './CollectionImportDialog.module.css';

export function CollectionImportDialog(): React.JSX.Element {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const phase = useCollectionImportStore((state) => state.phase);
  const preview = useCollectionImportStore((state) => state.preview);
  const errorKey = useCollectionImportStore((state) => state.errorKey);
  const readTitle = useEffectEvent(() => t('composer.importCollection'));

  useEffect(() => collectionImportActions.subscribe(readTitle), []);
  useEffect(() => {
    if (errorKey === null) return;
    void message.error(t(errorKey));
    collectionImportActions.clearError();
  }, [errorKey, message, t]);

  return (
    <div className={styles.host} data-automation-id={AUTOMATION_IDS.composer.import.flow} data-phase={phase}>
      {preview === null ? null : (
        <ImportConfirmDialog
          open
          title={t('composer.import.title')}
          summary={t('composer.import.summary', { requests: preview.leafCount, folders: preview.folderCount })}
          fileName={preview.fileName}
          stats={[
            { label: t('composer.import.requests'), value: preview.leafCount, automationId: AUTOMATION_IDS.composer.import.requestCount },
            { label: t('composer.import.folders'), value: preview.folderCount, automationId: AUTOMATION_IDS.composer.import.folderCount },
            { label: t('composer.import.skipped'), value: preview.skipped.length, emphasis: 'skipped', automationId: AUTOMATION_IDS.composer.import.skippedCount },
          ]}
          skipped={preview.skipped}
          skippedTitle={t('composer.import.skippedTitle', { count: preview.skipped.length })}
          skippedMore={(count) => t('import.skippedMore', { count })}
          describeReason={(reason) => t(`import.reason.${reason}`)}
          cancelLabel={t('composer.import.cancel')}
          confirmLabel={t('composer.import.confirm', { count: preview.leafCount })}
          confirmWidth={196}
          confirmDisabled={preview.leafCount === 0 && preview.folderCount === 0}
          busy={phase === 'saving'}
          onCancel={() => collectionImportActions.cancelImport()}
          onConfirm={() => { void collectionImportActions.confirmImport(); }}
          automationIds={{
            dialog: AUTOMATION_IDS.composer.import.dialog,
            fileName: AUTOMATION_IDS.composer.import.fileName,
            skippedList: AUTOMATION_IDS.composer.import.skippedList,
            cancel: AUTOMATION_IDS.composer.import.cancel,
            confirm: AUTOMATION_IDS.composer.import.confirm,
          }}
        />
      )}
      <FileTransferBusyOverlay
        open={phase === 'reading'}
        title={t('composer.import.reading')}
        detail={t('composer.import.readingDetail')}
        automationId={AUTOMATION_IDS.composer.import.busy}
      />
    </div>
  );
}