import { Check, Menu, Plus } from 'lucide-react';

import { Button, Count, IconButton, Title } from '../../../components';
import styles from './RulesTopbar.module.css';

export interface RulesTopbarProps {
  onMenu?: () => void;
}

/** Rules topbar: sidebar toggle, title, rule count and apply/new actions. */
export function RulesTopbar({ onMenu }: RulesTopbarProps): React.JSX.Element {
  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Rules</Title>
      <Count className={styles.count}>
        <b>8</b> rules · 6 enabled
      </Count>
      <div className={styles.actions}>
        <Button icon={Plus}>New rule</Button>
        <Button icon={Check} variant="primary" iconStrokeWidth={2.4}>
          Apply changes
        </Button>
      </div>
    </>
  );
}
