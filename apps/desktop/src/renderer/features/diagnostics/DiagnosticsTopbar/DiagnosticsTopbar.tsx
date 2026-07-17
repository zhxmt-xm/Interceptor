import { Download, Menu } from 'lucide-react';

import { Button, FilterChip, IconButton, Title } from '../../../components';
import { useDiagnostics } from '../DiagnosticsProvider';
import styles from './DiagnosticsTopbar.module.css';

export interface DiagnosticsTopbarProps {
  onMenu?: () => void;
}

/** Diagnostics topbar: toggle, title, level/outcome filters and JSONL export. */
export function DiagnosticsTopbar({ onMenu }: DiagnosticsTopbarProps): React.JSX.Element {
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
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Diagnostics</Title>
      <div className={styles.actions}>
        <FilterChip onClick={cycleProcess}>
          {processFilter ? `Process: ${processFilter}` : 'Process'}
        </FilterChip>
        <FilterChip onClick={cycleLevel}>
          {levelFilter ? `Level: ${levelFilter}` : 'Level'}
        </FilterChip>
        <FilterChip onClick={cycleOutcome}>
          {outcomeFilter ? `Outcome: ${outcomeFilter}` : 'Outcome'}
        </FilterChip>
        <Button
          icon={Download}
          variant={exportError ? 'danger' : 'default'}
          disabled={exporting}
          onClick={exportJsonl}
        >
          {exporting
            ? 'Exporting…'
            : exportError
              ? 'Export failed'
              : 'Export JSONL'}
        </Button>
      </div>
    </>
  );
}
