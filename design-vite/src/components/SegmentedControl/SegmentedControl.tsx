import styles from './SegmentedControl.module.css';

interface SegmentedControlOption<Value extends string> {
  readonly label: string;
  readonly value: Value;
}

interface SegmentedControlProps<Value extends string> {
  readonly ariaLabel: string;
  readonly onChange: (value: Value) => void;
  readonly options: readonly SegmentedControlOption<Value>[];
  readonly tone?: 'accent' | 'warning';
  readonly value: Value;
}

export function SegmentedControl<Value extends string>({
  ariaLabel,
  onChange,
  options,
  tone = 'accent',
  value,
}: SegmentedControlProps<Value>): React.JSX.Element {
  return (
    <div
      aria-label={ariaLabel}
      className={styles.segmentedControl}
      data-tone={tone}
      role="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={styles.segmentedControlItem}
            data-selected={selected || undefined}
            key={option.value}
            role="radio"
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}