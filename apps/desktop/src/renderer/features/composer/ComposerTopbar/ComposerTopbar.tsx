import { Clock, Menu, Plus } from 'lucide-react';

import { Button, IconButton, Title } from '../../../components';
import styles from './ComposerTopbar.module.css';

export interface ComposerTopbarProps {
  onMenu?: () => void;
}

/** Composer topbar: sidebar toggle, title, history and new-request actions. */
export function ComposerTopbar({ onMenu }: ComposerTopbarProps): React.JSX.Element {
  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Composer</Title>
      <div className={styles.actions}>
        <Button icon={Clock}>History</Button>
        <Button icon={Plus}>New</Button>
      </div>
    </>
  );
}
