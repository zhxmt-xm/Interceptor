import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx, HighlightedName, Switch } from '../../../components';
import type { RuleDefinition } from '../../../../shared/desktop-api';
import { deriveRuleRowChips, isRuleComplete, matchSummary } from '../utils';
import { formatHits } from '../utils';

import styles from './RuleRow.module.css';
import { RuleActionTags } from './RuleActionTags';
import { RuleRowMenu } from './RuleRowMenu';

export interface RuleRowProps {
  rule: RuleDefinition;
  /** 树深度，决定行内缩进；顶层为 0。 */
  depth: number;
  hits: number;
  selected: boolean;
  /** 右侧编辑器正在打开本规则；树上选中则在别处时用虚线标出。 */
  open: boolean;
  dragging: boolean;
  /** 搜索关键词；空串表示不高亮。 */
  keyword: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onShowRuleRequests: (ruleId: string) => void;
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
  open,
  dragging,
  keyword,
  onSelect,
  onToggle,
  onShowRuleRequests,
  dragProps,
}: RuleRowProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { allChips, inlineChips, hasOverflow } = deriveRuleRowChips(rule);
  // 字段还没填完的规则不允许启用；已启用的任何时候都可以关掉。
  const enableBlocked = !rule.enabled && !isRuleComplete(rule);
  return (
    <RuleRowMenu
      rule={rule}
      hits={hits}
      onShowRuleRequests={onShowRuleRequests}
      open={menuOpen}
      onOpenChange={setMenuOpen}
    >
      <div
        data-open={open || undefined}
        data-tree-row={rule.id}
        data-automation-id={AutomationIdFactory.ruleRow(rule.id)}
        style={{ '--depth': depth } as React.CSSProperties}
        className={cx(
          styles.row,
          selected && styles.selected,
          open && !selected && styles.open,
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
        <button
          type="button"
          className={styles.target}
          aria-pressed={selected}
          data-automation-id={AutomationIdFactory.ruleTarget(rule.id)}
        >
          <span className={styles.meta}>
            <HighlightedName
              name={rule.name}
              keyword={keyword}
              className={styles.name}
            />
            <span className={styles.match}>
              {matchSummary(rule, t('rules.conditionCount', { count: rule.matchers.length }))}
            </span>
          </span>
        </button>
        <RuleActionTags
          ruleId={rule.id}
          allChips={allChips}
          inlineChips={inlineChips}
          hasOverflow={hasOverflow}
          disabled={!rule.enabled}
        />
        <span
          className={styles.hits}
          data-count={hits}
          data-automation-id={AutomationIdFactory.ruleHitCount(rule.id)}
        >
          {formatHits(hits, i18n.language)}
        </span>
      </div>
    </RuleRowMenu>
  );
});
