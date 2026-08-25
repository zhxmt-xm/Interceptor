import type {
  RuleBreakpointAction,
  RulePhase,
} from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { Select } from '../../../components';
import { PHASE_OPTIONS } from '../constants';
import { localizeOptions } from '../utils';
import styles from './BreakpointActionBody.module.css';

export interface BreakpointActionBodyProps {
  readonly ruleId: string;
  readonly index: number;
  readonly action: RuleBreakpointAction;
  readonly onChange: (action: RuleBreakpointAction) => void;
  readonly onValidityChange: (valid: boolean) => void;
  readonly translate: (key: string) => string;
}

/** HTTP breakpoint phase editor. */
export function BreakpointActionBody({
  ruleId,
  index,
  action,
  onChange,
  translate,
}: BreakpointActionBodyProps): React.JSX.Element {
  return (
    <div className={styles.stack}>
      <div className={styles.row} data-parity="rule-breakpoint-phase-row">
        <span className={styles.label}>{translate('rules.phase')}</span>
        <Select
          ariaLabel={translate('rules.phase')}
          automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'phase')}
          className={styles.select}
          contentClassName={styles.selectContent}
          options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate).map((option) => ({
            ...option,
            label: option.label.charAt(0).toLocaleUpperCase() + option.label.slice(1),
            automationId: AutomationIdFactory.ruleActionField(
              ruleId,
              index,
              `phase-option.${option.value}`,
            ),
          }))}
          value={action.phase}
          onValueChange={(phase) => onChange({ ...action, phase: phase as RulePhase })}
        />
      </div>
    </div>
  );
}
