import { StatItem } from '../../../components';
import { useTranslation } from 'react-i18next';
import { useRulesStore } from '../data/rulesStore';
import { enabledCount, isRulesDirty } from '../utils';

/** Rules status bar: rule-set state, revision and validation summary. */
export function RulesStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  const rules = useRulesStore((state) => state.rules);
  const revision = useRulesStore((state) => state.revision);
  const dirty = useRulesStore((state) => isRulesDirty(state.rules, state.applied));
  const diagnostics = useRulesStore((state) => state.diagnostics);
  const conflict = useRulesStore((state) => state.conflict);
  const error = useRulesStore((state) => state.error);
  const enabled = enabledCount(rules);
  const invalid = diagnostics.length > 0;

  const dot = invalid ? 'red' : dirty ? 'yellow' : 'green';
  const label = conflict
    ? t('rules.reloadedAfterConflict')
    : invalid
      ? t('rules.validationErrors')
      : dirty
        ? t('rules.unsavedChanges')
        : t('rules.ruleSetApplied');

  return (
    <>
      <StatItem dot={dot}>{label}</StatItem>
      <StatItem mono>{t('rules.revision', { revision })}</StatItem>
      <StatItem>
        {t('rules.enabledSummary', { enabled, total: rules.length })}
      </StatItem>
      {invalid ? (
        <StatItem mono push>
          {t('rules.issueCount', { count: diagnostics.length })}
        </StatItem>
      ) : error ? (
        <StatItem mono push>
          {error}
        </StatItem>
      ) : null}
    </>
  );
}
