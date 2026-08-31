import { Progress } from 'antd';

import { useDesignState } from '../../state/useDesignState';
import styles from './AgentSessionUsage.module.css';

export function AgentSessionUsage(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const open = state.agentUsagePanel === 'open';
  const close = (): void => updateState({ agentUsagePanel: '' });
  const show = (): void => updateState({ agentUsagePanel: 'open' });
  return (
    <div
      className={styles.agentSessionUsage}
      data-parity="agent-context-usage"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onFocus={show}
      onMouseEnter={show}
      onMouseLeave={close}
    >
      <button
        aria-expanded={open}
        aria-label="Context usage"
        type="button"
      >
        <Progress
          percent={2.3}
          railColor="var(--border)"
          showInfo={false}
          size={18}
          strokeColor="var(--accent)"
          strokeWidth={11}
          type="circle"
        />
        <span className={styles.agentContextCopy}>
          <b>Context</b>
          <code>2.3% · 23k / 1M</code>
        </span>
      </button>
      {open && (
        <div
          className={styles.agentSessionUsagePopover}
          data-parity="agent-session-usage-popover"
          role="status"
        >
          <header><strong>47.2k tokens</strong><span>73.1% cache hit</span></header>
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