import { App } from 'antd';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { FileTransferBusyOverlay, ImportConfirmDialog } from '../../../components';
import { rulesImportActions } from '../data/rulesImportActions';
import { useRulesImportStore } from '../data/rulesImportStore';
import styles from './RulesImportDialog.module.css';

export function RulesImportDialog(): React.JSX.Element {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const phase = useRulesImportStore((state) => state.phase);
  const preview = useRulesImportStore((state) => state.preview);
  const errorKey = useRulesImportStore((state) => state.errorKey);
  const readTitle = useEffectEvent(() => t('rules.importRules'));

  useEffect(() => rulesImportActions.subscribe(readTitle), []);
  useEffect(() => {
    if (errorKey === null) return;
    void message.error(t(errorKey));
    rulesImportActions.clearError();
  }, [errorKey, message, t]);

  return (
    <div className={styles.host} data-automation-id={AUTOMATION_IDS.rules.import.flow} data-phase={phase}>
      {preview === null ? null : (
        <ImportConfirmDialog
          open
          title={t('rules.import.title')}
          summary={t('rules.import.summary', { rules: preview.leafCount, folders: preview.folderCount })}
          fileName={preview.fileName}
          stats={[
            { label: t('rules.import.rules'), value: preview.leafCount, automationId: AUTOMATION_IDS.rules.import.ruleCount },
            { label: t('rules.import.folders'), value: preview.folderCount, automationId: AUTOMATION_IDS.rules.import.folderCount },
            { label: t('rules.import.enabled'), value: preview.enabledCount, emphasis: 'enabled', automationId: AUTOMATION_IDS.rules.import.enabledCount },
            { label: t('rules.import.skipped'), value: preview.skipped.length, emphasis: 'skipped', automationId: AUTOMATION_IDS.rules.import.skippedCount },
          ]}
          skipped={preview.skipped}
          skippedTitle={t('rules.import.skippedTitle', { count: preview.skipped.length })}
          skippedMore={(count) => t('import.skippedMore', { count })}
          describeReason={(reason) => t(`import.reason.${reason}`)}
          warning={preview.enabledCount > 0 ? t('rules.import.enabledWarning', { count: preview.enabledCount }) : undefined}
          cancelLabel={t('rules.import.cancel')}
          confirmLabel={t('rules.import.confirm', { count: preview.leafCount })}
          confirmWidth={172}
          confirmDisabled={preview.leafCount === 0 && preview.folderCount === 0}
          busy={phase === 'saving'}
          onCancel={() => rulesImportActions.cancelImport()}
          onConfirm={() => { void rulesImportActions.confirmImport(); }}
          automationIds={{
            dialog: AUTOMATION_IDS.rules.import.dialog,
            fileName: AUTOMATION_IDS.rules.import.fileName,
            skippedList: AUTOMATION_IDS.rules.import.skippedList,
            cancel: AUTOMATION_IDS.rules.import.cancel,
            confirm: AUTOMATION_IDS.rules.import.confirm,
          }}
        />
      )}
      <FileTransferBusyOverlay
        open={phase === 'reading'}
        title={t('rules.import.reading')}
        detail={t('rules.import.readingDetail')}
        automationId={AUTOMATION_IDS.rules.import.busy}
      />
    </div>
  );
}