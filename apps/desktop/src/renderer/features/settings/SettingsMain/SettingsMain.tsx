import { SettingsContent } from '../SettingsContent/SettingsContent';
import { SettingsNav } from '../SettingsNav/SettingsNav';
import styles from './SettingsMain.module.css';

/** Settings body: section nav + scrollable content. */
export function SettingsMain(): React.JSX.Element {
  return (
    <div className={styles.main}>
      <SettingsNav />
      <SettingsContent />
    </div>
  );
}
