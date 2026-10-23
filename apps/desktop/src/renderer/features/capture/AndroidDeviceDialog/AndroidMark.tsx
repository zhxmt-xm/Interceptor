import { siAndroid } from 'simple-icons';

import styles from './AndroidMark.module.css';

export function AndroidMark(): React.JSX.Element {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d={siAndroid.path} />
      </svg>
    </span>
  );
}
