import { Download, Menu } from 'lucide-react';

import { Button, FilterChip, IconButton, Title } from '../../../components';
import styles from './DiagnosticsTopbar.module.css';

export interface DiagnosticsTopbarProps {
  onMenu?: () => void;
}

/** Diagnostics topbar: toggle, title, level/outcome filters and export. */
export function DiagnosticsTopbar({ onMenu }: DiagnosticsTopbarProps): React.JSX.Element {
  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Diagnostics</Title>
      <div className={styles.actions}>
        <FilterChip>Level</FilterChip>
        <FilterChip>Outcome</FilterChip>
        <Button icon={Download}>Export JSONL</Button>
      </div>
    </>
  );
}
