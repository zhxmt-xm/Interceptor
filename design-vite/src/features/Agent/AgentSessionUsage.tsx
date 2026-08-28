import { ChevronDown, ChevronUp } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import styles from './AgentSessionUsage.module.css';

export function AgentSessionUsage(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const open = state.agentUsagePanel === 'open';
  return (
    <div className={styles.agentSessionUsage}>
      <button
        aria-expanded={open}
        type="button"
        onClick={() => updateState({ agentUsagePanel: open ? '' : 'open' })}
      >
        <span>Session usage</span>
        {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </button>
      {open && (
        <div className={styles.agentSessionUsagePopover} role="status">
          <header><strong>47.2k tokens</strong><span>68% cache hit</span></header>
          <dl>
            <div><dt>Cache hit</dt><dd>32.1k</dd></div>
            <div><dt>Cache miss</dt><dd>11.8k</dd></div>
            <div><dt>Output</dt><dd>3.3k</dd></div>
          </dl>
          <small>Usage reported by 2 model calls</small>
        </div>
      )}
    </div>
  );
}