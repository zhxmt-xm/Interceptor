import { Tooltip } from 'antd';
import { Ellipsis } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx } from '../../../components';
import type { ChipKind } from '../interfaces';

import styles from './RuleActionTags.module.css';

const CHIP_CLASS: Record<ChipKind, string | undefined> = {
  map: styles.map,
  remote: styles.remote,
  rewrite: styles.rewrite,
  block: styles.block,
  flow: styles.flow,
  brk: styles.brk,
};

export interface RuleActionTagsProps {
  ruleId: string;
  allChips: ReadonlyArray<readonly [ChipKind, string]>;
  inlineChips: ReadonlyArray<readonly [ChipKind, string]>;
  hasOverflow: boolean;
  disabled: boolean;
}

/** Two compact Rule-row action tags plus a focusable complete-list Tooltip. */
export function RuleActionTags({
  ruleId,
  allChips,
  inlineChips,
  hasOverflow,
  disabled,
}: RuleActionTagsProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={cx(styles.chips, disabled && styles.disabled)}>
      {inlineChips.map(([kind, labelKey], index) => (
        <span
          key={labelKey}
          className={cx(styles.chip, CHIP_CLASS[kind])}
          data-chip-kind={kind}
          data-automation-id={AutomationIdFactory.ruleInlineActionChip(ruleId, index)}
        >
          {t(labelKey)}
        </span>
      ))}
      {hasOverflow ? (
        <Tooltip
          mouseEnterDelay={0.4}
          trigger={['hover', 'focus']}
          title={(
            <div className={styles.actionTagTooltip}>
              {allChips.map(([kind, labelKey], index) => (
                <span
                  key={labelKey}
                  className={cx(styles.chip, CHIP_CLASS[kind])}
                  data-chip-kind={kind}
                  data-automation-id={AutomationIdFactory.ruleOverflowActionChip(ruleId, index)}
                >
                  {t(labelKey)}
                </span>
              ))}
            </div>
          )}
        >
          <button
            type="button"
            className={styles.actionTagOverflow}
            aria-label={`${t('rules.actions')} (${allChips.length})`}
            data-automation-id={AutomationIdFactory.ruleActionOverflow(ruleId)}
            onClick={(event) => event.stopPropagation()}
          >
            <Ellipsis aria-hidden="true" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}