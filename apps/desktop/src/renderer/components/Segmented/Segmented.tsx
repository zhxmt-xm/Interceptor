import { cx } from '../cx';
import styles from './Segmented.module.css';

export interface SegmentedProps {
  options: string[];
  value: string;
  onChange?: (value: string) => void;
}

/** Small inline segmented control (single choice). */
export function Segmented({ options, value, onChange }: SegmentedProps): React.JSX.Element {
  return (
    <div className={styles.segmented}>
      {options.map((option) => (
        <span
          key={option}
          className={cx(styles.option, option === value && styles.active)}
          onClick={onChange ? () => onChange(option) : undefined}
        >
          {option}
        </span>
      ))}
    </div>
  );
}
