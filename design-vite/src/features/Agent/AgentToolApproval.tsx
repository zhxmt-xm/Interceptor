import { Check, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useDesignState } from '../../state/useDesignState';
import styles from './AgentToolApproval.module.css';

export function AgentToolApproval(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
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
        <code>stop_recording</code>
      </div>
    );
  }

  return (
    <section className={styles.toolApproval} data-parity="agent-tool-approval">
      <header className={styles.toolApprovalHeader}>
        <span className={styles.toolApprovalIcon}><ShieldAlert aria-hidden="true" /></span>
        <div>
          <strong>Allow this Tool?</strong>
          <code>stop_recording</code>
        </div>
        <span className={styles.toolApprovalKind}>change</span>
      </header>
      <div className={styles.toolApprovalBody}>
        <p>Pause capture without stopping the proxy.</p>
        <dl>
          <div><dt>Parameters</dt><dd>No parameters</dd></div>
          <div><dt>Effect</dt><dd>New traffic will continue through the proxy but will not be captured.</dd></div>
        </dl>
      </div>
      <footer className={styles.toolApprovalActions}>
        <button type="button" onClick={() => updateState({ agentToolApproval: 'denied' })}>Deny Tool</button>
        <button className={styles.toolApprovalAllow} type="button" onClick={() => updateState({ agentToolApproval: 'allowed' })}>Allow Tool</button>
      </footer>
    </section>
  );
}