import { useState } from 'react';

import { cx } from '../../../components';
import { SECTIONS } from '../data';
import styles from './SettingsNav.module.css';

/** Left settings rail: the section list. */
export function SettingsNav(): React.JSX.Element {
  const [active, setActive] = useState('certificates');

  return (
    <div className={styles.nav}>
      {SECTIONS.map(({ id, label, Icon }) => (
        <div
          key={id}
          className={cx(styles.item, id === active && styles.active)}
          onClick={() => setActive(id)}
        >
          <Icon size={16} strokeWidth={1.9} />
          {label}
        </div>
      ))}
    </div>
  );
}
