import { InputNumber, Select, Switch } from 'antd';
import { Pause, X } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import type { BreakpointTimeoutSelection } from '../../state/types';
import { useDesignState } from '../../state/useDesignState';
import styles from './BreakpointTimeoutAction.module.css';

const TIMEOUT_OPTIONS = [
  { value: 'none', label: 'No timeout' },
  { value: '10', label: '10 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: 'custom', label: 'Custom…' },
];

export function BreakpointTimeoutAction(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const timeout = state.ruleBreakpointTimeout || '30';
  const customTimeoutValid = state.ruleBreakpointCustomTimeoutSeconds !== null
    && Number.isInteger(state.ruleBreakpointCustomTimeoutSeconds)
    && state.ruleBreakpointCustomTimeoutSeconds > 0;

  return (
    <div className={fixtureClassNames('acard')} data-parity="rule-breakpoint-timeout-action">
      <div className={fixtureClassNames('ahead')}>
        <span className={styles.breakpointTimeoutIcon}><Pause aria-hidden="true" /></span>
        <b>Breakpoint</b>
        <span className={fixtureClassNames('asub')}>request</span>
        <span className={fixtureClassNames('sp')} style={{ flex: 1 }} />
        <Switch checked size="small" />
        <IconButton icon={<X aria-hidden="true" />} label="Remove action" />
      </div>
      <div className={[fixtureClassNames('abody'), styles.breakpointTimeoutBody].filter(Boolean).join(' ')}>
        <div className={styles.breakpointTimeoutRow} data-parity="rule-breakpoint-phase-row">
          <span className={styles.breakpointTimeoutLabel}>Phase</span>
          <Select
            className={styles.breakpointTimeoutSelect}
            value="request"
            options={[
              { value: 'request', label: 'Request' },
              { value: 'response', label: 'Response' },
            ]}
          />
        </div>
        <div className={styles.breakpointTimeoutRow} data-parity="rule-breakpoint-timeout-row">
          <label className={styles.breakpointTimeoutLabel} htmlFor="rule-breakpoint-timeout">
            Timeout
          </label>
          <Select
            aria-label="Timeout"
            className={styles.breakpointTimeoutSelect}
            id="rule-breakpoint-timeout"
            value={timeout}
            options={TIMEOUT_OPTIONS}
            onChange={(ruleBreakpointTimeout) => updateState({
              ruleBreakpointTimeout: ruleBreakpointTimeout as BreakpointTimeoutSelection,
            })}
          />
        </div>
        {timeout === 'custom' ? (
          <div className={styles.breakpointTimeoutRow} data-parity="rule-breakpoint-custom-timeout-row">
            <label className={styles.breakpointTimeoutLabel} htmlFor="rule-breakpoint-custom-timeout-seconds">
              Seconds
            </label>
            <div className={styles.breakpointTimeoutField}>
              <div data-parity="rule-breakpoint-custom-timeout-input">
                <InputNumber
                  aria-label="Timeout seconds"
                  className={styles.breakpointTimeoutSelect}
                  controls={false}
                  id="rule-breakpoint-custom-timeout-seconds"
                  status={customTimeoutValid ? undefined : 'error'}
                  step={1}
                  value={state.ruleBreakpointCustomTimeoutSeconds}
                  onChange={(seconds) => updateState({
                    ruleBreakpointCustomTimeoutSeconds: typeof seconds === 'number' ? seconds : null,
                  })}
                />
              </div>
              {!customTimeoutValid ? (
                <span
                  className={styles.breakpointTimeoutError}
                  data-parity="rule-breakpoint-timeout-error"
                  role="alert"
                >
                  Enter a positive whole number of seconds.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {timeout !== 'none' ? (
            <div className={styles.breakpointTimeoutRow} data-parity="rule-breakpoint-policy-row">
              <span className={styles.breakpointTimeoutLabel}>On timeout</span>
              <Select
                aria-label="On timeout"
                className={styles.breakpointTimeoutSelect}
                value={state.ruleBreakpointTimeoutPolicy}
                options={[
                  { value: 'continue', label: 'Continue' },
                  { value: 'drop', label: 'Drop' },
                ]}
                onChange={(ruleBreakpointTimeoutPolicy) => updateState({
                  ruleBreakpointTimeoutPolicy,
                })}
              />
            </div>
        ) : null}
      </div>
    </div>
  );
}
