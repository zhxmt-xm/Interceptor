import { collectLeaves } from '@interceptor/core-protocol';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
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
  const state = conflict ? 'conflict' : invalid ? 'invalid' : dirty ? 'dirty' : 'applied';

  return (
    <>
      <StatItem dot={dot}>
        <span
          data-state={state}
          data-automation-id={AUTOMATION_IDS.rules.status.state}
        >
          {label}
        </span>
      </StatItem>
      <StatItem mono>
        <span
          data-revision={revision}
          data-automation-id={AUTOMATION_IDS.rules.status.revision}
        >
          {t('rules.revision', { revision })}
        </span>
      </StatItem>
      <StatItem>
        <span
          data-enabled={enabled}
          data-total={collectLeaves(nodes).length}
          data-automation-id={AUTOMATION_IDS.rules.status.enabled}
        >
          {t('rules.enabledSummary', { enabled, total: collectLeaves(nodes).length })}
        </span>
      </StatItem>
      {validation ? (
        <StatItem mono push>
          <span
            data-issue-count={selectedIssues.length}
            data-automation-id={AUTOMATION_IDS.rules.status.validation}
          >
            {validation}
          </span>
        </StatItem>
      ) : invalid ? (
        <StatItem mono push>
          <span
            data-issue-count={issueCount}
            data-automation-id={AUTOMATION_IDS.rules.status.validation}
          >
            {t('rules.issueCount', { count: issueCount })}
          </span>
        </StatItem>
      ) : error ? (
        <StatItem mono push>
          {error}
        </StatItem>
      ) : null}
    </>
  );
}
