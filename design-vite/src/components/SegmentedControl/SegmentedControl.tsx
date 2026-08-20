import styles from './SegmentedControl.module.css';

interface SegmentedControlOption<Value extends string> {
  readonly disabled?: boolean;
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
            aria-disabled={option.disabled || undefined}
            className={styles.segmentedControlItem}
            data-selected={selected || undefined}
            disabled={option.disabled}
            key={option.value}
            role="radio"
            type="button"
            onClick={() => {
              if (!option.disabled) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}