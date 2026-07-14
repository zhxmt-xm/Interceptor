import { Menu } from 'lucide-react';

import { Count, IconButton, Switch, Title } from '../../../components';
import styles from './BreakpointsTopbar.module.css';

export interface BreakpointsTopbarProps {
  onMenu?: () => void;
}

/** Breakpoints topbar: toggle, title, paused count and break-on-match switch. */
export function BreakpointsTopbar({ onMenu }: BreakpointsTopbarProps): React.JSX.Element {
  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Breakpoints</Title>
      <Count className={styles.count}>
        <b>2</b> paused
      </Count>
      <div className={styles.actions}>
        <Count className={styles.breakLabel}>Break on match</Count>
        <Switch checked />
      </div>
    </>
  );
}
