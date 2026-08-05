import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx, Switch } from '../../../components';
import type { RuleDefinition } from '../../../../shared/desktop-api';
import type { ChipKind } from '../interfaces';
import { deriveChips, isRuleComplete, matchSummary } from '../utils';
import { formatHits } from '../utils';

import styles from './RuleRow.module.css';

const CHIP_CLASS: Record<ChipKind, string | undefined> = {
  map: styles.map,
  remote: styles.remote,
  rewrite: styles.rewrite,
  block: styles.block,
  flow: styles.flow,
  brk: styles.brk,
};

export interface RuleRowProps {
  rule: RuleDefinition;
  /** 树深度，决定行内缩进；顶层为 0。 */
  depth: number;
  hits: number;
  selected: boolean;
  dragging: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  /** 来自 useTreeDrag：整行即拖拽源。 */
  dragProps: {
    draggable: boolean;
    onDragStart: (event: React.DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
  };
}

/**
 * 树里的一条规则：开关、名称与匹配摘要、action chips、命中数。
 * 整行是拖拽源，缩进放在行内部，这样 hover 与选中背景始终占满整列。
 * memo 化，仅变化的规则行 re-render。
 */
export const RuleRow = memo(function RuleRow({
  rule,
  depth,
  hits,
  selected,
  dragging,
  onSelect,
  onToggle,
  dragProps,
}: RuleRowProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const chips = deriveChips(rule);
  // 字段还没填完的规则不允许启用；已启用的任何时候都可以关掉。
  const enableBlocked = !rule.enabled && !isRuleComplete(rule);
  return (
    <button
      type="button"
      data-tree-row={rule.id}
      data-automation-id={AutomationIdFactory.ruleRow(rule.id)}
      style={{ '--depth': depth } as React.CSSProperties}
      className={cx(
        styles.row,
        selected && styles.selected,
        !rule.enabled && styles.disabled,
        dragging && styles.dragging,
      )}
      onClick={() => onSelect(rule.id)}
      {...dragProps}
    >
      <span
        className={styles.toggle}
        title={enableBlocked ? t('rules.enableBlocked') : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(rule.id);
        }}
      >
        <Switch
          checked={rule.enabled}
          disabled={enableBlocked}
          automationId={AutomationIdFactory.ruleToggle(rule.id)}
        />
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
