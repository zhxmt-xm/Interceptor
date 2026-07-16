import { Menu } from 'lucide-react';

import { Count, IconButton, Switch, Title } from '../../../components';
import { useBreakpointsStore } from '../breakpointsStore';
import { setBreakOnMatch } from '../useBreakpoints';
import styles from './BreakpointsTopbar.module.css';

export interface BreakpointsTopbarProps {
  onMenu?: () => void;
}

/** Breakpoints topbar: toggle, title, paused count and break-on-match switch. */
export function BreakpointsTopbar({ onMenu }: BreakpointsTopbarProps): React.JSX.Element {
  const count = useBreakpointsStore((state) => state.breakpoints.length);
  const enabled = useBreakpointsStore((state) => state.enabled);

  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Breakpoints</Title>
      <Count className={styles.count}>
        <b>{count}</b> paused
      </Count>
      <div className={styles.actions}>
        <Count className={styles.breakLabel}>Break on match</Count>
        <Switch checked={enabled} onChange={(next) => void setBreakOnMatch(next)} />
      </div>
    </>
  );
}
