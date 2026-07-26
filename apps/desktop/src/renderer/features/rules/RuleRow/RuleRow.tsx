import { GripVertical } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cx, Switch } from '../../../components';
import type { RuleDefinition } from '../../../../shared/desktop-api';
import type { ChipKind } from '../interfaces';
import { deriveChips, isRuleComplete, matchSummary } from '../utils';
import styles from './RuleRow.module.css';

const CHIP_CLASS: Record<ChipKind, string | undefined> = {
  map: styles.map,
  remote: styles.remote,
  rewrite: styles.rewrite,
  block: styles.block,
  flow: styles.flow,
  brk: styles.brk,
};

/** 命中数紧凑格式：1200 → 1.2k。 */
function formatHits(count: number, locale = 'en'): string {
  if (count >= 1_000) {
    const scaled = count / 1_000;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: scaled >= 10 ? 0 : 1 }).format(scaled)}k`;
  }
  return new Intl.NumberFormat(locale).format(count);
}

export interface RuleRowProps {
  rule: RuleDefinition;
  hits: number;
  selected: boolean;
  reorderable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDragStart: (id: string, event: React.DragEvent<HTMLSpanElement>) => void;
  onDragOver: (id: string, event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop: (id: string, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}

/** A single rule row: drag handle, toggle, name/match, chips and hit count. memo 化，仅变化的规则行 re-render。 */
export const RuleRow = memo(function RuleRow({
  rule,
  hits,
  selected,
  reorderable,
  dragging,
  dropTarget,
  onSelect,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RuleRowProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const chips = deriveChips(rule);
  // 字段还没填完的规则不允许启用；已启用的任何时候都可以关掉。
  const enableBlocked = !rule.enabled && !isRuleComplete(rule);
  return (
    <button
      type="button"
      className={cx(
        styles.row,
        selected && styles.selected,
        !rule.enabled && styles.disabled,
        dragging && styles.dragging,
        dropTarget && styles.dropTarget,
      )}
      onClick={() => onSelect(rule.id)}
      onDragOver={(event) => onDragOver(rule.id, event)}
      onDrop={(event) => onDrop(rule.id, event)}
    >
      <span
        className={styles.drag}
        draggable={reorderable}
        aria-label={`${t('rules.moveUp')} / ${t('rules.moveDown')}`}
        title={`${t('rules.moveUp')} / ${t('rules.moveDown')}`}
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => onDragStart(rule.id, event)}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={15} />
      </span>
      <span
        className={styles.toggle}
        title={enableBlocked ? t('rules.enableBlocked') : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(rule.id);
        }}
      >
        <Switch checked={rule.enabled} disabled={enableBlocked} />
      </span>
      <div className={styles.meta}>
        <span className={styles.name} data-parity={`rule-name-${rule.id}`}>{rule.name}</span>
        <span className={styles.match}>
          {matchSummary(rule, t('rules.conditionCount', { count: rule.matchers.length }))}
        </span>
      </div>
      <div className={styles.chips}>
        {chips.map(([kind, labelKey], index) => (
          <span key={index} className={cx(styles.chip, CHIP_CLASS[kind])}>
            {t(labelKey)}
          </span>
        ))}
      </div>
      <span className={styles.hits}>{formatHits(hits, i18n.language)}</span>
    </button>
  );
});
