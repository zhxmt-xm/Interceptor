import { cx } from '../../../components';
import { SECTIONS } from '../data';
import styles from './SettingsNav.module.css';

export interface SettingsNavProps {
  active: string;
  onSelect: (id: string) => void;
}

/** Left settings rail: the section list. */
export function SettingsNav({
  active,
  onSelect,
}: SettingsNavProps): React.JSX.Element {
  return (
    <div className={styles.nav}>
      {SECTIONS.map(({ id, label, Icon }) => (
        <div
          key={id}
          className={cx(styles.item, id === active && styles.active)}
          onClick={() => onSelect(id)}
        >
          <Icon size={16} strokeWidth={1.9} />
          {label}
        </div>
      ))}
    </div>
  );
}
