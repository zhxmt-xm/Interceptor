import { useState } from 'react';

import type {
  RuleBreakpointAction,
  RulePhase,
} from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { InputBox, Select } from '../../../components';
import {
  breakpointTimeoutFromSelection,
  breakpointTimeoutSelection,
  type BreakpointTimeoutSelection,
} from '../../breakpoints/utils';
import { PHASE_OPTIONS, TIMEOUT_POLICY_OPTIONS } from '../constants';
import { localizeOptions } from '../utils';
import styles from './BreakpointActionBody.module.css';

const TIMEOUT_SELECTIONS: readonly BreakpointTimeoutSelection[] = [
  'none',
  '10',
  '30',
  '60',
  'custom',
];

export interface BreakpointActionBodyProps {
  readonly ruleId: string;
  readonly index: number;
  readonly action: RuleBreakpointAction;
  readonly onChange: (action: RuleBreakpointAction) => void;
  readonly onValidityChange: (valid: boolean) => void;
  readonly translate: (key: string) => string;
}

/** HTTP breakpoint timeout editor with a valid protocol model and a separate Custom text draft. */
export function BreakpointActionBody({
  ruleId,
  index,
  action,
  onChange,
  onValidityChange,
  translate,
}: BreakpointActionBodyProps): React.JSX.Element {
  const initial = breakpointTimeoutSelection(action.timeout);
  const [selection, setSelection] = useState(initial.selection);
  const [customSeconds, setCustomSeconds] = useState(initial.customSeconds);
  const [timeoutPolicy, setTimeoutPolicy] = useState<'continue' | 'drop'>(
    'onTimeout' in action ? action.onTimeout : 'continue',
  );
  const timeout = breakpointTimeoutFromSelection(selection, customSeconds);
  const customInvalid = selection === 'custom' && timeout === null;
  const timeoutOptions = TIMEOUT_SELECTIONS.map((value) => ({
    value,
    label: translate(`rules.timeout${value === 'none'
      ? 'None'
      : value === 'custom'
        ? 'Custom'
        : value}`),
    automationId: AutomationIdFactory.ruleActionField(
      ruleId,
      index,
      `timeout-option.${value}`,
    ),
  }));

  const changeSelection = (value: string): void => {
    const nextSelection = value as BreakpointTimeoutSelection;
    const nextTimeout = breakpointTimeoutFromSelection(nextSelection, customSeconds);
    setSelection(nextSelection);
    onValidityChange(nextTimeout !== null);
    if (nextTimeout === null) {
      return;
    }
    onChange(nextTimeout.mode === 'infinite'
      ? { type: 'breakpoint', phase: action.phase, timeout: nextTimeout }
      : {
          type: 'breakpoint',
          phase: action.phase,
          timeout: nextTimeout,
          onTimeout: timeoutPolicy,
        });
  };

  const changeCustomSeconds = (value: string): void => {
    const nextTimeout = breakpointTimeoutFromSelection('custom', value);
    setCustomSeconds(value);
    onValidityChange(nextTimeout !== null);
    if (nextTimeout?.mode === 'finite') {
      onChange({
        type: 'breakpoint',
        phase: action.phase,
        timeout: nextTimeout,
        onTimeout: timeoutPolicy,
      });
    }
  };

  const changeTimeoutPolicy = (value: string): void => {
    const nextPolicy = value as 'continue' | 'drop';
    setTimeoutPolicy(nextPolicy);
    if (timeout?.mode === 'finite') {
      onChange({
        type: 'breakpoint',
        phase: action.phase,
        timeout,
        onTimeout: nextPolicy,
      });
    }
  };

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
      <div className={styles.row} data-parity="rule-breakpoint-timeout-row">
        <span className={styles.label}>{translate('rules.timeout')}</span>
        <Select
          ariaLabel={translate('rules.timeout')}
          automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'timeout')}
          className={styles.select}
          contentClassName={styles.selectContent}
          options={timeoutOptions}
          value={selection}
          onValueChange={changeSelection}
        />
      </div>
      {selection === 'custom' ? (
        <div className={styles.row} data-parity="rule-breakpoint-custom-timeout-row">
          <span className={styles.label}>{translate('rules.timeoutSeconds')}</span>
          <div className={styles.field}>
            <InputBox
              ariaInvalid={customInvalid}
              ariaLabel={translate('rules.timeoutSeconds')}
              automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'timeout-seconds')}
              className={styles.timeoutInput}
              parity="rule-breakpoint-custom-timeout-input"
              step={1}
              type="number"
              value={customSeconds}
              onValueChange={changeCustomSeconds}
            />
            {customInvalid ? (
              <span
                className={styles.error}
                data-automation-id={AutomationIdFactory.ruleActionField(
                  ruleId,
                  index,
                  'timeout-error',
                )}
                data-parity="rule-breakpoint-timeout-error"
                role="alert"
              >
                {translate('rules.timeoutInvalid')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {selection !== 'none' ? (
        <div className={styles.row} data-parity="rule-breakpoint-policy-row">
          <span className={styles.label}>{translate('rules.onTimeout')}</span>
          <Select
            ariaLabel={translate('rules.onTimeout')}
            automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'on-timeout')}
            className={styles.select}
            contentClassName={styles.selectContent}
            options={localizeOptions(TIMEOUT_POLICY_OPTIONS, 'rules.timeout', translate).map(
              (option) => ({
                ...option,
                label: option.label.charAt(0).toLocaleUpperCase() + option.label.slice(1),
                automationId: AutomationIdFactory.ruleActionField(
                  ruleId,
                  index,
                  `on-timeout-option.${option.value}`,
                ),
              }),
            )}
            value={timeoutPolicy}
            onValueChange={changeTimeoutPolicy}
          />
        </div>
      ) : null}
    </div>
  );
}
