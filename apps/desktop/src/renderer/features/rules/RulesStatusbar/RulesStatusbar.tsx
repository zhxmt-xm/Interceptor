import { StatItem } from '../../../components';
import { enabledCount, useRulesStore } from '../rulesStore';

/** Rules status bar: rule-set state, revision and validation summary. */
export function RulesStatusbar(): React.JSX.Element {
  const rules = useRulesStore((state) => state.rules);
  const revision = useRulesStore((state) => state.revision);
  const dirty = useRulesStore((state) => state.dirty);
  const diagnostics = useRulesStore((state) => state.diagnostics);
  const conflict = useRulesStore((state) => state.conflict);
  const error = useRulesStore((state) => state.error);
  const enabled = enabledCount(rules);
  const invalid = diagnostics.length > 0;

  const dot = invalid ? 'red' : dirty ? 'yellow' : 'green';
  const label = conflict
    ? 'Reloaded after conflict'
    : invalid
      ? 'Validation errors'
      : dirty
        ? 'Unsaved changes'
        : 'Rule set applied';

  return (
    <>
      <StatItem dot={dot}>{label}</StatItem>
      <StatItem mono>rev {revision}</StatItem>
      <StatItem>
        {enabled} of {rules.length} enabled
      </StatItem>
      {invalid ? (
        <StatItem mono push>
          {diagnostics.length} issue{diagnostics.length === 1 ? '' : 's'}
        </StatItem>
      ) : error ? (
        <StatItem mono push>
          {error}
        </StatItem>
      ) : null}
    </>
  );
}
