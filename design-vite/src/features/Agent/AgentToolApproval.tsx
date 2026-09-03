import { Check, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useDesignState } from '../../state/useDesignState';
import styles from './AgentToolApproval.module.css';

const TOOL_CONTENT = {
  start_recording: {
    description: 'Resume capture in the current session.',
    effect: 'Recording resumes on 127.0.0.1:8888.',
    result: 'Recording on · 127.0.0.1:8888',
  },
  stop_recording: {
    description: 'Pause capture without stopping the proxy.',
    effect: 'New traffic will continue through the proxy but will not be captured.',
    result: 'Recording off · 127.0.0.1:8888',
  },
  clear_capture: {
    description: 'Delete captured exchanges and bodies.',
    effect: 'Scope: all · Permanently deletes 13 exchanges and 1 body.',
    result: 'Exchanges 0 · Bodies 0 · 4 KB',
  },
} as const;

export function AgentToolApproval(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const tool = TOOL_CONTENT[state.agentToolApprovalName];
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.agentToolApproval === 'allowed' || state.agentToolApproval === 'denied') {
      resultRef.current?.focus();
    }
  }, [state.agentToolApproval]);
  if (!state.agentToolApproval) return null;

  if (state.agentToolApproval === 'allowed' || state.agentToolApproval === 'denied') {
    const allowed = state.agentToolApproval === 'allowed';
    return (
      <div
        aria-live="polite"
        className={styles.toolApprovalResult}
        data-parity="agent-tool-approval"
        data-result={state.agentToolApproval}
        ref={resultRef}
        role="status"
        tabIndex={-1}
      >
        {allowed ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
        <strong>{allowed ? 'Allowed' : 'Denied'}</strong>
        <span className={styles.toolApprovalResultCopy}>
          <code>{state.agentToolApprovalName}</code>
          {allowed ? <span>{tool.result}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <section className={styles.toolApproval} data-parity="agent-tool-approval">
      <header className={styles.toolApprovalHeader}>
        <span className={styles.toolApprovalIcon}><ShieldAlert aria-hidden="true" /></span>
        <div>
          <strong>Allow this Tool?</strong>
          <code>{state.agentToolApprovalName}</code>
        </div>
        <span className={styles.toolApprovalKind}>change</span>
      </header>
      <div className={styles.toolApprovalBody}>
        <p>{tool.description}</p>
        <dl>
          <div><dt>Parameters</dt><dd>No parameters</dd></div>
          <div><dt>Effect</dt><dd>{tool.effect}</dd></div>
        </dl>
      </div>
      <footer className={styles.toolApprovalActions}>
        <button type="button" onClick={() => updateState({ agentToolApproval: 'denied' })}>Deny Tool</button>
        <button className={styles.toolApprovalAllow} type="button" onClick={() => updateState({ agentToolApproval: 'allowed' })}>Allow Tool</button>
      </footer>
    </section>
  );
}