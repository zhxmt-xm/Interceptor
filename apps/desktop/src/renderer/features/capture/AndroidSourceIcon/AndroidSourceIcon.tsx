import { siAndroid } from 'simple-icons';

import styles from './AndroidSourceIcon.module.css';

export interface AndroidSourceIconProps {
  readonly label?: string;
  readonly size?: number;
}

export function AndroidSourceIcon({ label, size = 16 }: AndroidSourceIconProps): React.JSX.Element {
  return (
    <svg className={styles.icon} width={size} height={size} viewBox="0 0 24 24"
      aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={siAndroid.path} />
    </svg>
  );
}
