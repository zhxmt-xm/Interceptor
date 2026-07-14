import { useState } from 'react';

import { SettingsContent } from '../SettingsContent/SettingsContent';
import { SettingsNav } from '../SettingsNav/SettingsNav';
import styles from './SettingsMain.module.css';

/** Settings body: section nav + scrollable content. */
export function SettingsMain(): React.JSX.Element {
  const [active, setActive] = useState('certificates');

  return (
    <div className={styles.main}>
      <SettingsNav active={active} onSelect={setActive} />
      <SettingsContent active={active} />
    </div>
  );
}
