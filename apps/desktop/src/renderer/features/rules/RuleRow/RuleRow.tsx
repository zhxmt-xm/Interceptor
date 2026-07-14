import { GripVertical } from 'lucide-react';

import { cx, Switch } from '../../../components';
import { type ChipKind, type Rule } from '../data';
import styles from './RuleRow.module.css';

const CHIP_CLASS: Record<ChipKind, string | undefined> = {
  map: styles.map,
  remote: styles.remote,
  rewrite: styles.rewrite,
  block: styles.block,
  throttle: styles.throttle,
  brk: styles.brk,
};

export interface RuleRowProps {
  rule: Rule;
  selected: boolean;
  onSelect: () => void;
}

/** A single rule row: drag handle, toggle, name/match, chips and hit count. */
export function RuleRow({ rule, selected, onSelect }: RuleRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(styles.row, selected && styles.selected, !rule.on && styles.disabled)}
      onClick={onSelect}
    >
      <span className={styles.drag}>
        <GripVertical size={15} />
      </span>
      <Switch checked={rule.on} />
      <div className={styles.meta}>
        <span className={styles.name}>{rule.name}</span>
        <span className={styles.match}>{rule.match}</span>
      </div>
      <div className={styles.chips}>
        {rule.chips.map(([kind, label], index) => (
          <span key={index} className={cx(styles.chip, CHIP_CLASS[kind])}>
            {label}
          </span>
        ))}
      </div>
      <span className={styles.hits}>{rule.hit}</span>
    </button>
  );
}
