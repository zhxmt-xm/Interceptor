import { SettingsContent } from '../SettingsContent/SettingsContent';
import { SettingsNav } from '../SettingsNav/SettingsNav';
import type { TlsPassthroughNavigationTarget } from '../interfaces';
import styles from './SettingsMain.module.css';

export interface SettingsMainProps {
  section: string;
  onSectionChange(section: string): void;
  tlsPassthroughTarget: TlsPassthroughNavigationTarget | null;
}

/** Settings body: section nav + scrollable content. */
export function SettingsMain({
  section,
  onSectionChange,
  tlsPassthroughTarget,
}: SettingsMainProps): React.JSX.Element {
  return (
    <div className={styles.main}>
      <SettingsNav active={section} onSelect={onSectionChange} />
      <SettingsContent
        active={section}
        tlsPassthroughTarget={tlsPassthroughTarget}
      />
    </div>
  );
}
