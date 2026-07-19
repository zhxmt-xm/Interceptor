import { useRef, type KeyboardEvent } from 'react';

import { cx } from '../cx';
import styles from './Segmented.module.css';

export interface SegmentedProps {
  options: Array<string | { label: string; value: string }>;
  value: string;
  onChange?: (value: string) => void;
  /** Extra class on the group root (e.g. protocol mono styling). */
  className?: string;
  /** Accessible group label for the radiogroup. */
  ariaLabel?: string;
}

/** Compact single-choice switch: solid accent chip marks the active option. */
export function Segmented({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: SegmentedProps): React.JSX.Element {
  const items = options.map((option) =>
    typeof option === 'string' ? { label: option, value: option } : option);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  /** Select the option at an index and keep keyboard focus on it. */
  const selectAt = (index: number): void => {
    const item = items[index];
    if (!item || !onChange) {
      return;
    }
    onChange(item.value);
    buttons.current[index]?.focus();
  };

  /** Roving arrow-key navigation across the group. */
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (!onChange || items.length === 0) {
      return;
    }
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    }
    if (next !== undefined) {
      event.preventDefault();
      selectAt(next);
    }
  };

  return (
    <div className={cx(styles.segmented, className)} role="radiogroup" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={item.value === value}
          tabIndex={item.value === value ? 0 : -1}
          className={cx(styles.option, item.value === value && styles.active)}
          onClick={onChange ? () => onChange(item.value) : undefined}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
