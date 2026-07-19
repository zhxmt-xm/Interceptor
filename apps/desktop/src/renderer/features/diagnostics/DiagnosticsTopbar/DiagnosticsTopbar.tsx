import { Download, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FilterChip, IconButton, Title } from '../../../components';
import { useDiagnostics } from '../DiagnosticsProvider';
import styles from './DiagnosticsTopbar.module.css';

export interface DiagnosticsTopbarProps {
  onMenu?: () => void;
}

/** Diagnostics topbar: toggle, title, level/outcome filters and JSONL export. */
export function DiagnosticsTopbar({ onMenu }: DiagnosticsTopbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const {
    processFilter,
    levelFilter,
    outcomeFilter,
    cycleProcess,
    cycleLevel,
    cycleOutcome,
    exporting,
    exportError,
    exportJsonl,
  } = useDiagnostics();
  return (
    <>
      <IconButton icon={Menu} label={t('capture.toggleSidebar')} onClick={onMenu} />
      <Title>{t('diagnostics.title')}</Title>
      <div className={styles.actions}>
        <FilterChip onClick={cycleProcess}>
          {processFilter ? `${t('diagnostics.process')}: ${processFilter}` : t('diagnostics.process')}
        </FilterChip>
        <FilterChip onClick={cycleLevel}>
          {levelFilter ? `${t('diagnostics.level')}: ${levelFilter}` : t('diagnostics.level')}
        </FilterChip>
        <FilterChip onClick={cycleOutcome}>
          {outcomeFilter ? `${t('diagnostics.outcome')}: ${outcomeFilter}` : t('diagnostics.outcome')}
        </FilterChip>
        <IconButton
          icon={Download}
          label={exporting
            ? t('diagnostics.exporting')
            : exportError
              ? t('diagnostics.exportFailed')
              : t('diagnostics.exportJsonl')}
          size="sm"
          className={exportError ? styles.exportError : undefined}
          disabled={exporting}
          onClick={exportJsonl}
        />
      </div>
    </>
  );
}
