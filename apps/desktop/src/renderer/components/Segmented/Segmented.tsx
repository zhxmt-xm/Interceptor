import { cx } from '../cx';
import styles from './Segmented.module.css';

export interface SegmentedProps {
  options: Array<string | { label: string; value: string }>;
  value: string;
  onChange?: (value: string) => void;
}

/** Small inline segmented control (single choice). */
export function Segmented({ options, value, onChange }: SegmentedProps): React.JSX.Element {
  return (
    <div className={styles.segmented}>
      {options.map((option) => {
        const item = typeof option === 'string' ? { label: option, value: option } : option;
        return (
          <span
            key={item.value}
            className={cx(styles.option, item.value === value && styles.active)}
            onClick={onChange ? () => onChange(item.value) : undefined}
          >
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
