import { Select, Switch } from 'antd';
import { Pause, X } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import styles from './BreakpointAction.module.css';

export function BreakpointAction(): React.JSX.Element {
  return (
    <div className={fixtureClassNames('acard')} data-parity="rule-breakpoint-action">
      <div className={fixtureClassNames('ahead')}>
        <span className={styles.breakpointIcon}><Pause aria-hidden="true" /></span>
        <b>Breakpoint</b>
        <span className={fixtureClassNames('asub')}>request</span>
        <span className={fixtureClassNames('sp')} style={{ flex: 1 }} />
        <Switch checked size="small" />
        <IconButton icon={<X aria-hidden="true" />} label="Remove action" />
      </div>
      <div className={[fixtureClassNames('abody'), styles.breakpointBody].filter(Boolean).join(' ')}>
        <div className={styles.breakpointRow} data-parity="rule-breakpoint-phase-row">
          <span className={styles.breakpointLabel}>Phase</span>
          <Select
            className={styles.breakpointSelect}
            value="request"
            options={[
              { value: 'request', label: 'Request' },
              { value: 'response', label: 'Response' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}