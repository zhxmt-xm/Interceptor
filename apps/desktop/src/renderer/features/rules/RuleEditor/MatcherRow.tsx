import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cx, IconButton, InputBox, Select } from '../../../components';
import type {
  RuleMatcher,
  RuleMatcherType,
  RulePhase,
} from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { MATCHER_TYPE_OPTIONS, PHASE_OPTIONS } from '../constants';
import { createMatcher, localizeOptions } from '../utils';
import { toInt } from '../utils';

import { MatcherControls } from './MatcherControls';
import styles from './MatcherRow.module.css';

export interface MatcherRowProps {
  ruleId: string;
  index: number;
  matcher: RuleMatcher;
  first: boolean;
  onChange: (matcher: RuleMatcher) => void;
  onRemove: () => void;
}

/** 单条匹配条件行：字段类型 + 按类型渲染的受控控件（值/名一律自由输入，模式为枚举）。 */
export function MatcherRow({
  ruleId,
  index,
  matcher,
  first,
  onChange,
  onRemove,
}: MatcherRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const translate = (key: string): string => t(key);
  return (
    <div className={styles.row}>
      <span className={styles.conn}>{first ? t('rules.if') : t('rules.and')}</span>
      <Select
        className={styles.type}
        ariaLabel={t('rules.conditionField')}
        value={matcher.type}
        options={localizeOptions(MATCHER_TYPE_OPTIONS, 'rules.matcher', translate)}
        onValueChange={(value) => onChange(createMatcher(value as RuleMatcherType))}
        automationId={AutomationIdFactory.ruleMatcherField(ruleId, index, 'type')}
      />
      <MatcherControls
        matcher={matcher}
        onChange={onChange}
        translate={translate}
        automationIdForField={(field) =>
          AutomationIdFactory.ruleMatcherField(ruleId, index, field)}
      />
      <IconButton
        className={styles.remove}
        icon={X}
        label={t('rules.removeCondition')}
        size="sm"
        strokeWidth={2.2}
        automationId={AutomationIdFactory.ruleMatcherField(ruleId, index, 'remove')}
        onClick={onRemove}
      />
    </div>
  );
}
