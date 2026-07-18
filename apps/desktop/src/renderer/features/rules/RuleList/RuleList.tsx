import { MoreHorizontal, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Count, IconButton } from '../../../components';
import { useRulesStore } from '../rulesStore';
import { RuleRow } from '../RuleRow/RuleRow';
import styles from './RuleList.module.css';

/** Ordered, toggleable list of rules driven by the rules store. */
export function RuleList(): React.JSX.Element {
  const { t } = useTranslation();
  const rules = useRulesStore((state) => state.rules);
  const revision = useRulesStore((state) => state.revision);
  const dirty = useRulesStore((state) => state.dirty);
  const selectedId = useRulesStore((state) => state.selectedId);
  const hits = useRulesStore((state) => state.hits);
  const select = useRulesStore((state) => state.select);
  const toggleRule = useRulesStore((state) => state.toggleRule);

  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <Count className={styles.grow}>
          <b>{t('rules.revision', { revision })}</b> · {dirty ? t('rules.unsavedChanges') : t('rules.applied')}
        </Count>
        <IconButton icon={Search} label={t('rules.searchRules')} size="sm" />
        <IconButton icon={MoreHorizontal} label={t('rules.more')} size="sm" />
      </div>

      <div className={styles.rows}>
        {rules.length === 0 ? (
          <div className={styles.empty}>{t('rules.empty')}</div>
        ) : (
          rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              hits={hits[rule.id] ?? 0}
              selected={rule.id === selectedId}
              onSelect={() => select(rule.id)}
              onToggle={() => toggleRule(rule.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
