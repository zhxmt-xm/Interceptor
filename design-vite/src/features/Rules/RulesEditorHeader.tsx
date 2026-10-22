import { Filter, HelpCircle, Trash2 } from 'lucide-react';
import { Tooltip } from 'antd';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './RulesEditorHeader.module.css';

export function RulesEditorHeader(): React.JSX.Element {
  const { state, updateState } = useDesignState();

  return (
    <div className={styles.rulesEditorHeader}>
      <input
        className={styles.rulesEditorName}
        aria-label="Rule name"
        spellCheck={false}
        value={state.ruleEditorName}
        onChange={event => updateState({ ruleEditorName: event.target.value })}
      />
      <span className={fixtureClassNames('sbadge')}>
        <span className={fixtureClassNames('d')} />
        Enabled
      </span>
      <div className={fixtureClassNames('sw on')} role="switch" aria-checked="true" aria-label="Rule enabled" />
      <Tooltip title="Show matching requests">
        <button className={fixtureClassNames('ib sm')} type="button" aria-label="Show matching requests" data-show-rule-requests="">
          <Filter strokeWidth={1.9} />
        </button>
      </Tooltip>
      <Tooltip title="Where rules apply">
        <span className={styles.rulesEditorHelp}>
          <button className={fixtureClassNames('ib sm')} type="button" aria-label="Where rules apply">
            <HelpCircle strokeWidth={1.9} />
          </button>
        </span>
      </Tooltip>
      <Tooltip title="Delete rule">
        <button className={fixtureClassNames('ib sm')} type="button" aria-label="Delete rule">
          <Trash2 strokeWidth={1.9} />
        </button>
      </Tooltip>
      <button
        className={fixtureClassNames('btn pri sm')}
        disabled={state.ruleEditorName === state.ruleEditorSavedName}
        type="button"
        onClick={() => updateState({ ruleEditorSavedName: state.ruleEditorName })}
      >
        Save
      </button>
    </div>
  );
}
