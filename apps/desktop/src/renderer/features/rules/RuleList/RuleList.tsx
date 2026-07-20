import { Check, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '../../../components';
import { useRulesStore } from '../rulesStore';
import { RuleRow } from '../RuleRow/RuleRow';
import { applyRules } from '../useRulesData';
import styles from './RuleList.module.css';

/** Ordered, toggleable list of rules driven by the rules store. */
export function RuleList(): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const rules = useRulesStore((state) => state.rules);
  const dirty = useRulesStore((state) => state.dirty);
  const saving = useRulesStore((state) => state.saving);
  const selectedId = useRulesStore((state) => state.selectedId);
  const hits = useRulesStore((state) => state.hits);
  const select = useRulesStore((state) => state.select);
  const toggleRule = useRulesStore((state) => state.toggleRule);
  const addRule = useRulesStore((state) => state.addRule);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRules = normalizedQuery
    ? rules.filter((rule) =>
        rule.name.toLowerCase().includes(normalizedQuery)
        || JSON.stringify(rule.matchers).toLowerCase().includes(normalizedQuery)
        || JSON.stringify(rule.actions).toLowerCase().includes(normalizedQuery))
    : rules;

  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            value={query}
            aria-label={t('rules.searchRules')}
            placeholder={t('rules.searchRules')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.actions}>
          <IconButton
            icon={Plus}
            label={t('rules.newRule')}
            size="sm"
            onClick={() => addRule(t('rules.newRuleName'))}
          />
          <IconButton
            icon={Check}
            label={saving ? t('rules.applying') : t('rules.applyChanges')}
            size="sm"
            strokeWidth={2.4}
            disabled={!dirty || saving}
            onClick={() => void applyRules()}
          />
          <IconButton icon={MoreHorizontal} label={t('rules.more')} size="sm" />
        </div>
      </div>

      <div className={styles.rows}>
        {visibleRules.length === 0 ? (
          <div className={styles.empty}>{t('rules.empty')}</div>
        ) : (
          visibleRules.map((rule) => (
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
