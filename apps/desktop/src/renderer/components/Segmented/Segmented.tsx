import { useRef, type KeyboardEvent } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import styles from './Segmented.module.css';

export interface SegmentedProps {
  options: Array<string | { label: string; value: string; disabled?: boolean }>;
  value: string;
  onChange?: (value: string) => void;
  /** Extra class on the group root (e.g. protocol mono styling). */
  className?: string;
  /** Accessible group label for the radiogroup. */
  ariaLabel?: string;
  automationIds?: Partial<Record<string, AutomationId>>;
}

/** Compact single-choice switch: solid accent chip marks the active option. */
export function Segmented({
  options,
  value,
  onChange,
  className,
  ariaLabel,
  automationIds,
}: SegmentedProps): React.JSX.Element {
  const items = options.map((option) =>
    typeof option === 'string' ? { label: option, value: option, disabled: false } : option);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  /** Select the option at an index and keep keyboard focus on it. */
  const selectAt = (index: number): void => {
    const item = items[index];
    if (!item || item.disabled || !onChange) {
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
          aria-disabled={item.disabled || undefined}
          disabled={item.disabled}
          tabIndex={item.value === value ? 0 : -1}
          className={cx(styles.option, item.value === value && styles.active)}
          onClick={onChange ? () => onChange(item.value) : undefined}
          onKeyDown={(event) => handleKeyDown(event, index)}
          data-automation-id={automationIds?.[item.value]}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

