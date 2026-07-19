import { useEffect, useState } from 'react';

import { SettingsContent } from '../SettingsContent/SettingsContent';
import { SettingsNav } from '../SettingsNav/SettingsNav';
import styles from './SettingsMain.module.css';

export interface SettingsMainProps {
  section?: string;
}

/** Settings body: section nav + scrollable content. */
export function SettingsMain({ section = 'certificates' }: SettingsMainProps): React.JSX.Element {
  const [active, setActive] = useState(section);

  useEffect(() => {
    setActive(section);
  }, [section]);

  return (
    <div className={styles.main}>
      <SettingsNav active={active} onSelect={setActive} />
      <SettingsContent active={active} />
    </div>
  );
}
