import { GripVertical } from 'lucide-react';

import { cx, Switch } from '../../../components';
import type { RuleDefinition } from '../../../../shared/desktop-api';
import { type ChipKind, deriveChips, matchSummary } from '../rule-format';
import styles from './RuleRow.module.css';

const CHIP_CLASS: Record<ChipKind, string | undefined> = {
  map: styles.map,
  remote: styles.remote,
  rewrite: styles.rewrite,
  block: styles.block,
  throttle: styles.throttle,
  brk: styles.brk,
};

/** 命中数紧凑格式：1200 → 1.2k。 */
function formatHits(count: number): string {
  if (count >= 1_000) {
    const scaled = count / 1_000;
    return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)}k`;
  }
  return String(count);
}

export interface RuleRowProps {
  rule: RuleDefinition;
  hits: number;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

/** A single rule row: drag handle, toggle, name/match, chips and hit count. */
export function RuleRow({
  rule,
  hits,
  selected,
  onSelect,
  onToggle,
}: RuleRowProps): React.JSX.Element {
  const chips = deriveChips(rule);
  return (
    <button
      type="button"
      className={cx(styles.row, selected && styles.selected, !rule.enabled && styles.disabled)}
      onClick={onSelect}
    >
      <span className={styles.drag}>
        <GripVertical size={15} />
      </span>
      <span
        className={styles.toggle}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <Switch checked={rule.enabled} />
      </span>
      <div className={styles.meta}>
        <span className={styles.name}>{rule.name}</span>
        <span className={styles.match}>{matchSummary(rule)}</span>
      </div>
      <div className={styles.chips}>
        {chips.map(([kind, label], index) => (
          <span key={index} className={cx(styles.chip, CHIP_CLASS[kind])}>
            {label}
          </span>
        ))}
      </div>
      <span className={styles.hits}>{formatHits(hits)}</span>
    </button>
  );
}
