import { collectLeaves } from '@interceptor/core-protocol';
import { StatItem } from '../../../components';
import { useTranslation } from 'react-i18next';
import { useRulesStore } from '../data/rulesStore';
import { enabledCount, isRulesDirty, ruleIssues, selectedRule } from '../utils';

/** Rules status bar: rule-set state, revision and incomplete-rule summary. */
export function RulesStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  const nodes = useRulesStore((state) => state.nodes);
  const revision = useRulesStore((state) => state.revision);
  const dirty = useRulesStore((state) => isRulesDirty(state.nodes, state.applied));
  const conflict = useRulesStore((state) => state.conflict);
  const error = useRulesStore((state) => state.error);
  const rule = useRulesStore(selectedRule);
  const enabled = enabledCount(nodes);
  const issueCount = collectLeaves(nodes).reduce(
    (total, rule) => total + ruleIssues(rule).length,
    0,
  );
  const invalid = issueCount > 0;
  const selectedIssues = rule ? ruleIssues(rule) : [];
  const validation = selectedIssues.length > 0
    ? selectedIssues.map((issue) => t(issue.messageKey, { index: issue.index })).join(' · ')
    : rule
      ? dirty
        ? t('rules.compilesUnsaved')
        : t('rules.compilesApplied', { revision })
      : null;

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
        {t('rules.enabledSummary', { enabled, total: collectLeaves(nodes).length })}
      </StatItem>
      {validation ? (
        <StatItem mono push>{validation}</StatItem>
      ) : invalid ? (
        <StatItem mono push>
          {t('rules.issueCount', { count: issueCount })}
        </StatItem>
      ) : error ? (
        <StatItem mono push>
          {error}
        </StatItem>
      ) : null}
    </>
  );
}
